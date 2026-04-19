---
gsd_state_version: 1.0
milestone: v0.5
milestone_name: Manifest Pivot
status: milestone_ready_for_audit
stopped_at: Completed 18-04-PLAN.md (PR bot + weekly health check + CODEOWNERS + external-sync-instructions + Phase 18 close)
last_updated: "2026-04-20T00:00:00Z"
last_activity: 2026-04-20 -- Phase 18 complete (REGISTRY wave 3 closed; v0.5 Manifest Pivot 8/8 phases 29/29 plans)
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 29
  completed_plans: 29
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-19 for v0.5 Manifest Pivot kickoff)

**Core value:** AI 에이전트가 의미를 이해할 수 있는 제어 표면(v0.5부터 manifest 기반 target mapping + root-import component identity)을 통해 웹 앱을 로컬·결정적·검증 가능하게 자동화한다.
**Current focus:** v0.5 Manifest Pivot — COMPLETE (8/8 phases, 29/29 plans). audit-milestone 대기.

## Current Position

Milestone: v0.5 Manifest Pivot — READY FOR AUDIT (completion 2026-04-20)
Phase: 18 (REGISTRY) — COMPLETE (4/4 plans)
Status: Phase 18 전체 완료. `@agrune/registry` library + `agrune maps` CLI + registry-seed 10 seed + governance + PR bot + weekly health check + external-sync-instructions 착지. `github.com/agrune/maps` 공개 는 사용자 수동 push 대기 (external-sync-instructions.md § 1-3).
Last activity: 2026-04-20 -- Phase 18 Plan 04 complete (pr-bot.yml + health-check.yml + validate-schema.yml + 4 Node scripts with inline schema + CODEOWNERS + pull_request_template + external-sync-instructions.md 338 lines + Phase 18 ceremony)

브랜치 `feat/v0.5-manifest`에서 진행. Phase 11 → 12 → 13이 DAG의 sequential spine (schema → CDP injector → React bridge). Phase 13 이후 Phase 14/15/16은 resolver가 안정된 뒤 확장. Phase 17은 authoring 대안 완성 후 legacy 제거 (4/4 complete). Phase 18은 schema stable 확인 후 공개 — 전제 조건 (schema stable + inline 경로 0 + regression guard 활성 + 용어 전환) 모두 충족. Plan 01 (library) + Plan 02 (CLI) + Plan 03 (seed + governance) + Plan 04 (PR bot + external-sync) 완료로 v0.5 Manifest Pivot 의 모든 코드/문서 surface 가 완성됨.

