import type { PageTarget } from '@agrune/core'

/**
 * Deterministic "what's still missing" nudge (Problem 3): the names of the
 * currently-visible required fillable targets that hold no value yet. This turns
 * the intermediate-form state from something the agent must INFER (a disabled
 * submit button it sees in the snapshot) into an explicit list, so after every
 * fill the agent knows exactly which required fields remain before a gated action
 * (Create / Next / Submit) can succeed.
 *
 * Pure over the already-captured snapshot targets — no extra DOM/snapshot cost.
 * A target counts when it is required (DOM `required`/`aria-required` or authored
 * `required` in the manifest), still visible, fillable, and empty. Names are
 * deduped and capped so a large form cannot flood the result.
 */
export function pendingRequiredFields(targets: PageTarget[], limit = 8): string[] {
  const out: string[] = []
  for (const target of targets) {
    if (!target.required) continue
    if (!target.visible) continue
    if (target.hasValue) continue
    if (!target.actionKinds.includes('fill')) continue
    const name = target.name?.trim()
    if (!name || out.includes(name)) continue
    out.push(name)
    if (out.length >= limit) break
  }
  return out
}
