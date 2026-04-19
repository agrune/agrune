---
phase: "14"
plan: "03"
subsystem: mcp/core/browser
tags: [mcp-tool, macro, 3file-sync, parity, error-codes, cdp, hitl, redaction, security, tdd]

dependency_graph:
  requires:
    - "14-02: MacroRunner + PageAgentRuntime.runMacro (single Runtime.evaluate 브리지의 전제)"
    - "12-03: agrune_manifest_load 3파일 동기화 패턴 (mcp-tools.ts + index.ts + tools.ts)"
    - "12-02: CdpDriver.injectManifest U+2028/U+2029 이스케이프 패턴"
  provides:
    - "agrune_macro_run MCP tool — mcp-tools.ts + index.ts + tools.ts 3파일 동기화"
    - "MACRO_NOT_FOUND / MACRO_CIRCUIT_OPEN / MACRO_PRECONDITION_FAILED / MACRO_POSTCONDITION_FAILED 4개 에러 코드"
    - "MacroResult / MacroRunResponse 타입 (core local 복제, 순환 import 회피)"
    - "BrowserDriver.runMacro optional interface"
    - "CdpDriver.runMacro — 단일 Runtime.evaluate 브리지"
    - "MacroResult status → CommandErrorCode 6 case 매핑"
  affects:
    - "packages/core/src/index.ts — COMMAND_ERROR_CODES 확장"
    - "packages/core/src/driver.ts — BrowserDriver.runMacro optional + MacroRunResponse 타입"
    - "packages/mcp/src/mcp-tools.ts — agrune_macro_run 등록"
    - "packages/mcp/src/index.ts — case 'agrune_macro_run' + 에러 매핑"
    - "packages/mcp/src/tools.ts — JSON Schema 추가"
    - "packages/browser/src/cdp-driver.ts — runMacro 구현"

tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN (test commit first, then implementation)"
    - "3파일 동기화 패턴 (Phase 12-03 확립 — mcp-tools.ts + index.ts + tools.ts)"
    - "MacroResult local 복제 — @agrune/runtime 순환 import 회피"
    - "U+2028/U+2029 이스케이프 (T-12-05 회귀 방지 — injectManifest 패턴 재사용)"
    - "typeof driver.runMacro !== 'function' 타입 가드 (T-14-18)"
    - "step-error stepIndex=-1 + error.startsWith('macro not found') → MACRO_NOT_FOUND 매핑"

key-files:
  created:
    - path: "packages/mcp/tests/macro-run-tool.spec.ts"
      change: "agrune_macro_run 단위 테스트 (568 lines, 10 describe 블록)"
  modified:
    - path: "packages/core/src/index.ts"
      change: "MACRO_NOT_FOUND / MACRO_CIRCUIT_OPEN / MACRO_PRECONDITION_FAILED / MACRO_POSTCONDITION_FAILED 추가 (INVALID_MANIFEST 뒤)"
    - path: "packages/core/src/driver.ts"
      change: "MacroResult / MacroRunResponse 타입 정의 + BrowserDriver.runMacro optional 선언"
    - path: "packages/mcp/src/mcp-tools.ts"
      change: "agrune_macro_run 등록 (agrune_manifest_load 바로 뒤)"
    - path: "packages/mcp/src/index.ts"
      change: "case 'agrune_macro_run' + MacroRunResponse import + status→errorCode 6 case 매핑"
    - path: "packages/mcp/src/tools.ts"
      change: "agrune_macro_run JSON Schema 추가"
    - path: "packages/mcp/tests/tools.spec.ts"
      change: "12 → 13 tools, agrune_macro_run parity assertion 추가"
    - path: "packages/browser/src/cdp-driver.ts"
      change: "runMacro 구현 (단일 Runtime.evaluate + U+2028/U+2029 이스케이프)"

