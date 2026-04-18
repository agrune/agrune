---
phase: 08-devtools-webapp
reviewed_at: 2026-04-18
advisory: true
overall_score: 22 / 24 (very good)
---

# Phase 8 UI Review (Advisory, Retroactive)

Scored against the 6-pillar rubric from `gsd-ui-checker` (1-4 per pillar, 4 = locked contract fully honored, 1 = contract ignored or missing). This audit is advisory — it does not block phase completion.

Sources audited:
- `packages/devtools/src/index.html`
- `packages/devtools/src/panel.css`
- `packages/devtools/src/panel.ts`
- `packages/devtools/src/logs-view.ts`
- `packages/devtools/src/sessions-view.ts`
- `packages/devtools/src/hitl-toolbar.ts`

Reference contract: `08-UI-SPEC.md` (status `approved`).

---

## Pillar 1 — Copywriting: **4/4** PASS

Every UI string mandated by UI-SPEC is present verbatim:
- CTAs: `Focus session`, `Resume`, `Step`, `Pause next tool`, `Skip current call`.
- Empty states: `No commands yet` / `Call an MCP tool to see events stream here.`; `No sessions` / `Launch agrune in a tab, then use agrune_focus to activate one.`
- Badges: `ACTIVE`, `PAUSED`.
- Error: `Disconnected. Retrying…` (set via `connectionStatus.title`).
- Destructive confirm: `Skip current call?` + one-line rationale note via `window.confirm`.

No generic "Submit" / "OK" anywhere. All CTAs are verb + noun.

## Pillar 2 — Visuals: **4/4** PASS

Focal hierarchy declared and implemented:
- Accent mauve `#cba6f7` drives the eye to: (a) active session row left-border, (b) active session `ACTIVE` badge, (c) selected snapshot target, (d) active tab underline.
- FAIL rows get `⚠` glyph + red status text — unmistakable.
- HITL `PAUSED` badge is high-contrast yellow — the operator cannot miss it.
- Tabs read left-to-right in pipeline order (observe → debug failures → manage sessions) matching typical operator flow.

No icon-only buttons without labels (only Unicode glyphs paired with text: `⏸ Pause`, `▶ Resume`, `● ACTIVE`).

## Pillar 3 — Color: **4/4** PASS

60/30/10 split declared & implemented:
- Dominant `#1e1e2e` on body/view backgrounds.
- Secondary `#181825` / `#11111b` on toolbar, tab bar, logs filters strip, detail pane.
- Accent `#cba6f7` appears on exactly 4 surfaces, matching the reserved list in UI-SPEC.
- Destructive `#f38ba8` reserved for fail states + skip button.

No accent bleeding into generic interactive elements. Filter selects, toolbar buttons, tab buttons all stay on `#313244` surface / `#a6adc8` text.

## Pillar 4 — Typography: **3/4** PASS with one note

Declared contract: body 11px/400, label 9px/400, heading 12px/700 — **3 sizes / 2 weights**.

Implementation:
- New CSS uses exactly those three sizes + 400/700 weights.
- **But**: the pre-existing `.group-header` rule (untouched, per the scope-lock in UI-SPEC exceptions) still declares `font-weight: 600`, so the file as a whole shows 3 weights (400 / 600 / 700).

This was pre-flagged in UI-SPEC §Typography as deliberate — "new code standardizes on 700" — so it does not count as a contract violation. Docked 1 point because a hard dimension-4 BLOCK rule in the checker is ">2 weights declared". Worth addressing in Phase 9 when the full style sheet is refactored.

## Pillar 5 — Spacing: **3/4** PASS with one note

All NEW CSS uses multiples of 4 (4 / 8 / 16 / 24). Verified by grep — no odd values in Phase-8 rules.

**Exception acknowledged in UI-SPEC:** the pre-existing toolbar uses `padding: 6px 10px` and the pre-existing target rows use `padding: 4px 10px 4px 20px`. These are NOT multiples of 4 but were explicitly scope-locked. I left them untouched. Phase 9 can normalize when doing style-sheet cleanup.

## Pillar 6 — Registry Safety: **4/4** PASS

Zero third-party registries declared. Zero third-party blocks ingested. Everything is hand-rolled vanilla TS + CSS. No shadcn. No registry vetting required.

---

## Aggregate Score

| Pillar | Score |
|---|---|
| 1 Copywriting | 4/4 |
| 2 Visuals | 4/4 |
| 3 Color | 4/4 |
| 4 Typography | 3/4 (pre-existing 600 weight) |
| 5 Spacing | 3/4 (pre-existing 6/10 padding) |
| 6 Registry Safety | 4/4 |
| **Overall** | **22 / 24** |

## Recommendations (non-blocking)

1. **Phase 9 task (QUAL-adjacent cleanup, optional):** replace `font-weight: 600` in `.group-header` with 700 to collapse to the 2-weight contract.
2. **Phase 9 task (optional):** bump toolbar padding `6px 10px` → `8px 12px` to land on the 4-multiple grid.

Neither recommendation blocks Phase 8 completion. UI-SPEC §Spacing explicitly scope-locked these pre-existing values.

## Verdict
Phase 8 ships a design-contract-compliant devtools UI. Advisory score: **22/24**.
