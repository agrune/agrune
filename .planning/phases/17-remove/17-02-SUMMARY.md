---
phase: "17-remove"
plan: "02"
subsystem: e2e
tags:
  - e2e
  - fixture-reversal
  - regression
  - manifest-only
requirements:
  - REMOVE-01
dependency_graph:
  requires:
    - "17-01: runtime src 에서 scanAnnotations/scanGroups/buildManifest 제거 완료"
    - "17-01: packages/e2e/fixtures/runtime.bundle.js 재빌드 완료"
  provides:
    - "e2e bootstrap shim 이 manifest-only 경로로 수렴"
    - "legacy-annotated.html 이 `data-agrune-*` ignore 를 positive 하게 검증하는 live regression fixture"
    - "bootstrap-idle.spec.ts 가 `source=idle` / `hasManifest=false` / `descriptorCount=0` 삼중 assertion"
  affects:
    - "packages/e2e/tests/user-flow/helpers.ts BOOTSTRAP_SOURCE — manifest-only 경로"
    - "packages/e2e/tests/bootstrap-idle.spec.ts RuntimeState union (drops 'inline')"
    - "packages/e2e/tests/annotation-scan.spec.ts describe title + allow-list 주석"
tech-stack:
  added: []
  patterns:
    - "fixture-only allow-list — 파일 이름을 유지한 채 의미를 반전해 regression guard allow-list (Wave 4) 의 일관성 유지"
    - "descriptorCount positive sentinel — runtime 이 legacy DOM attribute 를 '무시' 하는지를 긍정 증명하는 숫자 지표"
key-files:
  created: []
  modified:
    - "packages/e2e/tests/user-flow/helpers.ts"
    - "packages/e2e/fixtures/idle-boot.html"
    - "packages/e2e/fixtures/legacy-annotated.html"
    - "packages/e2e/tests/bootstrap-idle.spec.ts"
    - "packages/e2e/tests/annotation-scan.spec.ts"
  deleted: []
decisions:
  - "legacy-annotated.html 파일명 보존 (의미 반전만) — scripts/regression-guard/data-agrune-allowlist.txt (Wave 4) 의 entry 안정성 확보"
  - "RuntimeState.source union 에서 'inline' 제거 — 17-01 의 CdpRuntimeInjector 변경과 타입 정합성 맞춤"
  - "descriptorCount 필드 추가 (기존 state shape 에 확장) — `hasManifest=false` + 'empty manifest' 를 동시에 검증하는 belt-and-suspenders"
  - "annotation-scan.spec.ts 는 runtime 경로 호출이 없으므로 유지 + describe title 을 'fixture DOM hooks' 로 재명명 + allow-list 맥락 주석 추가"
  - "user-flow fixture 들(tricky-inputs.html, manifest-inject-target.html) 의 manifest 주입 개선은 본 plan 범위 밖 — pre-existing 5 개 fail 은 17-01 이전에도 이미 실패, 별도 plan 또는 17-03 에서 처리"
metrics:
  duration: "~30 minutes"
  completed: "2026-04-19T16:00:50Z"
---

# Phase 17 Plan 02: E2E bootstrap shim → manifest-only Summary

**One-liner:** 3 개 inline bootstrap 경유지 (`helpers.ts` BOOTSTRAP_SOURCE, `idle-boot.html`, `legacy-annotated.html`) 의 `buildManifest(scanAnnotations(...), scanGroups(...))` 호출 체인을 제거하고 `window.__agrune_manifest__ || window.__agrune_preload_manifest__ || buildEmptyManifest()` 로 수렴시켰다. `legacy-annotated.html` 은 DOM 의 `data-agrune-action/group/key` bait 를 의도적으로 보존한 채 `source=idle`, `hasManifest=false`, `descriptorCount=0` 을 positive 하게 증명하는 live regression fixture 로 의미 반전됐다.

## Tasks Completed

| # | Task | Commits |
| --- | --- | --- |
| 1 | Rewrite `user-flow/helpers.ts` + `idle-boot.html` inline bootstrap to manifest-only path | `e59992b` |
| 2 | Reverse `legacy-annotated.html` fixture semantics + rewrite `bootstrap-idle.spec.ts` expectation | `da5369c` |
| 3 | Audit `annotation-scan.spec.ts` + header/describe annotation (allow-list context) | `402b0e1` |

