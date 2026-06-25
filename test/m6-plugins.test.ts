import { describe, it, expect } from 'vitest'
import { rankRepairCandidates, similarity, intentFromTarget } from '../src/plugins/self-heal.js'
import { actionChanged, actionFeedback, pendingRequiredFields, axMessageDelta } from '../src/plugins/feedback.js'
import type { ManifestTarget } from '../src/manifest.js'
import type { PageSnapshot, PageTarget } from '../src/snapshot.js'

describe('M6 — self-heal scoring (§8.1, pure)', () => {
  const target: ManifestTarget = {
    targetId: 'save',
    name: 'Save',
    selector: { role: { name: 'button', level: 'Save' }, css: '#gone' },
    actionKinds: ['click'],
  }

  it('similarity: exact=1, containment=0.85, disjoint→jaccard', () => {
    expect(similarity('Save', 'Save')).toBe(1)
    expect(similarity('Save changes', 'Save')).toBe(0.85)
    expect(similarity('alpha', 'beta')).toBe(0)
  })

  it('intentFromTarget distills role/name/label', () => {
    const intent = intentFromTarget(target)
    expect(intent.role).toBe('button')
    expect(intent.accessibleName).toBe('Save')
    expect(intent.label).toBe('Save')
  })

  it('auto-applies a single high-confidence same-role match', () => {
    const outcome = rankRepairCandidates(target, [
      { index: 0, role: 'button', accessibleName: 'Save', text: 'Save' },
      { index: 1, role: 'link', accessibleName: 'Cancel', text: 'Cancel' },
    ])
    expect(outcome.decision).toBe('auto')
    expect(outcome.best?.index).toBe(0)
  })

  it('a sensitive target is NEVER auto-applied (propose only)', () => {
    const outcome = rankRepairCandidates(
      { ...target, sensitive: true },
      [{ index: 0, role: 'button', accessibleName: 'Save', text: 'Save' }],
    )
    expect(outcome.decision).toBe('propose')
  })

  it('a role mismatch caps the score below auto', () => {
    const outcome = rankRepairCandidates(target, [
      { index: 0, role: 'link', accessibleName: 'Save', text: 'Save' },
    ])
    // name matches (0.6) but role mismatches → score 0.6 < autoThreshold 0.82.
    expect(outcome.decision).toBe('propose')
  })
})

describe('M6 — feedback signals (§8.2, pure)', () => {
  const before: PageSnapshot = {
    schemaVersion: 3,
    version: 3,
    capturedAt: 0,
    url: 'x',
    title: 't',
    groups: [],
    targets: [
      { targetId: 'go', groupId: 'g', name: 'Go', description: '', actionKinds: ['click'], selector: { css: '#go' }, visible: true, inViewport: true, enabled: true, covered: false, actionableNow: true, reason: 'ready', overlay: false, sensitive: false, sourceFile: 'page-manifest', sourceLine: 0, sourceColumn: 0, onSuccess: 'You moved to the next step.' } as PageTarget,
    ],
  }

  it('actionChanged: version delta', () => {
    expect(actionChanged(before, { ...before, version: 4 })).toBe(true)
    expect(actionChanged(before, { ...before, version: 3 })).toBe(false)
    expect(actionChanged(null, before)).toBeNull()
    expect(actionChanged(before, null)).toBe(true)
  })

  it('actionFeedback emits onSuccess only when changed', () => {
    expect(actionFeedback(before, true, 'go')).toBe('You moved to the next step.')
    expect(actionFeedback(before, false, 'go')).toBeNull()
  })

  it('pendingRequiredFields: required + visible + empty + fillable', () => {
    const targets = [
      { name: 'Email', required: true, visible: true, hasValue: false, actionKinds: ['fill'] },
      { name: 'Done', required: true, visible: true, hasValue: true, actionKinds: ['fill'] },
    ] as PageTarget[]
    expect(pendingRequiredFields(targets)).toEqual(['Email'])
  })

  it('axMessageDelta: new informational lines only, capped at 6', () => {
    const prev = ['- text: Welcome']
    const cur = ['- text: Welcome', '- alert: Invalid email', '- button: Submit']
    expect(axMessageDelta(prev, cur)).toEqual(['Invalid email'])
  })
})
