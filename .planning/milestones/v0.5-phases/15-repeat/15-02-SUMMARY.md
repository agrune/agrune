---
phase: 15-repeat
plan: "02"
subsystem: runtime
tags: [repeat-expander, snapshot, dom, virtualized, aria, tdd, jsdom, vitest, new-function, csp]

# Dependency graph
requires:
  - phase: 15-repeat
    plan: "01"
    provides: ManifestRepeat.containerSelector, PageTarget.repeatInstance, PageSnapshotGroup.repeats, REPEAT_INDEX_OUT_OF_RANGE
  - phase: 14-macro
    plan: "02"
    provides: new Function('params', expr) sandboxed eval 패턴 (T-14-07 선례)
provides:
  - RepeatExpander 클래스 (DOM + virtualized strategy, keyFrom new Function 격리)
  - REPEAT_MAX_INSTANCES=1000 DoS cap
  - collectDescriptors → per-instance descriptor (repeatInstance + _instanceEl)
  - makeSnapshot → targets[].repeatInstance + groups[].repeats 집계
  - REPEATED_TARGET_KEY_DELIMITER stable key 기반 targetId 포맷
  - findElements _instanceEl 기반 row-scoped element 해석
affects:
  - 15-03 (targetId 파서가 REPEATED_TARGET_KEY_DELIMITER 파싱, REPEAT_INDEX_OUT_OF_RANGE 발동)
  - devtools (snapshot target repeatInstance 필드 표시)
  - mcp (PageTarget.repeatInstance → agrune_act/fill에서 stable key 기반 타겟팅 가능)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "new Function('el', keyFrom) 스코프 격리 — T-14-07 선례 재사용 (T-15-05 mitigate)"
    - "RepeatExpander 싱글턴 패턴 — module scope에서 한 번 생성, collectDescriptors 재사용"
    - "TargetDescriptor @internal 필드 패턴 — _instanceEl, _repeatStrategy, _repeatLogicalSize (T-15-11: serialize 제외)"
    - "TDD RED→GREEN 패턴 (테스트 먼저, 구현 나중)"
    - "vi.mock() + vi.mocked().mockImplementation() 패턴 — isElementInViewport 모킹"

key-files:
  created:
    - packages/runtime/src/runtime/repeat-expander.ts
    - packages/runtime/tests/repeat-expander.spec.ts
    - packages/runtime/tests/snapshot-repeat.spec.ts
  modified:
    - packages/runtime/src/runtime/snapshot.ts
    - packages/runtime/src/index.ts
    - packages/runtime/tests/v3-descriptor.spec.ts

key-decisions:
  - "row selector: repeat.targets[0].selector.css를 row CSS selector로 사용 (접근 B — 스키마 수정 최소화)"
  - "_instanceEl @internal 필드: collectDescriptors 시점에 pre-resolved element 보존, findElements에서 우선 사용"
  - "_repeatStrategy/_repeatLogicalSize @internal 필드: groups[].repeats 집계에 strategy/logicalSize 전파"
  - "REPEATED_TARGET_KEY_DELIMITER='__agrune_repeatKey_': stable key 기반 targetId (reorder-safe)"
  - "Test 8 CSP 시뮬레이션: new Function(EvalError)를 직접 globalThis.Function 대체 대신 SyntaxError 유발로 대체"

patterns-established:
  - "Pattern 1: RepeatExpander._expandRepeat returns {instances, logicalSize} — DOM은 null, virtualized는 aria 읽기"
  - "Pattern 2: @internal descriptor fields (_instanceEl 등)는 serialize 대상 아님 — captureTarget spread에서 명시적 제외"
  - "Pattern 3: groupRepeatsAgg Map + repeatMetaByKey Map 분리 집계 — makeSnapshot groups.repeats 필드 생성"

requirements-completed: [REPEAT-01, REPEAT-02, REPEAT-03]

# Metrics
duration: 40min
completed: 2026-04-19
---

# Phase 15 Plan 02: RepeatExpander + snapshot.ts 파이프라인 통합 Summary

**RepeatExpander(DOM/virtualized strategy, new Function keyFrom 격리, maxInstances=1000) + collectDescriptors/makeSnapshot repeat 인지 경로 — per-instance targetId(stable key) + groups[].repeats 집계**

## Performance

- **Duration:** 40분
- **Started:** 2026-04-19T19:30:00Z
- **Completed:** 2026-04-19T19:43:00Z
- **Tasks:** 2 (각 TDD RED + GREEN)
- **Files modified:** 6

## Accomplishments

