---
name: agrune
description: Drive a real browser from the terminal via stable, app-authored manifest target-refs. The manifest-driven peer of @playwright/cli.
allowed-tools: Bash(agrune:*) Bash(npx:*)
---

# agrune

agrune is a manifest-driven browser-control CLI for AI agents. It drives a real browser
through the same terminal verbs as `@playwright/cli` (`open`, `snapshot`, `click`, `fill`…),
but addresses elements by **stable manifest target-refs** instead of ephemeral a11y `eN`
refs. When the page exposes `window.__agrune_manifest__`, the snapshot is a compact,
app-scoped outline; otherwise agrune degrades to the raw accessibility view.

> Status: this SKILL.md is a placeholder. The full verb reference and the snapshot→ref→act
> loop are filled in at milestone M7 (SPEC §9). Until then, run `agrune --help` for the
> current command surface.

## The loop

```bash
agrune open <url>          # launch / navigate the managed browser
agrune targets             # compact manifest outline (groups + counts)
agrune targets --group <g> # expand one group to its target-refs
agrune click <ref>         # act by target-ref
agrune fill <ref> "value"
agrune snapshot            # re-read after the UI changes
```

Run `agrune --help` for the complete, current command list.
