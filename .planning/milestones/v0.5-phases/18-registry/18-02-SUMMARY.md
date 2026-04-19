---
phase: 18-registry
plan: 02
subsystem: registry
tags:
  - registry
  - cli
  - subcommand
  - doctor
  - submit
  - device-flow
  - octokit
  - types-emit

requires:
  - phase: 18-01
    provides: "@agrune/registry library layer — fetchRegistryEntry / contentHash / cache / lockfile / classifyStaleness / RegistryEntrySchema (CLI 4 runner 가 얇은 wrapper 로 consume)"
  - phase: 18-03
    provides: "registry-seed/ 10 verified manifest + incidents.json shape — e2e-smoke fixture 및 submit flow 가 동일 JSON shape 전제"
provides:
  - "runAddCli (packages/registry/src/cli/add.ts) — fetch+cache+lockfile 파이프라인, --offline / --registry-base-url / --cwd 지원, contentHash re-compute 검증 (T-18-11 defense-in-depth)"
  - "runTypesCli (packages/registry/src/cli/types.ts) — lockfile 기반 AgruneMapsHost union + per-host AgruneMapsTargetIds interface emit, repeat 의 repeatId:targetId 포함, 빈 lockfile 은 never 로 collapse"
  - "runDoctorCli (packages/registry/src/cli/doctor.ts) — classifyStaleness + 컬러 출력, --refresh 시 incidents.json fetch 로 revoked 마킹, --auto-disable 시 lockfile disabled 필드 기록, 기본은 offline"
  - "runSubmitCli (packages/registry/src/cli/submit.ts) — AGRUNE_GITHUB_TOKEN → device flow 인증 순서, getAuthenticated → createFork → createOrUpdateFileContents → pulls.create 스켈레톤, token persistence 구조적 금지 (Pitfall 2)"
  - "shared helpers (packages/registry/src/cli/shared.ts) — parseArgs / errorExit / makeColor / printMapsUsage (picocolors 없는 ANSI shim)"
  - "packages/mcp/bin/agrune-mcp.ts 'maps' dispatch 블록 — 4 서브커맨드 dynamic import, `maps --help` 독립 핸들러, 글로벌 --help/--version hijack 해제"
  - "@agrune/registry/cli/{add,types,doctor,submit} 4 sub-path exports — consumer 는 tree-shake 가능한 개별 dist 파일 로드"
  - "e2e-smoke.test.ts 통합 테스트 — localhost http 픽스처 → add/types/doctor 라운드트립 증명, 0 real network"
affects:
  - 18-04 (PR bot + weekly health check) — PR bot 이 submit flow 의 fork/PR shape (branch naming `submit/<host>-<version>`, path `manifests/<host>@<version>.json`) 을 그대로 받음. @agrune/registry/cli/submit 의 RegistryEntrySchema.parse 경로가 bot 의 schema-fail 라벨 로직과 동일 validator 공유
  - Plan 04 external-sync-instructions 사용자 수동 단계 — AGRUNE_OAUTH_CLIENT_ID 용 OAuth App 등록 절차 필요

tech-stack:
  added: []
  patterns:
    - "CLI library thin-wrapper: 각 runner 는 argparse + @agrune/registry 함수 orchestration 만 — 비즈니스 로직은 전부 library 에. unit test 가 DI 로 모든 I/O (fs, fetch, now) 격리"
    - "DI-first unit testing: 각 runner 가 `deps?: { ... }` 2번째 파라미터로 fetchEntry/readCache/writeLock/createOctokit/deviceFlow 등 전면 주입 가능 — vi.mock 의존 0, 테스트가 hermetic"
    - "dispatch 분기 isolation pattern: `isSubcommand` guard 로 글로벌 --help/--version 이 서브커맨드 surface 를 오염시키지 않음 (T-18-17 dispatch isolation). 기존 manifest 블록에도 소급 적용되어 `agrune manifest --help` 도 향후 자체 핸들러 추가 가능"
    - "token scope-local 보장: authenticate() 가 token 을 함수-스코프 변수로만 유지, 어떤 fs.writeFile 도 없음. 테스트가 tmp + ~/.agrune/maps 에 `.auth*` 파일 0 건임을 structural assertion 으로 검증"
    - "sub-path exports + multi-entry tsup: `./cli/{add,types,doctor,submit}` 각 entry 가 개별 dist/cli/*.js 로 emit 되어 mcp bin 의 dynamic import 가 필요한 파일만 로드"

