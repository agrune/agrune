import type { Locator, Page } from 'playwright'
import type { SelectorLadder } from '@agrune/manifest'
import { assertNoHashClass, assertNoNthChild } from '@agrune/manifest'

type LocatorScope = Pick<Page | Locator, 'getByRole' | 'getByText' | 'getByTestId' | 'locator'>
type AriaRole = Parameters<Page['getByRole']>[0]

export interface ResolvedLocator {
  locator: Locator
  strategy: keyof SelectorLadder
}

export async function resolveLocator(
  scope: LocatorScope,
  ladder: SelectorLadder,
): Promise<ResolvedLocator | null> {
  const candidates = buildLocatorCandidates(scope, ladder)
  for (const candidate of candidates) {
    const count = await candidate.locator.count().catch(() => 0)
    if (count > 0) {
      return {
        strategy: candidate.strategy,
        locator: candidate.locator.first(),
      }
    }
  }
  return null
}

/**
 * Like resolveLocator, but returns the FULL multi-element locator (no `.first()`)
 * for the first ladder strategy that matches anything. Repeat enumeration must
 * see every matching row — resolveLocator's `.first()` narrowing silently
 * collapses an N-row repeat to its first instance.
 */
export async function resolveLocatorMulti(
  scope: LocatorScope,
  ladder: SelectorLadder,
): Promise<ResolvedLocator | null> {
  const candidates = buildLocatorCandidates(scope, ladder)
  for (const candidate of candidates) {
    const count = await candidate.locator.count().catch(() => 0)
    if (count > 0) {
      return { strategy: candidate.strategy, locator: candidate.locator }
    }
  }
  return null
}

export function buildLocatorCandidates(
  scope: LocatorScope,
  ladder: SelectorLadder,
): ResolvedLocator[] {
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
    candidates.push({
      strategy: 'text',
      locator: scope.getByText(ladder.text),
    })
  }

  if (ladder.testId) {
    candidates.push({
      strategy: 'testId',
      locator: scope.getByTestId(ladder.testId),
    })
  }

  if (ladder.attr) {
    assertNoHashClass(ladder.attr)
    assertNoNthChild(ladder.attr)
    candidates.push({
      strategy: 'attr',
      locator: scope.locator(ladder.attr),
    })
  }

  if (ladder.css) {
    assertNoHashClass(ladder.css)
    assertNoNthChild(ladder.css)
    candidates.push({
      strategy: 'css',
      locator: scope.locator(ladder.css),
    })
  }

  return candidates
}
