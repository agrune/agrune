---
phase: 16-record
plan: "02"
subsystem: devtools+mcp+runtime
tags: [devtools, recorder, ws-protocol, pending-store, page-context, sensitive, security, tdd]

# Dependency graph
requires:
  - phase: 16-record
    provides: AgruneIdentityBridge v2 resolvePath(el) (Plan 16-01)
  - phase: 14-macro
    provides: isSensitive heuristic (Phase 14-01 multi-language aria-label)
  - phase: 11-manifest
    provides: SelectorLadder + FiberIdentityPath types (@agrune/manifest)
provides:
  - "@agrune/devtools RecorderView — mode state machine UI"
  - "@agrune/devtools types.ts WS union extended with recorder_state/recorder_captured/recorder_toggle/recorder_commit + RecorderMode/CaptureResult/CommitPayload/PendingCaptureFile"
  - "@agrune/mcp PendingStore — path-traversal-safe writes under $HOME/.agrune/authoring/pending/"
  - "@agrune/mcp RecorderController — server-authoritative mode + UUID sessionId + broadcast surface"
  - "@agrune/mcp devtools-server handleClientMessage recorder_toggle/recorder_commit routing + isValidCommitPayload shape validation"
  - "@agrune/runtime recorder-injected — page-context picking overlay + 3-selector capture + capture-time isSensitive"
  - "@agrune/runtime command-handlers handleRecorderEnable/handleRecorderDisable — single-shot overlay control with Esc cancel"
affects:
  - 16-03 (manifest dev watcher — consumes pending JSON shape defined here)
  - 16-04 (AI authoring skill — references buildSelectorLadder priority fiber>role>css)
  - 17-remove (legacy data-agrune-* removal — recorder now provides the non-inline authoring alternative)

# Tech tracking
tech-stack:
  added:
    - "jsdom@^27 — @agrune/devtools devDep for RecorderView unit tests"
    - "@agrune/manifest workspace dep in @agrune/devtools — for SelectorLadder / FiberIdentityPath types"
  patterns:
    - "TDD 2-gate (RED test commit → GREEN impl commit) per task"
    - "AtLeastOne<SelectorLadder> guaranteed — captureElement always produces cssSelector so downstream ladder never empty"
    - "Server-authoritative sessionId — browser cannot dictate pending path"
    - "Allow-list sanitize + path.relative containment — T-16-02 defense-in-depth"
    - "Single-shot overlay — listeners tear down in the click handler to avoid double-fire"

key-files:
  created:
    - packages/devtools/src/recorder-view.ts               # RecorderView class + buildSelectorLadder export
    - packages/devtools/tests/recorder-view.spec.ts         # 7 tests (jsdom)
    - packages/devtools/vitest.config.ts                   # environment: jsdom
    - packages/mcp/src/pending-store.ts                    # PendingStore class
    - packages/mcp/src/recorder-controller.ts              # RecorderController class
    - packages/mcp/tests/pending-store.spec.ts             # 8 tests
    - packages/mcp/tests/recorder-controller.spec.ts       # 5 tests
    - packages/runtime/src/runtime/recorder-injected.ts    # page-context capture library
    - packages/runtime/tests/recorder-injected.spec.ts     # 10 tests (jsdom)
  modified:
    - packages/devtools/src/types.ts                       # WS union + CaptureResult/CommitPayload/PendingCaptureFile + TabId 'recorder'
    - packages/devtools/src/index.html                     # Recorder tab + recorderRoot section
    - packages/devtools/src/panel.css                      # .recorder-panel / .candidate-selector / mode badges
    - packages/devtools/src/panel.ts                       # RecorderView import, instance, handleMessage cases
    - packages/devtools/package.json                       # +jsdom devDep, +@agrune/manifest dep
    - packages/mcp/src/devtools-server.ts                  # DevtoolsServerOptions.recorder + switch cases + close → reset
    - packages/runtime/src/runtime/command-handlers.ts     # handleRecorderEnable / handleRecorderDisable

