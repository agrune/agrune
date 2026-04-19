---
phase: 17-remove
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - packages/e2e/tests/user-flow/helpers.ts
  - packages/e2e/fixtures/idle-boot.html
  - packages/e2e/fixtures/legacy-annotated.html
  - packages/e2e/tests/bootstrap-idle.spec.ts
  - packages/e2e/tests/annotation-scan.spec.ts
  - scripts/regression-guard/no-legacy-data-agrune.sh
  - scripts/regression-guard/data-agrune-allowlist.txt
  - package.json
  - .github/workflows/ci.yml
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 17 REMOVE wave landed cleanly — the legacy `data-agrune-*` runtime scan path is gone,
fixtures were inverted into regression-proof harnesses (`legacy-annotated.html` now asserts
the runtime *ignores* the bait), and a new `lint:no-legacy` CI guard replaces `lint:annotations`.
`bash scripts/regression-guard/no-legacy-data-agrune.sh` exits 0 on the current tree and the
CI job wires the step into `build-test` correctly.

No Critical security findings. The issues found fall into two buckets:

1. **Shell regression-guard script** has soft edges around allow-list matching semantics
   (substring match, comment-stripping via `sed`, and the `grep -vF` failure-is-success
   pattern) that could mask future regressions or allow-list bypasses if an attacker renamed
   a file to include an allow-listed substring. Not exploitable today, but worth hardening.

2. **E2E fixture / spec symmetry** — the inverted `legacy-annotated.html` semantics are
   correct, but the fixture + spec pair uses `Object.defineProperty(..., writable: false)`
   which behaves differently in strict vs. sloppy mode; the tamper-proof test comments
   acknowledge this but the fixture itself is loaded as a classic `<script>` tag (sloppy
   mode) which means the "tamper-proof" claim is weaker than the test implies.

3. **CI wiring is correct** — no issues with `.github/workflows/ci.yml`. The `lint:no-legacy`
   step runs in `build-test`, which `e2e` depends on via `needs:`, so a regression blocks PRs.

4. **`package.json`** — `lint:annotations` fully removed, no orphaned references in
   scripts. README/AGENTS docs already rephrased (confirmed out-of-scope for this review
   but cross-referenced during triage).

## Warnings

### WR-01: Allow-list uses substring match, enabling trivial rename-bypass

**File:** `scripts/regression-guard/no-legacy-data-agrune.sh:29-36`
**Issue:** The allow-list is applied with `grep -vF "$line"` against `path:line:content`
output from the outer `grep -rEn`. Because `grep -F` is a *substring* match (not anchored
or path-aware), an allow-list entry like `packages/runtime/tests/runtime.spec.ts` also
allowlists any path that *contains* that substring — e.g. a hypothetical
`packages/runtime/tests/runtime.spec.ts.bak`, `runtime.spec.ts.disabled`, or
`packages/runtime/tests/runtime.spec.ts.new`. Verified with smoke test:

```
MATCHES='packages/runtime/tests/runtime.spec.ts.disabled:5:data-agrune-action
packages/runtime/tests/other.spec.ts:10:data-agrune-action'
ALLOW='packages/runtime/tests/runtime.spec.ts'
echo "$MATCHES" | grep -vF "$ALLOW"
# -> only 'packages/runtime/tests/other.spec.ts:10:...' survives
# the .disabled file was silently allow-listed
```

The comment at the top of the script (`substring — path fragments must be specific enough
to uniquely identify the file`) acknowledges this, but it is a reviewer-enforced invariant,
not a tool-enforced one. A malicious or careless PR could revive legacy code under a
slightly-renamed filename and the guard would pass.

**Fix:** Anchor allow-list entries to the start of the `path:line:content` line so only
exact path prefixes match. Replace the inner filter loop with:

```bash
while IFS= read -r raw; do
  line="${raw%%#*}"
  line="${line%"${line##*[![:space:]]}"}"   # trim trailing whitespace, no subshell
  [[ -z "$line" ]] && continue
  # Anchor: match only when the line STARTS with the allowlist entry followed by ':'
  MATCHES=$(printf '%s\n' "$MATCHES" | grep -vE "^${line//./\\.}:" || true)
done < "$ALLOWLIST"
```

Or — simpler and robust — use `awk` with an exact-prefix check:

