# Phase 6 Plan 02: RecoverySupervisor & Driver Resync — Summary

**Status:** Complete
**Commit:** `b01d002`

## What changed
- New `packages/browser/src/recovery-supervisor.ts`: `RecoverySupervisor` class with exponential backoff (default 250ms base, 2× factor, 4000ms cap, 5 max attempts), listener API, `canRelaunch` branching, chrome-crashed short-circuit when relaunch unavailable, in-flight dedupe via `inflight` promise.
- `packages/browser/src/cdp-driver.ts`:
  - New fields: `recovery`, `resolvedWsEndpoint`, `unsubscribeDisconnect`, `unsubscribeExit`, `recoveryListeners`, `recoveredFlag`.
  - New public methods: `onRecoveryEvent`, `isRecovering`, `getLastRecoveryFailure`.
  - `doConnect()` now caches `wsEndpoint`, instantiates supervisor, subscribes to `CdpConnection.onDisconnect` and `ChromeLauncher.onUnexpectedExit`.
  - `disconnect()` tears down lifecycle subscriptions first.
  - `execute()` awaits in-flight recovery, annotates success with `recovered: true` once per recovery, and surfaces structured errors: `RECOVERY_FAILED`/`CHROME_CRASHED` when `getLastFailure()` is populated, `CONNECTION_LOST` when recovery is mid-flight. Non-recovery failures still return `INVALID_COMMAND` (existing behavior).
  - New private methods: `ensureRecoverySupervisor`, `subscribeLifecycle`, `triggerRecovery`, `performReconnect`, `performRelaunch`, `reprepareAllTargets`, `takeRecoveredFlag`.
- `packages/browser/src/index.ts`: re-exports `RecoverySupervisor`, `RecoveryEvent`, `RecoveryStrategy`, `RecoverySupervisorOptions`.

## Behavior contract
- Recovery is triggered automatically by unsolicited WebSocket close/error (connection_lost) or Chrome child exit (chrome_crashed, launch mode only).
- After a successful recovery, `CdpTargetManager` is restarted, `preparedSessions` is cleared, runtime is re-injected per target via `CdpRuntimeInjector.prepareSession`, snapshots re-fetched (HEAL-03).
- Attach-mode crashes fail fast with `CHROME_CRASHED` because relaunch is impossible without the launcher owning the child.

## Verification
- `pnpm --filter @agrune/browser build` — pass
- `pnpm --filter @agrune/browser typecheck` — pass

## Requirements
- HEAL-01, HEAL-02, HEAL-03, HEAL-04
