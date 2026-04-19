---
phase: 12-inject
verified: 2026-04-19T17:27:00Z
status: human_needed
score: 4/5
overrides_applied: 0
human_verification:
  - test: "manifest_load → snapshot → act 전 경로를 실제 Chrome 로컬 서버에서 실행"
    expected: "ok:true, manifestSource:'window', target signin-button 확인, act ok:true"
    why_human: "E2E spec이 PLAYWRIGHT_SKIP_E2E=1로 skip 처리됨. 실제 Chrome 세션 없이는 full stack 동작 확인 불가"
---

# Phase 12: INJECT Verification Report

**Phase Goal:** Phase 11의 manifest가 CDP 경로와 MCP tool로 연결되어 수동 manifest 로드로 엔드투엔드 동작 + PageSnapshot v3 breaking bump 종결.
**Verified:** 2026-04-19T17:27:00Z
**Status:** human_needed
**Re-verification:** No (초기 검증)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `agrune_manifest_load` MCP tool이 활성 세션에 manifest를 주입하고 이후 `agrune_snapshot`/`agrune_act`가 해당 manifest로 동작 | VERIFIED (자동) | `packages/mcp/src/index.ts:129` case 분기 완비. `packages/mcp/src/mcp-tools.ts:200` 등록 확인. unit 62/62 PASS. E2E spec 코드 작성 완료 (실 Chrome 실행은 human 필요) |
| 2 | `CdpRuntimeInjector.prepareSession({ preloadManifest })`가 `__agrune_preload_manifest__` JSON을 `addScriptToEvaluateOnNewDocument`에 embed | VERIFIED | `cdp-runtime-injector.ts:319-340` — preloadManifest 있을 때 `getInjectedSourceWithPreload` 분기 → `buildPreloadManifestSource`로 embed 스니펫 생성. `Page.addScriptToEvaluateOnNewDocument` 호출 line 329. 브라우저 unit 81/81 PASS |
| 3 | `ManifestLoader`가 `window.__agrune_manifest__` > CDP preload > inline > idle 우선순위로 작동 | VERIFIED | bootstrap `resolveManifest()` line 125-143: window → preload → legacyManifest → idle 순서 명시적 코드 확인 |
| 4 | `PageTarget.selector: SelectorLadder` + `PageSnapshot.schemaVersion: 3` (breaking change, adapter 없음) | VERIFIED | `core/src/index.ts:83` `selector: SelectorLadder`, line 104 `schemaVersion: 3`. runtime/tests/snapshot-v3.spec.ts 157줄 타입 계약 테스트 132/132 PASS |
| 5 | E2E smoke: manifest_load → local fixture → snapshot → target resolved → act 성공 | HUMAN NEEDED | E2E spec 코드 완성 (`manifest-inject.spec.ts` 89줄). PLAYWRIGHT_SKIP_E2E=1 skip 동작 확인 (2 skipped, 0 fail). 실 Chrome 전체 경로는 human 실행 필요 |

