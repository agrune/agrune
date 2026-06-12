# Real user-flow E2E specs

These specs route through the **real** MCP tool layer → `PlaywrightDriver` → a
real chromium instance. The runtime-level
specs in the sibling directory still use Playwright's browser to validate the
scanner; these specs complement them by validating the stack that AI harnesses
(Claude Code, Codex) actually hit.

## How the harness works

- `helpers.ts` boots `PlaywrightDriver` in `launch` mode with `headless: true` and
  builds an in-process `createMcpServer(driver)` handler.
- Each `call(name, args)` invokes `handleToolCall(name, args)` directly — the
  same function the MCP stdio transport dispatches to.
- No spawning of the `agrune` CLI and no stdio JSON-RPC envelope: we hit the
  exact same code path the child process would execute after the MCP SDK
  peels off the envelope. If you'd like to add a real child-process
  smoke-test in the future, spawn `agrune` with
  `child_process.spawn` and pipe JSON-RPC frames over stdio.

## Prerequisites

1. A local Chrome install. macOS users get the default path; other platforms
   may need `AGRUNE_CHROME_PATH=/path/to/chrome`.
2. The monorepo built: `pnpm build` (the `pretest:e2e` script already handles
   this when running from the monorepo root).
3. The fixtures webserver running on `127.0.0.1:5555`. Playwright's own
   config auto-starts it.

## Run

From the monorepo root:

```bash
# Build + run everything (Playwright auto-starts fixtures server)
pnpm test:e2e

# Only the user-flow specs
pnpm --filter @agrune/e2e exec playwright test tests/user-flow

# Watch a single spec with the browser visible (edit helpers.ts: headless: false)
pnpm --filter @agrune/e2e exec playwright test tests/user-flow/fill-real.spec.ts
```

## Skip semantics

The helper `realE2eSkipReason()` returns a non-null string when any of these
hold, which makes each spec soft-skip:

- `PLAYWRIGHT_SKIP_E2E=1` is set (shared flag with the runtime specs).
- `AGRUNE_E2E_REAL=0` is set (explicit opt-out).
- No Chrome binary is discoverable.

The Chrome-crash scenario additionally `test.skip()`s itself if it cannot send
`SIGKILL` to the spawned PID (sandboxed CI).

## Residual gaps

Things this batch intentionally does NOT cover — good candidates for follow-up:

1. **End-to-end stdio spawning** of `agrune` as a child process, with
   JSON-RPC frames. Our in-process path is functionally equivalent but
   wouldn't catch binary-shebang or build-time packaging regressions.
2. **DevTools webapp** user flow (open the URL, click pause/resume, observe
   HITL state). Covered in isolation by `hitl-toolbar.spec.ts` already.
3. **React / Vue framework state parity** for `browser_fill`. The current spec
   asserts DOM-level `value` + `textContent` only; reframework adapters
   (`.input`/`.change` semantics) would need a vendored React UMD fixture.
4. **Multi-session recovery**: we kill Chrome with one session; behaviour
   under multiple concurrent sessions is worth a dedicated scenario.
5. **Attach-mode** (`--attach ws://...`) end-to-end. Today only launch-mode
   is exercised. Requires a separate Chrome started with
   `--remote-debugging-port=0` outside of the spec.