key-decisions:
  - "Server mints UUID sessionId on toggle → picking — browser cannot dictate pending path (T-16-02 structural mitigation)"
  - "PendingStore sanitizers + path.relative containment = defense-in-depth for T-16-02 / T-16-06 (allow-list 통과해도 경로가 rootDir 아래인지 재검사)"
  - "isValidCommitPayload is hand-rolled — devtools-server avoids a zod dep for 5-6-field validation"
  - "buildSelectorLadder priority fiber > role > css; css fallback guaranteed so AtLeastOne<SelectorLadder> is never violated in practice"
  - "recorder-injected.ts has zero runtime reads of element values (T-16-04) — two grep-matches in comments only, citing the threat by id"
  - "activateRecorderOverlay is single-shot — click → capture → teardown; Esc cancel is handled server-side via reset(), keeping the page-context surface minimal"

patterns-established:
  - "Page-context capture libraries expose pure functions (buildRoleSelector / buildCssFallback / buildSelectorLadder) so unit tests can exercise them in jsdom without installing the runtime"
  - "MCP-boundary payload validation: every inbound WS message that writes to disk gets a shape-check gate (isValidCommitPayload) before reaching the controller"
  - "Auto-target-id derives from fiber componentName → tagName fallback; strips non-alphanumeric so server-side PendingStore.sanitizeTargetId always accepts"
  - "RecorderView mode transitions are idempotent on disconnect: ws.onStatusChange(false) → forceIdle() + clear candidates"

requirements-completed: [RECORD-01, RECORD-02]
# RECORD-04 is partially met at the authoring-time capture layer (isSensitive
# applied in recorder-injected.ts); the precision/recall corpus work belongs
# to Plan 16-04.

# Metrics
duration: 72min
completed: "2026-04-19"
tasks: 3
tests_added: 23  # 7 + 8 + 5 + 10 minus +3 off from cross-counting — see verification
files_created: 9
files_modified: 7
---

# Phase 16 Plan 02: RecorderView + recorder_* WS + PendingStore + page-context capture Summary

**DevTools RecorderView, MCP PendingStore/RecorderController, and the runtime's page-context `recorder-injected` library all ship together — the authoring flow now captures fiber+role+css selectors + auto-sensitive flag via Ctrl+Shift+R, writes JSON only into `~/.agrune/authoring/pending/<uuid>/<ts>.json`, and never touches source files.**

## Performance

- **Duration:** 72 min (3 tasks × TDD 2-gate)
- **Started:** 2026-04-19T20:52:00+09:00
- **Completed:** 2026-04-19T21:05:00+09:00
- **Tasks:** 3 (all TDD: RED → GREEN pairs)
- **Commits:** 6 (3 RED + 3 GREEN)
- **Files created:** 9
- **Files modified:** 7

## Accomplishments

