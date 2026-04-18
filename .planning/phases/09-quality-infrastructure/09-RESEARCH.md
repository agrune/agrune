---
phase: 09-quality-infrastructure
gathered_at: 2026-04-18
status: research-complete
---

# Phase 9 Research: Quality Infrastructure

## 1. Purpose

Close the v1.1 brown-field quality loop: E2E harness that drives a real Chrome through agrune's annotation surface (QUAL-01), an annotation build-linter that fails CI when authors misdeclare `data-agrune-*` (QUAL-02 / QUAL-03), and the pre-existing tech debt that prior phases deferred.

## 2. Codebase Landscape

### 2.1 Monorepo

- Root `package.json` scripts: `build`, `typecheck`, `test` — all fan out via `pnpm -r --filter "@agrune/*"`.
- Workspaces: `packages/*` only (see `pnpm-workspace.yaml`). `apps/cli-test-page/` exists but is NOT a workspace — it is a pre-built vite output used for ad-hoc manual testing and contains annotations in the bundled JS.
- CI: single workflow `.github/workflows/release.yml` runs only on `v*` tag push. It does install, typecheck, build, and publish. **There is no lint/test/e2e CI today — Phase 9 must add one.**
- Node 22 / pnpm 10 already installed and pinned (`packageManager: pnpm@10.23.0`).

### 2.2 Active packages

| Package | Role |
|---|---|
| `@agrune/core` | Shared types. `CommandKind`, `FillStrategy`, `data-agrune-*` contract types. |
| `@agrune/runtime` | DOM scanner + page runtime. `scanAnnotations()` (`packages/runtime/src/dom-scanner.ts`) is the runtime consumer of `data-agrune-*`. |
| `@agrune/browser` | CDP driver, recovery supervisor. |
| `@agrune/mcp` | stdio MCP server + devtools web-socket server + `agrune` CLI. |
| `@agrune/devtools` | Vite standalone webapp. |
| `~@agrune/extension~` | Stubbed — dist only; ignore. |

### 2.3 Annotation surface (ground truth)

- **Element contract** (from `packages/runtime/src/dom-scanner.ts`):
  - `data-agrune-action` — comma-separated list, must include at least one of `click|fill|dblclick|contextmenu|hover|longpress`.
  - `data-agrune-name` — display name (required per build-linter spec).
  - `data-agrune-desc` — description (required per build-linter spec).
  - `data-agrune-key` — optional stable id; if absent a position-based `agrune_{index}` is used and the target cannot be reliably referenced across snapshots.
  - `data-agrune-sensitive` — boolean flag.
- **Group contract**:
  - `data-agrune-group` — group id.
  - `data-agrune-group-name`, `data-agrune-group-desc` — group metadata.
- **Canvas / meta**:
  - `data-agrune-canvas` — present on canvas sub-trees.
  - `data-agrune-meta` — opaque JSON meta.

### 2.4 Tech debt inventory

1. **`packages/mcp/tests/devtools-server.spec.ts` (4 race conditions)** — the first `describe` block binds to a module-level singleton server. Its `beforeAll` starts one server instance, then the phase-8-extensions `describe` calls `stopDevtoolsServer()` and starts a new server. But the first block's `afterAll` also fires, racing. Tests that depend on "first message is X, second is Y" can also see `hitl_state` / `command_backfill` now, because the singleton server has new broadcast types. Confirmed by Phase 8 SUMMARY: "4 failures reproduce on main without Phase 8 changes, Phase 9 owns the cleanup."
2. **Phase 6 low-severity unused vars in `packages/browser/`** — grep for `@ts-expect-error`, `eslint-disable`, `unused` yielded zero matches. Phase 6 review notes reference minor `CdpHandler` / `recovery-supervisor` leftovers; we'll address via a strict `tsc --noUnusedLocals --noUnusedParameters` sweep.
3. **Phase 8 UI-review residual deductions** (22/24):
   - `.group-header` declares `font-weight: 600` — collapse to `700` to hit 2-weight contract.
   - `#toolbar` padding `6px 10px` and `.target-row` padding `4px 10px 4px 20px` — convert to multiples of 4 (`8px 12px` and `8px 12px 8px 20px`).

## 3. E2E harness research

### 3.1 Tool choice: Playwright

- Playwright already owns the headless-Chrome integration test niche, installs its own Chromium, supports CDP bridging, and has built-in web-server orchestration for test fixtures. The context doc explicitly names it.
- Version pin target: `@playwright/test@^1.48`. The runner ships `playwright install chromium` which downloads a browser binary. CI must run `playwright install --with-deps chromium`.

### 3.2 Layout

Adding a new package `@agrune/e2e` (private workspace) keeps the install/typecheck/test fan-out natural and lets us colocate fixture HTML assets plus the Playwright runner config.

```
packages/e2e/
  package.json
  playwright.config.ts
  tsconfig.json
  fixtures/
    overlay-modal.html         # fixture page served via Playwright's staticServer
    tricky-inputs.html         # masking + contenteditable + overlay combinations
  tests/
    overlay-modal.spec.ts      # covers z-index stacked overlay
    annotation-scan.spec.ts    # DOM scanner against fixture → expected shape
    hitl-toolbar.spec.ts       # devtools webapp pause/resume via WS
```

