---
phase: 16-record
plan: "03"
subsystem: mcp+cli+filesystem
tags: [cli, watcher, ts-morph, chokidar, ast, filesystem, security]

# Dependency graph
requires:
  - phase: 16-record
    provides: PendingStore + PendingCaptureFile JSON shape (Plan 16-02)
  - phase: 11-manifest
    provides: assertNoHashClass / assertNoNthChild / SelectorLadder (@agrune/manifest)
provides:
  - "@agrune/mcp manifest-merger — pure `mergeTargetIntoManifest(sourceText, pending, path)` with MergeError codes"
  - "@agrune/mcp manifest-dev-watcher — ManifestDevWatcher class (chokidar + merger + confirm loop) + runManifestDevCli"
  - "`agrune manifest dev <file>` CLI subcommand wired through bin/agrune-mcp.ts alongside manifest validate"
  - "tsup banner ESM-CJS shim (__filename / __dirname / require) — prerequisite for any future @agrune/mcp dep that reaches into the CJS TypeScript compiler host"
affects:
  - 16-04 (AI authoring skill — shares the `defineTarget(...)` emission shape from buildDefineTargetText; may reuse merger for `apply` step)
  - 17-remove (legacy data-agrune-* removal — recorder authoring loop is now end-to-end: pending JSON → diff preview → user confirm → ts-morph merge)

# Tech tracking
tech-stack:
  added:
    - "ts-morph@28.0.0 — TypeScript AST editing with comment/formatting preservation"
    - "chokidar@5.0.0 — ESM-native filesystem watcher with awaitWriteFinish"
    - "diff@8.0.2 + @types/diff@8.0.0 — unified diff generation for preview output"
  patterns:
    - "Pure merge function — mergeTargetIntoManifest never touches the filesystem; caller is the single writer (separates ts-morph from I/O so tests run 100% in memory)"
    - "Dependency injection for chokidar + confirmPrompt + pendingStore — watcher is fully unit-testable without real fs.watch or real readline"
    - "ESM banner __filename/__dirname shim — unlocks any future dep that embeds the TypeScript compiler or other CJS-native libraries"
    - "Log-based waitFor() — spec uses observable log-line markers to synchronise with async processing, avoiding brittle setImmediate-stacking"

key-files:
  created:
    - packages/mcp/src/manifest-merger.ts                  # ts-morph merge pure function + MergeError
    - packages/mcp/src/manifest-dev-watcher.ts             # ManifestDevWatcher class + runManifestDevCli
    - packages/mcp/tests/manifest-merger.spec.ts           # 12 tests (M1-M11 per plan, plus M3b)
    - packages/mcp/tests/manifest-dev-watcher.spec.ts      # 9 tests (W1-W9)
  modified:
    - packages/mcp/package.json                            # +ts-morph, +chokidar, +diff, +@types/diff (devDep)
    - packages/mcp/bin/agrune-mcp.ts                       # `manifest dev` subcommand branch + help text (3 lines)
    - packages/mcp/tsup.config.ts                          # ESM banner extended with __filename / __dirname shims (ts-morph CJS compat)
    - pnpm-lock.yaml                                       # workspace lockfile with new deps resolved

key-decisions:
  - "Merger accepts BOTH flat `targets: []` AND `groups[0].targets` structures — the real schema only has groups[], but the plan's test fixtures (and some in-flight user manifests) use the flat form. Supporting both keeps the merger robust while the schema stabilises."
  - "`actionKinds: ['click']` hardcoded default — capture cannot infer action kind from a pure selector click; the user tweaks this after merge. Documented in-code; this is an intentional Recorder limitation, not a stub."
  - "tsup banner shims __filename/__dirname at the config level (not per-entry) — ts-morph is bundled into every entry by the noExternal regex, so the shim must be global. Tracked as a dependency note in the banner comment so future maintainers know why a two-line runtime shim lives in build config."
  - "Watcher uses log-line markers for test sync — a test-facing `onProcessed` hook would leak test scaffolding into production. The log-based waitFor() gives deterministic specs at the cost of slightly slower CI, which is the right trade for 9 tests."
  - "`'y'` exact-match confirm (case-insensitive after trim) — empty stdin, `n`, or a stray character all decline. T-16-13 requires explicit consent; this avoids the 'accidental enter' class of failure mode."

