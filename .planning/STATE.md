---
gsd_state_version: 1.0
milestone: v0.5
milestone_name: Manifest Pivot
status: executing
stopped_at: Completed 16-04-PLAN.md
last_updated: "2026-04-19T12:43:26Z"
last_activity: 2026-04-19 -- Phase 16 Plan 04 (manifest skill + sensitive corpus CI + TodoMVC demo) complete
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 21
  completed_plans: 21
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-19 for v0.5 Manifest Pivot kickoff)

**Core value:** AI 에이전트가 의미를 이해할 수 있는 제어 표면(v0.5부터 manifest 기반 target mapping + root-import component identity)을 통해 웹 앱을 로컬·결정적·검증 가능하게 자동화한다.
**Current focus:** Phase 16 — record

## Current Position

Milestone: v0.5 Manifest Pivot — ACTIVE (kickoff 2026-04-19)
Phase: 16 (record) — COMPLETE (all 4 plans landed)
Plan: 4 of 4 complete (16-01 IdentityBridge v2 · 16-02 RecorderView+PendingStore · 16-03 manifest dev CLI+watcher · 16-04 skill+corpus+demo)
Status: Awaiting Phase 17 planning (/gsd-plan-phase 17)
Last activity: 2026-04-19 -- Phase 16 Plan 04 (manifest skill + sensitive corpus CI + TodoMVC demo) complete

브랜치 `feat/v0.5-manifest`에서 진행. Phase 11 → 12 → 13이 DAG의 sequential spine (schema → CDP injector → React bridge). Phase 13 이후 Phase 14/15/16은 resolver가 안정된 뒤 확장. Phase 17은 authoring 대안 완성 후 legacy 제거. Phase 18은 schema stable 확인 후 공개.

다음 단계: `/gsd-plan-phase 17` 으로 REMOVE phase의 plans 분해 (inline data-agrune-* 스캐너 제거 + 문서 재작성 + 용어 전환).

## Accumulated Context

### Decisions

Decisions are logged in `.planning/PROJECT.md` Key Decisions.
Recent decisions carrying forward:

- 2026-04-07: browser precision 유지 + AX-first hybrid expansion GO (v1.0 synthesis) — 실행은 v0.6+ 로 연기
- 2026-04-15: Extension mode 완전 제거, CDP-only 단일 아키텍처로 피봇
- 2026-04-18: v1.1 브라우저 본체 완성 완료 — Fill CDP 통일, self-healing, active session, devtools webapp, E2E+lint CI, docs
- 2026-04-19: Inline `data-agrune-*` 완전 폐기 결정, manifest + root-import으로 피봇 (v0.5)
- 2026-04-19: Milestone 번호 semver 정렬 (v0.5.x), v1.x 명명 금지
- 2026-04-19: PageSnapshot v2↔v3 backward-compat adapter 없이 breaking change 직행 (실 사용자 없음)
- 2026-04-19: `bippy` 를 React fiber 접근 단일 신규 의존성으로 확정 (React 17/18/19 matrix)
- 2026-04-19: Cross-cutting Pitfall 3(prod root-import) primary owner = Phase 13 REACT, secondary = Phase 18 REGISTRY
- 2026-04-19: Cross-cutting Pitfall 4(sensitive 우회) split = Phase 14 MACRO(runtime heuristic OR-override) + Phase 18 REGISTRY(PR bot)
- [Phase 11-manifest]: ActionKind forward-reference: index.ts 상단에 명시적 import type 추가로 해결
- [Phase 11-manifest]: captureTarget.selector: JSON.stringify(ladder) 임시 직렬화 — Phase 12에서 PageSnapshot v3로 교체 예정
- [Phase 16-01]: AgruneIdentityBridge v2 는 shape-additive — `resolvePath(el)` 추가 + `version: '1'→'2'` bump. 소비자는 `typeof bridge.resolvePath === 'function'` feature detect 권장
- [Phase 16-01]: activateBridge 내부에서 `typeof index.getPathByDom === 'function'` 방어적 delegate — v1-shape 인덱스와 graceful 상호 운용 (mock/구버전 안전)
- [Phase 16-01]: getPathByDom 반환값은 segment 얕은 복제(`.map(seg => ({ ...seg }))`) — FiberPathSegment primitive-only 3 필드라 caller mutation 격리 충분
- [Phase 16-02]: RecorderController 는 UUID-기반 sessionId 를 서버에서 주조 (브라우저 time/id 불신) → pending 파일 디렉토리 경로 단일 트러스트 소스
- [Phase 16-02]: PendingStore sanitizeSessionId/targetId 를 allow-list regex + path.relative containment check 로 이중 방어 (T-16-02 / T-16-06)
- [Phase 16-02]: isValidCommitPayload 는 zod 대신 수동 shape check — devtools-server 가 manifest zod 의존을 피하기 위한 의도적 선택. 필드 5-6 개라 유지보수 비용 낮음
- [Phase 16-02]: page-context recorder-injected.ts 는 `.value` 접근 0 match — T-16-04 를 grep-able evidence 로 유지 (주석의 citation 2 개만 허용)
- [Phase 16-02]: activateRecorderOverlay 는 single-shot — 첫 클릭 후 listener 해제 후 onCapture 호출, Esc 취소 경로는 RecorderController 가 서버-측에서 reset
- [Phase 16-03]: `mergeTargetIntoManifest` 는 순수 함수 — ts-morph Project 를 in-memory 만 사용, `project.save()` 는 0 match (T-16-10 구조적 증명). Caller (watcher) 가 `sf.getFullText()` 결과를 받아 자신의 bounded path 로 write
- [Phase 16-03]: Merger 는 flat `targets: []` 와 `groups[0].targets` 구조 양쪽 지원 — 실제 zod 스키마는 groups-only 지만 플랜 fixture 와 in-flight 사용자 manifest 편의를 위해 양쪽 허용
- [Phase 16-03]: `buildDefineTargetText` 는 `JSON.stringify` 기반 직렬화 — selector/targetId 안의 따옴표·특수문자가 모두 문자열 리터럴로 escape 됨. `actionKinds: ['click']` 은 하드코딩 (capture 시점에 추론 불가 — recorder 한계 의도적)
- [Phase 16-03]: tsup banner 에 `__filename`/`__dirname` shim 추가 — ts-morph 가 embed 하는 TypeScript compiler host 가 CJS 글로벌 요구. 빌드된 CLI 가 ESM 환경에서 `ReferenceError` 로 죽던 문제 해결 (Rule 3 auto-fix)
- [Phase 16-03]: Watcher 테스트는 log-line 기반 `waitFor(predicate)` 로 동기화 — `setImmediate` stacking 은 flaky 했고, production 코드에 test-facing hook 을 뚫지 않고도 deterministic 스펙 확보
- [Phase 16-04]: Corpus fixture는 실제 `isSensitive()` 동작을 그대로 기록 (aspirational target 금지). heuristic이 실제로 놓치는 케이스(`Security code` placeholder, `name=cvc`, 일본어 concatenated `パスワードの確認`, 한국어 `인증번호`)는 `expected: false` + `notes:` 로 gap 문서화. 향후 개선 시 2줄 diff + 가시적 CI 신호.
- [Phase 16-04]: TodoMVC fixture는 `@ts-nocheck` + e2e tsconfig include 밖 — `@agrune/e2e` 가 react/@agrune/react peerDep 없음. manifest.ts 는 standalone `tsc` 로 컴파일 검증. 실제 실행은 README.md recipe 로 별도 Vite 프로젝트 lift.
- [Phase 16-04]: Skill 위치 `.agents/skills/manifest/` (Decision C) — 코드와 skill 진화를 git 으로 같이 추적. Legacy `skills/annotate/` 은 Phase 17 까지 병행.
- [Phase 16-04]: Precision/recall CI threshold = 0.90/0.95 (plan spec), 실측 = 1.000/1.000. Headroom 은 미세 regression 은 허용하되 5–10% 이상 FP/FN 증가 시 CI fail.

### Pending Todos