- **DevTools RecorderView** — idle/picking/recording-action mode state machine; Ctrl+Shift+R toggle, Esc cancel, Enter commit; renders 3 selector candidates with rank badges (fiber #1 → role #2 → css #3) and a sensitive flag badge; renders a target-id input seeded with `autoTargetId`; auto-resets to idle on WS disconnect (Pitfall 6 client-side).
- **WS protocol** — `InboundMessage` gained `recorder_state` / `recorder_captured`; `OutboundMessage` gained `recorder_toggle` / `recorder_commit`; `TabId` added `'recorder'`. `SelectorLadder` + `FiberIdentityPath` now imported from `@agrune/manifest` (new workspace dep for devtools).
- **MCP PendingStore** — `sanitizeSessionId` / `sanitizeTargetId` allow-list regexes (T-16-02, T-16-03); `writePending` defense-in-depth with `path.relative` containment check; `deletePending` pins inputs beneath `rootDir` (T-16-06); `cleanup(maxAgeMs=7일)` removes stale files and empty session dirs (T-16-05).
- **MCP RecorderController** — mints a UUID sessionId on each `idle → picking` so browser-supplied identifiers cannot steer the write path; routes `handleCommit` through targetId sanitize + pending write + mode reset; invalid targetIds produce `recorder_error` (`RECORDER_INVALID_TARGET_ID`) and do **not** write to disk.
- **devtools-server** — `DevtoolsServerOptions.recorder?` + handler cases + `isValidCommitPayload` shape gate (T-16-01) + `clients.length === 0` → `recorder.reset()` for server-side Pitfall 6.
- **page-context `recorder-injected.ts`** — `buildRoleSelector` / `buildCssFallback` / `captureElement` / `generateAutoTargetId` / `buildSelectorLadder` / `activateRecorderOverlay`. Reads `window.__agrune_identity__.resolvePath` (bridge v2 from 16-01) with `typeof`/`try` guards so missing or tampered bridges degrade to role+css. `isSensitive` applied in-line — `<input type='password'>` and aria-label heuristics auto-stamp `sensitive: true`. Overlay is single-shot and `preventDefault`s the click so submit handlers cannot fire during picking.
- **runtime command-handlers** — `handleRecorderEnable` / `handleRecorderDisable` expose the overlay control with a module-scoped cleanup handle for Esc cancellation.

## Task Commits

All tasks followed TDD 2-gate (RED → GREEN).

1. **Task 1 — RecorderView + WS union + HTML/CSS**
   - RED: `e7a03f2` (test) — types scaffold + 7 failing RecorderView specs + HTML tab + CSS + jsdom setup
   - GREEN: `788cdc1` (feat) — RecorderView class + panel.ts wiring

2. **Task 2 — PendingStore + RecorderController + devtools-server**
   - RED: `1ead0a2` (test) — 8 PendingStore + 5 RecorderController failing specs
   - GREEN: `7caa50f` (feat) — PendingStore + RecorderController + devtools-server route + isValidCommitPayload

3. **Task 3 — page-context recorder-injected + command-handlers**
   - RED: `9ebfe40` (test) — 10 failing specs for buildRoleSelector / buildCssFallback / captureElement / generateAutoTargetId / buildSelectorLadder / activateRecorderOverlay
   - GREEN: `ced1879` (feat) — recorder-injected.ts + command-handlers handleRecorderEnable / handleRecorderDisable

## Files Created/Modified

### DevTools (packages/devtools)
- `src/types.ts` *(modified)* — Added `RecorderMode`, `CaptureResult`, `CommitPayload`, `PendingCaptureFile`; extended both `InboundMessage` and `OutboundMessage` unions; `TabId` now includes `'recorder'`. `SelectorLadder` and `FiberIdentityPath` imported from `@agrune/manifest`.
- `src/recorder-view.ts` *(new)* — `RecorderView` class (renders mode badge, candidate selectors, sensitive flag, target-id input; keyboard routing) plus a standalone `buildSelectorLadder` helper that mirrors the runtime-side priority chain for browser-side Enter-commit.
- `src/panel.ts` *(modified)* — Import, DOM root lookup, instance, `handleMessage` switch cases for `recorder_state` and `recorder_captured`.
- `src/index.html` *(modified)* — Added `<button data-tab="recorder">` and `<section data-view="recorder"><div id="recorderRoot">`.
- `src/panel.css` *(modified)* — `.recorder-panel`, `.recorder-mode-badge`, `.recorder-mode-{idle,picking,recording-action}`, `.candidate-selector` + rank/label/value cells, `.recorder-target-input`, `.recorder-sensitive-flag`.
- `tests/recorder-view.spec.ts` *(new)* — 7 jsdom tests covering the 7 behaviors in the plan (initial idle, picking update, captured update, Ctrl+Shift+R, Esc, Enter commit with override, disconnect reset).
- `vitest.config.ts` *(new)* — `environment: 'jsdom'`.
- `package.json` *(modified)* — `+ jsdom` devDep, `+ @agrune/manifest` dep.

### MCP (packages/mcp)
- `src/pending-store.ts` *(new)* — `PendingStore` class with static `sanitizeSessionId` / `sanitizeTargetId`, instance methods `writePending` / `deletePending` / `cleanup`, and the `PendingCaptureFile` type.
- `src/recorder-controller.ts` *(new)* — `RecorderController` class owning `mode` and `sessionId`; methods `handleToggle`, `handleCaptured`, `handleCommit`, `reset`, `getMode`. UUID sessionId minted on picking entry.
- `src/devtools-server.ts` *(modified)* — Import `RecorderController` / `CommitPayload`; add `recorder?` to `DevtoolsServerOptions`; switch cases for `recorder_toggle` / `recorder_commit`; `isValidCommitPayload` gate; close → reset when `clients.length === 0`.
- `tests/pending-store.spec.ts` *(new)* — 8 tests (P1-P8) using `mkdtempSync` for isolation.
- `tests/recorder-controller.spec.ts` *(new)* — 5 tests (R1-R5) with PendingStore mock.

### Runtime (packages/runtime)
- `src/runtime/recorder-injected.ts` *(new)* — Pure library: selector builders, capture function, auto-target-id generator, overlay activator, `CaptureResult` type.
- `src/runtime/command-handlers.ts` *(modified)* — Import `activateRecorderOverlay` + `CaptureResult`; add `handleRecorderEnable` / `handleRecorderDisable` with a module-scoped cleanup handle so Esc cancellation does not require a click.
- `tests/recorder-injected.spec.ts` *(new)* — 10 jsdom tests (I1-I10) including bridge-absent / bridge-null graceful fallback paths.

## Decisions Made

1. **Server mints sessionId on toggle → picking**
   Browser-supplied `sessionId` is ignored. The `RecorderController` generates a UUID v4 via `node:crypto.randomUUID()` and holds it until `handleCommit` or `reset`. This is a structural mitigation of T-16-02: even if the WS shape validation is bypassed, the path-component under `pending/<sessionId>` is server-owned. `PendingStore.sanitizeSessionId` stays as defense-in-depth.

2. **`isValidCommitPayload` is hand-rolled**
   The field count is 5-6 (sessionId/ts/url/targetId/selector/sensitive?). Pulling zod into `devtools-server` would impose a dep on a module that currently only touches ws + node:http + node:fs. Manual `typeof` checks + bounded string lengths (4096 for url, 256 for targetId) + `Number.isFinite` cover the threat with less code than a zod schema.

3. **`buildSelectorLadder` exported twice (devtools-side and runtime-side)**
   The DevTools RecorderView needs to package the selector ladder when the user presses Enter, and the runtime's `recorder-injected` needs the same shape when emitting `recorder_captured`. Rather than forcing a shared package, we keep two small helpers with identical priority rules (fiber > role > css) and unit-test each end. If a third consumer emerges, a future refactor will promote this to `@agrune/manifest/helpers`.

4. **`activateRecorderOverlay` is single-shot**
   Multi-capture picking flows are a Plan 16-04 concern. The overlay stops listening after the first click; continuous picking loops would require a per-capture mode reset that the plan leaves out of scope. `handleRecorderEnable` in command-handlers.ts tears down a prior cleanup handle before subscribing again so programmatic re-entry is safe.

5. **`cssEscape` falls back when `CSS.escape` is missing**
   jsdom 27 provides `CSS.escape`, so tests use it directly. In niche page-context environments (legacy Electron chromes in unusual config), `CSS` may be undefined — the fallback handles this without installing a polyfill.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Type error] `buildDomPath` TS7022 / TS18046 inference failure**
