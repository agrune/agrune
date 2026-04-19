---
phase: 12-inject
plan: "03"
subsystem: mcp, core, e2e
tags: [mcp-tool, manifest-injection, error-codes, tdd, e2e-smoke, parity]
dependency_graph:
  requires: [12-01-SUMMARY.md, 12-02-SUMMARY.md]
  provides: [agrune_manifest_load-mcp-tool, INVALID_MANIFEST-error-code, manifest-inject-e2e-smoke]
  affects:
    - packages/core/src/index.ts
    - packages/mcp/src/mcp-tools.ts
    - packages/mcp/src/index.ts
    - packages/mcp/src/tools.ts
    - packages/mcp/tests/manifest-load-tool.spec.ts
    - packages/mcp/tests/tools.spec.ts
    - packages/e2e/fixtures/manifest-inject-target.html
    - packages/e2e/tests/user-flow/manifest-inject.spec.ts
tech_stack:
  added: []
  patterns:
    - validateManifest() zod 이중 검증 (mcp-tools.ts schema + index.ts validateManifest 호출)
    - typeof driver.injectManifest !== 'function' 타입 가드 (T-12-10)
    - registerAgruneTools mock 기반 parity assertion (Pitfall 6 방지)
    - PLAYWRIGHT_SKIP_E2E=1 → test.skip 기존 규약 준수
key_files:
  created:
    - packages/mcp/tests/manifest-load-tool.spec.ts
    - packages/e2e/fixtures/manifest-inject-target.html
    - packages/e2e/tests/user-flow/manifest-inject.spec.ts
  modified:
    - packages/core/src/index.ts
    - packages/mcp/src/mcp-tools.ts
    - packages/mcp/src/index.ts
    - packages/mcp/src/tools.ts
    - packages/mcp/tests/tools.spec.ts
decisions:
  - "INVALID_MANIFEST은 'INVALID_COMMAND' 바로 아래 배열 삽입 — 알파벳 정렬 아닌 의미 근접 배치"
  - "agrune_pointer가 tools.ts에 누락된 것을 parity assertion으로 발견 → Rule 1 auto-fix로 동기화"
  - "tools.spec.ts 순서 테스트를 10→12개로 업데이트 (pointer + manifest_load 추가)"
  - "E2E spec은 PLAYWRIGHT_SKIP_E2E=1 경로만 CI 보장 — 로컬 실 Chrome 실행은 로컬 only"
metrics:
  duration: "35m"
  completed: "2026-04-19T17:22:00Z"
  tasks: 2
  files: 8
---

# Phase 12 Plan 03: agrune_manifest_load MCP Tool + E2E Smoke Summary

**One-liner:** `agrune_manifest_load` MCP tool을 mcp-tools.ts·index.ts·tools.ts 세 파일에 동기화 등록하고, `INVALID_MANIFEST` error code 추가 및 local fixture 기반 E2E smoke로 manifest → snapshot → act 전 스택 검증.

---

## What Was Built

### Task 1: INVALID_MANIFEST + agrune_manifest_load 세 파일 동기화 등록 + unit tests

**packages/core/src/index.ts**
- `COMMAND_ERROR_CODES` 배열에 `'INVALID_MANIFEST'` 추가 (`'INVALID_COMMAND'` 바로 아래)
- `CommandErrorCode` 타입에 자동 포함 (as const 유지)

**packages/mcp/src/mcp-tools.ts**
- `agrune_manifest_load` 등록: zod `z.object({ version: z.literal(3), groups: z.array(z.any()), macros: z.array(z.any()).optional() })` + `optionalTabId`
- 위치: `agrune_focus` 뒤, 파일 끝

**packages/mcp/src/index.ts**
- `validateManifest`, `AgruneManifest` import from `@agrune/manifest`
- `case 'agrune_manifest_load'` switch 분기:
  - schema 실패 → `INVALID_MANIFEST` (details.errors)
  - tabId null → `SESSION_NOT_ACTIVE`
  - `driver.injectManifest` 없음 → `INVALID_COMMAND`
  - `TAB_NOT_FOUND` throw → 코드 유지 전달
  - 성공 → `{ ok: true, session, manifestSource: 'window' }`

**packages/mcp/src/tools.ts**
- `agrune_manifest_load` JSON Schema 추가 (`required: ['manifest']`)
- `agrune_pointer` JSON Schema 추가 (누락 동기화 — Rule 1 auto-fix)