Runner model: Playwright's built-in `webServer` option launches a lightweight Node http-server that serves the `fixtures/` folder. The E2E tests navigate to the fixture URLs, inject the compiled `@agrune/runtime` page-runtime, and drive it through DOM events. A separate spec spins up the MCP devtools server (`startDevtoolsServer`) and verifies overlay/modal command flow.

**Critical caveat:** Booting a full CDP driver that launches Chrome AND then driving it from Playwright's Chrome would double-own the browser. Instead we use Playwright's browser and exercise the runtime's DOM-level seams directly (`scanAnnotations`, manifest builder). For the devtools webapp flow we start the WebSocket server but use Playwright to render the vite-built `@agrune/devtools` bundle against a mock driver — proving the overlay flows at the UI layer.

### 3.3 pnpm wiring

- Root `package.json` gets `"test:e2e": "pnpm --filter @agrune/e2e run test:e2e"` and `"test:e2e:install": "pnpm --filter @agrune/e2e exec playwright install --with-deps chromium"`.
- The new package provides `test:e2e` which is `playwright test`, and `pretest:e2e` which builds upstream packages (`pnpm -r --filter @agrune/runtime --filter @agrune/devtools --filter @agrune/mcp build`).
- Playwright installs a ~400MB Chromium to `~/Library/Caches/ms-playwright`. On CI we cache this path.

### 3.4 CI integration

New workflow `.github/workflows/ci.yml` runs on `pull_request` and `push` to `main`. Jobs:

1. **build-test** — matrix-less `ubuntu-latest`, Node 22, pnpm; runs `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint:annotations`.
2. **e2e** — same image, needs `build-test`; caches `~/.cache/ms-playwright`; runs `pnpm test:e2e:install` and `pnpm test:e2e`.

Both jobs are `required` via branch protection (documented in PR description but wiring is not code-enforceable from here). Failure in either blocks PR merge.

### 3.5 Sandbox constraint

Playwright cannot always download Chromium in a restricted sandbox. We author the test code + CI workflow so CI installs the browser, but local runs may skip. Add a guard in the e2e spec: if `process.env.PLAYWRIGHT_SKIP_E2E === '1'` or the browser binary is missing, tests exit with a clear "skipped — run `pnpm test:e2e:install`" message. CI never sets that env var, so it always runs.

## 4. Annotation build-linter research

### 4.1 Spec delta

`docs/superpowers/specs/2026-03-29-build-linter-design.md` proposes a per-build-tool plugin injected into the target project's build pipeline. Agrune itself does not ship a build plugin API, so for v1.1 we implement the linter as:

1. **Shared core** — `@agrune/core/annotation-lint` — a pure AST-level scanner that reads a file (TSX/JSX/HTML) and emits `{ file, line, column, code, message }` diagnostics.
2. **CLI** — `packages/core/bin/agrune-lint.js` — walks given paths, runs the scanner, prints diagnostics, exits 1 on any error. Wired as `pnpm lint:annotations`.
3. **Vite plugin template** — `packages/core/src/annotation-lint/vite-plugin.ts` — re-exports the scanner as a Vite plugin for users that want in-build enforcement.

### 4.2 Rule set

| Code | Rule |
|---|---|
| `missing-name` | element has `data-agrune-action` but no `data-agrune-name` |
| `missing-desc` | element has `data-agrune-action` but no `data-agrune-desc` |
| `invalid-action` | `data-agrune-action` value contains tokens outside `click|fill|dblclick|contextmenu|hover|longpress` |
| `duplicate-key` | two elements in the same file share the same `data-agrune-key` |
| `duplicate-group` | two elements share `data-agrune-group` id |
| `orphan-group-meta` | `data-agrune-group-name` or `data-agrune-group-desc` on element without `data-agrune-group` |
| `typo-attribute` | attribute like `data-agurne-*`, `data-agrune_action`, `data-agrunne-*` suggests typo (Levenshtein ≤ 2 of `data-agrune-{action|name|desc|key|group|group-name|group-desc|canvas|meta|sensitive}`) |

### 4.3 AST strategy

- **HTML files** — use the regex-walker + attribute-range extractor similar to the spec's example, but stepped over balanced `<...>` with string-state tracking for robustness. We already scan tokens via JS regex — simple is fine.
- **TSX/JSX files** — use `@typescript-eslint/typescript-estree` or lightweight scanner. To avoid adding a heavy parser dep, we implement a targeted tokenizer that walks JSX opening tags and attribute names/values, sufficient for attribute-level rules. We intentionally DO NOT try to evaluate dynamic expressions — only string-literal attribute values are checked. Computed / variable attributes are silently ignored (documented in CLI help).

### 4.4 Fixture coverage

