---
phase: 06-stability-recovery
verified_at: 2026-04-18
status: passed
requirements_covered:
  - HEAL-01
  - HEAL-02
  - HEAL-03
  - HEAL-04
plans_completed:
  - "01"
  - "02"
  - "03"
commits:
  - 943520f
  - b01d002
  - c7d261a
  - 359e8a7
---

# Phase 6: Stability & Recovery — Verification

## Success Criteria (from ROADMAP)

1. **CDP 연결이 끊어지면 사용자가 아무 조작 없이 자동 재연결을 관찰하며 MCP 응답에 복구 상태가 기록된다** — ✅
   - `CdpConnection.onDisconnect` fires on WebSocket close/error.
   - `CdpDriver.subscribeLifecycle` subscribes and calls `RecoverySupervisor.trigger('connection_lost', reason)`.
   - `execute()` returns success with `result.recovered = true` once per recovery via `takeRecoveredFlag()`.
   - Public `toPublicCommandResult` passes `result` through untouched, so MCP consumers see `recovered: true`.
   - Covered by tests: `recovery-supervisor.spec.ts` (backoff + dedupe), `cdp-connection.spec.ts` (hook fires on socket close), `cdp-driver.spec.ts` (recovery surface).

2. **Chrome 프로세스가 죽으면 launcher가 자동으로 재시작하고 기존 세션이 재연결된 상태로 복귀한다** — ✅
   - `ChromeLauncher.onUnexpectedExit` fires only when `expectedExit` is false.
   - `CdpDriver.performRelaunch` kills any residual child, calls `launcher.launch(...)` with original options, reconnects, restarts target manager, re-prepares all targets.
   - `canRelaunch` gates behavior: attach-mode crash yields `CHROME_CRASHED` without relaunch.

3. **재연결 직후 첫 도구 호출이 런타임 주입·manifest 상태 resync 없이도 정상 동작한다** — ✅
   - Both `performReconnect` and `performRelaunch` call `reprepareAllTargets()` which deletes each session from `preparedSessions` and re-invokes `prepareTarget` → `CdpRuntimeInjector.prepareSession` → snapshot refresh.
   - `execute()` blocks via `await this.recovery.waitForRecovery()` before dispatching new commands, so the first post-recovery tool call sees a prepared runtime.

4. **자동 복구가 실패했을 때 사용자는 MCP 응답만 보고 원인과 다음 액션을 알 수 있다** — ✅
   - New error codes `CONNECTION_LOST`/`CHROME_CRASHED`/`RECOVERY_FAILED` added to `COMMAND_ERROR_CODES`.
   - `createCommandError(code, message, { cause, attempts, guidance })` is populated with mode-aware guidance ("Close the quick-mode browser window..." vs "Restart the attached Chrome instance...").

## Requirements Coverage

| REQ | Plan(s) | Status |
|-----|---------|--------|
| HEAL-01 | 01, 02, 03 | ✅ |
| HEAL-02 | 01, 02, 03 | ✅ |
| HEAL-03 | 02, 03 | ✅ |
| HEAL-04 | 01, 02, 03 | ✅ |

## Test Results
- `pnpm --filter @agrune/core build` — pass
- `pnpm --filter @agrune/browser build` — pass
- `pnpm --filter @agrune/browser typecheck` — pass
- `pnpm --filter @agrune/browser test` — **6 files / 38 tests passed**

## Pre-existing Issues (Out of Scope)
- `@agrune/devtools` vite build failure (missing module resolution) — pre-existing, flagged for Phase 9.
- `@agrune/mcp` `ws` module build issue — pre-existing, flagged for Phase 9.

## Deferred to Later Phases
- Live-browser E2E relaunch-and-reconnect scenario — deferred to Phase 9 (QUAL-01).
- DevTools webapp UI for recovery events — deferred to Phase 8.
- Preserving tabId across a Chrome relaunch — out of scope (Chrome assigns new `targetId`s after crash; clients should re-call `agrune_sessions`).

## Gaps Found
None.

## Commits
- `943520f` — feat(06-01): add recovery lifecycle hooks and error codes
- `b01d002` — feat(06-02): add RecoverySupervisor and self-healing to CdpDriver
- `c7d261a` — test(06-03): add RecoverySupervisor, CdpConnection, driver recovery tests

---

*Phase 06 verification complete: 2026-04-18*
