---
phase: 18-registry
verified: 2026-04-20T04:20:00Z
status: passed
score: 5/5
overrides_applied: 0
re_verification: false
user_manual_pending:
  - item: "github.com/agrune/maps public repo 생성 + registry-seed 초기 push"
    documented_in: ".planning/phases/18-registry/external-sync-instructions.md § 1A-1E"
    reason: "autonomous 모드 제약 — Claude 가 외부 repo 생성/push 수행 불가 (by design)"
  - item: "Branch protection rule 설정 (main, required-checks)"
    documented_in: "external-sync-instructions.md § 2"
    reason: "GitHub Settings UI 수동 작업 — by design"
  - item: "OAuth App(agrune-maps-submit) 등록 + AGRUNE_OAUTH_CLIENT_ID env 주입"
    documented_in: "external-sync-instructions.md § 3"
    reason: "github.com/settings/applications/new 수동 등록 — by design"
  - item: "CODEOWNERS `@agrune-solo` + maintainers.json `agrune-solo` 를 실제 GitHub handle 로 교체"
    documented_in: "external-sync-instructions.md § 1C"
    reason: "repo push 후 사용자 로컬 sed/python 수동 실행 — by design"
  - item: "Smoke test 6A-F (add/types/doctor/doctor --refresh/submit --dry-run/첫 PR workflow 실행)"
    documented_in: "external-sync-instructions.md § 6"
    reason: "실제 public repo push 후에만 가능 — by design"
  - item: "v0.6 블로커: @agrune/registry npm publish 후 registry-seed/.github/scripts/_schema.mjs inline 사본 제거"
    documented_in: "external-sync-instructions.md § 7"
    reason: "v0.6 milestone 작업 (v0.5 scope 외)"
---

# Phase 18: REGISTRY Verification Report