patterns-established:
  - "MergeError with structured `code` field — callers switch on code (INVALID_TARGET_ID, DUPLICATE_TARGET, CALL_NOT_FOUND, ...) for programmatic handling; message stays human-readable. Sets the template for future authoring-CLI errors."
  - "ts-morph in-memory only — `project.save()` grep is 0 in src; tests assert merged is computed via `sf.getFullText()`. Any future merger work inherits the no-fs-in-library rule."
  - "Watcher DI triad — `watcherFactory / confirmPrompt / pendingStore` injection lets tests drive a FakeWatcher EventEmitter without touching real fs.watch. Reusable pattern for future filesystem-backed services in @agrune/mcp."

requirements-completed: [RECORD-03]

# Metrics
duration: 10min
completed: "2026-04-19"
tasks: 2
tests_added: 21  # 12 merger + 9 watcher
files_created: 4
files_modified: 4
---

# Phase 16 Plan 03: `agrune manifest dev` watcher + ts-morph merger Summary

**`agrune manifest dev <file>` CLI subcommand ships today — chokidar watches `~/.agrune/authoring/pending/`, ts-morph merges new captures into the user's `manifest.ts` while preserving comments and trailing-comma style, and nothing is written to disk until the user types an exact `y` to confirm the unified diff preview.**

## Performance

- **Duration:** 10 min (2 tasks, no TDD 2-gate — plan marked each task as `type="auto"` with behaviour tests co-authored)
- **Started:** 2026-04-19T12:13:36Z
- **Completed:** 2026-04-19T12:23:49Z
- **Tasks:** 2
- **Commits:** 2 (one per task)
- **Files created:** 4
- **Files modified:** 4

## Accomplishments

- **`mergeTargetIntoManifest` pure function** — takes `(sourceText, pendingCaptureFile, manifestPath)` and returns `{ merged, diff, addedTargetIds }`. Handles flat `targets: []` and `groups[0].targets` structures alike, detects trailing-comma + indentation style from the source, and emits `defineTarget({ targetId, selector, actionKinds: ['click'] })` expressions built from `JSON.stringify` for security.
- **`MergeError` with structured codes** — `CALL_NOT_FOUND`, `INLINE_REQUIRED`, `TARGETS_NOT_FOUND`, `DUPLICATE_TARGET`, `INVALID_TARGET_ID`, `INVALID_SELECTOR`, `EMPTY_TARGETS`. Callers (watcher) switch on `code` to decide skip vs warn vs error.
- **Threat defences in the merger (T-16-09 / T-16-10)** — Every pending target's `targetId` is re-sanitised through `PendingStore.sanitizeTargetId` (allow-list regex) and every `attr` / `css` selector field is re-run through `assertNoHashClass` / `assertNoNthChild` before ts-morph touches anything. ts-morph's `project.save()` is never invoked — the merger extracts text via `sf.getFullText()` and returns it to the caller, so the T-16-10 elevation path is structurally unreachable (0 grep matches in the source).
- **`ManifestDevWatcher` class** — chokidar-based watcher with DI for `watcherFactory / confirmPrompt / pendingStore / log / pendingRoot`. Starts on `$HOME/.agrune/authoring/pending/`, processes each `add` event through size-gate (T-16-15, 256 KB cap) → JSON parse → merge → diff-preview → prompt → write + delete-pending. Errors at every step are logged and swallowed so one bad pending file does not kill the watcher loop.
- **`runManifestDevCli(args)` entrypoint** — arg validation (T-16-11, `.ts`/`.tsx` extension required + file existence check) before any watcher starts. Returns an exit code without `process.exit()` so it's unit-testable (tests W5/W6/W7).
- **`agrune manifest dev <file>` subcommand** — wired through `bin/agrune-mcp.ts` alongside `manifest validate`. Help text (`-h`) lists it in both the one-liner usage block and the Subcommands section.
- **tsup banner shim** — ts-morph embeds the TypeScript compiler, which uses `__filename` / `__dirname` / `require` at runtime. tsup emits ESM and the existing banner only shimmed `require`. Running the built CLI crashed with `ReferenceError: __filename is not defined in ES module scope` — fixed by extending the banner with `fileURLToPath(import.meta.url)` + `dirname(...)` shims. Now the built CLI runs cleanly (verified: `node dist/bin/agrune-mcp.js manifest dev` prints usage and exits 1; `manifest dev /nonexistent.ts` prints the file-not-found error and exits 1).

## Task Commits

1. **Task 1 — ts-morph merger pure function + 12 tests**
   - `66e81d9` (feat) — `src/manifest-merger.ts` (313 lines), `tests/manifest-merger.spec.ts` (12 tests), package.json + pnpm-lock additions. All 12 tests pass, typecheck clean.

