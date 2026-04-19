# Phase 11: MANIFEST - Research

**Researched:** 2026-04-19
**Domain:** TypeScript SDK authoring layer, manifest schema v3, CSS selector resolution, CLI validation
**Confidence:** HIGH (코드베이스 직접 검증, 모든 주요 파일 확인)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
없음 — discuss 단계가 `workflow.skip_discuss=true`로 생략됨.

### Claude's Discretion
모든 구현 선택은 Claude의 재량에 맡김. ROADMAP phase goal, success criteria, 기존 codebase conventions를 근거로 판단.

### Deferred Ideas (OUT OF SCOPE)
없음 — discuss 단계 생략.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MANIFEST-01 | `@agrune/manifest` 패키지가 `defineManifest`/`defineTarget`을 제공해 타입 안전 target 선언(`targetId` union + `actionKinds` + selector ladder) 가능 | 섹션 3, 6 — v3 schema + TS builder 패턴 |
| MANIFEST-02 | `defineRepeat` 스키마가 template/keyFrom/nameFrom/strategy(dom|virtualized) 필드 지원 | 섹션 3 — v3 schema 정의 |
| MANIFEST-03 | `defineMacro` 스키마가 id/params/steps/precondition/postcondition/circuit breaker 지원 | 섹션 3 — v3 schema 정의 |
| MANIFEST-04 | `sensitive:true` flag + 런타임 DOM heuristic이 flag를 OR-only로 결합(override 불가) 설계 락 | 섹션 8 — sensitive OR-only contract |
| MANIFEST-05 | `agrune manifest validate <file> --url` CLI가 live DOM에서 selector 1:1 매칭 검증 | 섹션 5 — validate CLI |
| RESOLVE-02 | `TargetResolver`가 CSS fallback selector(priority: role > text > testId > stable attr > CSS, 해시 class/`:nth-child` 금지) 해석 | 섹션 4 — CSS resolver algorithm |
| RESOLVE-04 | Runtime bootstrap 게이트 제거 — `dom-scanner` 없이 항상 부팅 | 섹션 2 — 현재 bootstrap 게이트 분석 |
</phase_requirements>

---

## Summary

Phase 11은 agrune의 v0.5 피봇의 뿌리다. 기존 코드베이스는 **inline `data-agrune-*` 스캔**을 bootstrap 조건으로 사용하고 있으며, 이 게이트는 `packages/browser/src/cdp-runtime-injector.ts`의 `buildBootstrapSource()` 함수 내 `hasAnnotations()` 함수에 위치한다. `packages/runtime`과 `packages/core`에는 이미 v2 manifest 스키마 (`AgruneManifest`, `AgruneGroupEntry`, `AgruneToolEntry`, `AgruneTargetEntry`)가 존재하며, v3는 이것을 breaking-replace한다.

새 `@agrune/manifest` 패키지는 monorepo에 `packages/manifest/`로 신설하며, TypeScript 컴파일 타임 검증(`defineManifest`/`defineTarget`/`defineRepeat`/`defineMacro`)을 제공한다. Runtime resolver는 `packages/runtime`에 `TargetResolver` 클래스로 추가되고, `isSensitive()` 함수는 manifest flag와 DOM heuristic의 OR-only 결합으로 교체된다. CLI validate 커맨드는 `packages/mcp/bin/` 안에 `agrune manifest validate` 서브커맨드로 추가하고, Playwright를 사용해 live DOM을 로드한다 (이미 `@playwright/test`가 e2e에 설치됨).

**Primary recommendation:** `packages/manifest/` 신설 → `@agrune/core`의 v2 schema를 v3로 교체 → `packages/runtime`에 `TargetResolver` 추가 → `packages/mcp/bin/agrune-mcp.ts`에 `manifest` 서브커맨드 추가 → `cdp-runtime-injector.ts`의 bootstrap 게이트 제거 순서로 진행.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest 타입 정의 (schema v3) | `packages/manifest` (신규) | `packages/core` (v3 타입 re-export) | 독립 authoring SDK, runtime과 분리 |
| TypeScript builder (`defineTarget` 등) | `packages/manifest` | — | pure TS, build-time only |
| CSS fallback resolver | `packages/runtime` | — | DOM access 필요, browser 컨텍스트 |
| Bootstrap 게이트 제거 | `packages/browser` (injector) | `packages/runtime` (page-agent-runtime) | 주입 스크립트 + runtime 초기화 |
| `agrune manifest validate --url` | `packages/mcp/bin` (새 서브커맨드) | `packages/manifest` (selector 검증 로직) | CLI는 mcp 패키지에 집중 |
| sensitive OR-only lock | `packages/runtime` (isSensitive 교체) | `packages/manifest` (schema에 flag) | 런타임 강제 + schema 표현 |

---

## 1. @agrune/manifest 패키지 — 위치 및 의존 관계

### 결론 [VERIFIED: 직접 파일 검사]

**위치:** `packages/manifest/` 신설 (package name: `@agrune/manifest`).

**근거:**
- 기존 5개 패키지: `@agrune/core`, `@agrune/runtime`, `@agrune/browser`, `@agrune/mcp`, `@agrune/devtools` — 모두 각자 역할이 분명함
- `@agrune/manifest`는 **authoring 전용** (Node.js에서 import, 브라우저에 주입되지 않음) → 별도 패키지 분리가 맞음
- 현재 v2 manifest 타입은 `@agrune/core/src/manifest.ts`에 있음. v3 타입은 `@agrune/core`를 업데이트하거나 `@agrune/manifest`에서 re-export하는 방식 중 선택 필요

**권장 의존 관계:**
```
@agrune/manifest
  ↓ devDependencies
  typescript, zod, tsup, vitest

@agrune/core
  → AgruneManifest 타입을 v3로 교체 (breaking change 선언)
  → @agrune/manifest에서 import

@agrune/runtime
  → @agrune/core (v3 타입)
  → TargetResolver는 여기에 추가

@agrune/browser
  → @agrune/runtime (TargetResolver)
  → bootstrap 게이트 제거

@agrune/mcp
  → @agrune/manifest (validate CLI용)
  → @playwright/test (validate CLI의 DOM 로딩)
```

