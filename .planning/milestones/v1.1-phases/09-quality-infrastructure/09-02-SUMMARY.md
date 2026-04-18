---
phase: 09-quality-infrastructure
plan: "02"
status: complete
completed_at: 2026-04-18
---

# Phase 9 Plan 02 Summary: Annotation build-linter

## What shipped
- `packages/core/src/annotation-lint/`
  - `rules.ts` — `Diagnostic` type, `VALID_ACTION_KINDS`, `KNOWN_AGRUNE_ATTRS`, `levenshtein`, `suggestAttribute`.
  - `scanner.ts` — lightweight HTML/JSX attribute tokenizer (`extractElements`), `scanSource()` checks for all 7 diagnostic codes:
    `missing-name`, `missing-desc`, `invalid-action`, `duplicate-key`, `duplicate-group`, `orphan-group-meta`, `typo-attribute`.
  - `index.ts` — public API (`scanSource`, `scanFile`, `formatDiagnostic`, plus Diagnostic/Code/Severity types).
  - `vite-plugin.ts` — reusable `agruneAnnotationLintVite()` Vite/Rollup plugin template.
  - `__fixtures__/` — 7 fixture files (`ok`, `missing-name`, `missing-desc`, `duplicate-key`, `typo`, `invalid-action`, `group-orphan`).
- `packages/core/tests/annotation-lint.spec.ts` — 10 new unit tests (all green).
- `packages/core/bin/agrune-lint.js` — executable CLI shim that walks given paths, ignores `__fixtures__`/`node_modules`/`dist`, exits 1 on error.
- `packages/core/tsup.config.ts` — now emits `annotation-lint.js`, `annotation-lint-vite-plugin.js`, and types.
- `packages/core/package.json` — new subpath exports `./annotation-lint` and `./annotation-lint/vite-plugin`; new `bin` entry `agrune-lint`.
- `packages/core/tsconfig.json` — excludes `src/annotation-lint/__fixtures__` so the intentionally "broken" fixtures don't fail project typecheck.
- `packages/core/src/index.ts` — re-exports `Diagnostic*` types for one-import consumers.

## Verification
- `pnpm --filter @agrune/core build` — green, emits all three dist entries + dts.
- `pnpm --filter @agrune/core test` — 22 passed (10 new + 12 existing).
- `node packages/core/bin/agrune-lint.js packages/core/src/annotation-lint/__fixtures__/ok.tsx` — exit 0.
- `node packages/core/bin/agrune-lint.js packages/core/src/annotation-lint/__fixtures__/typo.html` — exit 1, reports suggestion "did you mean data-agrune-action?".
- `pnpm lint:annotations` (root alias, traverses `packages apps`) — exit 0; no authored broken annotations outside `__fixtures__`.
- CI `build-test` job (wired in Plan 01) calls this after `pnpm test` and fails the job on exit != 0.

## Notes
- CLI intentionally ignores `__fixtures__/` directories so test assets don't pollute the tree scan.
- JSX dynamic expressions (`data-agrune-action={var}`) are silently skipped — only string-literal attribute values are checked, matching the spec's conservative scope.
