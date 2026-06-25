// Target resolution — the differentiator. SPEC §3.6, §5.2, A.0.4.
//
// Manifest load + selector-ladder projection (role→text→testId→attr→css, first non-empty
// count() wins, .first() narrow) + repeat-key resolution + raw-CSS a11y fallback. Self-heal
// and unmapped detection are INJECTED hooks (plugins, §8): the core resolveTargetLocator works
// with both absent — when no ladder rung matches a declared target it throws TARGET_NOT_FOUND
// with NO `repair` field (A.0.4).

import type { Locator, Page } from 'playwright'
import { CliError } from './errors.js'
import {
  validateManifest,
  assertNoHashClass,
  assertNoNthChild,
  type AgruneManifest,
  type ManifestGroup,
  type ManifestRepeat,
  type ManifestTarget,
  type SelectorLadder,
} from './manifest.js'
import {
  REPEATED_TARGET_KEY_DELIMITER,
  normalizeAgentTargetId,
  parseRepeatedTargetId,
} from './target-ref.js'

export type LocatorScope = Pick<Page | Locator, 'getByRole' | 'getByText' | 'getByTestId' | 'locator'>
type AriaRole = Parameters<Page['getByRole']>[0]

export interface ResolvedLocator {
  locator: Locator
  strategy: keyof SelectorLadder
}

// ---- the selector ladder (§3.6) --------------------------------------------

export function buildLocatorCandidates(scope: LocatorScope, ladder: SelectorLadder): ResolvedLocator[] {
  const candidates: ResolvedLocator[] = []

  if (ladder.role) {
    candidates.push({
      strategy: 'role',
      locator: scope.getByRole(
        ladder.role.name as AriaRole,
        ladder.role.level ? { name: ladder.role.level } : undefined,
      ),
    })
  }
  if (ladder.text) {
    candidates.push({ strategy: 'text', locator: scope.getByText(ladder.text) })
  }
  if (ladder.testId) {
    candidates.push({ strategy: 'testId', locator: scope.getByTestId(ladder.testId) })
  }
  if (ladder.attr) {
    assertNoHashClass(ladder.attr)
    assertNoNthChild(ladder.attr)
    candidates.push({ strategy: 'attr', locator: scope.locator(ladder.attr) })
  }
  if (ladder.css) {
    assertNoHashClass(ladder.css)
    assertNoNthChild(ladder.css)
    candidates.push({ strategy: 'css', locator: scope.locator(ladder.css) })
  }
  return candidates
}

/** First ladder rung with count()>0, narrowed via .first(). */
export async function resolveLocator(
  scope: LocatorScope,
  ladder: SelectorLadder,
): Promise<ResolvedLocator | null> {
  for (const candidate of buildLocatorCandidates(scope, ladder)) {
    const count = await candidate.locator.count().catch(() => 0)
    if (count > 0) return { strategy: candidate.strategy, locator: candidate.locator.first() }
  }
  return null
}

/** Like resolveLocator but returns the FULL multi-element locator (no .first()) for repeats. */
export async function resolveLocatorMulti(
  scope: LocatorScope,
  ladder: SelectorLadder,
): Promise<ResolvedLocator | null> {
  for (const candidate of buildLocatorCandidates(scope, ladder)) {
    const count = await candidate.locator.count().catch(() => 0)
    if (count > 0) return { strategy: candidate.strategy, locator: candidate.locator }
  }
  return null
}

// ---- manifest load + route scoping (§3.2, §3.12) ---------------------------

export async function loadManifestFromPage(page: Page): Promise<AgruneManifest> {
  const raw = await page.evaluate(() => {
    const win = window as typeof window & {
      __agrune_manifest__?: unknown
      __AGRUNE_MANIFEST__?: unknown
    }
    return win.__agrune_manifest__ ?? win.__AGRUNE_MANIFEST__ ?? null
  })

  if (!raw) {
    throw new CliError(
      'MANIFEST_NOT_FOUND',
      'No Agrune manifest found on the active page. Expected window.__agrune_manifest__.',
      { url: page.url() },
    )
  }

  const validated = validateManifest(raw)
  if (!validated.ok) {
    throw new CliError('INVALID_MANIFEST', 'The active page Agrune manifest is invalid.', {
      errors: validated.errors,
    })
  }
  return validated.manifest
}

export function routeApplies(route: string | undefined, url: string): boolean {
  if (!route || route.trim().length === 0) return true
  try {
    return new RegExp(route).test(url)
  } catch {
    return url.includes(route)
  }
}

// ---- target → locator (§5.2) -----------------------------------------------

async function firstLocator(page: Page, target: ManifestTarget): Promise<Locator | null> {
  const resolved = await resolveLocator(page, target.selector)
  return resolved?.locator ?? null
}

async function findLocatorByRepeatKey(
  page: Page,
  repeat: ManifestRepeat,
  target: ManifestTarget,
  key: string,
): Promise<Locator | null> {
  // resolveLocatorMulti (not resolveLocator) — .first() would only ever see row 0, so every
  // repeat instance except index 0 would fail to resolve by key.
  const resolved = await resolveLocatorMulti(page, target.selector)
  if (!resolved) return null

  const count = await resolved.locator.count().catch(() => 0)
  for (let index = 0; index < count; index += 1) {
    const locator = resolved.locator.nth(index)
    const candidateKey = await locator
      .evaluate((el, expr) => {
        const fn = new Function('el', `return String(${expr})`) as (el: Element) => string
        return fn(el).trim()
      }, repeat.keyFrom)
      .catch(() => '')
    if (candidateKey === key) return locator
  }
  return null
}