**중요 발견:** `@agrune/mcp/tsup.config.ts`는 `noExternal: [/.*/]`로 모든 의존성을 번들링함. `@agrune/manifest`를 MCP bin에서 사용하려면 의존성으로 추가하면 자동으로 번들됨. [VERIFIED: tsup.config.ts 직접 확인]

**`private: true` 여부:** `@agrune/runtime`, `@agrune/browser`는 `private: true` (외부 배포 안 함). `@agrune/core`, `@agrune/mcp`는 public. `@agrune/manifest`는 **공개 배포 대상** (`publishConfig.access: 'public'` 필요) — users가 `defineManifest`를 직접 import해야 하므로.

---

## 2. data-agrune-* bootstrap 게이트 현황

### 게이트 위치 [VERIFIED: 파일 직접 읽기]

**파일:** `packages/browser/src/cdp-runtime-injector.ts`

**현재 로직:**
```javascript
// buildBootstrapSource() 내부 (line 67)
const hasAnnotations = () => selectors.some(selector => document.querySelector(selector) !== null);
// line 95 — installRuntime() 첫 줄
if (!hasAnnotations()) return;  // ← 이것이 bootstrap 게이트
```

`selectors` 배열:
```javascript
const selectors = [
  '[data-agrune-action]',
  '[data-agrune-group]',
  '[data-agrune-canvas]',
  '[data-agrune-meta]',
];
```

**MutationObserver 게이트:**
```javascript
const installObserver = new MutationObserver((mutations) => {
  if (mutations.some(mutation => mutationTouchesAnnotations(mutation))) {
    scheduleInstall(); // data-agrune-* 변경이 있을 때만 install 시도
  }
});
```

**두 번째 스캔 경로:** `packages/runtime/src/runtime/snapshot.ts`의 `collectLiveDescriptors()`도 `data-agrune-action` 셀렉터로 live scan. 이것은 manifest에서 온 descriptors와 merge됨.

**RESOLVE-04 구현 scope:**

제거해야 할 항목들:
1. `buildBootstrapSource()`의 `hasAnnotations()` 함수와 `if (!hasAnnotations()) return` 게이트
2. `installObserver` (MutationObserver on annotation 변경) → 제거 또는 manifest-change 이벤트로 교체
3. `mutationTouchesAnnotations()` 함수 — `data-agrune-*` 특화, 제거
4. `snapshot.ts`의 `collectLiveDescriptors()` 호출 체인 — Phase 17(REMOVE)에서 처리하거나 Phase 11에서 선처리 결정 필요

**남겨야 할 항목들:**
- `window[apiKey] = { handleCommand, getSnapshot, applyConfig, ... }` — 커맨드 브릿지
- `scheduleSnapshot()`, `dispatchSnapshot()` — snapshot 주기적 갱신
- history 이벤트 리스너 (pushState, popstate 등)
- Bootstrap 자체는 항상 실행, manifest 없으면 idle

**새 부팅 로직 (권장):**
```javascript
const installRuntime = () => {
  // manifest 없으면 idle로 부팅
  const manifest = window.__agrune_manifest__ ?? window.__agrune_preload_manifest__ ?? null;
  const runtimeManifest = manifest ?? buildEmptyManifest();
  runtimeApi.installPageAgentRuntime(runtimeManifest, { cdpPostMessage: ... });
  post('runtime_ready', { hasManifest: manifest !== null });
};
// 항상 bootstrap, hasAnnotations() 게이트 없음
bootstrap(); // DOMContentLoaded 또는 즉시
```

---

## 3. v3 Manifest Schema

### 현재 v2 Shape [VERIFIED: packages/core/src/manifest.ts]

```typescript
// v2 현재 (packages/core/src/manifest.ts)
export interface AgruneManifest {
  version: 2
  generatedAt: string
  exposureMode: 'grouped' | 'per-element'
  groups: AgruneGroupEntry[]
}

export interface AgruneGroupEntry {
  groupId: string
  groupName: string | null
  groupDesc: string | null
  tools: AgruneToolEntry[]
}

export interface AgruneToolEntry {
  toolName: string
  toolDesc: string
  action: AgruneSupportedAction  // 단일 action string (comma-separated)
  status: 'active' | 'skipped_unsupported_action'
  targets: AgruneTargetEntry[]
}

export interface AgruneTargetEntry {
  targetId: string
  name: string | null
  desc: string | null
  selector: string
  sourceFile: string
  sourceLine: number
  sourceColumn: number
}
```

### v3 변경점 (이 phase에서 결정할 것들)

**Breaking changes (adapter 없음, 결정됨):**
- `version: 2` → `version: 3`
- `exposureMode` 필드 제거 (manifest 기반 피봇으로 의미 없어짐)
- `AgruneToolEntry.action` → `actionKinds: ActionKind[]` (배열 타입으로 변경, comma string 폐기)
- `sensitive` 필드를 `AgruneTargetEntry`에 추가 (boolean)
- `selector` 필드를 `SelectorLadder` 객체로 교체 (role/text/testId/attr/css 우선순위 명시)

**v3 Schema 제안 (이 phase에서 정의):**

```typescript
// packages/manifest/src/schema.ts (신규)

export type ActionKind = 'click' | 'fill' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'

// Selector ladder — role이 최우선, css가 최후순위
export interface SelectorLadder {
  role?: { name: string; level?: string }        // ARIA role + accessible name
  text?: string                                   // 텍스트 콘텐츠 매칭
  testId?: string                                 // data-testid (stable attr)
  attr?: string                                   // 기타 stable attribute selector
  css?: string                                    // CSS selector (마지막 수단)
  // 해시 class / :nth-child 금지 — validator가 강제
}

export interface ManifestTarget {
  targetId: string
  name?: string
  desc?: string
  actionKinds: ActionKind[]
  selector: SelectorLadder
  sensitive?: boolean          // true-only OR contract (false 불가)
}

export interface ManifestRepeat {
  repeatId: string
  template: string             // target 이름 템플릿
  keyFrom: string              // JS 표현식 (string) 또는 함수
  nameFrom?: string
  strategy: 'dom' | 'virtualized'
  targets: ManifestTarget[]
}

export interface MacroStep {
  targetId: string
  action: ActionKind
  value?: string
  sensitive?: true             // step 단위 sensitive override
}

export interface ManifestMacro {
  macroId: string
  name?: string
  desc?: string
  params: Record<string, { type: 'string' | 'number' | 'boolean'; required?: boolean }>
  steps: MacroStep[]
  precondition?: string        // JS 표현식 (boolean)
  postcondition?: string       // JS 표현식 (boolean)
  circuitBreaker?: { maxRetries: number; resetAfterMs?: number }
}

export interface ManifestGroup {
  groupId: string
  name?: string
  desc?: string
  route?: string | RegExp      // URL/route 범위 (빈 = 전역)
  targets: ManifestTarget[]
  repeats?: ManifestRepeat[]
}

export interface AgruneManifest {  // v3
  version: 3
  groups: ManifestGroup[]
  macros?: ManifestMacro[]
}
```

