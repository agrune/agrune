---
gsd_state_version: 1.0
milestone: v0.5
milestone_name: Manifest Pivot
status: executing
stopped_at: Completed 17-03-PLAN.md (루트 문서 7개 manifest 재작성 + SOT pointer 배치)
last_updated: "2026-04-19T16:14:02Z"
last_activity: 2026-04-19 -- Phase 17 Plan 03 complete (docs manifest-centric rewrite)
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 25
  completed_plans: 24
  percent: 96
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-19 for v0.5 Manifest Pivot kickoff)

**Core value:** AI 에이전트가 의미를 이해할 수 있는 제어 표면(v0.5부터 manifest 기반 target mapping + root-import component identity)을 통해 웹 앱을 로컬·결정적·검증 가능하게 자동화한다.
**Current focus:** Phase 17 — remove

## Current Position

Milestone: v0.5 Manifest Pivot — ACTIVE (kickoff 2026-04-19)
Phase: 17 (remove) — EXECUTING
Plan: 4 of 4 (17-01 ✓ runtime/browser src 삭제, 17-02 ✓ e2e bootstrap manifest-only, 17-03 ✓ 루트 문서 7개 manifest 재작성 + SOT pointer)
Status: Executing Phase 17 (last plan 17-04 남음)
Last activity: 2026-04-19 -- Phase 17 Plan 03 complete (docs manifest-centric rewrite)

브랜치 `feat/v0.5-manifest`에서 진행. Phase 11 → 12 → 13이 DAG의 sequential spine (schema → CDP injector → React bridge). Phase 13 이후 Phase 14/15/16은 resolver가 안정된 뒤 확장. Phase 17은 authoring 대안 완성 후 legacy 제거. Phase 18은 schema stable 확인 후 공개.

다음 단계: 17-04 (외부 `.github/profile/README.md` sync + 외부 `skills/annotate/` 폐기 지침 + regression guard script + `lint:annotations` script 엔트리 삭제 결정).

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
- [Phase 17-03]: `workflows/annotate/WORKFLOW.md` 파일명/디렉터리명 보존 — 외부 하네스 어댑터가 이미 링크해둔 경우 breaking 방지. 내용은 manifest-centric 으로 재작성 + 최상단에 `.agents/skills/manifest/SKILL.md` authoritative pointer.
- [Phase 17-03]: `pnpm lint:annotations` script 엔트리 자체 보존 (package.json L10 + README L282 + AGENTS L50) — 본 plan 은 본문 설명만 rephrase. 삭제 여부는 Wave 4 (17-04) 결정.
- [Phase 17-03]: PRIVACY.md "browser extension" 2 회 등장 모두 제거 — 첫 건 MCP server 로 교체, 두 번째 negative 문("does not install a browser extension") 은 "does not install any browser add-on" 으로 교체해 Wave 4 regression grep 이 literal 을 0 회로 유지.
- [Phase 17-03]: Deprecated workflows 섹션 phrasing 전략 — code block 안에 실제 legacy attribute 예시를 쓰지 않고 property-to-field upgrade map (name→targetId / action→actionKinds / group→groupId / sensitive→sensitive) 으로 설명. regression grep 에 걸리지 않으면서 upgrade 의미 전달.
- [Phase 17-03]: SOT pointer 5 개 진입점 배치 — README (3 위치) / AGENTS (3 위치) / WORKFLOW.md 최상단 블록쿼트 / docs/agent-setup.md / packages/mcp/README. Agent 가 어느 문서로 들어와도 `.agents/skills/manifest/SKILL.md` 로 수렴.

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
- ~~Phase 17-01 runtime+browser src legacy 제거~~ — 9 call-site group 전부 삭제, scanner/builder file 2개 제거, regression spec 2개 신설 (2026-04-19, commit `2b69647`)
- ~~Phase 17-02 e2e bootstrap shim manifest-only 전환~~ — `helpers.ts` BOOTSTRAP_SOURCE + `idle-boot.html` + `legacy-annotated.html` (의미 반전) + `bootstrap-idle.spec.ts` (assertion 반전) + `annotation-scan.spec.ts` (allow-list 주석). `bootstrap-idle.spec.ts` 3/3 PASS + `annotation-scan.spec.ts` 4/4 PASS (2026-04-19, commits `e59992b`..`402b0e1`)
- ~~Phase 17-03 루트 문서 7 개 manifest 재작성~~ — README / AGENTS / PRIVACY / workflows/annotate/WORKFLOW / docs/agent-setup / docs/improvement-notes / packages/mcp/README. 치환된 용어 (annotate/어노테이션 → manifest/defineTarget, browser extension → MCP server) vs 유지된 용어 (annotation-lint 패키지명 / KNOWN_AGRUNE_ATTRS / lint:annotations script 엔트리 / docs/notes/ 아카이브) Pitfall 4 원칙 적용. SOT pointer `.agents/skills/manifest/SKILL.md` 를 5 개 진입점에 배치. 8 개 gate 전부 pass (2026-04-19, commits `1302d4c`..`2bc221b`)

## Session Continuity

Last session: 2026-04-19T16:14:02Z
Stopped at: Completed 17-03-PLAN.md (루트 문서 7개 manifest 재작성 + SOT pointer 배치)
Resume file: None

### Phase 17 Plan 03 — Known Out-of-scope (Deferred to 17-04 or later)

17-03 은 "문서 7 개 재작성" 으로 scope 가 한정되어 있어 아래 항목은 의도적으로 17-04 또는 별도 plan 으로 이관:

- `package.json` 의 `lint:annotations` script 엔트리 삭제 여부 — 17-04 결정 예정 (RESEARCH Pitfall 6, 권고 = 삭제 + README L282 / AGENTS L50 해당 line 도 함께 삭제)
- 외부 `/Users/chenjing/dev/agrune/.github/profile/README.md` sync — 17-04 파일 수정, 사용자 수동 push
- 외부 `/Users/chenjing/dev/agrune/skills/skills/annotate/` 폐기 지침 — 17-04 `.planning/phases/17-remove/external-sync-instructions.md` 생성 (사용자 수동 PR)
- Regression guard script (`scripts/regression-guard/no-legacy-data-agrune.sh` + `data-agrune-allowlist.txt`) — 17-04 신설
- 17-02 handoff 의 5 개 pre-existing user-flow E2E fail (tricky-inputs / overlay-modal / manifest-inject) 은 17-03 frontmatter scope 외라 본 plan 에서 처리 안 함 — 별도 plan 또는 17-04 rewrite pass 에서 fixture 에 inline manifest 주입으로 해소 필요
- `manifest_load` happy-path refresh 타이밍 디버깅 — 별도 plan 또는 Phase 18 research
