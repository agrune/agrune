#!/usr/bin/env bash
# scripts/regression-guard/no-legacy-data-agrune.sh
# Phase 17 REMOVE — Regression guard.
# Fails CI if 'data-agrune-' appears under packages/ outside the allow-list.
#
# The allow-list lives in scripts/regression-guard/data-agrune-allowlist.txt
# and is matched line-by-line as an anchored path prefix: each entry must be
# the exact path (relative to repo root) of the allow-listed file, and the
# matcher checks that `grep -rEn` output lines begin with `<allow-entry>:`.
# Substring matches used to be accepted but were tightened in Phase 17 review
# (WR-01) to prevent trivial rename-bypass (e.g. `foo.ts.disabled` sneaking
# through an allow entry of `foo.ts`).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ALLOWLIST="$ROOT/scripts/regression-guard/data-agrune-allowlist.txt"

if [[ ! -f "$ALLOWLIST" ]]; then
  echo "ERROR: allow-list not found at $ALLOWLIST" >&2
  exit 2
fi

# Scan packages/ for any occurrence of 'data-agrune-'.
# Excluded dirs: node_modules / dist (build artifacts) / test-results,
# playwright-report (playwright runtime output — already gitignored).
# `cd "$ROOT"` so grep emits *relative* paths (`packages/...`) that match
# the allow-list entries, which are also stored relative to repo root.
#
# grep exit codes: 0 = match, 1 = no match, 2+ = real error (permission
# denied, unreadable binary, OOM, etc). WR-02 review: the previous
# `|| true` swallowed `2+` errors and silently turned a malfunctioning
# scan into "no matches" → false-OK in CI. Distinguish the cases.
set +e
MATCHES=$(cd "$ROOT" && grep -rEn 'data-agrune-' 'packages' \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.html' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=test-results --exclude-dir=playwright-report)
grep_rc=$?
set -e
if [[ $grep_rc -gt 1 ]]; then
  echo "ERROR: grep failed with exit $grep_rc while scanning $ROOT/packages" >&2
  exit 2
fi

# Apply allow-list using awk (exact path-prefix match, anchored by ':').
# awk handles arbitrary path characters without the regex-metacharacter
# escape hazards of `grep -E` + bash parameter expansion (notably `?` and
# `*` inside `${var//pat/repl}` are bash globs, not literals).
#
# WR-02 hardening: surface awk and printf pipeline failures through
# `pipefail` — no `|| true` here on purpose. If awk exits non-zero
# (allowlist open failed, malformed input, etc.), the script must fail.
set +e
MATCHES=$(printf '%s\n' "$MATCHES" | awk -v allowlist="$ALLOWLIST" '
  BEGIN {
    allow_count = 0
    while ((rc = (getline l < allowlist)) > 0) {
      sub(/#.*$/, "", l)
      sub(/[[:space:]]+$/, "", l)
      if (l != "") { allow[l] = 1; allow_count++ }
    }
    if (rc < 0) {
      print "awk: failed to read allowlist " allowlist > "/dev/stderr"
      exit 2
    }
    close(allowlist)
  }
  {
    # Expect lines of the form "<path>:<line-no>:<content>"
    path = $0
    sub(/:.*/, "", path)
    if (!(path in allow)) print
  }
')
awk_rc=$?
set -e
if [[ $awk_rc -ne 0 ]]; then
  echo "ERROR: allow-list filter (awk) failed with exit $awk_rc" >&2
  exit 2
fi

if [[ -n "$MATCHES" ]]; then
  echo "Phase 17 regression: legacy 'data-agrune-' found outside allow-list:" >&2
  echo "$MATCHES" >&2
  exit 1
fi
echo "OK - No legacy 'data-agrune-' outside allow-list."