**sensitive OR-only 계약:** `sensitive: false`는 스키마에서 허용하지 않는다. `sensitive` 필드는 `true | undefined`만 가능. 이를 위해 TypeScript 타입에서 `false` 값을 원천 차단한다:
```typescript
sensitive?: true  // false 불가 — 타입 레벨에서 차단
```

### defineManifest/defineTarget builder는 어디에?

`packages/manifest/src/builders.ts` (신규):
```typescript
export function defineManifest(input: ManifestInput): AgruneManifest
export function defineTarget(input: TargetInput): ManifestTarget
export function defineRepeat(input: RepeatInput): ManifestRepeat
export function defineMacro(input: MacroInput): ManifestMacro
```

TS 컴파일 타임 검증은 제네릭 타입을 통해 구현:
```typescript
// targetId union 검증 예시
export function defineManifest<TId extends string>(input: {
  groups: Array<{
    groupId: string
    targets: Array<ManifestTarget & { targetId: TId }>
  }>
  macros?: Array<ManifestMacro>
}): AgruneManifest & { __targetIds: TId }
```

---

## 4. CSS Fallback Selector Resolver Algorithm

### 현재 상태 [VERIFIED: packages/runtime/src/runtime/snapshot.ts]

현재 resolver는 단순히 `descriptor.target.selector`를 `document.querySelectorAll()`에 넘김. v2에서 selector는 문자열 하나. `collectDescriptors()` → `findElements()` → `document.querySelectorAll(selector)`.

### v3 Resolver 설계 (RESOLVE-02)

**파일:** `packages/runtime/src/runtime/target-resolver.ts` (신규)

**우선순위 알고리즘 (role > text > testId > stable attr > CSS):**

```typescript
// packages/runtime/src/runtime/target-resolver.ts
export function resolveByLadder(ladder: SelectorLadder): HTMLElement[] {
  // 1. role — ARIA role + accessible name (가장 안정적)
  if (ladder.role) {
    const elements = Array.from(document.querySelectorAll(`[role="${ladder.role.name}"]`))
    const matched = ladder.role.level
      ? elements.filter(el => matchesAccessibleName(el, ladder.role!.level!))
      : elements
    if (matched.length > 0) return matched as HTMLElement[]
  }

  // 2. text — 텍스트 콘텐츠 (외부 사이트에서 비교적 안정)
  if (ladder.text) {
    const matched = findByTextContent(ladder.text)
    if (matched.length > 0) return matched
  }

  // 3. testId — data-testid (개발자가 명시한 stable attr)
  if (ladder.testId) {
    const elements = Array.from(document.querySelectorAll(`[data-testid="${CSS.escape(ladder.testId)}"]`))
    if (elements.length > 0) return elements as HTMLElement[]
  }

  // 4. attr — 기타 stable attribute selector (data-* 등)
  if (ladder.attr) {
    assertNoHashClass(ladder.attr)
    assertNoNthChild(ladder.attr)
    const elements = Array.from(document.querySelectorAll(ladder.attr))
    if (elements.length > 0) return elements as HTMLElement[]
  }

  // 5. css — 마지막 수단 (해시 class / :nth-child 금지)
  if (ladder.css) {
    assertNoHashClass(ladder.css)
    assertNoNthChild(ladder.css)
    return Array.from(document.querySelectorAll(ladder.css)) as HTMLElement[]
  }

  return []
}
```

**해시 class / `:nth-child` 금지 강제:**
```typescript
// 해시 class 패턴: .abc123def (8자 이상 alphanumeric)
const HASH_CLASS_PATTERN = /\.[a-zA-Z0-9]{8,}/
// :nth-child 패턴
const NTH_CHILD_PATTERN = /:nth-child\(/

export function assertNoHashClass(selector: string): void {
  if (HASH_CLASS_PATTERN.test(selector)) {
    throw new SelectorForbiddenError(
      `Selector "${selector}" contains a likely hash-based class. ` +
      'Use role, text, testId, or stable attribute instead.'
    )
  }
}

export function assertNoNthChild(selector: string): void {
  if (NTH_CHILD_PATTERN.test(selector)) {
    throw new SelectorForbiddenError(
      `Selector "${selector}" uses :nth-child which is position-dependent. ` +
      'Use a stable identifier instead.'
    )
  }
}
```

**Accessible name matching:**
DOM API `element.getAttribute('aria-label')` + `element.getAttribute('aria-labelledby')` 체인으로 충분. `aria-labelledby`는 referenced element의 textContent를 읽는다. [ASSUMED — getComputedAccessibleName() 브라우저 API는 실험적이므로 수동 구현 필요]

**`findByTextContent` 구현:**
```typescript
function findByTextContent(text: string): HTMLElement[] {
  const all = Array.from(document.querySelectorAll('button, a, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"]'))
  return all.filter(el => el.textContent?.trim() === text) as HTMLElement[]
}
```

텍스트 매칭은 정확 매칭 우선, 실패 시 포함(contains) 매칭으로 fallback. [ASSUMED — 정확 매칭 우선이 덜 모호함]

**validate CLI에서의 금지 검사:** 런타임 `assertNoHashClass/NthChild`와 동일한 로직을 manifest 로드 시점에도 실행 → authoring 시점에 에러 조기 발견.

---

## 5. `agrune manifest validate --url` CLI

### 도구 선택: Playwright [VERIFIED: packages/e2e/package.json]

`@playwright/test` 1.59.1이 이미 `packages/e2e`에 설치됨. `@agrune/mcp`의 tsup이 `noExternal: [/.*/]`로 모든 것을 번들하므로 `@playwright/test`를 `@agrune/mcp`의 devDependency로 추가하면 됨.