**Score:** 4/5 truths verified (자동 검증 기준), SC5는 human verification 필요

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp/src/index.ts` | agrune_manifest_load 핸들러 | VERIFIED | line 129-164, SESSION_NOT_ACTIVE / INVALID_COMMAND / INVALID_MANIFEST / TAB_NOT_FOUND 전 분기 존재 |
| `packages/mcp/src/mcp-tools.ts` | agrune_manifest_load 등록 | VERIFIED | line 200-212, zod schema (version literal 3, groups array) |
| `packages/browser/src/cdp-runtime-injector.ts` | prepareSession + safeJsonEmbed + buildPreloadManifestSource | VERIFIED | 341줄 파일, 세 함수 모두 실구현 확인 |
| `packages/core/src/index.ts` | SelectorLadder + schemaVersion:3 + INVALID_MANIFEST | VERIFIED | line 83, 104, 17 각각 확인 |
| `packages/core/src/driver.ts` | BrowserDriver.injectManifest? optional 계약 | VERIFIED | line 45 선언 확인 |
| `packages/browser/src/cdp-driver.ts` | CdpDriver.injectManifest 구현 | VERIFIED | line 347-372, TAB_NOT_FOUND + JSON 이중 인코딩 + reloadRuntime 시퀀스 |
| `packages/e2e/tests/user-flow/manifest-inject.spec.ts` | E2E smoke spec | VERIFIED | 89줄, happy path + negative case, PLAYWRIGHT_SKIP_E2E skip 동작 확인 |
| `packages/e2e/fixtures/manifest-inject-target.html` | no data-agrune-* fixture | VERIFIED | 13줄, aria-label="Sign in" button 존재, data-agrune-* 없음 확인 |
| `packages/mcp/tests/manifest-load-tool.spec.ts` | unit tests | VERIFIED | 321줄, 62 assertions |
| `packages/browser/tests/cdp-runtime-injector-preload.spec.ts` | preload unit tests | VERIFIED | 314줄, cache isolation + safeJsonEmbed + debounce 테스트 |
| `packages/runtime/tests/snapshot-v3.spec.ts` | v3 타입 계약 회귀 테스트 | VERIFIED | 157줄, 7개 테스트 포함 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `mcp/index.ts case 'agrune_manifest_load'` | `validateManifest` | `@agrune/manifest` import | WIRED | line 3-4 import, line 130 호출 |
| `mcp/index.ts` | `driver.injectManifest` | `typeof` 타입 가드 | WIRED | line 141 가드, line 145 호출 |
| `CdpRuntimeInjector.prepareSession` | `Page.addScriptToEvaluateOnNewDocument` | preloadManifest 분기 | WIRED | line 321-330, preloadManifest 있을 때 embed source 경로 분기 |
| `resolveManifest()` | `window.__agrune_manifest__` | bootstrap 우선순위 1위 | WIRED | line 127 `if (window.__agrune_manifest__)` |
| `resolveManifest()` | `window.__agrune_preload_manifest__` | bootstrap 우선순위 2위 | WIRED | line 128 `if (window.__agrune_preload_manifest__)` |
| `CdpDriver.injectManifest` | `reloadRuntime()` | Runtime.evaluate expression | WIRED | line 365-368 expression 내부 reloadRuntime 호출 |
| `E2E spec` | `agrune_manifest_load` | `harness.call` | WIRED | line 54 `harness.call('agrune_manifest_load', ...)` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `cdp-runtime-injector.ts bootstrap` | `resolveManifest()` 반환값 | `window.__agrune_manifest__` 또는 preload 또는 inline scan | Yes — 실 DOM/window 객체에서 읽음 | FLOWING |
| `mcp/index.ts` `agrune_manifest_load` | `validation.manifest` | `validateManifest(args.manifest)` zod parse | Yes — MCP 입력값에서 실 파싱 | FLOWING |
| `cdp-driver.ts injectManifest` | `window.__agrune_manifest__` | `Runtime.evaluate` CDP 실행 | Yes — CDP를 통해 실 브라우저 window에 주입 | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| MCP unit 전체 | `pnpm --filter @agrune/mcp run test` | 62/62 PASS (7 files) | PASS |
| Browser unit 전체 | `pnpm --filter @agrune/browser run test` | 81/81 PASS (7 files) | PASS |
| Core unit 전체 | `pnpm --filter @agrune/core run test` | 29/29 PASS (4 files) | PASS |
| Runtime unit 전체 | `pnpm --filter @agrune/runtime run test` | 132/132 PASS (10 files) | PASS |
| E2E PLAYWRIGHT_SKIP_E2E=1 | `PLAYWRIGHT_SKIP_E2E=1 pnpm --filter @agrune/e2e run test:e2e -- manifest-inject` | 2 skipped, 0 fail | PASS |
| E2E 전 경로 (실 Chrome) | — | — | SKIP (Chrome 없음) |

---

## Requirements Coverage

| Requirement | 담당 Plan | 설명 | Status | Evidence |
|-------------|----------|------|--------|---------|
| INJECT-01 | 12-02 | `CdpRuntimeInjector.prepareSession({ preloadManifest })`가 `__agrune_preload_manifest__` JSON embed | SATISFIED | `cdp-runtime-injector.ts:36-38` buildPreloadManifestSource, line 329 addScriptToEvaluateOnNewDocument |
| INJECT-02 | 12-03 | MCP tool `agrune_manifest_load`가 활성 세션에 manifest 주입 | SATISFIED | `mcp/src/mcp-tools.ts:200` 등록, `mcp/src/index.ts:129` switch 핸들러 |
| RESOLVE-01 | 12-02, 12-03 | `ManifestLoader`가 window > preload > inline > idle 우선순위로 manifest 로드 | SATISFIED | `cdp-runtime-injector.ts:125-143` resolveManifest() 우선순위 ladder 코드 직접 확인 |
| RESOLVE-03 | 12-01, 12-03 | `PageSnapshot` v3 breaking 교체, backward-compat adapter 없음 | SATISFIED | `core/src/index.ts:83` SelectorLadder, line 104 schemaVersion:3. snapshot.ts string 직렬화 제거 확인 |

**참고:** REQUIREMENTS.md의 체크박스(`[ ]`)가 아직 업데이트되지 않은 상태이나, 코드 구현은 완료됨. REQUIREMENTS.md 체크박스 업데이트는 별도 작업 필요.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|---------|--------|
| — | — | — | — | 없음 |

스텁, TODO, placeholder 패턴 없음. 모든 핸들러 분기 실구현 완료.

---

## Human Verification Required

### 1. E2E manifest_load 전 경로 실행

**Test:** 로컬 HTTP 서버(포트 5555)에서 `manifest-inject-target.html`을 서빙하고 실 Chrome으로 E2E 전 경로 실행
```
pnpm --filter @agrune/e2e run test:e2e -- manifest-inject
```
**Expected:** happy path (manifest_load ok:true + manifestSource:'window' + target signin-button resolve + act ok:true) 통과, negative case (version 2 → INVALID_MANIFEST) 통과
**Why human:** `PLAYWRIGHT_SKIP_E2E=1` 없이 실제 Chrome 실행이 필요하며, 로컬 CDP 세션, fixture 서버, Playwright 환경이 갖춰져야 full stack 검증 가능

---

## Gaps Summary

자동 검증에서 발견된 기술적 gap 없음.

SC1-SC4 전체 코드 레벨 검증 완료:
- SC1: `agrune_manifest_load` MCP tool 3파일 동기화 등록 + switch 분기 전체 구현
- SC2: `prepareSession({ preloadManifest })` + `safeJsonEmbed` + `buildPreloadManifestSource` + `addScriptToEvaluateOnNewDocument` embed
- SC3: `resolveManifest()` window > preload > inline > idle 우선순위 ladder 구현
- SC4: `PageTarget.selector: SelectorLadder` + `PageSnapshot.schemaVersion: 3` breaking change 완료

SC5(E2E smoke)는 코드 작성 완료이나 실 Chrome 실행이 필요해 human verification으로 분류.

---

_Verified: 2026-04-19T17:27:00Z_
_Verifier: Claude (gsd-verifier)_