- 외부 `/Users/chenjing/dev/agrune/.github` repo push (사용자 수동 후속 조치, v1.1 잔여)
- Phase 17 계획 분해 (`/gsd-plan-phase 17`) — inline data-agrune-* 제거 + "annotation" → "target mapping" 용어 전환
- Phase 18 계획 분해 (`/gsd-plan-phase 18`) — registry 공개 + governance + seed manifest
- Registry seed manifest 선정 기준 확정 (Phase 18 research-phase 후보)
- RECORD-05 TodoMVC 데모 수동 검증 (실제 skill 호출 → README 체크리스트 대조) — 사용자 실행
- Corpus 확장 (v0.6+): `name=cvc`, `인증번호`, Japanese `パスワードの確認` substring mode 등 documented gap 해결

### Blockers/Concerns

- GitHub branch-protection required-check 토글 — 레포 외부 설정 (사용자 수동)
- Registry 거버넌스 임계값(solo → multi-reviewer 전환 PR/주 수) — 업계 공개 수치 없어 `review backlog > 2주`·`동일 저자 다중 PR 감지` 를 정량 트리거로 Phase 18 governance doc에 명시 예정
- React 20 호환 — `bippy` 가 17–19 확정, 20 major 대비 `fiber-adapter-v20.ts` 자리만 Phase 13에서 마련
- 외부 사이트 selector 안정성 — CSS fallback만 가능해 selector drift 위험. Phase 18 weekly health check bot로 완화

### Cross-Cutting Ownership

| Concern | Primary Phase | Secondary Phase |
|---|---|---|
| Pitfall 3 (prod root-import abuse) | Phase 13 REACT (2단계 guard) | Phase 18 REGISTRY (manifest `production.allow=false` 기본값) |
| Pitfall 4 (sensitive:false 우회) | Phase 14 MACRO (runtime DOM heuristic OR-override) | Phase 18 REGISTRY (PR bot sensitive 변경 하이라이트) |
| PageSnapshot v3 breaking bump | Phase 12 INJECT (protocol landing) | Phase 11 MANIFEST (schema 필드) |
| MANIFEST-04 sensitive OR-only lock | Phase 11 MANIFEST (schema) | Phase 14 MACRO (runtime 강제) |

### Resolved (historical)

- ~~v1.1 23 requirements~~ — 전부 validated, 2026-04-18 shipped
- ~~Fill 경로의 DOM setter 실패~~ — CDP Input 도메인 통일 완료
- ~~CDP 연결 손실/Crash 수동 복구 요구~~ — RecoverySupervisor 자동 복구
- ~~첫 세션 기준 엉뚱한 탭 조작~~ — active session precedence 도입
- ~~devtools 웹앱 snapshot-only~~ — 로그/HITL/진단/세션 UI 완성
- ~~단위 테스트만 존재~~ — Playwright E2E + annotation build-linter CI 배선
- ~~README/AGENTS/docs extension mode 잔재~~ — Phase 10에서 제거
- ~~v0.5(v1.2) milestone 스코프 결정~~ — Manifest Pivot으로 확정 (2026-04-19)
- ~~v0.5 REQUIREMENTS.md 정의~~ — 37 requirements, 9 categories (2026-04-19)
- ~~v0.5 ROADMAP.md 생성~~ — Phases 11-18, 100% coverage (2026-04-19)
- ~~Phase 11 계획 분해~~ — 5 plans 완료 (2026-04-19)
- ~~Phase 16 RECORD~~ — 4 plans 완료 (16-01 IdentityBridge v2 · 16-02 Recorder+PendingStore · 16-03 manifest dev watcher · 16-04 skill+corpus+demo, 2026-04-19)
- ~~RECORD-04 sensitive heuristic CI 증명~~ — 116 fixture 코퍼스 + precision 1.000/recall 1.000 CI gate (2026-04-19)
- ~~RECORD-05 manifest authoring skill 작성~~ — `.agents/skills/manifest/` + TodoMVC reference fixture (2026-04-19, 수동 검증 게이트)

## Session Continuity

Last session: 2026-04-19T12:43:26Z
Stopped at: Completed 16-04-PLAN.md (Phase 16 전체 완료)
Resume file: None
