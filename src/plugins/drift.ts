// Manifest-drift detection plugin (SPEC §8.6). Pure analysis over the PageSnapshot the core
// ALREADY builds — no extra DOM work (every PageTarget already carries `domResolved`). Detects
// "the manifest looks stale for THIS screen" so the agent can fall back to the a11y escape hatch
// instead of thrashing on dead targets.
//
// Anchoring (the false-positive guard): the manifest covers the WHOLE app, but any one screen
// realizes only a slice — so most targets being absent is NORMAL, not drift. A group is only
// judged when it is ENGAGED (>=1 of its direct targets still resolves → we are demonstrably on
// its screen). An engaged group whose targets have LARGELY vanished is real drift.
//
// Limitation (honest): a TOTAL wipe (0 resolved) of a routed group is indistinguishable from
// "not on this screen" without a route anchor, so it is not flagged here. Partial drift — the
// common, recoverable case — is caught.
//
// Detection is algorithmic; the DECISION to act is the agent's. The core surfaces the report
// (and, on confirmed drift, the scoped escape-hatch a11y); it never silently rewrites anything.

import type { PageSnapshot, PageTarget } from '../snapshot.js'

export interface GroupDrift {
  groupId: string
  groupName?: string
  total: number
  resolved: number
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

export function detectManifestDrift(snapshot: PageSnapshot, options: DriftOptions = {}): DriftReport {
  const opts = { ...DEFAULTS, ...options }
  const drifted: GroupDrift[] = []

  for (const group of snapshot.groups) {
    const direct = directTargetsOf(snapshot, group.groupId)
    const total = direct.length
    if (total < opts.minTargets) continue

    const resolved = direct.filter((t) => t.domResolved === true).length
    // Anchor: not engaged (we are simply not on this screen) → no signal.
    if (resolved === 0) continue

    const missing = total - resolved
    const ratio = missing / total
    if (ratio < opts.ratioThreshold) continue

    drifted.push({
      groupId: group.groupId,
      groupName: group.groupName,
      total,
      resolved,
      missing,
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

/** Human/agent-facing notice appended to the `targets` text output when drift is confirmed. */
export function formatDriftNotice(report: DriftReport, ariaFallback?: string): string {
  if (!report.drifted) return ''
  const lines: string[] = [
    '⚠ MANIFEST DRIFT — the page no longer matches the manifest on this screen.',
  ]
  for (const g of report.groups) {
    const pct = Math.round(g.ratio * 100)
    lines.push(`  group "${g.groupName ?? g.groupId}" (${g.groupId}): ${g.missing}/${g.total} declared targets unresolved (${pct}%)`)
    if (g.missingTargetIds.length > 0) {
      lines.push(`    missing: ${g.missingTargetIds.join(', ')}`)
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