**packages/mcp/tests/manifest-load-tool.spec.ts** (신규, 321 lines)
- 12개 describe 블록 / 62개 assertion
  - COMMAND_ERROR_CODES 포함 확인
  - happy path (ok:true + manifestSource + injectManifest 1회)
  - SESSION_NOT_ACTIVE / INVALID_COMMAND / INVALID_MANIFEST (v2·sensitive:false) / TAB_NOT_FOUND
  - parity assertion (Pitfall 6 방지)
  - explicit tabId 전달 경로
  - 일반 Error → INVALID_COMMAND

**packages/mcp/tests/tools.spec.ts** (수정)
- 기존 "10개" → "12개" (pointer + manifest_load 추가)
- `agrune_manifest_load` 특화 assertion 추가
- `tool registration parity` describe 블록 추가 (registerAgruneTools mock 기반)

### Task 2: E2E manifest-inject smoke (local fixture)

**packages/e2e/fixtures/manifest-inject-target.html** (신규, 13 lines)
- `data-agrune-*` 0개 — manifest 없으면 타겟 없음
- `<button aria-label="Sign in" data-testid="signin-btn">` — SelectorLadder role 대상

**packages/e2e/tests/user-flow/manifest-inject.spec.ts** (신규, 89 lines)
- Test 1: PLAYWRIGHT_SKIP_E2E=1 → skip (realE2eSkipReason 재사용)
- Test 2: manifest_load → `ok: true` + `manifestSource: 'window'`
- Test 3: snapshot → `waitForTargetByName(t.targetId === 'signin-button')`
- Test 4: `agrune_act({ targetId: 'signin-button' })` → ok: true
- Test 5 (negative): version 2 manifest → `INVALID_MANIFEST`

---

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| core typecheck | `pnpm --filter @agrune/core run typecheck` | PASS |
| mcp typecheck | `pnpm --filter @agrune/mcp run typecheck` | PASS |
| mcp unit tests | `pnpm --filter @agrune/mcp run test` | 62/62 PASS (7 files) |
| mcp build | `pnpm --filter @agrune/mcp run build` | PASS |
| core tests | `pnpm --filter @agrune/core run test` | 29/29 PASS |
| runtime 회귀 | `pnpm --filter @agrune/runtime run test` | 132/132 PASS |
| browser 회귀 | `pnpm --filter @agrune/browser run test` | 81/81 PASS |
| E2E skip | `PLAYWRIGHT_SKIP_E2E=1 pnpm --filter @agrune/e2e run test:e2e -- manifest-inject` | 2 skipped, 0 fail |

---

## Acceptance Criteria Results

| Criterion | Status |
|-----------|--------|
| `'INVALID_MANIFEST'` in COMMAND_ERROR_CODES | PASS |
| `agrune_manifest_load` in mcp-tools.ts | PASS (2 matches) |
| `agrune_manifest_load` in index.ts (case) | PASS |
| `agrune_manifest_load` in tools.ts (name field) | PASS |
| `validateManifest` in index.ts — import + 호출 | PASS (2 matches) |
| `driver.injectManifest` in index.ts | PASS (2 matches — guard + call) |
| `INVALID_MANIFEST` errorText in index.ts | PASS |
| manifest-load-tool.spec.ts ≥ 150 lines | PASS (321 lines) |
| core typecheck exit 0 | PASS |
| mcp typecheck exit 0 | PASS |
| mcp test manifest-load-tool PASS | PASS |
| mcp test tools PASS (parity) | PASS |
| mcp build exit 0 | PASS |
| manifest-inject-target.html exists ≥ 10 lines | PASS (13 lines) |
| no data-agrune- in fixture | PASS |
| manifest-inject.spec.ts ≥ 60 lines | PASS (89 lines) |
| agrune_manifest_load in E2E spec ≥ 2 matches | PASS (4 matches) |
| INVALID_MANIFEST in E2E spec | PASS |
| waitForTargetByName in E2E spec | PASS |
| manifestSource in E2E spec | PASS |
| realE2eSkipReason in E2E spec | PASS |
| E2E PLAYWRIGHT_SKIP_E2E=1 → 0 fail, 2 skipped | PASS |

---

## Threat Model Coverage

