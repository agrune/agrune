# agrune

Agrune is a **semantic browser-control CLI for AI agents, built on the Playwright core**. A coding agent drives a real browser from the terminal — `agrune open`, `agrune snapshot`, `agrune click`, `agrune fill` — exactly like the official [`@playwright/cli`](https://playwright.dev/agent-cli/introduction). The one difference is **how the page is perceived**: instead of a raw accessibility tree with ephemeral `eN` refs, an app-scoped **manifest** (groups → targets, each with a `role → text → testId → attr → css` selector ladder) gives the agent a compact, stable set of *actionable* affordances addressed by stable target ids. The page supplies the manifest through `window.__agrune_manifest__`.

> **Positioning:** agrune : `@playwright/cli` :: manifest-driven : a11y-driven. Same Playwright engine, same terminal command surface; agrune adds a curated, stable, security-scoped target model (and may add extra commands on top).

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

## How It Works

agrune is **CLI-first**. A one-shot `agrune <command>` invocation talks to a **per-workspace daemon** that owns the browser:

1. The first browser command auto-spawns a detached daemon for the current workspace (unix socket at `~/.agrune/run/<workspace-hash>/daemon.sock`). The browser opens once and persists.
2. Each subsequent `agrune <command>` is a short-lived client that reconnects to that daemon — so the browser stays alive across commands.
3. `agrune open <url>` launches/navigates; `agrune targets` / `agrune snapshot` returns the actionable target model; the agent acts by target id (`agrune click <ref>`, `agrune fill <ref> <value>`); re-snapshot after navigation.
4. When the page exposes `window.__agrune_manifest__`, the snapshot is the compact manifest outline. With no manifest, agrune degrades to a full accessibility view (a11y-driven, like `@playwright/cli`).

The legacy Chrome DevTools Protocol stack has been removed — Playwright is the sole browser driver (`--attach` still connects to an existing Chrome over CDP via Playwright's `connectOverCDP`).

## Usage

```bash
# minimal agent loop
agrune open https://example.com
agrune targets               # compact manifest outline (or a11y view if no manifest)
agrune snapshot              # full target-ref snapshot
agrune click <target-ref>
agrune fill <target-ref> "value"
agrune snapshot              # re-snapshot after the UI changes
agrune screenshot --output shot.png
```

Daemon lifecycle (optional — browser commands auto-spawn it):

```bash
agrune daemon start [--headless] [--port 47654]   # foreground; binds the workspace socket
agrune daemon status
agrune daemon stop
```

Endpoint override: `--host`/`--port` (TCP) or `AGRUNE_DAEMON_SOCKET`. Run `agrune --help` for the full command list.

## CLI Commands

| Command | Purpose |
| --- | --- |
| `open <url>` | Open a URL in the managed browser and make it active. |
| `navigate` / `goto <url>` | Navigate the active page. |
| `back` / `forward` / `reload` | History navigation. |
| `resize <w> <h>` | Resize the active page viewport. |
| `targets [--mode outline\|full] [--group <id>]` | Compact manifest groups, or expanded manifest-defined targets. |
| `snapshot [--target <ref>] [--depth n]` | Full target-ref snapshot of the active page. |
| `read` | Extract visible page content as markdown. |
| `click` / `dblclick` / `right-click` / `hover` `<target-ref>` | Pointer actions on a target. |
| `fill <target-ref> <value>` | Fill an input target. |
| `type <target-ref> <text> [--submit]` | Type into an editable target. |
| `press [target-ref] <key>` | Press a keyboard key. |
| `select <target-ref> <value...>` | Select dropdown values. |
| `fill-form --fields <json>` | Fill multiple form fields. |
| `drag <start-ref> --to <end-ref>` | Drag a target to another target or coordinates. |
| `drop <target-ref> [path...]` | Drop files or MIME data onto a target. |
| `upload <target-ref> <path...>` | Upload files. |
| `wait <target-ref> [--state ...]` / `wait --text <t>` | Wait for target state, text, or time. |
| `screenshot [--output path] [--full-page] [--target <ref>]` | Save a page or target screenshot. |
| `evaluate` / `eval <js>` | Evaluate JavaScript on the page or a target. |
| `run-code-unsafe <js>` | Run arbitrary Playwright code against the active page. |
| `console [--level ...]` | Read console and page error messages. |
| `network [--filter <re>]` / `network request <i>` | Inspect captured network requests. |
| `dialogs` / `handle-dialog --accept\|--dismiss` | Inspect / handle JavaScript dialogs. |
| `file-choosers` / `file-upload [path...]` | Inspect / satisfy a pending file chooser. |
| `tabs [list\|new\|focus\|select\|close]` / `close` | Tab management. |
| `daemon start\|stop\|status\|events` | Per-workspace daemon lifecycle. |

Agents do not need to read manifest files, load manifests manually, use CSS selectors directly, or know about low-level browser-driver details. Run `agrune --help` for the complete, current surface.

## Status & Implementation

The lean rebuild is **implemented** — a single package built on Playwright's
**public API only** (never internals; enforced by the `verify:no-internals` gate):
**Playwright public API + manifest resolver + thin CLI wrapper + minimal session
daemon**. Milestones M0–M7 are complete and green (skeleton/guardrails → daemon
transport → manifest+resolver → snapshot/serializer → core actions → full
playwright-cli parity → optional plugins → distribution).

```bash
npm install        # deps
npx playwright install chromium
npm run build      # tsup → dist/
npm test           # unit + real-chromium integration (incl. the A.7 golden vector)
npm run bench:token   # token micro-bench (outline vs raw a11y)
```

- [`SPEC.md`](./SPEC.md) — the source of truth (manifest contract, verbatim
  snapshot/outline format, full command surface + `@playwright/cli` parity table,
  daemon wire protocol, type/error/exit contracts, golden conformance vector).
- [`PARITY.md`](./PARITY.md) — every `@playwright/cli` command mapped to its agrune
  equivalent.
- [`DECISIONS.md`](./DECISIONS.md) — resolved pre-flight design decisions.
- [`BENCH.md`](./BENCH.md) — what was/wasn't measured (token reduction; live-model
  grounding on the real demo; the recorded gpt-5.5 multi-round baseline is flagged
  as not reproducible without that model).

The optional `agrune-visual` cosmetic add-on lives as a separate package under
`packages/agrune-visual` (default off, never on the action critical path). The prior
~10,600-LOC monorepo implementation remains recoverable in git history.
