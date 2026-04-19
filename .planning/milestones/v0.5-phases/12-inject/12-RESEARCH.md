# Phase 12: INJECT - Research

**Researched:** 2026-04-19
**Domain:** CDP manifest injection + MCP tool 추가 + PageSnapshot v3 breaking bump
**Confidence:** HIGH (코드베이스 직접 조사 기반)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- v3 타입 소유: `@agrune/core` (re-export from `@agrune/manifest`)
- `captureTarget.selector`에 JSON.stringify(SelectorLadder) 임시 직렬화 → Phase 12에서 PageSnapshot v3로 교체
- `cdp-runtime-injector.ts`에 `resolveManifest()` + `buildEmptyManifest()` + `reloadRuntime` 훅이 이미 존재
- `window.__agrune_runtime_state__` 이미 tamper-proof

### Claude's Discretion
모든 구현 선택은 Claude의 재량 — discuss 단계 생략.

### Deferred Ideas (OUT OF SCOPE)
None

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESOLVE-01 | `ManifestLoader`가 `window.__agrune_manifest__` 또는 CDP preload JSON에서 manifest를 로드 | Section 5: ManifestLoader 설계 + Section 10: race condition 분석 |
| RESOLVE-03 | `PageSnapshot`을 v3로 breaking 교체 (MCP 도구 출력 shape 변경, backward-compat adapter 없음) | Section 4: 현재 상태 + Section 6: consumer 목록 |
| INJECT-01 | `CdpRuntimeInjector.prepareSession({ preloadManifest })`이 외부 사이트용 `__agrune_preload_manifest__` JSON을 source에 embed | Section 2: 시그니처 변경 + Section 3: 보안 분석 |
| INJECT-02 | MCP tool `agrune_manifest_load`가 CLI에서 로드한 manifest를 활성 세션에 주입 | Section 1: MCP 구조 + Section 8: 직렬화 |
</phase_requirements>

---

## Summary

Phase 11이 `@agrune/manifest` SDK, `TargetResolver`, bootstrap 게이트 제거까지 완성했다. Phase 12는 그 manifest를 실제 브라우저 세션과 MCP 레이어에 연결하는 작업이다.

**핵심 관찰 3가지:**

1. **PageSnapshot의 `selector` 필드가 현재 `string`으로 선언되어 있다** (`packages/core/src/index.ts` 97번 줄). `snapshot.ts`의 `captureTarget()`은 이미 `JSON.stringify(descriptor.target.selector)`로 임시 직렬화 중이다 (406번 줄 주석 확인). Phase 12에서 이를 `SelectorLadder` 객체로 교체하면 `@agrune/core`의 `PageTarget` 타입과 이를 소비하는 `devtools panel.ts`, `public-shapes.ts` 등이 모두 변경 대상이 된다.

2. **MCP tool 추가 경로가 이중 구조다**: `mcp-tools.ts`에 `mcp.tool()` 등록 + `index.ts`의 `innerHandleToolCall` switch 분기 **두 곳** 모두 추가해야 한다. `tools.ts`의 `getToolDefinitions()`는 devtools 웹앱이 별도로 사용하는 스키마 목록이므로 세 번째로 추가 필요.

3. **`prepareSession`의 현재 시그니처는 `(sessionId: string): Promise<void>`** 이며 options 객체가 없다. `preloadManifest` 옵션 추가 시 `CdpDriver.prepareTarget()` 호출부도 함께 변경해야 한다. 단, 현재 `CdpDriver`는 per-session manifest 개념이 없어서 `agrune_manifest_load`가 "활성 세션에 주입"하는 경로와 "새 페이지 로드에서 zero-RTT 사전 embed"하는 경로를 구분해야 한다.

**Primary recommendation:** `agrune_manifest_load` 는 `window.__agrune_manifest__` 직접 설정 + `reloadRuntime()` 호출 패턴을 쓰고, `prepareSession({ preloadManifest })` 는 신규 탭/페이지 로드 시 zero-RTT preload에 사용한다. 두 경로는 독립적이며 우선순위는 이미 `resolveManifest()`에 구현된 ladder(`window > preload > inline > idle`)를 그대로 따른다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `agrune_manifest_load` 입력 검증 | API / MCP layer | — | MCP tool = 신뢰 경계 진입점, zod 스키마 검증 여기서 |
| manifest 직렬화 → CDP 주입 | Browser / CdpRuntimeInjector | — | CDP `Runtime.evaluate` 호출 주체 |
| `window.__agrune_manifest__` 설정 | Browser (CDP evaluate) | — | 페이지 런타임은 receive-only |
| `window.__agrune_preload_manifest__` embed | Browser / CdpRuntimeInjector | — | `addScriptToEvaluateOnNewDocument` source에 embed |
| ManifestLoader 우선순위 resolve | Browser (page bootstrap) | — | bootstrap source 내부 `resolveManifest()` 이미 구현 |
| PageSnapshot v3 shape | Runtime / snapshot.ts | Core types | `captureTarget()` 리턴 shape 변경 → `@agrune/core` 타입 변경 수반 |
| MCP output 포매팅 | MCP / public-shapes.ts | — | `toPublicTarget()` 등이 `selector` 필드를 어떻게 직렬화할지 결정 |
| E2E smoke test (YouTube) | E2E / packages/e2e | — | CI skip, 로컬 only |

---

## 1. packages/mcp/src/ 기존 tool handler 구조

[VERIFIED: 코드베이스 직접 조사]

### 등록 경로 (이중 구조)