2. **Task 2 — ManifestDevWatcher + `agrune manifest dev` CLI + 9 tests**
   - `2cee509` (feat) — `src/manifest-dev-watcher.ts` (~265 lines), `tests/manifest-dev-watcher.spec.ts` (9 tests), bin/agrune-mcp.ts subcommand branch, tsup.config.ts banner fix. All 9 tests pass, full `@agrune/mcp` suite 144/144, typecheck clean, build runs the CLI without runtime errors.

## Files Created/Modified

### MCP (packages/mcp)

- `src/manifest-merger.ts` *(new)* — `mergeTargetIntoManifest`, `buildDefineTargetText`, `MergeError`, private helpers `assertSelectorSafe` / `findDefineManifestCall` / `resolveTargetsArray` / `collectExistingTargetIds` / `detectTrailingCommaStyle` / `detectIndentation`.
- `src/manifest-dev-watcher.ts` *(new)* — `ManifestDevWatcher` class (start/stop/processPending), `runManifestDevCli`, `MAX_PENDING_SIZE` export, `defaultConfirmPrompt` (readline-based).
- `tests/manifest-merger.spec.ts` *(new)* — 12 tests (M1-M11 per plan + bonus); uses in-memory fixtures, zero filesystem I/O.
- `tests/manifest-dev-watcher.spec.ts` *(new)* — 9 tests (W1-W9). FakeWatcher EventEmitter mocks chokidar; `waitFor()` helper synchronises on log-line markers.
- `bin/agrune-mcp.ts` *(modified)* — `manifest dev` subcommand branch (5 lines), help text updates in two places (Usage + Subcommands).
- `tsup.config.ts` *(modified)* — banner now shims `__filename`, `__dirname`, and `require` via `fileURLToPath(import.meta.url)`. Comment explains why this is here (ts-morph CJS compat).
- `package.json` *(modified)* — `+ ts-morph@28.0.0`, `+ chokidar@5.0.0`, `+ diff@8.0.2` (dependencies), `+ @types/diff@8.0.0` (devDependencies).

### Root

- `pnpm-lock.yaml` *(modified)* — workspace lockfile resolved for the new deps (+ readdirp@5 transitive from chokidar@5 + code-block-writer / mitt / common-path-prefix transitives from ts-morph).

## Decisions Made

1. **Merger supports both flat `targets: []` and `groups[0].targets` shapes**
   The plan's test fixtures use flat top-level `targets: []`, but the real `@agrune/manifest` schema only validates `groups[].targets`. Rather than pick one and reject the other, the merger probes both in priority order (flat first, groups second). This keeps the merger friendly to users who start a manifest from scratch and to users following the schema strictly.

2. **`actionKinds: ['click']` hardcoded default in `buildDefineTargetText`**
   Capture is selector-only — we cannot infer the action kind. A default of `'click'` lets the merge produce a valid schema-compliant entry immediately; users tweak to `'fill'` after-the-fact. The plan called this out explicitly as "intentional (recorder does not promise 100% automation)".

3. **Log-line markers for test sync in watcher spec**
   `processPending` is async and fired from a synchronous chokidar event. Stacking setImmediate calls (the initial approach) was brittle — the test was order-dependent on fs operation timings. Switched to `waitFor(() => logs.some(matchPattern))` so each test blocks precisely on the observable completion marker it cares about (`skipped (user declined)`, `merged:`, `skip large pending`, `INVALID_TARGET_ID`). Zero flakes in 3 consecutive full-suite runs after the switch.

4. **tsup banner shim for `__filename` / `__dirname`**
   Added in Task 2 when the built CLI crashed at import time. Originally considered adding the shim only to the watcher entry, but tsup's `entry` list produces shared chunks and the ts-morph dependency is pulled into the shared chunk — so the shim has to be in the global banner, not per-entry. Documented in an in-file comment so future maintainers don't delete it.

5. **chokidar 5 over 4**
   chokidar@4.0.3 was already present transitively. Chose chokidar@5.0.0 because it's ESM-native and has the explicit `awaitWriteFinish` + named `watch` export shape the plan's Research section documents. The dep takes ~80 KB with its single transitive (`readdirp@5`) and avoids the `chokidar/chokidar-cli` API drift between 3/4/5.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] ts-morph CJS globals missing in tsup ESM banner**
