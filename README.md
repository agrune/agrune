# agrune

Agrune is a CDP-based MCP server for local AI agents. The agent talks only to MCP tools such as `browser_open_tab`, `browser_get_targets`, `browser_click`, and `browser_fill`; the page supplies the optimized manifest through `window.__agrune_manifest__`.

## Current Scope

This repo is currently optimized for the local-agent demo path:

1. An MCP host starts Agrune before the agent session.
2. Agrune launches or attaches to Chrome.
3. The agent opens a URL with `browser_open_tab`.
4. The page-owned manifest produces a compact actionable snapshot.
5. The agent controls the page by target IDs from that snapshot.

There is no user-facing installer flow right now. `npx agrune@latest` runs the MCP server directly. Do not add an `mcp` subcommand, skill installer, manifest-load tool, or separate user CLI until that product path is explicitly reintroduced.

## MCP Config

Published package:

```json
{
  "mcpServers": {
    "agrune": {
      "command": "npx",
      "args": ["-y", "agrune@latest"]
    }
  }
}
```

Local development package:

```json
{
  "mcpServers": {
    "agrune": {
      "command": "npx",
      "args": ["-y", "/Users/chenjing/dev/agrune/agrune/packages/agrune"]
    }
  }
}
```

The server connects stdio first and launches Chrome lazily on the first browser-control tool call. This avoids MCP health checks opening extra browser windows.

## Runtime Options

```bash
npx agrune@latest
npx agrune@latest --headless
npx agrune@latest --isolated
npx agrune@latest --attach http://127.0.0.1:9222
npx agrune@latest --attach ws://127.0.0.1:9222/devtools/browser/<id>
npx agrune@latest --user-data-dir ~/.agrune/browser-profile
```

| Option | Meaning |
| --- | --- |
| `--headless` | Launch Chrome without UI. |
| `--attach <endpoint>` | Attach to an existing Chrome CDP HTTP endpoint or browser WebSocket endpoint. |
| `--url <url>` | Initial URL when launching Chrome. Default is `about:blank`; agents should normally use `browser_open_tab`. |
| `--user-data-dir <path>` | Persistent Chrome profile. Default is `~/.agrune/browser-profile`. |
| `--isolated` | Use a temporary Chrome profile for a clean test run. |
| `--help`, `--version` | Print server help/version and exit. |

## Public MCP Tools

| Tool | Purpose |
| --- | --- |
| `browser_list_tabs` | List attached browser tabs. |
| `browser_open_tab` | Open a URL in the managed browser and make it active. |
| `browser_focus_tab` | Switch the active tab. |
| `browser_get_targets` | Return compact groups or expanded manifest-defined targets. |
| `browser_click` | Click a target ID. |
| `browser_double_click` | Double-click a target ID. |
| `browser_right_click` | Right-click a target ID. |
| `browser_hover` | Hover a target ID. |
| `browser_long_press` | Long-press a target ID. |
| `browser_fill` | Fill an input target ID. |
| `browser_drag` | Drag a target to another target or coordinates. |
| `browser_pointer` | Low-level pointer/wheel events for canvas/freeform work. |
| `browser_wait_for` | Wait for target state. |
| `browser_read` | Extract visible page content as markdown. |
| `browser_update_config` | Update visual/runtime options when explicitly requested. |

Agents should not need to read manifest files, load manifests manually, use CSS selectors directly, or know about Chrome DevTools Protocol details.

## Packages

| Package | Path | Role | Published |
| --- | --- | --- | --- |
| `agrune` | `packages/agrune` | Public npm package whose default bin runs the MCP server. | Yes |
| `@agrune/mcp` | `packages/mcp` | Internal MCP server source bundled into `agrune`. | No |
| `@agrune/browser` | `packages/browser` | Internal CDP driver, Chrome launcher, runtime injector. | No |
| `@agrune/runtime` | `packages/runtime` | Internal page runtime and target resolver. | No |
| `@agrune/core` | `packages/core` | Internal shared types and contracts. | No |
| `@agrune/manifest` | `packages/manifest` | Internal manifest schema/validator used by demos and future tooling. | No |
| `@agrune/e2e` | `packages/e2e` | Internal browser-flow tests and fixtures. | No |

## Build And Verify

```bash
pnpm install
pnpm --filter @agrune/core run build
pnpm --filter @agrune/browser run build
pnpm --filter agrune run build
pnpm --filter @agrune/mcp run test
pnpm --filter agrune run test
```

After `pnpm --filter agrune run build`, the local public package entry is:

```bash
npx -y /Users/chenjing/dev/agrune/agrune/packages/agrune --help
```