key-files:
  created:
    - "packages/registry/src/cli/shared.ts (parseArgs + makeColor + errorExit + printMapsUsage, 123 lines)"
    - "packages/registry/src/cli/add.ts (runAddCli + AddCliDependencies, 149 lines)"
    - "packages/registry/src/cli/types.ts (runTypesCli + renderDts emitter, 122 lines)"
    - "packages/registry/src/cli/doctor.ts (runDoctorCli + fetchRevokedHosts, 204 lines)"
    - "packages/registry/src/cli/submit.ts (runSubmitCli + authenticate + createSubmissionPr + PLACEHOLDER_CLIENT_ID export, 288 lines)"
    - "packages/registry/tests/cli-add.test.ts (7 cases — usage / latest / exact / not-found / idempotent / --offline hit / --offline miss)"
    - "packages/registry/tests/cli-types.test.ts (5 cases — host union / per-host targetId / --out / empty lockfile / repeatId:targetId)"
    - "packages/registry/tests/cli-doctor.test.ts (7 cases — fresh / week_old / stale / auto-disable persist / --refresh incidents / no-network / empty)"
    - "packages/registry/tests/cli-submit.test.ts (9 cases — usage / env-token / device flow / arg shape / no-disk-token / placeholder-warn / non-placeholder / --dry-run / .ts reject)"
    - "packages/registry/tests/e2e-smoke.test.ts (7 cases — http fixture → add/types/doctor 라운드트립 + 0o600 mode + 0 outbound)"
  modified:
    - "packages/registry/package.json — 4 cli/* sub-path exports 추가"
    - "packages/registry/tsup.config.ts — entry multi-file (index + cli/{add,types,doctor,submit})"
    - "packages/mcp/package.json — @agrune/registry: workspace:* dependency"
    - "packages/mcp/bin/agrune-mcp.ts — HELP_TEXT maps 라인 + Subcommands 섹션 + isSubcommand guard + maps dispatch block (dynamic import 4 runner)"
    - "README.md — 'Registry (v0.5 Phase 18)' 섹션 (4 예제 + env-var 안내)"
    - "AGENTS.md — 실행 모드 섹션 4 라인 + 테스트 체크리스트 `agrune maps --help` step"
    - "pnpm-lock.yaml — mcp importer 가 registry link 수신"

key-decisions:
  - "CLI 는 @agrune/registry/cli/* sub-path exports 로 tree-shake — mcp bin 이 호출할 때만 dynamic import 로 필요한 파일만 ESM 로드 (index 에는 re-export 안 함)"
  - "submit 은 .json manifest 파일만 허용 (v0.5 MVP) — TypeScript dynamic import 는 v0.6+ 로 연기. plan checker note 와 RESEARCH Open Q 5 deferred list 정렬. 에러 메시지에 `v0.6+` 안내"
  - "device flow client_id placeholder = 'AGRUNE_DEVICE_FLOW_CLIENT_ID' (PLACEHOLDER_CLIENT_ID export). env AGRUNE_OAUTH_CLIENT_ID 로 override, placeholder 일 때 yellow warning 으로 OAuth App 등록 안내. client_secret 없이 device flow 특성상 client_id 는 공개 가능"
  - "doctor 기본 offline (cache-only) — `--refresh` 명시 opt-in 일 때만 incidents.json 네트워크 GET. T-18-15 (rate-limit abuse) 구조적 차단. --refresh 실패 시 전체 run fail 대신 yellow warning 만 출력하고 classification 진행 (graceful degradation)"
  - "submit token persistence 금지 (Pitfall 2 구조적) — authenticate() 내 변수 스코프만 사용. 테스트가 tmp dir + ~/.agrune/maps 에 `.auth*` 파일 0 건임을 readdir assertion 으로 검증. 구조적으로 fs.writeFile 호출 없음"
  - "`isSubcommand` guard 로 글로벌 --help/--version 이 subcommand 를 가로채지 않도록 수정 — `agrune maps --help` 와 `agrune manifest --help` 모두 서브커맨드 전용 help 로 흘러감. T-18-17 dispatch isolation 강화 및 UX 개선"
  - "picocolors 의존성을 도입하지 않고 ANSI shim 으로 대체 — makeColor() 가 isTTY 체크 후 최소 ANSI escape codes 반환, non-TTY 는 identity. picocolors 가 registry/package.json deps 에는 있지만 실제 import 하면 tsup bundle 이 커지므로 CLI 코드에서는 직접 사용 생략"
  - "e2e-smoke 는 fetchEntry DI 로 http 픽스처 연결 — 프로덕션 registry-client 는 HTTPS-only 를 강제하므로 테스트에서 그 invariant 를 약화시키지 않고 대신 DI 레이어로 우회. Plan 01 이 의도적으로 열어둔 fetch impl override slot 활용"

