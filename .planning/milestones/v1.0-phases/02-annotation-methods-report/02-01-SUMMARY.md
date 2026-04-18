---
phase: 02-annotation-methods-report
plan: "01"
subsystem: research
tags: [research, annotation, direct-methods]
provides:
  - direct annotation taxonomy
affects:
  - phase 4 synthesis
tech-stack:
  added: []
  patterns:
    - ownership-aware method definition
key-files:
  created:
    - .planning/phases/02-annotation-methods-report/02-ANNOTATION-METHODS-REPORT.md
  modified: []
key-decisions:
  - Direct methods are split by where semantics originate.
patterns-established:
  - Distinguish app-owned metadata, accessibility semantics, and web bridge semantics.
duration: 30min
completed: 2026-04-07
---

# Phase 2: Annotation Methods Report Summary

**“앱에 직접 annotation”을 세 가지 다른 integration model 로 분해해 direct methods taxonomy 를 만들었다.**

## Performance
- **Duration:** 30min
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- first-party SDK, accessibility-carrier, embedded web/electron bridge 를 서로 다른 direct method 로 정의했다.
- 각 방법이 어느 ownership model 에서 성립하는지 분명히 했다.

## Task Commits
1. **Task 1: Define direct annotation cases** - `local-only (commit_docs=false)`

## Files Created/Modified
- `.planning/phases/02-annotation-methods-report/02-ANNOTATION-METHODS-REPORT.md` - direct methods definitions

## Decisions & Deviations
accessibility-carrier 는 “엄밀한 agrune SDK”는 아니지만, 의도적으로 노출되는 semantic layer 라는 점에서 direct method 로 포함했다.

## Next Phase Readiness
Phase 3 는 이와 대비되는 non-direct alternatives 만 다루면 된다.