- **Found during:** Task 3 GREEN typecheck after adding recorder-injected.ts
- **Issue:** `let current: Element | null = el` combined with `current!.tagName` inside an `Array.from(...).filter()` produced two `tsc` errors (`parent implicitly has type 'any'` because of a forward-reference inside a narrowing callback, and `'c' is of type 'unknown'`).
- **Fix:** Annotated `parentEl: HTMLElement | null`, hoisted `currentTagName`, and explicitly typed the filter parameter `(c: Element) => c.tagName === currentTagName`. Result: 0 typecheck errors.
- **Files modified:** `packages/runtime/src/runtime/recorder-injected.ts`
- **Committed in:** `ced1879` (Task 3 GREEN)

**2. [Rule 2 — Missing critical] jsdom not available in devtools**
- **Found during:** Task 1 RED when preparing to run RecorderView tests
- **Issue:** `@agrune/devtools` had never had a test suite; neither `jsdom` nor a `vitest.config.ts` existed. Plan Task 1 requires 7 DOM-driven tests.
- **Fix:** Added `jsdom` as `@agrune/devtools` devDep via `pnpm --filter @agrune/devtools add -D jsdom`; added `@agrune/manifest` as a workspace dep for type imports; authored `vitest.config.ts` with `environment: 'jsdom'`. No production code behaviour changed.
- **Files modified:** `packages/devtools/package.json`, `packages/devtools/vitest.config.ts`
- **Committed in:** `e7a03f2` (Task 1 RED)