**파일 1: `mcp-tools.ts`** — MCP SDK에 tool 메타데이터 + zod 스키마 등록
```typescript
// 패턴: mcp.tool(name, description, zodSchema, async handler)
mcp.tool('agrune_manifest_load', '...description...', {
  manifest: z.object({...}).describe('...'),
  tabId: z.number().optional().describe('Tab ID (omit for active tab)'),
}, async (args) => toMcpToolResult(await handleToolCall('agrune_manifest_load', args)))
```

**파일 2: `index.ts`의 `innerHandleToolCall` switch** — 실제 비즈니스 로직
```typescript
case 'agrune_manifest_load': {
  if (tabId == null) return { text: 'No active sessions.', isError: true }
  // 로직
  return { text: JSON.stringify({ ok: true }), }
}
```

**파일 3: `tools.ts`의 `getToolDefinitions()`** — devtools 웹앱용 JSON Schema 목록
```typescript
{
  name: 'agrune_manifest_load',
  description: '...',
  inputSchema: {
    type: 'object',
    properties: {
      manifest: { type: 'object', description: '...' },
      tabId: { type: 'number', description: '...' },
    },
    required: ['manifest'],
  },
}
```

### 기존 error 패턴

`index.ts`의 `errorText()` 헬퍼 함수:
```typescript
function errorText(code: string, message: string, details?: Record<string, unknown>): ToolHandlerResult {
  return {
    text: JSON.stringify({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, null, 2),
    isError: true,
  }
}
```

`isError: true`를 반환하면 MCP SDK가 tool response에 `isError: true`를 첨부한다.

### Input validation 패턴

- **zod 스키마**: `mcp-tools.ts`에서 `z.object({...})`로 선언, SDK가 자동 검증
- **타입 가드**: `innerHandleToolCall`에서 `typeof args.xxx === 'string'` 등으로 런타임 검사
- **AgruneManifest 스키마 검증**: `@agrune/manifest`의 `validateManifest()` 함수가 이미 존재 (Phase 11-05에서 추가)

`agrune_manifest_load` 입력 검증 시 `validateManifest(args.manifest)`를 호출해 zod schema validation을 통과시켜야 한다. 실패 시 `errorText('INVALID_MANIFEST', ...)` 패턴으로 반환.

### BrowserDriver 인터페이스에 manifest 주입 메서드 없음

현재 `BrowserDriver` 인터페이스(`packages/core/src/driver.ts`)에는 manifest 주입 메서드가 없다. `injectManifest(tabId, manifest)` 같은 메서드를 추가하거나, MCP layer에서 `CdpDriver` 구체 클래스에 직접 접근해야 한다.

**권장 방향**: `BrowserDriver` 인터페이스에 `injectManifest?(tabId: number, manifest: AgruneManifest): Promise<void>` optional 메서드 추가. `CdpDriver`에서 구현. 기존 tool들은 인터페이스 확장에 영향 없음.

---

## 2. CdpRuntimeInjector.prepareSession 현재 시그니처 + preloadManifest 추가 변경 범위

[VERIFIED: packages/browser/src/cdp-runtime-injector.ts 직접 조사]

### 현재 시그니처

```typescript
// 현재
async prepareSession(sessionId: string): Promise<void>
```

`CdpDriver.prepareTarget()`에서 호출:
```typescript
const injector = new CdpRuntimeInjector(this.connection)
await injector.prepareSession(target.sessionId)
```

### 변경 후 시그니처

```typescript
export interface PrepareSessionOptions {
  preloadManifest?: AgruneManifest
}

async prepareSession(sessionId: string, options?: PrepareSessionOptions): Promise<void>
```

### 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `packages/browser/src/cdp-runtime-injector.ts` | `prepareSession` 시그니처 변경, `getInjectedSource(manifest?)` 분기 추가 |
| `packages/browser/src/cdp-driver.ts` | `prepareTarget()` 호출부에 per-session manifest 전달, `injectManifest()` 신규 메서드 추가 |
| `packages/core/src/driver.ts` | `BrowserDriver` 인터페이스에 `injectManifest?` optional 메서드 추가 |

### preloadManifest 주입 구현

`addScriptToEvaluateOnNewDocument` source에 manifest JSON을 embed하는 방식:
```typescript
function buildPreloadManifestSource(manifest: AgruneManifest): string {
  const escaped = safeJsonEmbed(JSON.stringify(manifest))
  return `window.__agrune_preload_manifest__ = ${escaped};`
}

function getInjectedSourceWithPreload(manifest: AgruneManifest): string {
  const preloadScript = buildPreloadManifestSource(manifest)
  const runtimeSource = getInjectedSource()
  // preload를 먼저 실행해야 resolveManifest()가 읽을 수 있음
  return `${preloadScript}\n${runtimeSource}`
}
```

`addScriptToEvaluateOnNewDocument`는 페이지가 열릴 때마다 실행되므로, per-session manifest가 있으면 이 source에 embed한다. 단, source를 `cachedInjectedSource`처럼 캐싱하면 안 됨 — manifest는 세션마다 다를 수 있다.

---

## 3. __agrune_preload_manifest__ JSON embed 보안

[VERIFIED: 코드베이스 분석 + [ASSUMED] XSS 처리 방식]

### 위협 벡터

**문제**: `addScriptToEvaluateOnNewDocument`는 페이지 JavaScript context에서 실행된다. manifest JSON이 다음을 포함할 수 있다:
- `</script>` 문자열 → HTML injection (단, `addScriptToEvaluateOnNewDocument`는 `<script>` 태그가 아니라 V8 직접 실행이므로 HTML parser를 안 거침)
- Unicode escape 우회 (`\u003c/script\u003e`)
- Prototype pollution 시도 (`__proto__`, `constructor` 키)

### 위협 수준 분석