```bash
MATCHES=$(printf '%s\n' "$MATCHES" | awk -v allowlist="$ALLOWLIST" '
  BEGIN {
    while ((getline l < allowlist) > 0) {
      sub(/#.*$/, "", l); sub(/[[:space:]]+$/, "", l)
      if (l != "") allow[l] = 1
    }
  }
  { path = $0; sub(/:.*/, "", path); if (!(path in allow)) print }
')
```

The anchor-plus-colon variant is the minimum viable fix.

---

### WR-02: `grep -vF` failure-is-success pattern swallows real errors

**File:** `scripts/regression-guard/no-legacy-data-agrune.sh:23-35`
**Issue:** Both the outer `grep -rEn ... || true` and the inner `grep -vF "$line" || true`
convert *any* non-zero exit — including grep failures caused by unreadable files, out-of-memory,
or genuine grep runtime errors — into a silent "no matches found." Under `set -euo pipefail`
the `|| true` suppresses real failure modes, not just the "no matches" exit-1.

Concretely, if a future refactor introduces a filename with binary content that grep rejects,
or if `grep -rEn` hits a permission-denied directory under `packages/`, the guard exits 0
and CI passes despite having scanned nothing. The current tree is clean, but the script is
the canonical Phase 17 drift detector — it must fail loudly on malfunction, not silently
on false success.

**Fix:** Distinguish grep's three exit codes (0 = match, 1 = no match, 2+ = error). Use:

```bash
set +e
MATCHES=$(grep -rEn 'data-agrune-' "$ROOT/packages" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.html' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=test-results --exclude-dir=playwright-report)
rc=$?
set -e
if [[ $rc -gt 1 ]]; then
  echo "ERROR: grep failed with exit $rc while scanning $ROOT/packages" >&2
  exit 2
fi
```

Apply the same pattern to the inner loop filter. This preserves CI's fail-closed posture
while keeping the existing output format.

---

### WR-03: `legacy-annotated.html` tamper-proof claim weaker than tested

**File:** `packages/e2e/fixtures/legacy-annotated.html:49-58`, `packages/e2e/tests/bootstrap-idle.spec.ts:56-75`
**Issue:** Both `idle-boot.html` and `legacy-annotated.html` publish `__agrune_runtime_state__`
via `Object.defineProperty(window, '__agrune_runtime_state__', { writable: false, configurable: true, ... })`.
The spec `__agrune_runtime_state__ is tamper-proof (writable:false)` then attempts reassignment
and expects the value to be unchanged.

Two problems:

1. The assignment `window.__agrune_runtime_state__ = {...}` in the spec's `page.evaluate()`
   runs in **sloppy mode** by default (classic script eval context). Sloppy mode
   *silently ignores* writes to non-writable properties — it does not throw. So the spec
   passes today, but the only thing being verified is "assignment did nothing," which is
   true even if the property was `writable: true` and the author tried to write the same
   value shape. The test would only *meaningfully* fail if a future regression dropped the
   `Object.defineProperty` wrapper entirely.

2. `configurable: true` means a determined attacker can `delete window.__agrune_runtime_state__`
   and then reassign. The fixture comment advertises "tamper-proof" but the property is
   configurable.

Neither issue is exploitable in the v1 threat model (fixtures are under repo control), but
the test name overpromises relative to what it verifies.

**Fix:** Either (a) rename the test to something narrower like
`'__agrune_runtime_state__ resists direct reassignment (writable:false)'` and note in the
fixture that `configurable: true` is intentional for re-run in Playwright, or (b) tighten
the property to `writable: false, configurable: false` and add a delete+reassign attempt
to the spec:

```ts
const tamperResult = await page.evaluate(() => {
  const before = window.__agrune_runtime_state__
  let assignThrew = false
  try {
    'use strict'
    ;(window as any).__agrune_runtime_state__ = { source: 'window' }
  } catch { assignThrew = true }
  let deleteSucceeded = false
  try { deleteSucceeded = delete (window as any).__agrune_runtime_state__ } catch {}
  const after = window.__agrune_runtime_state__
  return { beforeSource: before?.source, afterSource: after?.source, assignThrew, deleteSucceeded }
})
expect(tamperResult.afterSource).toBe('idle')
expect(tamperResult.deleteSucceeded).toBe(false)
```

