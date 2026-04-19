---
phase: 16-record
plan: "01"
subsystem: react
tags: [react, fiber, bridge, bippy, identity, recorder-prep, tdd]

# Dependency graph
requires:
  - phase: 13-react
    provides: FiberIdentityIndex.domToPath WeakMap + AgruneIdentityBridge v1 configurable:false lock
provides:
  - FiberIdentityIndex.getPathByDom(el) — DOM→FiberIdentityPath 역방향 조회 (segment 얕은 복제)
  - AgruneIdentityBridge v2 — resolvePath(el) 메서드 + version bump '1'→'2'
  - v1-shape index graceful fallback (bridge.resolvePath 가 getPathByDom 없으면 null 반환)
affects:
  - 16-02 (RecorderView — picking 모드에서 window.__agrune_identity__.resolvePath(el) 사용)
  - 16-03 (MCP recorder_captured 핸들러 — fiber path 필드 수신)
  - 16-04 (AI authoring skill — manifest 작성 시 동일 selector ladder 포맷 참조)

# Tech tracking
tech-stack:
  added: []  # 신규 의존성 없음 — bippy (기존), @agrune/manifest (기존)만 사용
  patterns:
    - "TDD 2-gate (RED test commit → GREEN impl commit) per task"
    - "Bridge version bump with feature detection (`typeof bridge.resolvePath === 'function'`)"
    - "Defensive delegate (`typeof index.getPathByDom === 'function'`) for shape-compat graceful fallback"
    - "Shallow segment clone on read path (caller mutation safe, FiberPathSegment primitive-only)"

key-files:
  created: []
  modified:
    - packages/react/src/fiber/identity-index.ts  # getPathByDom 메서드 추가
    - packages/react/src/bridge/identity-bridge.ts  # resolvePath + version '2'
    - packages/react/tests/identity-index.spec.ts  # 5 신규 테스트 (describe 'getPathByDom (Phase 16 RECORD-01)')
    - packages/react/tests/identity-bridge.spec.ts  # version '1'→'2' 업데이트 + 5 신규 테스트 (describe 'bridge v2 (Phase 16 RECORD-01)')
    - packages/react/tests/AgruneDevtools.spec.tsx  # test 2 version assertion '1'→'2'

key-decisions:
  - "Bridge v2 는 hard-break 없이 shape-additive. 소비자는 `typeof bridge.resolvePath === 'function'` feature detect 권장"
  - "`version: '2'` 는 literal type bump — v1-shape 과 TS 구조적 호환 유지. 런타임에선 `in` 검사로 coexist 가능"
  - "activateBridge 내부에서 index.getPathByDom 존재 여부를 런타임 확인 (defensive delegate) — mockIndex 나 v1-shape 인덱스와 graceful 상호 운용"
  - "FiberPathSegment 는 3개 primitive 필드만 가지므로 getPathByDom 반환 시 `.map(seg => ({ ...seg }))` 얕은 복제로 caller mutation 격리 충분"

patterns-established:
  - "Phase 16 recorder 전제조건: DOM→path 역방향 경로는 FiberIdentityIndex 한 곳에서만 노출 (bridge 는 thin delegate)"
  - "Bridge 버전 bump 시 기존 version literal 참조 테스트를 TDD RED 커밋 단일 단위로 함께 변경 — partial state 예방"
  - "방어적 delegate: bridge 가 index shape 에 없는 메서드를 부를 때 typeof 확인 후 null fallback — v1/v2 혼재 안정성"

requirements-completed: [RECORD-01]

# Metrics
duration: 26min
completed: "2026-04-19"
---

# Phase 16 Plan 01: IdentityBridge resolvePath Summary

**AgruneIdentityBridge v2 ships — page-context recorder can now reverse-lookup FiberIdentityPath from any DOM element via `window.__agrune_identity__.resolvePath(el)`, unblocking RecorderView picking mode.**

## Performance

- **Duration:** 26 min (≈ Task 1 + Task 2 합산)
- **Started:** 2026-04-19T20:21:09+09:00
- **Completed:** 2026-04-19T20:47:08+09:00
- **Tasks:** 2 (both TDD)
- **Files modified:** 5

## Accomplishments

- `FiberIdentityIndex.getPathByDom(el): FiberIdentityPath | null` 추가 — `domToPath` WeakMap 에 이미 있던 역방향 정보를 public API 로 노출, 얕은 segment 복제로 caller mutation 격리.
- `AgruneIdentityBridge` 인터페이스 확장 — `resolvePath(el): FiberIdentityPath | null` 메서드 + `version: '2'` bump. Phase 13 REACT-02 tamper-proof lock (`configurable: false`) 유지.
- 테스트 회귀 0 — @agrune/react 26 → 36 pass (43 → 53 실제 카운트, identity-bridge 6→11, identity-index 6→11 — Phase 13 이후 AgruneDevtools 등 추가 테스트 포함), @agrune/manifest 75 pass, @agrune/runtime 243 pass.
- `dist/index.d.ts` 빌드 산출물에 `resolvePath` 와 `version: '2'` 포함 확인.
- `grep -rn "version.*'1'"` 결과: 테스트/구현 어디에도 v1 비교 코드 잔존 없음.