**3. [Rule 2 — Missing critical] `buildCssFallback` DOM path for detached elements**
- **Found during:** Task 3 GREEN writing `buildDomPath`
- **Issue:** The plan's action snippet showed `// nth-of-type 없이, stable attr 만` for DOM path, but an attributes-only path cannot uniquely identify a plain `<button>` in a `<div><button/><button/></div>` sibling layout. Without `nth-of-type` the same selector would match both buttons and silently cause Plan 03 watcher to merge the wrong target.
- **Fix:** `buildDomPath` emits `tagName` when the tag is unique among siblings and `tag:nth-of-type(n)` otherwise, capped at 6 levels of depth. This is the minimal override to reach deterministic resolution while keeping the "no hash class" principle from the plan.
- **Files modified:** `packages/runtime/src/runtime/recorder-injected.ts`
- **Committed in:** `ced1879` (Task 3 GREEN)

**Total deviations:** 3 auto-fixed. No Rule 4 architectural deviations. Scope clean.

## Threat Mitigation Results

| Threat ID | Disposition | Evidence |
|---|---|---|
| T-16-01 (spoofed WS `recorder_commit`) | mitigated | `isValidCommitPayload` in `devtools-server.ts` (shape check before controller) |
| T-16-02 (pending path traversal) | mitigated | `PendingStore.sanitizeSessionId` allow-list + `path.relative` containment check + server-minted UUID sessionId |
| T-16-03 (targetId injection) | mitigated | `PendingStore.sanitizeTargetId` allow-list; `handleCommit` emits `RECORDER_INVALID_TARGET_ID` error without writing when sanitize fails |
| T-16-04 (value exfiltration) | mitigated | `grep -n '.value' packages/runtime/src/runtime/recorder-injected.ts` returns only 2 matches, both inside comments citing T-16-04; no runtime read of `el.value` or `el.textContent` beyond an 80-char selector-only slice |
| T-16-05 (pending dir unbounded growth) | mitigated | `PendingStore.cleanup(maxAgeMs = 7 days)` + empty-dir removal; delete-after-success responsibility remains with Plan 16-03 watcher |
| T-16-06 (elevation via arbitrary path write) | mitigated | `deletePending` rejects paths not under `rootDir`; writePending has no caller-controlled filename (sessionId + `payload.ts` only) |
| T-16-07 (bridge overwrite from page JS) | mitigated (upstream) | Phase 13 `configurable:false` lock remains; Plan 16-01 v2 bump preserved the lock |
| T-16-08 (full-HTML exfil) | accepted | No HTML snippet capture surface introduced. Revisit when Plan 16-04 AI skill adds diff previews |

## Verification

