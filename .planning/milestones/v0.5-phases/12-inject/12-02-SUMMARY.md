---
phase: 12-inject
plan: "02"
subsystem: browser, core
tags: [cdp, manifest-injection, preload, debounce, security, tdd]
dependency_graph:
  requires: [12-01-SUMMARY.md, 11-04-SUMMARY.md]
  provides: [prepareSession-preloadManifest, safeJsonEmbed, BrowserDriver.injectManifest, reloadRuntime-debounce]
  affects: [packages/browser/src/cdp-runtime-injector.ts, packages/browser/src/cdp-driver.ts, packages/core/src/driver.ts]
tech_stack:
  added: []
  patterns:
    - JSON.stringify 이중 인코딩 + JSON.parse wrapper (XSS/statement-boundary 방어)
    - clearTimeout/setTimeout 50ms debounce (rapid-fire 방지)
    - cachedInjectedSource 우회 (per-session cache isolation)
key_files:
  created:
    - packages/browser/tests/cdp-runtime-injector-preload.spec.ts
  modified:
    - packages/browser/src/cdp-runtime-injector.ts
    - packages/browser/src/cdp-driver.ts
    - packages/core/src/driver.ts
decisions:
  - "safeJsonEmbed: U+2028/U+2029 이스케이프 + JSON.parse wrapper — HTML context 아니지만 CDP V8 직접 실행에서도 LineTerminator 방어 필요"
  - "getInjectedSourceWithPreload: cachedInjectedSource 우회 — 세션별 manifest 오염 차단 (T-12-08)"
  - "injectManifest inline escape: cdp-runtime-injector.ts의 safeJsonEmbed 재사용 대신 2줄 inline 복제 — import 방향 단순화"
  - "reloadRuntime debounce 50ms: 이전 Phase 11-04 stub(즉시 실행) 완전 교체 — clearTimeout + setTimeout 가드"
metrics:
  duration: "18m"
  completed: "2026-04-19T17:14:00Z"
  tasks: 2
  files: 4
---

# Phase 12 Plan 02: CdpRuntimeInjector preload embed + BrowserDriver.injectManifest Summary

**One-liner:** `prepareSession({ preloadManifest })` zero-RTT embed + `safeJsonEmbed` JSON.parse wrapper 보안 + `BrowserDriver.injectManifest` 인터페이스 계약 + `reloadRuntime` 50ms debounce로 Phase 11-04 stub 완결.

---

## What Was Built

### Task 1: CdpRuntimeInjector preload embed + safeJsonEmbed + reloadRuntime debounce

**packages/browser/src/cdp-runtime-injector.ts**

- `PrepareSessionOptions` interface: `preloadManifest?: AgruneManifest` optional 필드
- `safeJsonEmbed(json: string): string`: U+2028/U+2029 → `\u2028`/`\u2029` 이스케이프
- `buildPreloadManifestSource(manifest)`: `JSON.stringify(JSON.stringify(manifest))` 이중 인코딩 + `JSON.parse()` wrapper → XSS/statement boundary 이탈 차단 (T-12-04)
- `getInjectedSourceWithPreload(manifest)`: `cachedInjectedSource` 우회 — 세션별 독립 source 생성 (T-12-08)
- `prepareSession(sessionId, options?)`: preloadManifest 있으면 `getInjectedSourceWithPreload` 경로 분기
- `reloadRuntime` 훅: `clearTimeout(reloadTimer) + setTimeout(50ms)` debounce 구현 — Phase 11-04 stub 교체 (T-12-06)

**packages/browser/tests/cdp-runtime-injector-preload.spec.ts** (신규, 314 lines)