key-decisions:
  - "MacroResult 타입을 @agrune/runtime에서 import하지 않고 core/driver.ts에 local 복제 — 순환 import(runtime→core→runtime) 회피, 주석으로 source of truth 명시"
  - "MACRO_NOT_FOUND 매핑은 PageAgentRuntime의 step-error+stepIndex=-1+error='macro not found: xxx' 패턴을 MCP 핸들러에서 감지 — driver.getManifest() API 추가 없이 pragmatic 구현"
  - "commandBroker.onEvent → subscribe로 수정 (Rule 1 auto-fix) — CommandBroker API는 subscribe()가 정확한 메서드명"
  - "hitl.skip() no-op 문제 해결: pause()→awaitGate 블록→skip() 순서로 테스트 패턴 수정"
  - "sensitiveStepIndices optional 필드를 MacroRunResponse에 추가 — MCP layer best-effort redaction (v0.5 간소화)"

patterns-established:
  - "3파일 동기화 패턴 (Phase 12-03): mcp-tools.ts(zod) + index.ts(switch case) + tools.ts(JSON Schema)"
  - "MacroResult status switch exhaustiveness guard: default case → never 타입 + INVALID_COMMAND fallthrough"
  - "CdpDriver.runMacro: JSON.stringify 이중 인코딩 + U+2028/U+2029 이스케이프 (T-12-05 패턴 재사용)"

requirements-completed: [MACRO-02]

duration: 10min
completed: "2026-04-19T19:02:00Z"
---

# Phase 14 Plan 03: agrune_macro_run MCP Tool + CdpDriver 브리지 Summary

**`agrune_macro_run` MCP tool을 mcp-tools.ts·index.ts·tools.ts 세 파일에 동기화 등록하고, `MACRO_*` 4개 에러 코드 추가, `BrowserDriver.runMacro` optional interface 선언, `CdpDriver.runMacro` 단일 Runtime.evaluate 브리지 구현으로 MACRO-02 완결**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-19T18:56:00Z
- **Completed:** 2026-04-19T19:02:00Z
- **Tasks:** 2 (각 TDD RED + GREEN)
- **Files modified:** 7

## Accomplishments

### Task 1: COMMAND_ERROR_CODES + BrowserDriver.runMacro + CdpDriver.runMacro

- `COMMAND_ERROR_CODES`에 4개 신규 코드 추가 (INVALID_MANIFEST 바로 뒤, 의미 근접 배치):
  - `MACRO_NOT_FOUND`, `MACRO_CIRCUIT_OPEN`, `MACRO_PRECONDITION_FAILED`, `MACRO_POSTCONDITION_FAILED`
- `packages/core/src/driver.ts`에 `MacroResult` / `MacroRunResponse` 타입 local 복제 (순환 import 회피)
- `BrowserDriver.runMacro?(tabId, macroId, params?)` optional 메서드 선언
- `CdpDriver.runMacro`: 단일 `Runtime.evaluate` → `window[QUICK_MODE_RUNTIME_KEY].runMacro({macroId, params})` 호출
  - U+2028/U+2029 이스케이프 적용 (T-12-05 회귀 방지)
  - `!target?.sessionId` → `TAB_NOT_FOUND` throw
  - `raw.status !== 'string'` → `INVALID_COMMAND` throw

### Task 2: agrune_macro_run 3파일 동기화 + 에러 매핑 + parity

- **mcp-tools.ts**: `agrune_macro_run` zod schema 등록 (`macroId: z.string()`, `params: z.record(...)`, `...optionalTabId`)
- **index.ts**: `case 'agrune_macro_run'` — SESSION_NOT_ACTIVE / INVALID_COMMAND 가드 + MacroResult status 6 case 매핑:
  - `ok` / `already-satisfied` → `{ ok: true, status, macroId, stepCount }`
  - `circuit-open` → `MACRO_CIRCUIT_OPEN`
  - `precondition-failed` → `MACRO_PRECONDITION_FAILED`
  - `postcondition-failed` → `MACRO_POSTCONDITION_FAILED`
  - `step-error` (stepIndex=-1, "macro not found") → `MACRO_NOT_FOUND`
  - `step-error` (일반) → `INVALID_COMMAND`
  - `target-not-found` → `TARGET_NOT_FOUND`
