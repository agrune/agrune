---
phase: 15-repeat
plan: "03"
subsystem: runtime
tags: [parser, normalizer, tdd, repeat, mcp, validator, keyFrom, linear-time, ReDoS]

# Dependency graph
requires:
  - phase: 15-repeat
    plan: "01"
    provides: REPEAT_INDEX_OUT_OF_RANGE 에러 코드, PageTarget.repeatInstance
  - phase: 15-repeat
    plan: "02"
    provides: REPEATED_TARGET_KEY_DELIMITER, collectDescriptors per-instance, _instanceEl
  - phase: 11-manifest
    plan: "05"
    provides: validateManifest → exit 1 배선 (CLI 기존 사용)
provides:
  - ParsedRuntimeTargetId 인터페이스 (repeatId?, repeatKey? 필드)
  - parseRuntimeTargetId key-aware 확장 (REPEATED_TARGET_KEY_DELIMITER 인식)
  - resolveRuntimeTarget key-based lookup (repeatInstance 매칭)
  - withDescriptor: REPEAT_INDEX_OUT_OF_RANGE 에러 코드 발동
  - normalizeAgentTargetId (dot-bracket → runtime delimiter, regex-free linear scan)
  - AgentTargetIdParseError 클래스
  - 6개 MCP tool handler에 normalizer 배선 (act/fill/drag/pointer/wait/guide)
  - validateManifest keyFrom 빈 문자열 + 문법 오류 검출 (build-time gate)
affects:
  - devtools (snapshot target key-based navigate)
  - mcp (AI가 dot-bracket targetId로 repeat instance 직접 조작 가능)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dot-bracket → runtime delimiter 정규화 (AI usability ↔ runtime wire format 분리)"
    - "regex-free linear scan (indexOf/lastIndexOf/slice 기반 O(n)) — ReDoS 방어 (T-15-12)"
    - "ParsedRuntimeTargetId 인터페이스 — parseRuntimeTargetId 반환 타입 명시화"
    - "tryNormalizeTargetId 헬퍼 팩토리 — 6개 tool handler 동일 배선 중복 제거"
    - "TDD RED→GREEN 순서 — 3 task 각각 2 commit (test → feat)"
    - "new Function compile-only gate — body 실행 없음 (T-15-15 mitigate)"
    - "CSP graceful skip — SyntaxError만 실패, EvalError는 pass (T-15-16 Pitfall 2)"

key-files:
  created:
    - packages/mcp/src/target-id-normalizer.ts
    - packages/runtime/tests/target-id-parser.spec.ts
    - packages/mcp/tests/target-id-normalizer.spec.ts
  modified:
    - packages/runtime/src/runtime/snapshot.ts
    - packages/runtime/src/runtime/command-handlers.ts
    - packages/mcp/src/mcp-tools.ts
    - packages/manifest/src/validator.ts
    - packages/manifest/tests/validator.spec.ts

key-decisions:
  - "ParsedRuntimeTargetId 인터페이스 신설: parseRuntimeTargetId 반환 타입을 명시해 repeatId?/repeatKey? 필드 포함 — command-handlers에서 타입 안전하게 접근"
  - "leftmost '.' 분리 전략: REPEATED_TARGET_KEY_DELIMITER 이후 rest에서 첫 번째 '.'으로 key/baseTargetId 분리 — key에 dot 포함 불가 (repeat-expander 규약)"
  - "rightmost ']' 스캔: normalizeAgentTargetId에서 lastIndexOf(']')로 nested bracket 지원 (Test 4: posts[postId=abc[123]].like_btn)"
  - "tryNormalizeTargetId 헬퍼: 6개 tool handler에서 동일한 normalize+에러 처리 로직 재사용 — 인라인 try/catch 6회 반복 제거"
  - "SyntaxError만 실패 처리: new Function compile에서 EvalError(CSP 차단)는 graceful skip, SyntaxError만 ladderError로 추가"
  - "Test 5 keyFrom 표현식 수정: el.foo; String() 형태는 return String(expr) 래핑 시 SyntaxError 유발 — el.dataset.postId || el.getAttribute('data-id') 형태로 변경 (표현식으로 유효)"

patterns-established:
  - "Pattern 1: AI layer normalize → runtime layer 해석 분리 — MCP가 dot-bracket 변환, runtime은 delimiter만 해석"
  - "Pattern 2: ParsedRuntimeTargetId 반환 타입 — nullable? 대신 optional 필드로 분기 표현"
  - "Pattern 3: validator keyFrom gate — compile-only eval, body 미실행, CSP graceful"

requirements-completed: [REPEAT-01, REPEAT-02, REPEAT-03]

# Metrics
duration: 25min
completed: 2026-04-19
---

# Phase 15 Plan 03: dot-bracket 파서 + MCP 배선 + keyFrom 빌드 게이트 Summary

**regex-free linear-time dot-bracket 파서(normalizeAgentTargetId) + 6개 MCP tool 배선 + parseRuntimeTargetId key-aware 확장 + REPEAT_INDEX_OUT_OF_RANGE 발동 + validateManifest keyFrom compile-only gate**

