---
phase: 18-registry
fixed_at: 2026-04-20T04:34:00Z
review_path: .planning/phases/18-registry/18-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 18: Code Review Fix Report

**Fixed at:** 2026-04-20T04:34:00Z
**Source review:** `.planning/phases/18-registry/18-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (2 Critical + 6 Warning; Info deferred per fix_scope)
- Fixed: 8
- Skipped: 0

`critical_warning` scope만 수행. Info 5건은 이번 round에서 다루지 않음.

## Fixed Issues

### CR-01: `pr-bot.mjs` `execSync` — shell injection via PR-controlled filename

**Files modified:** `registry-seed/.github/scripts/pr-bot.mjs`
**Commit:** eaecd5e
**Applied fix:** `execSync` → `execFileSync` argv 배열로 교체 + `MANIFEST_FILENAME_RE` whitelist regex 를 모듈 상단에 선언. `octokit.pulls.listFiles` 결과를 이 regex 로 early-reject, 그리고 `readBeforeJson` 진입부에서도 defense-in-depth 로 재검증. 공격자가 `manifests/foo$(cmd).json` 류 파일명을 PR 에 포함해도 쉘에 도달하지 못함.

### CR-02: `pr-bot.mjs` reads fork-controlled `maintainers.json`

**Files modified:** `registry-seed/.github/scripts/pr-bot.mjs`
**Commit:** eaecd5e (CR-01 과 묶어서 동일 파일 단일 atomic 커밋)
**Applied fix:** `readMaintainers()` (fork working tree 에서 `readFileSync('maintainers.json')`) 제거하고 `readMaintainersFromBase()` 추가 — `octokit.repos.getContent({owner, repo, path:'maintainers.json', ref:'main'})` 로 base repo 의 main 브랜치 값을 fetch. base64 디코딩 후 `parsed.maintainers` 를 `Set` 으로 반환. 실패 시 빈 Set + core.warning. fork PR 저자가 `maintainers.json` 을 같이 수정해서 velocity:holddown 라벨을 우회하던 경로를 차단.

### WR-01: `add.ts` overwrites user-set `disabled` marker on re-add

**Files modified:** `packages/registry/src/cli/add.ts`
**Commit:** 4c53ead
**Applied fix:** `writeLock` 직전에 기존 entry 를 lookup → `disabled.reason === 'user'` 면 stderr 에 "maps enable <host> first" 안내 + exit 1. `stale`/`revoked` 는 의도적으로 drop (fresh fetch 가 auto-disable 을 clear 하는 게 의도된 동작). 기존 67개 테스트 모두 통과.

### WR-02: `doctor.ts` revocation ignores `version` field

**Files modified:** `packages/registry/src/cli/doctor.ts`
**Commit:** d1192c3
**Applied fix:** `fetchRevokedHosts` 반환 타입을 `Set<string>` → `Map<string, Set<string>>` 로 변경. `incidents.json` 의 `{host, version?}` entry 를 parse 해서 version 이 있으면 그 버전만, 없으면 wildcard `'*'` 을 키로 저장. doctor 루프에서 `versions.has('*') || versions.has(entry.version)` 으로 revoke 여부 판정. "`0.9.0` 을 revoke 했는데 `1.0.0` 까지 꺼지던" false-positive 제거.

### WR-03: `submit.ts` swallows non-404 `getContent` errors

**Files modified:** `packages/registry/src/cli/submit.ts`
**Commit:** 8f6befc
**Applied fix:** 리뷰가 제안한 Option 1 선택 — `octokit.repos.getContent` probe 블록 전체 제거. v0.5 는 new-submit-only 이고, 반환된 `sha` 를 어차피 `createOrUpdateFileContents` 에 전달하지 않아서 실패 경로에서 misleading "informational" 주석만 남던 dead code 였음. 주석으로 "update semantics deferred to v0.6+" 명시. 기존 submit 테스트 모두 통과 (mock 의 getContent 는 assertion 되지 않아 영향 없음).

### WR-04: `content-hash.ts` — `null` vs `undefined` cross-author drift

**Files modified:** `packages/registry/src/content-hash.ts`, `packages/registry/tests/content-hash.test.ts`
**Commit:** f0dc308
**Applied fix:** 리뷰 권고대로 "먼저 regression test 를 추가 → 깨지면 strip" 단계를 수행. 새 테스트 (`treats null and undefined on optional fields as identical (cross-toolchain drift guard)`) 가 실패하는 것을 확인. 이후 `stripNullOptionals(v, path)` 전처리 함수를 `contentHash` 앞단에 추가. legit null 인 `FiberPathSegment.key` 는 `isLegitNullField(path, key)` 로 `.fiber.path[]` 경로 하의 `key` 만 예외 처리. 10개 seed manifest 가 null 을 포함하지 않아서 기존 published contentHash 들은 그대로 유지되는 것을 `scripts/registry-seed/validate-seed.mjs` 로 확인.

### WR-05: `health-check.mjs` — `seedUrl` scheme / private-host 재검증 부재

**Files modified:** `registry-seed/.github/scripts/_shared.mjs` (신규), `registry-seed/.github/scripts/pr-bot.mjs`, `registry-seed/.github/scripts/health-check.mjs`
**Commit:** 4a97b78
**Applied fix:** `isPrivateHost` + 신규 `isSafeSeedUrl(url)` 을 `_shared.mjs` 로 추출 (리뷰 권고). pr-bot 은 이제 로컬 copy 대신 `_shared.mjs` 에서 import. health-check 의 loop 에서 `page.goto(seedUrl)` 직전에 `if (!isSafeSeedUrl(seedUrl)) core.warning(...); continue` 추가 — 누군가 bot 우회 commit 을 merge 해도 Playwright 가 `file://`/`data:`/private host 로 네비게이션하지 않음. node --check 통과.

### WR-06: `health-check.yml` — `actions/checkout` persist-credentials

**Files modified:** `registry-seed/.github/workflows/health-check.yml`
**Commit:** 8b0f585
**Applied fix:** `actions/checkout@v4` 의 `token: ${{ secrets.GITHUB_TOKEN }}` 제거하고 `persist-credentials: false` 추가. `.git/config.http.*.extraheader` 에 토큰이 남지 않도록 함 → npm postinstall script 이 transitive dep 에서 토큰을 읽어가는 경로 차단. 마지막 `git push` 단계에서만 `git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@...` 로 일회성 재부착. YAML 문법 python yaml 로 검증 완료.

## Skipped Issues

없음. 모든 in-scope finding 이 성공적으로 수정됨.

## Verification Summary

- **Tier 2 syntax check:** 모든 `.ts` 수정본은 `pnpm --filter @agrune/registry exec tsc --noEmit` 통과. 모든 `.mjs` 수정본은 `node --check` 통과. YAML 은 python yaml.safe_load 로 parse 확인.
- **Tier 1 re-read:** 모든 Edit 후 파일 상태를 Read 로 재확인하여 fix 와 surrounding context 가 정상인지 검증.
- **Test suite regression:** `pnpm --filter @agrune/registry test` 전체 68 tests 통과 (WR-04 의 drift-guard 신규 테스트 포함, 기존 67 테스트 모두 유지).
- **Seed integrity:** `node scripts/registry-seed/validate-seed.mjs` → "10/10 seed manifests valid" — WR-04 의 contentHash 전처리 변경이 이미 published 된 seed index hash 들에 영향 없음 확인.
- **Commits:** 7개 (CR-01 + CR-02 는 동일 파일에서 동일 threat surface 관련 이슈라 1커밋으로 atomic 통합).

---

_Fixed: 2026-04-20T04:34:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
