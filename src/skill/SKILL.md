---
name: agrune
description: Drive a real browser from the terminal via stable, app-authored manifest target-refs. The manifest-driven peer of @playwright/cli — same engine and verbs, but you act on a compact, stable target model instead of a raw accessibility tree.
allowed-tools: Bash(agrune:*) Bash(npx:*)
---

# agrune

agrune is a manifest-driven browser-control CLI. It drives a real Chromium browser through the
same terminal verbs as `@playwright/cli` (`open`, `snapshot`, `click`, `fill`, …), but you
address elements by **stable manifest target-refs** instead of ephemeral accessibility `eN`
refs. When the page exposes `window.__agrune_manifest__`, the snapshot is a compact, app-scoped
**outline** (groups + counts); otherwise agrune degrades to the raw accessibility view.

## Setup

```bash
agrune install          # one-time: download Chromium (npx playwright install chromium)
```

The first browser command auto-spawns a detached per-workspace daemon that owns the browser; it
persists across commands. No manual daemon management is needed.

## The core loop — outline → ref → act → re-snapshot

```bash
agrune open <url>            # launch / navigate the managed browser
agrune targets               # compact manifest OUTLINE (groups + counts) — cheap, read this first
agrune targets --group <id>  # expand ONE group to its target-refs (progressive disclosure)
agrune click <ref>           # act by target-ref
agrune fill <ref> "value"
agrune targets               # re-read after the UI changes (versions advance on real changes)
```

**Always read the outline first, then expand only the group you need.** Dumping every target is
wasteful; the outline is a few hundred tokens, a full group is a few hundred more.

## Acting on targets

- `click <ref>` / `dblclick <ref>` / `right-click <ref>` / `hover <ref>`
- `fill <ref> "<value>"` — clears then types (auto-uses keystroke mode for password/OTP/CC fields)
- `type <ref> "<text>" [--submit]` — keystroke-by-keystroke
- `select <ref> <value...>` — dropdowns
- `check <ref>` / `uncheck <ref>` — checkboxes
- `press [<ref>] <key>` — e.g. `agrune press Enter`
- `upload <ref> <path...>` / `drag <start> --to <end>` / `drop <ref> [path...]`
- `wait <ref> --state visible|hidden|enabled|disabled` / `wait --text "..."` / `wait --time 2`

Repeat rows use the `repeatId[key=K].baseTargetId` form, e.g. `agrune click "todo_items[key=a1].toggle"`.

## Perception & escape hatches

- `agrune snapshot` — raw Playwright accessibility tree (the a11y fallback / escape hatch)
- `agrune read` — visible page text (`innerText`)
- `agrune screenshot --output shot.png [--full-page] [--target <ref>]`
- `agrune console` / `agrune network` — captured logs / requests
- `agrune evaluate "<js>"` — read-only page evaluation

## Dialogs & file pickers

A click that opens an alert/confirm/prompt returns the dialog instead of hanging:

```bash
agrune click <ref>                 # -> { dialog: { type: "confirm", message: "..." } }
agrune handle-dialog --accept      # or --dismiss [--prompt-text "..."]
agrune file-upload <path...>       # satisfy a pending file chooser (no paths cancels)
```

## Notes for the agent

- Target-refs are **stable** across turns — reuse them; you don't need to re-derive selectors.
- `sensitive` targets (passwords, etc.) are masked: you never see their value, and that is
  intentional — just `fill` them.
- If a target won't resolve, re-run `agrune targets` (the page may have navigated) before retrying.
- Run `agrune --help` for the complete, current command surface.
