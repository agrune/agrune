---
phase: 11-manifest
plan: "02"
subsystem: runtime
tags: [runtime, resolver, css, selector, sensitive, dom, tdd]
requirements: [RESOLVE-02, MANIFEST-04]

dependency_graph:
  requires:
    - "packages/runtime/src/runtime/dom-utils.ts (기존 isSensitive 수정 대상)"
  provides:
    - "packages/runtime/src/runtime/target-resolver.ts — resolveByLadder, forbidden guard, computeAccessibleName"
    - "packages/runtime/src/runtime/dom-utils.ts — isSensitive(element, manifestFlag?) OR-only"
  affects:
    - "packages/runtime/src/runtime/snapshot.ts (호출자 — backward-compat 확인 완료)"
    - "Plan 11-03 (target-resolver 타입을 @agrune/core SelectorLadder로 re-map)"

tech_stack:
  added: []
  patterns:
    - "CSS ladder resolver: role > text > testId > attr > css 우선순위 DOM 쿼리"
    - "Negative lookahead regex 해시 class 판별: /\\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/"
    - "OR-only sensitive contract: manifestFlag?: true | undefined (false 타입 차단)"
    - "TDD per-task: RED(test) → GREEN(impl) → 회귀 검증"

key_files:
  created:
    - "packages/runtime/src/runtime/target-resolver.ts (221 lines)"
    - "packages/runtime/tests/target-resolver.spec.ts (175 lines, 28 tests)"
    - "packages/runtime/tests/sensitive-or-only.spec.ts (90 lines, 13 tests)"
  modified:
    - "packages/runtime/src/runtime/dom-utils.ts (isSensitive 교체)"

decisions:
  - "SelectorLadder 타입을 local 복제로 유지 — Plan 11-03이 @agrune/core 통합 담당 (parallel wave 1 제약)"
  - "computeAccessibleName: aria-label > aria-labelledby > textContent (full WAI AccName 미구현 — RESEARCH A2)"
  - "TEXT_SELECTOR_SCOPE: button/a/label + role-based only (custom non-interactive component는 edge case, RESEARCH A4)"
  - "cssEscape polyfill: CSS.escape 존재 시 사용, jsdom fallback은 quote/backslash만 이스케이프"
  - "AUTOCOMPLETE_SENSITIVE set: current-password / new-password / one-time-code / cc-number / cc-csc / cc-exp / cc-exp-month / cc-exp-year"

metrics:
  duration: "~15 minutes"
  completed: "2026-04-19"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 11 Plan 02: Runtime TargetResolver + isSensitive OR-only Summary

**One-liner:** CSS ladder resolver (role > text > testId > attr > css) with hash-class/:nth-child rejection + isSensitive(element, manifestFlag?: true | undefined) OR-only contract.

## What Was Built

### Task 1: `target-resolver.ts` (RESOLVE-02)

`packages/runtime/src/runtime/target-resolver.ts` 신규 작성. 5단계 CSS fallback ladder를 구현하며, 금지 selector를 런타임 resolve 시점에 차단한다.

**핵심 exports:**
- `resolveByLadder(ladder, doc?)` — role > text > testId > attr > css 우선순위, 상위 단계 매칭 시 하위 건너뜀
- `computeAccessibleName(element)` — aria-label → aria-labelledby referenced text → textContent 순
- `assertNoHashClass(selector)` / `assertNoNthChild(selector)` — 금지 패턴 throw
- `SelectorForbiddenError` — 금지 selector 에러 클래스
- `HASH_CLASS_PATTERN` = `/\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/` (negative lookahead로 Tailwind FP 방지)
- `NTH_CHILD_PATTERN` = `/:nth-child\(/`
- `SelectorLadder` interface (local 타입 — Plan 03에서 @agrune/core 통합 예정)

**text resolver 동작:** exact match 우선, 없으면 contains fallback. 대상 scope: `button, a, label, [role="button|link|tab|menuitem|option"]`.

**jsdom 단위 테스트 28개:** 우선순위, forbidden selector, accessible name, 패턴 상수, guard 함수 전 케이스 통과.

### Task 2: `isSensitive` OR-only (MANIFEST-04 runtime layer)

`packages/runtime/src/runtime/dom-utils.ts`의 `isSensitive` 함수를 OR-only 시그니처로 교체.

**변경 전:**
```typescript
export function isSensitive(element: HTMLElement): boolean {
  return element.getAttribute('data-agrune-sensitive') === 'true'
}
```

**변경 후:**
```typescript
export function isSensitive(
  element: HTMLElement,
  manifestFlag?: true | undefined,
): boolean { ... }
```

**OR 결합 체인:**
1. `manifestFlag === true` → 즉시 true (manifest override)
2. `element instanceof HTMLInputElement && element.type === 'password'` → true
3. `autocomplete` 속성 whitelist (AUTOCOMPLETE_SENSITIVE set) → true
4. `data-agrune-sensitive="true"` 레거시 → true (Phase 17까지 유지)
5. 모두 해당 없음 → false

**타입 계약:** `manifestFlag?: true | undefined` — `false` 인수는 TypeScript 컴파일 에러. `@ts-expect-error` 테스트로 검증.

**회귀:** `snapshot.ts`의 `isSensitive(element)` 단일 인수 호출은 optional 파라미터로 backward-compatible. 변경 없음.

## Test Results

```
Test Files  7 passed (7)
Tests      110 passed (110)
```

- `target-resolver.spec.ts`: 28 tests passed
- `sensitive-or-only.spec.ts`: 13 tests passed
- 기존 runtime.spec.ts + 4개 spec 파일: 69 tests passed (회귀 없음)
- `pnpm --filter @agrune/runtime run typecheck`: exit 0

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1: target-resolver | `59ef3e3` | `src/runtime/target-resolver.ts` (신규), `tests/target-resolver.spec.ts` (신규) |
| 2: isSensitive OR-only | `30d9fc4` | `src/runtime/dom-utils.ts` (수정), `tests/sensitive-or-only.spec.ts` (신규) |

## Deviations from Plan

None - plan executed exactly as written.

`SelectorLadder` local 타입 복제는 plan에 명시된 사항 (`Plan 02는 plan 01과 wave 1 parallel이라 @agrune/manifest 의존 불가`). Plan 03에서 통합 예정.

## Threat Coverage

Plan의 threat model 전체 mitigate 처리 완료:

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-11-07 | `assertNoHashClass` / `assertNoNthChild` — resolve 시점 `SelectorForbiddenError` throw | DONE |
| T-11-08 | `manifestFlag?: true \| undefined` 타입 차단 + runtime heuristic 2차 방어 | DONE |
| T-11-09 | autocomplete whitelist + type=password → manifest 없어도 자동 감지 | DONE |
| T-11-10 | accept (순수 DOM 쿼리, 네트워크/eval 없음) | N/A |
| T-11-11 | accept (브라우저 네이티브 쿼리) | N/A |

## Known Stubs

None.

## Threat Flags

None — 새 네트워크 엔드포인트, auth 경로, 외부 의존성 없음. 순수 DOM 쿼리 유틸리티.

## Self-Check: PASSED

- `packages/runtime/src/runtime/target-resolver.ts` EXISTS
- `packages/runtime/tests/target-resolver.spec.ts` EXISTS
- `packages/runtime/tests/sensitive-or-only.spec.ts` EXISTS
- commit `59ef3e3` EXISTS
- commit `30d9fc4` EXISTS
- All 110 tests pass
- typecheck exit 0