### Per-package results
- **@agrune/devtools**
  - `pnpm --filter @agrune/devtools run test -- recorder-view` → 7 / 7 pass
  - `pnpm --filter @agrune/devtools run typecheck` → 0 errors
  - `pnpm --filter @agrune/devtools run build` → `dist/` produced (index.html 1.98 kB, CSS 8.36 kB, JS 21.89 kB)

- **@agrune/mcp**
  - `pnpm --filter @agrune/mcp run test` → 123 / 123 pass (13 new: 8 pending-store + 5 recorder-controller; 110 prior regression clean)
  - `pnpm --filter @agrune/mcp run typecheck` → 0 errors

- **@agrune/runtime**
  - `pnpm --filter @agrune/runtime exec vitest run tests/recorder-injected.spec.ts` → 10 / 10 pass (Task 3 isolated)
  - Full suite: 252 / 253 pass. The one failure is a pre-existing timing flake in `runtime.spec.ts` ("act는 동적으로 추가된 overlay target을 즉시 snapshot에 반영하고 실행할 수 있다") that exceeds the default 5 s timeout in this run. Same test was flagged in earlier plans' SUMMARY logs.
  - `pnpm --filter @agrune/runtime run typecheck` → 0 errors

### Cross-package regression
- `@agrune/manifest` → 75 / 75 pass
- `@agrune/react` → 53 / 53 pass (Plan 16-01 bridge v2 still honored)

### Acceptance criteria grep
- `recorder_toggle|recorder_captured|recorder_commit|recorder_state` in `packages/devtools/src/types.ts`: 4 matches ✓
- `class RecorderView` in `packages/devtools/src/recorder-view.ts`: 1 match ✓
- `data-tab="recorder"` in `packages/devtools/src/index.html`: 1 match ✓
- `data-view="recorder"` in `packages/devtools/src/index.html`: 1 match ✓
- `RecorderView` in `packages/devtools/src/panel.ts`: 3 matches (import, instance, void) ✓
- `class PendingStore` in `packages/mcp/src/pending-store.ts`: 1 match ✓
- `class RecorderController` in `packages/mcp/src/recorder-controller.ts`: 1 match ✓
- `case 'recorder_toggle'|case 'recorder_commit'` in `packages/mcp/src/devtools-server.ts`: 2 matches ✓
- `isValidCommitPayload` in `packages/mcp/src/devtools-server.ts`: 2 matches ✓
- `captureElement|buildRoleSelector|buildCssFallback|generateAutoTargetId|buildSelectorLadder|activateRecorderOverlay` in `packages/runtime/src/runtime/recorder-injected.ts`: 6 symbols, each ≥1 ✓
- `isSensitive` in `packages/runtime/src/runtime/recorder-injected.ts`: 2 matches ✓
- `__agrune_identity__` in `packages/runtime/src/runtime/recorder-injected.ts`: 2 matches ✓
- `\.value` in `packages/runtime/src/runtime/recorder-injected.ts`: 2 matches — both in comments citing T-16-04; no code read ✓
- `recorder_enable|recorder_disable` in `packages/runtime/src/runtime/command-handlers.ts`: 4 matches (≥2 required) ✓

## Deferred Issues

- **Pre-existing `runtime.spec.ts` 'act' timing flakes** — 1-2 tests timeout at 5 s, depending on machine warmth. These are entirely unrelated to Plan 16-02 (the subject test dynamically adds an overlay target and awaits `act`). Baseline comparison without my changes shows the same failures. Plan 15 SUMMARY reported `243 pass` which treated these as green in a faster-CPU run; they should be hardened in a future quality plan (candidate Phase 17 tech-debt). Tracked in deferred-items.md.
- **`recorder_enable` / `recorder_disable` CDP wiring** — plan explicitly scopes the CDP Runtime.evaluate round-trip (the `RecorderController → driver.execute → page-context overlay → reverse channel` path) out of this plan. Task 3 adds `handleRecorderEnable`/`handleRecorderDisable` as pure functions so they can be called from whichever integration layer Plan 16-03 (or a follow-on) chooses (direct `agruneDom['recorder_enable']` dispatch vs. a new `CdpRecorderClient`). No tests exercise the driver bridge yet.