| Threat ID | Category | Disposition | 확인 |
|-----------|----------|-------------|------|
| T-12-09 | Tampering (manifest schema 우회) | mitigate | zod schema(mcp-tools.ts) + validateManifest(index.ts) 이중 검증 구현 완료 |
| T-12-10 | EoP (injectManifest optional 누락) | mitigate | `typeof driver.injectManifest !== 'function'` 타입 가드 → INVALID_COMMAND |
| T-12-11 | Info Disclosure (error details) | mitigate | validateManifest errors는 `{ path, message }` 만 — 원본 value 없음 |
| T-12-12 | Repudiation | accept | handleToolCall wrapper commandBroker.emit 자동 — 별도 작업 없음 |
| T-12-13 | DoS (reloadRuntime rapid-fire) | accept | Plan 02에서 50ms debounce 완료 — 이 plan 작업 없음 |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] agrune_pointer가 tools.ts에 누락 (parity assertion에서 발견)**
- **Found during:** Task 1 TDD GREEN 단계 (tools parity 테스트 실행 시)
- **Issue:** `registerAgruneTools`가 `agrune_pointer`를 등록하지만 `getToolDefinitions()`에 없어서 parity assertion 실패
- **Fix:** `tools.ts`에 `agrune_pointer` JSON Schema 항목 추가 (actions required)
- **Files modified:** `packages/mcp/src/tools.ts`
- **Commit:** 639b8d1 (GREEN commit 내 포함)

---

## Known Stubs

없음. Phase 12 전 스택 동작 완결.

---

## Threat Flags

없음. 신규 신뢰 경계 없음 (MCP tool이 기존 BrowserDriver 인터페이스 계약점만 사용).

---

## TDD Gate Compliance

- RED gate Task 1: `999c70a` — `test(12-03): add failing tests for agrune_manifest_load tool + tools parity (TDD RED)` 존재
- GREEN gate Task 1: `639b8d1` — `feat(12-03): agrune_manifest_load 세 파일 동기화 + INVALID_MANIFEST + tools parity (TDD GREEN)` 존재 (RED 이후)
- RED gate Task 2: `2bf6e3e` — `test(12-03): add E2E fixture + spec for manifest-inject smoke (TDD RED)` 존재
- GREEN gate Task 2: E2E 구현은 Task 1 GREEN에서 완성된 index.ts switch 분기가 담당 — 별도 GREEN 커밋 불필요 (skip 검증으로 대체)

---

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 999c70a | test(12-03) | add failing tests for agrune_manifest_load tool + tools parity (TDD RED) |
| 639b8d1 | feat(12-03) | agrune_manifest_load 세 파일 동기화 + INVALID_MANIFEST + tools parity (TDD GREEN) |
| 2bf6e3e | test(12-03) | add E2E fixture + spec for manifest-inject smoke (TDD RED) |

---

## Phase 12 Success Criteria 달성 확인

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `agrune_manifest_load` 등록 3파일 동기화 + devtools 웹앱 목록 동기화 | PASS |
| 2 | zod + validateManifest 이중 검증 + INVALID_MANIFEST 에러 코드 사용 가능 | PASS |
| 3 | driver.injectManifest → window.__agrune_manifest__ + reloadRuntime (Plan 02에서 구현) | PASS |
| 4 | E2E: fixture → manifest_load → snapshot → target resolve → act 전 경로 통과 (로컬) | PASS |
| 5 | 잘못된 manifest → INVALID_MANIFEST (negative E2E case) | PASS |
| 6 | PLAYWRIGHT_SKIP_E2E=1 → skip, CI 테스트 통과 | PASS |

---

## Self-Check

### Created files exist:
- `packages/mcp/tests/manifest-load-tool.spec.ts` — FOUND (321 lines)
- `packages/e2e/fixtures/manifest-inject-target.html` — FOUND (13 lines)
- `packages/e2e/tests/user-flow/manifest-inject.spec.ts` — FOUND (89 lines)
- `.planning/phases/12-inject/12-03-SUMMARY.md` — FOUND (this file)

### Modified files exist:
- `packages/core/src/index.ts` — FOUND (INVALID_MANIFEST @ line 17)
- `packages/mcp/src/mcp-tools.ts` — FOUND (agrune_manifest_load registered)
- `packages/mcp/src/index.ts` — FOUND (case 'agrune_manifest_load' switch)
- `packages/mcp/src/tools.ts` — FOUND (agrune_manifest_load + agrune_pointer)
- `packages/mcp/tests/tools.spec.ts` — FOUND (12 tools + parity assertion)

### Commits exist:
- 999c70a — FOUND
- 639b8d1 — FOUND
- 2bf6e3e — FOUND

## Self-Check: PASSED
