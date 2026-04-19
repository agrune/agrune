#!/usr/bin/env bash
# scripts/regression-guard/no-legacy-data-agrune.sh
# Phase 17 REMOVE — Regression guard.
# Fails CI if 'data-agrune-' appears under packages/ outside the allow-list.
#
# The allow-list lives in scripts/regression-guard/data-agrune-allowlist.txt
# and is matched line-by-line with `grep -vF` (substring — path fragments must
# be specific enough to uniquely identify the file).

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
MATCHES=$(grep -rEn 'data-agrune-' "$ROOT/packages" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.html' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=test-results --exclude-dir=playwright-report || true)

# Apply allow-list: remove lines whose path contains an allow-listed substring.
while IFS= read -r raw; do
  # Strip comment + trailing whitespace
  line="${raw%%#*}"
  # shellcheck disable=SC2001
  line="$(echo "$line" | sed -e 's/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  MATCHES=$(echo "$MATCHES" | grep -vF "$line" || true)
done < "$ALLOWLIST"

if [[ -n "$MATCHES" ]]; then
  echo "Phase 17 regression: legacy 'data-agrune-' found outside allow-list:" >&2
  echo "$MATCHES" >&2
  exit 1
fi
echo "OK - No legacy 'data-agrune-' outside allow-list."
