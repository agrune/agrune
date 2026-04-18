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

## Milestone: v1.1 — Browser Completion

**Shipped:** 2026-04-18
**Phases:** 6 | **Plans:** 19 | **Sessions:** 1 (autonomous run)

### What Was Built

- **Phase 5 — Input Reliability**: `agrune_fill`을 CDP `Input.insertText`/`dispatchKeyEvent`로 통일, `canReceiveTextInput`/`detectMaskedInput`/`selectAllAndDelete` primitives, 4 새 `fill-cdp.spec.ts` 테스트 잠금
- **Phase 6 — Stability & Recovery**: `RecoverySupervisor` (backoff + dedupe), `CdpConnection.onDisconnect`, `ChromeLauncher.onUnexpectedExit`, `reprepareAllTargets` resync, `CONNECTION_LOST`/`CHROME_CRASHED`/`RECOVERY_FAILED` 에러 + mode-aware guidance
- **Phase 7 — Multi-Tab Session UX**: `SessionManager.activeSessionId` + `touchSession` on success, `resolveTabId` precedence (explicit > active > first-ready > first), `agrune_focus` MCP 도구, 모든 응답에 `session` meta
- **Phase 8 — DevTools Webapp**: `CommandBroker` (500-event FIFO), `HitlController` (`handleToolCall` gate, pause/resume/step/skip), `logs-view.ts` 필터 + 실패 진단 카드, `sessions-view.ts` ACTIVE 배지 + Focus 버튼
- **Phase 9 — Quality Infrastructure**: `packages/e2e/` (Playwright, 8 specs: overlay/modal/HITL/annotation-scan), `packages/core/src/annotation-lint/` (AST scanner + Vite plugin + CLI), `.github/workflows/ci.yml` `build-test` + `e2e` 잡 배선, Phase 8 devtools-server race-condition 4 테스트 수정, `@agrune/browser` strict unused-locals 켜짐
- **Phase 10 — Docs & Distribution**: README·AGENTS·improvement-notes rewrite, `docs/notes/` archive banners, CLI `--help`/`-h`/`--version`/`-v` short-circuit + flag table, automation profile section (new/clone/attach), `.github/profile/README.md` rewritten (external repo commit, push manual)

### What Worked

- **Sequential phase 의존성 (5→6→7→8→9→10) 엄격화**: 각 phase가 이전 phase 산출물을 실제 dependency로 삼아서 재작업 zero. Phase 9가 Phase 8의 pre-existing 4 race test failure까지 함께 해결한 게 특히 효율적
- **VERIFICATION.md를 phase close 직후 작성**: milestone audit 시점에 phase-level 증거가 전부 체크되어 있어서 audit이 aggregation만 남음
- **"Pre-existing"을 scope 밖으로 명시**: Phase 5/6/7이 `ws` 모듈 빌드 실패를 각자 자기 scope 밖 이슈로 명시하고 Phase 9에서 통합 처리 → scope creep 차단
- **tech debt를 phase audit 안에 inline으로 기록**: Phase 9의 "Tech debt addressed" 섹션처럼 scope-specified 해결책과 deferred 항목을 구분

### What Was Inefficient

- **SUMMARY.md frontmatter `one_liner`·`requirements_completed` 미작성**: 자동 추출 도구(`gsd-tools summary-extract`)가 이 필드를 찾았지만 모든 summary에서 비어 있어서 milestone-close CLI가 "Status:"/"Executed:"/"Completed:" 같은 헤더를 긁어왔고 MILESTONES.md를 수동 복구해야 했음
- **`gsd-tools audit-open`이 ReferenceError로 실패**: milestone-close 워크플로의 pre-close artifact audit이 도구 버그 때문에 skip됨. 수동 audit으로 우회
- **External `.github` repo의 cross-repo 단계**: DOCS-02가 별도 git 저장소라는 점이 phase 실행 내내 특별 처리 필요했고, 최종적으로 user manual push로 남음

### Patterns Established