`addScriptToEvaluateOnNewDocument`는 **HTML `<script>` 태그를 통한 삽입이 아니다** — CDP가 V8에 직접 평가 요청을 보낸다. 따라서 `</script>` 이스케이프는 불필요하다.

그러나 다음은 여전히 방어해야 한다:
1. **JSON 내 역슬래시 + 닫는 중괄호 조합**: `} catch(e){evil()}//` 형태로 statement boundary를 이탈하는 시도
2. **U+2028 / U+2029 (줄 구분자)**: JSON.stringify는 이를 리터럴로 출력하지만 일부 JS 파서에서 줄바꿈으로 해석될 수 있음
3. **`__proto__` 키**: JSON.parse는 프로토타입 오염을 일으키지 않음 (V8 기본 동작), 하지만 manifest schema validation이 이미 이를 막음

### 권장 구현

```typescript
function safeJsonEmbed(json: string): string {
  // U+2028/U+2029를 이스케이프 (일부 JS 엔진에서 줄바꿈으로 해석)
  return json
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

// 사용: window.__agrune_preload_manifest__ = JSON.parse(${safeJsonEmbed(JSON.stringify(manifest))});
// JSON.parse() 감싸기: 직접 객체 리터럴보다 안전 (statement boundary 이탈 불가)
```

**JSON.parse() wrapper 패턴이 권장됨**: `window.__agrune_preload_manifest__ = JSON.parse('...')` 형태는 JSON string이 valid JSON임을 보장하므로 임의 코드 실행 불가.

### CSP 영향

`addScriptToEvaluateOnNewDocument`로 주입된 코드는 페이지 CSP를 우회한다 — 이는 CDP의 설계이며, agrune 전체 아키텍처의 전제 조건. Phase 12에서 새로 발생하는 CSP 위험은 없다.

### Trust boundary

manifest는 author(CLI 사용자)가 작성한 파일에서 로드된다. Phase 11-05의 `loadManifestFile()`이 이미 zod schema validation을 통과시키므로 `validateManifest()` 통과 후에만 주입되면 충분. manifest author = trust boundary 내부.

---

## 4. PageSnapshot.version 현재 상태 + Phase 12에서의 변경

[VERIFIED: packages/core/src/index.ts, packages/runtime/src/runtime/snapshot.ts 직접 조사]

### 현재 상태 (Phase 11 후)

```typescript
// packages/core/src/index.ts
export interface PageTarget {
  // ...
  selector: string  // ← 현재 string! SelectorLadder가 아님
  // ...
}

export interface PageSnapshot {
  version: number  // ← 숫자 타입. 실제 값은 MutableSnapshotStore.version (카운터, 정적 v2/v3 아님)
  // ...
}
```

**중요 발견**: `PageSnapshot.version`은 스냅샷 버전을 나타내는 **단조 증가 카운터**이지, "v3 프로토콜 버전"을 나타내는 상수가 아니다. `makeSnapshot()`에서 `store.version += 1`로 상태 변화 시마다 증가.

**AgruneManifest.version은 이미 `3`**: `buildEmptyManifest()`가 `{ version: 3, groups: [] }`를 반환하고 schema의 `version: z.literal(3)`으로 고정.

### CONTEXT.md가 요구하는 v3 breaking bump

CONTEXT.md의 "PageSnapshot.version 2→3으로 breaking bump"는 **`PageSnapshot` 프로토콜 버전 필드 추가**를 의미한다. 현재 `version` 필드가 카운터로 쓰이고 있으므로, 옵션은:

**Option A (권장)**: `PageSnapshot`에 `schemaVersion: 3` 필드를 별도로 추가
```typescript
export interface PageSnapshot {
  schemaVersion: 3        // ← 새 필드: 프로토콜 버전 상수
  version: number         // ← 기존 유지: 단조 증가 카운터
  // ...
}
```

**Option B**: `version` 필드를 프로토콜 버전 + 카운터 복합으로 변경 (복잡성 증가, 비권장)

### Phase 12에서 실제로 바꿀 것

1. **`PageTarget.selector: string` → `PageTarget.selector: SelectorLadder`** (핵심 breaking change)
2. `captureTarget()`에서 `JSON.stringify()` 제거 — SelectorLadder 객체 그대로 반환
3. `PageSnapshot`에 `schemaVersion: 3` 추가 (Option A 경우)
4. 모든 consumer 업데이트 (Section 6 참조)

### 명확화 필요

CONTEXT.md가 "PageSnapshot.version 2→3"을 언급하는데, 코드상 현재 버전 카운터가 2가 아닌 1부터 시작함. 이는 "v2 프로토콜 → v3 프로토콜"을 의미하며, `schemaVersion: 3` 필드 신설이 올바른 해석.

---

## 5. ManifestLoader — 위치, 역할, 우선순위

[VERIFIED: cdp-runtime-injector.ts의 resolveManifest() 분석]

### 현재 상태: resolveManifest()가 이미 구현됨

`packages/browser/src/cdp-runtime-injector.ts`의 `buildBootstrapSource()` 내부 `resolveManifest()`:

```javascript
const resolveManifest = () => {
  // Priority: owned-app > CDP preload > legacy inline scan > idle
  if (window.__agrune_manifest__) return { manifest: window.__agrune_manifest__, hasManifest: true, source: 'window' };
  if (window.__agrune_preload_manifest__) return { manifest: window.__agrune_preload_manifest__, hasManifest: true, source: 'preload' };
  // Legacy inline-scan (Phase 17에서 제거 예정)
  // ...
  return { manifest: runtimeApi.buildEmptyManifest(), hasManifest: false, source: 'idle' };
};
```

