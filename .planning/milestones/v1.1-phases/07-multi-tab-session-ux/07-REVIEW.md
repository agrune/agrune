# Phase 7 Code Review

**Reviewed:** 2026-04-18
**Depth:** standard (inline, orchestrator)
**Scope:** Files modified in commits `e2c22c3`, `3867547`, `8929f78`

## Files Reviewed

- `packages/browser/src/session-manager.ts`
- `packages/browser/src/cdp-driver.ts`
- `packages/core/src/index.ts`
- `packages/core/src/driver.ts`
- `packages/mcp/src/tools.ts`
- `packages/mcp/src/mcp-tools.ts`
- `packages/mcp/src/public-shapes.ts`
- `packages/mcp/src/index.ts`

## Findings

### BLOCKERS
None.

### WARNINGS
None.

### NOTES (non-blocking, style/perf observations)

1. **N1. Double `listSessions()` call in command branch** — `packages/mcp/src/index.ts:69,76`. Each command tool calls `driver.listSessions()` twice (before and after `execute`) to compute before/after active state. This rebuilds the array + maps each time. Session count is typically small (≤10), so the overhead is negligible; if profiling later shows hot-path, cache `driver.sessions.getActiveSessionId()` via a narrower driver API.

2. **N2. `throw createCommandError(...)` throws a plain object, not an `Error`** — `packages/browser/src/cdp-driver.ts focusSession`. The thrown value satisfies `CommandErrorShape` but is not an instance of `Error`. Works with current callers (`catch` + `Partial<CommandErrorShape>` shape-match) and tests (`rejects.toMatchObject({code})`). Acceptable but non-idiomatic; consider migrating to a thin `class CommandError extends Error` wrapper in a future refactor so stack traces are meaningful.

3. **N3. Self-mutating getter** — `SessionManager.getActiveSessionId()` may reset `activeSessionId` to `null` when it points at a missing session. Intentional self-healing for races between `clear()`/recovery and concurrent reads; documented in the RESEARCH §5.

### SECURITY
No new external input-handling paths beyond numeric coercion in `resolveFocusTabId`. All responses go through `JSON.stringify`. No injection vectors. Pass.

### TEST COVERAGE
- 9 new SessionManager tests (active tracking).
- 12 new CdpDriver tests (resolveTabId precedence ×5, touchSession on execute ×2, focusSession ×5).
- 3 new MCP tests (10-tool list, agrune_focus schema, PublicSession.active, toPublicSessionMeta).
- All green locally: `browser` 60/60, `core` 12/12, `runtime` 69/69, `mcp` 19/19 (excluding pre-existing `ws` devtools-server failure, Phase 9 scope).

### PRE-EXISTING ISSUES (out of phase scope)
- `@agrune/mcp` `devtools-server.ts` and its test fail on missing `ws` module resolution — was failing before Phase 7; tracked for Phase 9.
- `@agrune/devtools` Vite build — not touched in Phase 7.

## VERIFICATION
Review passes with 0 blockers, 0 warnings, 3 informational notes. No automatic fixes required.
