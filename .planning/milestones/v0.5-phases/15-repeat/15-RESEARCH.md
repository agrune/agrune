# Phase 15: REPEAT - Research

**Researched:** 2026-04-19
**Domain:** Dynamic list runtime expansion — ManifestRepeat → RepeatExpander → snapshot enrichment
**Confidence:** HIGH (모든 upstream 코드 직접 확인)

---

## Summary

Phase 15는 `ManifestRepeat` 스키마(Phase 11에서 완성)를 런타임에서 실제로 평가하는 **RepeatExpander** 레이어를 도입한다. 핵심 과제는 세 가지다: (1) `keyFrom` JS expression string을 브라우저 런타임에서 안전하게 평가해 stable key를 추출하고, (2) `strategy: 'dom'`과 `strategy: 'virtualized'`의 element enumeration 경로를 분리하며, (3) snapshot에 `repeatInstance: { index, key }` 필드를 per-target으로 추가해 AI 에이전트가 `login.items[postId=abc123]` 스타일 경로로 인스턴스를 타겟할 수 있게 한다.

현재 `snapshot.ts`의 `collectDescriptors`는 이미 `group.repeats[].targets[]`를 순회해 flat descriptor 목록을 만들지만, 인스턴스 개수·stable key·`aria-rowcount` hint는 전혀 반영하지 않는다. Phase 15는 이 평탄화 경로를 RepeatExpander 경유로 교체한다. `PageSnapshot` shape에 `repeats` 최상위 필드를 추가하거나 `PageTarget`에 `repeatInstance` 필드를 추가해야 하며, 이는 **additive breaking change** (schemaVersion은 3으로 유지, 필드만 추가)다.

validate CLI의 `keyFrom` 누락 검사 강화는 `validator.ts`에서 RepeatSchema 추가 검증으로 구현한다. `new Function('el', expr)` 패턴은 macro-runner의 `evalExpr`에서 이미 확립되어 있으므로 동일 패턴을 따른다.

**Primary recommendation:** `RepeatExpander` 신규 클래스를 `packages/runtime/src/runtime/repeat-expander.ts`에 생성, `snapshot.ts`의 `collectDescriptors` → `makeSnapshot` 경로를 RepeatExpander 경유로 확장. `PageTarget`에 `repeatInstance?: { index: number; key: string }` optional 필드 추가 (additive).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Upstream Phase 11-14 (locked):**
- Phase 11: `defineRepeat` schema — `{ repeatId, template, keyFrom: string, nameFrom?, strategy: 'dom'|'virtualized', targets: ManifestTarget[] }`
- Phase 11-05: `agrune manifest validate` CLI — `validateManifest()` → schema first, DOM second
- Phase 12: PageSnapshot v3 — `PageTarget.selector: SelectorLadder`, `schemaVersion: 3`
- Phase 13: FiberIdentityIndex — Phase 15 scope에서 사용 안 함 (fiber data-state v0.6+)
- Phase 14: MacroRunner — macro step이 repeat instance target 참조 가능

**Key constraint (2026-04-19 memo):**
- `keyFrom`은 string만 (JS expression string). Phase 15에서 함수 형태 지원 없음
- virtualized: 스크롤 아웃된 row 접근 시 명시적 에러. AI는 `aria-rowcount`/`aria-setsize` hint로 logical size 파악

### Claude's Discretion

모든 구현 선택은 Claude 재량 (RepeatExpander 내부 구조, snapshot 확장 방식, 에러 메시지 포맷 등).

### Deferred Ideas (OUT OF SCOPE)