## Before / After Diff Summary

### `legacy-annotated.html` semantic reversal

| | BEFORE (pre-17-02) | AFTER (17-02) |
| --- | --- | --- |
| **Role** | "runtime boots active via inline scan" (positive proof of legacy scanner) | "runtime ignores legacy `data-agrune-*` attributes" (positive proof of Phase 17 ignore contract) |
| **DOM body** | `<div data-agrune-group="main">…<button data-agrune-action="click" data-agrune-key="save">…</button>…</div>` | **(unchanged — intentional bait)** |
| **inline `resolveManifest()`** | `window > preload > runtimeApi.buildManifest(runtimeApi.scanAnnotations(document), runtimeApi.scanGroups(document)) > buildEmptyManifest()` | `window > preload > buildEmptyManifest()` (legacy branch deleted) |
| **Exposed state shape** | `{ hasManifest, source }` with `source ∈ {idle, inline, window, preload, runtime-missing}` | `{ hasManifest, source, descriptorCount }` with `source ∈ {idle, window, preload, runtime-missing}` |
| **Spec expectation** | `expect(state!.hasManifest).toBe(true)` + `expect(state!.source).toBe('inline')` | `expect(state!.hasManifest).toBe(false)` + `expect(state!.source).toBe('idle')` + `expect(state!.descriptorCount).toBe(0)` + DOM bait presence check |

### `helpers.ts` BOOTSTRAP_SOURCE — installRuntime()

```diff
-const manifest = runtimeApi.buildManifest(
-  runtimeApi.scanAnnotations(document),
-  runtimeApi.scanGroups(document),
-);
+const manifest = window.__agrune_manifest__
+  || window.__agrune_preload_manifest__
+  || runtimeApi.buildEmptyManifest();
 runtimeApi.installPageAgentRuntime(manifest, { ... });
```

추가로 `touchesAnnotations` → `touchesDom` 이름 변경 (MutationObserver helper 는 `data-agrune-*` 속성에 한정된 개념이 아니므로 neutral 용어로 정리).

### `idle-boot.html` — same manifest-only collapse + `descriptorCount` 추가

### `bootstrap-idle.spec.ts` — RuntimeState union + new positive assertion

```diff
 interface RuntimeState {
   hasManifest: boolean
-  source: 'idle' | 'inline' | 'window' | 'preload' | 'runtime-missing'
+  source: 'idle' | 'window' | 'preload' | 'runtime-missing'
+  descriptorCount: number
 }
```

그리고 `legacy-annotated.html: runtime boots active via inline scan` → `legacy-annotated.html: runtime ignores legacy data-agrune-* attributes (source=idle)` 로 이름 및 assertion 세트 반전.

## bootstrap-idle.spec.ts Evidence

```
Running 3 tests using 3 workers
  3 passed (1.4s)
```

- `idle-boot.html: runtime boots idle (hasManifest=false, source=idle)` ✅
- `legacy-annotated.html: runtime ignores legacy data-agrune-* attributes (source=idle)` ✅
- `__agrune_runtime_state__ is tamper-proof (writable:false)` ✅

## annotation-scan.spec.ts Evidence + 처리 결정

**결정: 유지 (fixture-only CSS).** 이 spec 의 4 개 테스트 모두 `runtimeApi.scanAnnotations(...)` 를 호출하지 않고, `document.querySelectorAll('[data-agrune-action]')` / `getAttribute('data-agrune-sensitive')` / `#cancel` 같은 Playwright DOM 인터랙션만 수행한다. 즉 `data-agrune-*` 속성은 `data-testid` 와 동등한 "fixture-only CSS selector" 로 사용됐다. 본 plan 은 describe 타이틀과 상단 주석만 업데이트해 allow-list 맥락을 명시했다.

```
Running 4 tests using 4 workers
  4 passed (1.3s)
```