**왜 Playwright인가:**
- 이미 프로젝트에 존재 (`packages/e2e` devDependency)
- CDP 기반 → agrune 아키텍처와 일치
- `page.evaluate()` → live DOM에서 selector 검증 가능
- `page.goto(url)` → 단순 URL 로딩으로 충분

**왜 CDP 직접 사용이 아닌가:**
- validate CLI는 런타임을 주입하지 않아도 됨 — selector 1:1 매칭만 확인하면 됨
- Playwright가 브라우저 생명주기(launch/close)를 더 간단히 관리
- `agrune` 자체 서버를 올릴 필요 없음

### CLI 위치

현재 `packages/mcp/bin/agrune-mcp.ts`에 단일 CLI 엔트리가 있음. 이것을 서브커맨드로 확장:

```
agrune                       → 기존 MCP 서버 실행 (변경 없음)
agrune manifest validate ...  → 새 서브커맨드
```

**방법 A (권장): 서브커맨드 분기 — `bin/agrune-mcp.ts` 확장**

```typescript
// bin/agrune-mcp.ts 상단에 추가
const subcommand = args[0]

if (subcommand === 'manifest') {
  const manifestSubcmd = args[1]
  if (manifestSubcmd === 'validate') {
    const { runValidateCli } = await import('../src/manifest-validate-cli.js')
    await runValidateCli(args.slice(2))
    process.exit(0)
  }
  // ...
}
// 기존 MCP 서버 실행 로직은 그대로
```

**방법 B (대안): 별도 bin 엔트리 추가**

`package.json`의 `bin`에 `"agrune-manifest": "./dist/bin/agrune-manifest.js"` 추가.

방법 A가 사용자 경험 일관성(단일 `agrune` 커맨드) 면에서 권장됨.

**`src/manifest-validate-cli.ts` 구현:**

```typescript
// packages/mcp/src/manifest-validate-cli.ts
import { chromium } from '@playwright/test'
import { resolveManifestFile } from './manifest-file-loader.js'

export async function runValidateCli(args: string[]): Promise<void> {
  const urlArg = getArgValue(args, '--url')
  const manifestPath = args.find(a => !a.startsWith('-'))

  if (!manifestPath || !urlArg) {
    process.stderr.write('Usage: agrune manifest validate <file.ts> --url <url>\n')
    process.exit(1)
  }

  const manifest = await resolveManifestFile(manifestPath)
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(urlArg, { waitUntil: 'networkidle' })

  const results = await page.evaluate((targets) => {
    return targets.map((target) => {
      const el = document.querySelector(target.resolvedSelector)
      return { targetId: target.targetId, found: !!el }
    })
  }, prepareTargetsForEval(manifest))

  await browser.close()

  const failed = results.filter(r => !r.found)
  if (failed.length === 0) {
    process.stdout.write(`All ${results.length} targets matched.\n`)
    process.exit(0)
  } else {
    process.stderr.write(`${failed.length}/${results.length} targets not found:\n`)
    for (const f of failed) {
      process.stderr.write(`  - ${f.targetId}\n`)
    }
    process.exit(1)
  }
}
```

**manifest 파일 로딩 (`resolveManifestFile`):**

`.ts` 파일을 직접 실행해야 하므로 `tsx` 또는 `ts-node`가 필요. 권장 전략:

```typescript
// 방법 1: tsx 사용 (이미 @agrune/mcp devDependency)
import { execSync } from 'child_process'
const result = execSync(`node --import tsx/esm ${manifestPath}`, { encoding: 'utf-8' })

// 방법 2: TypeScript 컴파일 후 실행
// 방법 3: require/import로 ts-morph 경유
```

`tsx` 4.x가 이미 `@agrune/mcp` devDependency로 존재함 [VERIFIED: packages/mcp/package.json]. validate CLI에서 manifest `.ts` 파일을 `tsx`를 경유해 실행하고 `__agrune_exported_manifest__` global에 결과를 담는 방식이 간단함.

**또는 더 단순하게:** manifest를 JSON으로도 받는다 (`agrune manifest validate manifest.json --url ...`). 이 경우 TypeScript 컴파일 없이 바로 JSON 파싱 가능. `.ts` 지원은 `tsx` subprocess를 통해 추가.

---

## 6. defineManifest/defineTarget TS 컴파일 타임 검증 패턴

### targetId union 타입 좁히기

```typescript
// packages/manifest/src/builders.ts

// 핵심 기법: const assertion + infer를 사용해 targetId를 union으로 추출
export function defineTarget<TId extends string>(input: {
  targetId: TId
  name?: string
  desc?: string
  actionKinds: ActionKind[]
  selector: SelectorLadder
  sensitive?: true  // false 불가
}): ManifestTarget & { readonly targetId: TId } {
  return input as ManifestTarget & { readonly targetId: TId }
}

export function defineGroup<
  TTargets extends ReadonlyArray<ManifestTarget & { readonly targetId: string }>
>(input: {
  groupId: string
  name?: string
  targets: TTargets
}): ManifestGroup & { readonly __targetIds: TTargets[number]['targetId'] } {
  return input as any
}

export function defineManifest<
  TGroups extends ReadonlyArray<ManifestGroup & { __targetIds: string }>
>(input: {
  groups: TGroups
  macros?: ManifestMacro[]
}): AgruneManifest & {
  readonly __targetIds: TGroups[number] extends { __targetIds: infer T } ? T : never
} {
  return { version: 3, ...input } as any
}
```

**actionKinds union 검증:**
```typescript
// defineTarget 호출 시점에 TypeScript가 자동으로 ActionKind[] 타입 체크
// 예: actionKinds: ['click', 'invalid'] → 컴파일 에러
```

**selector ladder 타입 좁히기:**
```typescript
// SelectorLadder는 최소 1개 필드 필수
export type SelectorLadder = AtLeastOne<{
  role: { name: string; level?: string }
  text: string
  testId: string
  attr: string
  css: string
}>

type AtLeastOne<T> = { [K in keyof T]: Pick<T, K> & Partial<Omit<T, K>> }[keyof T]
```

**macros step의 targetId 타입 안전성:**
```typescript
// defineMacro는 manifest에서 사용 가능한 targetId만 받아야 함
// 완전한 타입 안전성은 defineManifest 레벨에서 macro를 함께 정의할 때만 가능
// Phase 11 scope: 기본 string check, 런타임 validate에서 보완
```

