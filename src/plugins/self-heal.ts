// Self-heal plugin (SPEC §8.1). OFF by default — the core resolver works with this ABSENT
// (A.0.4): the `repair` detail and any auto-apply are contributed ONLY here.
//
// PURE core: given a drifted target's author intent + observed page elements, rank repair
// candidates and decide auto/propose/none. IMPURE scan + the resolver hook live at the bottom.

import type { Locator, Page } from 'playwright'
import { CliError } from '../errors.js'
import type { ManifestTarget, SelectorLadder } from '../manifest.js'
import type { SelfHealHook } from '../resolver.js'

export interface ObservedElement {
  index: number
  role?: string
  accessibleName?: string
  text?: string
}

export interface RepairIntent {
  role?: string
  accessibleName?: string
  text?: string
  label?: string
  desc?: string
}

export interface RepairCandidate {
  index: number
  score: number
  matchedOn: string[]
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
  autoThreshold?: number
  proposeThreshold?: number
  maxCandidates?: number
  marginForAuto?: number
  allowAuto?: boolean
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

function nameSimilarity(intent: RepairIntent, observed: ObservedElement): number {
  const signals = [intent.accessibleName, intent.text, intent.label, intent.desc]
  const observedNames = [observed.accessibleName, observed.text]
  let best = 0
  for (const s of signals) {
    for (const o of observedNames) best = Math.max(best, similarity(s, o))
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
  if (observed.role) return { role: { name: observed.role } }
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
    score = (roleMatch ? 0.4 : 0) + 0.6 * nameSim
  } else {
    score = nameSim
  }
  if (nameSim >= 0.6) matchedOn.push('name')
  return { score: Math.round(score * 1000) / 1000, matchedOn }
}

export function rankRepairCandidates(
  target: ManifestTarget,
  observed: ObservedElement[],
  options: RepairOptions = {},
): RepairOutcome {
  const opts = { ...DEFAULTS, ...options }
  const sensitive = options.sensitive ?? Boolean(target.sensitive)
  const intent = intentFromTarget(target)

  const scored: RepairCandidate[] = observed
    .map((o) => {
      const { score, matchedOn } = scoreCandidate(intent, o)
      return { index: o.index, score, matchedOn, proposedSelector: proposedSelectorFromObserved(o), observed: o }
    })
    .filter((c) => c.score >= opts.proposeThreshold)
    .sort((a, b) => b.score - a.score)

  const candidates = scored.slice(0, opts.maxCandidates)
  if (candidates.length === 0) {
    return { decision: 'none', best: null, candidates: [], reason: 'no candidate scored above the propose threshold' }
  }

  const best = candidates[0]!
  const runnerUp = candidates[1]
  const unambiguous = !runnerUp || best.score - runnerUp.score >= opts.marginForAuto

  if (sensitive) return { decision: 'propose', best, candidates, reason: 'sensitive target — repair proposed, never auto-applied' }
  if (!opts.allowAuto) return { decision: 'propose', best, candidates, reason: 'auto-apply disabled — repair proposed' }
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
    reason:
      runnerUp && best.score - runnerUp.score < opts.marginForAuto
        ? `ambiguous: top two candidates within ${opts.marginForAuto}`
        : `top score ${best.score} below auto threshold ${opts.autoThreshold}`,
  }
}

export function serializeRepairOutcome(outcome: RepairOutcome): Record<string, unknown> {
  return {
    decision: outcome.decision,
    reason: outcome.reason,
    candidates: outcome.candidates.map((c) => ({
      score: c.score,
      matchedOn: c.matchedOn,
      name: c.observed.accessibleName || c.observed.text || '',
      proposedSelector: c.proposedSelector,
    })),
  }
}

// ---- impure scan + resolver hook -------------------------------------------

const SCAN_FALLBACK = 'a, button, input, select, textarea, summary, [role], [tabindex]'
const SCAN_CAP = 40
const NAME_CAP = 160

async function scanObserved(page: Page, intent: RepairIntent): Promise<{ scanLocator: Locator; observed: ObservedElement[] }> {
  const roleName = (intent.role ?? '').trim()
  const scanLocator = roleName ? page.getByRole(roleName as Parameters<Page['getByRole']>[0]) : page.locator(SCAN_FALLBACK)
  const total = await scanLocator.count().catch(() => 0)
  const cap = Math.min(total, SCAN_CAP)
  const observed: ObservedElement[] = []
  for (let index = 0; index < cap; index += 1) {
    const info = await scanLocator
      .nth(index)
      .evaluate(
        (el, nameCap) => {
          const e = el as HTMLElement
          const role = e.getAttribute('role') ?? e.tagName.toLowerCase()
          const accessibleName = (e.getAttribute('aria-label') ?? '').slice(0, nameCap)
          const text = (e.textContent ?? '').trim().slice(0, nameCap)
          return { role, accessibleName, text }
        },
        NAME_CAP,
      )
      .catch(() => null)
    if (info) observed.push({ index, role: info.role, accessibleName: info.accessibleName, text: info.text })
  }
  return { scanLocator, observed }
}

/**
 * The resolver hook (§5.2). Auto-applies a single high-confidence match (returns its Locator);
 * otherwise THROWS TARGET_NOT_FOUND with a `repair` detail — the field that exists ONLY when
 * this plugin is installed (A.0.4).
 */
export function createSelfHealHook(): SelfHealHook {
  return async (page, declaredTarget, targetRef): Promise<Locator | null> => {
    const intent = intentFromTarget(declaredTarget)
    const { scanLocator, observed } = await scanObserved(page, intent)
    const outcome = rankRepairCandidates(declaredTarget, observed, { sensitive: declaredTarget.sensitive === true })

    if (outcome.decision !== 'none') {
      process.stderr.write(
        `[agrune:self-heal] ${outcome.decision === 'auto' ? 'auto-repaired' : 'repair proposed for'} "${targetRef}" (${declaredTarget.targetId}): ${outcome.reason}\n`,
      )
    }
    if (outcome.decision === 'auto' && outcome.best) {
      return scanLocator.nth(outcome.best.index)
    }
    throw new CliError('TARGET_NOT_FOUND', `Target not found: ${targetRef}`, {
      target: targetRef,
      manifestTarget: true,
      reason: 'selector-unresolved',
      repair: serializeRepairOutcome(outcome),
    })
  }
}
