---
phase: 12-inject
plan: "01"
subsystem: core-types, runtime, devtools, mcp
tags: [breaking-change, v3, selector-ladder, schema-version]
dependency_graph:
  requires: [11-03-SUMMARY.md]
  provides: [PageSnapshot-v3-shape, SelectorLadder-in-selector]
  affects: [packages/runtime, packages/devtools, packages/mcp]
tech_stack:
  added: []
  patterns: [SelectorLadder-object-passthrough, schemaVersion-literal-field]
key_files:
  created:
    - packages/runtime/tests/snapshot-v3.spec.ts
  modified:
    - packages/core/src/index.ts
    - packages/core/tests/native-messages.spec.ts
    - packages/runtime/src/runtime/snapshot.ts
    - packages/devtools/src/panel.ts
    - packages/mcp/tests/public-shapes.spec.ts
decisions:
  - "schemaVersion: 3 리터럴 필드를 별도 추가 (version 카운터 유지) — Option A 채택 (RESEARCH Section 4)"
  - "devtools panel.ts selector 렌더링: JSON.stringify(target.selector) — XSS 위험 없음 (T-12-01 accept)"
  - "public-shapes.spec.ts fixture: string → SelectorLadder 객체로 교체 (타입 정확성 확보)"
metrics:
  duration: "9m"
  completed: "2026-04-19T08:06:51Z"
  tasks: 2
  files: 5
---

# Phase 12 Plan 01: PageSnapshot v3 Breaking Bump Summary

**One-liner:** `PageTarget.selector: string → SelectorLadder` 객체 교체 + `PageSnapshot.schemaVersion: 3 as const` 신규 필드 추가로 v3 프로토콜 shape 완성.

---

## What Was Built

### packages/core/src/index.ts

- `import type { SelectorLadder } from './manifest.js'` 명시적 추가 (PageTarget 선언 이전 resolved)
- `export type { SelectorLadder } from './manifest.js'` barrel re-export 추가
- `PageTarget.selector: string` → `PageTarget.selector: SelectorLadder` (breaking change)
- `PageSnapshot.schemaVersion: 3` 리터럴 필드 신규 추가 — `version: number` 카운터 위에 JSDoc 주석 포함

### packages/core/tests/native-messages.spec.ts

- `PageSnapshot` fixture에 `schemaVersion: 3` 추가 (필수 필드 미설정으로 인한 typecheck 에러 해소)

### packages/runtime/src/runtime/snapshot.ts

- `captureTarget()` 반환 블록: `selector: JSON.stringify(descriptor.target.selector)` → `selector: descriptor.target.selector` (Phase 12 임시 직렬화 제거, Phase 11 주석 삭제)
- `makeSnapshot()` 반환 `PageSnapshot` 객체에 `schemaVersion: 3` 추가

### packages/devtools/src/panel.ts

- `renderDetail()` 232번 줄: `` `${target.selector}` `` → `` `${JSON.stringify(target.selector)}` `` (`[object Object]` 방지)

### packages/runtime/tests/snapshot-v3.spec.ts (신규)

- 7개 테스트: v3 타입 계약 회귀 테스트
  - `SelectorLadder` 객체 할당 가능 (css/role/text/testId/attr 전 변형)
  - string 할당 시 `@ts-expect-error` 음성 테스트
  - `schemaVersion: 3` 이외 값 `@ts-expect-error` 음성 테스트
  - `version: number` 카운터 유지 검증
  - `schemaVersion` + `version` 공존 검증
  - `PageSnapshot` 전체 구조에서 selector 객체 유지 검증

### packages/mcp/tests/public-shapes.spec.ts

- `PageSnapshot` fixture 3개: `schemaVersion: 3` 추가
- `PageTarget` fixture: `selector: string` → `selector: { css: '...' }` SelectorLadder 객체로 교체 (5개 targets)

---

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| core typecheck | `pnpm --filter @agrune/core run typecheck` | PASS |
| core build | `pnpm --filter @agrune/core run build` | PASS |
| runtime typecheck | `pnpm --filter @agrune/runtime run typecheck` | PASS |
| runtime tests | `pnpm --filter @agrune/runtime run test` | 132/132 PASS |
| devtools typecheck | `pnpm --filter @agrune/devtools run typecheck` | PASS |
| mcp typecheck | `pnpm --filter @agrune/mcp run typecheck` | PASS |
| mcp public-shapes test | `pnpm --filter @agrune/mcp run test -- public-shapes` | 45/45 PASS |
| snapshot-v3 spec | 132 tests 포함 (runtime 전체) | 7 new tests PASS |