### validate CLI의 컴파일 타임 검증 보완

CLI는 런타임 DOM 검증 + 스키마 validator 두 가지를 함께 실행:
```typescript
// zod schema로 manifest 구조 검증
import { z } from 'zod'
const ManifestSchema = z.object({
  version: z.literal(3),
  groups: z.array(GroupSchema),
  macros: z.array(MacroSchema).optional(),
})
// validate 시 ManifestSchema.parse(manifest) 실행 → 구조 오류 조기 발견
```

---

## 7. PageSnapshot v3 영향 범위

### 이 phase에서 닫을 것

Phase 11(MANIFEST)은 스키마 필드 추가/변경이 `AgruneManifest`에만 영향. `PageSnapshot` shape 자체는 **Phase 12(INJECT)**에서 변경.

**Phase 11에서 할 것:**
- `@agrune/core`의 `AgruneManifest` 인터페이스를 v3로 교체
- `@agrune/runtime`의 `collectDescriptors()`, `collectLiveDescriptors()`, `mergeDescriptors()`가 v3 manifest를 읽도록 수정
- `snapshot.ts`의 manifest descriptor 처리 경로 업데이트
- `buildManifest()` (manifest-builder.ts) — Phase 17에서 삭제 예정이지만 Phase 11에서는 아직 유지 (live scan은 계속 사용하되 bootstrap 게이트만 제거)

**Phase 12에서 할 것:**
- `PageSnapshot.version` 2→3 bump
- `ManifestLoader` 추가 (`window.__agrune_manifest__` 로드)
- `CdpRuntimeInjector.prepareSession({ preloadManifest })` 추가

**Phase 11에서 건드리지 않을 것:**
- `PageSnapshot` shape (targets 배열, groups 배열)
- MCP tool 응답 포맷 (`toPublicSnapshot`, `PublicSnapshot`)
- `CommandResult` shape

### cross-cutting 주의사항

`collectLiveDescriptors()`는 Phase 11에서 제거하지 않는다 — RESOLVE-04는 bootstrap 게이트 제거이지 live scan 경로 제거가 아님. Live scan 제거는 Phase 17(REMOVE-01).

그러나 `mergeDescriptors()` 동작이 v3 manifest와 live scan descriptors를 올바르게 merge해야 한다. v2 → v3 전환 시 `AgruneToolEntry.action` (string) → `ManifestTarget.actionKinds` (배열) 변경이 `collectDescriptors()`에 영향.

---

## 8. Sensitive OR-only Contract

### 현재 상태 [VERIFIED: packages/runtime/src/runtime/dom-utils.ts:308]

```typescript
export function isSensitive(element: HTMLElement): boolean {
  return element.getAttribute('data-agrune-sensitive') === 'true'
  // ← inline 어노테이션에서만 읽음. manifest flag는 현재 없음.
}
```

**snapshot.ts의 사용:**
```typescript
// captureTarget() 내
const valuePreview = isFillableElement(element) && !state.sensitive ? element.value : null
```

**page-agent-runtime.ts 사용:**
manifest `sensitive` 필드는 현재 `AgruneTargetEntry`에 없음 (v2). v3에서 추가됨.

### OR-only 계약 구현 계획

**스키마 레벨 (schema.ts):**
```typescript
sensitive?: true  // false 타입 차단 — 타입 레벨 OR-only
```

**런타임 레벨 (dom-utils.ts 교체):**
```typescript
export function isSensitive(
  element: HTMLElement,
  manifestFlag?: true | undefined,
): boolean {
  // OR: manifest가 true면 항상 sensitive. DOM heuristic도 OR.
  if (manifestFlag === true) return true

  // DOM heuristic (현재는 data-agrune-sensitive, v3에서는 input type/autocomplete)
  // Phase 11 scope: 기본 heuristic 유지, Phase 14에서 확장
  return (
    element.getAttribute('type') === 'password' ||
    element.getAttribute('data-agrune-sensitive') === 'true'  // Phase 17 전까지 레거시 유지
  )
}
```

**validate CLI 에러 메시지:**
```
Error: Target "login_password" has sensitive:false which is not allowed.
  The sensitive flag is OR-only: once a field is detected as sensitive by runtime 
  heuristics or manifest flag, it cannot be overridden to false.
  Fix: Remove the sensitive field entirely, or set it to true.
```

**스키마 validator (zod):**
```typescript
const TargetSchema = z.object({
  // ...
  sensitive: z.literal(true).optional(),  // false 차단
})
```

---

## 9. 기존 docs/superpowers/specs/ 관련 스펙

### 확인 결과 [VERIFIED: 직접 파일 목록 확인]

2026-03-24~2026-04-15 사이에 작성된 설계 스펙 25개 존재. 이 중 Phase 11(MANIFEST)과 직접 관련된 스펙 파일:

**직접 관련:**
- `2026-04-02-package-restructure-design.md` — 패키지 재구조화 설계 (참고 가치 있음)

**간접 관련:**
- `2026-03-24-snapshot-token-optimization-design.md` — snapshot shape 최적화 (Phase 12 PageSnapshot v3 참고)
- `2026-03-25-target-inspector-design.md` — target inspection 관련 (validate CLI 참고 가능)
- `2026-03-26-cdp-migration-design.md` — CDP 마이그레이션 (현재 완료됨)
- `2026-04-02-cdp-quick-mode-design.md` — 현재 bootstrap 방식 원설계 (bootstrap 게이트 제거 참고)
- `2026-04-15-extension-removal-devtools-webapp-design.md` — 현재 아키텍처 기반 설계

**중요:** 대부분 스펙이 2026-04-02 이전 작성으로 CDP-only 피봇(2026-04-15)과 manifest pivot(2026-04-19)을 반영하지 않음. 참고는 가능하나 그대로 따르지 않도록 주의. `cdp-quick-mode-design.md`는 현재 `buildBootstrapSource()`의 원 설계이므로 bootstrap 제거 맥락 이해에 유용.

---

## 10. 테스트/픽스처 전략

### 현재 테스트 인프라 [VERIFIED: packages/runtime/tests/]

- `@vitest-environment jsdom` 헤더로 jsdom 환경 사용
- `createPageAgentRuntime(makeManifest(), { cdpPostMessage })` 패턴
- `mockRect()`, `vi.fn()` 패턴으로 DOM 모킹
- `vitest run` 명령어

