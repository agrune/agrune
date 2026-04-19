---
phase: "14"
plan: "02"
subsystem: runtime/macro-runner
tags: [macro, runner, circuit-breaker, precondition, postcondition, page-runtime, tdd, security, eval-isolation]

dependency_graph:
  requires:
    - "14-01: isSensitive word-boundary + multilang ARIA (dom-utils.ts 확장)"
    - "11-02: ManifestMacro / MacroStep / CommandHandlerDeps 타입 계약"
  provides:
    - "MacroRunner 클래스 — precondition/postcondition eval + step loop + circuit breaker"
    - "interpolateParams — {{key}} 보간 함수"
    - "MacroResult 유니온 타입"
    - "MacroRunnerDeps 인터페이스"
    - "PageAgentRuntime.runMacro — macroId 캐시 + MacroResult & { macroId, stepCount } 반환"
  affects:
    - "14-03: MCP layer — driver.runMacro → PageAgentRuntime.runMacro 브리지"

tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN (test commit first, then implementation)"
    - "Circuit breaker in-memory state (세션 범위 consecutiveFailures, Map 캐시)"
    - "new Function('params', expr) sandboxed eval — direct eval() 금지 (T-14-07)"
    - "MacroRunner deps injection — handleAct/handleFill 재사용, CDP round-trip 없음"

key-files:
  created:
    - path: "packages/runtime/src/runtime/macro-runner.ts"
      change: "MacroRunner 클래스 + MacroResult 타입 + interpolateParams 신규"
    - path: "packages/runtime/tests/macro-runner.spec.ts"
      change: "MACRO-01/MACRO-04 회귀 테스트 (718 lines, 10 describe 블록)"
  modified:
    - path: "packages/runtime/src/runtime/page-agent-runtime.ts"
      change: "runMacro 메서드 + macroRunners Map 캐시 + dispose 정리 추가"
    - path: "packages/runtime/src/index.ts"
      change: "MacroRunner / MacroResult / MacroRunnerDeps / interpolateParams re-export"

key-decisions:
  - "target-not-found 및 step-error 시 threshold 미달이면 loop continue → 단일 run 내에서 연속 실패 누적 후 circuit-open 가능"
  - "new Function('params', expr) 스코프 격리 — params 외 식별자는 ReferenceError → precondition-failed (T-14-07)"
  - "vi.mock() + import * as 패턴으로 ESM 환경에서 handleAct/handleFill mock — require() 사용 불가"
  - "macroRunners Map은 createPageAgentRuntime 클로저 내부 — macroId별 consecutiveFailures 세션 범위 보존"
  - "onStepProgress 어댑터: 최초 runner 생성 시 연결 (기존 캐시된 runner에 콜백 재연결 불필요 — 14-03 CommandBroker가 담당)"

patterns-established:
  - "MacroRunner deps injection: CommandHandlerDeps를 직접 주입해 handleAct/handleFill 재사용"
  - "Circuit breaker threshold = maxRetries ?? 2: 연속 실패 ≥ N 시 circuit-open 반환"
  - "evalExpr private method: new Function 래핑 → {ok, value} | {ok: false, error} 반환 패턴"

requirements-completed: [MACRO-01, MACRO-04]

duration: 30min
completed: "2026-04-19"
---

# Phase 14 Plan 02: MacroRunner + PageAgentRuntime.runMacro Summary

**`MacroRunner` 클래스 신규 작성 및 `PageAgentRuntime.runMacro` 추가 — precondition/postcondition eval, circuit breaker(default maxRetries:2), handleAct/handleFill 재사용으로 CDP round-trip 없이 step loop 완결**

## Performance

- **Duration:** 30 min
- **Started:** 2026-04-19T18:40:00Z
- **Completed:** 2026-04-19T18:51:00Z
- **Tasks:** 2 (각 TDD RED + GREEN)
- **Files modified:** 4

## Accomplishments

- `MacroRunner` 클래스: precondition(already-satisfied/precondition-failed) → step loop → postcondition 단일 호출 완결
- Circuit breaker: `consecutiveFailures >= maxRetries(default 2)` → `circuit-open` + `resetAfterMs` 자동 리셋
- `isSensitive(match.element, step.sensitive)` OR-chain으로 Plan 14-01 heuristic 재사용
- `evalExpr`: `new Function('params', expr)` 스코프 격리 — `eval()` 금지, T-14-07 mitigate
- `PageAgentRuntime.runMacro`: macroId → MacroRunner Map 캐시로 세션 범위 circuit breaker state 보존
- dispose 시 모든 MacroRunner 타이머 일괄 정리 (T-14-13 mitigate)
- 207개 전체 테스트 통과, typecheck/build exit 0

## Task Commits

TDD RED→GREEN 패턴:

1. **Task 1 RED: MacroRunner 테스트** — `164b8b5` (test)
2. **Task 1 GREEN: MacroRunner 구현** — `2417d3e` (feat)
3. **Task 2 RED: PageAgentRuntime integration 테스트** — `a1a7116` (test)
4. **Task 2 GREEN: PageAgentRuntime.runMacro 구현** — `df66763` (feat)

## TDD Gate Compliance