- 15개 테스트 / 6개 describe 블록
  - `prepareSession — no preload`: 5회 CDP send + embed snippet 부재 확인
  - `prepareSession — with preloadManifest`: `__agrune_preload_manifest__ = JSON.parse(` embed 확인 + 현재 페이지 즉시 적용(Runtime.evaluate 경로)
  - `safeJsonEmbed`: U+2028, U+2029, `</script>` 보안 검증
  - `cache isolation`: preload 없는 세션 후 preload 있는 세션 순서 격리 확인 (양방향)
  - `reloadRuntime debounce`: bootstrap source 정적 분석 — `clearTimeout` + `reloadTimer` 패턴 존재
  - `PrepareSessionOptions interface`: backward compat + undefined 전달 시 embed snippet 부재

### Task 2: BrowserDriver.injectManifest 인터페이스 + CdpDriver 구현

**packages/core/src/driver.ts**

- `import type { AgruneManifest } from './manifest.js'` 추가
- `BrowserDriver.injectManifest?(tabId: number, manifest: AgruneManifest): Promise<void>` optional 메서드 선언 — Plan 03 MCP layer 계약점 (T-12-07)

**packages/browser/src/cdp-driver.ts**

- `import type { AgruneManifest }` from `@agrune/core` 추가
- `CdpDriver.injectManifest(tabId, manifest)` public 메서드:
  - `targetManager.getTarget(tabId)` → sessionId 없으면 `TAB_NOT_FOUND` throw
  - `JSON.stringify(JSON.stringify(manifest))` + U+2028/U+2029 inline escape (T-12-05)
  - `Runtime.evaluate` expression: `window.__agrune_manifest__ = JSON.parse(…); window[…].reloadRuntime?.()`
  - `refreshSnapshot(tabId)` 후처리

**packages/browser/tests/cdp-driver.spec.ts** (확장)

- `describe('CdpDriver.injectManifest')` 6개 케이스 추가:
  - Case A: expression에 `__agrune_manifest__` + `reloadRuntime` 포함
  - Case A-2: `JSON.parse(` + manifest 데이터 embed 확인
  - Case B: 존재하지 않는 tabId → `TAB_NOT_FOUND` reject
  - Case B-2: sessionId 없는 target → `TAB_NOT_FOUND` reject
  - Case C: U+2028 포함 manifest → `\\u2028` 이스케이프 확인
  - Case D: `refreshSnapshot` 트리거 확인 (getSnapshot expression)

---

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| core typecheck | `pnpm --filter @agrune/core run typecheck` | PASS |
| browser typecheck | `pnpm --filter @agrune/browser run typecheck` | PASS |
| browser tests | `pnpm --filter @agrune/browser run test` | 81/81 PASS |
| browser build | `pnpm --filter @agrune/browser run build` | PASS |
| runtime 회귀 | `pnpm --filter @agrune/runtime run test` | 132/132 PASS |

---

## Acceptance Criteria Results

| Criterion | Status |
|-----------|--------|
| `grep "PrepareSessionOptions" cdp-runtime-injector.ts` → 2+ | PASS (2) |
| `grep "preloadManifest" cdp-runtime-injector.ts` → 3+ | PASS (5) |
| `grep "safeJsonEmbed" cdp-runtime-injector.ts` → 2+ | PASS (3) |
| `grep "__agrune_preload_manifest__" cdp-runtime-injector.ts` → 1+ | PASS (3) |
| `grep "JSON.parse(" cdp-runtime-injector.ts` → 1+ | PASS (4) |
| `grep "reloadTimer" cdp-runtime-injector.ts` → 2+ | PASS (4) |
| `cdp-runtime-injector-preload.spec.ts` ≥ 120 lines | PASS (314) |
| `grep "injectManifest?" driver.ts` → 1 | PASS (1) |
| `grep "injectManifest" cdp-driver.ts` → 1+ | PASS (1 선언) |
| `grep "window.__agrune_manifest__" cdp-driver.ts` → 1+ | PASS (1) |
| `grep "reloadRuntime" cdp-driver.ts` → 1+ | PASS (2) |
| `grep "TAB_NOT_FOUND" cdp-driver.ts` → 1+ | PASS (2) |
| browser test cdp-driver 전체 PASS | PASS (81/81) |
| browser build exit 0 | PASS |

