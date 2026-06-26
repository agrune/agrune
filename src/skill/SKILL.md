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

## The core loop — outline → ref → act → re-read

```bash
agrune open <url>            # launch / navigate the managed browser
agrune targets               # compact manifest OUTLINE (groups + counts) — cheap, read this first
agrune targets --group <id>  # expand ONE group to its target-refs (progressive disclosure)
agrune click <ref>           # act by target-ref
agrune fill <ref> "value"
agrune targets               # re-read after the UI changes
```

Read the outline first, then expand only the group you need. The outline is a few hundred
tokens; a full group is a few hundred more. Reading every group up front just spends tokens you
don't need yet — the whole point of the manifest is that you can navigate to the right group by
its name and description instead of scanning the entire page.

Target-refs are **stable across turns** — once you know `wizard_title_input`, reuse it; you
never re-derive selectors. A `click`/`fill` that returns `{ "ok": true, ... }` means the ref
resolved and the action *fired* — but not necessarily that the intended *outcome* happened.
Confirm the result with `agrune read` or a re-read of `targets` (e.g. "did the status actually
change to In Progress?", "did the dialog open?"). If `ok: true` came back but nothing changed,
the control usually needs a different gesture — most often `dblclick` to open a detail/edit view.

## Acting on targets

- `click <ref>` / `dblclick <ref>` / `right-click <ref>` / `hover <ref>`
- `fill <ref> "<value>"` — clears then types (auto-uses keystroke mode for password/OTP/CC fields)
- `type <ref> "<text>" [--submit]` — keystroke-by-keystroke
- `select <ref> <value...>` — native `<select>` dropdowns
- `check <ref>` / `uncheck <ref>` — checkboxes
- `press [<ref>] <key>` — e.g. `agrune press Enter`
- `upload <ref> <path...>` / `drag <start> --to <end>` / `drop <ref> [path...]`
- `wait <ref> --state visible|hidden|enabled|disabled` / `wait --text "..."` / `wait --time 2`

Repeat rows use the `repeatId[key=K].baseTargetId` form, e.g. `agrune click "todo_items[key=a1].toggle"`.

## Reading a target's state — `reason`

In `--group` (full) mode each target may carry a `reason`: `hidden`, `covered`, `offscreen`,
or `disabled`. **These are not errors.** They tell you the element is declared in the manifest
but isn't actionable in the *current* UI state — the panel it lives in isn't open, it's scrolled
out of view, an overlay is on top, or it's disabled until a precondition is met. The manifest
describes the whole app, so a group can list targets that belong to a dialog or a later step
that isn't on screen yet.

The fix is almost always to change the UI state, not the ref: open the panel, advance the step,
or bring the element into view, then re-read `targets`. The `reason` clears once the element
becomes actionable. For `offscreen` specifically: agrune auto-scrolls to a target before acting,
but a control low in a tall dialog can sit below a short viewport (common under `--headless`) and
stay unreachable — enlarge the viewport with `agrune resize <width> <height>` (or scroll its
container with `agrune evaluate`), then re-read.

## Working a multi-step flow (wizards, dialogs, multi-step forms)

This is the most common place to get confused, so here is the pattern end-to-end. Two things to
internalize, both consequences of "the manifest covers the whole app, the screen shows a slice":

- **The control that OPENS a feature often lives in a different group than the feature itself.**
  A "New task" button may be in the `board` group while the wizard's own fields are in
  `task_wizard`. If a feature group's targets are all `hidden`, look for its opener in a related
  group (board, navigation, toolbar).
- **On any one step, the fields for later steps simply aren't in the DOM yet.** They'll show as
  unresolved/`hidden`. That's expected — don't treat a step-2 field being absent while you're on
  step 1 as a problem.

Worked example — create an item through a three-step wizard:

```bash
agrune targets                                   # outline: find the feature + its opener group
agrune targets --group board                     # the opener lives here
agrune click board_new_task_button               # open the wizard
agrune targets --group task_wizard               # now the step-1 fields resolve
agrune fill wizard_title_input "Write tests"
agrune click wizard_next_button                  # advance — step 2's fields now enter the DOM
agrune targets --group task_wizard               # re-read to see the newly-rendered step-2 fields
agrune fill wizard_description_input "cover the fallback path"
agrune click wizard_next_button
agrune click wizard_create_task_button           # final step: submit
agrune targets --group board                     # verify: the new card now appears in the board
```

**Opening a dropdown / combobox / select-trigger?** After you click it open, re-read `targets`:
its choices appear either in a generic options group (e.g. `select_options`) OR as repeat-rows
inside the control's own group (e.g. `wizard_assignee_options[key=bob-kim].wizard_assignee_option`).
Re-reading shows you which, and the option refs to click. Picking an option typically sets the
value and closes the picker — you don't reopen it to "confirm".

## Perception & escape hatches

- `agrune snapshot` — raw Playwright accessibility tree (the a11y fallback / escape hatch)
- `agrune read` — visible page text (full-page `innerText`); your tool for confirming page
  *state*. It returns the whole page, so content behind an open modal is included too — for a
  single element/region, use `agrune snapshot --target <ref>`.
- `agrune screenshot --output shot.png [--full-page] [--target <ref>]`
- `agrune console` / `agrune network` — captured logs / requests
- `agrune evaluate "<js>"` — read-only page evaluation; takes a single *expression*, not
  statements (use a comma expression or an IIFE if you need more)

## Dialogs & file pickers

A click that opens an alert/confirm/prompt returns the dialog instead of hanging:

```bash
agrune click <ref>                 # -> { dialog: { type: "confirm", message: "..." } }
agrune handle-dialog --accept      # or --dismiss [--prompt-text "..."]
agrune file-upload <path...>       # satisfy a pending file chooser (no paths cancels)
```

## When the page has genuinely changed under you — `⚠ MANIFEST DRIFT`

`agrune targets` may print a `⚠ MANIFEST DRIFT` banner with a live a11y snapshot attached. It
means: on this screen, a group's declared refs are largely failing to resolve, which *can* mean
the app was redesigned and the manifest is now stale.

But treat it as a hint, not a verdict — judge it against what you're actually doing:

- If the refs **you need** still resolve and your `click`/`fill` returns `ok: true`, the manifest
  path is working. A banner here is usually just progressive disclosure (you're mid-wizard, on a
  tab, inside an accordion) where many of the group's targets legitimately aren't rendered yet.
  Keep using your refs.
- If a ref **you're actually trying to use** fails to resolve, *then* the drift is real for your
  task. Re-orient from the attached a11y snapshot — work the page like raw `agrune snapshot`
  output — instead of retrying the dead ref.

In short: let a *failing action*, not a banner, decide whether to fall back.

## Notes

- `sensitive` targets (passwords, etc.) are masked: you never see their value, and that is
  intentional — just `fill` them.
- `sensitive` is also why a fill can succeed with no visible value echoed back; that's expected.
- Run `agrune --help` (or `agrune <verb> --help`) for the complete, current command surface.