- **Found during:** Task 2 smoke test after `pnpm --filter @agrune/mcp run build`
- **Issue:** `node dist/bin/agrune-mcp.js manifest dev` threw `ReferenceError: __filename is not defined in ES module scope`. The same error fires before any CLI arg parsing (ts-morph loads its TypeScript compiler host on import).
- **Fix:** Extended the tsup `banner.js` from a one-liner (`require` shim only) to a six-line prelude covering `require`, `__filename`, `__dirname`. Used internal-sounding names (`__agruneCreateRequire`, etc.) so that user code importing `createRequire` directly is not shadowed.
- **Files modified:** `packages/mcp/tsup.config.ts`
- **Committed in:** `2cee509` (Task 2)

**2. [Rule 1 — Bug] Test flakes when `processPending` async chain outran fixed-budget `flush()`**
- **Found during:** Task 2 test run — 3 of 9 specs failed intermittently with 20-setImmediate flushes.
- **Issue:** `processPending` performs ≥4 awaits (stat, readFile×2, merge, writeFile, deletePending). The fixed 20-tick `flush()` would sometimes exit before the final await settled, so `readFile(manifestPath)` in the test saw the un-written state.
- **Fix:** Introduced a `waitFor(predicate, budgetMs=2000)` helper that polls setImmediate until the asserted log line appears, then the test observes filesystem state. Stable across 3 consecutive full-suite runs.
- **Files modified:** `packages/mcp/tests/manifest-dev-watcher.spec.ts`
- **Committed in:** `2cee509` (Task 2)

**3. [Rule 1 — TypeScript error] `init.getLiteralText()` on `Expression<Expression>`**
- **Found during:** Task 1 first typecheck
- **Issue:** ts-morph's `getInitializer()` returns a general `Expression<Expression>`; narrowing via `init.getKind() === SyntaxKind.StringLiteral` still has `init` typed as the base class in strict mode, so a bare cast raised `TS2352: Conversion of type 'Expression<Expression>' to type '{ getLiteralText(): string; }' may be a mistake`.
- **Fix:** Cast via `unknown` — `(init as unknown as { getLiteralText(): string }).getLiteralText()` — acknowledging that the kind check is the runtime guarantee.
- **Files modified:** `packages/mcp/src/manifest-merger.ts`
- **Committed in:** `66e81d9` (Task 1)

**Total deviations:** 3 auto-fixed. No Rule 4 architectural deviations. No scope expansion.

## Threat Mitigation Results

| Threat ID | Disposition | Evidence |
|---|---|---|
| T-16-09 (tampered pending JSON → code injection via targetId / selector) | mitigated | `mergeTargetIntoManifest` re-runs `PendingStore.sanitizeTargetId` + `assertNoHashClass` / `assertNoNthChild` on every pending file. Tests M7 (`INVALID_TARGET_ID`), M8 (`INVALID_SELECTOR`) assert the gates. `JSON.stringify` on both targetId and selector values in `buildDefineTargetText` means hostile characters stay string-literal. |
| T-16-10 (ts-morph writes a file other than manifest.ts) | mitigated | `grep -c 'project\.save(' packages/mcp/src/manifest-merger.ts` → 0. Merged source is extracted via `sf.getFullText()` and returned to the caller (watcher), which writes with its own bounded path. Plus `skipAddingFilesFromTsConfig: true` caps the Project scope. |
| T-16-11 (`agrune manifest dev /etc/passwd`) | mitigated | `runManifestDevCli` validates extension (must be `.ts` / `.tsx`) and calls `stat(abs)` before any watcher starts. Tests W5-W7 exercise all three rejection paths (missing arg, missing file, wrong extension) — each returns exit 1. |
| T-16-12 (watcher points at an arbitrary directory) | mitigated | `ManifestDevWatcher.pendingRoot` is `deps.pendingRoot ?? join(homedir(), '.agrune', 'authoring', 'pending')`. The plan's `deps.pendingRoot` exists only for tests; there is no CLI flag or env var that sets it. `runManifestDevCli` never forwards a pendingRoot override to the watcher. |
| T-16-13 (silent / accidental apply without confirm) | mitigated | `defaultConfirmPrompt` asserts `ans.trim().toLowerCase() === 'y'`. Empty, `n`, `yes`, whitespace — all return `false`. Tests W2 and W4 (via MergeError path) confirm `writeFile` is never called when the user does not approve. Plus the strict-match gate is verifiable by grep for `'y'` in the file. |
| T-16-14 (diff contains secret values) | accepted (upstream) | Pending JSON carries selectors only (Plan 16-02 T-16-04). Diff is derived from selector-only text. No surface introduced here. |
| T-16-15 (oversized pending DoS) | mitigated | `MAX_PENDING_SIZE = 256 * 1024` gate in `processPending` — larger files emit a warn and return without reading. Test W8 writes a >256 KB pending and asserts the skip + unchanged manifest. |
| T-16-16 (partial-write race on pending JSON) | mitigated | chokidar `awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }` (Pattern 5 from Research) — the `add` event fires only after the file size has been stable for 100 ms. Grep evidence: `awaitWriteFinish` → 2 matches in `manifest-dev-watcher.ts`. |