- Fiber data-state 기반 virtualization (React Virtual, TanStack Virtual) → v0.6+
- `keyFrom` 함수 지원 → v0.6+
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REPEAT-01 | `defineRepeat` runtime expander — DOM enumerate + textContent anchor로 N 인스턴스 snapshot | RepeatExpander.expand() 설계, `collectDescriptors` 확장 지점 확인 |
| REPEAT-02 | `strategy: 'dom'\|'virtualized'` — virtualized는 viewport 내 row + `aria-rowcount`/`aria-setsize` logical-size hint | 두 전략 분기 구현 방법, ARIA hint inject 지점 |
| REPEAT-03 | Snapshot group의 `repeatInstance` 필드로 인스턴스 식별 | `PageTarget` + `PageSnapshot` additive 확장, `PageSnapshotGroup.repeats` 추가 |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `keyFrom` expr 평가 | Browser (page runtime) | — | DOM element (`el`)에 접근해야 하므로 런타임 내부에서만 평가 가능 |
| DOM strategy enumeration | Browser (page runtime) | — | `querySelectorAll`은 DOM API, Node.js에서 실행 불가 |
| Virtualized row 감지 | Browser (page runtime) | — | `isElementInViewport` 등 DOM util이 이미 runtime에 존재 |
| `aria-rowcount` hint inject | Browser (page runtime) | — | DOM mutation이므로 런타임 레이어 |
| stable key 누락 검증 | CLI (manifest-validate-cli) | validate-manifest | 빌드 타임 gate — author가 keyFrom으로 key 추출 불가한 경우 차단 |
| `repeatInstance` snapshot 필드 | Browser (page runtime) → MCP | — | snapshot.ts에서 생성, MCP `toPublicTarget`은 현재 selector를 제외하므로 repeatInstance 노출 정책 결정 필요 |
| out-of-range 에러 | Browser (page runtime) | — | `resolveRuntimeTarget` 확장 또는 command handler — target not found 시 에러 코드 반환 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@agrune/manifest` | workspace:* | `ManifestRepeat` 타입, `defineRepeat` builder | Phase 11 완성, RepeatExpander가 직접 consume |
| `@agrune/core` | workspace:* | `PageTarget`, `PageSnapshot`, `CommandErrorCode` | 타입 계약 — additive 필드 추가 대상 |
| `@agrune/runtime` | workspace:* | `snapshot.ts`, `target-resolver.ts` | RepeatExpander가 여기 위치 |
| `jsdom` | `^27.2.0` | vitest unit test 환경 | runtime의 기존 devDep — repeat 테스트도 동일 환경 |
| `vitest` | workspace | unit test runner | runtime package 기존 설정 재사용 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `new Function(arg, expr)` | Native JS | `keyFrom` sandboxed eval | DOM strategy에서 각 `el`에 대해 key 추출 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `new Function('el', expr)` | `eval(expr)` | `eval`은 caller scope 변수 접근 가능 — 보안 취약. new Function 격리 필수 |
| additive field on PageTarget | 별도 `RepeatSnapshot` 타입 | 별도 타입은 consumer(MCP, devtools) 전면 수정 필요 — additive optional field가 비용 최소 |

---

## Architecture Patterns

### System Architecture Diagram

```
[manifest.groups[].repeats[]]
         |
         v
[RepeatExpander.expand(repeat, container?)]
         |
    .---------+-----------.
    |                     |
 strategy='dom'    strategy='virtualized'
    |                     |
querySelectorAll    querySelectorAll(viewport only)
 (전체 DOM)          + aria-rowcount/setsize read
    |                     |
    '---------+----------'
              |
     { el, key, index }[] per instance
              |
              v
  [collectDescriptors 확장] — per-instance TargetDescriptor 생성
  (descriptor.repeatInstance = { index, key })
              |
              v
  [captureTarget()] — 기존 로직 + repeatInstance passthrough
              |
              v
  [PageTarget.repeatInstance?: { index, key }]  ← additive 필드
  [PageSnapshot.groups[].repeats?: [{ repeatId, instanceCount, logicalSize? }]]  ← additive
              |
              v
  [resolveRuntimeTarget] — "posts__repeatKey_abc123" 형식 targetId 파싱
              |
              v
  [MCP agrune_act / agrune_fill] — targetId로 인스턴스 직접 조작
```

### Recommended Project Structure

```
packages/runtime/src/runtime/
├── repeat-expander.ts    # 신규 — RepeatExpander 클래스
├── snapshot.ts           # 수정 — collectDescriptors + makeSnapshot repeat 확장
├── target-resolver.ts    # 수정 — stable key 기반 targetId 파싱
└── ...

packages/core/src/
└── index.ts              # 수정 — PageTarget.repeatInstance, PageSnapshotGroup.repeats 추가

packages/manifest/src/
└── validator.ts          # 수정 — keyFrom 누락/빈 문자열 검증 강화