- `overlay-modal fixture yields 4 targets and 2 groups` ✅ (순수 DOM count)
- `opening modal covers the cancel button` ✅
- `discard closes modal and marks document` ✅
- `tricky-inputs fixture exposes contenteditable + sensitive + masked` ✅ (순수 attribute 조회)

## `pnpm test:e2e` Full-suite Status

```
  5 failed
    [chromium] › tests/user-flow/act-overlay.spec.ts:38:3 › opening modal flips active context…
    [chromium] › tests/user-flow/fill-real.spec.ts:34:3 … cc-number target in snapshot (null)
    [chromium] › tests/user-flow/fill-real.spec.ts:56:3 … bio target in snapshot (null)
    [chromium] › tests/user-flow/fill-real.spec.ts:73:3 … pw target in snapshot (null)
    [chromium] › tests/user-flow/manifest-inject.spec.ts:50:3 … signin-button target (null)
  21 passed (1.2m)
```

**이 5 개는 pre-existing baseline failure** — Plan 17-02 의 회귀가 **아니다**.

### Baseline 증거

`5a90d8c` (Phase 16-04 SUMMARY 직후 / Phase 17 이전) 에서 동일한 5 개 spec + 1 개 추가 spec(`invalid manifest (version 2) → INVALID_MANIFEST`) 합계 **6 개가 실패**했다. Plan 17-02 완료 시점에는 `invalid manifest` 테스트가 **통과** 상태로 전환되어 실패 수가 5 개로 줄어든다. 따라서 17-02 는 순 net-positive (1 개 fix, 0 regression).

### 실패 루트 원인 (5 개 공통)

`createRealHarness` 가 `BOOTSTRAP_SOURCE` 를 실제 Chrome 에 주입하면서 `buildEmptyManifest()` 를 넘긴다. Fixture (`tricky-inputs.html`, `overlay-modal.html`) 에는 inline manifest 주입 hook 이 없고 17-01 이후 DOM `data-agrune-*` auto-scan 도 꺼져 있으므로 snapshot `.targets` 는 비어 있다. `waitForTargetByName(t => t.targetId === 'cc-number')` 가 timeout → null.

### 해결 방침 (scope 이관)

본 plan 은 "bootstrap shim manifest-only + fixture 의미 반전" 이 목표이지 "모든 user-flow E2E spec 을 manifest 공급 방식으로 rewire" 가 아니다. 해결은 **다음 plan** 이 담당:

- Option A (권고): Wave 3 (17-03) 에서 `tricky-inputs.html` / `overlay-modal.html` / `manifest-inject-target.html` 에 inline manifest 주입 (`window.__agrune_manifest__ = { ... }`) 을 추가해 `data-agrune-*` 속성을 fixture-only CSS selector 로 고정하고 manifest 로 target 을 등록. 이는 문서 재작성 wave 와 자연스럽게 묶인다.
- Option B: 별도 17-02.5 fixture-rewire plan 을 삽입. 본 plan 의 자동 commit 한도 초과라 분리 권고.

### manifest_load happy path 실패 분석

`agrune_manifest_load` 호출 후에도 `signin-button` 이 snapshot 에 반영되지 않는다. 이는 manifest_load 의 `window.__agrune_manifest__` write 직후 `forceReprepare` 가 한 번 더 필요하거나, harness 의 post-manifest snapshot refresh 경로가 Phase 17 이후 달라졌음을 시사. **본 plan 범위 밖** — 17-03 또는 17-04 에서 수정.

## Deviations from Plan

### Auto-applied (Rule 1/3)

**1. [Rule 1 - Bug] `BOOTSTRAP_SOURCE` 의 `touchesAnnotations` helper 이름이 Phase 17 이후 오개념**
- **Found during:** Task 1
- **Issue:** helper 가 `m.type === 'attributes'` 일 때만 true 를 반환하는 순수 DOM-mutation 필터이지만 이름이 "annotation" 을 담고 있어 legacy 맥락을 암시.
- **Fix:** `touchesAnnotations` → `touchesDom` 으로 rename (Pitfall 4 "annotation 용어 무차별 치환 금지" 에 반하지 않음 — 이 이름은 runtime 의 build-linter 나 public API 와 무관한 closure-local 심볼).
- **Files modified:** `packages/e2e/tests/user-flow/helpers.ts`
- **Commit:** `e59992b`

