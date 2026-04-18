# Phase 6: Stability & Recovery - Research

**Researched:** 2026-04-18
**Status:** Complete

## 1. Current Code Surfaces

### `packages/browser/src/cdp-connection.ts`
- `CdpConnection` owns a single `WebSocket` instance.
- `connect(wsEndpoint)` awaits `open`; once open it installs `message`/`close`/`error` listeners. Both `close` and `error` currently call `handleDisconnect()` which only rejects pending requests — there is **no reconnect, no event emitted, no state flag beyond `socket === null`**.
- `handleDisconnect()` does NOT clear `this.socket`, so subsequent `isConnected()` calls can return false (`readyState` != OPEN) but `send()` throws "CDP connection is not open." — that thrown error bubbles out of driver methods and back to the MCP caller.
- `on`/`off` maintain listener sets; listeners survive disconnect because `CdpConnection` lives longer than the socket.

### `packages/browser/src/chrome-launcher.ts`
- `ChromeLauncher.launch()` spawns `chromePath` with `--remote-debugging-port=0`, listens on stdout/stderr for `DevTools listening on (ws://...)`, resolves `wsEndpoint` on first match.
- `kill()` gracefully SIGTERMs then SIGKILLs after 2s.
- **No handlers for unexpected process exit** — if Chrome crashes mid-session, the `child` just emits `exit` with no observer and `ChromeLauncher` sits there thinking Chrome is alive (`this.child !== null`).

### `packages/browser/src/cdp-driver.ts`
- `CdpDriver` holds `CdpConnection`, `CdpTargetManager`, `ChromeLauncher`, `SessionManager`. Uses `preparedSessions: Set<string>` to avoid re-injecting runtime on the same session.
- `connect()` is guarded by `connectPromise` to dedupe concurrent callers. Good.
- `disconnect()` tears down target manager, clears prepared sessions, unregisters bindings, clears sessions, disconnects socket, kills launcher (if launch mode). **Does not re-init anything automatically.**
- `execute()` routes to `evaluateInSession`. Catches error → returns `INVALID_COMMAND`. Does NOT detect "connection dropped" and does not retry.

### `packages/browser/src/cdp-target-manager.ts`
- Listens to `Target.targetCreated/Changed/Destroyed/attachedToTarget/detachedFromTarget`.
- Allocates `tabId` from a local counter `nextTabId`. `stop()` resets counter to 1 — so after reconnect the same targets get new tabIds. **This breaks session continuity.**
- `sessionId` lives on the target record; after `Target.detachedFromTarget` it gets cleared.

### `packages/browser/src/session-manager.ts`
- Keyed by `tabId`. `snapshot` persists if same URL, else cleared. `clear()` wipes everything (called from `disconnect()`).

### `packages/core/src/index.ts` (error codes)
- `COMMAND_ERROR_CODES` is the canonical list: `STALE_SNAPSHOT`, `TARGET_NOT_FOUND`, `NOT_VISIBLE`, `DISABLED`, `FLOW_BLOCKED`, `TIMEOUT`, `SESSION_NOT_ACTIVE`, `AGENT_STOPPED`, `INVALID_TARGET`, `INVALID_COMMAND`, `CANVAS_PAN_FAILED`.
- **`errors.ts` file does NOT exist** — CONTEXT.md mis-referenced. The codes are inline constants in `index.ts`. We need to **append** new codes without removing existing ones.

### MCP layer (`packages/mcp/src/index.ts`)
- `handleToolCall` calls `driver.connect()` if `!isConnected`, then `driver.ensureReady()`. Errors from `driver.execute()` come back as `CommandResultFailure` → `toPublicCommandResult` stringifies the error.
- Means: if we add a new error code (e.g. `RECOVERY_FAILED`, `CHROME_CRASHED`) and surface `recovered: true` inside `result.result`, existing tool names/shapes stay intact (additive).

## 2. Failure Scenarios to Cover

| Scenario | Detection | Recovery |
|---|---|---|
| WebSocket drops while Chrome still alive (e.g. network flap, DevTools reloads, target killed) | `WebSocket.close`/`error` events | Reconnect to same `wsEndpoint` (attach mode) OR rediscover via launcher (launch mode) |
| Chrome process crashes | `ChildProcess.exit` event with non-zero code or signal | launch mode: relaunch Chrome, obtain new `wsEndpoint`, reconnect; attach mode: cannot relaunch — emit `CHROME_CRASHED` fatal |
| Reconnect works but session/target ids are stale | Driver state survives but `preparedSessions` keys are gone on Chrome's side | After reconnect, clear `preparedSessions`, restart `CdpTargetManager`, re-run `CdpRuntimeInjector.prepareSession` for each attached session |
| Retry budget exhausted | Counter | Surface `RECOVERY_FAILED` with last error message |

## 3. Recovery Strategy

Decisions (per CONTEXT):
- Exponential backoff, max 5 retries. Base = 250ms, factor = 2, cap = 4000ms → 250, 500, 1000, 2000, 4000.
- Single in-flight recovery at a time (mutex via promise) to prevent double relaunch.
- Emit events so MCP layer can decorate responses with `recovered: true` and DevTools webapp can display (Phase 8 will wire event bus).

## 4. Resync After Reconnect

Sequence after a fresh `wsEndpoint` is attached:
1. `CdpTargetManager.stop()` then `start(newConnection)` — resubscribes handlers, re-fetches targets.
2. Clear `preparedSessions` set on driver.
3. For each known target with a `sessionId`, call `CdpRuntimeInjector.prepareSession(sessionId)` again → this also reinstalls `Runtime.addBinding('agrune_send')` and the `Page.addScriptToEvaluateOnNewDocument` source.
4. `refreshSnapshot(tabId)` per target so manifest is rebuilt from DOM.

Note: because `CdpTargetManager.start()` already enumerates existing targets and auto-attaches, step 1 will re-create the `targetId → tabId` mapping automatically. We cannot preserve old `tabId` values across a restart because Chrome assigns new `targetId`s after crash — accept that and document.

## 5. Error Codes (new, additive)

Append to `COMMAND_ERROR_CODES` in `packages/core/src/index.ts`:
- `CONNECTION_LOST` — CDP socket disconnected, recovery in flight or failed.
- `CHROME_CRASHED` — child process exited unexpectedly.
- `RECOVERY_FAILED` — exponential backoff exhausted.

Existing codes unchanged. All references to `createCommandError(...)` keep working.

## 6. Meta Field on Successful Results

`CommandResultSuccess.result` is already `Record<string, unknown> | undefined`. To surface recovery state non-breakingly we add a `recovered: true` field into `result.result` whenever the current call survived a recovery event. The public shape (`PublicCommandResult`) passes `result` through untouched. No type changes needed.

## 7. Testability

- `CdpConnection` tests can use `ws` in-process mock server (already available via `ws` module we already depend on).
- `ChromeLauncher` tests can stub `spawn` — there are no existing launcher tests, so we introduce a thin seam: allow injecting a `spawn`-like function via optional constructor arg for tests (additive, default = real `spawn`).
- Full relaunch-and-reconnect flow is E2E — defer to Phase 9 (QUAL-01).

## 8. Open Questions / Deferred

- **Preserve old tabId across relaunch?** Deferred — requires persistent URL-based matching, not worth scope. Clients can re-call `agrune_sessions`.
- **DevTools webapp UI for recovery events?** Deferred to Phase 8.
- **E2E real-browser relaunch test?** Deferred to Phase 9.

---

*Phase: 06-stability-recovery*
*Research complete: 2026-04-18*
