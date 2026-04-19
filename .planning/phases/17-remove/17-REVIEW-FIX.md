---
phase: 17-remove
fixed_at: 2026-04-19T16:52:05Z
review_path: .planning/phases/17-remove/17-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report

**Fixed at:** 2026-04-19T16:52:05Z
**Source review:** .planning/phases/17-remove/17-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 3
- Fixed: 3
- Skipped: 0

All three Warning findings (WR-01, WR-02, WR-03) were addressed. No
Critical findings were reported by the reviewer. Info findings (IN-01
through IN-05) are out of scope for this iteration; however IN-01 and
IN-02 were **incidentally resolved** by the WR-01 awk rewrite, and IN-05
partial (the "once introduced in Wave 4" stale comment hedge in
`legacy-annotated.html`) was touched in WR-03 via the configurable-true
rationale paragraph, though the fixture comment referring to Wave 4
introduction is still present. The remaining Info items (IN-03, IN-04,
IN-05 residue) are tracked for a future cleanup pass.

## Fixed Issues

### WR-01: Allow-list uses substring match, enabling trivial rename-bypass

**Files modified:** `scripts/regression-guard/no-legacy-data-agrune.sh`
**Commit:** bdaa1e3
**Applied fix:** Replaced the `grep -vF "$line"` inner filter with an
awk-based exact-equality match against the `path:` prefix of each
`grep -rEn` output line. Key design choices:
  - Switched `grep -rEn` to run with `cd "$ROOT"` and scan `'packages'`
    so paths are relative to repo root, matching the allow-list storage
    format.
  - Awk loads the allowlist in BEGIN, strips `#` comments and trailing
    whitespace (pure awk, no `sed` subshell).
  - Per input line, `sub(/:.*/, "", path)` extracts the path column and
    then `path in allow` performs set membership (exact equality only).
  - Initial attempt used escaped regex prefix anchoring in bash, but
    bash parameter expansion `${var//?/...}` treats `?` as a glob
    wildcard — turning every character into `\?`. The awk rewrite
    sidesteps that entire class of issue.

Smoke-tested the rename-bypass scenario: an allow entry of
`packages/runtime/tests/runtime.spec.ts` no longer allow-lists
`packages/runtime/tests/runtime.spec.ts.disabled`. Current tree still
passes `lint:no-legacy` with exit 0.

Bonus: this rewrite also resolves IN-01 (awk's file I/O is binary-safe
and doesn't rely on `echo` backslash-interpretation quirks) and IN-02
(no per-line `sed` subshell — awk's `sub()` is in-process).

### WR-02: `grep -vF` failure-is-success pattern swallows real errors

**Files modified:** `scripts/regression-guard/no-legacy-data-agrune.sh`
**Commit:** 961e585
**Applied fix:** Replaced both blanket `|| true` guards with explicit
exit-code inspection:
  - Outer grep: `set +e` / capture `$?` / `set -e`; treat 0 and 1 as
    normal, 2+ as fatal (permission denied, OOM, unreadable binary) —
    emit diagnostic and `exit 2`.
  - Awk filter: same pattern; plus an explicit `if (rc < 0) exit 2`
    inside awk's BEGIN block for the case where the allowlist file
    suddenly becomes unreadable between the top-of-script existence
    check and the awk getline call.

Smoke-tested: pointing awk at a nonexistent allowlist now emits
`awk: failed to read allowlist ...` and sets `rc=2`, whereas previously
the whole pipeline silently returned `rc=0` with empty output and CI
would have reported "OK - No legacy 'data-agrune-' outside allow-list."
despite having scanned nothing.

**Note on logic verification:** this is a change in error-handling
policy (fail-loud vs fail-silent) and the smoke test above demonstrates
both the happy path (no regression) and the error path (actual failure
now surfaces). Logic-wise verified.

### WR-03: `legacy-annotated.html` tamper-proof claim weaker than tested

**Files modified:**
  - `packages/e2e/tests/bootstrap-idle.spec.ts`
  - `packages/e2e/fixtures/idle-boot.html`
  - `packages/e2e/fixtures/legacy-annotated.html`

**Commit:** 3f9b58e
**Applied fix:** Selected review Option (a) — the smaller-delta rename +
documentation path:
  - Renamed the test from `__agrune_runtime_state__ is tamper-proof
    (writable:false)` to `__agrune_runtime_state__ resists direct
    reassignment (writable:false)` — phrasing now matches what the
    assertion actually proves.
  - Added a scope-note comment in the test body explaining (1) the
    sloppy-mode write-silence caveat and (2) that the meaningful
    regression guarded against is a future runtime change that drops
    the `Object.defineProperty` wrapper entirely.
  - In both fixture HTML files, annotated the `Object.defineProperty`
    call to document that `configurable: true` is intentional (so
    Playwright can reload and re-run the install block without a
    TypeError on the redefine), and that the threat model treats
    fixtures as repo-controlled.

No runtime behavior change. Option (b) — strict-mode reassignment with
delete+reassign probing and `configurable: false` — was declined because
it would change fixture semantics (re-install would TypeError on page
reload) and the review explicitly flagged option (a) as the smaller
delta that matches existing intent.

TypeScript check: `pnpm --filter @agrune/e2e exec tsc --noEmit` exits 0.

## Skipped Issues

None — all three Warning findings were fixed successfully.

---

_Fixed: 2026-04-19T16:52:05Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
