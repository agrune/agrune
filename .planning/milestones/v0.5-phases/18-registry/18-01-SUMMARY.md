---
phase: 18-registry
plan: 01
subsystem: registry
tags:
  - registry
  - scaffold
  - content-hash
  - lockfile
  - cache
  - staleness
  - zod
  - sha256
  - fast-json-stable-stringify

requires:
  - phase: 11-manifest
    provides: "@agrune/manifest ManifestSchema + AgruneManifest type (reused by RegistryEntrySchema)"
  - phase: 17-remove
    provides: "inline data-agrune-* 경로 0 + regression guard 활성 (registry 공개 전 구조적 전제)"
provides:
  - "@agrune/registry pnpm workspace 패키지 (library layer — CLI 는 Plan 02)"
  - "RegistryError + 6 error codes (REGISTRY_ENTRY_NOT_FOUND / CONTENT_HASH_MISMATCH / LOCKFILE_WRITE_FAILED / CACHE_PERMISSION_DENIED / REGISTRY_FETCH_FAILED / REGISTRY_SCHEMA_INVALID)"
  - "contentHash(manifest) → sha256:<hex> using fast-json-stable-stringify"
  - "RegistryEntrySchema (ManifestSchema wrapper + registry metadata + tier/env cross-field refinement)"
  - "cache (readCacheEntry / writeCacheEntry / getCacheDir / clearCache) — 0o700/0o600 + symlink guard + path traversal whitelist"
  - "lockfile (readLockfile / writeLockfile) — atomic tmp+rename, host-sorted, zod shape validation"
  - "registry-client (fetchRegistryEntry, DEFAULT_REGISTRY_BASE_URL) — HTTPS-only, exact semver + latest, 6 error codes"
  - "staleness (classifyStaleness, STALENESS_THRESHOLDS) — 7/28/56 day thresholds matching governance doc"
affects:
  - 18-02 (CLI 서브커맨드 agrune maps {add,types,doctor,submit}) — 이 라이브러리 layer 를 얇은 wrapper 로 consume
  - 18-03 (registry-seed + REGISTRY_GOVERNANCE.md) — validate-seed 스크립트가 RegistryEntrySchema.parse 사용
  - 18-04 (PR bot + weekly health check) — @agrune/registry npm install 로 schema validator 공유

tech-stack:
  added:
    - "@octokit/rest@^22.0.1 (도입, 실사용은 18-02 submit)"
    - "@octokit/auth-oauth-device@^8.0.3 (도입, 실사용은 18-02 submit)"
    - "fast-json-stable-stringify@^2.1.0 (canonical JSON for content-hash)"
    - "semver@^7.7.4 (도입, 실사용은 18-02)"
    - "picocolors@^1.1.1 (도입, 실사용은 18-02 CLI)"
    - "@types/semver@^7.7.1 (dev)"
  patterns:
    - "tsup ESM + dts build (기존 @agrune/manifest 미러링, workspace internal dep 전파)"
    - "zod.strictObject + superRefine 로 cross-field defense-in-depth (tier × allowedEnvironments)"
    - "atomic rename lockfile write (tmp-<6hex>.json + rename, T-18-09 mitigation)"
    - "AGRUNE_*_DIR / AGRUNE_*_BASE_URL env override 컨벤션 (cache + registry client 양쪽)"