### Phase 11 테스트 전략

**1. Schema/Builder 단위 테스트 (`packages/manifest/tests/`)**

외부 의존성 없음 — 순수 TypeScript 함수 테스트:
```typescript
// defineTarget sensitive false 차단 테스트
it('sensitive:false는 타입 에러를 발생시킨다', () => {
  // @ts-expect-error
  defineTarget({ targetId: 'btn', selector: { css: 'button' }, sensitive: false })
})

// SelectorLadder 빈 객체 차단
it('빈 selector ladder는 zod validation 실패', () => {
  expect(() => SelectorLadderSchema.parse({})).toThrow()
})
```

**2. TargetResolver 단위 테스트 (`packages/runtime/tests/`)**

jsdom 환경에서 실제 DOM fixture 생성:
```typescript
// @vitest-environment jsdom
it('role selector — ARIA role 매칭', () => {
  document.body.innerHTML = `<button role="button" aria-label="Submit">Submit</button>`
  const elements = resolveByLadder({ role: { name: 'button', level: 'Submit' } })
  expect(elements).toHaveLength(1)
})

it('해시 class selector — 에러 발생', () => {
  expect(() => resolveByLadder({ css: '.abc12345def' })).toThrow(SelectorForbiddenError)
})

it(':nth-child selector — 에러 발생', () => {
  expect(() => resolveByLadder({ css: 'div:nth-child(2)' })).toThrow(SelectorForbiddenError)
})
```

**3. Sensitive OR-only 테스트**

```typescript
it('manifest sensitive:true + DOM non-sensitive → isSensitive = true', () => {
  const el = document.createElement('input')
  el.type = 'text'
  expect(isSensitive(el, true)).toBe(true)  // manifest flag trumps DOM
})

it('manifest sensitive:undefined + DOM password → isSensitive = true', () => {
  const el = document.createElement('input')
  el.type = 'password'
  expect(isSensitive(el, undefined)).toBe(true)
})
```

**4. Bootstrap 게이트 제거 테스트**

`buildBootstrapSource()` 수정 후:
- 기존 `hasAnnotations()` 코드 경로가 없음을 확인
- manifest 없는 페이지에서 runtime이 `idle` 상태로 부팅됨을 확인
- `window.__agrune_manifest__` 주입 시 runtime이 활성화됨을 확인

이는 jsdom으로 직접 테스트 불가 (bootstrap source는 browser globals 필요) → Playwright e2e에서 확인하거나 별도 fixture HTML 파일 사용.

**5. validate CLI 테스트**

외부 사이트 의존성 없이 재현 가능하게:
```typescript
// packages/e2e/tests/manifest-validate.spec.ts
test('validate CLI — local fixture page', async ({ page }) => {
  // packages/e2e/fixtures/validate-test.html 사용
  const { exitCode, stdout } = await runCli([
    'manifest', 'validate',
    'fixtures/test-manifest.json',
    '--url', `file://${fixtureHtmlPath}`,
  ])
  expect(exitCode).toBe(0)
  expect(stdout).toContain('All')
})

test('validate CLI — missing selector 실패 보고', async () => {
  const { exitCode, stderr } = await runCli([
    'manifest', 'validate',
    'fixtures/missing-target-manifest.json',
    '--url', `file://${fixtureHtmlPath}`,
  ])
  expect(exitCode).toBe(1)
  expect(stderr).toContain('not found')
})
```

**재현 가능성 확보 방법:**
- `packages/e2e/fixtures/validate-test.html` — static HTML에 알려진 ARIA role, testId, text 포함
- `fixtures/test-manifest.json`, `fixtures/missing-target-manifest.json` — 두 가지 fixture manifest
- 외부 URL 의존 없음 → CI에서 항상 동일한 결과

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.7.0 (기존 통일) | 타입 안전 builders | 기존 프로젝트 전체 TS 5.7 사용 [VERIFIED] |
| zod | ^4.3.6 (기존 mcp) | manifest schema runtime validation | 이미 `@agrune/mcp` 의존성 [VERIFIED] |
| tsup | ^8.0.0 (기존 통일) | ESM 빌드 | 전체 monorepo 표준 [VERIFIED] |
| vitest | ^4.0.0 (기존 통일) | 단위 테스트 | 전체 monorepo 표준 [VERIFIED] |
| @playwright/test | 1.59.1 (기존 e2e) | validate CLI live DOM | 이미 설치됨 [VERIFIED] |
| tsx | ^4.0.0 (기존 mcp devDep) | .ts manifest 파일 실행 | 이미 @agrune/mcp devDependency [VERIFIED] |

### 새 패키지 초기화 명령

```bash
# packages/manifest/ 신설
mkdir packages/manifest
cd packages/manifest
# package.json, tsconfig.json, tsup.config.ts는 packages/core를 템플릿으로
```

---

## Architecture Patterns

### System Architecture Diagram

```
Author 작성                    Build Time                    Runtime (browser)
    │                              │                               │
defineManifest()              zod schema                    installPageAgentRuntime()
defineTarget()                validation                          │
defineRepeat()                    │                         (manifest injected via
defineMacro()                 SelectorLadder                __agrune_manifest__ or
    │                         hash/nth-child ban            CDP preload)
    ▼                              │                               │
manifest.ts ──────────────── agrune manifest ──────────────► TargetResolver
                              validate --url                      │
                                   │                        resolveByLadder()
                              Playwright                    role > text > testId
                              live DOM                      > stable attr > CSS
                              selector match                      │
                                   │                        isSensitive()
                              pass/fail report              (manifest OR DOM)
                                                                  │
                                                            PageSnapshot
                                                            (targets resolved)
```

### bootstrap 게이트 제거 전후 비교

```
[Before]                           [After]
bootstrap()                        bootstrap()
  └─ hasAnnotations()                └─ installRuntime()  // 항상 실행
       ├─ true  → installRuntime()         ├─ manifest 있으면 active
       └─ false → return (아무것도 안 함)  └─ manifest 없으면 idle
