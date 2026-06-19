import type { Locator, Page } from 'playwright'
import type { AgruneManifest } from '@agrune/manifest'
import { resolveLocator, resolveLocatorMulti } from './locator.js'

/**
 * Hybrid unmapped-control detection — deterministic, no model in the loop.
 *
 * When the manifest is stale or incomplete, interactive controls exist on screen
 * that no manifest target covers. Rather than leave the agent blind, we find
 * those controls, derive a stable-ish CSS selector for each, and surface them
 * with raw `x`-refs (graceful degradation toward raw mode for ONLY the unmapped
 * bits — mapped targets keep their stable refs). The detection is pure set
 * difference: resolve every manifest target, mark what it covers, then enumerate
 * the interactive controls that remain. The agent never decides what is unmapped.
 */

export interface UnmappedTarget {
  /** Synthetic raw ref (x1, x2, …) — unstable across turns, prefer mapped refs. */
  ref: string
  /** Derived CSS selector (#id / [data-testid] / tag[name]) the driver acts on. */
  selector: string
  /** Inferred action verb — fill for text inputs, click otherwise. */
  verb: 'fill' | 'click'
  /** Accessible-ish name read from the live DOM. */
  name: string
}

/** Interactive elements worth surfacing when they fall outside the manifest. */
const INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [contenteditable=""], [contenteditable="true"]'

const COVERED_ATTR = 'data-agrune-cov'

async function markCovered(locator: Locator, max: number): Promise<void> {
  const n = Math.min(await locator.count(), max)
  for (let i = 0; i < n; i++) {
    await locator
      .nth(i)
      .evaluate((el, attr) => el.setAttribute(attr, '1'), COVERED_ATTR)
      .catch(() => {})
  }
}

export async function detectUnmapped(
  page: Page,
  manifest: AgruneManifest,
  limit = 8,
): Promise<UnmappedTarget[]> {
  // 1. Mark every element a manifest target resolves to (the covered set).
  for (const group of manifest.groups) {
    for (const target of group.targets ?? []) {
      try {
        const resolved = await resolveLocator(page, target.selector)
        if (resolved) await markCovered(resolved.locator, 20)
      } catch {
        /* a drifted selector simply covers nothing */
      }
    }
    for (const repeat of group.repeats ?? []) {
      for (const target of repeat.targets ?? []) {
        try {
          const resolved = await resolveLocatorMulti(page, target.selector)
          if (resolved) await markCovered(resolved.locator, 40)
        } catch {
          /* ignore */
        }
      }
    }
  }

  // 2. Active region: the open dialog if any, else the whole page.
  const dialog = page.locator('[role="dialog"]')
  const region = (await dialog.count().catch(() => 0)) ? dialog.last() : page.locator('body')

  // 3. Enumerate interactive elements; keep visible ones NOT covered.
  const found = await region
    .locator(INTERACTIVE_SELECTOR)
    .evaluateAll((nodes, coveredAttr) => {
      return nodes.slice(0, 80).map(node => {
        const el = node as HTMLElement
        if (el.getAttribute(coveredAttr) === '1' || el.closest(`[${coveredAttr}="1"]`)) return null
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') return null
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return null
        const tag = el.tagName.toLowerCase()
        const role = el.getAttribute('role') || ''
        const type = (el.getAttribute('type') || 'text').toLowerCase()
        const isFill =
          (tag === 'input' && !['button', 'submit', 'checkbox', 'radio', 'file', 'range'].includes(type)) ||
          tag === 'textarea' ||
          role === 'textbox' ||
          (el as HTMLElement).isContentEditable
        const input = el as HTMLInputElement
        const lbl = input.labels && input.labels[0] ? input.labels[0].textContent : ''
        const name = (
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title') ||
          lbl ||
          el.textContent ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 60)
        let selector = ''
        if (el.id) selector = '#' + CSS.escape(el.id)
        else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`
        else if (el.getAttribute('name')) selector = `${tag}[name="${el.getAttribute('name')}"]`
        return selector ? { verb: (isFill ? 'fill' : 'click') as 'fill' | 'click', name, selector } : null
      })
    }, COVERED_ATTR)
    .then(rows => rows.filter((row): row is { verb: 'fill' | 'click'; name: string; selector: string } => row !== null))
    .catch(() => [] as { verb: 'fill' | 'click'; name: string; selector: string }[])

  // 4. Cleanup markers.
  await page
    .evaluate(attr => document.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr)), COVERED_ATTR)
    .catch(() => {})

  // 5. Assign raw refs (x1, x2, …).
  return found.slice(0, limit).map((info, i) => ({ ref: `x${i + 1}`, ...info }))
}