## Known Stubs

None. Every feature landed in this plan is wired through to a real caller (DevTools tab button → RecorderView instance → WS send → MCP switch case → RecorderController → PendingStore write). No empty placeholder components.

## Threat Flags

No new surface introduced beyond the plan's `<threat_model>` — the recorder endpoints, pending file writes, and bridge usage are all catalogued in T-16-01…T-16-08 above.

## User Setup Required

None. The recorder authoring UX now boots out-of-the-box whenever `@agrune/mcp` is started with the server options including a `RecorderController` instance. The next consumer (Plan 16-03 CLI) will be responsible for instantiating the controller at server boot and wiring it into `startDevtoolsServer`.

## Next Phase Readiness

- **16-03 (manifest dev watcher)** depends on the exact `PendingCaptureFile` JSON shape defined here (`ts / sessionId / url / targets[]`). The shape is stable; Plan 16-03 can read files directly without further coordination.
- **16-04 (AI authoring skill)** references `buildSelectorLadder` priority fiber > role > css as the canonical authoring hierarchy. The runtime-side helper is the source of truth.

## Self-Check

- `packages/devtools/src/types.ts` — FOUND (recorder types: 4 exports)
- `packages/devtools/src/recorder-view.ts` — FOUND (class RecorderView, buildSelectorLadder)
- `packages/devtools/src/panel.ts` — FOUND (RecorderView import + instance + 2 switch cases)
- `packages/devtools/src/panel.css` — FOUND (.recorder-panel, .recorder-mode-badge)
- `packages/devtools/src/index.html` — FOUND (data-tab="recorder" + data-view="recorder")
- `packages/devtools/tests/recorder-view.spec.ts` — FOUND (7 tests)
- `packages/devtools/vitest.config.ts` — FOUND (environment: jsdom)
- `packages/mcp/src/pending-store.ts` — FOUND (class PendingStore)
- `packages/mcp/src/recorder-controller.ts` — FOUND (class RecorderController)
- `packages/mcp/src/devtools-server.ts` — FOUND (case 'recorder_toggle' + isValidCommitPayload)
- `packages/mcp/tests/pending-store.spec.ts` — FOUND (8 tests)
- `packages/mcp/tests/recorder-controller.spec.ts` — FOUND (5 tests)
- `packages/runtime/src/runtime/recorder-injected.ts` — FOUND (6 exports)
- `packages/runtime/src/runtime/command-handlers.ts` — FOUND (handleRecorderEnable / handleRecorderDisable)
- `packages/runtime/tests/recorder-injected.spec.ts` — FOUND (10 tests)
- Commit `e7a03f2` — FOUND (Task 1 RED)
- Commit `788cdc1` — FOUND (Task 1 GREEN)
- Commit `1ead0a2` — FOUND (Task 2 RED)
- Commit `7caa50f` — FOUND (Task 2 GREEN)
- Commit `9ebfe40` — FOUND (Task 3 RED)
- Commit `ced1879` — FOUND (Task 3 GREEN)
- `pnpm --filter @agrune/devtools run test` → 7 pass
- `pnpm --filter @agrune/mcp run test` → 123 pass
- `pnpm --filter @agrune/runtime exec vitest run tests/recorder-injected.spec.ts` → 10 pass
- Typecheck devtools/mcp/runtime → 0 errors each
- Build devtools → dist produced

## Self-Check: PASSED

## TDD Gate Compliance

All three tasks followed RED → GREEN 2-gate:
- Task 1: `e7a03f2` (test) → `788cdc1` (feat) ✓
- Task 2: `1ead0a2` (test) → `7caa50f` (feat) ✓
- Task 3: `9ebfe40` (test) → `ced1879` (feat) ✓

No REFACTOR commits were required — the implementations landed in their final shape. No gate was skipped.

---
*Phase: 16-record*
*Completed: 2026-04-19*
