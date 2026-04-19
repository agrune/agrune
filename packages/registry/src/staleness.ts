/**
 * Staleness classifier for registry-cached manifests.
 *
 * Governance contract (REGISTRY_GOVERNANCE.md — Plan 03 owns the prose,
 * this module owns the numeric thresholds):
 *   - fresh:         age < 7 days
 *   - week_old:      7 <= age < 28 days  (info-level in `doctor`)
 *   - stale:         28 <= age < 56 days (warn-level, auto-disable suggested)
 *   - auto_disabled: age >= 56 days OR entry has `disabled` marker (revoked/user/stale)
 *
 * Pitfall 5 (thrashing): a single week's latency does not trip stale; we
 * require the entry to sit past the 28-day line. Two-strike registry health
 * check is orthogonal and lives in the PR bot (Plan 04).
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const STALENESS_THRESHOLDS = {
  weekMs: 7 * DAY_MS,
  staleMs: 28 * DAY_MS,
  autoDisableMs: 56 * DAY_MS,
} as const

export type StalenessState = 'fresh' | 'week_old' | 'stale' | 'auto_disabled'

/**
 * Minimal input shape — intentionally loose so callers can pass either a
 * full `LockfileEntry` or a constructed subset (e.g. in tests / PR bot).
 */
export interface StalenessInput {
  fetchedAt: string
  disabled?: { reason: 'stale' | 'revoked' | 'user'; at: string }
}

export function classifyStaleness(
  entry: StalenessInput,
  now: Date = new Date(),
): StalenessState {
  if (entry.disabled) return 'auto_disabled'
  const age = now.getTime() - new Date(entry.fetchedAt).getTime()
  if (age < STALENESS_THRESHOLDS.weekMs) return 'fresh'
  if (age < STALENESS_THRESHOLDS.staleMs) return 'week_old'
  if (age < STALENESS_THRESHOLDS.autoDisableMs) return 'stale'
  return 'auto_disabled'
}
