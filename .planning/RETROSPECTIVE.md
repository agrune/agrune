# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Research

**Shipped:** 2026-04-18
**Phases:** 4 | **Plans:** 9 | **Sessions:** 1 (autonomous run)

### What Was Built

- **Phase 1 — Channel Inventory**: browser gold path 고정 + DOM/CDP, AX, Apple events, ScreenCapture, Vision, manual profiles를 하나의 capability matrix로 정리, 연구 전반에 적용할 perception/action 정책 고정
- **Phase 2 — Annotation Methods Report**: 직접 어노테이션을 3가지 integration model로 분해 (direct methods taxonomy), universal coverage 불가 → accessibility-carrier + embedded web bridge 현실 조합 결론
- **Phase 3 — Annotation Alternatives Report**: AX harvesting / manual profiles / vision fallback 3대 대체 전략, 핵심은 candidate generation 이 아닌 verification loop
- **Phase 4 — Product Synthesis**: 6개 케이스 비교 프레임 + 최종 GO/NO-GO — `browser precision 유지 + AX-first hybrid expansion` GO, universal direct annotation 과 vision-first positioning NO-GO

### What Worked

- **research-only milestone 스코프 고정**: 구현을 Out of Scope로 명시해서 실험 범주가 새지 않음
- **phase 간 의존성 직렬화 (1→2→3→4)**: 뒤 phase 가 앞 phase 결과를 토대로 synthesis 하는 구조라 재작업이 없었음
- **autonomous 실행**: 4 phase × 9 plan 을 단일 세션 3.3시간에 처리. GSD의 plan/summary contract 덕분에 context 이 깨지지 않음
- **최종 NO-GO 명시**: 탈락한 전략(universal direct, vision-first)을 추측이 아닌 문서화된 근거와 함께 배제 → 다음 milestone 의 scope drift 방지

### What Was Inefficient

- **Milestone lifecycle 지연**: 연구 실행 완료(2026-04-07) 후 archive/cleanup 까지 11일 경과. STATE.md `stopped_at` 에 pending confirmation 으로만 남아있다가 사용자 재진입으로 처리됨
- **Requirements 체크박스가 PROJECT.md에서 stale**: REQUIREMENTS.md traceability 는 전부 Complete인데 PROJECT.md Active 섹션은 unchecked 상태로 남아있어 진척 인지에 혼선
- **git tracking 없음**: `commit_docs: false` + 루트 저장소에 초기 커밋 없음 → safety commit / git rm / git tag 전부 불가능 → milestone close 워크플로우의 안전망이 로컬 파일에만 의존

### Patterns Established

- **research milestone 패턴**: "구현 전에 go/no-go 결정 패키지를 만든다" — feasibility 가 불확실한 확장 방향에는 구현보다 먼저 research milestone 을 두는 게 유효함이 확인됨
- **verification loop > candidate generation**: Phase 3에서 정립된 원칙. probabilistic 요소가 들어올 때 항상 verification 단계가 주인공이 되어야 함
- **capability matrix as single source**: 여러 채널/방식을 비교할 때 통합 matrix 를 기준점으로 먼저 만들고 후속 phase 들이 전부 그것을 참조
- **NO-GO 항목도 Out of Scope에 근거와 함께 명시**: 다음 milestone에서 같은 논쟁 재발 방지

### Key Lessons

1. **Milestone close는 "다 했다"와 별개의 의식적 단계다** — archive/cleanup 을 명시적으로 트리거하지 않으면 stopped_at 에 머무른다. Phase complete ≠ milestone complete.
2. **연구 milestone은 NO-GO 결론도 deliverable 로 취급해야 한다** — 시간을 아껴주는 건 GO 결론만이 아니라 배제된 옵션의 근거다.
3. **Tech debt 는 milestone audit 에서 carrying forward 로 명시** — "prototype 단계 compatibility matrix 실측", "manual profile/vision fallback UX 추가 설계" 가 v1.0 audit 에 기록되어 다음 milestone 의 initial Active 후보가 됨.
4. **git-less `.planning/` workspace 는 milestone close 안전망을 스스로 만들어야 한다** — 파일시스템 archive 가 유일한 복구 수단이므로 archive 를 삭제 전에 생성하는 순서가 더욱 중요.

### Cost Observations

- Model mix: planner=opus, executor=sonnet (balanced profile) — 정확한 사용량 집계는 session log 기반이라 이번에는 추정 불가
- Total execution time: 3.3 hours across 9 plans (avg 22 min/plan)
- Notable: autonomous 실행이라 session 단위 handoff cost 없음. 다음 milestone 은 구현 포함이라 avg/plan 증가 예상.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 1 (autonomous) | 4 | research-only scope, GSD autonomous execution 최초 적용 |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | N/A (research) | N/A | N/A |

### Top Lessons (Verified Across Milestones)

1. research milestone은 NO-GO 결론도 동등한 deliverable — v1.0 에서 최초 확립, 다음 milestone 에서 재검증 예정
2. milestone close는 phase complete 와 분리된 의식적 단계 — v1.0 에서 11일 지연으로 확인

*다른 lessons는 v1.1 이후 교차 검증 시 상승 이동.*
