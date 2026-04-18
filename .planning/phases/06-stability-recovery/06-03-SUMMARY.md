# Phase 6 Plan 03: Recovery Unit Tests — Summary

**Status:** Complete
**Commit:** `c7d261a`

## What changed
- New `packages/browser/tests/recovery-supervisor.spec.ts`: 5 cases covering
  - first-attempt success emits `started`/`succeeded`
  - retry loop exhausts `maxAttempts` with correct backoff sequence `[10, 20]` for base=10/max=40/3 attempts
  - `chrome_crashed` with `canRelaunch=true` uses `relaunchAndReconnect` only
  - `chrome_crashed` with `canRelaunch=false` rejects before any strategy call
  - concurrent `trigger()` returns same `inflight` promise
- New `packages/browser/tests/cdp-connection.spec.ts`: real-WebSocketServer integration tests
  - `socket.close()` fires `onDisconnect` listener
  - explicit `disconnect()` does NOT fire listener
  - `socket.terminate()` rejects in-flight `send()` with a "disconnected/closed" message
- Augmented `packages/browser/tests/cdp-driver.spec.ts`: new `describe('CdpDriver recovery surface')` with
  - `execute()` returns `RECOVERY_FAILED` with `details.attempts`/`details.cause` when supervisor has a last failure
  - `execute()` returns `CONNECTION_LOST` when recovery is in flight

## Verification
- `pnpm --filter @agrune/browser test` — **6 files / 38 tests passed**

## Requirements
- HEAL-01, HEAL-02, HEAL-03, HEAL-04 (unit-level regression guard)