**"ManifestLoader"는 별도 클래스가 아니다** — 이미 bootstrap source 내부 함수로 구현되어 있다.

### RESOLVE-01이 요구하는 ManifestLoader

RESOLVE-01은 "ManifestLoader가 `window.__agrune_manifest__` 또는 CDP preload JSON에서 manifest를 로드"를 요구한다. 이는 이미 `resolveManifest()`로 구현된 동작이다.

**Phase 12에서 추가로 필요한 것**: `window.__agrune_preload_manifest__`가 실제로 설정되는 경로 — 즉 `prepareSession({ preloadManifest })`가 이 값을 embed해야 한다.

### 우선순위 완성 상태

```
window.__agrune_manifest__        (source: 'window')   — owned app이 직접 설정
  > window.__agrune_preload_manifest__  (source: 'preload')  — CdpRuntimeInjector embed
  > legacy inline scan              (source: 'inline')  — Phase 17에서 제거 예정
  > buildEmptyManifest()            (source: 'idle')    — 아무것도 없을 때
```

이미 올바르게 구현되어 있으므로 **bootstrap source는 변경 불필요** — `prepareSession` 변경만으로 충분.

### agrune_manifest_load 실행 흐름

1. MCP 에이전트 → `agrune_manifest_load({ manifest })` 호출
2. MCP layer: zod 검증 + `validateManifest()` 통과
3. `driver.injectManifest(tabId, manifest)` 호출
4. `CdpDriver.injectManifest()`: `Runtime.evaluate`로 `window.__agrune_manifest__ = manifest; window.__agrune_quick_mode__.reloadRuntime();` 실행
5. 페이지 내 `reloadRuntime()` → `installRuntime()` → `resolveManifest()` → `source: 'window'` 반환
6. `post('runtime_ready', { hasManifest: true, source: 'window' })` → snapshot dispatch

---

## 6. devtools webapp + MCP output 포맷의 PageSnapshot v3 소비 — breaking change consumer 목록

[VERIFIED: 코드베이스 직접 조사]

### 변경 대상 파일 목록

| 파일 | 변경 이유 | 변경 내용 |
|------|----------|----------|
| `packages/core/src/index.ts` | `PageTarget.selector` 타입 변경 | `selector: string` → `selector: SelectorLadder` |
| `packages/runtime/src/runtime/snapshot.ts` | `captureTarget()` 구현 | `JSON.stringify()` 제거, SelectorLadder 객체 직접 반환 |
| `packages/devtools/src/panel.ts` | `target.selector` 렌더링 | `target.selector` (string)를 표시 → SelectorLadder 객체 직렬화 필요 |
| `packages/mcp/src/public-shapes.ts` | `toPublicTarget()` 에서 selector 없음 | selector가 Public 출력에 포함되지 않음 (현재도 없음, 변경 불필요) |

### devtools panel.ts의 selector 렌더링

`panel.ts` 232번 줄:
```typescript
<tr><td>selector</td><td style="color:#89dceb;font-size:9px;">${target.selector}</td></tr>
```

`target.selector`가 현재 string으로 display됨. v3 변경 후 `SelectorLadder` 객체가 되면 `[object Object]`로 출력됨 — 수정 필요:
```typescript
// 변경 후
<tr><td>selector</td><td style="color:#89dceb;font-size:9px;">${JSON.stringify(target.selector)}</td></tr>
```

### public-shapes.ts (MCP output)

`toPublicTarget()`은 현재 `selector` 필드를 출력하지 않는다 — `PublicSnapshotTarget` 인터페이스에 `selector` 필드가 없다. 따라서 MCP tool 출력은 이 breaking change에 영향을 받지 않음.

### 테스트 파일 영향

| 파일 | 영향 |
|------|------|
| `packages/runtime/tests/v3-descriptor.spec.ts` | `descriptor.target.selector`가 SelectorLadder 객체 — `findElements()` 호출로만 검사, string 비교 없음. 직접 영향 없음 |
| `packages/runtime/tests/runtime.spec.ts` | snapshot의 `selector` 필드를 string으로 비교하는 테스트 있으면 수정 필요 |
| `packages/browser/tests/*.spec.ts` | snapshot 형태를 검사하는 테스트 있으면 수정 필요 |

### snapshot.ts의 signature hash

`makeSnapshot()`의 signature 계산:
```typescript
const signature = JSON.stringify({
  targets: targets.map(target => ({
    // ...selector 미포함
  })),
  // ...
})
```

selector는 signature에 포함되어 있지 않으므로 signature 로직 변경 불필요.

---

## 7. E2E 테스트 전략

[VERIFIED: packages/e2e/ 코드베이스 직접 조사]

### 기존 E2E skip 패턴

```typescript
// bootstrap-idle.spec.ts
const SKIP = process.env.PLAYWRIGHT_SKIP_E2E === '1'
test.skip(SKIP, 'PLAYWRIGHT_SKIP_E2E=1 set — run `pnpm test:e2e:install` to enable locally')

// user-flow/fill-real.spec.ts
export function realE2eSkipReason(): string | null {
  if (process.env.PLAYWRIGHT_SKIP_E2E === '1') return '...'
  if (process.env.AGRUNE_E2E_REAL === '0') return '...'
  const chromePath = findChromePath()
  if (!chromePath) return '...'
  return null
}
```

### YouTube E2E 전략

YouTube E2E는 두 가지 조건에서 skip:
1. `PLAYWRIGHT_SKIP_E2E=1` (CI default)
2. `AGRUNE_E2E_REAL=0` (explicit opt-out)
3. Chrome 바이너리 없음

`realE2eSkipReason()` 헬퍼를 재사용하는 것이 일관성 있다.