다음 단계: `/gsd-audit-milestone` 로 v0.5 전체 requirements × artifact 대사 검증 후 v0.6 kickoff. 사용자 pending: (1) 외부 `.github` repo push + 외부 `skills/annotate/` 폐기 (17-04 external-sync-instructions), (2) `github.com/agrune/maps` public repo 생성 + initial push + branch protection + OAuth App 등록 + CODEOWNERS/maintainers.json placeholder 교체 + smoke test (18-04 external-sync-instructions § 1-6), (3) v0.6 kickoff 시 `@agrune/registry` npm publish + registry-seed scripts inline schema 제거.

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
- [Phase 17-04]: `lint:annotations` script 엔트리 삭제 + `lint:no-legacy` 도입 (RESEARCH Open Q 1 권고 a). 외부 소비자용 `@agrune/core/annotation-lint` 패키지는 그대로 publish — 외부 프로젝트는 `agrune-lint` bin 을 직접 호출.
- [Phase 17-04]: Regression guard allow-list 27 entries / 5 categories (A build-linter / B cursor markers / C unit tests / D e2e / E bundle) — 각 경로에 trailing comment + category divider. PR 리뷰 시 allow-list 추가가 명시적 승인 포인트로 드러남.
- [Phase 17-04]: Script exclude-dir 에 `test-results` + `playwright-report` 추가 — playwright runtime output 이 gitignored 이지만 로컬 workspace 에 남아 script 실행 시 노이즈 생성. CI 와 로컬 동작 일관성 확보.
- [Phase 17-04]: `packages/mcp/README.md` 의 `data-agrune-` literal phrase 제거 — 17-03 Deprecated workflows phrasing 전략과 일관. "legacy HTML data attribute (v0.4 까지 사용하던 inline 어노테이션 prefix 시리즈)" 로 교체.
- [Phase 17-04]: 외부 `.github/profile/README.md` 의 `browser extension` literal 2 건 모두 "browser add-on" 으로 교체 — 17-03 PRIVACY 결정과 동일한 regex-safe 전략.
- [Phase 17-04]: 외부 skills repo 파일 편집 수행 안 함 — working tree 의 pre-existing unrelated 변경 (marketplace.json, .mcp.json, mcp-server build artefacts) 때문에 agent 자동 commit 시 위험. instructions 에 사용자 선조건 resolve 를 명시하는 safer default 선택.
- [Phase 18-01]: tier × allowedEnvironments cross-field 는 zod `.superRefine` 로 구조적 강제 — verified 만 prod 허용, community/unlisted 는 dev only. 에러 메시지 path 로 사용자에게 정확한 수정 지점 지시 (Pitfall 7 근본 차단).
- [Phase 18-01]: v0.5 MVP 는 exact semver + 'latest' 만 지원, range (`^1.2.0`) 는 v0.6+ 로 연기 (RESEARCH Open Q 5). v0.5 스코프 축소로 CLI 의존성 최소화.
- [Phase 18-01]: 환경 변수 네이밍 확정 — `AGRUNE_CACHE_DIR` (cache override, 기본 `~/.agrune/maps`), `AGRUNE_REGISTRY_BASE_URL` (mirror override, 기본 `raw.githubusercontent.com/agrune/maps/main`, HTTPS-only).
- [Phase 18-01]: Trust-boundary 재검증 일관성 — writeCache 가 검증한 바이트라도 readCache 는 RegistryEntrySchema 재실행 (T-18-05 방어). 동일 패턴을 readLockfile + fetchRegistryEntry 에도 적용.
- [Phase 18-01]: Cache host/version strict regex 화이트리스트 (`HOST_PATTERN` + `VERSION_PATTERN`) — slash, `..`, null byte 가 file path 구성 전에 리젝 (T-18-10 path traversal).
- [Phase 18-01]: Atomic lockfile write (`tmp-<6hex>.json` + rename + catch-cleanup) — 동시 CLI 실행 시 tmp 충돌 방지 + partial write 방지 (T-18-09). 추후 cache write 에서도 재사용 가능 패턴.
- [Phase 18-01]: registry-client `fetch` impl optional override 지원 — Plan 04 PR bot 의 record+replay 테스트 바닥 사전 깔기. 기본은 `globalThis.fetch` (Node 22 built-in).
- [Phase 18-03]: 10 seed 후보 = RESEARCH 권고안 (HN / Wikipedia / MDN / Python docs / Gutenberg / arXiv / PyPI / HN Algolia / Wikidata / Observable) 그대로 채택. RESEARCH Assumption A1 LOW confidence 유지 — 실제 DOM resolve 검증은 Plan 04 weekly health check 가 담당.
- [Phase 18-03]: 10 seed 전부 verified tier + allowedEnvironments=['dev','prod'] 로 초기화 — "프로젝트 자체 기여" (author='agrune-maintainers') 의미론. 일반 외부 기여자는 community tier 에서 시작 (governance Tier Transition 표 명시).
- [Phase 18-03]: validate-seed.mjs 가 `@agrune/registry` workspace-internal import — 루트 package.json devDependencies 에 `@agrune/registry: workspace:*` link 추가로 node 가 resolve. v0.5 내내 npm publish 전까지 유지, v0.6 이후 published npm 으로 교체. PR bot plan 18-04 도 동일 제약 공유.
- [Phase 18-03]: seed manifest 에 macro/repeat 생략 — read-only 저위험 플로우 (검색/브라우징) 만. 로그인/결제/sensitive 0 건. 첫 registry 의 surface 최소화로 PR bot 의 velocity/tier/sensitive 규칙을 단순 case 에서 먼저 validate.
- [Phase 18-03]: Governance doc (REGISTRY_GOVERNANCE.md) 이 tier/velocity/revocation/absence/transition/staleness/security/reporting 8 섹션 완비 — PR bot Plan 04 가 집행할 normative spec. STALENESS_THRESHOLDS 상수 (7/28/56일) 와 doc Staleness Detection 표가 같은 숫자 공유해 drift 방지.
- [Phase 18-03]: CODEOWNERS 파일은 Plan 03 에서 생성 안 함 — 실제 공개 repo 생성 시점 (Plan 04 external-sync-instructions) 에 사용자가 작성. 이 repo 에는 prototype 만 존재하므로 README/GOVERNANCE 가 CODEOWNERS 규약만 문서화.
- [Phase 18-02]: CLI 는 `@agrune/registry/cli/*` sub-path exports 로 tree-shake — mcp bin 이 호출할 때만 dynamic import 로 필요한 파일만 ESM 로드 (`src/index.ts` 에는 cli/* 를 re-export 하지 않음).
- [Phase 18-02]: submit 은 `.json` manifest 만 허용 (v0.5 MVP) — TS 파일 dynamic import 는 v0.6+ 로 연기. 에러 메시지에 `v0.6+` 안내. RESEARCH Open Q 5 deferred list 정렬.
- [Phase 18-02]: device flow client_id placeholder = `AGRUNE_DEVICE_FLOW_CLIENT_ID` (PLACEHOLDER_CLIENT_ID export). `AGRUNE_OAUTH_CLIENT_ID` env 로 override, placeholder 일 때 yellow warning 으로 OAuth App 등록 안내. device flow 특성상 client_secret 없으므로 client_id 는 공개 가능.
- [Phase 18-02]: doctor 기본 offline (cache-only) — `--refresh` 명시 opt-in 일 때만 incidents.json 네트워크 GET (T-18-15 rate-limit abuse 구조적 차단). --refresh 실패 시 graceful degradation.
- [Phase 18-02]: submit token persistence 금지 (Pitfall 2 구조적) — `authenticate()` 내 변수 스코프만 사용, fs.writeFile 호출 0. 테스트가 tmp + ~/.agrune/maps 에 `.auth*` 파일 0 건임을 readdir assertion 으로 증명.
- [Phase 18-02]: `isSubcommand` guard 로 글로벌 --help/--version 가로챔 해제 — `agrune maps --help` 와 `agrune manifest --help` 가 서브커맨드 전용 help 로 흐름. 기존 `agrune --help` 는 그대로. T-18-17 dispatch isolation 강화.
- [Phase 18-02]: picocolors 직접 import 대신 ANSI shim (makeColor) — isTTY 체크 후 최소 ANSI escape codes 반환, non-TTY 는 identity. dist bundle 크기 최소화 + 테스트 결정성.
- [Phase 18-02]: e2e-smoke 는 `fetchEntry` DI 로 http 픽스처 연결 — 프로덕션 registry-client HTTPS-only 강제 invariant 를 테스트에서 약화시키지 않고 Plan 01 이 열어둔 fetch impl override slot 활용. 0 real network outbound.
- [Phase 18-04]: PR bot workflow 는 label-only (merge block 은 repo branch protection 가 담당) — `pull_request_target` + PR head sha checkout + `octokit.issues.addLabels` 만 호출 + 어떤 file write 도 없음. fork PR 에서 GITHUB_TOKEN issues/pull-requests:write scope 가 확보되어도 safe surface (T-18-26 mitigation).
- [Phase 18-04]: Health check 는 snapshot-only — role→text→testId→attr→css 순회 `probeSelector` 가 `.count()` 만 호출, click/fill/type/press 0 match (grep 으로 자동 증명). 상위 3 target 샘플링 + UA='agrune-health-check/0.5' 로 T-18-27 (외부 사이트 DoS) 구조적 차단.
- [Phase 18-04]: Health check 는 2-strike rule (RESEARCH Pitfall 5 재발 방지) — `.github/health-state.json` 에 `consecutiveFails` 누적, `>= 2` 일 때만 single 'stale manifests' issue 를 연다. PR 생성으로 `registry.staleSince` 추가는 v0.6+ 로 연기.
- [Phase 18-04]: `registry-seed/.github/scripts/_schema.mjs` 는 **self-contained inline schema** (v0.5 MVP — external repo 는 workspace 밖이라 `workspace:*` 로 `@agrune/registry` import 불가). DO NOT EDIT 헤더 + sync checklist 로 T-18-28 (schema drift) mitigation. v0.6 에서 `@agrune/registry` npm publish 후 `export { ... } from '@agrune/registry'` 한 줄로 축소.
- [Phase 18-04]: CODEOWNERS 는 governance-critical 파일 (incidents.json / REGISTRY_GOVERNANCE.md / maintainers.json / CODEOWNERS / .github/) 만 maintainer-only gate. `manifests/**` 는 global owner 없음 — community tier 기여자 direct merge 허용 + PR bot 라벨 + branch protection 가 정책 enforcement. `@agrune-solo` placeholder 는 사용자가 실제 GitHub handle 로 교체.
- [Phase 18-04]: OAuth App 등록 + `github.com/agrune/maps` public repo 생성 + 초기 push + branch protection + placeholder 교체 + smoke test 6 단계 = 사용자 수동 (autonomous 제약) — `external-sync-instructions.md` (338 lines, 9 섹션) 로 완전 문서화. MEMORY: "외부 repo push 는 사용자 수동 후속 조치".

### Pending Todos

**외부 repo push (사용자 수동):**

- 외부 `/Users/chenjing/dev/agrune/.github` repo push — 로컬 main 이 origin/main 대비 2 commits 앞섬 (v1.1 DOCS-02 + Phase 17-04). 상세: `.planning/phases/17-remove/external-sync-instructions.md`
- 외부 `/Users/chenjing/dev/agrune/skills` repo 에서 `skills/annotate/` 디렉터리 폐기 — 사용자 수동 (pre-existing 변경 먼저 resolve 후). 상세: `.planning/phases/17-remove/external-sync-instructions.md`

**Phase 18 external sync (사용자 수동, 상세: `.planning/phases/18-registry/external-sync-instructions.md`):**

- `github.com/agrune/maps` 공개 repo 생성 + `registry-seed/` 내용 초기 push (§ 1A-1E)
- Branch protection 설정 — `validate` / `analyze` required-checks + CODEOWNERS review + label-based approval 룰 (§ 2)
- OAuth App 등록 (`agrune-maps-submit`) + `AGRUNE_OAUTH_CLIENT_ID` shell env 주입 — scope = `public_repo` 충분. 미등록이어도 빌드는 성공하고 placeholder 사용 시 yellow warning 출력 (§ 3)
- `CODEOWNERS` + `maintainers.json` 의 `@agrune-solo` / `"agrune-solo"` placeholder 를 실제 GitHub handle 로 교체 (§ 1C)
- Post-push smoke test 6A-6F (add / types / doctor / doctor --refresh / submit --dry-run / workflow 첫 실행) 실행 (§ 6)

**v0.6 milestone kickoff 시:**

- `@agrune/registry` npm publish → `registry-seed/.github/scripts/_schema.mjs` inline schema 제거 후 `export { RegistryEntrySchema, contentHash } from '@agrune/registry'` 한 줄로 교체 (상세: § 7). T-18-28 (schema drift) 블로커 해소 경로.
- `agrune maps submit` 의 `.ts` manifest dynamic import 지원 (v0.5 는 `.json` 만)
- Registry governance 임계값 (30일 holddown / 7·28·56 staleness / 30·60일 absence) 3 개월 후 실 기여 데이터로 재검토 (LOW confidence A2/A3/A7)

**Test / infra backlog (pre-existing, 미악화):**

- RECORD-05 TodoMVC 데모 수동 검증 (실제 skill 호출 → README 체크리스트 대조) — 사용자 실행
- Corpus 확장 (v0.6+): `name=cvc`, `인증번호`, Japanese `パスワードの確認` substring mode 등 documented gap 해결
- 5 pre-existing user-flow E2E failures (act-overlay / fill-real x3 / manifest-inject) — 별도 plan 에서 fixture-level inline manifest injection
- runtime full-suite order-dependent flaky 1 건 (`act는 동적으로 추가된 overlay target…`) — 17-01 SUMMARY baseline 유지, test infra 리팩터 필요

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
- ~~Phase 17-04 regression guard + CI 배선 + 외부 profile sync~~ — `scripts/regression-guard/no-legacy-data-agrune.sh` + `data-agrune-allowlist.txt` (27 entries / 5 categories) / `pnpm lint:no-legacy` wire / `.github/workflows/ci.yml` build-test step 교체 / 외부 `.github/profile/README.md` 재작성 (로컬 commit `3d429ba`, push 대기) / `external-sync-instructions.md` 생성. ROADMAP + REQUIREMENTS Phase 17 Complete (2026-04-19, commits `9b32455`..`1f594a0`)
- ~~Phase 17 REMOVE — 전체 4 waves 완료~~ — REMOVE-01/02/03 requirements 전부 validated. Phase 18 REGISTRY 공개 전제 조건 (schema stable + breaking surface 정리 + regression guard 활성) 충족 (2026-04-19)
- ~~Phase 18-01 @agrune/registry library scaffold~~ — 신규 pnpm workspace 패키지, `errors` / `content-hash` (sha256 + fast-json-stable-stringify) / `schema` (RegistryEntrySchema + tier×env superRefine) / `cache` (0o700/0o600 + lstat symlink guard + path whitelist) / `lockfile` (atomic tmp+rename + host-sorted) / `registry-client` (HTTPS-only + latest resolver) / `staleness` (7/28/56 day) 착지. 32 unit tests green, workspace 9 패키지 build/typecheck/test 전부 pass, `pnpm lint:no-legacy` exit 0 유지. REGISTRY-03 완전 달성, REGISTRY-02/06 부분 달성 (CLI layer 는 Plan 02). 2026-04-19, commits `e63f719`..`3551b8f` (7 atomic commits).
- ~~Phase 18-03 registry-seed + governance + validator~~ — `registry-seed/` 에 10 verified seed manifest (HN/Wikipedia/MDN/Python docs/Gutenberg/arXiv/PyPI/HN Algolia/Wikidata/Observable) + 113 줄 REGISTRY_GOVERNANCE.md (8 섹션 + 3 tier 서브) + 98 줄 README.md + incidents.json `[]` + maintainers.json solo placeholder + index.json (10 entries + sha256 contentHash per entry) 착지. `scripts/registry-seed/validate-seed.mjs` 가 RegistryEntrySchema.parse + contentHash 재계산, `pnpm validate:seed` 10/10 pass + negative test (invalid seed → exit 1 + zod issue path) 확인. 루트 package.json devDependencies 에 `@agrune/registry: workspace:*` link 추가 (node resolve 위해). Phase 17 regression guard 무영향 (`pnpm lint:no-legacy` exit 0). REGISTRY-04 완전 달성, REGISTRY-01 대부분 달성 (실제 공개 repo push 는 Plan 04 external-sync 이후 사용자 수동). 2026-04-19, commits `205fa39`/`8097f8d`/`84126be` (3 atomic commits).
- ~~Phase 18-02 agrune maps CLI surface~~ — 4 CLI runner (shared + add/types/doctor/submit, packages/registry/src/cli/*) + `@agrune/registry/cli/*` sub-path exports + multi-entry tsup build + mcp bin 'maps' dispatch block (dynamic import pattern + isSubcommand guard). add: fetch+cache+lockfile 파이프라인 + contentHash re-compute + --offline. types: lockfile → AgruneMapsHost union + AgruneMapsTargetIds interface emit. doctor: classifyStaleness + --refresh opt-in incidents.json + --auto-disable lockfile 기록 (기본 offline). submit: AGRUNE_GITHUB_TOKEN → device flow 순서 + fork/commit/PR octokit skeleton + token scope-local (fs write 0, test assertion). DI-first unit tests 28 cases + e2e smoke 7 cases (총 67/67 registry green). README 'Registry (v0.5 Phase 18)' 섹션 + AGENTS 실행 모드 4 라인 + 체크리스트 step. Phase 17 regression guard 무영향 (`pnpm lint:no-legacy` exit 0). REGISTRY-02/03/06 완전 달성. 2026-04-19, commits `a56db43`/`298bddb`/`1667fe1`/`403e420` (4 atomic commits).
- ~~Phase 18-04 PR bot + weekly health check + CODEOWNERS + external-sync-instructions~~ — `registry-seed/.github/workflows/` 3 YAML (pr-bot.yml = pull_request_target + label-only analysis, health-check.yml = cron '0 6 * * 1' + playwright snapshot-only, validate-schema.yml = pull_request RegistryEntrySchema.safeParse) + `registry-seed/.github/scripts/` 4 Node mjs (_schema.mjs inline Registry/Manifest schema + DO NOT EDIT header, validate-schema.mjs PR/local dual mode, pr-bot.mjs 4-signal 라벨러 [sensitive-diff/tier-escalation/schema-fail/velocity-holddown], health-check.mjs 2-strike rule + 3-target sample) + package.json (zod + @octokit/rest + @actions/core + fast-json-stable-stringify + playwright). `registry-seed/CODEOWNERS` (governance-critical 파일만 maintainer-only, manifests/** global owner 없음) + `.github/pull_request_template.md` (8 체크리스트) + `.gitignore`. `.planning/phases/18-registry/external-sync-instructions.md` 338 lines / 9 섹션 (repo 생성 1A-1E / branch protection / OAuth App / base URL / boundary / smoke test 6A-F / schema sync / pending todos / rollback). Phase 17 regression guard 무영향, YAML safe_load 3/3, node --check 4/4, grep click/fill/type/press on health-check = 0 match. REGISTRY-01 / REGISTRY-05 완전 달성 (실 `github.com/agrune/maps` push 는 사용자 수동). 2026-04-20, commits `487fcc7` / `4e8a2c9` / `d7e87f0` (3 atomic task commits).
- ~~Phase 18 REGISTRY — 전체 4 plans 완료~~ — REGISTRY-01/02/03/04/05/06 모두 validated. `@agrune/registry` library + `agrune maps` CLI 4 서브커맨드 + registry-seed 10 verified seed + REGISTRY_GOVERNANCE.md 8 섹션 + PR bot/health-check workflow + external-sync-instructions 사용자 수동 경로까지 완결. v0.5 Manifest Pivot 8/8 phases 29/29 plans 완료 — audit-milestone 대기 상태 (2026-04-20).

## Session Continuity

Last session: 2026-04-20T00:00:00Z
Stopped at: Completed 18-04-PLAN.md (PR bot + weekly health check + CODEOWNERS + external-sync-instructions + Phase 18 close)
Resume file: None

### Phase 17 완료 — Phase 18 진입 조건 요약

Phase 17 종료 시점의 structural invariants:

1. **Runtime 이 legacy `data-agrune-*` 을 무시한다** (17-01 src 삭제 + 17-02 E2E 의미 반전 fixture 가 positive regression proof)
2. **7 개 product-surface 문서에 legacy annotation 서술 0** (17-03 재작성)
3. **CI 에서 legacy 재등장이 PR block** (17-04 `pnpm lint:no-legacy` + build-test job step)
4. **외부 제품 표면 (org profile) 이 manifest 정체성 반영** (17-04 로컬 commit; 사용자 push 대기)
5. **Allow-list 가 Phase 17 baseline 을 인코딩** — 새 fixture 추가 시 explicit entry 필요 → PR 리뷰 포인트 정립

Phase 18 REGISTRY 는 이제 "inline 경로 완전 제거 확인 후에만 공개" 라는 종속성을 만족.