## Performance

- **Duration:** 25분
- **Started:** 2026-04-19T19:45:00Z
- **Completed:** 2026-04-19T20:10:00Z
- **Tasks:** 3 (각 TDD RED + GREEN)
- **Files modified:** 7

## Accomplishments

- `ParsedRuntimeTargetId` 인터페이스 신설 — `repeatId?`, `repeatKey?` optional 필드로 key-aware parsing 타입 안전
- `parseRuntimeTargetId` 확장 — `REPEATED_TARGET_KEY_DELIMITER` 우선 체크 → repeatId/key/baseTargetId 분해, 기존 index-delim 경로 회귀 없음
- `resolveRuntimeTarget` 확장 — repeat key 기반 lookup (`repeatInstance` 매칭), key 없으면 `null`
- `withDescriptor` 확장 — null resolve 시 `parsed.repeatId && parsed.repeatKey` 분기 → `REPEAT_INDEX_OUT_OF_RANGE` 에러 코드 발동
- `normalizeAgentTargetId` 신규 — dot-bracket `posts[postId=abc123].like_btn` → `posts__agrune_repeatKey_abc123.like_btn` (indexOf/slice 기반, regex 없음, ReDoS 방어)
- `AgentTargetIdParseError` 클래스 — bracket 불균형, `=` 없음, 빈 key, dot 없음 오류 타입화
- rightmost `]` 스캔으로 nested bracket 지원 (key에 `[...]` 포함 가능)
- 이미 runtime 형식이면 passthrough (T-15-17 accept)
- `tryNormalizeTargetId` 헬퍼 + 6개 MCP tool handler 배선 (agrune_act/fill/drag/pointer/wait/guide)
- agrune_drag: `sourceTargetId` + `destinationTargetId` 각각 normalize
- agrune_pointer: `targetId` optional이므로 `typeof` 체크 후 normalize
- `validateManifest` keyFrom gate — 빈 문자열/공백 → `ok:false`, SyntaxError → `ok:false (compile failed)`, CSP 차단 → graceful skip
- CLI smoke test: empty keyFrom manifest → exit 1 확인
- 기존 233 + 10 = 243 (runtime), 94 + 16 = 110 (mcp), 67 + 8 = 75 (manifest) tests pass

## Task Commits

TDD RED→GREEN 패턴:

1. **Task 1 RED: runtime targetId parser 테스트** — `cd3ba6f` (test)
2. **Task 1 GREEN: parseRuntimeTargetId + REPEAT_INDEX_OUT_OF_RANGE** — `4484783` (feat)
3. **Task 2 RED: dot-bracket normalizer 테스트** — `e775335` (test)
4. **Task 2 GREEN: normalizeAgentTargetId + MCP 배선** — `445b92b` (feat)
5. **Task 3 RED: keyFrom gate 테스트** — `0679524` (test)
6. **Task 3 GREEN: validateManifest keyFrom 검증** — `658b06a` (feat)

## TDD Gate Compliance

- RED commit `cd3ba6f` — `test(15-03): add failing tests for targetId parser + out-of-range (TDD RED)`
- GREEN commit `4484783` — `feat(15-03): parseRuntimeTargetId key-aware + REPEAT_INDEX_OUT_OF_RANGE dispatch (TDD GREEN)`
- RED commit `e775335` — `test(15-03): add failing tests for dot-bracket normalizer (TDD RED)`
- GREEN commit `445b92b` — `feat(15-03): normalizeAgentTargetId + wire into 6 MCP tool handlers (TDD GREEN)`
- RED commit `0679524` — `test(15-03): add failing tests for keyFrom gate (TDD RED)`
- GREEN commit `658b06a` — `feat(15-03): validateManifest rejects empty/broken keyFrom (TDD GREEN)`

## Files Created/Modified

- `packages/mcp/src/target-id-normalizer.ts` — normalizeAgentTargetId + AgentTargetIdParseError (신규, 110 lines)
- `packages/runtime/tests/target-id-parser.spec.ts` — 10개 테스트 (parseRuntimeTargetId + resolveRuntimeTarget + withDescriptor, 신규)
- `packages/mcp/tests/target-id-normalizer.spec.ts` — 16개 테스트 (normalizer + ReDoS + MCP 배선, 신규, 217 lines)
- `packages/runtime/src/runtime/snapshot.ts` — ParsedRuntimeTargetId 인터페이스 + parseRuntimeTargetId key-aware + resolveRuntimeTarget key lookup 확장
- `packages/runtime/src/runtime/command-handlers.ts` — withDescriptor REPEAT_INDEX_OUT_OF_RANGE 분기 추가
- `packages/mcp/src/mcp-tools.ts` — import normalizer + tryNormalizeTargetId 헬퍼 + 6개 tool handler 배선
- `packages/manifest/src/validator.ts` — keyFrom 빈 문자열 + SyntaxError gate 추가
- `packages/manifest/tests/validator.spec.ts` — keyFrom validation 8개 테스트 추가

## Decisions Made