### YouTube E2E 시나리오 설계

```typescript
// packages/e2e/tests/user-flow/manifest-inject.spec.ts

const skipReason = realE2eSkipReason()

test.describe('INJECT — agrune_manifest_load → external site', () => {
  test.skip(!!skipReason, skipReason ?? '')

  test('YouTube: manifest_load → snapshot → target resolve → act', async () => {
    const harness = await createRealHarness({ startUrl: 'about:blank' })
    
    // 1. manifest 로드
    const manifest = { /* YouTube 검색창 + 동영상 클릭 target */ }
    const loadResult = await harness.call('agrune_manifest_load', { manifest })
    expect(loadResult.parsed.ok).toBe(true)
    
    // 2. YouTube 탐색
    // Page.navigate via CDP
    
    // 3. snapshot에서 target resolve 확인
    const targets = await getFullTargets(harness.call)
    expect(targets.length).toBeGreaterThan(0)
    
    // 4. act
    const actResult = await harness.call('agrune_act', { targetId: targets[0].targetId })
    expect(actResult.parsed.ok).toBe(true)
    
    await harness.teardown()
  })
})
```

### 외부 URL 의존성 주의

YouTube는 선택자 구조가 언제든 변경될 수 있다. 테스트에서 사용하는 manifest의 selector는 단순하게 유지해야 한다 (검색창 `role: { name: 'combobox' }` 등).

---

## 8. agrune_snapshot/agrune_act가 manifest resolve된 target을 MCP response에 직렬화

[VERIFIED: public-shapes.ts, index.ts 직접 조사]

### 현재 직렬화 경로

```
PageTarget (runtime) → toPublicTarget() → PublicSnapshotTarget (MCP output)
```

`toPublicTarget()` 현재 구현:
```typescript
function toPublicTarget(target: PageTarget, includeTextContent: boolean): PublicSnapshotTarget {
  return {
    targetId: target.targetId,
    groupId: target.groupId,
    name: target.name,
    description: target.description,
    actionKinds: target.actionKinds,
    // selector 필드 없음 — MCP 출력에서 의도적으로 제외
    ...(target.reason !== 'ready' ? { reason: target.reason } : {}),
    ...(target.sensitive ? { sensitive: true } : {}),
    ...(includeTextContent && target.textContent ? { textContent: target.textContent } : {}),
    ...(target.center ? { center: target.center } : {}),
    ...(target.size ? { size: target.size } : {}),
    ...(target.coordSpace ? { coordSpace: target.coordSpace } : {}),
  }
}
```

**selector 필드는 MCP 출력에 이미 노출되지 않는다** — AI 에이전트는 targetId로 대상을 지정하고 selector는 runtime 내부에서만 사용됨. Phase 12에서도 이 방침 유지.

### v3 breaking change가 MCP output에 미치는 영향

`PageTarget.selector` 타입이 `SelectorLadder`로 바뀌어도 `toPublicTarget()`이 selector를 출력하지 않으므로 **MCP 클라이언트(AI 에이전트)의 output 포맷은 바뀌지 않는다**.

변경이 필요한 것은 devtools 웹앱(panel.ts)뿐.

### agrune_manifest_load MCP response 형태

```typescript
// 성공
{ ok: true, session: { tabId, url, title, ... }, manifestSource: 'window' }

// 실패 — validation 에러
{ ok: false, error: { code: 'INVALID_MANIFEST', message: '...', details: { issues: [...] } } }

// 실패 — 세션 없음
{ ok: false, error: { code: 'SESSION_NOT_ACTIVE', message: '...' } }
```

---

## 9. 기존 MCP tool error shape + input validation 패턴

[VERIFIED: packages/mcp/src/index.ts, mcp-tools.ts 직접 조사]

### Error shape 표준

```typescript
// MCP response body (text 필드 안의 JSON)
{
  "ok": false,
  "error": {
    "code": "STRING_CODE",   // COMMAND_ERROR_CODES 중 하나 또는 custom
    "message": "human-readable",
    "details": { ... }       // optional
  }
}
```

`isError: true`가 ToolHandlerResult에 설정되면 MCP SDK가 tool response에 `isError: true` 첨부.

### 사용 가능한 error codes

`packages/core/src/index.ts`의 `COMMAND_ERROR_CODES`:
```typescript
'STALE_SNAPSHOT' | 'TARGET_NOT_FOUND' | 'NOT_VISIBLE' | 'DISABLED' | 
'FLOW_BLOCKED' | 'TIMEOUT' | 'SESSION_NOT_ACTIVE' | 'AGENT_STOPPED' | 
'INVALID_TARGET' | 'INVALID_COMMAND' | 'CANVAS_PAN_FAILED' | 
'CONNECTION_LOST' | 'CHROME_CRASHED' | 'RECOVERY_FAILED' | 'TAB_NOT_FOUND'
```

`agrune_manifest_load`에서 신규로 필요한 코드: `INVALID_MANIFEST` — 현재 목록에 없음. 두 가지 선택:
1. `COMMAND_ERROR_CODES`에 추가 (타입 안전성 ↑, breaking change for TypeScript consumers)
2. string으로 사용 (기존 tool들도 custom code string 반환 가능, index.ts의 `errorText()`가 string 받음)

**권장**: `COMMAND_ERROR_CODES`에 `'INVALID_MANIFEST'` 추가 — 어차피 실사용자가 없으므로 타입 level에서 깔끔하게.

### input validation flow

```
zod schema (mcp-tools.ts) → SDK auto-validate → innerHandleToolCall
  → typeof checks → validateManifest() → driver.injectManifest()
```

