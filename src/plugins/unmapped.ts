// Unmapped-control detection plugin (SPEC §8.3). OFF by default (perf-sensitive). Pure
// set-difference: interactive controls on screen NOT covered by the manifest, grafted as
// synthetic targets under the `unmapped` group with raw refs (x1, x2, …). No model.

import type { Page } from 'playwright'
import type { AgruneManifest } from '../manifest.js'
import { resolveLocator, resolveLocatorMulti, routeApplies } from '../resolver.js'
import type { PageSnapshot, PageTarget } from '../snapshot.js'

export const UNMAPPED_GROUP_ID = 'unmapped'

export interface UnmappedTarget {
  ref: string
  selector: string
  verb: 'fill' | 'click'
  name: string
}

const INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [contenteditable=""], [contenteditable="true"]'

/** Mark covered, enumerate the active region, diff, and assign x-refs. §8.3. */
export async function detectUnmapped(page: Page, manifest: AgruneManifest, limit = 8): Promise<UnmappedTarget[]> {
  const url = page.url()

  // 1. Mark covered elements (drifted selectors cover nothing).
  for (const group of manifest.groups) {
    if (!routeApplies(group.route, url)) continue
    for (const target of group.targets) {
      const resolved = await resolveLocator(page, target.selector).catch(() => null)
      if (resolved) {
        await resolved.locator
          .evaluateAll((els) => els.slice(0, 20).forEach((el) => el.setAttribute('data-agrune-cov', '1')))
          .catch(() => undefined)
      }
    }
    for (const repeat of group.repeats ?? []) {
      for (const target of repeat.targets) {
        const resolved = await resolveLocatorMulti(page, target.selector).catch(() => null)
        if (resolved) {
          await resolved.locator
            .evaluateAll((els) => els.slice(0, 40).forEach((el) => el.setAttribute('data-agrune-cov', '1')))
            .catch(() => undefined)
        }
      }
    }
  }

  // 2-4. Enumerate the active region, skip covered/hidden, derive selector + verb + name.
  const found: Array<Omit<UnmappedTarget, 'ref'>> = await page
    .evaluate((interactiveSelector) => {
      const region =
        (document.querySelectorAll('[role="dialog"]')[
          document.querySelectorAll('[role="dialog"]').length - 1
        ] as HTMLElement | undefined) ?? document.body
      const nodes = Array.from(region.querySelectorAll(interactiveSelector)).slice(0, 80) as HTMLElement[]
      const out: Array<{ selector: string; verb: 'fill' | 'click'; name: string }> = []
      for (const el of nodes) {
        if (el.getAttribute('data-agrune-cov') === '1' || el.closest('[data-agrune-cov="1"]')) continue
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue

        const tag = el.tagName.toLowerCase()
        const inputType = (el as HTMLInputElement).type
        const isFill =
          (tag === 'input' && !['button', 'submit', 'checkbox', 'radio', 'file', 'range'].includes(inputType)) ||
          tag === 'textarea' ||
          el.getAttribute('role') === 'textbox' ||
          el.isContentEditable
        const verb: 'fill' | 'click' = isFill ? 'fill' : 'click'
        const name = (
          el.getAttribute('aria-label') ??
          (el as HTMLInputElement).placeholder ??
          el.getAttribute('title') ??
          el.querySelector('label')?.textContent ??
          el.textContent ??
          ''
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 60)

        let selector: string | null = null
        if (el.id) selector = `#${CSS.escape(el.id)}`
        else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`
        else if (el.getAttribute('name')) selector = `${tag}[name="${el.getAttribute('name')}"]`
        if (!selector) continue
        out.push({ selector, verb, name })
      }
      document.querySelectorAll('[data-agrune-cov]').forEach((el) => el.removeAttribute('data-agrune-cov'))
      return out
    }, INTERACTIVE_SELECTOR)
    .catch(() => [])

  return found.slice(0, limit).map((info, i) => ({ ref: `x${i + 1}`, ...info }))
}

/**
 * Graft unmapped targets onto a snapshot under the `unmapped` group. Does NOT bump the snapshot
 * version (it reflects only the mapped screen, §8.3). Returns the registry for x-ref resolution.
 */
export function augmentWithUnmapped(
  snapshot: PageSnapshot,
  unmapped: UnmappedTarget[],
): { snapshot: PageSnapshot; registry: Map<string, UnmappedTarget> } {
  const registry = new Map<string, UnmappedTarget>()
  if (unmapped.length === 0) return { snapshot, registry }

  const targets: PageTarget[] = unmapped.map((u) => {
    registry.set(u.ref, u)
    return {
      targetId: u.ref,
      groupId: UNMAPPED_GROUP_ID,
      name: u.name || u.ref,
      description: '',
      actionKinds: [u.verb],
      selector: { css: u.selector },
      visible: true,
      inViewport: true,
      enabled: true,
      covered: false,
      actionableNow: true,
      reason: 'ready',
      overlay: false,
      sensitive: false,
      sourceFile: 'unmapped',
      sourceLine: 0,
      sourceColumn: 0,
      domResolved: true,
    }
  })

  const group = { groupId: UNMAPPED_GROUP_ID, groupName: 'Unmapped controls', targetIds: unmapped.map((u) => u.ref) }
  return {
    snapshot: { ...snapshot, groups: [...snapshot.groups, group], targets: [...snapshot.targets, ...targets] },
    registry,
  }
}