key-files:
  created:
    - "packages/registry/package.json (@agrune/registry 0.4.1, workspace internal)"
    - "packages/registry/tsconfig.json"
    - "packages/registry/tsup.config.ts"
    - "packages/registry/src/index.ts (18 runtime + 7 type-only exports)"
    - "packages/registry/src/errors.ts (RegistryError + REGISTRY_ERROR_CODES)"
    - "packages/registry/src/content-hash.ts"
    - "packages/registry/src/schema.ts (RegistryEntrySchema + tier/env cross-field)"
    - "packages/registry/src/cache.ts (0o700/0o600 + symlink/path-traversal guard)"
    - "packages/registry/src/lockfile.ts (atomic host-sorted)"
    - "packages/registry/src/registry-client.ts (HTTPS-only fetch + index.json resolver)"
    - "packages/registry/src/staleness.ts (4-state classifier + thresholds)"
    - "packages/registry/tests/content-hash.test.ts (4)"
    - "packages/registry/tests/schema.test.ts (6)"
    - "packages/registry/tests/cache.test.ts (9)"
    - "packages/registry/tests/lockfile.test.ts (5)"
    - "packages/registry/tests/staleness.test.ts (8)"
  modified:
    - "pnpm-lock.yaml (신규 패키지 + 6 deps link)"

key-decisions:
  - "tier × allowedEnvironments cross-field 는 zod .superRefine 로 구조적 강제 (verified 만 prod 허용, community/unlisted 는 dev only) — Pitfall 7 근본 차단"
  - "v0.5 MVP 는 exact semver + 'latest' 만 지원, semver range 는 v0.6+ (RESEARCH Open Q 5)"
  - "환경 변수 네이밍 확정: AGRUNE_CACHE_DIR (cache override), AGRUNE_REGISTRY_BASE_URL (mirror override)"
  - "RegistryError class 는 Node 16+ Error options cause convention 사용 — 원 시스템 에러 (EACCES 등) 를 error.cause 로 unwrap 가능"
  - "Cache 는 readCacheEntry 시점에도 RegistryEntrySchema.parse 재실행 (T-18-05 defense-in-depth — 악성 로컬 프로세스 파일 교체 대비)"
  - "Lockfile 은 zod 로 shape 재검증 + 아톰 rename 보장 (T-18-09 partial write 차단)"
  - "registry-client 는 optional fetch impl override 지원 — PR bot (Plan 04) 의 record+replay 테스트 바닥 깔기"
  - "Cache host/version 인자는 path traversal 방어용 strict regex 화이트리스트 (T-18-10)"

patterns-established:
  - "Registry library layer ↔ CLI thin wrapper 분리: CLI (Plan 02) 가 ~80 LOC 수준의 argparse + 라이브러리 함수 orchestration 으로 머물게 한 pre-commit (지금) 상태"
  - "AGRUNE_* 환경변수 override 네이밍: testable 하고 CI 컨테이너에서 XDG-스러운 경로로 재지정 가능"
  - "zod strict + superRefine 페어링: shape (strict) 는 schema 정의에서, cross-field invariants 는 superRefine 에서 — 분리해 에러 메시지 path 선명화"
  - "atomic write 패턴: writeFile(tmp) + rename(tmp, target) + catch 시 unlink tmp — lockfile 뿐 아니라 추후 cache write 에서도 재사용 가능"

requirements-completed:
  - REGISTRY-02
  - REGISTRY-03
  - REGISTRY-06

# Metrics
duration: 7min
completed: 2026-04-19
---

# Phase 18 Plan 01: @agrune/registry 패키지 scaffold (library layer) Summary

**sha256 content-hash / 0o700·0o600 권한 / atomic lockfile rename / 4-state staleness 를 갖춘 `@agrune/registry` workspace 패키지 착지 — CLI (Plan 02) 는 얇은 argparse wrapper 로 머물 수 있다.**

## Performance

- **Duration:** ~7 min (실행 기준; PLAN 저자가 2026-04-20 로 기록했지만 실제 실행은 2026-04-19 17:23Z)
- **Started:** 2026-04-19T17:23:52Z
- **Completed:** 2026-04-19T17:30:33Z
- **Tasks:** 3 (Task 1 스캐폴드+schema+content-hash, Task 2 cache+lockfile+client+staleness, Task 3 workspace 통합 검증)
- **Files modified:** 17 (16 created + 1 modified pnpm-lock.yaml)

## Accomplishments