`agrune_manifest_load`의 zod 스키마:
```typescript
{
  manifest: z.object({
    version: z.literal(3),
    groups: z.array(z.any()),
    macros: z.array(z.any()).optional(),
  }).describe('AgruneManifest v3 — 전체 manifest 객체'),
  tabId: z.number().optional(),
}
```

더 엄격한 검증은 `validateManifest(args.manifest as AgruneManifest)`로 위임.

---

## 10. manifest loading 순서 race condition

[VERIFIED: cdp-runtime-injector.ts 분석]

### Race condition 시나리오

```
시간축 →

[preload path]
  T+0ms: prepareSession() 호출
  T+10ms: addScriptToEvaluateOnNewDocument source에 preload JSON embed 완료
  T+?ms: 페이지 로드 시 preload script 실행 → window.__agrune_preload_manifest__ 설정
  T+?ms: DOMContentLoaded → installRuntime() → resolveManifest() 실행

[window path — agrune_manifest_load]
  T+?ms: 에이전트가 agrune_manifest_load 호출
  T+?ms: Runtime.evaluate로 window.__agrune_manifest__ = manifest 실행
  T+?ms: reloadRuntime() 호출 → installRuntime() 재실행
```

### Race 1: preload embed vs 페이지 로드

**위험**: `prepareSession()`이 호출되기 전에 페이지가 이미 로드됐다면 `addScriptToEvaluateOnNewDocument`는 현재 페이지에 적용되지 않는다.

**현재 완화**: `prepareSession()`은 `Runtime.evaluate`도 함께 실행하므로 현재 페이지에도 즉시 적용됨. preload 방식도 이와 동일하게 현재 페이지에 `Runtime.evaluate`로 즉시 설정 + 다음 페이지에는 `addScriptToEvaluateOnNewDocument`로 자동 적용.

**구현 요점**: preload manifest는 두 경로 모두 커버해야 함:
```typescript
// 1. 현재 페이지에 즉시 설정
await this.connection.send('Runtime.evaluate', {
  expression: `window.__agrune_preload_manifest__ = ${safeJsonEmbed(JSON.stringify(manifest))};`,
}, sessionId)

// 2. 새 문서에서도 자동 실행
await this.connection.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__agrune_preload_manifest__ = ${safeJsonEmbed(JSON.stringify(manifest))};`,
}, sessionId)
```

### Race 2: agrune_manifest_load vs DOMContentLoaded

**위험**: `agrune_manifest_load`가 DOMContentLoaded 직후에 호출되면 `installRuntime()`이 이미 완료된 상태. `window.__agrune_manifest__` 설정 후 `reloadRuntime()` 호출 필요.

**현재 완화**: `reloadRuntime()` 훅이 Phase 11-04에서 이미 구현됨. `agrune_manifest_load` 구현이 반드시 이 훅을 호출해야 함.

### Race 3: window.__agrune_manifest__ 설정 타이밍

**위험**: owned app이 `window.__agrune_manifest__`를 DOMContentLoaded 이후에 비동기로 설정하면, `installRuntime()`이 먼저 실행되어 idle로 부팅.

**완화**: `reloadRuntime()` = 이미 구현됨. Owned app이 manifest를 설정한 뒤 직접 `reloadRuntime()`을 호출해야 함. Phase 12에서 이 계약을 문서화하면 충분 (runtime 자체 변경 불필요).

### Race 4: reloadRuntime 중복 호출

**위험**: `agrune_manifest_load` + DOMContentLoaded 이벤트 race로 `installRuntime()`이 두 번 실행될 수 있음.

**현재 상태**: `installRuntime()`은 멱등성이 없음 — 여러 번 호출하면 `installPageAgentRuntime`이 여러 번 실행됨. Phase 11-04 SUMMARY에 "rate-limit + 상태 초기화 추가 예정"으로 명시.

**Phase 12 결정 필요**: debounce 추가 or 중복 호출 허용 (dispose + reinstall이 safe한지 검증 필요)

---

## Architecture Patterns

### 신규 MCP tool 등록 패턴

```
1. mcp-tools.ts: mcp.tool() 등록
2. index.ts: switch case 추가
3. tools.ts: getToolDefinitions() 배열에 추가
4. (선택) BrowserDriver 인터페이스 확장
5. CdpDriver 구현
```

### manifest inject → reloadRuntime 흐름

```
agrune_manifest_load (MCP)
  ↓
driver.injectManifest(tabId, manifest)
  ↓
Runtime.evaluate: window.__agrune_manifest__ = manifest
Runtime.evaluate: window.__agrune_quick_mode__.reloadRuntime()
  ↓
[page] installRuntime()
  ↓
resolveManifest() → { source: 'window', hasManifest: true }
  ↓
installPageAgentRuntime(manifest, ...)
  ↓
post('runtime_ready', { hasManifest: true, source: 'window' })
  ↓
[CdpDriver.onBindingCalled] → refreshSnapshot()
  ↓
[MCP output] agrune_snapshot 호출 시 manifest resolve된 targets 반환
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| manifest schema 검증 | custom validator | `validateManifest()` (`@agrune/manifest`) | 이미 Phase 11-05에서 구현됨 |
| manifest 파일 로드 (CLI path) | custom loader | `loadManifestFile()` (`packages/mcp/src/manifest-file-loader.ts`) | .ts/.json 모두 지원, tsx 절대 경로 해결 포함 |
| JSON 직렬화 안전 처리 | custom escape | `JSON.parse(JSON.stringify())` + U+2028/U+2029 escape | 단순하고 안전 |
| MCP tool 등록 | 직접 handler 분기 | `mcp.tool()` + `toMcpToolResult()` | SDK 계약 위반 금지 |

