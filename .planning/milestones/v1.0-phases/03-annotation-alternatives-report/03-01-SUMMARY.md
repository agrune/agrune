---
phase: 03-annotation-alternatives-report
plan: "01"
subsystem: research
tags: [research, alternatives, fallback]
provides:
  - alternative strategy taxonomy
affects:
  - phase 4 synthesis
tech-stack:
  added: []
  patterns:
    - coverage-tier separation
key-files:
  created:
    - .planning/phases/03-annotation-alternatives-report/03-ANNOTATION-ALTERNATIVES-REPORT.md
  modified: []
key-decisions:
  - Alternatives are split by source of structure: AX, user-authored profile, or vision.
patterns-established:
  - OCR-only is not a standalone product strategy.
duration: 25min
completed: 2026-04-07
---

# Phase 3: Annotation Alternatives Report Summary

**직접 어노테이션이 없을 때의 대체 전략을 AX harvesting, manual profiles, vision fallback 으로 분리했다.**

## Performance
- **Duration:** 25min
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- 대체 전략 3가지의 구조 원천을 분리했다.
- OCR-only 가 왜 깨지는지 보고서 전제로 못 박았다.

## Task Commits
1. **Task 1: Define non-direct alternatives** - `local-only (commit_docs=false)`

## Files Created/Modified
- `.planning/phases/03-annotation-alternatives-report/03-ANNOTATION-ALTERNATIVES-REPORT.md` - alternatives definitions

## Decisions & Deviations
AX harvesting 은 direct method 가 아니라 alternative tier 로 두었다. 이유는 앱이 agrune 를 위해 직접 노출한 semantics 가 아니기 때문이다.

## Next Phase Readiness
Phase 4 는 이제 direct tier 와 coverage tier 를 한 matrix 에 합칠 수 있다.