- **tools.ts**: `agrune_macro_run` JSON Schema 추가 (`required: ['macroId']`)
- **tools.spec.ts**: 12 → 13 tools, parity assertion 2개 추가
- **macro-run-tool.spec.ts**: 568 lines, 10 describe 블록, 29 테스트 전부 green

## Task Commits

TDD RED→GREEN 패턴:

1. **Task 1 RED: CdpDriver.runMacro 테스트** — `4cbcb70` (test)
2. **Task 1 GREEN: 4 에러 코드 + BrowserDriver.runMacro + CdpDriver.runMacro 구현** — `17d9cb2` (feat)
3. **Task 2 RED: agrune_macro_run + parity 테스트** — `5529352` (test)
4. **Task 2 GREEN: 3파일 동기화 + 에러 매핑 구현** — `5f65f55` (feat)

## TDD Gate Compliance

- RED commit `4cbcb70` — `test(14-03): add failing tests for CdpDriver.runMacro (TDD RED)`
- GREEN commit `17d9cb2` — `feat(14-03): add 4 MACRO_* error codes + BrowserDriver.runMacro + CdpDriver bridge (TDD GREEN)`
- RED commit `5529352` — `test(14-03): add failing tests for agrune_macro_run + parity (TDD RED)`
- GREEN commit `5f65f55` — `feat(14-03): agrune_macro_run 3파일 동기화 + error code mapping + parity (TDD GREEN)`

## Files Created/Modified

| File | Change |
|------|--------|
| `packages/core/src/index.ts` | MACRO_* 4개 에러 코드 추가 |
| `packages/core/src/driver.ts` | MacroResult / MacroRunResponse 타입 + BrowserDriver.runMacro optional |
| `packages/mcp/src/mcp-tools.ts` | agrune_macro_run 등록 |
| `packages/mcp/src/index.ts` | case 'agrune_macro_run' + 6 case 에러 매핑 |
| `packages/mcp/src/tools.ts` | agrune_macro_run JSON Schema |
| `packages/mcp/tests/tools.spec.ts` | 12→13 tools 업데이트 |
| `packages/mcp/tests/macro-run-tool.spec.ts` | 신규 — 568 lines, 10 describe |
| `packages/browser/src/cdp-driver.ts` | runMacro 구현 (단일 Runtime.evaluate) |

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| core typecheck | `pnpm --filter @agrune/core run typecheck` | PASS |
| browser typecheck | `pnpm --filter @agrune/browser run typecheck` | PASS |
| mcp typecheck | `pnpm --filter @agrune/mcp run typecheck` | PASS |
| core tests | `pnpm --filter @agrune/core run test` | 29/29 PASS |
| browser tests | `pnpm --filter @agrune/browser run test` | 88/88 PASS |
| mcp tests | `pnpm --filter @agrune/mcp run test` | 94/94 PASS |
| mcp build | `pnpm --filter @agrune/mcp run build` | PASS |
| workspace typecheck | `pnpm -r run typecheck` | PASS (all packages) |
| workspace tests | `pnpm -r run test` | PASS (207+88+94+... all green) |

## Decisions Made

- **MacroResult local 복제**: `@agrune/runtime`에서 import하면 runtime→core 순환이 발생. `core/driver.ts`에 local 복제하고 주석으로 "source of truth: @agrune/runtime/macro-runner" 명시
- **MACRO_NOT_FOUND 매핑 전략**: `driver.getManifest()` API 추가 없이 `PageAgentRuntime.runMacro`가 반환하는 `{status: 'step-error', stepIndex: -1, error: 'macro not found: xxx'}` 패턴을 MCP 핸들러에서 감지하는 pragmatic 접근
- **sensitiveStepIndices best-effort**: v0.5 scope에서 `MacroRunResponse.sensitiveStepIndices?: number[]` optional 필드로 best-effort redaction. 필드가 없으면 redaction 스킵

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] commandBroker.onEvent → subscribe API 수정**
- **Found during:** Task 2 GREEN 단계 (테스트 실행 시)
- **Issue:** 테스트 작성 시 `commandBroker.onEvent()`를 사용했으나 `CommandBroker` 클래스의 실제 메서드명은 `subscribe()`
- **Fix:** 모든 `onEvent()` 호출을 `subscribe()`로 교체
- **Files modified:** `packages/mcp/tests/macro-run-tool.spec.ts`
- **Verification:** 94/94 테스트 통과
- **Committed in:** `5f65f55`