packages/mcp/src/
└── manifest-validate-cli.ts  # 수정 — stable key 검증 실패 → exit 1
```

### Pattern 1: RepeatExpander — DOM strategy

```typescript
// packages/runtime/src/runtime/repeat-expander.ts
export interface RepeatInstance {
  el: HTMLElement
  key: string
  index: number
}

export class RepeatExpander {
  expand(repeat: ManifestRepeat, container?: HTMLElement): RepeatInstance[] {
    const scope = container ?? document
    const elements = Array.from(
      scope.querySelectorAll<HTMLElement>(repeat.selector?.css ?? '*')
    )
    // keyFrom: "el.dataset.postId" 형태
    const keyFn = new Function('el', `return String(${repeat.keyFrom})`) as
      (el: HTMLElement) => string

    return elements.map((el, index) => {
      let key: string
      try {
        key = keyFn(el)
      } catch {
        key = `__idx_${index}`  // fallback — validator가 빌드 타임에 차단했어야 함
      }
      return { el, key, index }
    })
  }
}
```

**핵심 설계 고려:** `repeat.template`은 `"post_${key}"`처럼 key를 embed한 targetId prefix다. 실제 element 기반 CSS selector(어떤 elements를 querySelectorAll로 찾을지)는 현재 `ManifestRepeat` 스키마에 명시적 `containerSelector`가 없다. `targets[0].selector`를 container lookup 힌트로 쓰거나, **별도 `containerSelector` 필드를 ManifestRepeat에 추가하는 방안** 중 하나를 선택해야 한다. 현재 코드에서 `collectDescriptors`는 `repeat.targets[].selector`를 flat하게 다루는데, 이는 "repeat container 안의 각 row element"를 찾는 게 아니라 "template target을 개별 선택자로 찾는" 방식이다. **RepeatExpander가 row container element를 찾는 방법이 스키마에 아직 명시되어 있지 않다** — 이것이 Phase 15의 가장 중요한 설계 결정이다.

**두 가지 접근:**
- **접근 A**: `ManifestRepeat`에 `containerSelector: SelectorLadder` 추가 (Phase 11 스키마 수정 필요)
- **접근 B**: `repeat.targets[0].selector`를 row element selector로 활용 — 각 target selector가 각 row-level element를 찾는다고 간주

접근 B가 스키마 수정 없이 구현 가능하지만 의미적으로 불명확하다. 접근 A가 더 명확하나 Phase 11 스키마(완성됨)를 건드린다.

### Pattern 2: RepeatExpander — Virtualized strategy

```typescript
expandVirtualized(repeat: ManifestRepeat, container?: HTMLElement): {
  instances: RepeatInstance[]
  logicalSize: number | null
} {
  const scope = container ?? document
  // viewport 내에 렌더된 row만
  const allEls = Array.from(scope.querySelectorAll<HTMLElement>(containerCss))
  const viewportEls = allEls.filter(el => isElementInViewport(el))

  // logical size: aria-rowcount > aria-setsize > null
  const listEl = scope.querySelector<HTMLElement>('[aria-rowcount]')
    ?? scope.querySelector<HTMLElement>('[role="listbox"], [role="list"]')
  const logicalSize = listEl
    ? (parseInt(listEl.getAttribute('aria-rowcount') ?? '', 10) || null)
    : null

  const keyFn = new Function('el', `return String(${repeat.keyFrom})`) as
    (el: HTMLElement) => string

  const instances = viewportEls.map((el, index) => ({
    el,
    key: safeEval(keyFn, el, index),
    index,
  }))
  return { instances, logicalSize }
}
```

### Pattern 3: stable key 기반 targetId 인코딩

현재 `REPEATED_TARGET_ID_DELIMITER = '__agrune_idx_'`가 index 기반 suffix로 이미 존재한다. Phase 15는 이를 **stable key 기반**으로 교체 또는 병행해야 한다.

```
// 기존 (index-only — CONTEXT에서 "취약하다"고 금지)
post_click__agrune_idx_0

