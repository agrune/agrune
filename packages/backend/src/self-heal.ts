// Self-healing target re-grounding.
//
// When a manifest target is declared but its selector ladder no longer resolves
// to any element (drift), the manifest still carries the author's *intent*
// (intended role + accessible name + human label). That intent is the
// ground-truth a safe repair can lean on — the part that selector-only healers
// in the QA space lack.
//
// This module is the PURE core: given the declared target and the elements
// observed on the page, it ranks repair candidates and decides whether a repair
// is safe to APPLY automatically (single, high-confidence, non-sensitive) or
// should only be PROPOSED to the agent. The page scan that produces
// `ObservedElement[]` lives in the session (impure) and is intentionally thin.

import type { ManifestTarget, SelectorLadder } from '@agrune/manifest'

/** An interactive element observed on the live page during a repair scan. */
export interface ObservedElement {
  /** Index within the scan locator (used to re-select via `locator.nth(index)`). */
  index: number
  role?: string
  accessibleName?: string
  text?: string
}

/** The author's declared intent, distilled from a drifted manifest target. */
export interface RepairIntent {
  role?: string
  /** Accessible name the author encoded as `selector.role.level`. */
  accessibleName?: string
  /** Visible text the author encoded as `selector.text`. */
  text?: string
  /** Human label (`target.name`). */
  label?: string
  /** Human description (`target.desc`). */
  desc?: string
}

export interface RepairCandidate {
  index: number
  /** 0..1 confidence the observed element is the drifted target. */
  score: number
  matchedOn: string[]
  /** Selector ladder that would re-ground this target (the proposed manifest patch). */
  proposedSelector: SelectorLadder
  observed: ObservedElement
}

export type RepairDecision = 'auto' | 'propose' | 'none'

export interface RepairOutcome {
  decision: RepairDecision
  best: RepairCandidate | null
  candidates: RepairCandidate[]
  reason: string
}

export interface RepairOptions {
  /** Min score for the top candidate to be auto-applied. */
  autoThreshold?: number
  /** Min score to be surfaced as a proposal. */
  proposeThreshold?: number
  /** Max proposals to return. */
  maxCandidates?: number
  /** The top candidate must beat the runner-up by this margin to auto-apply. */
  marginForAuto?: number
  /** Master switch for auto-apply. */
  allowAuto?: boolean
  /** Sensitive targets are never auto-applied — only proposed. */
  sensitive?: boolean
}

const DEFAULTS = {
  autoThreshold: 0.82,
  proposeThreshold: 0.5,
  maxCandidates: 5,
  marginForAuto: 0.12,
  allowAuto: true,
  sensitive: false,
}

/** Distill the author's intent from a (drifted) manifest target. */
export function intentFromTarget(target: ManifestTarget): RepairIntent {
  return {
    role: target.selector.role?.name,
    accessibleName: target.selector.role?.level,
    text: target.selector.text,
    label: target.name,
    desc: target.desc,
  }
}

function normalize(value: string | undefined | null): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenize(value: string): string[] {
  return normalize(value).split(' ').filter(Boolean)
}

/** String similarity in [0,1]: exact, containment, then Jaccard token overlap. */
export function similarity(a: string | undefined, b: string | undefined): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const ta = new Set(tokenize(na))
  const tb = new Set(tokenize(nb))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

function rolesMatch(a: string | undefined, b: string | undefined): boolean {
  return normalize(a).length > 0 && normalize(a) === normalize(b)
}

/** Best name similarity of an observed element against every intent name signal. */
function nameSimilarity(intent: RepairIntent, observed: ObservedElement): number {
  const signals = [intent.accessibleName, intent.text, intent.label, intent.desc]
  const observedNames = [observed.accessibleName, observed.text]
  let best = 0
  for (const s of signals) {
    for (const o of observedNames) {
      best = Math.max(best, similarity(s, o))
    }
  }
  return best
}

