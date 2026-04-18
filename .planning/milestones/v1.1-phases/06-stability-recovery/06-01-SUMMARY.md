# Phase 6 Plan 01: Error Codes & Lifecycle Hooks — Summary

**Status:** Complete
**Commit:** `943520f`

## What changed
- `packages/core/src/index.ts`: appended `CONNECTION_LOST`, `CHROME_CRASHED`, `RECOVERY_FAILED` to `COMMAND_ERROR_CODES` (existing codes untouched).
- `packages/browser/src/cdp-connection.ts`: added `onDisconnect(cb)` public hook returning an unsubscribe function; close/error events now dispatch a structured `Error` through disconnect listeners; explicit `disconnect()` suppresses the event via `disconnectSuppressed` flag; `handleDisconnect(reason?)` also clears `this.socket` reference.
- `packages/browser/src/chrome-launcher.ts`: added `SpawnLike` type alias, `LaunchOptions.spawnImpl` for test injection, `onUnexpectedExit(cb)` hook, `hasChild()` method, `expectedExit` flag set by `kill()`, child-exit listener attached in `launch()` that fans out to listeners only when exit is unexpected.

## Verification
- `pnpm --filter @agrune/core build` — pass
- `pnpm --filter @agrune/browser build` — pass

## Requirements
- HEAL-01 (detection surface), HEAL-02 (detection surface), HEAL-04 (error codes)