- `@agrune/registry` 신규 pnpm workspace 패키지 착지 (workspace internal, publish 는 v0.5 말기/v0.6 대기)
- PLAN `<interfaces>` 블록의 18 runtime + 7 type-only = 총 25 public API 전부 export
- Pitfall 1 (content-hash instability), Pitfall 5 (staleness thrashing), Pitfall 6 (cache permission), Pitfall 7 (prod root-import abuse), Pitfall 8 (cache dir symlink), T-18-09 (atomic lockfile), T-18-10 (path traversal) 7 가지 pitfall/threat 를 schema/hash/FS 레벨에서 구조적 차단
- 32 단위 테스트 green (4 content-hash / 6 schema / 8 staleness / 5 lockfile / 9 cache)
- Workspace 전체 빌드/타입체크/테스트/lint 모두 통과: 9 패키지 build OK, 707 tests pass 전체, `pnpm lint:no-legacy` exit 0 (Phase 17 regression guard 유지)

## Task Commits

각 task 는 atomic commit 으로 기록. TDD RED/GREEN 사이클이 병합된 커밋 포함 (RED 는 파일 없을 때만 잠깐 유지 후 GREEN 과 함께 단일 feat commit).

1. **Task 1-a: 스캐폴드 + errors 모듈** — `e63f719` (feat)
2. **Task 1-b: RegistryEntrySchema (manifest v3 wrapper + tier/env cross-field)** — `a100f45` (feat)
3. **Task 1-c: contentHash + barrel export** — `e3c87e3` (feat)
4. **Task 2-a: classifyStaleness + STALENESS_THRESHOLDS** — `ee88271` (feat)
5. **Task 2-b: readLockfile/writeLockfile (atomic agrune.maps.lock.json)** — `e6806aa` (feat)
6. **Task 2-c: ~/.agrune/maps disk cache (0700/0600 + symlink guard)** — `ea8479b` (feat)
7. **Task 2-d: fetchRegistryEntry HTTPS client + complete barrel** — `3551b8f` (feat)

_Task 3 (workspace 통합 검증) 은 read+verify only — regression guard / typecheck / build / tests 확인만 수행, 파일 변경 없음._

**Plan metadata commit:** 후속 final metadata commit 에서 SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md 를 묶어 커밋.

## Files Created/Modified

**Created (16):**

- `packages/registry/package.json` — `@agrune/registry@0.4.1` workspace 패키지 매니페스트. deps: `@agrune/manifest` workspace + `@octokit/rest@^22.0.1` + `@octokit/auth-oauth-device@^8.0.3` + `fast-json-stable-stringify@^2.1.0` + `semver@^7.7.4` + `picocolors@^1.1.1` + `zod@^4.3.6`
- `packages/registry/tsconfig.json` — strict ES2022 ESM + types:["node"]
- `packages/registry/tsup.config.ts` — ESM + dts + sourcemap
- `packages/registry/src/index.ts` — public API barrel (18 runtime + 7 type exports)
- `packages/registry/src/errors.ts` — `RegistryError` class + `REGISTRY_ERROR_CODES` readonly array (6 codes)
- `packages/registry/src/content-hash.ts` — `sha256:<64hex>` via `fast-json-stable-stringify` (Pitfall 1 구조적 차단)
- `packages/registry/src/schema.ts` — `RegistryEntrySchema` / `RegistryMetadataSchema` / `RegistryTierSchema` / `AllowedEnvironmentsSchema` + tier×env cross-field (Pitfall 7)
- `packages/registry/src/cache.ts` — `getCacheDir` / `readCacheEntry` / `writeCacheEntry` / `clearCache`. AGRUNE_CACHE_DIR override. 0o700/0o600 강제. symlink lstat guard (T-18-08). path traversal whitelist (T-18-10). 읽기 시 schema 재검증 (T-18-05)
- `packages/registry/src/lockfile.ts` — `readLockfile` / `writeLockfile` / `LOCKFILE_NAME`. tmp+rename atomic (T-18-09). host-sorted entries. zod shape 재검증
- `packages/registry/src/registry-client.ts` — `fetchRegistryEntry` / `DEFAULT_REGISTRY_BASE_URL`. HTTPS-only (T-18-07). 'latest' → index.json 해석. exact semver 외 range 미지원 (v0.5 MVP). fetch impl override 지원
- `packages/registry/src/staleness.ts` — `classifyStaleness` / `STALENESS_THRESHOLDS`. 7/28/56 day 경계. `entry.disabled` 단락 회로
- `packages/registry/tests/{content-hash,schema,staleness,lockfile,cache}.test.ts` — 5 test files / 32 cases