---

## Common Pitfalls

### Pitfall 1: CdpRuntimeInjector source 캐싱과 preload 충돌

**What goes wrong**: `cachedInjectedSource`가 있는데 preload manifest가 있는 세션과 없는 세션이 섞이면 같은 cache를 공유할 수 없다.
**Why it happens**: 현재 `getInjectedSource()`가 전역 캐시를 사용함.
**How to avoid**: preload manifest가 있으면 캐시를 사용하지 않거나, preload 부분만 별도 prepend. runtime 본체(page-runtime.global.js)는 캐싱, bootstrap source는 매번 생성 (이미 string template이라 비용 낮음).

### Pitfall 2: reloadRuntime 멱등성 없음

**What goes wrong**: 빠른 연속 호출 시 `installPageAgentRuntime`이 여러 번 실행 → 이전 runtime dispose 없이 새 runtime 덮어쓰기 → listener 중복, 메모리 누수.
**Why it happens**: Phase 11-04 SUMMARY에서 "Phase 12에서 rate-limit + 상태 초기화 추가 예정"으로 명시된 known stub.
**How to avoid**: `reloadRuntime()`에 50ms debounce 추가 + 이전 runtime handle dispose 후 재설치.

### Pitfall 3: prepareSession 호출 순서

**What goes wrong**: `prepareSession({ preloadManifest })`를 페이지 로드 후에 호출하면 `addScriptToEvaluateOnNewDocument`는 현재 문서에 적용 안 됨.
**Why it happens**: CDP 설계 — `addScriptToEvaluateOnNewDocument`는 다음 문서부터 적용.
**How to avoid**: 항상 현재 페이지에도 `Runtime.evaluate`로 즉시 설정 + 다음 문서에도 `addScriptToEvaluateOnNewDocument`로 등록 (두 경로 모두).

### Pitfall 4: PageTarget.selector 타입 변경 후 런타임 역직렬화

**What goes wrong**: `getSnapshot()` → CDP `Runtime.evaluate` → `returnByValue: true` 경로에서 SelectorLadder 객체가 plain object로 직렬화되어 돌아옴. `instanceof` 검사가 있으면 실패.
**Why it happens**: CDP returnByValue는 JSON-serializeable 형태로만 반환.
**How to avoid**: `SelectorLadder`는 plain object이므로 instanceof 검사 없이 property 접근으로 처리. 이미 `SelectorLadder`는 interface (class 아님) — 문제 없음.

### Pitfall 5: devtools panel.ts의 selector 표시

**What goes wrong**: `target.selector`를 template literal에 직접 삽입하면 `[object Object]` 출력.
**Why it happens**: `SelectorLadder`는 객체이므로 string coercion 시 `[object Object]`.
**How to avoid**: `JSON.stringify(target.selector)` 또는 포매팅 함수 사용.

### Pitfall 6: tools.ts와 mcp-tools.ts 동기화 누락

**What goes wrong**: `agrune_manifest_load`를 `mcp-tools.ts`에만 추가하고 `tools.ts`에 누락하면 devtools 웹앱의 tool 목록과 실제 도구가 불일치.
**Why it happens**: 이중 등록 구조.
**How to avoid**: 두 파일을 항상 함께 업데이트. 테스트에서 두 목록 비교.

---

## Code Examples

### MCP tool 등록 예시 (기존 패턴 기반)

```typescript
// mcp-tools.ts에 추가
mcp.tool(
  'agrune_manifest_load',
  'Load an AgruneManifest v3 into the active browser session. After loading, agrune_snapshot and agrune_act will resolve targets defined in the manifest.',
  {
    manifest: z.object({
      version: z.literal(3),
      groups: z.array(z.any()),
      macros: z.array(z.any()).optional(),
    }).describe('AgruneManifest v3 object'),
    tabId: z.number().optional().describe('Tab ID (omit for active tab)'),
  },
  async (args) => toMcpToolResult(await handleToolCall('agrune_manifest_load', args)),
)
```

### JSON 안전 embed 예시

```typescript
// cdp-runtime-injector.ts
function safeJsonEmbed(json: string): string {
  return json
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function buildPreloadScript(manifest: AgruneManifest): string {
  const json = JSON.stringify(manifest)
  return `(function(){try{window.__agrune_preload_manifest__=JSON.parse(${JSON.stringify(json)});}catch(e){}})();`
}
```

