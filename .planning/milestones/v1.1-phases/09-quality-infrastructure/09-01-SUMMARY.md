---
phase: 09-quality-infrastructure
plan: "01"
status: complete
completed_at: 2026-04-18
---

# Phase 9 Plan 01 Summary: Playwright E2E harness + CI

## What shipped
- New workspace `@agrune/e2e` (`packages/e2e/`) with:
  - `package.json` pinning `@playwright/test@^1.48.0`, `ws@^8.20.0`, `@types/ws@^8.18.1`.
  - `playwright.config.ts` — chromium-only, headless, inline Node static server for fixtures on `127.0.0.1:5555`.
  - Fixtures: `fixtures/overlay-modal.html`, `fixtures/tricky-inputs.html`.
  - Tests: `tests/annotation-scan.spec.ts` (4), `tests/overlay-modal.spec.ts` (3), `tests/hitl-toolbar.spec.ts` (1) — 8 total.
  - All tests respect `PLAYWRIGHT_SKIP_E2E=1` for sandbox-skipped runs.
- Root `package.json` — added `lint:annotations`, `test:e2e`, `test:e2e:install`.
- `pnpm-workspace.yaml` — comment confirming `packages/e2e` is picked up.
- `tsconfig.base.json` — added `@agrune/mcp/devtools-server` to path map (needed for the HITL spec).
- `packages/mcp/package.json` — added `./devtools-server` subpath export for downstream consumers.
- `.github/workflows/ci.yml` (NEW) — two jobs:
  - `build-test` — install, build, typecheck, unit tests, `pnpm lint:annotations`.
  - `e2e` (needs `build-test`) — restores Playwright browser cache, runs `pnpm test:e2e:install && pnpm test:e2e`, uploads traces on failure.
  - Triggered on `pull_request` to main and `push` to main.

## Verification
- `pnpm install` — green.
- `pnpm --filter @agrune/e2e run typecheck` — exits 0.
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` — exits 0.
- `PLAYWRIGHT_SKIP_E2E=1 pnpm test:e2e` — 8 skipped (harness intact).
- `pnpm test:e2e` (with Chromium available) — 8 passed in 1.9s.

## Notes for downstream plans
- `pnpm lint:annotations` is referenced here but wired in Plan 02.
- The `@agrune/mcp/devtools-server` subpath export + base-tsconfig path are consumed by Plan 01's HITL spec AND by any future E2E that needs the real devtools server.