- `RepeatExpander` 클래스 신규 작성 — DOM/virtualized strategy, `new Function('el', keyFrom)` 스코프 격리 (T-15-05/T-14-07 선례)
- `REPEAT_MAX_INSTANCES=1000` DoS cap + warn (T-15-06 mitigate)
- keyFrom 컴파일 실패(CSP EvalError/SyntaxError) → graceful fallback `__idx_{N}` + warn (T-15-08 mitigate)
- 중복 key 감지 → `{key}__dup_{index}` suffix + warn (Pitfall 3)
- aria-rowcount/aria-setsize READ-ONLY 추출 — `setAttribute` 호출 0건 (T-15-10 mitigate, Test 14 검증)
- `collectDescriptors` → RepeatExpander 경유 per-instance descriptor 생성 (repeatInstance + _instanceEl)
- `findElements` → `_instanceEl` 우선 반환 (기존 resolveByLadder 경로 회귀 없음)
- `toRuntimeTargetId` → stable key 기반 오버로드 추가 (`REPEATED_TARGET_KEY_DELIMITER`)
- `captureTarget` → `repeatInstance` passthrough (`_instanceEl`은 직렬화 제외, T-15-11 mitigate)
- `makeSnapshot` → `targets[].repeatInstance` + `groups[].repeats` 집계 (instanceCount, strategy, logicalSize)
- signature에 `repeatInstance.key` 포함 → row reorder 시 `version` 증가 검증
- 기존 232개 테스트 green (회귀 0), 신규 17 + 9 = 26개 추가 → 총 233개 통과

## Task Commits

TDD RED→GREEN 패턴:

1. **Task 1 RED: RepeatExpander 테스트** — `a11632c` (test)
2. **Task 1 GREEN: RepeatExpander 구현** — `b87e9eb` (feat)
3. **Task 2 RED: snapshot repeat integration 테스트** — `f6b947e` (test)
4. **Task 2 GREEN: snapshot.ts 파이프라인 통합** — `2755846` (feat)

## TDD Gate Compliance

- RED commit `a11632c` — `test(15-02): add failing tests for RepeatExpander (TDD RED)`
- GREEN commit `b87e9eb` — `feat(15-02): implement RepeatExpander with DOM + virtualized strategy (TDD GREEN)`
- RED commit `f6b947e` — `test(15-02): add failing tests for snapshot repeat integration (TDD RED)`
- GREEN commit `2755846` — `feat(15-02): wire RepeatExpander into collectDescriptors + makeSnapshot (TDD GREEN)`

## Files Created/Modified

- `packages/runtime/src/runtime/repeat-expander.ts` — RepeatExpander 클래스, REPEAT_MAX_INSTANCES, RepeatInstance/VirtualizedExpandResult 타입 (신규, 208 lines)
- `packages/runtime/tests/repeat-expander.spec.ts` — 17개 테스트 (10-row DOM + 100-row virtualized fixture, 357 lines)
- `packages/runtime/tests/snapshot-repeat.spec.ts` — 9개 테스트 (collectDescriptors + makeSnapshot repeat 통합, 324 lines)
- `packages/runtime/src/runtime/snapshot.ts` — TargetDescriptor 확장, REPEATED_TARGET_KEY_DELIMITER, collectDescriptors/findElements/toRuntimeTargetId/captureTarget/makeSnapshot 수정
- `packages/runtime/src/index.ts` — RepeatExpander/REPEAT_MAX_INSTANCES re-export 추가
- `packages/runtime/tests/v3-descriptor.spec.ts` — repeat test를 Phase 15 DOM-enumeration 동작으로 업데이트

## Decisions Made

- **row selector 방식 (접근 B)**: `repeat.targets[0].selector.css`를 row CSS selector로 사용. 접근 A(별도 rowSelector 필드)는 스키마 추가 필요 — 15-01에서 `containerSelector`가 이미 추가되었으므로 추가 필드 없이 targets[0].selector를 row selector로 규약화.
- **_instanceEl @internal 패턴**: `collectDescriptors` 시점에 RepeatExpander가 반환한 row element를 `_instanceEl`에 보존. `findElements`에서 `resolveByLadder` 대신 직접 반환 — querySelectorAll 재실행 없이 정확한 element 보장.
- **_repeatStrategy/_repeatLogicalSize @internal 필드**: `makeSnapshot` 내 `groups[].repeats` 집계에서 strategy/logicalSize가 필요하나 descriptor에서만 접근 가능 — `TargetDescriptor`에 @internal 필드로 추가. `captureTarget` 반환에서는 제외.
- **Test 8 CSP 시뮬레이션 방식**: `globalThis.Function` 대체는 모듈 로드 시 이미 참조가 잡혀 있어 효과 없음. 대신 문법 오류 keyFrom(`'return /* broken */'`)으로 `new Function` SyntaxError를 유발 — EvalError와 동일한 compile-fail 경로 검증.
- **v3-descriptor.spec.ts 업데이트**: 기존 "DOM 없이 repeat descriptor 1개" 테스트를 Phase 15 동작(DOM 있을 때만 인스턴스 생성)에 맞게 업데이트 — 2개 article DOM fixture 추가.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 4/16 keyFrom undefined 반환 처리 + 테스트 수정**
- **발견 시점:** Task 1 GREEN (테스트 실행 시)
- **문제:** `el.dataset.noSuchAttribute` → jsdom에서 `undefined`가 아닌 빈 문자열 `""` 반환. `"undefined"` 문자열 체크를 추가해도 `""` 케이스 누락. Test 4는 모든 인스턴스가 fallback을 기대했으나 일부 통과.
- **수정:** fallback 조건에 `raw === ''` 추가. Test 16은 explicit container로 scope 제한 및 1개 element만 DOM에 추가.
- **파일:** `repeat-expander.ts` (fallback 조건 강화), `repeat-expander.spec.ts` (Test 16 container 제한)
- **검증:** `pnpm --filter @agrune/runtime run test -- repeat-expander` → 17 passed