- **ParsedRuntimeTargetId 인터페이스 신설**: 기존 `parseRuntimeTargetId`는 익명 객체 타입을 반환했으나, `repeatId?/repeatKey?` 추가 시 인터페이스로 명시화 — typecheck 강화 및 소비자 코드 가독성 향상.
- **leftmost '.' 분리 전략**: `REPEATED_TARGET_KEY_DELIMITER` 이후 rest에서 첫 번째 `.`으로 key/baseTargetId 분리. key 자체에 dot을 포함시키지 않는 규약 (Phase 15-02 RepeatExpander가 `.` 없는 key 생성). baseTargetId는 dot 포함 가능 (`inner.deep` 형태).
- **SyntaxError vs EvalError 분리**: `new Function` compile 실패 중 `SyntaxError`만 ladderError로 처리. `EvalError`(CSP 환경)와 기타 오류는 graceful skip — T-15-16 Pitfall 2 방어.
- **Test 5 표현식 수정**: 플랜에서는 `'el.foo; String("ok")'`를 compile OK로 설명했으나, `return String(el.foo; String("ok"))` 형태로 래핑 시 JavaScript 파서가 SyntaxError 발생. 실제 compile-valid 표현식 `el.dataset.postId || el.getAttribute('data-id')`으로 변경 — 플랜 의도(compile 검증만, semantic 제외)는 동일하게 달성.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 5 keyFrom 표현식 SyntaxError 수정**
- **발견 시점:** Task 3 GREEN (테스트 실행 시)
- **문제:** 플랜에서 `'el.foo; String("ok")'`를 compile-valid 예시로 제시했으나, validator가 `new Function('el', 'return String(el.foo; String("ok"))')` 형태로 래핑하므로 SyntaxError 발생 → Test 5 실패
- **수정:** `"el.dataset.postId || el.getAttribute('data-id')"` — 표현식으로 유효한 OR fallback 형태 사용
- **파일:** `packages/manifest/tests/validator.spec.ts`
- **검증:** `pnpm --filter @agrune/manifest run test` → 75 passed

---

**총 일탈:** 1건 자동 수정 (Rule 1 - Bug)  
**계획 영향:** 플랜 의도(compile-only 검증, semantic 제외) 동일하게 달성. 테스트 표현식만 수정. 범위 이탈 없음.

## Issues Encountered

- `new Function` compile에서 `return String(expr)` 래핑 시 statement 형태의 keyFrom(`el.foo; String(...)`)이 SyntaxError 유발 — 표현식 형태만 valid. validator 동작 자체는 정확함.

## Known Stubs

없음 — 모든 구현이 실제 동작 기반이고 stub 없음.

## Threat Flags

없음 — T-15-12/T-15-13/T-15-14/T-15-15/T-15-16/T-15-17/T-15-18 모두 plan의 threat_model에 포함되어 있고 구현에서 mitigate됨.

## User Setup Required

없음 — 외부 서비스 설정 불필요.

## Next Phase Readiness

- **Phase 15 완료**: AI 에이전트가 `posts[postId=abc123].like_btn` dot-bracket targetId → MCP normalize → runtime key lookup → 정확한 DOM element 조작 가능
- **REPEAT-01/02/03 요구사항 모두 충족**: 타입(15-01), 런타임(15-02), 파서+게이트(15-03)
- **validate CLI**: empty/broken keyFrom manifest → exit 1 (빌드 타임 gate 완성)
- **ReDoS 방어**: normalizeAgentTargetId는 indexOf/slice 기반 O(n), regex 없음

## Self-Check

- [x] `packages/mcp/src/target-id-normalizer.ts` — 존재, 110 lines (≥80)
- [x] `packages/mcp/tests/target-id-normalizer.spec.ts` — 217 lines (≥120)
- [x] `packages/runtime/tests/target-id-parser.spec.ts` — 존재, 10 tests (≥10)
- [x] `grep "new RegExp\|/\[" packages/mcp/src/target-id-normalizer.ts` — 0 matches (regex-free)
- [x] `grep "tryNormalizeTargetId" packages/mcp/src/mcp-tools.ts` — 8 matches (6 tool 배선)
- [x] `grep "REPEAT_INDEX_OUT_OF_RANGE" packages/runtime/src/runtime/command-handlers.ts` — 1 match
- [x] `grep "keyFrom" packages/manifest/src/validator.ts` — 4 matches
- [x] `pnpm --filter @agrune/runtime run test` — 243 passed
- [x] `pnpm --filter @agrune/mcp run test` — 110 passed
- [x] `pnpm --filter @agrune/manifest run test` — 75 passed
- [x] `pnpm -r run typecheck` — all pass
- [x] `pnpm -r run build` — all pass
- [x] CLI smoke: empty keyFrom → exit 1 확인
- [x] RED commits: cd3ba6f, e775335, 0679524 — 존재
- [x] GREEN commits: 4484783, 445b92b, 658b06a — 존재

## Self-Check: PASSED

---
*Phase: 15-repeat*
*Completed: 2026-04-19*
