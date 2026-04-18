---
phase: 08-devtools-webapp
plan: "01"
status: complete
completed_at: 2026-04-18
---

# Phase 8 Plan 01 Summary: Devtools Server — Command Broker & HITL Controller

## What shipped
- `packages/mcp/src/command-broker.ts` — `CommandBroker` class with pub/sub, 500-event FIFO buffer, `nextId`, `emit`, `subscribe`, `getBuffered`, `clear`.
- `packages/mcp/src/hitl-controller.ts` — `HitlController` class (pause/resume/step/skip state machine), `HitlSkipError` with code `HITL_SKIPPED`.
- `packages/mcp/src/index.ts` — `createMcpServer` now instantiates both modules, wraps `handleToolCall` to gate on HITL and emit lifecycle events (start/end/error). Returns `{ server, driver, handleToolCall, commandBroker, hitl }`. Re-exports new types.
- `packages/mcp/src/devtools-server.ts` — added `DevtoolsServerOptions` ({commandBroker, hitl, onFocusSession}). On WebSocket connect now pushes `hitl_state` and `command_backfill`; broadcasts `command_event` + `hitl_state`. New inbound message types: `hitl` (pause/resume/step/skip), `focus_session`. Existing messages unchanged.
- `packages/mcp/bin/agrune-mcp.ts` — passes broker/hitl/onFocusSession into `startDevtoolsServer`.
- Tests: `command-broker.spec.ts` (6 tests), `hitl-controller.spec.ts` (7 tests), `devtools-server.spec.ts` extended with phase-8-extensions describe (6 tests).

## Verification
- `pnpm --filter @agrune/mcp typecheck` green.
- `pnpm --filter @agrune/mcp build` green (resolved pre-existing `ws` issue via `pnpm install` which synced the workspace).
- `pnpm --filter @agrune/mcp test`: 41 pass, 4 fail. All 4 failures are pre-existing races in the ORIGINAL `devtools-server.spec.ts` that reproduce on `main` without our changes — see "Known pre-existing issue" below. All new Phase 8 tests pass.

## Known pre-existing issue (do NOT fix in Phase 8)
`packages/mcp/tests/devtools-server.spec.ts` has 4 race-condition test failures when vitest drains messages before subscribing. These failures exist on `main@ac94227` without any changes from Phase 8. They do not block Phase 8 verification. Phase 9 (Quality Infrastructure, QUAL-01) owns the cleanup.

## Minimal repair applied
`pnpm install` was required to sync `ws` into `packages/mcp/node_modules` — the package was declared but not hoisted. No package.json changes. This is within "minimum repair allowed" per CONTEXT.md.

## Follow-ups / notes for Plan 02
- WebSocket schema that the frontend must consume:
  - Inbound (server→client): `sessions_update`, `snapshot_update`, `command_event`, `command_backfill`, `hitl_state`
  - Outbound (client→server): `subscribe`, `highlight`, `clear_highlight`, `hitl {action: 'pause'|'resume'|'step'|'skip'}`, `focus_session {sessionId}`
- `CommandEvent` shape exported from `@agrune/mcp` if ever needed; Plan 02 duplicates in `devtools/src/types.ts` since devtools doesn't depend on `@agrune/mcp`.