async function findRepeatTargetLocator(
  page: Page,
  group: ManifestGroup,
  normalizedTargetId: string,
): Promise<Locator | null> {
  const delimiterIdx = normalizedTargetId.indexOf(REPEATED_TARGET_KEY_DELIMITER)
  if (delimiterIdx < 0) return null

  const repeatId = normalizedTargetId.slice(0, delimiterIdx)
  const restStart = delimiterIdx + REPEATED_TARGET_KEY_DELIMITER.length
  const dotIdx = normalizedTargetId.indexOf('.', restStart)
  if (dotIdx <= restStart) return null

  const key = normalizedTargetId.slice(restStart, dotIdx)
  const baseTargetId = normalizedTargetId.slice(dotIdx + 1)
  const repeat = group.repeats?.find((candidate) => candidate.repeatId === repeatId)
  const target = repeat?.targets.find((candidate) => candidate.targetId === baseTargetId)
  if (!repeat || !target) return null

  return findLocatorByRepeatKey(page, repeat, target, key)
}

export async function findTargetLocator(
  page: Page,
  manifest: AgruneManifest,
  normalizedTargetId: string,
): Promise<Locator | null> {
  const url = page.url()
  for (const group of manifest.groups) {
    if (!routeApplies(group.route, url)) continue

    const direct = group.targets.find((target) => target.targetId === normalizedTargetId)
    if (direct) return firstLocator(page, direct)

    const repeatLocator = await findRepeatTargetLocator(page, group, normalizedTargetId)
    if (repeatLocator) return repeatLocator
  }
  return null
}

export function manifestDeclaresTarget(
  manifest: AgruneManifest,
  normalizedTargetId: string,
  url: string,
): boolean {
  const repeated = parseRepeatedTargetId(normalizedTargetId)
  for (const group of manifest.groups) {
    if (!routeApplies(group.route, url)) continue
    if (!repeated && group.targets.some((target) => target.targetId === normalizedTargetId)) return true
    if (
      repeated &&
      group.repeats?.some(
        (repeat) =>
          repeat.repeatId === repeated.repeatId &&
          repeat.targets.some((target) => target.targetId === repeated.baseTargetId),
      )
    ) {
      return true
    }
  }
  return false
}

export function findDeclaredDirectTarget(
  manifest: AgruneManifest,
  normalizedTargetId: string,
  url: string,
): ManifestTarget | null {
  for (const group of manifest.groups) {
    if (!routeApplies(group.route, url)) continue
    const direct = group.targets.find((target) => target.targetId === normalizedTargetId)
    if (direct) return direct
  }
  return null
}

/**
 * Self-heal plugin hook (§8.1). Given a declared-but-unresolved target, attempt re-grounding;
 * return a Locator to auto-apply, or null/throw to surface TARGET_NOT_FOUND. ABSENT in core.
 */
export type SelfHealHook = (
  page: Page,
  declaredTarget: ManifestTarget,
  targetRef: string,
) => Promise<Locator | null>

export interface ResolveOptions {
  /** Plugin: resolve an unmapped raw ref (x1, x2, …) to a live CSS selector (§8.3). */
  resolveUnmapped?: (ref: string) => string | undefined
  /** Plugin: self-heal hook (§8.1). */
  selfHeal?: SelfHealHook
}

/**
 * The full action-path resolver (§5.2). Core path (no plugins): manifest-first, then a
 * declared-but-drifted target throws TARGET_NOT_FOUND with NO `repair` field (A.0.4).
 */
export async function resolveTargetLocator(
  page: Page,
  targetRef: string,
  opts: ResolveOptions = {},
): Promise<Locator> {
  const unmapped = opts.resolveUnmapped?.(targetRef)
  if (unmapped) return page.locator(unmapped).first()

  const manifest = await loadManifestFromPage(page)
  const normalized = normalizeAgentTargetId(targetRef)
  const found = await findTargetLocator(page, manifest, normalized)
  if (found) return found

  const url = page.url()
  const declaredTarget = findDeclaredDirectTarget(manifest, normalized, url)
  const declared = declaredTarget !== null || manifestDeclaresTarget(manifest, normalized, url)
  if (!declared) {
    throw new CliError('TARGET_NOT_FOUND', `Target not found: ${targetRef}`, {
      target: targetRef,
      manifestTarget: false,
      reason: 'not-declared',
    })
  }

  if (declaredTarget && opts.selfHeal) {
    const healed = await opts.selfHeal(page, declaredTarget, targetRef)
    if (healed) return healed
  }

  // No-plugin path (A.0.4): declared but drifted — NO `repair` field in details.
  throw new CliError('TARGET_NOT_FOUND', `Target not found: ${targetRef}`, {
    target: targetRef,
    manifestTarget: true,
    reason: 'selector-unresolved',
  })
}

/**
 * Read-only resolver allowing a raw CSS selector when the ref is not a manifest target
 * (screenshots / target-scoped evaluate). Manifest-declared-but-unresolved rethrows.
 */
export async function resolveTargetOrSelectorLocator(
  page: Page,
  targetRef: string,
  opts: ResolveOptions = {},
): Promise<Locator> {
  try {
    return await resolveTargetLocator(page, targetRef, opts)
  } catch (error) {
    if (error instanceof CliError && error.details?.manifestTarget === true) throw error
    // Treat as a raw CSS selector.
    const locator = page.locator(targetRef)
    const count = await locator.count().catch(() => 0)
    if (count === 1) return locator
    if (count > 1) {
      throw new CliError('INVALID_TARGET', `Selector is not unique: ${targetRef}`, {
        target: targetRef,
        count,
      })
    }
    if (error instanceof CliError) throw error
    throw new CliError('TARGET_NOT_FOUND', `Target not found: ${targetRef}`, { target: targetRef })
  }
}
