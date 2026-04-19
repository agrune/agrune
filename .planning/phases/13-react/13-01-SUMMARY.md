---
phase: "13"
plan: "01"
subsystem: manifest+runtime
tags: [schema, selector-ladder, fiber-path, resolver, tdd]
completed: "2026-04-19T08:54:37Z"
duration_minutes: 7

dependency_graph:
  requires: []
  provides:
    - "@agrune/manifest: FiberIdentityPath / FiberPathSegment type + SelectorLadder.fiber field"
    - "@agrune/runtime: resolveByLadder fiber-first branch via window.__agrune_identity__"
  affects:
    - "@agrune/react (Plan 02): consumes FiberIdentityPath from @agrune/manifest barrel"
    - "@agrune/runtime: target-resolver.ts resolver priority order changed (fiber before role)"

tech_stack:
  added: []
  patterns:
    - "AtLeastOne<T> union — fiber 6번째 필드로 non-breaking 확장"
    - "zod z.array().min(1).max(8) — path 길이 상한 + segment shape 검증"
    - "globalThis.__agrune_identity__ typeof guard + try/catch fallback (T-13-02/05 mitigate)"

key_files:
  created: []
  modified:
    - packages/manifest/src/schema.ts
    - packages/manifest/src/index.ts
    - packages/manifest/tests/builders.spec.ts
    - packages/manifest/tests/validator.spec.ts
    - packages/runtime/src/runtime/target-resolver.ts
    - packages/runtime/tests/target-resolver.spec.ts
    - packages/runtime/package.json

decisions:
  - "FiberIdentityPath를 @agrune/manifest에서 직접 import (로컬 타입 복제 금지) — Plan 02/03의 단일 소스 원칙"
  - "globalThis 접근 — window 대신 globalThis 사용으로 jsdom/Node 환경 모두 안전"
  - "@agrune/manifest workspace:* dep을 @agrune/runtime에 추가 (@agrune/core가 FiberIdentityPath re-export 안 함)"
  - "fiber branch는 role보다 먼저 배치, bridge 없으면 기존 ladder 순서 그대로"

metrics:
  tasks_completed: 2
  tests_added: 17
  files_modified: 6
  tdd_red_commits: ["0e61d7e", "d1be19b"]
  tdd_green_commits: ["4c14a13", "6fdc156"]
---

# Phase 13 Plan 01: FiberIdentityPath Schema + fiber-first Resolver Summary

**One-liner:** `FiberIdentityPath`/`FiberPathSegment` 타입을 `@agrune/manifest` barrel에 추가하고, `resolveByLadder`에 `window.__agrune_identity__.resolve` fiber-first branch를 심어 Plan 02 `@agrune/react` bridge 게시 즉시 component-identity selector가 CSS ladder보다 먼저 동작하는 경로를 열었다.

## Tasks Completed

| Task | Name | RED commit | GREEN commit | Tests added |
|------|------|-----------|-------------|-------------|
| 1 | FiberIdentityPath 타입 + SelectorLadder.fiber 필드 (manifest) | 0e61d7e | 4c14a13 | 11 |
| 2 | runtime resolveByLadder fiber-first branch | d1be19b | 6fdc156 | 6 |

## TDD Gate Compliance

- **Task 1 RED:** `0e61d7e` — builders.spec.ts + validator.spec.ts 신규 테스트 추가 (2 failing)
- **Task 1 GREEN:** `4c14a13` — schema.ts FiberPathSegment/FiberIdentityPath/fiber zod + index.ts barrel export (54/54 pass)
- **Task 2 RED:** `d1be19b` — target-resolver.spec.ts fiber-first branch Tests A-F 추가 (1 failing)
- **Task 2 GREEN:** `6fdc156` — target-resolver.ts fiber branch 구현 (138/138 pass)

## Files Modified

### packages/manifest/src/schema.ts
- `FiberPathSegment` interface 추가 (`componentName: string`, `key: string | null`, `index: number`)
- `FiberIdentityPath = FiberPathSegment[]` type alias 추가
- `SelectorLadder` AtLeastOne 맵에 `fiber: { path: FiberIdentityPath }` 6번째 필드 추가
- `SelectorLadderSchema` zod에 `fiber.path` 검증 추가: `z.array(...).min(1).max(8)`
- refine predicate에 `|| v.fiber` 추가, 에러 메시지 `', fiber'` 포함으로 갱신

