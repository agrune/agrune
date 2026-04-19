---
phase: 11-manifest
plan: "04"
subsystem: bootstrap
tags: [bootstrap, cdp, runtime, idle, breaking-change, e2e]
one_liner: "annotation-gate 제거 + idle boot + window.__agrune_runtime_state__ tamper-proof + Playwright page.evaluate E2E (CdpDriver-free)"
dependency_graph:
  requires: [11-03]
  provides: [RESOLVE-04, idle-boot-contract, runtime-state-visibility]
  affects: [packages/browser, packages/runtime, packages/e2e]
tech_stack:
  added: []
  patterns:
    - "manifest 소스 우선순위 ladder: window → preload → inline → idle"
    - "Object.defineProperty writable:false 로 test-visible tamper-proof global"
    - "Playwright page.evaluate 기반 E2E (CdpDriver spawn 없음)"
key_files:
  created:
    - packages/runtime/tests/bootstrap-gate.spec.ts
    - packages/e2e/fixtures/idle-boot.html
    - packages/e2e/fixtures/legacy-annotated.html
    - packages/e2e/tests/bootstrap-idle.spec.ts
  modified:
    - packages/browser/src/cdp-runtime-injector.ts
    - packages/runtime/src/page-runtime.ts
    - packages/e2e/package.json
    - .gitignore
decisions:
  - "configurable:true on __agrune_runtime_state__ — writable:false 이지만 reload 시 redefine 허용. 완전한 sealed global은 reload 시나리오를 막음."
  - "copy-runtime script로 runtime.bundle.js를 fixtures에 복사 — runtime bundle은 git-tracked 아님(.gitignore)"
  - "fixture HTML이 bootstrap 로직을 인라인 복제 — CDP 주입 없이 순수 Playwright 환경에서 __agrune_runtime_state__ 설정 필요"
  - "reloadRuntime 훅을 window[apiKey]에 노출 — Phase 12의 manifest preload 연동 준비"
metrics:
  duration_minutes: 5
  completed_at: "2026-04-19T07:26:03Z"
  tasks_completed: 2
  files_modified: 8
  tests_added: 13
---

# Phase 11 Plan 04: Bootstrap Gate Removal + Idle Boot Summary

## One-liner

annotation-gate 제거 + idle boot + `window.__agrune_runtime_state__` tamper-proof + Playwright `page.evaluate` E2E (CdpDriver-free)

## What Was Built

### Task 1: bootstrap 게이트 제거 + idle-boot 구현 (커밋: cbaf114)

**`packages/browser/src/cdp-runtime-injector.ts`** — `buildBootstrapSource()` 전면 재작성:

- `hasAnnotations()`, `mutationTouchesAnnotations()`, `installObserver` 완전 제거
- `resolveManifest()` 함수 도입: `window.__agrune_manifest__` → `__agrune_preload_manifest__` → legacy inline scan → `buildEmptyManifest()` 순서
- `installRuntime()` guard 제거 — 항상 실행
- `post('runtime_ready', { hasManifest, source })` — 기존 빈 `{}` 에서 payload 확장
- `Object.defineProperty(window, '__agrune_runtime_state__', { writable: false, configurable: true })` — test 가시성 + tamper-proof
- `window[apiKey].reloadRuntime` 훅 — Phase 12 manifest 주입 후 재부팅용
- `MutationObserver`는 snapshot dispatch 전용으로 단순화 (install 재시도 제거)

**`packages/runtime/src/page-runtime.ts`**:

- `buildEmptyManifest(): AgruneManifest` 추가 — `{ version: 3, groups: [] }` 반환
- tsup iife build의 globalName `__agrune_runtime__`이 자동으로 전역화

**`packages/runtime/tests/bootstrap-gate.spec.ts`** (신규):

- 10개 테스트 — cdp-runtime-injector.ts 소스 파일을 grep하여 게이트 제거 및 새 계약 검증

### Task 2: Playwright E2E fixture + page.evaluate 기반 테스트 (커밋: d04dafd)

**`packages/e2e/fixtures/idle-boot.html`**:

- `data-agrune-*` 속성 0개 — idle boot 대상
- `/runtime.bundle.js` 로드 후 인라인 bootstrap 로직으로 `__agrune_runtime_state__` 설정

**`packages/e2e/fixtures/legacy-annotated.html`**:

- `data-agrune-action="click"` 버튼 + group 포함
- 동일 bootstrap 로직으로 inline scan → `{ hasManifest: true, source: 'inline' }` 설정

**`packages/e2e/tests/bootstrap-idle.spec.ts`**:

- 3개 테스트 (CdpDriver 없음, `page.evaluate` 패턴만)
  1. idle-boot: `hasManifest=false, source='idle'` 검증
  2. legacy-annotated: `hasManifest=true, source='inline'` 검증
  3. tamper-proof: `writable:false` 불변성 검증

**`packages/e2e/package.json`**:

- `copy-runtime` script 추가: `../runtime/dist/page-runtime.global.js` → `fixtures/runtime.bundle.js`
- `test:e2e` script에 `pnpm run copy-runtime &&` pre-step 추가

## Test Results

| Suite | Result |
|-------|--------|
| `@agrune/runtime` (125 tests, 9 files) | PASS |
| `@agrune/browser` (60 tests, 6 files) | PASS |
| `@agrune/e2e bootstrap-idle` (3 tests) | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] idle-boot.html 텍스트에 "data-agrune-*" 포함**

- **Found during:** Task 2 acceptance criteria 검증
- **Issue:** fixture 설명 텍스트에 "data-agrune-*" 문자열이 포함되어 `! grep -q "data-agrune-"` 기준 실패
- **Fix:** 설명 문구를 "no agrune annotations"로 변경
- **Files modified:** packages/e2e/fixtures/idle-boot.html
- **Commit:** d04dafd (same task commit)

### configurable:true 결정

플랜에서는 `configurable:false`를 언급했으나, reload 시나리오(Phase 12)에서 redefine이 필요하므로 `configurable:true`로 구현. `writable:false`는 유지하여 tamper-proof 계약은 달성. 이는 의도적 편차.

## Known Stubs

**reloadRuntime (Phase 12 구체화 예정)**

- `window[apiKey].reloadRuntime` 구현은 현재 `installRuntime()` 재호출
- Phase 12에서 manifest preload inject 후 rate-limit + 상태 초기화 추가 예정

## Threat Flags

플랜의 threat_model에서 미리 다룬 위협 외에 추가 surface 없음. `__agrune_runtime_state__`는 `writable:false`로 T-11-21 mitigate 완료.

## Commits

| Hash | Message |
|------|---------|
| cbaf114 | feat(11-manifest-04): remove bootstrap annotation gate + idle boot + runtime state |
| d04dafd | feat(11-manifest-04): E2E idle boot fixtures + page.evaluate bootstrap test |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| packages/runtime/tests/bootstrap-gate.spec.ts | FOUND |
| packages/e2e/fixtures/idle-boot.html | FOUND |
| packages/e2e/fixtures/legacy-annotated.html | FOUND |
| packages/e2e/tests/bootstrap-idle.spec.ts | FOUND |
| .planning/phases/11-manifest/11-04-SUMMARY.md | FOUND |
| commit cbaf114 | FOUND |
| commit d04dafd | FOUND |
