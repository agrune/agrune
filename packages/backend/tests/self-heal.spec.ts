import { describe, expect, it } from 'vitest'
import type { ManifestTarget } from '@agrune/manifest'
import {
  intentFromTarget,
  rankRepairCandidates,
  similarity,
  serializeRepairOutcome,
  type ObservedElement,
} from '../src/self-heal'

function target(overrides: Partial<ManifestTarget> = {}): ManifestTarget {
  return {
    targetId: 'submit',
    name: 'Submit application',
    actionKinds: ['click'],
    selector: { role: { name: 'button', level: 'Submit application' } },
    ...overrides,
  }
}

describe('similarity', () => {
  it('is 1 for exact (case/space-insensitive) and 0 for empty', () => {
    expect(similarity('Submit Application', 'submit   application')).toBe(1)
    expect(similarity('', 'x')).toBe(0)
    expect(similarity('x', undefined)).toBe(0)
  })

  it('rewards containment over disjoint tokens', () => {
    expect(similarity('Submit', 'Submit application')).toBe(0.85)
    expect(similarity('Submit application', 'Cancel order')).toBeLessThan(0.5)
  })
})

describe('intentFromTarget', () => {
  it('distills role/name/text/label from the selector ladder', () => {
    const intent = intentFromTarget(target({ selector: { role: { name: 'button', level: 'Pay now' }, text: 'Pay' } }))
    expect(intent.role).toBe('button')
    expect(intent.accessibleName).toBe('Pay now')
    expect(intent.text).toBe('Pay')
    expect(intent.label).toBe('Submit application')
  })
})

describe('rankRepairCandidates', () => {
  it('auto-applies a single high-confidence same-role match', () => {
    const observed: ObservedElement[] = [
      { index: 0, role: 'button', accessibleName: 'Submit application' },
      { index: 1, role: 'button', accessibleName: 'Reset form' },
    ]
    const outcome = rankRepairCandidates(target(), observed)
    expect(outcome.decision).toBe('auto')
    expect(outcome.best?.index).toBe(0)
    expect(outcome.best?.matchedOn).toContain('role')
    expect(outcome.best?.matchedOn).toContain('name')
    // Proposed selector re-grounds on the live element.
    expect(outcome.best?.proposedSelector).toEqual({ role: { name: 'button', level: 'Submit application' } })
  })

  it('proposes (never auto) for a sensitive target even with a perfect match', () => {
    const observed: ObservedElement[] = [{ index: 0, role: 'textbox', accessibleName: 'Card number' }]
    const t = target({ targetId: 'cc', name: 'Card number', actionKinds: ['fill'], selector: { role: { name: 'textbox', level: 'Card number' } }, sensitive: true })
    const outcome = rankRepairCandidates(t, observed)
    expect(outcome.decision).toBe('propose')
    expect(outcome.best?.index).toBe(0)
  })

  it('proposes (not auto) when the top two candidates are ambiguous', () => {
    const observed: ObservedElement[] = [
      { index: 0, role: 'button', accessibleName: 'Submit application form' },
      { index: 1, role: 'button', accessibleName: 'Submit application now' },
    ]
    const outcome = rankRepairCandidates(target(), observed)
    expect(outcome.decision).toBe('propose')
    expect(outcome.candidates.length).toBeGreaterThanOrEqual(2)
  })

  it('does not auto-jump to a different role', () => {
    const observed: ObservedElement[] = [{ index: 0, role: 'link', accessibleName: 'Submit application' }]
    const outcome = rankRepairCandidates(target(), observed)
    // role mismatch caps score at 0.5*nameSim => below auto threshold
    expect(outcome.decision).not.toBe('auto')
  })

  it('returns none when nothing clears the propose threshold', () => {
    const observed: ObservedElement[] = [
      { index: 0, role: 'button', accessibleName: 'Delete everything' },
      { index: 1, role: 'button', accessibleName: 'Log out' },
    ]
    const outcome = rankRepairCandidates(target(), observed)
    expect(outcome.decision).toBe('none')
    expect(outcome.best).toBeNull()
  })

  it('honors allowAuto=false by downgrading to propose', () => {
    const observed: ObservedElement[] = [{ index: 0, role: 'button', accessibleName: 'Submit application' }]
    const outcome = rankRepairCandidates(target(), observed, { allowAuto: false })
    expect(outcome.decision).toBe('propose')
  })

  it('serializes a compact outcome view', () => {
    const observed: ObservedElement[] = [{ index: 0, role: 'button', accessibleName: 'Submit application' }]
    const view = serializeRepairOutcome(rankRepairCandidates(target(), observed))
    expect(view.decision).toBe('auto')
    expect(Array.isArray(view.candidates)).toBe(true)
    expect((view.candidates as unknown[]).length).toBe(1)
  })
})
