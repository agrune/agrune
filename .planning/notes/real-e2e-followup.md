# Real user-flow E2E — Phase 9 follow-up (2026-04-18)

## Why

The v1.1 Phase 9 Playwright suite validates DOM scanning, WebSocket HITL
contract, and raw-DOM click behaviour through Playwright's own chromium,
but **never routes through the production path** an AI harness uses:

```
MCP tool call  →  createMcpServer handler  →  CdpDriver.execute()
                                            ↘  CdpRuntimeInjector → real Chrome
```

So "E2E" was really runtime-integration. This note tracks the follow-up
that lays down true end-to-end scenarios on top of that production path.

## What was added

Four new specs under `packages/e2e/tests/user-flow/`:

| Spec | Scenario IDs | What it proves |
|------|--------------|----------------|
| `fill-real.spec.ts` | INPUT-01/02/03 | `agrune_fill` with `strategy: 'keystroke'` works against a masked/sensitive `<input>`, contenteditable `<div>`, and CC-number `<input>` on the `tricky-inputs.html` fixture |
| `active-session.spec.ts` | SESS-01/02/03 | Two concurrent tabs; `agrune_focus` flips `active`; implicit tool calls without `tabId` follow the active tab; `session.{wasActive, becameActive}` shape is correct |
| `self-healing.spec.ts` | HEAL-02/04 | `kill -9` the Chrome PID → `RecoverySupervisor` fires `started`/`succeeded` events → follow-up tool call returns a healed snapshot OR a structured `CHROME_CRASHED`/`RECOVERY_FAILED` error |
| `act-overlay.spec.ts` | optional | Opening the overlay-modal via `agrune_act` flips `context: 'overlay'`, suppresses background toolbar targets, and the modal's "Keep editing" closes it |

Helpers live in `tests/user-flow/helpers.ts`:
- `createRealHarness()` — boots `CdpDriver` (launch mode, headless), launches
  Chrome at `about:blank`, navigates to the fixture URL, waits for
  `document.readyState === 'complete'`, and calls `forceReprepare` to inject
  the page-runtime. Returns a `call(toolName, args)` handle plus a `driver`
  ref and a `teardown()` function.
- `forceReprepare(driver)` — workaround for a launch-mode Chrome quirk (see
  below). Also exported so specs that open NEW tabs (`active-session`) can
  force the re-inject on the freshly-attached session.
- `realE2eSkipReason()` — returns a human-readable string when real Chrome
  is unavailable (PLAYWRIGHT_SKIP_E2E=1, AGRUNE_E2E_REAL=0, or no Chrome
  binary found).
- `getFullTargets`, `waitForTargetByName` — snapshot-polling convenience.

## Launch-mode runtime injection quirk

While wiring these specs we discovered that `CdpRuntimeInjector` fails to
install `globalThis.__agrune_runtime__` when run under a launch-mode Chrome
that booted with the fixture URL as a command-line argument. The runtime
bundle's top-level `var __agrune_runtime__ = (() => {...})()` does NOT
attach to `globalThis` via `Runtime.evaluate` in that racey path — we
confirmed with Chrome Stable 147.

**Workaround in the harness**: `forceReprepare` re-evaluates the runtime
source but aliases it explicitly to `globalThis.__agrune_runtime__ =
__agrune_runtime__`, then runs a trimmed bootstrap (equivalent to
`cdp-runtime-injector.ts`'s `buildBootstrapSource()` but fully explicit).
This is a **harness-only** workaround and does NOT patch the production
driver. It's called out here so a follow-up phase can either reproduce it
in isolation and fix the driver, or document the recommended "open a tab
after launch" flow.

## How the tests reach Chrome

We import `@agrune/mcp`'s `createMcpServer` directly and invoke
`handleToolCall(name, args)` in-process. This is **byte-identical** to what
the MCP stdio transport delegates to after peeling off the JSON-RPC
envelope. We do NOT spawn `packages/mcp/dist/bin/agrune-mcp.js` as a child
process — that's the single residual gap (see below).

## Runnable vs skipped

| Environment | Outcome |
|-------------|---------|
| Local macOS with Chrome installed | All 4 specs run against real Chrome (headless) |
| CI with `PLAYWRIGHT_SKIP_E2E=1` | All specs soft-skip (consistent with existing specs) |
| CI without Chrome | All specs soft-skip via `realE2eSkipReason()` |
| Sandbox where `process.kill(pid, SIGKILL)` is blocked | Self-healing spec `test.skip()`s itself; others still run |

## How to run locally

```bash
# Monorepo root — builds deps + runs full e2e suite
pnpm test:e2e

# User-flow specs only
pnpm --filter @agrune/e2e exec playwright test tests/user-flow

# Single spec with UI (edit helpers.ts: headless: false temporarily)
pnpm --filter @agrune/e2e exec playwright test tests/user-flow/fill-real.spec.ts
```

## Residual gaps (future milestones)

1. **Child-process stdio spec** — spawn `agrune-mcp.js` and speak raw
   JSON-RPC 2.0 over stdio. Would catch shebang/packaging regressions.
2. **React/Vue framework-state parity** for `agrune_fill` (vendored UMD
   fixture, assert `React.useState` value after keystroke).
3. **DevTools webapp user flow** — browser-driven open → pause → resume.
   Today `hitl-toolbar.spec.ts` covers the protocol in isolation only.
4. **Multi-session recovery** — kill Chrome with >1 active session.
5. **Attach-mode (`--attach ws://...`)** end-to-end.
6. **Snapshot diff across navigation** — `agrune_read` vs post-nav snapshot
   consistency has no real-flow cover.
7. **Production-path fix for the launch-mode runtime-injection quirk** (see
   "Launch-mode runtime injection quirk" above). The harness works around
   it but the underlying driver likely has the same bug for real users who
   pass `--url` on the agrune CLI. Worth a dedicated phase: reproduce with
   `agrune --url http://... --headless`, then fix `CdpRuntimeInjector`
   (explicit `globalThis.__agrune_runtime__` assignment) and drop the
   harness workaround.

## Constraints honoured

- No version bumps (`0.4.1` preserved across workspace).
- No git tags created.
- No new dependencies added (uses only existing `@playwright/test`, `ws`,
  and the `@agrune/*` workspace packages).
- New fixtures: zero (existing `tricky-inputs.html` + `overlay-modal.html`
  cover all scenarios).
- Extension-mode code paths: not touched (CDP-only pivot respected).
