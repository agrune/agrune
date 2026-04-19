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
MATCHES=$(cd "$ROOT" && grep -rEn 'data-agrune-' 'packages' \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.html' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=test-results --exclude-dir=playwright-report || true)

# Apply allow-list using awk (exact path-prefix match, anchored by ':').
# awk handles arbitrary path characters without the regex-metacharacter
# escape hazards of `grep -E` + bash parameter expansion (notably `?` and
# `*` inside `${var//pat/repl}` are bash globs, not literals).
MATCHES=$(printf '%s\n' "$MATCHES" | awk -v allowlist="$ALLOWLIST" '
  BEGIN {
    while ((getline l < allowlist) > 0) {
      sub(/#.*$/, "", l)
      sub(/[[:space:]]+$/, "", l)
      if (l != "") allow[l] = 1
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

if [[ -n "$MATCHES" ]]; then
  echo "Phase 17 regression: legacy 'data-agrune-' found outside allow-list:" >&2
  echo "$MATCHES" >&2
  exit 1
fi
echo "OK - No legacy 'data-agrune-' outside allow-list."