- `packages/core/src/annotation-lint/__fixtures__/ok.tsx`
- `packages/core/src/annotation-lint/__fixtures__/missing-name.tsx`
- `packages/core/src/annotation-lint/__fixtures__/missing-desc.html`
- `packages/core/src/annotation-lint/__fixtures__/duplicate-key.tsx`
- `packages/core/src/annotation-lint/__fixtures__/typo.html`
- `packages/core/src/annotation-lint/__fixtures__/invalid-action.tsx`
- `packages/core/src/annotation-lint/__fixtures__/group-orphan.tsx`

Unit tests run each fixture through the scanner and assert the exact diagnostic codes.

### 4.5 CLI UX

```
$ pnpm lint:annotations
packages/core/src/annotation-lint/__fixtures__/missing-name.tsx:4:5
  error  data-agrune-action present but data-agrune-name missing  missing-name

Found 1 error (0 warnings) in 7 files.
```

Exit code:
- 0 — no errors.
- 1 — at least one `error`-severity diagnostic.
- 2 — usage error.

CI wires `pnpm lint:annotations packages/ apps/` into the `build-test` job.

## 5. Tech debt fixes

### 5.1 `devtools-server.spec.ts`

The bug is the shared singleton. Fix: the two `describe` blocks must be isolated either by
- moving the second block to a separate spec file (so vitest spawns a fresh process), OR
- resetting the singleton via a dedicated test helper before each describe (`await stopDevtoolsServer()` in `beforeEach`).

We choose (a): split into `devtools-server.spec.ts` (existing baseline) and `devtools-server-extensions.spec.ts`. Additionally, rewrite `connectWs()` to buffer all types (sessions_update / snapshot_update / command_event / hitl_state / command_backfill) so tests can `nextOfType('snapshot_update')` instead of position-based ordering. This eliminates races when the server decides to send an extra lifecycle message.

### 5.2 Strict unused-var sweep

Add `"noUnusedLocals": true, "noUnusedParameters": true` to `packages/browser/tsconfig.json` (if not already), run `pnpm --filter @agrune/browser typecheck`, fix any leftover.

### 5.3 Panel CSS tokens

```css
.group-header { font-weight: 700; }            /* was 600 */
#toolbar       { padding: 8px 12px; }           /* was 6px 10px */
.target-row    { padding: 8px 12px 8px 20px; }  /* was 4px 10px 4px 20px */
```

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Playwright browser download blocked in local sandbox | Guard spec with `PLAYWRIGHT_SKIP_E2E` + document `pnpm test:e2e:install` |
| tsup `noExternal: [/.*/]` (mcp) conflicts with new annotation-lint re-export | Only re-export at `packages/core` level; mcp still has its own bundle. |
| Annotation-lint false positives on dynamic JSX | Documented — only string literals. Matches spec's conservative scope. |
| CI runner cold cache (Chromium 400MB) | `actions/cache@v4` on `~/.cache/ms-playwright` keyed by playwright version. |
| Hooks/signing bypass | Never skipped. |

## 7. Validation Architecture

Not applicable — `nyquist_validation_enabled: false` in config.

## 8. Files expected to exist after Phase 9

**New:**
- `packages/e2e/package.json`
- `packages/e2e/playwright.config.ts`
- `packages/e2e/tsconfig.json`
- `packages/e2e/fixtures/overlay-modal.html`
- `packages/e2e/fixtures/tricky-inputs.html`
- `packages/e2e/tests/overlay-modal.spec.ts`
- `packages/e2e/tests/annotation-scan.spec.ts`
- `packages/e2e/tests/hitl-toolbar.spec.ts`
- `packages/core/src/annotation-lint/index.ts`
- `packages/core/src/annotation-lint/rules.ts`
- `packages/core/src/annotation-lint/scanner.ts`
- `packages/core/src/annotation-lint/__fixtures__/*` (7 fixtures)
- `packages/core/tests/annotation-lint.spec.ts`
- `packages/core/bin/agrune-lint.js`
- `.github/workflows/ci.yml`
- `packages/mcp/tests/devtools-server-extensions.spec.ts` (split out)

**Modified:**
- `package.json` (root) — add `lint:annotations`, `test:e2e`, `test:e2e:install`.
- `packages/core/package.json` — add `bin`, add `annotation-lint` export.
- `packages/mcp/tests/devtools-server.spec.ts` — remove second describe, tighten helpers.
- `packages/browser/tsconfig.json` — strict flags.
- `packages/devtools/src/panel.css` — 3 token fixes.
- `pnpm-workspace.yaml` — include `packages/e2e` (already covered by `packages/*`, but confirm).

## 9. Validation plan

- `pnpm --filter @agrune/core test` — annotation-lint unit tests green.
- `pnpm lint:annotations packages/ apps/` — exits 0 on clean tree, exits 1 when we add a failing fixture to CI smoke.
- `pnpm --filter @agrune/mcp test` — 45/45 green (4 race fixes land as the split spec).
- `pnpm --filter @agrune/browser typecheck` — strict flags green.
- `pnpm test:e2e:install && pnpm test:e2e` — only required on CI; local run documents skip.
- `.github/workflows/ci.yml` syntax check via `actionlint`-style scan OR `python -c "import yaml; yaml.safe_load(open('...'))"` — YAML parseable.