`JSON.stringify(json)` (json 자체를 다시 stringify)으로 JSON string을 JS string literal로 이스케이프 — 이 방법이 가장 안전하다 (`"`, `\`, 제어문자 모두 이스케이프).

### captureTarget() selector 변경 예시

```typescript
// 변경 전 (snapshot.ts)
selector: JSON.stringify(descriptor.target.selector),

// 변경 후
selector: descriptor.target.selector,  // SelectorLadder 객체 그대로
```

단, `PageTarget.selector` 타입도 `@agrune/core`에서 `SelectorLadder`로 변경 필요.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `addScriptToEvaluateOnNewDocument` 는 HTML `<script>` 태그 경유 없이 V8에 직접 전달되므로 `</script>` 이스케이프 불필요 | Section 3 | 낮음 — CDP 스펙 동작 |
| A2 | `installPageAgentRuntime()` 여러 번 호출이 idempotent하지 않음 (Phase 11-04 SUMMARY에 명시, 코드 미검증) | Section 10, Pitfall 2 | 중간 — Phase 12 작업에서 검증 필요 |
| A3 | YouTube E2E에서 검색창을 `role: { name: 'combobox' }` 로 resolve 가능 | Section 7 | 낮음 — YouTube DOM 변경 시 실패. smoke test이므로 허용 |

---

## Open Questions

1. **reloadRuntime debounce 추가 여부**
   - 알고 있는 것: Phase 11-04 SUMMARY에서 "rate-limit + 상태 초기화 추가 예정"
   - 불명확한 것: debounce 없이 빠른 연속 호출이 실제 문제를 일으키는지
   - 권장: 50ms debounce + 이전 runtime dispose 추가 (안전 우선)

2. **`BrowserDriver` 인터페이스 확장 vs CdpDriver 직접 접근**
   - 알고 있는 것: `agrune_manifest_load` 구현이 `CdpDriver`의 구체 기능 필요
   - 불명확한 것: 향후 다른 driver 구현체 가능성 (현재는 CdpDriver만 존재)
   - 권장: `BrowserDriver`에 optional 메서드 추가 (확장성 ↑)

3. **PageSnapshot.schemaVersion 필드 추가 여부**
   - 알고 있는 것: `version` 필드가 이미 카운터로 사용 중
   - 불명확한 것: CONTEXT.md의 "version 2→3 breaking bump"가 카운터 초기값 변경인지 별도 필드 신설인지
   - 권장: `schemaVersion: 3 as const` 별도 필드 추가 (카운터 의미 보존)

---

## Environment Availability

Step 2.6: 코드/설정 변경 위주 phase, 외부 도구 의존성 없음. E2E는 Chrome binary 필요 (기존 `findChromePath()` 패턴으로 skip 처리).

| Dependency | Required By | Available | Fallback |
|------------|------------|-----------|----------|
| Chrome binary | YouTube E2E | macOS `/Applications/Google Chrome.app` — 로컬 환경 의존 | `PLAYWRIGHT_SKIP_E2E=1`으로 CI에서 skip |
| `@agrune/manifest` validateManifest | agrune_manifest_load | ✓ (Phase 11에서 구현됨) | — |
| `tsx` | manifest .ts 로드 (기존 기능) | ✓ (Phase 11-05에서 추가됨) | — |

---

## Validation Architecture

### Phase 12 테스트 전략

| REQ ID | Behavior | Test Type | Command | 파일 존재? |
|--------|----------|-----------|---------|-----------|
| INJECT-01 | prepareSession preload manifest embed | unit (vitest) | `pnpm --filter @agrune/browser test` | ❌ 신규 |
| INJECT-02 | agrune_manifest_load MCP tool | unit (vitest) | `pnpm --filter @agrune/mcp test` | ❌ 신규 |
| RESOLVE-01 | ManifestLoader 우선순위 (window > preload) | unit (vitest) | `pnpm --filter @agrune/browser test` | ❌ 신규 |
| RESOLVE-03 | PageSnapshot v3 shape (selector = SelectorLadder) | unit (vitest) | `pnpm --filter @agrune/runtime test` | ❌ 신규 |
| E2E smoke | manifest_load → YouTube → snapshot → act | e2e (playwright) | `PLAYWRIGHT_SKIP_E2E=0 pnpm --filter @agrune/e2e test:e2e` | ❌ 신규 |

### Wave 0 gaps (신규 파일 필요)

- [ ] `packages/browser/tests/cdp-runtime-injector-preload.spec.ts` — INJECT-01 커버
- [ ] `packages/mcp/tests/manifest-load-tool.spec.ts` — INJECT-02 커버
- [ ] `packages/runtime/tests/snapshot-v3.spec.ts` — RESOLVE-03 커버 (selector = SelectorLadder 검증)
- [ ] `packages/e2e/tests/user-flow/manifest-inject.spec.ts` — E2E smoke

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | YES | `validateManifest()` (zod) — manifest schema 검증 |
| V2 Authentication | NO | — |
| V4 Access Control | YES (낮음) | manifest는 author trust boundary 내부; CLI 사용자 = author |
| V6 Cryptography | NO | — |

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| manifest JSON injection via preload | Tampering | `JSON.parse(JSON.stringify(manifest))` wrapper — 임의 JS 코드 실행 불가 |
| sensitive:false override | Elevation of Privilege | Phase 11 schema에서 OR-only lock (z.literal(true).optional()) |
| prototype pollution via manifest JSON | Tampering | JSON.parse 자체가 `__proto__`를 일반 키로 처리 (V8 기본), schema validation이 추가 방어 |

---

## Sources

### Primary (HIGH confidence — 코드베이스 직접 조사)
- `packages/browser/src/cdp-runtime-injector.ts` — prepareSession, resolveManifest, buildBootstrapSource
- `packages/mcp/src/index.ts` — tool handler 구조, error 패턴
- `packages/mcp/src/mcp-tools.ts` — tool 등록 패턴
- `packages/mcp/src/public-shapes.ts` — MCP output 직렬화
- `packages/core/src/index.ts` — PageTarget.selector 타입, PageSnapshot 인터페이스
- `packages/runtime/src/runtime/snapshot.ts` — captureTarget(), makeSnapshot()
- `packages/devtools/src/panel.ts` — selector 렌더링 (232번 줄)
- `packages/e2e/tests/user-flow/helpers.ts` — E2E harness 패턴
- `.planning/phases/11-manifest/11-04-SUMMARY.md` — reloadRuntime stub 확인

### Secondary (MEDIUM confidence)
- Phase 11 SUMMARY 파일들 — Phase 11 실제 구현 내용 확인

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 코드베이스 직접 확인
- Architecture: HIGH — 기존 패턴 명확히 파악
- Pitfalls: HIGH — 실제 코드에서 발견된 문제들 (캐시, 멱등성, 이중 등록)

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (코드베이스 기반 — 외부 스펙 의존 없음)

---

## RESEARCH COMPLETE