## Verification

### Per-suite results

- **`@agrune/mcp` unit tests** — 144 / 144 pass (123 prior + 12 merger + 9 watcher, all new specs in this plan)
  - `pnpm --filter @agrune/mcp run test` → 13 files pass, 144 tests pass. Ran 3× consecutively, no flakes.
- **`@agrune/mcp` typecheck** — `pnpm --filter @agrune/mcp run typecheck` → 0 errors
- **`@agrune/mcp` build** — `pnpm --filter @agrune/mcp run build` → ESM + DTS clean. `dist/manifest-dev-watcher-<hash>.js` is 13.56 MB (ts-morph embeds the TypeScript compiler — expected).
- **CLI smoke tests (post-build)**:
  - `node dist/bin/agrune-mcp.js manifest dev` → `Usage: agrune manifest dev <manifest.ts>` + exit 1
  - `node dist/bin/agrune-mcp.js manifest dev /nonexistent.ts` → `[manifest dev] file not found: /nonexistent.ts` + exit 1
  - `node dist/bin/agrune-mcp.js --help` → Help text shows `agrune manifest dev <file>` in Usage and Subcommands
- **Cross-package regression** — `pnpm -r --filter "@agrune/*" run test` (excluding the pre-existing runtime flake discussed below): `@agrune/core` 39/39, `@agrune/manifest` workspace passes, `@agrune/react` 53/53, `@agrune/devtools` 7/7, `@agrune/runtime` 253/253 on retest (one flake instance observed, confirmed as the pre-existing overlay-target test discussed below).

### Acceptance criteria grep

- `"ts-morph"` in `packages/mcp/package.json` → 1 ✓ (dependencies block)
- `"chokidar"` in `packages/mcp/package.json` → 1 ✓
- `mergeTargetIntoManifest|MergeError|buildDefineTargetText` in `packages/mcp/src/manifest-merger.ts` → 14 matches ✓
- `sanitizeTargetId` in `packages/mcp/src/manifest-merger.ts` → 1 ✓ (T-16-09)
- `project\.save\(` in `packages/mcp/src/manifest-merger.ts` → 0 ✓ (T-16-10)
- `validateManifest|assertNoHashClass|assertNoNthChild` in `packages/mcp/src/manifest-merger.ts` → 7 matches ✓
- `class ManifestDevWatcher` in `packages/mcp/src/manifest-dev-watcher.ts` → 1 ✓
- `runManifestDevCli` in `packages/mcp/src/manifest-dev-watcher.ts` → 1 (export + definition on the same line) ✓ — plan asked for ≥2 with export as one match and declaration as another; `export async function runManifestDevCli` merges them into a single grep hit, but every functional consumer (bin + tests) resolves to the same symbol.
- `awaitWriteFinish` in `packages/mcp/src/manifest-dev-watcher.ts` → 2 matches ✓ (T-16-16)
- `MAX_PENDING_SIZE|256 \* 1024` in `packages/mcp/src/manifest-dev-watcher.ts` → 3 matches ✓ (T-16-15)
- `'y'` exact match in `packages/mcp/src/manifest-dev-watcher.ts` → 1 match ✓ (T-16-13)
- `subArgs\[0\] === 'dev'` in `packages/mcp/bin/agrune-mcp.ts` → 1 match ✓
- `manifest dev` in `packages/mcp/bin/agrune-mcp.ts` → 3 matches ✓ (usage line + Subcommands block + stderr hint)

## Deferred Issues

