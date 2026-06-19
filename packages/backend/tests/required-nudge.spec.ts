import { describe, expect, it } from 'vitest'
import type { PageTarget } from '@agrune/core'
import { pendingRequiredFields } from '../src/required-nudge'

const t = (over: Partial<PageTarget>): PageTarget =>
  ({
    targetId: 'x',
    groupId: 'g',
    groupName: 'G',
    name: 'Field',
    description: '',
    actionKinds: ['fill'],
    selector: { css: '#x' },
    visible: true,
    inViewport: true,
    enabled: true,
    covered: false,
    actionableNow: true,
    reason: 'ready',
    overlay: false,
    sensitive: false,
    valuePreview: null,
    hasValue: false,
    sourceFile: '',
    sourceLine: 0,
    sourceColumn: 0,
    domResolved: true,
    ...over,
  }) as unknown as PageTarget

describe('pendingRequiredFields', () => {
  it('lists visible required fillable fields that hold no value', () => {
    const targets = [
      t({ name: 'Title', required: true, hasValue: false }),
      t({ name: 'Assignee', required: true, hasValue: false }),
    ]
    expect(pendingRequiredFields(targets)).toEqual(['Title', 'Assignee'])
  })

  it('drops a required field once it holds a value', () => {
    const targets = [
      t({ name: 'Title', required: true, hasValue: true }),
      t({ name: 'Assignee', required: true, hasValue: false }),
    ]
    expect(pendingRequiredFields(targets)).toEqual(['Assignee'])
  })

  it('ignores non-required and non-fillable (e.g. the submit button) targets', () => {
    const targets = [
      t({ name: 'Optional', required: false, hasValue: false }),
      t({ name: 'Submit', required: true, hasValue: false, actionKinds: ['click'] }),
      t({ name: 'Title', required: true, hasValue: false }),
    ]
    expect(pendingRequiredFields(targets)).toEqual(['Title'])
  })

  it('ignores hidden required fields (later wizard steps not yet shown)', () => {
    const targets = [
      t({ name: 'Hidden', required: true, hasValue: false, visible: false }),
      t({ name: 'Title', required: true, hasValue: false }),
    ]
    expect(pendingRequiredFields(targets)).toEqual(['Title'])
  })

  it('dedupes by name and caps at the limit', () => {
    const targets = Array.from({ length: 10 }, (_, i) =>
      t({ name: 'F' + i, required: true, hasValue: false }),
    )
    expect(pendingRequiredFields(targets, 3)).toHaveLength(3)
  })
})