```

### Recommended Project Structure

```
packages/
├── manifest/                  # 신규
│   ├── src/
│   │   ├── index.ts           # builders + schema re-export
│   │   ├── schema.ts          # AgruneManifest v3 타입
│   │   ├── builders.ts        # defineManifest/Target/Repeat/Macro
│   │   └── validator.ts       # zod schema validation
│   ├── tests/
│   │   ├── builders.spec.ts
│   │   └── validator.spec.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── tsup.config.ts
│
├── core/src/
│   └── manifest.ts            # v3로 교체 (v2 타입 모두 교체)
│
├── runtime/src/runtime/
│   ├── target-resolver.ts     # 신규 — resolveByLadder, assertNoHashClass 등
│   └── snapshot.ts            # collectDescriptors → v3 manifest 지원
│
├── browser/src/
│   └── cdp-runtime-injector.ts  # bootstrap 게이트 제거
│
└── mcp/
    ├── bin/agrune-mcp.ts      # manifest 서브커맨드 분기 추가
    └── src/
        └── manifest-validate-cli.ts  # 신규
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema runtime validation | 직접 if/switch 타입 체크 | zod | 이미 프로젝트에 있음, 에러 메시지 품질 |
| .ts 파일 실행 (validate CLI) | ts-morph AST 실행 | tsx subprocess | 가장 단순, 이미 devDep으로 존재 |
| Live DOM 로딩 (validate) | fetch + DOMParser | Playwright | JS 실행, SPA 지원, 이미 프로젝트에 있음 |
| Accessible name 계산 | 전체 AccName 알고리즘 | aria-label + textContent 체인 | 외부 라이브러리 의존 없이 충분한 커버리지 |
| Monorepo 패키지 링킹 | symlink 수동 관리 | pnpm workspace:* | 기존 패턴 [VERIFIED] |

---

## Common Pitfalls

### Pitfall 1: v2 manifest 참조가 런타임에 남아있음
**What goes wrong:** `@agrune/core`의 `AgruneManifest.version: 2`를 v3로 교체하면 기존 manifest를 생성하던 `buildManifest()`(manifest-builder.ts)가 `version: 2`를 반환해 타입 에러 발생.
**Why it happens:** `buildManifest()`는 inline scan용으로 여전히 사용 중 (Phase 17까지).
**How to avoid:** `buildManifest()`도 `version: 3`을 반환하도록 수정. 단, `SelectorLadder` 구조를 지원하려면 내부 selector 생성 로직도 수정 필요. 가장 단순한 방법: `buildManifest()`가 반환하는 타입을 별도 `LegacyManifest` 또는 `AgruneManifestV2`로 분리하고, Phase 17까지 runtime이 두 타입 모두 수용.
**Warning signs:** `collectDescriptors()`에서 `tool.action` 필드 접근 시 타입 에러.

### Pitfall 2: SelectorLadder css 필드에 Tailwind utility class가 들어옴
**What goes wrong:** `css: '.flex.items-center.w-full'`처럼 Tailwind class를 넣으면 해시 class 패턴 검사에서 오탐 (8자 이상 alphanumeric 조건).
**Why it happens:** `items-center`, `bg-blue-500` 등은 해시가 아니지만 패턴이 겹침.
**How to avoid:** 해시 class 패턴을 더 정밀하게 설계: 순수 alphanumeric (하이픈 없음) 8자 이상만 금지. `/\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/` 패턴 사용.
**Warning signs:** Tailwind 프로젝트의 manifest에서 불필요한 validate 실패.

### Pitfall 3: validate CLI가 SPA route를 너무 일찍 검사
**What goes wrong:** `page.goto(url, { waitUntil: 'networkidle' })`로도 React SPA가 완전히 렌더링되기 전에 selector 검사가 실행됨.
**Why it happens:** `networkidle`은 네트워크 기준이지, JS 렌더링 기준이 아님.
**How to avoid:** `waitUntil: 'networkidle'` + `page.waitForTimeout(500)` 또는 `page.waitForSelector('body', { state: 'attached' })`. 더 나은 방법: CLI에 `--wait-selector <css>` 옵션 추가.
**Warning signs:** 로컬 fixture는 통과하는데 실제 SPA에서 실패.

### Pitfall 4: bootstrap 제거 후 live scan이 0개 target 반환
**What goes wrong:** bootstrap 게이트 제거 후 빈 manifest로 runtime이 뜨면 `collectLiveDescriptors()`도 `data-agrune-action`이 없어서 0개를 반환. 기존 inline-annotated app이 동작 중단.
**Why it happens:** Phase 11은 게이트만 제거하고 live scan은 유지해야 하는데, 둘이 결합되어 있음.
**How to avoid:** `collectLiveDescriptors()`는 Phase 11에서 제거하지 않는다. 게이트 제거 = `hasAnnotations()` 체크 제거. Live scan 경로는 Phase 17까지 유지.
**Warning signs:** 기존 inline-annotated demo app에서 snapshot이 빈 groups 반환.

### Pitfall 5: `sensitive: false` JSON manifest에서 조용히 통과
**What goes wrong:** zod schema에 `z.literal(true).optional()`로 `false`를 차단해도, JSON manifest를 직접 import하면 zod 검증을 우회할 수 있음.
**Why it happens:** TypeScript 타입 체크는 컴파일 타임에만, JSON은 런타임에 parse.
**How to avoid:** validate CLI에서 항상 zod `ManifestSchema.parse()` 실행 (TypeScript 타입과 별개). Runtime 주입 시에도 schema 검증 후 주입.
**Warning signs:** `sensitive: false`가 있는 manifest가 validate CLI를 통과하는 경우.

---

## Runtime State Inventory

