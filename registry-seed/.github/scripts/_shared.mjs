// registry-seed/.github/scripts/_shared.mjs
//
// Shared helpers for the pr-bot + health-check scripts. Keeping these in a
// single module avoids drift between the PR-time validation (pr-bot) and the
// runtime defense-in-depth re-check (health-check). WR-05 (review 18) made
// the duplication explicit.

/**
 * Return true iff `hostname` is a private, loopback, or link-local address
 * that we must never fetch from in CI. Conservative by design — unknown /
 * empty values are treated as private.
 */
export function isPrivateHost(hostname) {
  if (!hostname) return true
  if (hostname === 'localhost') return true
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return true
  if (/^10\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
  if (/^127\./.test(hostname)) return true
  return false
}

/**
 * Defense-in-depth seedUrl check used at two moments:
 *   1. pr-bot.mjs — before merge, reject non-https / private-host manifests.
 *   2. health-check.mjs — at runtime, refuse to Playwright-goto a URL that
 *      fails the same invariant even if it already lives in `main`.
 *
 * Returns `true` only when the URL is a well-formed https URL pointing at a
 * public host; any parse failure or category mismatch returns false.
 */
export function isSafeSeedUrl(u) {
  if (typeof u !== 'string' || u.length === 0) return false
  let parsed
  try {
    parsed = new URL(u)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (isPrivateHost(parsed.hostname)) return false
  return true
}
