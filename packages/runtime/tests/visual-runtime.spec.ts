// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { animatePointer, applyConfig, getConfig } from '../src/visual-runtime'

beforeEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  // Aurora uses WebGL (unavailable in jsdom) — keep it off for unit tests.
  applyConfig({ auroraGlow: false, pointerAnimation: false })
})

describe('visual runtime', () => {
  it('merges config patches and reports the merged config', () => {
    const merged = applyConfig({ cursorName: 'default', pointerDurationMs: 120 })
    expect(merged.pointerDurationMs).toBe(120)
    expect(getConfig().pointerDurationMs).toBe(120)
  })

  it('is a no-op while pointerAnimation is disabled', async () => {
    applyConfig({ pointerAnimation: false })
    await animatePointer(100, 100)
    expect(document.querySelector('[data-agrune-pointer]')).toBe(null)
  })

  it('creates and moves the cursor overlay when enabled', async () => {
    applyConfig({ pointerAnimation: true, pointerDurationMs: 0 })
    await animatePointer(50, 60, { press: false })
    const cursor = document.querySelector<HTMLElement>('[data-agrune-pointer]')
    expect(cursor).not.toBe(null)
    expect(cursor?.style.display).toBe('block')
  })

  it('hides the overlay when pointerAnimation is turned off again', async () => {
    applyConfig({ pointerAnimation: true, pointerDurationMs: 0 })
    await animatePointer(10, 10, { press: false })
    applyConfig({ pointerAnimation: false })
    const cursor = document.querySelector<HTMLElement>('[data-agrune-pointer]')
    expect(cursor?.style.display).toBe('none')
  })
})
