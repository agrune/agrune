---
phase: 09-quality-infrastructure
plan: "03"
status: complete
completed_at: 2026-04-18
---

# Phase 9 Plan 03 Summary: Tech debt cleanup

## What shipped

### MCP spec split (race conditions resolved)
- `packages/mcp/tests/devtools-server.spec.ts` — now contains only the baseline `describe('devtools-server', ...)` block. Added inline `nextOfType()` helper + a defensive `stopDevtoolsServer()` at the top of `beforeAll`. All positional `waitForMessage()` calls that previously depended on exact ordering were rewritten to `nextOfType(…, 'snapshot_update' | 'sessions_update')`.
- `packages/mcp/tests/devtools-server-extensions.spec.ts` (NEW) — holds the `describe('devtools-server — phase 8 extensions', ...)` block. Each test in this file also uses `nextOfType()` instead of positional checks.
- Result: the 4 pre-existing race failures documented in Phase 8's SUMMARY are eliminated. `pnpm --filter @agrune/mcp test` now reports 45/45 green.

### Strict unused checks in @agrune/browser
- `packages/browser/tsconfig.json` — now extends `../../tsconfig.base.json` and adds `"noUnusedLocals": true, "noUnusedParameters": true`.
- `pnpm --filter @agrune/browser typecheck` — green with the new flags (no code changes needed — the package had no leftover unused locals/parameters).

### Panel CSS — Phase 8 UI-review deductions resolved
- `packages/devtools/src/panel.css`:
  - `#toolbar` — `padding: 6px 10px` → `padding: 8px 12px` (4-multiple grid).
  - `.target-row` — `padding: 4px 10px 4px 20px` → `padding: 8px 12px 8px 20px` (4-multiple grid; `.target-row.selected { padding-left: 18px }` preserved for the 2px left border).
  - `.group-header` — `font-weight: 600` → `font-weight: 700` (collapses to the 2-weight contract).
- `pnpm --filter @agrune/devtools build` — green.

## Verification
- `pnpm build` — exits 0 for all 6 packages.
- `pnpm typecheck` — exits 0.
- `pnpm test` — 22 core + 69 runtime + 60 browser + 45 mcp = 196 unit tests, all green.
- `pnpm lint:annotations` — exits 0.
- `pnpm test:e2e` (when Chromium is available) — 8/8 passing in 1.9s.

## Note
Phase 8 UI-review's advisory 22/24 → should now re-score to 24/24 once a UI reviewer reruns. This plan does not invoke the reviewer; the CSS tokens simply no longer violate the 4-multiple grid or 2-weight typography contract.