patterns-established:
  - "CLI runner dependency-injection 표준 — signature `runXxxCli(argv: string[], deps?: XxxCliDependencies): Promise<number>`. deps 는 fs/fetch/now/octokit factory 전부 override 가능. mcp bin 에서는 deps 생략 (프로덕션 경로), 테스트는 전면 주입. 앞으로 모든 agrune CLI 에 적용 가능한 일관 shape"
  - "4-file CLI skeleton pattern — add/types/doctor/submit 각자 독립 파일 + shared helper. 새 `agrune maps <verb>` 추가 시 동일 패턴으로 5번째 파일 + tsup entry + package.json export + bin dispatch 한 줄만 추가"
  - "dispatch guard pattern — 전역 옵션 (--help / --version) 이 서브커맨드에 도달하지 않도록 `isSubcommand` flag 로 조기 차단. 향후 `agrune recorder`, `agrune devtools` 등 새 서브커맨드 추가 시 동일 목록에 host/port name 추가"
  - "token scope-local 감사 패턴 — 보안 민감 변수 (token, password) 는 함수 매개변수 + 지역 변수만 허용, 어떤 fs I/O 도 거치지 않음. 테스트는 structural evidence (`readdir + filter` 로 0 건 assertion) 로 장치의 부재를 증명. CVE-style 재발 방지"

requirements-completed:
  - REGISTRY-02
  - REGISTRY-03
  - REGISTRY-06

# Metrics
duration: 13min
completed: 2026-04-19
---

# Phase 18 Plan 02: CLI surface (agrune maps {add, types, doctor, submit}) Summary

**4 개 agrune maps 서브커맨드가 `@agrune/registry` library 를 얇은 argparse wrapper 로 consume — add 한 줄로 registry 가 시작되고, submit 은 device flow 로 PR 스켈레톤까지 완주하며, token 은 disk 에 남지 않는다.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-04-19T18:43:53Z
- **Completed:** 2026-04-19T18:56:43Z
- **Tasks:** 4 (Task 1 add/types/doctor + tests, Task 2 submit + tests, Task 3 mcp bin dispatch + docs, Task 4 e2e smoke)
- **Files modified:** 17 (10 created + 7 modified)

## Accomplishments

- 4 CLI runner 파일 (add / types / doctor / submit) + 공용 shared.ts — 각각 DI surface 노출로 hermetic unit test
- 67 registry vitest cases green (기존 32 + 신규 28 unit + 7 e2e smoke) — workspace-wide 전체 테스트도 regression 없음 (registry 67/67, mcp 150/150, runtime 262/262 재실행 기준)
- `agrune maps --help` 가 4 서브커맨드 요약 단독 출력, `agrune manifest …` 서브커맨드 surface regression 없음 (validate/dev exit code 보존)
- tsup multi-entry build 로 `dist/cli/{add,types,doctor,submit}.{js,d.ts}` 각각 개별 파일 — mcp bin 의 dynamic import 가 필요한 파일만 ESM 로드
- `pnpm lint:no-legacy` exit 0 유지 (Phase 17 regression guard), `pnpm -r typecheck` 9 패키지 모두 통과
- Device flow 토큰 persistence 구조적 금지 증명 — test assertion 이 tmp + ~/.agrune/maps 에 `.auth*` 파일 0 건 확인

## Task Commits

