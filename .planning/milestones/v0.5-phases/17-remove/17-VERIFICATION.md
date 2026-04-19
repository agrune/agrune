---
phase: 17-remove
verified: 2026-04-20T01:42:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
---

# Phase 17: REMOVE Verification Report

**Phase Goal:** 단일 authoring 경로 원칙의 구조적 확정 — inline `data-agrune-*` 스캐너 bootstrap 경로가 runtime에서 완전히 제거되고, 모든 문서·외부 조직 프로필이 "target mapping" 용어로 재작성된다.

**Verified:** 2026-04-20T01:42:00Z
**Status:** PASSED
**Re-verification:** No — 최초 검증

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `packages/runtime/src/runtime/dom-scanner.ts`·`manifest-builder.ts` bootstrap 경로가 완전히 삭제되고 신규 페이지 로드에서 `data-agrune-*` 속성은 runtime이 무시 | ✓ VERIFIED | 두 파일 모두 파일시스템에서 부재(`ls` 확인). `packages/runtime/src`·`packages/browser/src` 전체에서 `scanAnnotations\|scanGroups\|buildManifest\|LIVE_SCAN_\|collectLiveDescriptors\|buildLiveSelector` 매치 0. 신규 spec `runtime-ignores-legacy.spec.ts`가 legacy DOM + empty manifest → `snapshot.targets.length === 0` 을 직접 증명(6/6 PASS) |
| 2 | README·AGENTS·`docs/*`의 `data-agrune-*` 어노테이션 섹션 전면 제거 + manifest + `defineTarget`/`defineMacro` 중심 재작성 | ✓ VERIFIED | 7개 product-surface 문서(README / AGENTS / PRIVACY / workflows/annotate/WORKFLOW.md / docs/agent-setup.md / docs/improvement-notes.md / packages/mcp/README.md) 에서 `data-agrune-(action\|key\|group\|canvas\|meta\|masked\|sensitive\|name\|desc)` 매치 0. README/AGENTS에 `TargetResolver`·`defineManifest`·`@agrune/manifest` 복수 회 등장. `docs/notes/`·`docs/superpowers/` 는 17-03 SUMMARY가 명시한 historical/tertiary archive로 범위 제외 |
| 3 | 외부 `.github/profile/README.md` 가 "annotation" → "target mapping" 용어로 sync되고 제품 표면 설명이 manifest pivot 반영 | ✓ VERIFIED | `/Users/chenjing/dev/agrune/.github/profile/README.md` 에서 `data-agrune-` 매치 0, `annotation\|annotated`(case-insensitive) 매치 0. "manifest target mapping"·`defineManifest`·`defineTarget`·`@agrune/manifest` 등 pivot 용어 충분히 포함. 로컬 commit `3d429ba` 존재(push 사용자 수동 대기, MEMORY 정책 준수) |
| 4 | `grep -r 'data-agrune-' packages/` 가 테스트 픽스처·build-linter 레거시 외에는 매치하지 않음 | ✓ VERIFIED | `pnpm lint:no-legacy` = `bash scripts/regression-guard/no-legacy-data-agrune.sh` exit 0 (실행 확인). allow-list 5 카테고리 27 엔트리 (A. build-linter · B. cursor markers · C. unit fixture · D. e2e fixture · E. runtime bundle). CI `.github/workflows/ci.yml` build-test job이 `pnpm lint:no-legacy` 호출 |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/runtime/src/runtime/dom-scanner.ts` | 삭제 (MISSING) | ✓ VERIFIED | `ls` → No such file or directory (기대대로 삭제) |
| `packages/runtime/src/runtime/manifest-builder.ts` | 삭제 (MISSING) | ✓ VERIFIED | `ls` → No such file or directory |
| `packages/runtime/src/dom-scanner.ts` | 삭제 (MISSING) | ✓ VERIFIED | 동일 — SUMMARY가 주장한 실제 삭제 위치 |
| `packages/runtime/src/manifest-builder.ts` | 삭제 (MISSING) | ✓ VERIFIED | 동일 |
| `packages/runtime/tests/public-surface.spec.ts` | 신규 regression spec | ✓ VERIFIED | 4 tests PASS, scanAnnotations/scanGroups/buildManifest 부재 + installPageAgentRuntime/createPageAgentRuntime 존재 sentinel |
| `packages/runtime/tests/runtime-ignores-legacy.spec.ts` | 신규 regression spec | ✓ VERIFIED | 2 tests PASS, legacy DOM + empty manifest → snapshot.targets.length = 0 |
| `scripts/regression-guard/no-legacy-data-agrune.sh` | CI 회귀 가드 | ✓ VERIFIED | 실행 시 "OK - No legacy 'data-agrune-' outside allow-list." exit 0 |
| `scripts/regression-guard/data-agrune-allowlist.txt` | allow-list 27 entries in 5 categories | ✓ VERIFIED | 파일 존재, 카테고리 주석 포함, regression guard 가 의존 |
| `.planning/phases/17-remove/external-sync-instructions.md` | 외부 repo push 지시서 | ✓ VERIFIED | 166 lines, 두 외부 repo (`.github`, `skills`) 대상 git 명령 + boundary 명시 |
| `packages/e2e/fixtures/legacy-annotated.html` | 의미 반전 fixture | ✓ VERIFIED | `bootstrap-idle.spec.ts` 에서 `source=idle` / `hasManifest=false` / `descriptorCount=0` positive assert, DOM bait (`data-agrune-*`) 보존 |
| `packages/e2e/fixtures/idle-boot.html` | manifest-only 경로 | ✓ VERIFIED | bootstrap-idle.spec.ts 통과 확인 (`RuntimeState.source` union에서 `inline` 제거) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `package.json` → `scripts/regression-guard/no-legacy-data-agrune.sh` | `pnpm lint:no-legacy` script | ✓ WIRED | `"lint:no-legacy": "bash ./scripts/regression-guard/no-legacy-data-agrune.sh"` 엔트리 확인 |
| `.github/workflows/ci.yml` → `pnpm lint:no-legacy` | build-test job step | ✓ WIRED | L15 job name + L40 `run: pnpm lint:no-legacy` |
| `package.json` → `lint:annotations` 제거 | 기존 script 삭제 | ✓ WIRED | package.json에 `lint:annotations` 엔트리 부재, `.github/workflows/` 에서 참조 0 |
| `CdpRuntimeInjector.source` union | `'inline'` 제거 | ✓ WIRED | `packages/runtime/src`·`packages/browser/src` 에서 `source: 'inline'` literal 매치 0 |
| `runtime-ignores-legacy.spec.ts` → `createPageAgentRuntime` | manifest-only boot 증명 | ✓ WIRED | spec이 createPageAgentRuntime(buildEmptyManifest()) 호출 후 legacy DOM bait이 snapshot에 반영되지 않음을 assert (2/2 PASS) |
| `.github/profile/README.md` (external) | 로컬 commit | ✓ WIRED | external repo에 `3d429ba docs(profile): manifest pivot — annotation → target mapping terminology` commit 존재, origin/main 대비 2 commits ahead (push 사용자 수동 대기, 예상된 상태) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `runtime-ignores-legacy.spec.ts` | `snapshot.targets` | `createPageAgentRuntime(buildEmptyManifest()).getSnapshot()` | Yes — manifest-driven, legacy DOM 무시 (6/6 test PASS) | ✓ FLOWING |
| `regression-guard allowlist` | `packages/` 실측 매치 셋 | POSIX `grep -rEn` + exclude-dir + `grep -vF` allow-list | Yes — 실행 시 exit 0 + "OK" 메시지 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| dom-scanner / manifest-builder 파일 부재 | `ls packages/runtime/src/{,runtime/}{dom-scanner,manifest-builder}.ts` | 4/4 "No such file" | ✓ PASS |
| Legacy 심볼 src 전체 부재 | `grep -rn 'scanAnnotations\|scanGroups\|buildManifest\|LIVE_SCAN_\|collectLiveDescriptors\|buildLiveSelector' packages/{runtime,browser}/src` | 0 lines | ✓ PASS |
| Runtime bundle (e2e shipped) legacy 심볼 부재 | `grep -c '...scanAnnotations\|...' packages/e2e/fixtures/runtime.bundle.js` | 0 | ✓ PASS |
| 신규 regression spec 통과 | `pnpm --filter @agrune/runtime exec vitest run public-surface runtime-ignores-legacy` | 2 files / 6 tests PASS | ✓ PASS |
| Regression guard 스크립트 실행 | `bash scripts/regression-guard/no-legacy-data-agrune.sh` | exit 0, "OK - No legacy 'data-agrune-' outside allow-list." | ✓ PASS |
| CI wiring — lint:no-legacy 사용 | `grep lint:no-legacy .github/workflows/ci.yml` | L15 job name + L40 step run | ✓ PASS |
| `lint:annotations` 잔존 참조 0 | `grep -rn lint:annotations package.json README.md AGENTS.md .github/workflows/` | 0 lines | ✓ PASS |
| 외부 repo 로컬 commit 존재 | `cd /Users/chenjing/dev/agrune/.github && git log origin/main..HEAD --oneline` | 2 commits (3d429ba + 7cea367) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REMOVE-01 | 17-01, 17-02 | `packages/runtime/src/runtime/dom-scanner.ts`·`manifest-builder.ts` bootstrap 경로 제거 (테스트 픽스처만 잔존) | ✓ SATISFIED | Truth 1, 4 evidence + 신규 regression spec 2종 PASS |
| REMOVE-02 | 17-03, 17-04 | README·AGENTS·`docs/*`에서 `data-agrune-*` 어노테이션 섹션 제거 + manifest 중심 재작성 | ✓ SATISFIED | Truth 2 evidence + 7 files × 0 matches |
| REMOVE-03 | 17-04 | 외부 `.github/profile/README.md` sync + "annotation" → "target mapping" 용어 전환 | ✓ SATISFIED | Truth 3 evidence + external commit `3d429ba` + "manifest target mapping" 어휘 확인 |

REQUIREMENTS.md 는 모든 ID를 `[x]` + Complete로 기록 (L61-63, L152-154).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| N/A | N/A | N/A | N/A | 블로커 anti-pattern 발견 없음. cursor-animator의 `data-agrune-aurora`·`data-agrune-pointer` setAttribute는 MEMORY "Cursor animation non-negotiable" 에 의해 유지됨 (allow-list 명시 예외) |

### Human Verification Required

Phase 17은 삭제·문서·CI 성격의 구조적 작업이라 모든 기준이 programmatic하게 증명 가능했다. 사용자 수동 후속 작업은 검증 아닌 단순 push이므로 human_needed로 격상하지 않음:

- `cd /Users/chenjing/dev/agrune/.github && git push origin main` — 2 commits push (17-04 SUMMARY + external-sync-instructions.md 에 명시, MEMORY 정책)
- `cd /Users/chenjing/dev/agrune/skills && git rm -r skills/annotate/ && ...` — pre-existing 변경 resolve 후 사용자 판단

위 두 액션은 Phase 17 성공 기준 3의 로컬 commit 단계가 이미 완료된 상태이므로 검증 PASS에 영향 없음.

### Gaps Summary

**실질적 gap 없음.** Pre-existing 이슈 2건 (관련 맥락만 기록):

1. **E2E user-flow 5건 실패** (fill-real×3, act-overlay×1, manifest-inject×1) — 17-02/17-03/17-04 SUMMARY 모두 pre-existing baseline + fixture-level inline manifest injection 필요성으로 기록. Phase 17-02 이전 `5a90d8c` 에서 동일 failure 재현됨(+ `invalid manifest` 1건은 17-02에서 fix, net-positive 1). Phase 17 scope 외로 명시 이관.

2. **Runtime full-suite order-dependent flaky 1건** — `act는 동적으로 추가된 overlay target…` 테스트. baseline `e50005a` (Phase 17 이전) 에서도 동일 실패, 테스트 격리 실행 시 262/262 PASS. module-level mockCdpPostMessage + beforeEach mockReset 충돌 (테스트 인프라 레벨). Phase 17 회귀 아님.

두 항목 모두 autonomous_mode 지시에 따라 기록만 하고 Phase 17 검증 실패로 취급하지 않음.

## 종합

Phase 17 REMOVE 의 4개 Success Criteria 가 전부 코드/문서/CI 에서 programmatic 하게 증명된다:

- **구조적 불변성 1**: Runtime src 에서 `data-agrune-*` 읽는 경로 = 0 (파일 삭제 + symbol 0 + regression spec 2개)
- **구조적 불변성 2**: Product-surface 7 문서에 legacy annotation 서술 = 0
- **구조적 불변성 3**: `pnpm lint:no-legacy` 가 CI build-test job에서 PR block 하는 회귀 방지
- **외부 제품 표면**: org profile 재작성 및 "target mapping" 용어 정착 (로컬 commit; push 사용자 수동)

Phase 18 REGISTRY 공개 전제 (schema stable + breaking surface 정리 + regression guard 활성 + 용어 전환) 전부 충족.

---

_Verified: 2026-04-20T01:42:00Z_
_Verifier: Claude (gsd-verifier) — goal-backward verification against ROADMAP.md Success Criteria_