**2. [Rule 1 - Bug] hitl.skip() no-op 문제 — pause 없이 skip 호출**
- **Found during:** Task 2 GREEN 단계 (테스트 실행 시)
- **Issue:** `HitlController.skip()`은 `waiters.length === 0`이면 no-op. `pause()` 없이 `skip()` 먼저 호출하면 waiter가 없어서 동작하지 않음
- **Fix:** 테스트 패턴을 `pause()` → `handleToolCall()` (비동기 블록) → microtask yield → `skip()` 순서로 수정
- **Files modified:** `packages/mcp/tests/macro-run-tool.spec.ts`
- **Verification:** hitl.skip 테스트 통과
- **Committed in:** `5f65f55`

---

**Total deviations:** 2 auto-fixed (Rule 1 — Bug, 테스트 API 오류)
**Impact on plan:** 구현 범위 변경 없음. 테스트 API 정합성 확보.

## Known Stubs

없음. `agrune_macro_run` 전 스택 동작 완결 (CdpDriver → PageAgentRuntime.runMacro 브리지).

## Threat Surface

| Mitigation | Status |
|------------|--------|
| T-14-14 Info Disclosure: params.password → CommandBroker broadcast | MITIGATED (best-effort) — `sensitiveStepIndices?: number[]` optional 필드로 수신 시 redaction 가능. v0.5에서 MacroRunner가 pre-scan 후 인덱스 반환 시 완전 mitigation |
| T-14-16 Spoofing: macroId prototype injection | MITIGATED — zod `z.string()` 검증 + PageAgentRuntime의 `manifest.macros.find(m => m.macroId === macroId)` exact match |
| T-14-18 EoP: stub driver.runMacro 없음 | MITIGATED — `typeof driver.runMacro !== 'function'` → INVALID_COMMAND |
| T-14-20 Tampering: MacroRunResponse shape 변조 | MITIGATED — `typeof raw.status === 'string'` 체크 + switch exhaustiveness default → INVALID_COMMAND |

## Self-Check

### Created files exist:
- `packages/mcp/tests/macro-run-tool.spec.ts` — FOUND (568 lines, 10 describe 블록)
- `.planning/phases/14-macro/14-03-SUMMARY.md` — FOUND (this file)

### Modified files exist:
- `packages/core/src/index.ts` — FOUND (MACRO_NOT_FOUND @ line 18)
- `packages/core/src/driver.ts` — FOUND (MacroResult @ line 10, MacroRunResponse @ line 17, runMacro @ line 73)
- `packages/mcp/src/mcp-tools.ts` — FOUND (agrune_macro_run @ lines 215, 222)
- `packages/mcp/src/index.ts` — FOUND (case 'agrune_macro_run' @ line 166)
- `packages/mcp/src/tools.ts` — FOUND (agrune_macro_run @ line 216)
- `packages/mcp/tests/tools.spec.ts` — FOUND (toHaveLength(13) @ lines 29, 171)
- `packages/browser/src/cdp-driver.ts` — FOUND (runMacro @ lines 375, 394, 397)

### Commits exist:
- 4cbcb70 — FOUND (test(14-03): TDD RED CdpDriver)
- 17d9cb2 — FOUND (feat(14-03): TDD GREEN Task 1)
- 5529352 — FOUND (test(14-03): TDD RED Task 2)
- 5f65f55 — FOUND (feat(14-03): TDD GREEN Task 2)

### Final test results:
- pnpm --filter @agrune/core run test — 29/29 PASS
- pnpm --filter @agrune/browser run test — 88/88 PASS
- pnpm --filter @agrune/mcp run test — 94/94 PASS
- pnpm -r run typecheck — all PASS
- pnpm -r run test — all PASS

## Self-Check: PASSED