Phase 11은 신규 패키지 추가 + 기존 패키지 수정. rename/refactor 아님.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | 없음 | — |
| Live service config | 없음 | — |
| OS-registered state | 없음 | — |
| Secrets/env vars | 없음 | — |
| Build artifacts | `packages/browser/dist/page-runtime.global.js` — bootstrap source 포함 | `pnpm build` 재실행 필요 (자동) |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 모든 패키지 빌드/테스트 | ✓ | v24.7.0 | — |
| pnpm | monorepo 패키지 관리 | ✓ | 10.23.0 (package.json) | — |
| TypeScript | @agrune/manifest 빌드 | ✓ | ^5.7.0 (기존) | — |
| Playwright (chromium) | validate CLI live DOM | ✓ | 1.59.1 | — |
| tsx | .ts manifest 파일 실행 | ✓ (mcp devDep) | ^4.0.0 | JSON-only manifest |
| zod | schema validation | ✓ | ^4.3.6 (기존 mcp) | — |
| vitest | 단위 테스트 | ✓ | ^4.0.0 (기존) | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.0 |
| Config file | 각 패키지별 vitest.config.ts (없으면 package.json scripts.test 직접 실행) |
| Quick run command | `pnpm --filter @agrune/manifest run test` |
| Full suite command | `pnpm -r --filter "@agrune/*" --if-present run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MANIFEST-01 | `defineTarget` TS 타입 안전성 | unit | `pnpm --filter @agrune/manifest run test` | ❌ Wave 0 |
| MANIFEST-02 | `defineRepeat` schema 필드 | unit | `pnpm --filter @agrune/manifest run test` | ❌ Wave 0 |
| MANIFEST-03 | `defineMacro` schema 필드 | unit | `pnpm --filter @agrune/manifest run test` | ❌ Wave 0 |
| MANIFEST-04 | sensitive OR-only — false 차단 | unit | `pnpm --filter @agrune/manifest run test` | ❌ Wave 0 |
| MANIFEST-05 | validate CLI selector match | e2e | `pnpm --filter @agrune/e2e run test:e2e` | ❌ Wave 0 |
| RESOLVE-02 | role > text > testId > attr > CSS priority | unit (jsdom) | `pnpm --filter @agrune/runtime run test` | ❌ Wave 0 |
| RESOLVE-04 | manifest 없이 항상 부팅, idle 상태 | unit (jsdom) | `pnpm --filter @agrune/runtime run test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @agrune/manifest run test && pnpm --filter @agrune/runtime run test`
- **Per wave merge:** `pnpm -r --filter "@agrune/*" --if-present run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/manifest/tests/builders.spec.ts` — REQ MANIFEST-01, 02, 03, 04
- [ ] `packages/manifest/tests/validator.spec.ts` — REQ MANIFEST-04 (zod schema)
- [ ] `packages/runtime/tests/target-resolver.spec.ts` — REQ RESOLVE-02
- [ ] `packages/runtime/tests/bootstrap-gate.spec.ts` — REQ RESOLVE-04
- [ ] `packages/e2e/tests/manifest-validate.spec.ts` — REQ MANIFEST-05
- [ ] `packages/e2e/fixtures/validate-test.html` — validate CLI fixture HTML
- [ ] Framework 설치: `packages/manifest/`는 신규 패키지이므로 `pnpm install` 필요

---

## Open Questions (RESOLVED)

1. **v3 manifest를 `@agrune/core`에서 관리할 것인가 vs `@agrune/manifest`에서 re-export할 것인가?**
   - RESOLVED: v3 manifest 인터페이스는 `@agrune/core`에 유지한다. `@agrune/manifest`는 core 타입을 사용하는 builder/validator 레이어. runtime → core 의존만 유지 (Plan 11-03 Task 1 채택).

2. **`defineRepeat`의 `keyFrom` 필드 — 함수 or 문자열?**
   - RESOLVED: Phase 11 scope에서는 **string만** 지원. TypeScript builder 타입은 `string` 필드(예: `"el.dataset.postId"`)로 받고, 함수 형태(`el => el.dataset.postId`) 지원은 Phase 15(REPEAT)에서 도입. JSON manifest 직렬화도 Phase 15로 연기 (Plan 11-01 schema 반영).

3. **`agrune manifest validate` — `--url` 없이 파일만 있을 때 동작?**
   - RESOLVED: URL 없으면 schema-only validation. `--url` 지정 시 schema + live DOM 검증. 두 단계 분리 (Plan 11-05 채택).

4. **`buildManifest()` (v2 manifest-builder.ts) — Phase 11에서 임시 v3 반환하도록 수정?**
   - RESOLVED: `buildManifest()`가 `AgruneManifest` (v3 타입)를 반환하도록 Phase 11에서 수정. 내부 구현은 inline scan 결과를 SelectorLadder 구조로 wrapping (`css` 필드 사용). Phase 17에서 완전 제거까지 runtime은 v3 하나만 처리 (Plan 11-03 Task 2 채택).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Playwright `page.goto()` + `networkidle`이 외부 사이트 SPA 렌더링에 충분함 | 섹션 5 | validate CLI가 실제 사이트에서 false-negative 반환 |
| A2 | `getComputedAccessibleName()` 브라우저 API는 실험적이므로 수동 구현이 필요 | 섹션 4 | 브라우저 지원이 충분하면 더 간단한 구현 가능 |
| A3 | `tsx` subprocess로 `.ts` manifest를 실행하는 것이 충분히 빠름 (< 5초) | 섹션 5 | startup latency가 UX 문제가 될 수 있음 → 대안: jiti |
| A4 | text selector에서 `button, a, label` 등 interactive elements만 검색하면 충분 | 섹션 4 | non-interactive 커스텀 컴포넌트를 놓칠 수 있음 |
| A5 | `packages/manifest/`는 `publishConfig.access: 'public'` — 외부 배포 대상 | 섹션 1 | internal-only라면 private:true로 변경 |

---

## Sources

### Primary (HIGH confidence)
- `packages/core/src/manifest.ts` — v2 schema 전체 확인
- `packages/browser/src/cdp-runtime-injector.ts` — bootstrap 게이트 정확한 위치/로직 확인
- `packages/runtime/src/runtime/snapshot.ts` — collectDescriptors, collectLiveDescriptors, isSensitive 확인
- `packages/runtime/src/runtime/dom-utils.ts` — isSensitive 현재 구현 확인
- `packages/mcp/package.json`, `tsup.config.ts` — noExternal bundling 확인
- `packages/e2e/package.json` — @playwright/test 1.59.1 설치 확인
- `packages/mcp/package.json` — zod ^4.3.6, tsx ^4.0.0 설치 확인

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — MANIFEST/RESOLVE req 상세 요구사항
- `.planning/ROADMAP.md` — Phase 11 success criteria 전체
- `.planning/STATE.md` — 2026-04-19 결정 사항 (breaking change, sensitive OR-only)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 기존 프로젝트 의존성 전부 직접 확인
- Architecture: HIGH — 모든 관련 소스 파일 직접 읽음
- Pitfalls: MEDIUM — 코드 확인 기반, 실행 전 가설

**Research date:** 2026-04-19
**Valid until:** 30일 (TypeScript 5.x, zod 4.x, Playwright 1.x — stable)

---

## RESEARCH COMPLETE
