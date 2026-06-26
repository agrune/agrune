// Manifest-drift detection plugin (SPEC §8.6). Pure analysis over the PageSnapshot the core
// ALREADY builds — no extra DOM work (every PageTarget already carries `domResolved`). Detects
// "the manifest looks stale for THIS screen" so the agent can fall back to the a11y escape hatch
// instead of thrashing on dead targets.
//
// Drift = REGRESSION from a high-water-mark, not merely a low ratio. The manifest covers the
// WHOLE app, but any one screen — and any one step of a multi-step UI — realizes only a slice,
// so a high "unresolved share" is NORMAL (e.g. a wizard on step 1 has steps 2-3 absent). Flagging
// on raw ratio false-fires on every wizard/accordion/tab. Instead we compare against the most
// targets this group has EVER resolved on this screen (its baseline): a genuine app change makes
// a group that USED to resolve N targets suddenly resolve far fewer. A progressive UI never had a
// high baseline, so it never trips. The session owns the per-(url,group) baseline; this module is
// pure and receives it.
//
// Limitations (honest): drift is detected as a WITHIN-history regression — a group seen broken on
// its very first read has no healthy baseline to fall from, so it isn't flagged here (the agent
// discovers that via a failing action instead). A TOTAL wipe (0 resolved) reads as "left the
// screen" and is skipped.
//
// Detection is algorithmic; the DECISION to act is the agent's. The core surfaces the report
// (and, on confirmed drift, the scoped escape-hatch a11y); it never silently rewrites anything.

import type { PageSnapshot, PageTarget } from '../snapshot.js'

export interface GroupDrift {
  groupId: string
  groupName?: string
  total: number
  resolved: number
  /** Peak resolved-count previously seen for this group on this screen — what it regressed from. */
  baseline: number
  missing: number
  ratio: number
  missingTargetIds: string[]
}

export interface DriftReport {
  drifted: boolean
  groups: GroupDrift[]
  worstRatio: number
}

export interface DriftOptions {
  /** Ignore groups with fewer direct targets than this — too small to judge confidently. */
  minTargets?: number
  /** Flag a group when this fraction of its direct targets is unresolved. */
  ratioThreshold?: number
  /** Cap the listed missing targetIds per group. */
  maxMissingListed?: number
}

const DEFAULTS = {
  minTargets: 3,
  ratioThreshold: 0.5,
  maxMissingListed: 8,
}

/** Direct (non-repeat) targets of a group: repeat instances are dynamic list rows, never "missing". */
function directTargetsOf(snapshot: PageSnapshot, groupId: string): PageTarget[] {
  return snapshot.targets.filter((t) => t.groupId === groupId && !t.repeatInstance)
}

/**
 * @param baseline per-group peak resolved-count previously seen ON THIS SCREEN (keyed by groupId).
 *   The session keys its store by url and passes the slice for the current url. Omit it (or pass
 *   an empty map) and nothing is flagged — drift is a fall FROM a known-healthy peak, and with no
 *   history every group is at its own peak.
 */
export function detectManifestDrift(
  snapshot: PageSnapshot,
  baseline?: Map<string, number>,
  options: DriftOptions = {},
): DriftReport {
  const opts = { ...DEFAULTS, ...options }
  const drifted: GroupDrift[] = []

  for (const group of snapshot.groups) {
    const direct = directTargetsOf(snapshot, group.groupId)
    const total = direct.length
    if (total < opts.minTargets) continue

    const resolved = direct.filter((t) => t.domResolved === true).length
    // Not engaged (we simply aren't on this screen / it's fully gone) → no signal.
    if (resolved === 0) continue

    // High-water-mark: the most this group has resolved here, including now. A first sighting
    // has prior === resolved, so it can never look like a regression — that's what stops wizards
    // (which never resolve all their steps at once) from false-firing.
    const prior = Math.max(baseline?.get(group.groupId) ?? 0, resolved)
    if (prior < opts.minTargets) continue
    // Drift = resolved fell to <= (1 - threshold) of the peak. With prior === resolved this is
    // resolved <= resolved/2, i.e. false → no flag.
    if (resolved > prior * (1 - opts.ratioThreshold)) continue

    const ratio = (prior - resolved) / prior
    drifted.push({
      groupId: group.groupId,
      groupName: group.groupName,
      total,
      resolved,
      baseline: prior,
      missing: prior - resolved,
      ratio: Math.round(ratio * 1000) / 1000,
      missingTargetIds: direct
        .filter((t) => t.domResolved !== true)
        .map((t) => t.targetId)
        .slice(0, opts.maxMissingListed),
    })
  }

  drifted.sort((a, b) => b.ratio - a.ratio)
  return {
    drifted: drifted.length > 0,
    groups: drifted,
    worstRatio: drifted.length > 0 ? drifted[0]!.ratio : 0,
  }
}

/** Update a per-(url,group) baseline store with the resolved counts from a fresh snapshot.
 * The session calls this each snapshot so the high-water-mark tracks the healthiest state seen. */
export function updateDriftBaseline(
  snapshot: PageSnapshot,
  store: Map<string, number>,
  keyFor: (groupId: string) => string,
): void {
  for (const group of snapshot.groups) {
    const resolved = directTargetsOf(snapshot, group.groupId).filter((t) => t.domResolved === true).length
    if (resolved === 0) continue
    const key = keyFor(group.groupId)
    if (resolved > (store.get(key) ?? 0)) store.set(key, resolved)
  }
}

/** Human/agent-facing notice appended to the `targets` text output when drift is confirmed. */
export function formatDriftNotice(report: DriftReport, ariaFallback?: string): string {
  if (!report.drifted) return ''
  const lines: string[] = [
    '⚠ MANIFEST DRIFT — the page no longer matches the manifest on this screen.',
  ]
  for (const g of report.groups) {
    const pct = Math.round(g.ratio * 100)
    lines.push(`  group "${g.groupName ?? g.groupId}" (${g.groupId}): now resolves ${g.resolved}/${g.total} targets, down from ${g.baseline} seen earlier on this screen (${pct}% drop)`)
    if (g.missingTargetIds.length > 0) {
      lines.push(`    no longer resolving: ${g.missingTargetIds.join(', ')}`)
    }
  }
  if (ariaFallback) {
    lines.push('Re-orient from the live a11y snapshot below — the manifest targets above are likely stale.')
    lines.push('')
    lines.push('----- a11y fallback (full page) -----')
    lines.push(ariaFallback)
  } else {
    lines.push('Call `agrune snapshot` to re-orient from the live a11y tree — the manifest targets above are likely stale.')
  }
  return lines.join('\n')
}
