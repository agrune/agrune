import { describe, it, expect } from 'vitest'
import type {
  AgruneManifest,
  ManifestTarget,
  ManifestGroup,
  SelectorLadder,
  ActionKind,
} from '../src/manifest.js'

describe('@agrune/core — v3 manifest re-export', () => {
  it('AgruneManifest has version: 3', () => {
    const manifest: AgruneManifest = { version: 3, groups: [] }
    expect(manifest.version).toBe(3)
  })

  it('ManifestTarget has actionKinds array and SelectorLadder', () => {
    const target: ManifestTarget = {
      targetId: 't',
      actionKinds: ['click'],
      selector: { css: 'button' },
    }
    expect(target.actionKinds).toEqual(['click'])
  })

  it('SelectorLadder has role/text/testId/attr/css optional fields', () => {
    const ladder: SelectorLadder = { role: { name: 'button' } }
    expect(ladder.role?.name).toBe('button')
  })

  it('ActionKind is a string union', () => {
    const kinds: ActionKind[] = ['click', 'fill', 'type', 'press', 'select', 'upload', 'drop']
    expect(kinds.every(k => typeof k === 'string')).toBe(true)
  })

  it('ManifestGroup has targets and optional repeats', () => {
    const group: ManifestGroup = {
      groupId: 'g',
      targets: [],
      repeats: [{
        repeatId: 'r', template: 't', keyFrom: 'k', strategy: 'dom', targets: [],
      }],
    }
    expect(group.repeats).toHaveLength(1)
  })

  it('type-level: v2 AgruneGroupEntry/AgruneToolEntry/exposureMode are gone', () => {
    // These are compile-time checks; the fact that this file typechecks is the test.
    // @ts-expect-error AgruneGroupEntry is no longer exported
    type _1 = import('../src/manifest.js').AgruneGroupEntry
    // @ts-expect-error AgruneToolEntry is no longer exported
    type _2 = import('../src/manifest.js').AgruneToolEntry
    expect(true).toBe(true)
  })

  it('type-level: v3 manifest rejects version: 2', () => {
    // @ts-expect-error version: 2 not assignable to literal 3
    const m: AgruneManifest = { version: 2, groups: [] }
    expect(m).toBeDefined()
  })
})
