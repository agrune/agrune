/**
 * a11y change-delta — deterministic, manifest-independent.
 *
 * After an action the driver captures the live accessibility tree (Playwright
 * aria YAML). The full tree is NEVER shown to the agent; only its frame-to-frame
 * delta of *informational* lines is. This is how the app's own validation errors
 * and toasts (which the manifest does not author as targets) reach the agent —
 * e.g. a `<p class="text-destructive">Description is required</p>` surfaces as a
 * new `- text: Description is required` line that was absent a frame earlier.
 *
 * Interactive controls are deliberately excluded — those are the manifest's job
 * (and, when the manifest misses one, the unmapped-detection path's job).
 */

/** aria lines that carry an on-screen MESSAGE (informational), not a control. */
export const AX_MESSAGE_LINE = /^-\s+(text|alert|status|heading|note|caption|tooltip):/i

/**
 * Informational lines present in `cur` but not in `prev`, cleaned to bare text.
 * Capped at 6 so a large reflow can't flood the agent prompt.
 *
 * `exclude` drops messages whose text matches a known volatile region (a clock,
 * a live counter, a relative timestamp). Such regions self-update, so their churn
 * would otherwise leak into the delta as a fake "new message" every turn. Caller
 * passes the current text of every `volatile` manifest target.
 */
export function axMessageDelta(
  prevLines: string[],
  curLines: string[],
  exclude: Iterable<string> = [],
): string[] {
  const prev = new Set(prevLines)
  const excluded = new Set<string>()
  for (const value of exclude) {
    const trimmed = value.trim()
    if (trimmed) excluded.add(trimmed)
  }
  const out: string[] = []
  for (const line of curLines) {
    if (prev.has(line)) continue
    const trimmed = line.trim()
    if (!AX_MESSAGE_LINE.test(trimmed)) continue
    const msg = trimmed.replace(/^-\s+\w+:\s*/, '').trim()
    if (msg && !excluded.has(msg) && !out.includes(msg)) out.push(msg)
  }
  return out.slice(0, 6)
}