**Modified (1):**

- `pnpm-lock.yaml` — 신규 패키지 링크 + 6 production deps (octokit 2 + fast-json-stable-stringify + semver + picocolors + zod re-resolve)

## Decisions Made

- **tier × allowedEnvironments cross-field 는 zod superRefine 로 강제** — verified 만 `prod` 허용, community/unlisted 는 `dev` only. Pitfall 7 근본 차단. 에러 메시지 `path: ['registry', 'allowedEnvironments']` 로 사용자에게 정확한 수정 지점 지시.
- **v0.5 MVP: exact semver + 'latest' 만 지원** — `^1.2.0` 같은 range 는 v0.6+ (RESEARCH Open Q 5 권고). v0.5 스코프 축소로 semver lib runtime import 생략 가능 (semver dep 은 Plan 02 submit 에서 도입).
- **환경 변수 네이밍 확정:**
  - `AGRUNE_CACHE_DIR` — cache 경로 override (기본 `~/.agrune/maps`)
  - `AGRUNE_REGISTRY_BASE_URL` — registry mirror override (기본 `https://raw.githubusercontent.com/agrune/maps/main`, HTTPS-only 강제)
- **RegistryError 는 Node 16+ Error options cause convention** — 원 시스템 에러 (EACCES, ENOTFOUND, EINVAL 등) 를 `err.cause` 로 unwrap 가능. CLI (Plan 02) 에서 사용자에게 "permission denied: original code EACCES" 같은 drill-down 메시지 가능.
- **Cache 읽기 시점에도 RegistryEntrySchema.parse 재실행** — writeCacheEntry 가 검증한 바이트라도 로컬 악성 프로세스가 파일 교체 가능하므로 트러스트 경계는 "디스크 → 메모리" 에서 리셋됨. 동일 로직을 readLockfile + fetchRegistryEntry 에도 일관되게 적용 (T-18-02 / T-18-05).
- **Cache host/version 인자 strict regex whitelist** — `HOST_PATTERN = /^[a-z0-9][a-z0-9.\-]{0,252}$/i` + `VERSION_PATTERN = /^(latest|[A-Za-z0-9][A-Za-z0-9.\-+]{0,63})$/`. 어떤 slash, `..`, null byte 등도 file path 구성 전에 거절 (T-18-10 path traversal).
- **lockfile 은 random tmp suffix + rename + catch-cleanup** — 여러 CLI 동시 실행 시 tmp 파일 충돌 방지. 실패 시 unlink(tmp) 로 잔재 파일 제로.
- **registry-client 는 optional `fetch` impl override** — Plan 04 PR bot 스크립트가 record+replay 테스트 패턴을 주입할 수 있게 미리 열어둠. 기본은 `globalThis.fetch` (Node 22 built-in).

## Deviations from Plan

**None of the Rule 1-3 auto-fix category — plan 은 정확히 작성된 대로 실행됨.**

작은 문서화 개선 2건은 scope 안에서 해결:

