# TodoMVC · agrune Manifest Reference Fixture

## Purpose

This fixture preserves a TodoMVC-style React UI and the matching Agrune manifest structure. The current Agrune integration path is the MCP server plus manifest-defined targets; agent skill based authoring is no longer part of the active product path.

## What's in this directory

| File | Role |
|---|---|
| `index.html` | Vite entry: `<div id="root">` + CSS + `<script type="module" src="./App.tsx">` |
| `App.tsx` | TodoMVC React component with new-todo input, toggle-all, todo list, filters, and clear-completed |
| `manifest.ts` | Hand-written reference manifest: 8 static targets + 1 `defineRepeat` for todo rows |
| `README.md` | This file: execution notes + manifest checklist |

## Important Note

This fixture is not executed inside the `packages/e2e/` workspace. `@agrune/e2e` does not depend on `react` or `react-dom`, and `packages/e2e/tsconfig.json` only includes `tests/**` and `playwright.config.ts`.

To run it manually, copy the directory into a standalone Vite + React project and install `react` / `react-dom`. Its main purpose here is to preserve a stable manifest reference.

## Manual Run

1. Create a temporary Vite project:

   ```bash
   pnpm create vite@latest todomvc-demo --template react-ts
   cd todomvc-demo
   pnpm add @agrune/manifest
   cp /Users/chenjing/dev/agrune/agrune/packages/e2e/fixtures/todomvc/{App.tsx,manifest.ts,index.html} .
   pnpm dev
   ```

2. Build the Agrune package from the monorepo:

   ```bash
   pnpm --filter agrune run build
   pnpm --filter agrune exec agrune --help
   ```

3. Use `manifest.ts` as the reference for target shape, stable selectors, and repeat structure.

## Manifest Checklist

- [ ] Static targets cover the main controls:
  - `new_todo_input`
  - `toggle_all`
  - `filter_all` / `filter_active` / `filter_completed`
  - `clear_completed_button`
  - `todo_item_toggle` / `todo_item_label` / `todo_item_destroy` inside repeat targets
- [ ] `todo_items` is represented as `defineRepeat`.
- [ ] `containerSelector`, `keyFrom`, and repeat targets are stable.
- [ ] No hash class selectors.
- [ ] No `:nth-child` selectors.
- [ ] Every target has at least one `actionKinds` entry.
- [ ] No duplicate `targetId`.
- [ ] No `sensitive: false`. This demo has no password field, so `sensitive` should be omitted entirely.

## Notes

- Checkbox controls map to `['click']`.
- The dynamic `todos.map(todo => ...)` list maps to `defineRepeat`.
- The editable todo label maps to `['dblclick']`.
- Automatic validation belongs in runtime/manifest tests; this directory is a human-readable fixture.