- **Pre-existing `runtime.spec.ts` `act는 동적으로 추가된 overlay target을 즉시 snapshot에 반영하고 실행할 수 있다` flake** — same 5 s timeout flake flagged in the 16-02 SUMMARY. Baseline (stashed) shows 253/253 pass in one run and one run of the full suite observed the failure; a subsequent retest passes. Entirely orthogonal to 16-03 (this test dynamically adds an overlay target inside the page runtime). Tracked under deferred-items for a future quality-pass plan.
- **Per-entry tsup banner** — The current global banner prepends 6 lines to every emitted JS file. That inflates the devtools-server entry's import count by 3. Acceptable cost; refactoring to per-entry banners is a tsup config polish rather than a correctness issue.
- **Multi-capture merge** — `mergeTargetIntoManifest` accepts a `PendingCaptureFile` with N targets but the watcher only ever processes one capture per pending file. If Plan 16-04 (AI skill) wants to batch-merge, the merger is ready; the watcher iterates one pending file at a time.

## Known Stubs

None. The two production paths are wired end-to-end:

- `agrune manifest dev <file>` → `runManifestDevCli` → arg validation → `new ManifestDevWatcher(...)` → `watcher.start()` → chokidar `add` → `processPending` → merger → stdout diff → stdin confirm → `writeFile(manifestPath, merged)` + `pendingStore.deletePending(pendingFile)`.
- Test harness → FakeWatcher EventEmitter → same `processPending` → `waitFor(logMarker)` → filesystem assertions.

No empty placeholder components, no hardcoded mock data.

## Threat Flags

No new surface introduced beyond the plan's `<threat_model>`. The CLI reads from `$HOME/.agrune/authoring/pending` (an existing Plan 16-02 surface) and writes to a user-supplied `.ts`/`.tsx` file (exactly the scope T-16-11 covers). All 8 threats in the register are addressed in the mitigation table above.

## User Setup Required

None. After this plan lands, the end-to-end authoring flow is:

1. `pnpm --filter @agrune/mcp run build` (automated by `prepack` on `npm publish`)
2. Terminal A: `agrune` (launches Chrome + DevTools webapp; Plan 16-02 RecorderView already wired)
3. Terminal B: `agrune manifest dev ./src/manifest.ts`
4. In DevTools: `Ctrl+Shift+R` → click element → Enter (commits pending JSON)
5. Terminal B shows diff preview; type `y` to merge into `manifest.ts`

Steps 1-5 require no manual config — all paths are convention-based.

## Next Phase Readiness

- **16-04 (AI authoring skill)** depends on `buildDefineTargetText`'s emission shape (the `defineTarget({ targetId, selector, actionKinds, sensitive? })` contract). The helper is exported from `manifest-merger.ts` and is the canonical source for "what a manifest target looks like in source code". If the AI skill wants to produce targets programmatically and let the watcher merge them, it can drop JSON into `~/.agrune/authoring/pending/` using the same `PendingCaptureFile` shape — and `agrune manifest dev` will pick them up.
- **17-remove (legacy `data-agrune-*` removal)** can now point users at the recorder + `agrune manifest dev` loop as the complete authoring replacement. Pre-16-03, the pending directory was write-only with no consumer; as of 16-03, it has a reader.

## Self-Check

- `packages/mcp/src/manifest-merger.ts` — FOUND (`mergeTargetIntoManifest`, `MergeError`, `buildDefineTargetText`)
- `packages/mcp/src/manifest-dev-watcher.ts` — FOUND (`class ManifestDevWatcher`, `runManifestDevCli`, `MAX_PENDING_SIZE`)
- `packages/mcp/tests/manifest-merger.spec.ts` — FOUND (12 tests)
- `packages/mcp/tests/manifest-dev-watcher.spec.ts` — FOUND (9 tests)
- `packages/mcp/bin/agrune-mcp.ts` — modified (`manifest dev` branch)
- `packages/mcp/tsup.config.ts` — modified (ESM banner shims)
- `packages/mcp/package.json` — modified (+ts-morph, +chokidar, +diff, +@types/diff)
- Commit `66e81d9` — FOUND (Task 1: merger + 12 tests)
- Commit `2cee509` — FOUND (Task 2: watcher + CLI + 9 tests + tsup fix)
- `pnpm --filter @agrune/mcp run test` → 144 / 144 pass
- `pnpm --filter @agrune/mcp run typecheck` → 0 errors
- `pnpm --filter @agrune/mcp run build` → dist produced, CLI runs cleanly
- `grep -c 'project\.save(' packages/mcp/src/manifest-merger.ts` → 0 (T-16-10)
- `grep -c 'awaitWriteFinish' packages/mcp/src/manifest-dev-watcher.ts` → 2 (T-16-16)

## Self-Check: PASSED

---
*Phase: 16-record*
*Completed: 2026-04-19*