1. **Task 1: add/types/doctor CLI runners + 19 unit tests** — `a56db43` (feat)
2. **Task 2: submit CLI (device flow + octokit) + 9 unit tests** — `298bddb` (feat)
3. **Task 3: 'maps' dispatch in agrune-mcp.ts + README/AGENTS docs** — `1667fe1` (feat)
4. **Task 4: e2e smoke test (http fixture round-trip)** — `403e420` (test)

**Plan metadata commit:** 후속 final metadata commit 에서 SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md 를 묶어 커밋.

## Files Created/Modified

**Created (10):**

- `packages/registry/src/cli/shared.ts` — parseArgs + errorExit + makeColor + printMapsUsage (picocolors 의존 없이 ANSI shim)
- `packages/registry/src/cli/add.ts` — runAddCli + AddCliDependencies interface
- `packages/registry/src/cli/types.ts` — runTypesCli + renderDts, AgruneMapsHost union + AgruneMapsTargetIds interface emit
- `packages/registry/src/cli/doctor.ts` — runDoctorCli + fetchRevokedHosts, graceful --refresh failure
- `packages/registry/src/cli/submit.ts` — runSubmitCli + authenticate + createSubmissionPr + PLACEHOLDER_CLIENT_ID export
- `packages/registry/tests/cli-add.test.ts` — 7 cases
- `packages/registry/tests/cli-types.test.ts` — 5 cases
- `packages/registry/tests/cli-doctor.test.ts` — 7 cases
- `packages/registry/tests/cli-submit.test.ts` — 9 cases
- `packages/registry/tests/e2e-smoke.test.ts` — 7 integration cases (http fixture → add/types/doctor)

**Modified (7):**

