import { describe, expect, it } from 'vitest'
import { REPEATED_TARGET_KEY_DELIMITER } from '@agrune/core'
import type { PageSnapshot } from '@agrune/core'
import { filterSnapshot, formatSnapshot } from '../src/snapshot'

describe('formatSnapshot', () => {
  it('renders repeated runtime target ids as public refs', () => {
    const snapshot: PageSnapshot = {
      schemaVersion: 3,
      version: 1,
      capturedAt: 1,
      url: 'http://example.test',
      title: 'Example',
      groups: [{
        groupId: 'board',
        targetIds: [`cards${REPEATED_TARGET_KEY_DELIMITER}A.card_open`],
      }],
      targets: [{
        targetId: `cards${REPEATED_TARGET_KEY_DELIMITER}A.card_open`,
        groupId: 'board',
        name: 'Open card',
        description: '',
        actionKinds: ['click'],
        selector: { testId: 'card-a' },
        visible: true,
        inViewport: true,
        enabled: true,
        covered: false,
        actionableNow: true,
        reason: 'ready',
        overlay: false,
        sensitive: false,
        sourceFile: 'test',
        sourceLine: 1,
        sourceColumn: 1,
        repeatInstance: { repeatId: 'cards', index: 0, key: 'A' },
      }],
    }

    expect(formatSnapshot(snapshot, { full: true })).toContain('ref=cards[key=A].card_open')
  })

  it('filters target output by a single public target ref', () => {
    const snapshot = buildSnapshot()

    const text = formatSnapshot(snapshot, {
      targetRef: 'save_button',
      includeTextContent: true,
    })

    expect(text).toContain('- target "Save" [ref=save_button]')
    expect(text).toContain('text: "Save changes"')
    expect(text).not.toContain('- target "Cancel" [ref=cancel_button]')
    expect(text).not.toContain('- target "Filter" [ref=filter_input]')
  })

  it('filters target output by multiple group ids', () => {
    const snapshot = buildSnapshot()

    const text = formatSnapshot(snapshot, {
      groupIds: ['filters'],
      includeTextContent: true,
    })

    expect(text).toContain('- target "Filter" [ref=filter_input]')
    expect(text).toContain('text: "Open only"')
    expect(text).not.toContain('- target "Save" [ref=save_button]')
    expect(text).not.toContain('- target "Cancel" [ref=cancel_button]')
  })

  it('compact mode omits descriptions but honors the alwaysDesc pin', () => {
    const snapshot: PageSnapshot = {
      schemaVersion: 3,
      version: 1,
      capturedAt: 1,
      url: 'http://example.test',
      title: 'Example',
      groups: [{ groupId: 'wizard', groupName: 'Wizard', targetIds: ['next_button', 'description_input'] }],
      targets: [
        { ...target('next_button', 'wizard', 'Next', 'Next'), description: 'Advance to the next step.' },
        {
          ...target('description_input', 'wizard', 'Description', 'Description'),
          description: 'Required field — the wizard will not advance until this has text.',
          alwaysDesc: true,
        },
      ],
    }

    // Default render: both descriptions present.
    const full = formatSnapshot(snapshot, { full: true })
    expect(full).toContain('Advance to the next step.')
    expect(full).toContain('Required field')

    // Compact render: unpinned description dropped, pinned one survives.
    const compact = formatSnapshot(snapshot, { full: true, compact: true })
    expect(compact).not.toContain('Advance to the next step.')
    expect(compact).toContain('Required field')
  })

  it('filters raw snapshots for daemon targets responses', () => {
    const snapshot = buildSnapshot()

    const filtered = filterSnapshot(snapshot, { targetRef: 'save_button' })

    expect(filtered.targets.map(target => target.targetId)).toEqual(['save_button'])
    expect(filtered.groups).toEqual([
      { groupId: 'actions', groupName: 'Actions', targetIds: ['save_button'] },
    ])
  })
})

function buildSnapshot(): PageSnapshot {
  return {
    schemaVersion: 3,
    version: 1,
    capturedAt: 1,
    url: 'http://example.test',
    title: 'Example',
    groups: [
      { groupId: 'actions', groupName: 'Actions', targetIds: ['save_button', 'cancel_button'] },
      { groupId: 'filters', groupName: 'Filters', targetIds: ['filter_input'] },
    ],
    targets: [
      target('save_button', 'actions', 'Save', 'Save changes'),
      target('cancel_button', 'actions', 'Cancel', 'Discard changes'),
      target('filter_input', 'filters', 'Filter', 'Open only'),
    ],
  }
}

function target(targetId: string, groupId: string, name: string, textContent: string): PageSnapshot['targets'][number] {
  return {
    targetId,
    groupId,
    name,
    description: '',
    actionKinds: ['click'],
    selector: { testId: targetId },
    visible: true,
    inViewport: true,
    enabled: true,
    covered: false,
    actionableNow: true,
    reason: 'ready',
    overlay: false,
    sensitive: false,
    textContent,
    sourceFile: 'test',
    sourceLine: 1,
    sourceColumn: 1,
  }
}
