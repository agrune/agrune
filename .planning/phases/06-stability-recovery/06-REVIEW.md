---
phase: 06-stability-recovery
reviewed_at: 2026-04-18
depth: standard
files_reviewed:
  - packages/core/src/index.ts
  - packages/browser/src/cdp-connection.ts
  - packages/browser/src/chrome-launcher.ts
  - packages/browser/src/cdp-driver.ts
  - packages/browser/src/recovery-supervisor.ts
  - packages/browser/src/index.ts
findings_total: 2
findings_blocker: 0
findings_high: 0
findings_medium: 1
findings_low: 1
---

# Phase 6: Stability & Recovery — Code Review

## Summary

2 findings across 6 source files. No blockers or high-severity issues. One
medium (`recovered` flag consumed even when `result.ok` is false) and one low
(unused `stdout`/`stderr` vars in `waitForWsEndpoint` — pre-existing, not
introduced by this phase).

## Findings

### [MEDIUM] `recovered: true` flag is consumed but dropped when command result is `ok: false`

**File:** `packages/browser/src/cdp-driver.ts`
**Lines:** 207-213

```ts
if (this.takeRecoveredFlag()) {
  if (result.ok) {
    const merged = { ...(result.result ?? {}), recovered: true }
    return { ...result, result: merged }
  }
}
return result
```

`takeRecoveredFlag()` unconditionally resets `recoveredFlag` to false before
checking `result.ok`. If the post-recovery command happens to fail at the
runtime level (e.g. `TARGET_NOT_FOUND`, `STALE_SNAPSHOT`), the caller will not
see a `recovered` signal, and subsequent successful calls will also not see it
because the flag has already been consumed.

**Fix:** Only consume the flag when we actually annotate the result.

```ts
if (result.ok && this.recoveredFlag) {
  this.recoveredFlag = false
  const merged = { ...(result.result ?? {}), recovered: true }
  return { ...result, result: merged }
}
return result
```

Alternatively, surface `recovered` on failures too (e.g. into `result.error.details`)
so HEAL-01's "MCP 응답에 복구 상태가 기록된다" criterion is met even on failed
post-recovery calls.

**Impact:** HEAL-01 partial regression in a narrow scenario. Non-blocking — the
supervisor's event stream still exposes this via `onRecoveryEvent`, so DevTools
UI (Phase 8) is unaffected.

### [LOW] Unused `stdout`/`stderr` accumulators in `waitForWsEndpoint` (pre-existing)

**File:** `packages/browser/src/chrome-launcher.ts`
**Lines:** 162-163, 181-189

The `stdout` and `stderr` local variables accumulate output but are never read
after `maybeResolve` — they exist only because `maybeResolve(chunk)` currently
receives the accumulator. This is pre-existing code (not introduced by this
phase); the phase only added the `spawner` injection seam and the exit listener.

**Fix:** Out of scope for Phase 6. Leave as-is; a cleanup can fold this into
Phase 9's quality-infra pass.

## Non-Findings (verified safe)

- `CdpConnection.handleDisconnect` — suppression flag correctly prevents listener
  fan-out during explicit `disconnect()`, while preserving pending-request rejection.
- `ChromeLauncher.kill` — setting `expectedExit = child !== null` before nulling
  `this.child` correctly suppresses the exit listener in `launch()`.
- `RecoverySupervisor.trigger` — in-flight promise dedupes concurrent callers;
  `chrome_crashed` with `canRelaunch=false` rejects synchronously without entering
  the retry loop, and `lastFailure` is recorded for `execute()` to surface.
- `CdpDriver.performRelaunch` — tears down bindings and target manager before
  relaunch; `reprepareAllTargets` clears `preparedSessions` per session and
  re-runs runtime injection + snapshot fetch.
- `CdpDriver.disconnect` — unsubscribes lifecycle hooks first, preventing a race
  where teardown triggers a spurious recovery.
- Error codes `CONNECTION_LOST` / `CHROME_CRASHED` / `RECOVERY_FAILED` are purely
  additive — no existing MCP tool name or error code was removed or renamed.

## Test Coverage

The new unit tests exercise:
- Backoff schedule (`[10, 20]` for base=10/cap=40/maxAttempts=3).
- `canRelaunch` branching for chrome-crashed cause.
- Concurrent `trigger()` dedup.
- Real WebSocketServer close → `onDisconnect` fires; explicit `disconnect()` does not.
- `execute()` RECOVERY_FAILED / CONNECTION_LOST surface.

Not covered (deferred):
- E2E relaunch-and-reconnect with a real Chrome process (Phase 9 QUAL-01).
- `ChromeLauncher.onUnexpectedExit` integration test — requires spawning real
  processes; the injection seam (`spawnImpl`) is in place but no unit test
  currently exercises it. Optional follow-up.

## Recommendation

Apply the MEDIUM fix for `recovered` flag consumption. LOW finding can be
deferred to Phase 9.

---

*Phase 06 code review complete: 2026-04-18*