### Checkpoints / Scope deferrals

- **`pnpm test:e2e` 전체 suite green 목표 미충족** — 5 개 pre-existing fail (user-flow). Baseline 확인으로 17-02 회귀 아님 증명. 17-03 로 이관.
- **tricky-inputs.html 수정 금지** — 본 plan 은 `legacy-annotated.html` 만 의미 반전 대상으로 명시했고, 다른 fixture 수정은 scope creep. 17-03 fixture-rewire 로 이관.

## Handoff to Next Waves

### Wave 3 (17-03) — 문서 재작성 + fixture manifest 주입

- 기존 plan scope (README / AGENTS / PRIVACY / docs/* / mcp README rewrite)
- **추가 권고:** `tricky-inputs.html` / `overlay-modal.html` / `manifest-inject-target.html` 에 inline manifest 주입 — user-flow spec 5 개 복구. 또는 fixture 를 그대로 두고 user-flow spec 이 fixture `data-agrune-*` 을 CSS 로 매핑하는 AgruneManifest 를 beforeEach 에서 `__agrune_manifest__` 로 주입하도록 리팩터 (harness.ts 레벨에서 injection hook 추가).
- `manifest_load` happy-path refresh 계약 확인 — 17-01 이후 변경된 snapshot refresh 타이밍 디버깅.

### Wave 4 (17-04) — External repo sync + regression guard + `lint:annotations` 결정

- `scripts/regression-guard/data-agrune-allowlist.txt` 신설 시 다음 entries 필요:
  - `packages/e2e/fixtures/legacy-annotated.html` (의미 반전 fixture)
  - `packages/e2e/fixtures/tricky-inputs.html` (fixture-only CSS selector)
  - `packages/e2e/fixtures/overlay-modal.html`
  - `packages/e2e/tests/annotation-scan.spec.ts`
- CI 에서 `pnpm test:e2e` 가 여전히 5 개 fail 이면 17-03 에서 수정됐어야 함. 17-04 는 green 전제로 진입.

## Gate Check Results

| # | Gate | Status |
| --- | --- | --- |
| 1 | `grep -rn "scanAnnotations\|scanGroups\|buildManifest" packages/e2e/tests packages/e2e/fixtures` → 0 | ✅ |
| 2 | `grep -rn "source.*['\"]inline['\"]" packages/e2e/` → 주석 1 개 (의도적 설명) | ✅ |
| 3 | `pnpm --filter @agrune/e2e exec playwright test bootstrap-idle.spec.ts --project=chromium` 3/3 PASS | ✅ |
| 4 | `pnpm test:e2e` full suite | ⚠️  Pre-existing 5 fail, 17-02 회귀 아님 (baseline 확인, 17-03 로 이관) |
| 5 | `legacy-annotated.html` body 에 `data-agrune-action` 2 개 보존 | ✅ |
| 6 | `bootstrap-idle.spec.ts` 가 `source='idle'` + `hasManifest=false` + `descriptorCount=0` positive assert | ✅ |
| 7 | `pnpm --filter @agrune/e2e typecheck` exit 0 | ✅ |
| 8 | `annotation-scan.spec.ts` 4/4 PASS | ✅ |

## Self-Check: PASSED

- **Created files:** (none)
- **Modified files:**
  - `packages/e2e/tests/user-flow/helpers.ts` — FOUND (BOOTSTRAP_SOURCE manifest-only 경로)
  - `packages/e2e/fixtures/idle-boot.html` — FOUND (resolveManifest legacy branch 제거, descriptorCount 추가)
  - `packages/e2e/fixtures/legacy-annotated.html` — FOUND (의미 반전, DOM bait 보존)
  - `packages/e2e/tests/bootstrap-idle.spec.ts` — FOUND (assertion 반전, RuntimeState union 조정)
  - `packages/e2e/tests/annotation-scan.spec.ts` — FOUND (describe 재명명 + allow-list 주석)
- **Commits verified in git log:** `e59992b`, `da5369c`, `402b0e1` — all present
