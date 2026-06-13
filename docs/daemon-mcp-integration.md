# Plan: run the MCP server on the per-workspace daemon

Status: **planned (not implemented)** — deferred from the strategy-exec batch because
it changes the process/socket model and cannot be verified without a live browser.
The strategy review ranks this as *alignment, not differentiation* — do it after the
self-heal + bench/accuracy work, not before.

## Problem

The MCP entrypoint constructs its **own** browser driver, independent of the CLI's
per-workspace daemon:

- `packages/mcp/bin/agrune-mcp.ts:81` → `new PlaywrightDriver({ connection, ... })`
- `packages/cli/src/daemon.ts:27` → `new PlaywrightSession({ headless })` behind a
  unix-socket HTTP server.

So running the MCP server **and** the CLI against the same workspace yields **two
separate Chromium instances** and two sessions. Intended model: one daemon owns the
browser per workspace; both the CLI and the MCP server are thin clients of it.

## Why it is not a drop-in change

The two surfaces speak **different contracts**:

| | MCP path | Daemon path |
|---|---|---|
| Abstraction | `BrowserDriver` (`packages/core/src/driver.ts:236`) | HTTP routes over unix socket (`daemon.ts`) |
| Return types | `CommandResult`, `PageSnapshot`, `Session` (core types) | `PublicTab`, snapshot DTOs (CLI HTTP contract) |
| Transport | in-process method calls | `requestJson()` over `unix:<socket>` (`cli/src/daemon-client.ts`) |

A `DaemonDriver` adapter must bridge `BrowserDriver` ⇄ the daemon's HTTP routes, and the
shapes do not line up 1:1.

## Daemon route surface (already implemented)

`/health · /tabs · /tabs/new(/open) · /navigate · /back · /forward · /reload · /resize ·
/evaluate · /run-code(-unsafe) · /console · /network(/request) · /dialogs · /dialog/handle ·
/file-choosers · /file-upload · /tabs/focus · /tabs/close · /targets · /snapshot · /click ·
/fill · /fill-form · /type · /press · /select · /upload · /drop · /drag · /read · /wait ·
/screenshot · /events/history` (see `packages/cli/src/daemon.ts`).

## Recommended approach

**Option A — `DaemonDriver implements BrowserDriver` (smaller, preferred for MVP).**
New `packages/backend/src/daemon-driver.ts` (or in `@agrune/cli`) that implements the
`BrowserDriver` interface by proxying to the daemon:

- `connect()` → ensure daemon up (reuse `setDaemonAutoSpawn` + `/health`); `disconnect()` → no-op (daemon outlives the client) unless `--owns-daemon`.
- `execute(tabId, cmd)` → switch on `cmd.kind` → POST `/click|/fill|/drag|/wait|...`; map the daemon's response back into a `CommandResult`.
- `getSnapshot`/`listSessions`/`resolveTabId` → GET `/snapshot` + `/tabs`; cache the last snapshot the way `PlaywrightDriver` does so `getSnapshot` stays synchronous.
- Optional methods (`openTab`, `navigateTab`, `screenshotTab`, …) → their matching routes.

Then `agrune-mcp.ts` chooses the driver:
```
const driver = useDaemon
  ? new DaemonDriver({ endpoint: workspaceSocketEndpoint() })
  : new PlaywrightDriver({ connection, startUrl })   // standalone fallback
```
Keep the standalone `PlaywrightDriver` path as the default-safe fallback (e.g. when no
workspace/daemon, or `--standalone`), so MCP hosts that just `npx agrune` keep working.

**Option B — daemon exposes a `BrowserDriver` RPC.** Have the daemon hold a
`PlaywrightDriver` and add a single `/driver/execute` (+ `/driver/snapshot`) RPC mirroring
the interface, so the adapter is a near-1:1 transport shim. Cleaner long-term, larger diff.

Start with **A**; the synchronous `getSnapshot()` requirement is the main wrinkle (cache
the snapshot returned by the last `execute`/`/snapshot` call).

## Risks

- **Lifecycle/auto-spawn races** — the last commit was "harden daemon lifecycle"; a second
  client racing auto-spawn needs the existing lock to hold. Reuse, don't reinvent.
- **Snapshot freshness/versioning** — `BrowserDriver.getSnapshot` is sync; the daemon is
  async. Stale `expectedVersion` could cause `STALE_SNAPSHOT`. Cache + refresh on execute.
- **Ownership** — who stops the browser? Define: daemon owns it; MCP/`disconnect()` must NOT
  kill a daemon it didn't spawn.
- **Self-heal location** — self-heal lives in `PlaywrightSession`, which the daemon already
  uses, so daemon-backed MCP inherits self-heal for free. Standalone MCP also has it (same
  session). No duplication needed. ✓

## Test plan (needs a real browser)

1. `AGRUNE_BACKEND_SMOKE=1` style smoke: start daemon, point a `DaemonDriver` at it, run
   open → get_targets → click → snapshot; assert one Chromium instance (pid check).
2. Parity: same script through `PlaywrightDriver` vs `DaemonDriver` yields equivalent
   `CommandResult`/snapshot shapes.
3. Lifecycle: two clients, concurrent first-call auto-spawn → exactly one daemon; client
   exit leaves daemon running; `agrune daemon stop` tears down.

## Effort

~1–3 days with live-browser verification. Do **not** land without test #1–#3 green.