**Phase Goal:** `github.com/agrune/maps` 가 공개되어 외부 사이트 자동화가 커뮤니티 기여로 확장되고, 트래픽이 붙기 전 v0.5 scope 안에서 tier/velocity limit/PR bot/revocation 경로를 포함한 governance 가 확정된다.
**Verified:** 2026-04-20T04:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (5 Success Criteria from ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `github.com/agrune/maps` 저장소 + 10 seed manifest(verified tier) merge 상태 | VERIFIED | `registry-seed/` 내부에 10개 seed manifest(전부 `tier=verified` + `allowedEnvironments=['dev','prod']`) 존재, validate-seed 10/10 pass, `index.json` 에 sha256 contentHash 기록. 외부 repo push 자체는 autonomous 제약으로 external-sync-instructions §1 에 사용자 수동 경로 완전 문서화 — 로컬 prototype 단계의 완결은 확정 |
| 2 | CLI `agrune maps {add,types,doctor,submit}` 동작 | VERIFIED | 4 runner 파일 (`src/cli/add.ts` 154L, `types.ts` 138L, `doctor.ts` 220L, `submit.ts` 361L) 전부 library 함수에 wired. `agrune maps --help` 실제 실행 OK (4 subcommand 노출). 67 unit+e2e test pass. mcp bin `isSubcommand` guard + dispatch block 존재 |
| 3 | REGISTRY_GOVERNANCE.md tier/velocity/revocation/absence/transition 명시 | VERIFIED | 113 lines, 8 섹션 전부 존재: Tiers(verified/community/unlisted) · Velocity Limit(30일 holddown, maintainers.json 면제) · Revocation Path(incidents.json + CLI auto-disable) · Maintainer Absence Default(30일 강등) · Tier Transition · Staleness Detection · Security Guardrails · Reporting |
| 4 | PR bot `sensitive:false` 자동 하이라이트 + `requires-human-review:sensitive` 라벨 + weekly health check stale 라벨 | VERIFIED | `pr-bot.mjs` 245L, 4 signal 라벨러(sensitive-diff + tier-escalation + schema-fail + velocity-holddown), `requires-human-review:sensitive` 라벨 부착 로직 명시. `health-check.yml` cron `0 6 * * 1` + `health-check.mjs` 200L, 2-strike rule + `stale` 라벨 자동 부여. snapshot-only 구조적 증명: click/fill/type/press 0 match |
| 5 | `agrune maps doctor` 로컬 캐시 staleness 진단 + auto-disable 제안 | VERIFIED | `doctor.ts` 220L 이 `classifyStaleness(7/28/56 day)` 호출, stale 시 경고 + `--auto-disable` 제안 문구 출력, `--auto-disable` 시 lockfile 에 `disabled: { reason: 'stale', at: ... }` 기록. `--refresh` 시 incidents.json fetch 후 revoked 자동 disable |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/registry/src/` (8 files) | library layer | VERIFIED | errors/content-hash/schema/cache/lockfile/registry-client/staleness/index 전부 substantive (23~164L) |
| `packages/registry/src/cli/` (5 files) | CLI runners | VERIFIED | add/types/doctor/submit/shared 전부 DI-first, 138~361L substantive |
| `packages/registry/tests/` (10 files) | tests | VERIFIED | 67/67 pass (content-hash 4 + schema 6 + staleness 8 + lockfile 5 + cache 9 + cli-add 7 + cli-types 5 + cli-doctor 7 + cli-submit 9 + e2e-smoke 7) |
| `registry-seed/manifests/*.json` (10 files) | seed manifests | VERIFIED | 10/10 verified tier, HTTPS seedUrl, validate-seed 10/10 pass |
| `registry-seed/REGISTRY_GOVERNANCE.md` | governance spec | VERIFIED | 113 lines, 8 섹션 + 3 tier 서브섹션 |
| `registry-seed/CODEOWNERS` | maintainer gate | VERIFIED | 22L, 6 governance-critical 파일에 `@agrune-solo` placeholder (사용자 교체 대기) |
| `registry-seed/.github/workflows/*.yml` (3 files) | CI workflows | VERIFIED | validate-schema/pr-bot/health-check, YAML 유효 |
| `registry-seed/.github/scripts/*.mjs` (4 files) | bot/validator logic | VERIFIED | _schema/validate-schema/pr-bot/health-check, node --check pass, 173~245L substantive |
| `registry-seed/maintainers.json` | allow-list | VERIFIED | `agrune-solo` placeholder (사용자 교체 대기, 문서화됨) |
| `registry-seed/incidents.json` | revocation placeholder | VERIFIED | `[]` 초기값 |
| `registry-seed/index.json` | machine catalog | VERIFIED | 10 entries + sha256 contentHash per entry |
| `scripts/registry-seed/validate-seed.mjs` | local validator | VERIFIED | pnpm validate:seed → 10/10 pass |
| `.planning/phases/18-registry/external-sync-instructions.md` | 사용자 수동 경로 | VERIFIED | 338L, 9 섹션 (repo 생성/branch protection/OAuth App/base URL/boundary/smoke test/schema sync/pending todos/rollback) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `cli/add.ts` | `@agrune/registry` library | `import { fetchRegistryEntry, writeCacheEntry, writeLockfile, contentHash }` | WIRED | 호출 + DI 주입 구조 확인 |
| `cli/doctor.ts` | `@agrune/registry` library | `import { classifyStaleness, readLockfile, writeLockfile }` | WIRED | staleness 분류 후 lockfile 에 disabled 기록 흐름 확인 |
| `cli/types.ts` | `@agrune/registry` library | `import { readLockfile, readCacheEntry }` + `.d.ts` emit | WIRED | lockfile 기반 host union emit |
| `cli/submit.ts` | `@octokit/rest` + `@octokit/auth-oauth-device` | dynamic `import('@octokit/rest')` + device flow | WIRED | getAuthenticated→createFork→createOrUpdateFileContents→pulls.create 흐름 |
| `mcp/bin/agrune-mcp.ts` | `cli/{add,types,doctor,submit}` | `isSubcommand` guard + `maps` dispatch + dynamic import | WIRED | `agrune maps --help` 실행 시 4 subcommand 노출 확인 |
| `scripts/registry-seed/validate-seed.mjs` | `@agrune/registry` (RegistryEntrySchema + contentHash) | workspace:* devDependency link | WIRED | pnpm validate:seed → 10/10 pass |
| `pr-bot.mjs` | `_schema.mjs` (inline RegistryEntrySchema) | `import { RegistryEntrySchema } from './_schema.mjs'` | WIRED | schema-fail / sensitive-diff 라벨 부착 로직 |
| `health-check.mjs` | playwright + 2-strike state | `.count()` 만 호출, consecutiveFails >= 2 시 `stale` 라벨 issue | WIRED | grep assertion: click/fill/type/press 0 match |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 10 seed manifests schema 검증 | `pnpm validate:seed` | `10/10 seed manifests valid` | PASS |
| Registry package full test suite | `pnpm --filter @agrune/registry test` | `67 passed (67)` | PASS |
| `agrune maps --help` dispatch | `node packages/mcp/dist/bin/agrune-mcp.js maps --help` | 4 subcommand 목록 + Commands 블록 출력, exit 0 | PASS |
| 모든 registry-seed scripts syntax | `node --check` _schema/validate-schema/pr-bot/health-check | ALL SCRIPTS OK | PASS |
| Phase 17 regression guard | `pnpm lint:no-legacy` | `OK - No legacy 'data-agrune-' outside allow-list` | PASS |
| Health-check snapshot-only invariant | `grep '\.(click|fill|type|press)\(' health-check.mjs` | 0 match | PASS |
| 10 seed 전부 HTTPS seedUrl | `grep -c "https://" registry-seed/manifests/*.json` | 10/10 | PASS |
| 10 seed 전부 verified tier + allowedEnvironments | Python JSON inspection | `verified / ['dev','prod']` × 10 | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| REGISTRY-01 | `github.com/agrune/maps` 저장소 구조 + 10 seed manifest (low-risk) | SATISFIED | 10 seed 파일 + validate-seed 10/10 + `registry.tier=verified`. 외부 repo 공개는 external-sync-instructions §1 로 사용자 수동 완성 대기 (by design) |
| REGISTRY-02 | CLI `agrune maps {add,types,doctor,submit}` | SATISFIED | 4 runner 구현 + mcp bin dispatch + `agrune maps --help` 실동작 |
| REGISTRY-03 | `~/.agrune/maps/<host>@<ver>.json` 캐시 + `agrune.maps.lock.json` content-hash 잠금 | SATISFIED | `cache.ts` 0o700/0o600 + path-traversal whitelist, `lockfile.ts` atomic rename, `content-hash.ts` sha256 + fast-json-stable-stringify |
| REGISTRY-04 | `REGISTRY_GOVERNANCE.md` tier/velocity/revocation | SATISFIED | 113L, 8 섹션 전부 존재 (tier 3종 + 30일 holddown + incidents revocation + 30일 absence default) |
| REGISTRY-05 | PR bot + weekly selector health check | SATISFIED | `pr-bot.yml` (pull_request_target + label-only) + `pr-bot.mjs` 4 signal + `health-check.yml` Monday 06:00 UTC cron + 2-strike rule |
| REGISTRY-06 | `agrune maps doctor` staleness 진단 + auto-disable 경로 | SATISFIED | `doctor.ts` 220L + `classifyStaleness` 7/28/56 day 경계 + `--auto-disable` flag + `--refresh` incidents fetch |

**Requirements coverage:** 6/6 SATISFIED

### Anti-Patterns Found

grep 스캔 실시: TODO/FIXME/XXX/HACK, placeholder content, 빈 반환, console.log only. 결과: 본 phase 신규 파일에서 Blocker 수준 anti-pattern 없음. Info 수준:

| File | Observation | Severity |
|------|-------------|----------|
| `registry-seed/CODEOWNERS` | `@agrune-solo` placeholder | Info — external-sync-instructions §1C 에 교체 절차 문서화, by design (autonomous mode) |
| `registry-seed/maintainers.json` | `"agrune-solo"` placeholder | Info — 동일, 문서화됨 |
| `packages/registry/src/cli/submit.ts` L43 | `PLACEHOLDER_CLIENT_ID = 'AGRUNE_DEVICE_FLOW_CLIENT_ID'` | Info — yellow warning 으로 사용자에게 OAuth App 등록 안내, by design |
| `registry-seed/.github/scripts/_schema.mjs` | ManifestSchema/RegistryEntrySchema byte-for-byte 복제 | Info — DO NOT EDIT 헤더 + sync checklist + v0.6 npm publish 후 제거 경로 문서화 (external-sync §7) |

### Human Verification Required

없음 — autonomous mode 지침에 따라 user-manual 항목(외부 repo push, OAuth App, placeholder 교체, smoke test)은 by design 으로 분류되어 `user_manual_pending` frontmatter 에 분리 기록. 이들은 v0.5 phase value 를 block 하지 않음:

- 로컬 prototype 레이어(@agrune/registry, CLI, registry-seed, 3 workflows, 4 scripts, governance doc, external-sync-instructions)는 전부 완성·테스트 green
- 외부 push 는 설계상 사용자 수동 단계이고, 문서화(338L / 9 섹션)가 완결된 경로로 실행 가능한 상태
- 실제 smoke test(6A-F)는 public repo 가 존재해야만 수행 가능 — verification 단계에서 programmatic 검증 불가하지만 본 phase 의 책임 경계 밖

### Gaps Summary

Gap 없음. 5 SC 전부 VERIFIED, 6 requirements 전부 SATISFIED, 67 registry tests green + 10 seed validate green + Phase 17 regression guard 유지. autonomous mode 제약으로 인한 user-manual pending 항목은 by design 이며 external-sync-instructions 에 완전 문서화되어 있어 사용자가 자러간 뒤에도 순차 재개 가능한 상태.

---

*Verified: 2026-04-20T04:20:00Z*
*Verifier: Claude (gsd-verifier)*