---

## Acceptance Criteria Results

| Criterion | Status |
|-----------|--------|
| `grep "JSON.stringify(descriptor.target.selector)" packages/runtime/src/` → 0 | PASS |
| `grep "selector: descriptor.target.selector" snapshot.ts` → 1+ | PASS (line 405) |
| `grep "schemaVersion: 3" snapshot.ts` → 1 | PASS (line 535) |
| `grep '${target.selector}' panel.ts` → 0 | PASS |
| `grep "JSON.stringify(target.selector)" panel.ts` → 1+ | PASS (line 232) |
| `grep "selector: SelectorLadder" core/src/index.ts` → 1+ | PASS (line 82) |
| `grep "selector: string" core/src/index.ts` → 0 (PageTarget context) | PASS |
| `grep "import type { SelectorLadder }" core/src/index.ts` → 1 | PASS (line 2) |
| snapshot-v3.spec.ts 존재 + wc -l ≥ 40 | PASS (157 lines) |
| `grep -rn "version: 2" packages/runtime/src packages/core/src` → 0 (주석 제외) | PASS |

---

## Threat Model Coverage

| Threat ID | Category | Disposition | Confirmed |
|-----------|----------|-------------|-----------|
| T-12-01 | Tampering (devtools selector 렌더) | accept — panel.ts 전체가 trusted author HTML 내부, MANIFEST-05 schema 이미 selector 값 제한 | JSON.stringify 적용 완료 |
| T-12-02 | Info Disclosure (MCP output selector 노출) | accept — `toPublicTarget()`이 selector 필드 의도적 제외, v3 후에도 동일 | 확인: public-shapes.ts 변경 없음 |
| T-12-03 | Tampering (SelectorLadder CDP 역직렬화) | accept — SelectorLadder는 interface, instanceof 검사 없음, plain object | 확인: snapshot.ts 코드 패턴 |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] packages/core/tests/native-messages.spec.ts fixture 업데이트**
- **Found during:** Task 1 (core typecheck)
- **Issue:** `PageSnapshot` fixture에 `schemaVersion` 필드 누락으로 typecheck 에러 발생
- **Fix:** `schemaVersion: 3` 추가
- **Files modified:** `packages/core/tests/native-messages.spec.ts`
- **Commit:** 0eb9c9f

**2. [Rule 2 - Correctness] public-shapes.spec.ts의 `session.snapshot` fixture 업데이트**
- **Found during:** Task 2 (mcp fixture 점검)
- **Issue:** tests/가 tsconfig exclude지만 런타임 정확성을 위해 `selector: string` → `SelectorLadder`, `schemaVersion: 3` 추가
- **Fix:** 5개 PageTarget fixture selector 객체화, 4개 PageSnapshot fixture schemaVersion 추가
- **Files modified:** `packages/mcp/tests/public-shapes.spec.ts`
- **Commit:** 9b3472f

---

## Known Stubs

없음 — 이 plan은 Phase 11의 `JSON.stringify` 임시 직렬화를 완전히 제거한 breaking change. v2 legacy adapter 없음.

---

## Commits

| Hash | Type | Description |
|------|------|-------------|
| f88ca8e | test(12-01) | add failing snapshot-v3 type contract tests (TDD RED) |
| 0eb9c9f | feat(12-01) | PageTarget.selector→SelectorLadder + PageSnapshot.schemaVersion:3 (TDD GREEN) |
| 9b3472f | feat(12-01) | wire SelectorLadder through snapshot + fix panel render + update fixtures |

---

## TDD Gate Compliance

- RED gate: `f88ca8e` — `test(12-01)` commit 존재
- GREEN gate: `0eb9c9f` — `feat(12-01)` commit 존재 (RED 이후)
- REFACTOR: 불필요 (코드 구조 단순, cleanup 없음)

---

## Self-Check

### Created files exist:
- `packages/runtime/tests/snapshot-v3.spec.ts` — FOUND
- `.planning/phases/12-inject/12-01-SUMMARY.md` — FOUND (this file)

### Commits exist:
- f88ca8e — FOUND
- 0eb9c9f — FOUND
- 9b3472f — FOUND

## Self-Check: PASSED