- **CDP 도메인 분리 원칙**: 입력·네비게이션·스크립트 주입을 전부 DOM setter가 아니라 CDP 네이티브 도메인으로 통일. 프레임워크 무관 결정성 확보
- **Supervisor 패턴**: 이벤트 소스가 여러 개(connection loss + crash)인 self-healing은 driver에 산재시키지 말고 state machine을 가진 supervisor로 분리
- **Session meta in every response**: `wasActive`/`becameActive`를 모든 도구 응답에 삽입 → 클라이언트가 active 전환을 tracking 가능
- **E2E framework로서 별도 workspace package**: `@playwright/test`가 agrune 본체 dependency를 오염시키지 않도록 `packages/e2e/` 독립
- **Build-time linter + Vite plugin 듀얼 제공**: CLI(`agrune-lint`) 한 경로 + 프로젝트 빌드에 직접 꽂히는 Vite plugin 한 경로

### Key Lessons

1. **phase SUMMARY.md의 frontmatter는 milestone close의 정확도에 직접 영향** — `one_liner`/`requirements_completed` 필드를 꼭 채워야 `gsd-tools milestone complete`가 의미 있는 아카이브를 만든다. 이번엔 수동으로 복구했지만 다음 milestone은 phase plan 단계에서 frontmatter 템플릿을 enforce 해야 함
2. **pre-existing 이슈의 scope boundary 명시가 sequential phase 전체의 속도를 결정** — Phase 5/6/7이 `ws` 빌드 실패를 각자 scope 밖으로 선언하고 Phase 9 단일 지점에서 처리 → phase-per-phase의 scope creep 방지에 유효
3. **milestone을 같은 날 audit/complete/cleanup까지 묶어 실행하면 stale context 비용이 0** — v1.0은 4 phase 연구 완료 후 11일 지연으로 close에 별도 세션 필요했던 반면, v1.1은 같은 autonomous run에서 6 phase + audit + close까지 연속 처리. phase complete ≠ milestone complete라는 v1.0 lesson을 직접 반영
4. **cross-repo artifact(external `.github/profile`)는 phase scope 안에서 "commit + documented manual push" 패턴으로 격리** — AI가 external repo로 push하지 않고 로컬 커밋만 만들고 사용자 수동 액션으로 남김. 이 패턴을 cross-repo DOCS phase에서 재사용 가능
5. **VERIFICATION.md 3-source 교차 확인(verification + summary frontmatter + requirements.md traceability)은 summary frontmatter가 비어 있을 때 verification이 authoritative 역할** — 이번 audit에서 summary frontmatter의 `requirements_completed`가 전부 비어 있었지만 VERIFICATION.md가 requirement → 코드 evidence 표를 갖추고 있어서 "satisfied" 판정 가능

### Cost Observations

- Model mix: autonomous (user-set profile) — 정확한 사용량 집계는 session log 기반이라 추정 불가
- Sessions: 1 (autonomous run, milestone lifecycle까지 포함)
- Notable: 6 phase + 19 plan + audit + complete + cleanup을 단일 세션 안에서 처리. context cost는 SUMMARY/VERIFICATION 기반 aggregation이라 O(phases) 선형

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 1 (autonomous) | 4 | research-only scope, GSD autonomous execution 최초 적용 |
| v1.1 | 1 (autonomous) | 6 | implementation milestone + 같은 세션 내 milestone close까지 포함. sequential phase 의존성 강화, supervisor/CDP 도메인 패턴 확립 |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | N/A (research) | N/A | N/A |
| v1.1 | 196 unit + 8 E2E | annotation-lint + fill-cdp + recovery + session-manager + command-broker + hitl-controller 신규 spec | `@playwright/test` (dev-only, `packages/e2e/`만), `@types/ws` |

### Top Lessons (Verified Across Milestones)

1. research milestone은 NO-GO 결론도 동등한 deliverable — v1.0에서 확립 (v1.1은 research 아니므로 교차검증 대상 아님)
2. milestone close는 phase complete와 분리된 의식적 단계 — v1.0은 11일 지연으로 확인, v1.1은 같은 세션 close로 비용 0 검증 ✓ 재확인됨
3. pre-existing 이슈의 scope boundary 명시가 sequential phase 속도를 결정 — v1.1 최초 확립
4. cross-repo artifact는 "commit + documented manual push" 패턴으로 격리 — v1.1 최초 확립

*다음 milestone에서 3, 4 lessons의 재적용 여부가 검증 포인트.*