- RED commit `164b8b5` — `test(14-02): add failing tests for MacroRunner (TDD RED)`
- GREEN commit `2417d3e` — `feat(14-02): add MacroRunner with circuit breaker + pre/postcondition (TDD GREEN)`
- RED commit `a1a7116` — `test(14-02): add failing tests for PageAgentRuntime.runMacro (TDD RED)`
- GREEN commit `df66763` — `feat(14-02): wire MacroRunner into PageAgentRuntime + macroId cache (TDD GREEN)`

## Files Created/Modified

- `packages/runtime/src/runtime/macro-runner.ts` — MacroRunner 클래스, MacroResult 타입, interpolateParams 함수 (신규)
- `packages/runtime/tests/macro-runner.spec.ts` — 718 lines, 10 describe 블록 (신규)
- `packages/runtime/src/runtime/page-agent-runtime.ts` — runMacro 메서드 + macroRunners Map + dispose 정리
- `packages/runtime/src/index.ts` — MacroRunner / MacroResult / MacroRunnerDeps / interpolateParams re-export

## Decisions Made

- **step-error/target-not-found + continue 패턴**: threshold 미달 시 즉시 반환하지 않고 다음 step을 계속 시도 — 단일 run 내에서 연속 실패 누적 후 circuit-open 도달 가능
- **new Function 스코프 격리**: `eval()` 금지, `new Function('params', expr)` — params 외 식별자는 ReferenceError로 자동 precondition-failed 처리
- **ESM mock 패턴**: `vi.mock()` + `import * as cmdHandlers` + `vi.mocked(cmdHandlers.handleAct)` — `require()` CJS 패턴 불가

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] step-error/target-not-found 즉시 반환 → circuit-open 미도달**
- **Found during:** Task 1 GREEN (테스트 실행 시)
- **Issue:** 첫 번째 step 실패 시 즉시 반환해 consecutiveFailures가 threshold에 도달하지 못함
- **Fix:** threshold 미달이고 더 많은 step이 있으면 `continue`로 다음 step 시도 — 연속 실패 누적 후 circuit-open 반환
- **Files modified:** `packages/runtime/src/runtime/macro-runner.ts`
- **Verification:** `circuit-open → remaining steps not executed` 테스트 통과
- **Committed in:** `2417d3e`

**2. [Rule 1 - Bug] 테스트 mock 패턴 수정 — require() ESM 불가**
- **Found during:** Task 1 GREEN (테스트 실행 시)
- **Issue:** `vi.mocked(require('../src/runtime/command-handlers'))` → ESM 환경에서 `require` 미지원
- **Fix:** `import * as cmdHandlers from '../src/runtime/command-handlers'` + `vi.mocked(cmdHandlers.handleAct)` 패턴으로 교체
- **Files modified:** `packages/runtime/tests/macro-runner.spec.ts`
- **Verification:** 모든 integration 테스트 통과
- **Committed in:** `2417d3e`

---

**Total deviations:** 2 auto-fixed (Rule 1 — Bug)
**Impact on plan:** 테스트 기대값과 구현 로직 정합성 확보. 범위 변경 없음.

## Issues Encountered

- `ManifestMacro` / `MacroStep`이 `../types`에서 re-export되지 않아 `@agrune/manifest`에서 직접 import — 타입 계층 확인 필요

## Threat Surface

| Mitigation | Status |
|------------|--------|
| T-14-07 Tampering: evalExpr new Function XSS 유사 주입 | MITIGATED — new Function('params', ...) 스코프 격리, !!(expr) boolean 캐스팅 |
| T-14-08 DoS: 무한 retry | MITIGATED — circuit breaker default 2 |
| T-14-10 Info Disclosure: sensitive value 유출 | MITIGATED — isSensitive OR-chain → onSensitiveStep 콜백 signal (실제 redaction은 14-03) |
| T-14-11 Spoofing: sensitive:false 우회 | MITIGATED — step.sensitive 타입이 true|undefined 뿐, runtime heuristic OR 결합 |
| T-14-13 EoP: dispose 후 호출 | MITIGATED — disposed flag 가드 + dispose 시 macroRunners 일괄 정리 |

## Known Stubs

None.

## Next Phase Readiness

- **Plan 14-03**: MCP layer에서 `driver.runMacro → PageAgentRuntime.runMacro` 브리지만 추가하면 됨
- `MacroRunner` / `PageAgentRuntime.runMacro` API가 확정 상태로 노출됨
- `sensitiveStepIndices` 필드는 Plan 14-03 MCP layer에서 `onSensitiveStep` 콜백으로 수집 예정

## Self-Check

- [x] `packages/runtime/src/runtime/macro-runner.ts` — 존재, MacroRunner export
- [x] `packages/runtime/src/runtime/page-agent-runtime.ts` — runMacro 3 matches, MacroRunner 7 matches, macroRunners 5 matches
- [x] `packages/runtime/src/index.ts` — MacroRunner re-export 존재
- [x] `packages/runtime/tests/macro-runner.spec.ts` — 718 lines, 10 describe 블록
- [x] RED commit `164b8b5` — 존재
- [x] GREEN commit `2417d3e` — 존재
- [x] RED commit `a1a7116` — 존재
- [x] GREEN commit `df66763` — 존재
- [x] pnpm --filter @agrune/runtime test — 207 passed
- [x] typecheck — exit 0
- [x] build — exit 0
- [x] snapshot.ts / command-handlers.ts — empty diff (미수정)

## Self-Check: PASSED