function proposedSelectorFromObserved(observed: ObservedElement): SelectorLadder {
  if (observed.role && observed.accessibleName) {
    return { role: { name: observed.role, level: observed.accessibleName } }
  }
  if (observed.accessibleName || observed.text) {
    return { text: (observed.accessibleName || observed.text) as string }
  }
  if (observed.role) {
    return { role: { name: observed.role } }
  }
  // Should not happen for a real element; keep the ladder non-empty.
  return { text: '' }
}

function scoreCandidate(intent: RepairIntent, observed: ObservedElement): { score: number; matchedOn: string[] } {
  const matchedOn: string[] = []
  const nameSim = nameSimilarity(intent, observed)
  const hasRoleIntent = Boolean(normalize(intent.role))

  let score: number
  if (hasRoleIntent) {
    const roleMatch = rolesMatch(intent.role, observed.role)
    if (roleMatch) matchedOn.push('role')
    // Name dominates (0.6) over role (0.4): a same-role element with an unrelated
    // name must NOT clear the propose floor, and a role mismatch caps the score
    // so we never auto-jump to a different kind of control.
    score = (roleMatch ? 0.4 : 0) + 0.6 * nameSim
  } else {
    // No role intent: lean entirely on name similarity.
    score = nameSim
  }
  if (nameSim >= 0.6) matchedOn.push('name')
  return { score: Math.round(score * 1000) / 1000, matchedOn }
}

/**
 * Rank repair candidates for a drifted target and decide whether a repair is
 * safe to auto-apply. Pure — no page access.
 */
export function rankRepairCandidates(
  target: ManifestTarget,
  observed: ObservedElement[],
  options: RepairOptions = {},
): RepairOutcome {
  const opts = { ...DEFAULTS, ...options }
  // A sensitive target is never auto-applied. The flag is taken from the target
  // itself unless the caller explicitly overrides it.
  const sensitive = options.sensitive ?? Boolean(target.sensitive)
  const intent = intentFromTarget(target)

  const scored: RepairCandidate[] = observed
    .map(o => {
      const { score, matchedOn } = scoreCandidate(intent, o)
      return { index: o.index, score, matchedOn, proposedSelector: proposedSelectorFromObserved(o), observed: o }
    })
    .filter(c => c.score >= opts.proposeThreshold)
    .sort((a, b) => b.score - a.score)

  const candidates = scored.slice(0, opts.maxCandidates)

  if (candidates.length === 0) {
    return { decision: 'none', best: null, candidates: [], reason: 'no candidate scored above the propose threshold' }
  }

  const best = candidates[0]
  const runnerUp = candidates[1]
  const unambiguous = !runnerUp || best.score - runnerUp.score >= opts.marginForAuto

  if (sensitive) {
    return { decision: 'propose', best, candidates, reason: 'sensitive target — repair proposed, never auto-applied' }
  }
  if (!opts.allowAuto) {
    return { decision: 'propose', best, candidates, reason: 'auto-apply disabled — repair proposed' }
  }
  if (best.score >= opts.autoThreshold && unambiguous) {
    return {
      decision: 'auto',
      best,
      candidates,
      reason: `single high-confidence match (score ${best.score}${runnerUp ? `, margin ${Math.round((best.score - runnerUp.score) * 1000) / 1000}` : ''})`,
    }
  }
  return {
    decision: 'propose',
    best,
    candidates,
    reason: runnerUp && best.score - runnerUp.score < opts.marginForAuto
      ? `ambiguous: top two candidates within ${opts.marginForAuto}`
      : `top score ${best.score} below auto threshold ${opts.autoThreshold}`,
  }
}

/** Compact, log/return-friendly view of an outcome for error details. */
export function serializeRepairOutcome(outcome: RepairOutcome): Record<string, unknown> {
  return {
    decision: outcome.decision,
    reason: outcome.reason,
    candidates: outcome.candidates.map(c => ({
      score: c.score,
      matchedOn: c.matchedOn,
      name: c.observed.accessibleName || c.observed.text || '',
      proposedSelector: c.proposedSelector,
    })),
  }
}
