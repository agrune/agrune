---
phase: 15-repeat
plan: "01"
subsystem: manifest
tags: [zod, typescript, repeat, selector-ladder, error-codes]

# Dependency graph
requires:
  - phase: 11-manifest
    provides: ManifestRepeat 스키마, SelectorLadderSchema, defineRepeat 빌더
  - phase: 12-inject
    provides: PageSnapshot v3 schemaVersion, PageTarget, PageSnapshotGroup 타입
provides:
  - ManifestRepeat.containerSelector?: SelectorLadder (optional, zod 검증 포함)
  - PageTarget.repeatInstance?: { repeatId, index, key }
  - PageSnapshotGroup.repeats?: Array<{ repeatId, strategy, instanceCount, logicalSize }>
  - REPEAT_INDEX_OUT_OF_RANGE in COMMAND_ERROR_CODES
affects:
  - 15-02 (RepeatExpander가 containerSelector 소비)
  - 15-03 (targetId 파서가 REPEAT_INDEX_OUT_OF_RANGE 발동, PageTarget.repeatInstance emit)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "additive optional 필드 확장 패턴 — schemaVersion:3 유지, breaking 없음"
    - "TDD RED/GREEN 순서 — 타입 음성 테스트(@ts-expect-error) + zod 런타임 검증 분리"
    - "defineRepeat 빌더를 ManifestRepeat 타입 그대로 받도록 단순화 (input: ManifestRepeat)"

key-files:
  created:
    - packages/manifest/tests/schema.spec.ts
    - packages/core/tests/page-target-repeat.spec.ts
  modified:
    - packages/manifest/src/schema.ts
    - packages/manifest/src/builders.ts
    - packages/core/src/index.ts

key-decisions:
  - "defineRepeat 빌더 input 타입을 ManifestRepeat 직접 참조로 변경 — 별도 inline 타입 대신 DRY"
  - "containerSelector를 strategy 필드 아래, targets 위에 배치 — 논리적 순서"
  - "REPEAT_INDEX_OUT_OF_RANGE를 MACRO_POSTCONDITION_FAILED 바로 아래에 배치"

patterns-established:
  - "Pattern 1: zod optional 확장 — SelectorLadderSchema.optional() 재사용으로 refine 로직 중복 없음"
  - "Pattern 2: core 타입 additive 확장 — 기존 fixture 수정 없이 optional 필드만 추가"

requirements-completed: [REPEAT-01, REPEAT-02, REPEAT-03]

# Metrics
duration: 15min
completed: 2026-04-19
---

# Phase 15 Plan 01: 타입 계약 확장 Summary

**ManifestRepeat.containerSelector zod 확장 + PageTarget.repeatInstance / PageSnapshotGroup.repeats optional 추가 + REPEAT_INDEX_OUT_OF_RANGE 에러 코드 — schemaVersion:3 additive 확장**

## Performance

- **Duration:** 15분
- **Started:** 2026-04-19T10:13:00Z
- **Completed:** 2026-04-19T10:28:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `ManifestRepeat.containerSelector?: SelectorLadder` 추가 — RepeatExpander가 소비할 컨테이너 선택자 타입 계약 확정
- `RepeatSchema` zod에 `containerSelector: SelectorLadderSchema.optional()` 추가 — AtLeastOne refine 재사용으로 빈 객체 거부
- `PageTarget.repeatInstance?: { repeatId, index, key }` 추가 — AI 에이전트가 개별 repeat 인스턴스 타겟 식별 가능
- `PageSnapshotGroup.repeats?: Array<{ repeatId, strategy, instanceCount, logicalSize }>` 추가 — snapshot에 repeat 메타 노출
- `REPEAT_INDEX_OUT_OF_RANGE` 에러 코드 추가 — Plan 15-03 targetId 파서가 발동 예정
- runtime, devtools, mcp typecheck 통과 — 기존 132개 테스트 모두 그대로 통과

## Task Commits

각 태스크는 개별 커밋:

1. **Task 1: ManifestRepeat.containerSelector + zod + 타입 음성 테스트** - `966a9a8` (feat)
2. **Task 2: PageTarget.repeatInstance + PageSnapshotGroup.repeats + REPEAT_INDEX_OUT_OF_RANGE** - `91b6724` (feat)

**Plan 메타데이터 커밋:** (아래 참조)

## Files Created/Modified

- `packages/manifest/src/schema.ts` — ManifestRepeat interface에 containerSelector 추가, RepeatSchema zod 확장
- `packages/manifest/src/builders.ts` — defineRepeat 빌더 input 타입을 ManifestRepeat 직접 참조로 변경
- `packages/manifest/tests/schema.spec.ts` — 신규: containerSelector 타입 + zod 런타임 테스트 14케이스
- `packages/core/src/index.ts` — COMMAND_ERROR_CODES, PageSnapshotGroup, PageTarget 확장
- `packages/core/tests/page-target-repeat.spec.ts` — 신규: repeatInstance / repeats / REPEAT_INDEX_OUT_OF_RANGE 테스트 10케이스

## Decisions Made

- **defineRepeat 빌더 단순화**: 기존에는 `{ repeatId, template, keyFrom, ... }` 인라인 타입을 별도로 정의했으나 `ManifestRepeat` 타입을 직접 참조하도록 변경. `containerSelector`가 추가될 때마다 빌더도 동기화해야 하는 문제 제거.
- **containerSelector 위치**: `strategy` 필드 아래, `targets` 위에 배치 — "전략 설정 → 컨테이너 지정 → 타겟 목록" 논리 순서.
- **에러 코드 위치**: MACRO 블록 직후, `CANVAS_PAN_FAILED` 바로 위 — Phase 14-03 패턴과 일관성.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] defineRepeat 빌더 input 타입 불일치 수정**
- **발견 시점:** Task 1 typecheck 실행 시
- **문제:** `defineRepeat` 빌더가 `{ repeatId, template, keyFrom, nameFrom?, strategy, targets }` 인라인 타입을 사용해 `containerSelector`가 unknown property로 거부됨
- **수정:** 빌더 input 타입을 `ManifestRepeat` 직접 참조로 변경 (`input: ManifestRepeat`)
- **수정 파일:** `packages/manifest/src/builders.ts`
- **검증:** `pnpm --filter @agrune/manifest run typecheck` exit 0
- **커밋:** `966a9a8` (Task 1 커밋에 포함)

---

**총 일탈:** 1건 자동 수정 (Rule 1 - 빌더 타입 불일치 버그)
**계획 영향:** 빌더 단순화는 오히려 코드 품질 향상. 범위 이탈 없음.

## Issues Encountered

- `zod safeParse` 에러 구조: `result.error.errors` → `result.error.issues`로 수정 필요. zod v3에서 `ZodError.errors`는 `ZodError.issues`의 alias지만 테스트 환경에서 undefined 반환 — `issues`로 수정해 해결.

## User Setup Required

없음 — 외부 서비스 설정 불필요.

## Next Phase Readiness

- **Plan 15-02 준비 완료**: `ManifestRepeat.containerSelector` 타입이 확정되어 RepeatExpander가 소비 가능
- **Plan 15-03 준비 완료**: `PageTarget.repeatInstance` + `REPEAT_INDEX_OUT_OF_RANGE` 타입이 확정되어 targetId 파서 + captureTarget 확장 가능
- **제약 없음**: 모든 필드 optional — 기존 코드 수정 없이 15-02/15-03이 점진적으로 emit 가능

---
*Phase: 15-repeat*
*Completed: 2026-04-19*
