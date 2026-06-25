import { describe, it, expect } from 'vitest'
import { rankRepairCandidates, similarity, intentFromTarget } from '../src/plugins/self-heal.js'
import { actionChanged, actionFeedback, pendingRequiredFields, axMessageDelta } from '../src/plugins/feedback.js'
import { detectManifestDrift, formatDriftNotice } from '../src/plugins/drift.js'
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

describe('M6 — manifest-drift detection (§8.6, pure, group-anchored)', () => {
  // Build a snapshot with two groups; each target resolved/missing per `domResolved`.
  function snap(groups: Array<{ id: string; resolved: number; missing: number; repeatExtra?: number }>): PageSnapshot {
    const targets: PageTarget[] = []
    for (const g of groups) {
      for (let i = 0; i < g.resolved; i++)
        targets.push(mkTarget(g.id, `${g.id}-r${i}`, true))
      for (let i = 0; i < g.missing; i++)
        targets.push(mkTarget(g.id, `${g.id}-m${i}`, false))
      for (let i = 0; i < (g.repeatExtra ?? 0); i++)
        targets.push({ ...mkTarget(g.id, `${g.id}-row${i}`, false), repeatInstance: { repeatId: 'rep', index: i, key: `k${i}` } })
    }
    return {
      schemaVersion: 3, version: 1, capturedAt: 0, url: 'x', title: 't',
      groups: groups.map((g) => ({ groupId: g.id, targetIds: [] })),
      targets,
    }
  }
  function mkTarget(groupId: string, targetId: string, domResolved: boolean): PageTarget {
    return {
      targetId, groupId, name: targetId, description: '', actionKinds: ['click'], selector: { css: '#x' },
      visible: domResolved, inViewport: domResolved, enabled: domResolved, covered: false,
      actionableNow: domResolved, reason: domResolved ? 'ready' : 'hidden', overlay: false, sensitive: false,
      sourceFile: 'page-manifest', sourceLine: 0, sourceColumn: 0, domResolved,
    } as PageTarget
  }

  it('flags an ENGAGED group whose targets largely vanished (partial drift)', () => {
    const r = detectManifestDrift(snap([{ id: 'board', resolved: 1, missing: 7 }]))
    expect(r.drifted).toBe(true)
    expect(r.groups[0]!.groupId).toBe('board')
    expect(r.groups[0]!.missing).toBe(7)
    expect(r.groups[0]!.missingTargetIds).toContain('board-m0')
  })

  it('does NOT flag a group we are simply not on (0 resolved = not engaged)', () => {
    // messenger has 0 resolved on the board screen — normal, not drift.
    const r = detectManifestDrift(snap([{ id: 'board', resolved: 8, missing: 0 }, { id: 'messenger', resolved: 0, missing: 6 }]))
    expect(r.drifted).toBe(false)
  })

  it('does NOT flag a healthy group (most targets resolve)', () => {
    const r = detectManifestDrift(snap([{ id: 'board', resolved: 7, missing: 1 }]))
    expect(r.drifted).toBe(false)
  })

  it('ignores groups below minTargets even if all missing-but-one', () => {
    const r = detectManifestDrift(snap([{ id: 'tiny', resolved: 1, missing: 1 }]))
    expect(r.drifted).toBe(false)
  })

  it('repeat instances do not count toward drift (empty list ≠ drift)', () => {
    // 4 direct all resolved, plus 5 missing repeat rows → not drift.
    const r = detectManifestDrift(snap([{ id: 'list', resolved: 4, missing: 0, repeatExtra: 5 }]))
    expect(r.drifted).toBe(false)
  })

  it('formatDriftNotice: agent-facing notice carries the a11y when attached', () => {
    const report = detectManifestDrift(snap([{ id: 'board', resolved: 1, missing: 7 }]))
    const withAria = formatDriftNotice(report, '- button "A"')
    expect(withAria).toContain('MANIFEST DRIFT')
    expect(withAria).toContain('a11y fallback')
    expect(withAria).toContain('- button "A"')
    // No a11y → instruct the agent to call snapshot instead.
    expect(formatDriftNotice(report)).toContain('agrune snapshot')
    // Healthy report → empty string (nothing appended).
    expect(formatDriftNotice({ drifted: false, groups: [], worstRatio: 0 })).toBe('')
  })
})
