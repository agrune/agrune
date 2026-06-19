import { describe, expect, it } from 'vitest'
import { axMessageDelta } from '../src/screen-delta'

describe('axMessageDelta', () => {
  it('surfaces a newly appeared informational line, cleaned to bare text', () => {
    const prev = ['- form:', '  - textbox "Description"', '  - button "Next"']
    const cur = [
      '- form:',
      '  - textbox "Description"',
      '  - text: Description is required',
      '  - button "Next"',
    ]
    expect(axMessageDelta(prev, cur)).toEqual(['Description is required'])
  })

  it('ignores interactive controls (those are the manifest job, not messages)', () => {
    const prev = ['- dialog:']
    const cur = ['- dialog:', '  - button "Launch instance"', '  - checkbox "I acknowledge"']
    expect(axMessageDelta(prev, cur)).toEqual([])
  })

  it('returns nothing when the frame did not change', () => {
    const lines = ['- alert: Saved', '- button "OK"']
    expect(axMessageDelta(lines, lines)).toEqual([])
  })

  it('excludes volatile region text (clock/counter) from the delta', () => {
    const prev = ['- status: 0']
    const cur = ['- status: 1', '- alert: Description is required']
    // Without exclude, the counter "1" would leak in alongside the real message.
    expect(axMessageDelta(prev, cur)).toEqual(['1', 'Description is required'])
    // Excluding the volatile counter's current text drops it, keeps the real message.
    expect(axMessageDelta(prev, cur, ['1'])).toEqual(['Description is required'])
  })

  it('captures alert/status roles and dedupes, capped at 6', () => {
    const prev: string[] = []
    const cur = [
      '- alert: First problem',
      '- status: Saving…',
      '- alert: First problem',
      '- text: Second problem',
      '- note: a',
      '- caption: b',
      '- heading: c',
      '- tooltip: d',
    ]
    const out = axMessageDelta(prev, cur)
    expect(out).toContain('First problem')
    expect(out).toContain('Saving…')
    expect(out.filter(m => m === 'First problem')).toHaveLength(1)
    expect(out.length).toBeLessThanOrEqual(6)
  })
})