## Task Commits

Each task followed TDD 2-gate (RED → GREEN). No REFACTOR commits needed (구현이 15줄 이하로 이미 단순).

1. **Task 1: FiberIdentityIndex.getPathByDom + 5 unit tests** — `867c417` (feat)
   - Task 1 은 이 agent 가 resume 되기 전 커밋됨. RED/GREEN 을 하나로 합친 단일 feat 커밋.

2. **Task 2: AgruneIdentityBridge v2 — resolvePath + version bump**
   - RED: `4be9a99` (test) — 기존 version '1' assertion 을 '2' 로 업데이트 + 5 신규 `bridge v2` describe 테스트 추가 (모두 fail 확인)
   - GREEN: `a7c3060` (feat) — interface 확장, activateBridge 에 `resolvePath` 추가, version '2'

**Plan metadata:** pending — 이 SUMMARY + STATE.md + ROADMAP.md 업데이트를 하나의 docs commit 으로 마무리.

## Files Created/Modified

- `packages/react/src/fiber/identity-index.ts` — `getPathByDom(el)` 메서드 추가. `el instanceof HTMLElement` defensive guard → `domToPath.get(el)` 조회 → 없으면 null, 있으면 segment 얕은 복제로 반환.
- `packages/react/src/bridge/identity-bridge.ts` — `AgruneIdentityBridge` 에 `resolvePath(el)` 추가, `version: '2'` bump, activateBridge 내부에서 `typeof index.getPathByDom === 'function'` 방어적 delegate 로 v1-shape 인덱스와 graceful 상호 운용. JSDoc 에 v1→v2 변경 이력 명시.
- `packages/react/tests/identity-index.spec.ts` — `describe('getPathByDom (Phase 16 RECORD-01)')` 블록에 5 테스트 (A: 등록된 element 반환, B: 미등록 null, C: deindex 후 null, D: 반환 path mutation 격리, E: 비-HTMLElement null).
- `packages/react/tests/identity-bridge.spec.ts` — 기존 6 테스트의 version assertion '1'→'2' 일괄 업데이트. 신규 `describe('bridge v2 (Phase 16 RECORD-01) — resolvePath delegate')` 에 5 테스트 (A: resolvePath 노출, B: version '2' 재확인, C: resolve 회귀 없음, D: configurable:false lock 유지, E: delegate shape + no-throw).
- `packages/react/tests/AgruneDevtools.spec.tsx` — test 2 의 `version === '1'` assertion 을 `'2'` 로 업데이트 (bridge consumer 쪽 버전 체크 회귀 방지).

## Decisions Made

- **Bridge v2 bump 를 hard-break 없이 additive shape 변경으로 진행**: `resolvePath` 는 신규 optional-in-spirit 메서드지만 interface 상 required. 소비자는 `typeof bridge.resolvePath === 'function'` 로 feature detect. v1 bridge 를 가진 오래된 번들이 v2 타입 정의를 참조할 가능성은 낮지만 (npm semver 차단), guard 코드 관례는 recorder 계층에서 강제.
- **activateBridge 에서 defensive delegate (`typeof index.getPathByDom === 'function' ? ... : null`) 채택**: 테스트에서 mockIndex 가 `getPathByDom` 을 구현하지 않아도 bridge v2 호출이 throw 하지 않고 null 을 반환. 프로덕션 경로에선 FiberIdentityIndex 가 항상 메서드를 가지므로 런타임 비용은 무시 가능.
- **getPathByDom 의 반환 복제 전략을 얕은 segment 복제로 고정**: FiberIdentityPath 는 primitive-only field 3개의 배열이므로 `.map(seg => ({ ...seg }))` 로 caller mutation 영향을 완전히 격리 — structured clone / JSON round-trip 오버헤드 없이 충분. Plan action 에서 이미 명시한 방식 그대로 유지.
- **기존 identity-bridge.spec.ts 의 version '1' assertion 을 같은 RED 커밋에서 '2' 로 수정**: version bump 는 소비자 관점에서 동시에 일어나야 하는 단일 시맨틱 변경. 별도 refactor 커밋으로 분리하면 RED → GREEN 사이클에 오염된 히스토리가 남음.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] activateBridge 에 defensive delegate 추가**
- **Found during:** Task 2 RED → GREEN 전환 중 test E 작성 시점
- **Issue:** Plan action 은 `resolvePath(el) { return index.getPathByDom(el) }` 단순 delegate 만 명시했으나, 테스트 mockIndex 는 `getByPath`/`indexFiber`/`deindexFiber` 만 제공하고 `getPathByDom` 은 없음. 단순 delegate 는 `TypeError: index.getPathByDom is not a function` 으로 throw — 테스트 E ("resolvePath 가 호출되어도 throw 하지 않아야 함") fail.
- **Fix:** activateBridge 내부 `resolvePath` 를 `typeof index.getPathByDom !== 'function' ? null : index.getPathByDom(el)` 로 방어. v1-shape index 와 graceful 상호 운용 보장 (bridge v2 가 구버전 index 를 만나도 null 반환, 즉 "bridge 는 나 v2 지만 getPathByDom 정보 없음" 시맨틱).
- **Files modified:** packages/react/src/bridge/identity-bridge.ts
- **Verification:** 53 @agrune/react 테스트 pass, typecheck + build clean
- **Committed in:** a7c3060 (Task 2 GREEN commit)

