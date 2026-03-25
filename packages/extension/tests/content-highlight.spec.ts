import { afterEach, describe, expect, it, vi } from 'vitest'
import { showHighlight, clearHighlight } from '../src/content/highlight-overlay'

describe('highlight-overlay', () => {
  afterEach(() => {
    clearHighlight()
    document.body.innerHTML = ''
  })

  it('creates an overlay on the target element', () => {
    document.body.innerHTML = '<button data-agrune-key="login">Login</button>'
    showHighlight({ selector: '[data-agrune-key="login"]', targetId: 't-1' })
    const overlay = document.querySelector('[data-agrune-highlight]')
    expect(overlay).not.toBeNull()
  })

  it('removes overlay on clearHighlight', () => {
    document.body.innerHTML = '<button data-agrune-key="login">Login</button>'
    showHighlight({ selector: '[data-agrune-key="login"]', targetId: 't-1' })
    clearHighlight()
    const overlay = document.querySelector('[data-agrune-highlight]')
    expect(overlay).toBeNull()
  })

  it('replaces existing overlay when highlighting a new target', () => {
    document.body.innerHTML = `
      <button data-agrune-key="a">A</button>
      <button data-agrune-key="b">B</button>
    `
    showHighlight({ selector: '[data-agrune-key="a"]', targetId: 't-a' })
    showHighlight({ selector: '[data-agrune-key="b"]', targetId: 't-b' })
    const overlays = document.querySelectorAll('[data-agrune-highlight]')
    expect(overlays.length).toBe(1)
  })

  it('does nothing when selector matches no element', () => {
    showHighlight({ selector: '[data-agrune-key="nonexistent"]', targetId: 't-x' })
    const overlay = document.querySelector('[data-agrune-highlight]')
    expect(overlay).toBeNull()
  })
})