- PLAN `<action>` 의 schema refinement 는 "community tier + prod 거부" 만 명시했지만, RESEARCH "Pitfall 7" 의 *intent* 는 "unlisted 도 prod 불가" 였다. 구현은 `tier !== 'verified'` 로 반올림 — verified 만 prod 허용. 이는 plan 의 의도를 더 엄격히 충족 (더 좁은 surface, defense-in-depth). Test 파일의 `rejects community+prod` case 는 그대로 pass.
- PLAN `<behavior>` 의 cache.test.ts 세션에 "symbolic link" 케이스가 있었지만 구체 assertion 은 불명확했음. 구현은 `lstat + isSymbolicLink()` 후 `CACHE_PERMISSION_DENIED` throw 로 고정 — 테스트는 `rejects.toMatchObject({ code: 'CACHE_PERMISSION_DENIED' })` 로 기록.

## Issues Encountered

**None.** 7 commits 이 모두 첫 시도에 green. pre-commit hook / CI checks / typecheck / build 전부 pass. Pre-existing runtime full-suite order-dependent flaky 1건 (17-01 SUMMARY baseline) 은 재현되지 않음 — `pnpm -r` 로 각 패키지 독립 실행되어 영향 없음.

## User Setup Required

None — 외부 서비스 / 시크릿 / GitHub App 등록 없음. Plan 02 에서 device flow client_id 등록 가 필요해질 때 그 시점에 USER-SETUP.md 작성 예정.

## Next Phase Readiness

- **Plan 02 (CLI 서브커맨드) 준비 완료:** library layer 의 18 runtime export 로 `agrune maps {add, types, doctor, submit}` 전부 얇은 wrapper 로 구현 가능. `add` → `fetchRegistryEntry` + `contentHash` + `writeCacheEntry` + `writeLockfile`. `doctor` → `readLockfile` + `classifyStaleness`. `submit` → `@octokit/rest` + device flow (이미 deps 에 등록).
- **Plan 03 (registry-seed + governance) 준비 완료:** `RegistryEntrySchema.parse` 로 seed manifest validator 스크립트 가능. `STALENESS_THRESHOLDS` 상수가 governance doc 의 7/28/56 day 수치를 정확히 반영.
- **Plan 04 (PR bot) 준비 완료:** `@agrune/registry` 를 npm install 하면 schema validator + content-hash 공유 가능 (publish 전 workspace internal 단계에서는 git submodule 또는 local install 로 우회).
- **Blocker 없음.** Phase 17 regression guard (`pnpm lint:no-legacy` exit 0) 이 계속 유지됨.

## Threat Flags

없음 — 본 plan 이 도입한 모든 security surface (registry fetch / disk cache / lockfile write) 는 PLAN `<threat_model>` 블록 T-18-01..T-18-10 에 이미 선언되어 있고 mitigate 또는 accept disposition 으로 처리됨.

## Self-Check

- `packages/registry/src/errors.ts` — FOUND
- `packages/registry/src/content-hash.ts` — FOUND
- `packages/registry/src/schema.ts` — FOUND
- `packages/registry/src/cache.ts` — FOUND
- `packages/registry/src/lockfile.ts` — FOUND
- `packages/registry/src/registry-client.ts` — FOUND
- `packages/registry/src/staleness.ts` — FOUND
- `packages/registry/src/index.ts` — FOUND
- `packages/registry/package.json` — FOUND
- `packages/registry/tests/content-hash.test.ts` — FOUND
- `packages/registry/tests/schema.test.ts` — FOUND
- `packages/registry/tests/cache.test.ts` — FOUND
- `packages/registry/tests/lockfile.test.ts` — FOUND
- `packages/registry/tests/staleness.test.ts` — FOUND
- Commit `e63f719` — FOUND
- Commit `a100f45` — FOUND
- Commit `e3c87e3` — FOUND
- Commit `ee88271` — FOUND
- Commit `e6806aa` — FOUND
- Commit `ea8479b` — FOUND
- Commit `3551b8f` — FOUND

**Self-Check: PASSED** — 모든 파일 생성 확인, 모든 commit 해시 git log 에 존재.

---
*Phase: 18-registry*
*Completed: 2026-04-19*