---

## Threat Model Coverage

| Threat ID | Category | Disposition | 확인 |
|-----------|----------|-------------|------|
| T-12-04 | Tampering (preload manifest JS 이탈) | mitigate | `safeJsonEmbed` + `JSON.parse` wrapper 구현 완료 |
| T-12-05 | Tampering (injectManifest expression 이탈) | mitigate | inline `U+2028/U+2029` escape + `JSON.parse` wrapper 구현 완료 |
| T-12-06 | DoS (reloadRuntime rapid-fire) | mitigate | 50ms debounce + clearTimeout 가드 구현 완료 |
| T-12-07 | EoP (optional 누락 mock) | accept | Plan 03에서 `typeof driver.injectManifest === 'function'` 가드 예정 |
| T-12-08 | Tampering (cache 교차 오염) | mitigate | `getInjectedSourceWithPreload`로 cachedInjectedSource 우회 구현 완료 |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 테스트 기대값 수정 — bootstrap source에 `__agrune_preload_manifest__` 읽기 코드 항상 포함**
- **Found during:** Task 1 TDD GREEN 단계
- **Issue:** `resolveManifest()` 함수 내부에 `window.__agrune_preload_manifest__` 참조가 항상 존재하므로, "no preload" 세션의 source에도 이 문자열이 있음. 테스트가 단순 문자열 존재 여부로 검증하면 false positive 발생.
- **Fix:** 검증 기준을 embed snippet 고유 패턴인 `__agrune_preload_manifest__ = JSON.parse(` 유무로 변경 — 값을 주입하는 코드만 preload 경로에 존재
- **Files modified:** `packages/browser/tests/cdp-runtime-injector-preload.spec.ts`
- **Commit:** 0ef984f (GREEN commit 내 포함)

---

## Known Stubs

- `CdpDriver.prepareTarget`는 현재 `preloadManifest` 없이 `injector.prepareSession(target.sessionId)`를 호출. per-session preloadManifest 상태 관리(activePreloadManifest)는 Plan 03에서 추가 예정.
- `injectManifest`의 `refreshSnapshot` 후처리는 snapshot이 null인 경우 no-op — 정상 동작.

---

## TDD Gate Compliance

- RED gate Task 1: `77bb582` — `test(12-02): add failing tests for prepareSession preload + safeJsonEmbed + debounce` 존재
- GREEN gate Task 1: `0ef984f` — `feat(12-02): prepareSession preloadManifest + safeJsonEmbed + reloadRuntime debounce` 존재 (RED 이후)
- RED gate Task 2: `4297230` — `test(12-02): add failing injectManifest tests for CdpDriver` 존재
- GREEN gate Task 2: `fec076b` — `feat(12-02): BrowserDriver.injectManifest interface + CdpDriver implementation` 존재 (RED 이후)

---

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 77bb582 | test(12-02) | add failing tests for prepareSession preload + safeJsonEmbed + debounce (TDD RED) |
| 0ef984f | feat(12-02) | prepareSession preloadManifest + safeJsonEmbed + reloadRuntime debounce (TDD GREEN) |
| 4297230 | test(12-02) | add failing injectManifest tests for CdpDriver (TDD RED) |
| fec076b | feat(12-02) | BrowserDriver.injectManifest interface + CdpDriver implementation (TDD GREEN) |

---

## Self-Check

### Created files exist:
- `packages/browser/tests/cdp-runtime-injector-preload.spec.ts` — FOUND
- `.planning/phases/12-inject/12-02-SUMMARY.md` — FOUND (this file)

### Modified files exist:
- `packages/browser/src/cdp-runtime-injector.ts` — FOUND
- `packages/browser/src/cdp-driver.ts` — FOUND
- `packages/core/src/driver.ts` — FOUND

### Commits exist:
- 77bb582 — FOUND
- 0ef984f — FOUND
- 4297230 — FOUND
- fec076b — FOUND

## Self-Check: PASSED
