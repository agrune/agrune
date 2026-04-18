# Phase 7 Research: Multi-Tab Session UX

**Phase**: 07 — multi-tab-session-ux
**Researched**: 2026-04-18
**Requirements**: SESS-01, SESS-02, SESS-03 (SESS-04 devtools UI는 Phase 8)
**Depends on**: Phase 6 (recovery/resync)

## 1. Current State

### SessionManager (`packages/browser/src/session-manager.ts`)
- Stores `Map<number, Session>` keyed by `tabId`. `Session = { tabId, url, title, snapshot, openedAt }`.
- No "active" concept. No timestamps of last interaction.
- Methods: `openSession`, `closeSession`, `clear`, `getSession`, `getSessions`, `updateSnapshot`, `getSnapshot`, `hasReadySession`, `waitForSnapshot`.

### `resolveTabId` (`packages/browser/src/cdp-driver.ts:286-292`)
Current behavior:
1. If `tabId` is number → return as-is.
2. Else: pick first session with `snapshot !== null`.
3. Else: pick `sessions[0]` (first by insertion order).
4. Else: null.

This is the "first session" bug in REQUIREMENTS §Multi-Tab/Session UX. User intent is lost — any opened tab wins.

### MCP surface
- `packages/mcp/src/tools.ts` defines 9 tool schemas (`getToolDefinitions`).
- `packages/mcp/src/mcp-tools.ts` registers the Zod-validated MCP tool handlers (`registerAgruneTools`).
- `packages/mcp/src/index.ts` `handleToolCall`:
  - Accepts `args.tabId`, calls `driver.resolveTabId(args.tabId)`, passes to `driver.execute(tabId, command)`.
  - Returns `toPublicCommandResult(result)` which currently drops any extra fields other than `commandId`/`ok`/`result`/`error`.
- `BrowserDriver` interface (`packages/core/src/driver.ts:11-26`) has `resolveTabId(tabId?: number): number | null`, `listSessions()`, `execute(...)`. No focus/active API.

### PublicCommandResult shape
Returned to the MCP caller — currently:
```ts
type PublicCommandResult =
  | { commandId; ok: true; result? }
  | { commandId; ok: false; error }
```
We need to thread "which session was chosen / is now active" through this.

### Existing Session public type
`PublicSession = { tabId, url, title, hasSnapshot, snapshotVersion }` — no `active` field.

### Tests
- `packages/browser/tests/session-manager.spec.ts` covers open/close/snapshot/hasReady/waitForSnapshot.
- `packages/browser/tests/cdp-driver.spec.ts` covers activity callbacks + recovery.
- `packages/mcp/tests/tools.spec.ts` asserts exactly 9 tools in an `expect(...).toEqual(...)` — adding `agrune_focus` requires updating that test.
- `packages/mcp/tests/public-shapes.spec.ts` uses deep `toEqual` on `toPublicSession` — adding `active` to the shape requires updating these cases.

## 2. Spec Reconciliation

Spec `docs/superpowers/specs/2026-03-29-agrune-focus-design.md` was written **before the 2026-04-15 extension-removal pivot** and references `chrome.tabs.get` / `chrome.windows.update` — APIs that no longer exist in our CDP-only architecture. We translate the intent as follows:

| Spec intent | CDP-only translation |
|-------------|---------------------|
| `chrome.tabs.update({ active: true })` | `Target.activateTarget(targetId)` (CDP activates the tab) |
| `chrome.windows.update({ focused: true })` | `Page.bringToFront` on the session (brings the tab's window forward) |
| Tab focus API | Also mark session active in `SessionManager` (pure intent tracking, separate from browser focus) |
| Error `TAB_NOT_FOUND` | Reuse existing `SESSION_NOT_ACTIVE` (+ new guidance) or raise a structured error without introducing a new error code unless required |

**Decision:** `agrune_focus` does three things: (1) sets `activeSessionId` in `SessionManager`; (2) best-effort calls `Target.activateTarget` and `Page.bringToFront` to move the browser focus; (3) returns the active session snapshot-summary. Active-session concept is **primary** (it's what `resolveTabId` depends on); browser-level focus is **best-effort** and never blocks the tool call (swallow CDP errors).

## 3. Design

### 3.1 Active session state (SESS-01)

Extend `Session` (internal) with `lastInteractionAt?: number`. Add `activeSessionId: number | null` to `SessionManager`:

```ts
class SessionManager {
  private activeSessionId: number | null = null
  getActiveSessionId(): number | null
  setActiveSession(tabId: number): boolean   // false if tab unknown
  clearActiveSession(): void
  touchSession(tabId: number): void          // updates lastInteractionAt + marks active
}
```

Rules:
- `closeSession(tabId)` must clear `activeSessionId` if it was that tab.
- `clear()` clears `activeSessionId` too.
- `openSession(tabId, ...)` does NOT auto-activate (preserve existing session when a new tab opens).
- `touchSession(tabId)` = bumps `lastInteractionAt = Date.now()` AND sets `activeSessionId = tabId`.

### 3.2 resolveTabId (SESS-02)

New rule in `CdpDriver.resolveTabId`:
1. If arg is a `number` → return arg (caller intent wins).
2. Else if `sessions.getActiveSessionId()` matches an existing session → return it.
3. Else if exactly one session with `snapshot !== null` → return it.
4. Else if any sessions exist → return the first by insertion order (fallback to current behavior).
5. Else return null.

### 3.3 Automatically mark active on successful interaction (SESS-01)

`CdpDriver.execute(tabId, command)` — after a successful CDP result comes back, call `this.sessions.touchSession(tabId)`. This ensures the last-acted-on tab becomes the default for the next tool call.

### 3.4 `agrune_focus` tool (SESS-03)

**Tool shape (public):**
```ts
agrune_focus({
  tabId?: number,          // preferred
  sessionId?: string,      // future-proofing; tabId resolved via sessions if provided
})
```

For v1.1, `tabId` is sufficient (our session IDs are tabIds). Spec suggests both — accept both, but require at least one. If `sessionId` is provided and looks like a numeric-string form, treat as tabId; otherwise ignore (no string session IDs yet). This leaves the hook open for future string IDs without breaking the signature.

**Handler logic (`packages/mcp/src/index.ts`):**
1. Parse `tabId` (numeric). If neither supplied → structured error "TAB_NOT_FOUND".
2. Check driver has a session with that tabId (`driver.listSessions()`).
3. If not → structured error "TAB_NOT_FOUND" with `details.tabId`.
4. Call `driver.focusSession(tabId)` (new method).
5. On success, return JSON with `{ ok: true, session: { tabId, url, title, wasActive, becameActive: true } }`.

**New driver method:** `BrowserDriver.focusSession(tabId: number): Promise<FocusResult>`:
- `wasActive = sessions.getActiveSessionId() === tabId`
- Call `sessions.setActiveSession(tabId)` (returns false if tab unknown → throw typed error).
- Best-effort CDP focus: `Target.activateTarget({ targetId })` via connection. Optionally `Page.bringToFront` on the session. Both wrapped in try/catch so CDP errors don't fail the tool if the session manager part succeeded.
- Return `{ tabId, wasActive, becameActive: true, cdpFocusError?: string }`.

### 3.5 MCP response session meta (SESS-03)

Thread an optional `session` field through every tool response:

Extend `ToolHandlerResult`:
```ts
export interface ToolHandlerResult {
  text: string
  isError?: boolean
}
```
Do NOT change the wire format (MCP SDK just takes the text). Instead, bake the `session` meta INTO the JSON text that handlers already produce. For command tools (`agrune_act`, `agrune_fill`, ...), the JSON that we already serialize from `toPublicCommandResult(result)` gets an extra field:

```ts
{
  commandId: "...",
  ok: true,
  result: {...},
  session: { tabId, url, title, wasActive, becameActive }
}
```

Implementation: the handler knows `tabId` (resolved) and the prior active before the call. After execution, it knows the new active (touchSession was called on success). It injects `session` into the public result before `JSON.stringify`.

For `agrune_sessions`, each session in the list gets an `active: boolean` field. Extend `PublicSession`:
```ts
interface PublicSession {
  tabId; url; title; hasSnapshot; snapshotVersion;
  active: boolean;
}
```

### 3.6 New error code

`createCommandError` needs no new code if we reuse `SESSION_NOT_ACTIVE` for missing tabs in `agrune_focus`. But the intent "tab not found for focus" is semantically distinct from "CDP session not yet attached." Add `TAB_NOT_FOUND` to `COMMAND_ERROR_CODES`.

## 4. File-by-file plan (aligns with PLAN.md split)

| File | Change | Plan |
|------|--------|------|
| `packages/browser/src/session-manager.ts` | add active tracking, touchSession, setActiveSession | 07-01 |
| `packages/browser/tests/session-manager.spec.ts` | tests for active state | 07-01 |
| `packages/core/src/index.ts` | add `TAB_NOT_FOUND` error code, extend `Session` (driver.ts) with `active: boolean`, add `FocusResult`, add `focusSession` to `BrowserDriver` | 07-02 |
| `packages/browser/src/cdp-driver.ts` | updated `resolveTabId`, `listSessions` with active, `touchSession` on execute success, new `focusSession` with CDP Target.activateTarget + Page.bringToFront | 07-02 |
| `packages/browser/tests/cdp-driver.spec.ts` | resolveTabId precedence, touchSession side-effect, focusSession happy/sad paths | 07-02 |
| `packages/mcp/src/public-shapes.ts` | PublicSession adds `active`; PublicCommandResult can be wrapped with session meta | 07-03 |
| `packages/mcp/src/tools.ts` | add `agrune_focus` tool definition; bump count to 10 | 07-03 |
| `packages/mcp/src/mcp-tools.ts` | register `agrune_focus` | 07-03 |
| `packages/mcp/src/index.ts` | resolve tabId, route `agrune_focus`, inject `session` meta into command responses, map `active` on listSessions | 07-03 |
| `packages/mcp/tests/tools.spec.ts` | update to 10 tools incl. `agrune_focus` | 07-03 |
| `packages/mcp/tests/public-shapes.spec.ts` | expected PublicSession now has `active` | 07-03 |

## 5. Risks

- `getToolDefinitions` test asserts exact 9-tool list. Forgetting the tool-list update will fail `pnpm -r test`.
- `toPublicSession` tests use `toEqual` — adding `active: false` default must be applied to each test object. Default `active = false` in the shaper if upstream didn't supply it.
- `Target.activateTarget` in attach mode may be ignored by some Chrome builds; treat CDP focus failure as non-fatal. The session-level active state is what `resolveTabId` uses; CDP focus is best-effort.
- Recovery (Phase 6): on reconnect, `sessions.clear()` is called. We must preserve `activeSessionId` across resync if the same tab reappears OR accept that active resets on full relaunch. Decision: reset on `clear()`. After `reprepareAllTargets`, active will be set again on the next successful tool call (via `touchSession`). This matches Phase 6 behavior (fresh state is safe) and avoids stale-tab bugs.
- `agrune_focus` tool name collides with nothing existing. Keep additive.

## 6. Non-goals

- Devtools UI for active-session switching (SESS-04 → Phase 8).
- Multi-window management beyond Page.bringToFront (spec out-of-scope).
- Persisting active session across Chrome restarts.

## RESEARCH COMPLETE