// 제안: stable key suffix
posts__repeatKey_abc123__post_click
// 또는 AI-readable 경로 형식
posts[postId=abc123].post_click
```

`resolveRuntimeTarget`이 이 targetId를 파싱해 repeatId + key + baseTargetId 세 부분으로 분해해야 한다.

### Anti-Patterns to Avoid

- **index-only targetId**: `post_click__agrune_idx_0` — reorder 후 다른 element를 가리킴. validate CLI가 keyFrom 없으면 빌드 실패로 차단해야 함
- **eval() 직접 사용**: caller scope 변수 접근 가능, `new Function` 격리 필수
- **container 없이 전체 document querySelectorAll**: 관련 없는 element 오매치 위험 — container 범위 한정 필수
- **RepeatExpander에서 DOM mutation**: snapshot은 read-only 관찰이어야 함. `aria-rowcount` inject는 virtualized에서만, element가 이미 해당 attribute 없을 때만

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS selector 유효성 검사 | 직접 regex 파싱 | `document.querySelector` try/catch | 브라우저가 파싱 에러를 DOMException으로 던짐 |
| keyFrom sandbox eval | `eval()` | `new Function('el', expr)` | Phase 14 macro-runner에서 동일 패턴 확립 |
| viewport 체크 | `getBoundingClientRect` 직접 계산 | `isElementInViewport(el)` (dom-utils.ts) | 이미 runtime에 구현됨 |
| aria attribute 읽기 | 직접 정수 파싱 | `parseInt(el.getAttribute('aria-rowcount'))` | 표준 DOM API, 별도 라이브러리 불필요 |

---

## Runtime State Inventory

> Phase 15는 greenfield 런타임 기능 추가 (신규 파일 + 기존 파일 확장). rename/refactor 아님.

해당 없음.

---

## Common Pitfalls

### Pitfall 1: RepeatExpander에 container selector 스키마 없음

**What goes wrong:** `ManifestRepeat` 현재 스키마에 "어떤 elements가 각 row인가"를 지정하는 필드가 없다. `targets[].selector`는 row 내부의 특정 action target을 가리키는 것이지, row element 자체를 찾는 selector가 아니다.

**Why it happens:** Phase 11 스키마는 "template/keyFrom/strategy" 레벨만 정의하고 container enumeration 방법을 열어뒀다.

**How to avoid:** 두 가지 선택 중 하나를 명시적으로 결정:
- **선택 A**: `ManifestRepeat.containerSelector: SelectorLadder` 추가 (Phase 11 breaking extension — zod schema 수정)
- **선택 B**: `keyFrom`이 `el.dataset.postId`처럼 row element를 직접 지정한다고 간주하고, `repeat.targets[0].selector`가 각 row element를 찾는 selector라고 규약화

**Warning signs:** "querySelectorAll이 전체 페이지에서 매치되어 같은 element가 여러 repeat에 포함됨"이면 container scope 없음 신호.

### Pitfall 2: `new Function` + strict CSP 환경

**What goes wrong:** `Content-Security-Policy: script-src 'self'`이 `unsafe-eval` 없이 설정된 페이지에서 `new Function()` 호출이 `EvalError` 던짐.

**Why it happens:** `new Function`은 `eval`과 동일하게 CSP의 `unsafe-eval` 없으면 차단.

**How to avoid:** 
1. Runtime sandbox check: `try { new Function('return 1')() } catch` → 실패 시 `REPEAT_EVAL_BLOCKED` 에러로 graceful fallback
2. keyFrom validation에서 "CSP-safe subset" (property access chain만 허용, e.g., `el.dataset.postId`) 권장 문서화
3. validate CLI에서 복잡한 expression (함수 호출, 연산자 등) 경고

**Warning signs:** runtime에서 `EvalError: Refused to evaluate a string as JavaScript`.

### Pitfall 3: stable key 중복

**What goes wrong:** 두 row element가 같은 keyFrom 결과를 반환 → targetId 충돌 → snapshot에서 하나가 덮어씌워짐.

**Why it happens:** 페이지가 de-dup되지 않은 data-* attribute를 가지거나 keyFrom expression이 uniqueness를 보장하지 않음.

**How to avoid:** RepeatExpander가 중복 key 감지 시 `console.warn` + index suffix fallback (`key + '__dup_' + index`).

**Warning signs:** snapshot targets 개수 < DOM row 개수.

### Pitfall 4: Virtualized list의 DOM-stable selector 없음

**What goes wrong:** React Virtual / TanStack Virtual 같은 virtualized list는 스크롤 시 DOM node를 재사용(recycle)한다. 스크롤 후 같은 element.dataset.postId가 다른 데이터를 보여줄 수 있음.

**Why it happens:** DOM recycling — 물리적 node 수는 일정하고 내용만 교체.

**How to avoid:** Phase 15 scope에서는 "현재 viewport에 보이는 row의 keyFrom을 찍는 시점"을 snapshot 시점으로 한정. 스크롤 후 재snapshot 요구. AI에게 `logicalSize` hint 제공으로 "현재 N개 row만 접근 가능" 명시.

**Warning signs:** keyFrom이 같은 key를 연속으로 반환하면서 DOM 내용이 다름.

### Pitfall 5: `aria-rowcount` inject → 다른 ARIA tool 충돌

**What goes wrong:** RepeatExpander가 `aria-rowcount`를 container element에 set하면 페이지의 기존 ARIA 트리와 충돌할 수 있음.

**How to avoid:** inject 전 attribute 존재 여부 확인 (`el.hasAttribute('aria-rowcount')`). 이미 있으면 값을 읽기만 하고 쓰지 않음. 없을 때만 hint inject.

---

## Code Examples

### keyFrom 안전 평가 패턴

```typescript
// [VERIFIED: packages/runtime/src/runtime/macro-runner.ts lines 224-244]
// macro-runner.ts의 evalExpr 패턴을 keyFrom에 적용
function evalKeyFrom(expr: string, el: HTMLElement): { ok: true; key: string } | { ok: false; error: string } {
  try {
    // 'el'만 노출 — 나머지 identifier는 ReferenceError
    const fn = new Function('el', `return String(${expr})`) as (el: HTMLElement) => string
    const key = fn(el)
    return { ok: true, key }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

### PageTarget additive 확장 (additive — schemaVersion 3 유지)

```typescript
// [VERIFIED: packages/core/src/index.ts line 79-104] — 현재 PageTarget
// Phase 15에서 추가할 optional 필드:
export interface PageTarget {
  // ... 기존 필드 유지 ...
  /** Repeat instance context — defined only for targets from ManifestRepeat expansion */
  repeatInstance?: {
    repeatId: string
    index: number
    key: string
  }
}
```

### PageSnapshotGroup additive 확장

```typescript
// [VERIFIED: packages/core/src/index.ts line 70-77] — 현재 PageSnapshotGroup
export interface PageSnapshotGroup {
  // ... 기존 필드 유지 ...
  /** Repeat summary for this group — AI가 logical size와 가시 instance count 파악 */
  repeats?: Array<{
    repeatId: string
    strategy: 'dom' | 'virtualized'
    instanceCount: number    // 현재 snapshot에 포함된 instance 수
    logicalSize: number | null  // aria-rowcount 등 hint, null=알 수 없음
  }>
}
```

### collectDescriptors 확장 지점

```typescript
// [VERIFIED: packages/runtime/src/runtime/snapshot.ts lines 105-136]
// 현재 repeat 처리: repeat.targets[]를 flat descriptor로 변환 (인스턴스 미구분)
for (const repeat of group.repeats ?? []) {
  for (const target of repeat.targets) {
    // Phase 15: RepeatExpander.expand(repeat) → instances[]
    // 각 instance * 각 target → descriptor (with repeatInstance metadata)
    result.push({
      actionKinds: ...,
      groupId: group.groupId,
      target,
      // 추가:
      repeatInstance: { repeatId: repeat.id, index: instance.index, key: instance.key }
    })
  }
}
```

### validate CLI — stable key 누락 검증

```typescript
// [VERIFIED: packages/manifest/src/validator.ts lines 111-133]
// validateManifest의 ladderErrors 블록 이후에 추가:
parsed.data.groups.forEach((group, gi) => {
  group.repeats?.forEach((repeat, ri) => {
    if (!repeat.keyFrom || repeat.keyFrom.trim() === '') {
      ladderErrors.push({
        path: `groups[${gi}].repeats[${ri}]`,
        message: `repeatId="${repeat.repeatId}": keyFrom is required. Index-only identification is forbidden (reorder-vulnerable).`
      })
    }
  })
})
```

### out-of-range 에러 처리

```typescript
// resolveRuntimeTarget 확장 — virtualized에서 out-of-range 요청 시
// packages/core/src/index.ts의 COMMAND_ERROR_CODES에 추가:
'REPEAT_INDEX_OUT_OF_RANGE',  // Phase 15

// 에러 반환 지점: snapshot.ts resolveRuntimeTarget 또는 command-handlers.ts
if (repeatInstance && repeatInstance.index >= visibleCount) {
  return buildErrorResult(
    commandId,
    'REPEAT_INDEX_OUT_OF_RANGE',
    `repeat "${repeatId}" index ${requestedIndex} out of range: only ${visibleCount} instances visible. Logical size: ${logicalSize ?? 'unknown'}.`,
    snapshot,
    targetId
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `REPEATED_TARGET_ID_DELIMITER = '__agrune_idx_'` (index-only) | stable key 기반 targetId (Phase 15) | Phase 15 | reorder-safe, AI-predictable |
| flat descriptor (인스턴스 미구분) | RepeatExpander 경유 per-instance descriptor | Phase 15 | N instance × M targets snapshot |
| `aria-rowcount`/`aria-setsize` 미사용 | logicalSize hint → PageSnapshotGroup.repeats | Phase 15 | AI가 scroll-out 데이터 크기 파악 가능 |

**현재 코드베이스에서 이미 존재하는 기반:**
- `REPEATED_TARGET_ID_DELIMITER` + `toRuntimeTargetId` + `parseRuntimeTargetId` — index 기반이지만 Phase 15에서 key 기반으로 대체/확장 가능한 인프라
- `isElementInViewport` in `dom-utils.ts` — virtualized row filtering에 재사용
- `new Function('params', expr)` pattern in `macro-runner.ts` — keyFrom eval에 직접 적용

---

## Design Decisions Required (플래너가 결정해야 할 사항)

Phase 15 실행 전 두 가지 설계 결정이 필요하다. 플래너가 PLAN에서 하나를 선택해야 한다.

### 결정 1: RepeatExpander의 row element 열거 방식

**선택 A**: `ManifestRepeat`에 `containerSelector: SelectorLadder` optional 필드 추가
- 장점: 명확한 계약, "어떤 elements가 row인가"가 manifest에 명시
- 단점: Phase 11 스키마 수정 (zod + TypeScript 타입 모두)

**선택 B**: `repeat.targets`의 각 target이 row-scoped selector를 가진다고 규약화하고, RepeatExpander는 `keyFrom`에서 el 접근 방식으로 container를 암묵적으로 특정
- 단점: "repeat의 row element를 찾는 selector"가 manifest에 없음 → keyFrom eval이 null/undefined를 반환하는 경우 fallback 없음

**권장**: 선택 A (명시적 `containerSelector: SelectorLadder` 추가). Phase 11 스키마 zod 수정은 `RepeatSchema`에 optional 필드 하나 추가이므로 범위가 작음.

### 결정 2: stable key 기반 targetId 인코딩 포맷

**선택 X**: `{repeatId}__repeatKey_{stableKey}__{baseTargetId}` (언더스코어 기반, 파싱 쉬움)

**선택 Y**: `{groupId}.{repeatId}[{keyFrom}={stableKey}].{baseTargetId}` (dot-bracket 경로, AI 가독성 높음)

**권장**: 선택 Y (AI가 `login.items[postId=abc123].like_btn` 형식으로 targetId를 유추 가능). `resolveRuntimeTarget`의 파싱 로직이 약간 복잡해지나 AI usability 향상이 더 크다.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.0 |
| Config file | `packages/runtime/vitest.config.ts` |
| Quick run command | `pnpm --filter @agrune/runtime run test -- repeat` |
| Full suite command | `pnpm --filter @agrune/runtime run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REPEAT-01 | DOM strategy expand: 10 row fixture → 10 instances with stable key | unit (jsdom) | `pnpm --filter @agrune/runtime run test -- repeat-expander` | ❌ Wave 0 |
| REPEAT-01 | keyFrom eval 실패 → graceful fallback + warn | unit | 위 동일 | ❌ Wave 0 |
| REPEAT-02 | virtualized: viewport 밖 row 제외, logicalSize = aria-rowcount | unit (jsdom) | 위 동일 | ❌ Wave 0 |
| REPEAT-02 | out-of-range index 요청 → REPEAT_INDEX_OUT_OF_RANGE 에러 | unit | `pnpm --filter @agrune/runtime run test -- snapshot` | ❌ Wave 0 |
| REPEAT-03 | snapshot target에 repeatInstance.{ index, key } 포함 | unit | 위 동일 | ❌ Wave 0 |
| REPEAT-03 | PageSnapshotGroup.repeats[] 포함 확인 | unit | 위 동일 | ❌ Wave 0 |
| REPEAT-01~03 | validate CLI — keyFrom 빈 문자열 → exit 1 | unit (manifest pkg) | `pnpm --filter @agrune/manifest run test -- validator` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @agrune/runtime run test -- repeat`
- **Per wave merge:** `pnpm --filter @agrune/runtime run test && pnpm --filter @agrune/manifest run test`
- **Phase gate:** 전체 runtime test suite (132 기존 + 신규) green

### Wave 0 Gaps

- [ ] `packages/runtime/tests/repeat-expander.spec.ts` — covers REPEAT-01, REPEAT-02
- [ ] `packages/runtime/tests/snapshot-repeat.spec.ts` — covers REPEAT-03
- [ ] `packages/core/src/index.ts` — `repeatInstance` 필드 + `REPEAT_INDEX_OUT_OF_RANGE` 에러 코드 추가

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `keyFrom` expression → `new Function` sandbox; validate CLI에서 빈 문자열 차단 |
| V6 Cryptography | no | — |

### keyFrom Expression 위협 모델

| 위협 | STRIDE | 완화 |
|------|--------|------|
| `keyFrom: "fetch('/steal?'+document.cookie)"` 삽입 | Tampering / Info Disclosure | `new Function('el', expr)` — fetch는 가능하나 **manifest는 trusted author가 작성** (T-11-21 accept 선례). validate CLI가 manifest를 빌드 전에 실행하므로 trusted boundary |
| keyFrom이 아주 긴 loop → DoS | Denial of Service | 실행 timeout 없음 — 브라우저 탭 freeze 가능. 완화: RepeatExpander에 `maxInstances` cap (e.g., 1000) |
| CSP `unsafe-eval` 없는 페이지에서 `new Function` block | Availability | try/catch → `REPEAT_EVAL_BLOCKED` 에러 코드, graceful degradation |

**Security boundary summary:** `keyFrom` expression은 manifest author가 작성한 코드다. manifest 자체의 신뢰 경계는 Phase 11에서 "author 자신의 trusted manifest" (T-11-21)로 accept되었다. 외부 사용자 입력이 `keyFrom`에 도달하는 경로 없음 — manifest는 CLI로 로드되는 정적 파일이거나 CDP preload JSON.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ManifestRepeat`에 containerSelector 필드가 없어 "row element 열거 방법"이 스키마에 미정의 | Pitfall 1, Design Decision 1 | Phase 11 SUMMARY에서 targets[].selector가 row-level이라고 명시했다면 접근 B 선택 가능 |
| A2 | Phase 15에서 `aria-rowcount` inject는 READ-ONLY (inject 없이 기존 attribute만 읽음) | Pattern 2, Pitfall 5 | inject가 필요하다면 DOM mutation tracking 주의 필요 |
| A3 | `REPEATED_TARGET_ID_DELIMITER = '__agrune_idx_'` 기존 format을 stable key 기반으로 대체 또는 병행 — 소비자(MCP) 영향 없음 (Phase 15 이전 repeat은 미사용) | Pattern 3 | 기존 repeat targetId format을 사용 중인 consumer가 있다면 breaking change |

**Table 비어있지 않음 — A1은 플래너가 결정 필요.**

---

## Open Questions

1. **RepeatExpander의 row selector 소스**
   - What we know: `ManifestRepeat.targets[].selector`는 row 내 특정 action element를 가리킴
   - What's unclear: row element 자체(container enumeration 대상)를 찾는 selector가 스키마에 없음
   - Recommendation: Phase 11 RepeatSchema에 `containerSelector?: SelectorLadder` optional 추가 (scope: tiny — RepeatSchema에 optional field 1개)

2. **`login.items[postId=abc123]` 경로 문법 — 기존 `agrune_act`에서 파싱 가능한가?**
   - What we know: `agrune_act`는 `targetId: string`을 그대로 `resolveRuntimeTarget`에 전달. `resolveRuntimeTarget`은 `parseRuntimeTargetId`를 호출해 `REPEATED_TARGET_ID_DELIMITER`로 분리
   - What's unclear: dot-bracket 문법 (`items[postId=abc123]`)을 `resolveRuntimeTarget`이 파싱하려면 파서 로직 추가 필요. 현재 MCP schema에서 `targetId`는 opaque string이므로 **파서를 runtime에 추가하는 것만으로 AI 사용 가능**
   - Recommendation: `parseRuntimeTargetId`를 확장해 bracket notation 지원. AI는 snapshot의 `repeatInstance.key`를 보고 targetId를 구성

3. **`aria-rowcount` hint inject 시점**
   - What we know: virtualized list가 이미 `aria-rowcount`를 갖고 있으면 읽기만 하면 됨
   - What's unclear: `aria-rowcount` 없는 페이지(예: YouTube feed)에서 inject 여부와 시점
   - Recommendation: Phase 15 v0.5 scope에서는 **inject 없음** — 기존 attribute 읽기만. inject는 v0.6+ 검토

---

## Environment Availability

> Phase 15는 코드/config 변경 — 외부 서비스 의존 없음. vitest/jsdom은 기존 devDep.

Step 2.6: SKIPPED (외부 dependencies 없음 — jsdom, vitest 모두 이미 installed).

---

## Sources

### Primary (HIGH confidence)

- `packages/manifest/src/schema.ts` — ManifestRepeat 타입 직접 확인 (template/keyFrom/nameFrom/strategy/targets)
- `packages/runtime/src/runtime/snapshot.ts` — collectDescriptors, captureTarget, makeSnapshot 전체 확인
- `packages/runtime/src/runtime/target-resolver.ts` — resolveByLadder, assertNoHashClass/NthChild 확인
- `packages/runtime/src/runtime/macro-runner.ts` — `new Function('params', expr)` 패턴 확인 (line 237)
- `packages/core/src/index.ts` — PageTarget, PageSnapshot, COMMAND_ERROR_CODES 확인
- `packages/manifest/src/validator.ts` — validateManifest, ladderErrors 블록 확인
- `packages/mcp/src/manifest-validate-cli.ts` — flattenTargets, keyFrom 처리 현황 확인

### Secondary (MEDIUM confidence)

- `packages/runtime/tests/v3-descriptor.spec.ts` — repeat descriptor 테스트 패턴 확인
- `.planning/phases/11-manifest/11-01-SUMMARY.md` — defineRepeat 구현 결정 사항
- `.planning/phases/11-manifest/11-05-SUMMARY.md` — validate CLI 설계 결정
- `.planning/phases/12-inject/12-01-SUMMARY.md` — PageSnapshot v3 breaking change 결정

---

## Metadata

**Confidence breakdown:**
- defineRepeat schema (Q1): HIGH — schema.ts 직접 확인
- RepeatExpander 설계 (Q2, Q3): MEDIUM — containerSelector 미정의 이슈로 A1 assumption
- keyFrom eval 보안 (Q3): HIGH — macro-runner 선례 직접 확인
- aria-rowcount hint (Q4): MEDIUM — 현재 코드에 전혀 없음, inject 범위 미결정
- Snapshot additive 확장 (Q5, Q6): HIGH — PageTarget/PageSnapshot 타입 직접 확인, additive 방식 명확
- insertPoint in snapshot.ts (Q6): HIGH — collectDescriptors + makeSnapshot 전체 확인
- validate CLI 확장 (Q7): HIGH — validator.ts ladderErrors 패턴 확인
- out-of-range 에러 레이어 (Q8): MEDIUM — COMMAND_ERROR_CODES 확인, 새 코드 추가 필요
- target path 문법 (Q9): MEDIUM — resolveRuntimeTarget 확인, bracket notation 파서 신규
- test strategy (Q10): HIGH — jsdom + vitest 기존 환경 확인

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable internal codebase)

---

## RESEARCH COMPLETE
