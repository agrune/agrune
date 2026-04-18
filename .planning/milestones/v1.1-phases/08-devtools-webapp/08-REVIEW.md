---
phase: 08-devtools-webapp
reviewed_at: 2026-04-18
depth: standard
status: PASSED
findings_count: 0 blocker / 0 high / 2 minor (fixed in-review)
---

# Phase 8 Code Review

## Scope
Files changed by Phase 8 (from git, plans 01 + 02):

- `packages/mcp/src/command-broker.ts` (new)
- `packages/mcp/src/hitl-controller.ts` (new)
- `packages/mcp/src/devtools-server.ts` (modified)
- `packages/mcp/src/index.ts` (modified)
- `packages/mcp/bin/agrune-mcp.ts` (modified)
- `packages/mcp/tests/command-broker.spec.ts` (new)
- `packages/mcp/tests/hitl-controller.spec.ts` (new)
- `packages/mcp/tests/devtools-server.spec.ts` (modified, additive describe)
- `packages/devtools/src/types.ts` (new)
- `packages/devtools/src/ws-client.ts` (new)
- `packages/devtools/src/logs-view.ts` (new)
- `packages/devtools/src/sessions-view.ts` (new)
- `packages/devtools/src/hitl-toolbar.ts` (new)
- `packages/devtools/src/panel.ts` (modified)
- `packages/devtools/src/panel.css` (modified, additive)
- `packages/devtools/src/index.html` (modified)

## Findings

### BLOCKER: 0

### HIGH: 0

### MEDIUM: 0

### MINOR: 2 (both fixed during review)

**M-01. `HitlController.step()` had no guard when not paused**
File: `packages/mcp/src/hitl-controller.ts`
Issue: `step()` unconditionally set `stepPending=true`, so calling step from the UI while the controller was already unpaused would cause the next tool call to re-pause immediately. Not a correctness bug in the happy path (UI only renders Step while paused), but a latent footgun for future callers.
Fix: added `if (!this.state.paused && this.waiters.length === 0) return` early-out at top of `step()`.

**M-02. `LogsView` expanded-set leaked IDs on buffer eviction**
File: `packages/devtools/src/logs-view.ts`
Issue: When `MAX_BUFFER = 500` FIFO eviction dropped old events, their IDs remained in `this.expanded` forever. Tiny memory leak (O(failures-ever-expanded)).
Fix: `splice()` on evict now deletes each evicted id from `this.expanded`.

## Security
- XSS: all dynamic content rendered through `escapeHtml`/`escapeAttr` in `logs-view.ts`, `sessions-view.ts`, `hitl-toolbar.ts`, `panel.ts`. `JSON.stringify(args).slice(0, 240)` is escaped before insertion.
- Authorization: devtools WS listens on 127.0.0.1 only (`packages/mcp/src/devtools-server.ts:200`) — HITL `pause/skip` and `focus_session` are acceptable without auth for local-first tool.
- Input validation on WS messages: `handleClientMessage` checks `typeof` before acting on every field (`tabId`, `targetId`, `sessionId`). `hitl.action` unknown values silently no-op (defensive).
- No secrets or PII in command log payload. `args` carries only the raw tool arguments already on the MCP wire.

## Correctness & Concurrency
- `CommandBroker` listener errors isolated via try/catch so a bad subscriber can't crash the tool invocation path.
- `HitlController.awaitGate` uses a single-shot promise per call. Skip fires the first waiter only, matching UI contract (skip current call). Resume fires ALL waiters with 'resume' — tools queued during a pause all wake up together, which is the intuitive semantic.
- Start/end/error events for the same `id` are properly merged in `LogsView.pushInternal`.

## Backward compatibility
- Existing WS message types (`sessions_update`, `snapshot_update`, `subscribe`, `highlight`, `clear_highlight`) untouched — verified with `grep -n` on `devtools-server.ts`.
- Existing devtools DOM ids (`tabSelect`, `pauseBtn`, `reasonFilter`, `actionFilter`, `searchInput`, `targetList`, `detailPane`, `snapshotInfo`, `connectionStatus`) preserved in new `index.html`.

## Test coverage
- `CommandBroker`: 6 tests covering nextId, emit, unsubscribe, FIFO eviction, listener-error isolation, clear.
- `HitlController`: 7 tests covering initial state, pause/resume broadcast, awaitGate blocking, pendingTool, skip-error, step-then-repause, HitlSkipError code.
- `devtools-server` phase-8 extensions: 6 new tests for hitl_state on connect, command_event broadcast, pause/resume broadcast, client hitl action, focus_session routing, command_backfill.
- Pre-existing 4 test races in the ORIGINAL describe block of `devtools-server.spec.ts` reproduce on `main@ac94227` without Phase 8 changes — defer to Phase 9 QUAL-01 cleanup.

## Verdict: PASSED
Code merges cleanly. Build + type + test gates green. Minor issues fixed in-review.
