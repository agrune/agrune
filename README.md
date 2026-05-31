# agrune

Agrune is a CDP-based MCP server for local AI agents. The agent talks only to MCP tools such as `browser_open_tab`, `browser_get_targets`, `browser_click`, and `browser_fill`; the page supplies the optimized manifest through `window.__agrune_manifest__`.

## Current Scope

This repo is currently optimized for the local-agent demo path:

1. An MCP host starts Agrune before the agent session.
2. Agrune launches or attaches to Chrome.
3. The agent opens a URL with `browser_open_tab`.
4. The page-owned manifest produces a compact actionable snapshot.
5. The agent controls the page by target IDs from that snapshot.

The CLI-first product path has been reintroduced. The published `agrune` package still runs the MCP server today, while `@agrune/cli` is the internal Playwright daemon prototype for the new CLI surface.

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
| `browser_tabs` | Playwright-style tab list/new/select/close actions. |
| `browser_close` | Close the active browser page. |
| `browser_focus_tab` | Switch the active tab. |
| `browser_navigate` | Navigate the active page to a URL. |
| `browser_navigate_back` | Go back in the active page history. |
| `browser_resize` | Resize the active page viewport. |
| `browser_take_screenshot` | Save a page or target screenshot. |
| `browser_evaluate` | Evaluate JavaScript on the page or a target. |
| `browser_run_code_unsafe` | Run arbitrary Playwright code against the active page. |
| `browser_console_messages` | Read console and page error messages. |
| `browser_network_requests` | List captured network requests. |
| `browser_network_request` | Read full details or one part of a network request. |
| `browser_press_key` | Press a keyboard key in the active page. |
| `browser_type` | Type text into an editable target. |
| `browser_select_option` | Select one or more dropdown values. |
| `browser_fill_form` | Fill multiple form fields. |
| `browser_file_upload` | Upload files to a pending file chooser. |
| `browser_drop` | Drop files or MIME data onto a target. |
| `browser_handle_dialog` | Accept or dismiss a pending JavaScript dialog. |
| `browser_snapshot` | Capture a full target-ref snapshot of the active page. |
| `browser_get_targets` | Return compact groups or expanded manifest-defined targets. |
| `browser_click` | Click a target ref. |
| `browser_double_click` | Double-click a target ref. |
| `browser_right_click` | Right-click a target ref. |
| `browser_hover` | Hover a target ref. |
| `browser_long_press` | Long-press a target ref. |
| `browser_fill` | Fill an input target ref. |
| `browser_drag` | Drag a target to another target or coordinates. |
| `browser_pointer` | Low-level pointer/wheel events for canvas/freeform work. |
| `browser_wait_for` | Wait for target state, text, text disappearance, or time. |
| `browser_read` | Extract visible page content as markdown. |
| `browser_update_config` | Update visual/runtime options when explicitly requested. |

Agents should not need to read manifest files, load manifests manually, use CSS selectors directly, or know about Chrome DevTools Protocol details.

## Packages

| Package | Path | Role | Published |
| --- | --- | --- | --- |
| `agrune` | `packages/agrune` | Public npm package whose default bin runs the MCP server. | Yes |
| `@agrune/cli` | `packages/cli` | Internal CLI and local Playwright daemon prototype. | No |
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
