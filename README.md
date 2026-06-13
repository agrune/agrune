# agrune

Agrune is a **semantic browser-control layer for AI agents, built on the Playwright core**. Instead of handing the model a raw DOM / accessibility dump, an app-scoped **manifest** (groups → targets, each with a `role → text → testId → attr → css` selector ladder) lets the agent see a compact, stable set of *actionable* affordances and drive the page by target id. The agent talks only to MCP tools such as `browser_open_tab`, `browser_get_targets`, `browser_click`, and `browser_fill`; the page supplies the manifest through `window.__agrune_manifest__`.

## Why agrune — "small model + accurate navigation"

Frontier models already "know" big sites (AWS, Cloudflare); the pain is **new / small / complex platforms** — e.g. government portals like 정부24 or 건강보험공단 — where agents wander, burn tokens, or fail the user's goal. agrune's bet: an app-scoped manifest lets even a **small / cheap / on-device model** operate those long-tail sites accurately, on far less context.

Measured token cost (cl100k_base, through the real agent-facing serializer — reproduce with `pnpm --filter @agrune/bench run bench`):

| view | 정부24 home | vs raw a11y (full) | vs depth-tuned |
| --- | ---: | ---: | ---: |
| raw a11y (full) | 8,310 | — | — |
| raw a11y (depth-tuned) | 4,245 | −49% | baseline |
| agrune outline (groups + counts + samples) | 227 | −97% | −95% |
| outline + expand one group (working set) | 3,384 | −59% | −20% |

The token win comes from **scoped, progressive disclosure** (read the outline first; expand only the group you act on), *not* from compressing a full dump. The downstream goal — a small model navigating long-tail sites *more accurately* — is the next thing to prove with live model + task runs (it is not claimed by the token bench).

Adjacent benefits: a tighter security surface (the agent can only act on declared targets; `sensitive` targets are masked), QA reuse (one manifest → agent control *and* stable Playwright tests), and a self-healing harness that re-grounds drifted targets automatically (MVP: see `@agrune/backend` self-heal).

## Current Scope

The local-agent path:

1. An MCP host starts Agrune before the agent session.
2. Agrune launches or attaches to a Chromium browser via Playwright.
3. The agent opens a URL with `browser_open_tab`.
4. The page-owned manifest produces a compact actionable snapshot.
5. The agent controls the page by target IDs from that snapshot.

The published `agrune` package runs the MCP server today; `@agrune/cli` is the per-workspace Playwright daemon (unix socket, auto-spawn) for the CLI surface. The legacy Chrome DevTools Protocol stack has been removed — Playwright is the sole browser driver (`attach` still connects to an existing Chrome over CDP via Playwright's `connectOverCDP`).

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

Agents should not need to read manifest files, load manifests manually, use CSS selectors directly, or know about low-level browser-driver details.

## Packages

| Package | Path | Role | Published |
| --- | --- | --- | --- |
| `agrune` | `packages/agrune` | Public npm package whose default bin runs the MCP server. | Yes |
| `@agrune/cli` | `packages/cli` | Internal CLI with a per-workspace Playwright daemon (unix socket, auto-spawn). | No |
| `@agrune/mcp` | `packages/mcp` | Internal MCP server source bundled into `agrune`. | No |
| `@agrune/backend` | `packages/backend` | Internal shared Playwright backend (session, snapshot, BrowserDriver adapter). | No |
| `@agrune/runtime` | `packages/runtime` | Internal visual-effects page bundle (cursor, aurora). | No |
| `@agrune/core` | `packages/core` | Internal shared types and contracts. | No |
| `@agrune/manifest` | `packages/manifest` | Internal manifest schema/validator used by demos and future tooling. | No |
| `@agrune/e2e` | `packages/e2e` | Internal browser-flow tests and fixtures. | No |
| `@agrune/bench` | `packages/bench` | Internal token/accuracy benchmark (raw a11y vs manifest snapshot). | No |

## Build And Verify

```bash
pnpm install
pnpm --filter @agrune/core run build
pnpm --filter @agrune/backend run build
pnpm --filter agrune run build
pnpm --filter @agrune/mcp run test
pnpm --filter agrune run test
```

After `pnpm --filter agrune run build`, the local public package entry is:

```bash
npx -y /Users/chenjing/dev/agrune/agrune/packages/agrune --help
```