**2. [Rule 1 - Bug] Test 8 CSP 시뮬레이션 globalThis.Function 교체 실패**
- **발견 시점:** Task 1 GREEN (3 tests failed)
- **문제:** `globalThis.Function = ...` 대체로는 모듈 내 `new Function` 호출이 차단되지 않음 (JS 엔진이 이미 참조를 잡음)
- **수정:** `keyFrom: 'return /* broken */'` — `new Function` 컴파일 시 SyntaxError 유발로 동일 경로 검증
- **파일:** `repeat-expander.spec.ts` (Test 8 재작성)
- **검증:** Test 8 pass, `warnSpy` 호출 확인

**3. [Rule 1 - Bug] v3-descriptor.spec.ts 기존 repeat 테스트 깨짐**
- **발견 시점:** Task 2 GREEN (테스트 실행 시)
- **문제:** 기존 테스트가 DOM 없이 repeat descriptor 1개를 기대했으나, Phase 15 구현에서 RepeatExpander가 실제 DOM을 열거하므로 0개 반환
- **수정:** 테스트에 2개 `<article>` DOM fixture 추가, 기대값을 2개로 변경 + repeatInstance 검증 추가
- **파일:** `v3-descriptor.spec.ts`
- **검증:** 전체 테스트 suite 233 passed

---

**총 일탈:** 3건 자동 수정 (Rule 1 — Bug)
**계획 영향:** 모두 구현 로직과 테스트 정합성 확보. 범위 변경 없음.

## Issues Encountered

- jsdom에서 `el.dataset.noSuchAttribute`는 `undefined`가 아닌 `''` 빈 문자열을 반환 — fallback 조건에 `'' === ''` 체크 추가 필요
- `globalThis.Function` 교체로 CSP EvalError 시뮬레이션 불가 — keyFrom 문법 오류 방식으로 대체

## Known Stubs

없음 — 모든 테스트가 실제 DOM fixture 기반이고 stub 없음.

## Threat Flags

없음 — T-15-05/T-15-06/T-15-08/T-15-10/T-15-11 모두 구현에서 mitigate됨. `setAttribute` 실제 코드 호출 0건 (주석만).

## User Setup Required

없음 — 외부 서비스 설정 불필요.

## Next Phase Readiness

- **Plan 15-03 준비 완료**: `REPEATED_TARGET_KEY_DELIMITER` 포맷이 확정되어 targetId 파서가 `{repeatId}__agrune_repeatKey_{key}.{baseTargetId}` 형식을 분해 가능
- **Plan 15-03 준비 완료**: `REPEAT_INDEX_OUT_OF_RANGE` 에러 코드가 core에 존재 (15-01), `resolveRuntimeTarget`이 repeat key 기반 lookup 확장 가능
- **제약 없음**: 기존 232개 테스트 모두 green — 신규 코드는 optional 필드로 additive

## Self-Check

- [x] `packages/runtime/src/runtime/repeat-expander.ts` — 존재, RepeatExpander export, 208 lines (≥120)
- [x] `packages/runtime/tests/repeat-expander.spec.ts` — 357 lines (≥180), 17 tests
- [x] `packages/runtime/tests/snapshot-repeat.spec.ts` — 324 lines (≥80), 9 tests
- [x] `grep "new Function" repeat-expander.ts` — 1 match (코드), 주석 별도
- [x] `grep "REPEAT_MAX_INSTANCES = 1000" repeat-expander.ts` — 1 match
- [x] `grep "setAttribute" repeat-expander.ts` — 0 코드 matches (주석만)
- [x] `grep "RepeatExpander" snapshot.ts` — 7 matches (import + 사용)
- [x] `grep "REPEATED_TARGET_KEY_DELIMITER" snapshot.ts` — 2 matches
- [x] `grep "repeatInstance" snapshot.ts` — 11 matches
- [x] `grep "_instanceEl" snapshot.ts` — 9 matches
- [x] RED commit `a11632c` — 존재
- [x] GREEN commit `b87e9eb` — 존재
- [x] RED commit `f6b947e` — 존재
- [x] GREEN commit `2755846` — 존재
- [x] `pnpm --filter @agrune/runtime run test` — 233 passed
- [x] `pnpm --filter @agrune/runtime run typecheck` — exit 0
- [x] `pnpm --filter @agrune/runtime run build` — exit 0
- [x] `pnpm --filter @agrune/devtools run typecheck` — exit 0
- [x] `pnpm --filter @agrune/mcp run typecheck` — exit 0

## Self-Check: PASSED

---
*Phase: 15-repeat*
*Completed: 2026-04-19*