Option (a) is the smaller delta and matches existing intent. Pick one.

---

## Info

### IN-01: `echo "$MATCHES" | grep -vF` mangles backslash-containing filenames

**File:** `scripts/regression-guard/no-legacy-data-agrune.sh:35`
**Issue:** Using `echo` instead of `printf '%s\n'` to pipe `$MATCHES` into `grep` means
that on systems where `echo` interprets backslash escapes (bash's `xpg_echo` shopt, some
sh variants), a path or line containing `\n` literally would be corrupted. Not an issue
on macOS/Linux bash defaults, but a robustness nit. `printf '%s\n' "$MATCHES"` is portable.

**Fix:** Replace both `echo "$MATCHES"` sites with `printf '%s\n' "$MATCHES"`.

---

### IN-02: `sed` subshell for trailing-whitespace strip is slow/noisy

**File:** `scripts/regression-guard/no-legacy-data-agrune.sh:33`
**Issue:** The comment-strip logic spawns a `sed` subshell per allow-list line
(27 entries × one `sed` each). The ShellCheck disable on L32 (`SC2001`) is required because
bash native parameter expansion would suffice.

**Fix:** Replace with pure bash:
```bash
line="${line%"${line##*[![:space:]]}"}"
```
Zero subshells, zero ShellCheck disable.

---

### IN-03: `annotation-scan.spec.ts` file name is now misleading

**File:** `packages/e2e/tests/annotation-scan.spec.ts:1-71`
**Issue:** The spec is named `annotation-scan.spec.ts` and the `describe` block is
`fixture DOM hooks — real browser (legacy attribute allow-list)`. Post-Phase 17 this file
no longer tests "annotation scanning" — it tests "fixture DOM hooks where `data-agrune-*`
is used as a `data-testid` equivalent." The header comment (L1-10) explains this, but the
filename is a trap for future maintainers searching for the removed scan logic.

The allow-list (`data-agrune-allowlist.txt:61`) pins the current filename, so a rename
requires coordinating both files. The 17-02 summary explicitly preserves the filename to
avoid allow-list churn, which is a reasonable tradeoff — but the tradeoff deserves a visible
TODO so Phase 18+ cleanup can reconsider.

**Fix:** Add a `// TODO(phase-18): rename to fixture-dom-hooks.spec.ts after allowlist refresh`
comment at the top of the spec, or rename now and update the allow-list entry in the same
commit. No runtime impact either way.

---

### IN-04: `helpers.ts` inline `BOOTSTRAP_SOURCE` duplicates production bootstrap

**File:** `packages/e2e/tests/user-flow/helpers.ts:324-406`
**Issue:** The 80-line `BOOTSTRAP_SOURCE` template literal is flagged in its own comment
(L311-323) as "functional equivalent of `buildBootstrapSource()` in `cdp-runtime-injector.ts`."
This is intentional duplication per the comment rationale (launch-mode `var` quirk), but
nothing in CI enforces that the two bootstraps stay in drift-free sync. If the production
bootstrap adds a new behaviour (e.g., a new event listener, a new snapshot shape), the E2E
helper continues to test the old shape and never fails loudly.

**Fix:** Consider extracting the shared portion (runtime install + snapshot post) to a
string-valued export in `@agrune/browser` that both `cdp-runtime-injector.ts` and this
helper import. Out-of-scope for Phase 17 cleanup, but worth tracking as tech debt.

---

### IN-05: Allow-list comment cross-reference is stale

**File:** `scripts/regression-guard/data-agrune-allowlist.txt:24`
**Issue:** The allow-list header (L22-23) says "Allow-listed in
scripts/regression-guard/data-agrune-allowlist.txt **once introduced in Wave 4**" — but
the allow-list file *is* Wave 4's output and the entries are already listed below. This
hedge language predates the wave's completion; keep it accurate.

Also L48 references `runtime-ignores-legacy.spec.ts` which is in the allow-list but I could
not locate the actual file in the repo via the scope check (may exist outside the reviewed
file set, but worth a sanity check since an allow-list entry that matches no file is dead
weight).

**Fix:** Remove "once introduced in Wave 4" from comments now that the list exists. Run
`comm -23 <(cat data-agrune-allowlist.txt | sort -u | grep -v ^#) <(find packages -type f | sort -u)`
periodically to detect dead allow-list entries.

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