- `packages/registry/package.json` — 4 cli/* sub-path exports 추가
- `packages/registry/tsup.config.ts` — entry multi-file (index + cli/{add,types,doctor,submit})
- `packages/mcp/package.json` — `@agrune/registry: workspace:*` dependency
- `packages/mcp/bin/agrune-mcp.ts` — HELP_TEXT maps lines, Subcommands 섹션, isSubcommand guard, maps dispatch block with 4 dynamic imports
- `README.md` — 'Registry (v0.5 Phase 18)' 섹션 + env var 안내
- `AGENTS.md` — 실행 모드 섹션 4 라인 + 테스트 체크리스트 step
- `pnpm-lock.yaml` — mcp importer 가 @agrune/registry link 수신

## Decisions Made

- **CLI 는 @agrune/registry/cli/* sub-path exports 로 tree-shake** — mcp bin 이 호출할 때만 dynamic import. `src/index.ts` 에는 cli/* 를 re-export 하지 않아 library consumer 가 unnecessary surface 를 가져오지 않음.
- **submit 은 .json manifest 파일만 허용 (v0.5 MVP)** — TypeScript dynamic import 는 v0.6+ 로 연기. plan checker note, RESEARCH Open Q 5 deferred list 와 정렬. `.ts` 입력 시 REGISTRY_SCHEMA_INVALID 로 명확히 거절 + `v0.6+` 안내 메시지.
- **device flow client_id placeholder = 'AGRUNE_DEVICE_FLOW_CLIENT_ID'** (PLACEHOLDER_CLIENT_ID export, test 에서 재사용). `AGRUNE_OAUTH_CLIENT_ID` env 로 override, placeholder 사용 시 yellow warning 으로 OAuth App 등록 안내. client_secret 없는 device flow 특성상 client_id 는 공개 가능.
- **doctor 기본 offline (cache-only)** — `--refresh` 명시 opt-in 일 때만 incidents.json 네트워크 GET. T-18-15 (rate-limit abuse) 구조적 차단. --refresh 실패 시 graceful degradation (yellow warning 출력 후 classification 계속).
- **submit token persistence 금지 (Pitfall 2 구조적)** — `authenticate()` 내 변수 스코프만 사용. 테스트가 `readdir + filter` 로 `.auth*` 파일 0 건임을 structural assertion 으로 검증. fs.writeFile 호출 0.
- **`isSubcommand` guard 로 글로벌 --help/--version 가로챔 해제** — `agrune maps --help` 와 `agrune manifest --help` 가 서브커맨드 전용 help 핸들러로 흘러가게 됨. 기존 `agrune --help` 동작은 그대로 보존.
- **picocolors 미사용 + ANSI shim** — `makeColor()` 가 isTTY 체크 후 최소 ANSI escape codes 반환, non-TTY 는 identity. picocolors 가 registry deps 에는 있으나 CLI 코드에서 직접 import 하면 dist bundle 이 커지므로 회피.
- **e2e-smoke 는 fetchEntry DI 로 http 픽스처 연결** — 프로덕션 registry-client 가 HTTPS-only 를 강제하는 invariant 를 테스트에서 약화시키지 않고, Plan 01 이 열어둔 fetch impl override slot 을 활용. 0 real network outbound.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `maps --help` 가 전역 HELP_TEXT 로 가로채짐**
- **Found during:** Task 3 (첫 `node dist/bin/agrune-mcp.js maps --help` 실행)
- **Issue:** 전역 `args.includes('--help')` 체크가 서브커맨드 분기보다 먼저 실행되어, `agrune maps --help` 가 maps 전용 help 핸들러에 도달하지 못하고 전역 HELP_TEXT 로 떨어짐.
- **Fix:** `isSubcommand = args[0] === 'manifest' || args[0] === 'maps'` guard 추가. `!isSubcommand && (args.includes('--help') ...)` 로 서브커맨드 invocation 에서는 전역 핸들러 skip. 기존 `agrune --help` 는 그대로 작동.
- **Files modified:** packages/mcp/bin/agrune-mcp.ts (글로벌 --help/--version 블록)
- **Commit:** `1667fe1` (Task 3 commit 에 포함)
- **Root cause:** 기존 manifest 블록은 `--help` 없이만 invoke 되어 왔기 때문에 문제가 드러나지 않았음. Plan 02 의 `maps --help` 가 첫 번째 서브커맨드-내-help 사용 케이스. T-18-17 dispatch isolation 을 더 넓게 적용하는 방향이라 plan 의도와 일치 — architectural change 아님 (Rule 4 해당 안 됨).

기타 deviation 없음. Task 1/2/4 는 PLAN `<action>` 과 `<behavior>` 를 정확히 따라 실행.

## Issues Encountered

**소수 typecheck 이슈 (first attempt 에서 감지 → 즉시 fix):**

1. `runAddCli` 의 `contentHash(entry.manifest)` 호출이 zod-inferred shape 와 `AgruneManifest` type 간의 optional-field divergence (selector.fiber.path 필수 vs 선택) 로 TS error — `as unknown as AgruneManifest` cast 로 우회. 런타임에서 canonical JSON serialization 에는 영향 없음. 근본 원인은 `@agrune/manifest` 의 interface 선언이 `fiber.path: FiberIdentityPath` 를 required 로 두는데 zod schema 는 optional 로 inference — 향후 Plan 11 의 schema shape 정리 대상 (registry 범위 밖).
2. `cli-types.test.ts` 가 repeat 픽스처에 `template` 필드를 빠뜨려 TS 에러 → `template: 'todoItem_${key}'` 추가 후 pass.

**Workspace-wide 테스트 재실행 시 observation:** `pnpm -r test` 초기 실행에서 runtime 패키지의 1 케이스 (`act는 동적으로 추가된 overlay target을 즉시 snapshot에 반영하고 실행할 수 있다`) 가 timeout 으로 실패. 재실행 (`pnpm --filter @agrune/runtime test`) 에서는 262/262 전부 green — 이는 STATE.md Blockers/Concerns 의 **pre-existing order-dependent flaky** (17-01 SUMMARY baseline) 이며 Plan 02 과 무관. 본 plan 이 추가한 surface 는 runtime 패키지를 건드리지 않음.

## Authentication Gates

**없음** — Plan 02 는 순수 로컬 구현 작업. device flow 자체는 `runSubmitCli` 내부에서 사용자 shell 이 실제로 `agrune maps submit` 을 호출할 때 발동하는 것이고, 이 plan 의 테스트/빌드에서는 mock 이 대신 함. `AGRUNE_OAUTH_CLIENT_ID` 등록은 Plan 04 external-sync-instructions 및 사용자 수동 OAuth App 등록 시점에 필요 — 현재는 placeholder 로 yellow warning 만 뜸.

## User Setup Required

Plan 02 가 도입한 실행 surface 의 실제 사용 (= `agrune maps submit` 을 사용자가 호출) 은 다음 수동 준비가 필요:

1. **OAuth App 등록**: `github.com/settings/applications/new` 에서 oauth-app 유형으로 등록. client_id 를 `AGRUNE_OAUTH_CLIENT_ID` 환경변수에 export. scope = `public_repo` 면 충분 (device flow 가 자동 요청).
2. **대안**: PAT 를 `AGRUNE_GITHUB_TOKEN` 으로 설정하면 device flow 건너뜀.
3. **Registry repo 필요**: Plan 04 external-sync-instructions 를 따라 `github.com/agrune/maps` 공개 repo 생성 후 registry-seed/ 내용 push 가 선행되어야 submit PR 대상이 존재함.

`agrune maps add / types / doctor` 는 외부 OAuth 준비 없이 즉시 동작 (다만 실제 registry HTTPS 호출은 repo push 이후).

## Next Phase Readiness

- **Plan 04 (PR bot + weekly health check) 준비 완료:** submit flow 가 생성하는 PR shape (branch `submit/<host>-<version>`, path `manifests/<host>@<version>.json`, PR body with PR-bot hint comment) 이 Plan 04 PR bot 의 입력 형태와 정렬. `@agrune/registry` 전체 (schema + contentHash + submit path 규칙) 가 bot 에서 동일 package 로 재사용 가능.
- **Plan 04 external-sync-instructions 준비 완료:** submit CLI 가 placeholder client_id 로 빌드되어 있으므로, 사용자가 수동 OAuth App 등록 후 env 주입만 하면 바로 작동.
- **실제 사용자 출시 경로:** `@agrune/registry` + mcp bin 모두 dist 에 들어감. Phase 18 완료 (Plan 04 까지) 후 v0.5 milestone 전반 배포 시 자동 포함.
- **Blocker 없음.** Phase 17 regression guard (`pnpm lint:no-legacy` exit 0) 이 유지됨. typecheck 전체 green.

## Threat Flags

없음 — 본 plan 이 도입한 모든 security surface (CLI argv 파싱 / device flow 인증 / octokit fork-PR) 는 PLAN `<threat_model>` 블록 T-18-11 ~ T-18-18 에 이미 선언되어 있고 mitigate / transfer disposition 으로 처리됨. 신규 surface 추가분:
- `maps` dispatch block → T-18-17 (기존 manifest 분기 침해) mitigate by isolation guard (isSubcommand)
- token scope-local invariant → T-18-14 mitigate by structural fs-write 부재 (test assertion)
- placeholder client_id warning → T-18-13 awareness (부족한 OAuth 등록 상태 가시화)

## Self-Check

- `packages/registry/src/cli/shared.ts` — FOUND
- `packages/registry/src/cli/add.ts` — FOUND
- `packages/registry/src/cli/types.ts` — FOUND
- `packages/registry/src/cli/doctor.ts` — FOUND
- `packages/registry/src/cli/submit.ts` — FOUND
- `packages/registry/tests/cli-add.test.ts` — FOUND
- `packages/registry/tests/cli-types.test.ts` — FOUND
- `packages/registry/tests/cli-doctor.test.ts` — FOUND
- `packages/registry/tests/cli-submit.test.ts` — FOUND
- `packages/registry/tests/e2e-smoke.test.ts` — FOUND
- `packages/registry/dist/cli/add.js` — FOUND (build artifact)
- `packages/registry/dist/cli/types.js` — FOUND
- `packages/registry/dist/cli/doctor.js` — FOUND
- `packages/registry/dist/cli/submit.js` — FOUND
- `packages/mcp/dist/bin/agrune-mcp.js` — FOUND (grep 'maps' = 16 matches including dispatch block)
- Commit `a56db43` — FOUND
- Commit `298bddb` — FOUND
- Commit `1667fe1` — FOUND
- Commit `403e420` — FOUND

**Self-Check: PASSED** — 모든 파일 생성 확인, 모든 commit 해시 git log 에 존재.

---
*Phase: 18-registry*
*Completed: 2026-04-19*
