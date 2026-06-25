// Deterministic action-feedback plugin (SPEC §8.2). OFF by default. Pure functions folded by
// the action path when enabled — each signal omitted when N/A. Zero per-turn token cost in core.

import type { PageSnapshot, PageTarget } from '../snapshot.js'

export interface ActionInsights {
  changed?: boolean
  feedback?: string
  screenMessages?: string[]
  pendingRequired?: string[]
}

/** The `changed` bit (§8.2): snapshot VERSION delta. null when not an act/fill or no baseline. */
export function actionChanged(
  before: PageSnapshot | null,
  after: PageSnapshot | null,
): boolean | null {
  if (!before) return null
  return after == null || after.version !== before.version
}

/** Manifest-authored feedback (§8.2): onSuccess when changed, onNoEffect when not. */
export function actionFeedback(
  before: PageSnapshot | null,
  changed: boolean | null,
  actedTargetId: string | undefined,
): string | null {
  if (changed === null || !before || !actedTargetId) return null
  const acted = before.targets.find((t) => t.targetId === actedTargetId)
  if (!acted) return null
  const message = changed ? acted.onSuccess : acted.onNoEffect
  return message && message.length > 0 ? message : null
}

// ---- screen-delta a11y messages (§8.2) -------------------------------------

const AX_MESSAGE_LINE = /^-\s+(text|alert|status|heading|note|caption|tooltip):/i

export function axMessageDelta(prev: string[], cur: string[], exclude: string[] = []): string[] {
  const prevSet = new Set(prev)
  const excludeSet = new Set(exclude.map((e) => e.trim()))
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of cur) {
    if (prevSet.has(line)) continue
    if (!AX_MESSAGE_LINE.test(line)) continue
    const text = line.replace(/^-\s+\w+:\s*/, '').trim()
    if (!text || seen.has(text) || excludeSet.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out.slice(0, 6)
}

// ---- required-field nudge (§8.2) -------------------------------------------

export function pendingRequiredFields(targets: PageTarget[], limit = 8): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of targets) {
    if (!(t.required && t.visible && !t.hasValue && t.actionKinds.includes('fill'))) continue
    const name = t.name.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
    if (out.length >= limit) break
  }
  return out
}

/** Fold the insights into an action result, omitting empties. */
export function withActionInsights(insights: ActionInsights): ActionInsights {
  const out: ActionInsights = {}
  if (insights.changed !== undefined && insights.changed !== null) out.changed = insights.changed
  if (insights.feedback) out.feedback = insights.feedback
  if (insights.screenMessages && insights.screenMessages.length > 0) out.screenMessages = insights.screenMessages
  if (insights.pendingRequired && insights.pendingRequired.length > 0) out.pendingRequired = insights.pendingRequired
  return out
}