### packages/manifest/src/index.ts
- `FiberPathSegment`, `FiberIdentityPath` type export 추가

### packages/runtime/src/runtime/target-resolver.ts
- `import type { FiberIdentityPath } from '@agrune/manifest'` 추가
- `SelectorLadder` local interface에 `fiber?: { path: FiberIdentityPath }` 추가
- `resolveByLadder` 맨 앞(role 위)에 fiber branch 삽입:
  - `globalThis.__agrune_identity__` typeof guard
  - `try { bridge.resolve(path) } catch { /* fallback */ }` (T-13-02 mitigate)
  - resolve null/throw → 기존 role>text>testId>attr>css fallback

### packages/runtime/package.json
- `"@agrune/manifest": "workspace:*"` 의존성 추가 (FiberIdentityPath import 경로 확보)

## Test Results

| Package | Before | After | Delta |
|---------|--------|-------|-------|
| @agrune/manifest | 43 pass | 54 pass | +11 |
| @agrune/runtime | 132 pass | 138 pass | +6 |
| @agrune/core | 29 pass | 29 pass | 0 |
| @agrune/mcp | 62 pass | 62 pass | 0 |

모든 패키지 typecheck 통과. workspace 전체 typecheck 통과.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @agrune/manifest workspace dep 추가**
- **Found during:** Task 2
- **Issue:** `@agrune/runtime`이 `@agrune/manifest`를 workspace dep으로 갖지 않아 `import type { FiberIdentityPath } from '@agrune/manifest'`가 불가능했음. `@agrune/core`는 FiberIdentityPath를 re-export하지 않음.
- **Fix:** `packages/runtime/package.json` dependencies에 `"@agrune/manifest": "workspace:*"` 추가 + `pnpm install`.
- **Files modified:** `packages/runtime/package.json`
- **Commit:** d1be19b (RED 커밋에 포함)

**2. [Rule 1 - Bug] afterEach import 누락**
- **Found during:** Task 2 spec 작성
- **Issue:** vitest import에 `afterEach`가 없어 fiber bridge cleanup(`delete globalThis.__agrune_identity__`)이 컴파일 오류 발생.
- **Fix:** `beforeEach, afterEach, describe, it, expect` 로 import 확장.
- **Files modified:** `packages/runtime/tests/target-resolver.spec.ts`
- **Commit:** d1be19b

## Threat Mitigations Applied

| Threat ID | Status | Implementation |
|-----------|--------|---------------|
| T-13-01 | mitigated | `z.array(...).min(1).max(8)` + segment shape (componentName string, key nullable, index nonnegative int) |
| T-13-02 | mitigated | `try { bridge.resolve(...) } catch { /* fallback */ }` — 예외 전파 차단 |
| T-13-04 | mitigated | `z.array(...).max(8)` — path depth 상한 고정 |
| T-13-05 | mitigated | `typeof bridge.resolve === 'function'` guard — non-function value 안전 처리 |

## Plan 02 Handoff Notes

- `FiberIdentityPath` / `FiberPathSegment`: `import type { FiberIdentityPath } from '@agrune/manifest'` 로 사용 가능.
- `window.__agrune_identity__` bridge는 Plan 02 `@agrune/react`가 publish. Plan 01은 read-only consumer.
- bridge가 없는 환경(React 미사용 사이트)에서도 기존 CSS ladder 동작 완전 보장.

## Self-Check: PASSED

- [x] `packages/manifest/src/schema.ts` — FiberPathSegment, FiberIdentityPath, fiber: zod 모두 존재
- [x] `packages/manifest/src/index.ts` — FiberIdentityPath, FiberPathSegment export 존재
- [x] `packages/runtime/src/runtime/target-resolver.ts` — ladder.fiber, __agrune_identity__, FiberIdentityPath import 존재
- [x] 커밋 0e61d7e, 4c14a13, d1be19b, 6fdc156 모두 git log에 존재
- [x] @agrune/manifest 54 tests pass, @agrune/runtime 138 tests pass
- [x] workspace typecheck 통과