**2. [Rule 2 - Missing Critical] AgruneDevtools.spec.tsx 의 version '1' assertion 업데이트**
- **Found during:** Task 2 RED 단계 pre-check (`grep -rn "version.*'1'"` 실행)
- **Issue:** Plan Task 2 acceptance 는 `grep -rn "bridge.version"` 결과가 `=== '1'` 비교 없음을 요구. `identity-bridge.spec.ts` 외에도 `AgruneDevtools.spec.tsx` 의 test 2 에 `expect(window.__agrune_identity__?.version).toBe('1')` 가 있었음. 업데이트하지 않으면 Task 2 GREEN 이후 이 테스트가 fail 해 SUMMARY 가 "Self-Check: FAILED" 로 종료.
- **Fix:** 해당 assertion 을 `'2'` 로 변경 + Phase 16 코멘트 추가.
- **Files modified:** packages/react/tests/AgruneDevtools.spec.tsx
- **Verification:** 53 @agrune/react 테스트 pass (AgruneDevtools.spec.tsx 포함)
- **Committed in:** 4be9a99 (Task 2 RED commit)

---

**Total deviations:** 2 auto-fixed (둘 다 Rule 2 — Missing Critical)
**Impact on plan:** 두 auto-fix 모두 plan 의 acceptance criteria 를 충족하기 위한 필수 변경. scope creep 없음 — 기존 surface 확장만 처리.

## Issues Encountered

- 없음. TDD RED 에서 예상한 7개 실패 → GREEN 에서 0 실패로 깨끗하게 전환.

## User Setup Required

None - 외부 서비스 설정 없음. `@agrune/react` 빌드 산출물이 `dist/index.d.ts` 에 `resolvePath` + `version: '2'` 를 노출하므로, 소비자(Phase 16-02 RecorderView) 는 별도 설정 없이 `window.__agrune_identity__.resolvePath(el)` 호출 가능.

## Next Phase Readiness

- **16-02 (RecorderView)**: 이 plan 이 만든 `resolvePath` 가 page-context 에서 picking 모드의 1순위 selector (fiber path) 캡처에 필요한 전제조건. bridge v2 가 게시된 순간 recorder 는 `window.__agrune_identity__?.resolvePath(el)` 한 줄로 사용 가능.
- **16-03 (pending store)** / **16-04 (AI skill)**: 이 plan 에 직접 의존하지 않지만, fiber path 가 pending 파일 `selector.fiber` 필드에 저장되려면 16-02 가 필요 → transitive dependency 체인 연결됨.

## Self-Check

- `packages/react/src/fiber/identity-index.ts` — FOUND
- `packages/react/src/bridge/identity-bridge.ts` — FOUND (resolvePath: 4 match, version '2': 2 match)
- `packages/react/tests/identity-bridge.spec.ts` — FOUND (resolvePath: 20 match)
- `packages/react/tests/identity-index.spec.ts` — FOUND (getPathByDom 5 신규 테스트)
- `packages/react/tests/AgruneDevtools.spec.tsx` — FOUND (version '2' assertion)
- Commit 867c417 — FOUND (Task 1 feat)
- Commit 4be9a99 — FOUND (Task 2 RED)
- Commit a7c3060 — FOUND (Task 2 GREEN)
- `pnpm --filter @agrune/react run test`: 53 pass
- `pnpm --filter @agrune/react run typecheck`: 0 errors
- `pnpm --filter @agrune/react run build`: dist/index.d.ts 에 `resolvePath` + `version: '2'` 확인
- `pnpm --filter @agrune/manifest run test`: 75 pass (regression clean)
- `pnpm --filter @agrune/runtime run test`: 243 pass (regression clean)

## Self-Check: PASSED

## TDD Gate Compliance

- Task 1: RED + GREEN 을 하나의 feat 커밋으로 합침 (`867c417`). Plan 이 `tdd="true"` 이지만 RED 만 별도 커밋하지 않은 점은 resume 전 단계라 이 agent 가 관여하지 않음.
- Task 2: RED `4be9a99` (test) → GREEN `a7c3060` (feat) 2-gate 준수. REFACTOR 단계는 구현 단순성으로 생략 (plan 요구 아님).

---
*Phase: 16-record*
*Completed: 2026-04-19*
