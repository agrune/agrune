// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// dom-utils mock must be HOISTED before the module under test is imported
// ---------------------------------------------------------------------------
vi.mock('../src/runtime/dom-utils', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    isElementInViewport: vi.fn((_el: HTMLElement) => true),
  }
})

import { RepeatExpander, REPEAT_MAX_INSTANCES } from '../src/runtime/repeat-expander'
import type { RepeatInstance, VirtualizedExpandResult } from '../src/runtime/repeat-expander'
import type { ManifestRepeat } from '../src/types'
import { isElementInViewport } from '../src/runtime/dom-utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepeat(overrides: Partial<ManifestRepeat> = {}): ManifestRepeat {
  return {
    repeatId: 'posts',
    template: 'post_${key}',
    keyFrom: 'el.dataset.postId',
    strategy: 'dom',
    targets: [
      {
        targetId: 'like_btn',
        name: 'Like',
        actionKinds: ['click'],
        selector: { css: 'li.post-item' },
      },
    ],
    ...overrides,
  }
}

function make10RowDOM(): HTMLElement {
  const container = document.createElement('ul')
  container.setAttribute('data-testid', 'feed-container')
  for (let i = 0; i < 10; i++) {
    const li = document.createElement('li')
    li.className = 'post-item'
    li.dataset.postId = `post-${i}`
    li.textContent = `Post ${i}`
    container.appendChild(li)
  }
  document.body.appendChild(container)
  return container
}

function make100RowDOM(visibleCount = 5): { container: HTMLElement; items: HTMLElement[] } {
  const container = document.createElement('ul')
  container.setAttribute('role', 'list')
  const items: HTMLElement[] = []
  for (let i = 0; i < 100; i++) {
    const li = document.createElement('li')
    li.className = 'row-item'
    li.dataset.rowId = `row-${i}`
    if (i < visibleCount) li.classList.add('visible')
    container.appendChild(li)
    items.push(li)
  }
  document.body.appendChild(container)
  return { container, items }
}

// ---------------------------------------------------------------------------
// DOM strategy tests — 10-row fixture
// ---------------------------------------------------------------------------

describe('RepeatExpander — DOM strategy (10-row fixture)', () => {
  let container: HTMLElement
  let expander: RepeatExpander

  beforeEach(() => {
    document.body.innerHTML = ''
    container = make10RowDOM()
    expander = new RepeatExpander()
    // Reset isElementInViewport to default (return true)
    vi.mocked(isElementInViewport).mockImplementation(() => true)
  })

  it('Test 1: 10-row DOM → 10 instances with correct key and index', () => {
    const repeat = makeRepeat()
    const instances = expander.expand(repeat, container)

    expect(instances).toHaveLength(10)
    instances.forEach((inst: RepeatInstance, i: number) => {
      expect(inst.index).toBe(i)
      expect(inst.key).toBe(`post-${i}`)
      expect(inst.el).toBeInstanceOf(HTMLElement)
    })
  })

  it('Test 2: no container arg → enumerate from document scope', () => {
    const repeat = makeRepeat()
    // expand without providing container — uses document
    const instances = expander.expand(repeat)
    expect(instances).toHaveLength(10)
  })

  it('Test 3: container arg limits scope (items outside container excluded)', () => {
    // Create items outside of the feed container
    const outsideLi = document.createElement('li')
    outsideLi.className = 'post-item'
    outsideLi.dataset.postId = 'outside-post'
    document.body.appendChild(outsideLi)

    // Only items INSIDE container should be found
    const instances = expander.expand(makeRepeat(), container)
    expect(instances).toHaveLength(10)
    expect(instances.map((i: RepeatInstance) => i.key)).not.toContain('outside-post')
  })

  it('Test 4: keyFrom returning undefined/null → fallback __idx_{index} + warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repeat = makeRepeat({ keyFrom: 'el.dataset.noSuchAttribute' })
    const instances = expander.expand(repeat, container)

    // All instances should fall back
    instances.forEach((inst: RepeatInstance, i: number) => {
      expect(inst.key).toBe(`__idx_${i}`)
    })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('Test 5: keyFrom syntax error → fallback + warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Syntax error during new Function compile: '???' is invalid JS
    const repeat = makeRepeat({ keyFrom: 'el.???' })
    const instances = expander.expand(repeat, container)

    instances.forEach((inst: RepeatInstance, i: number) => {
      expect(inst.key).toBe(`__idx_${i}`)
    })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('Test 6: duplicate key → __dup_ suffix + warn', () => {
    const dupeContainer = document.createElement('ul')
    for (let i = 0; i < 3; i++) {
      const li = document.createElement('li')
      li.className = 'post-item'
      li.dataset.postId = 'same-key'
      dupeContainer.appendChild(li)
    }
    document.body.appendChild(dupeContainer)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repeat = makeRepeat()
    const instances = expander.expand(repeat, dupeContainer)

    // First one keeps 'same-key', rest get dup suffix
    expect(instances[0].key).toBe('same-key')
    expect(instances[1].key).toBe('same-key__dup_1')
    expect(instances[2].key).toBe('same-key__dup_2')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate key'))
    warnSpy.mockRestore()
  })

  it('Test 7: row count > REPEAT_MAX_INSTANCES → truncated to 1000 + warn', () => {
    const bigContainer = document.createElement('ul')
    for (let i = 0; i < 1001; i++) {
      const li = document.createElement('li')
      li.className = 'post-item'
      li.dataset.postId = `p${i}`
      bigContainer.appendChild(li)
    }
    document.body.appendChild(bigContainer)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repeat = makeRepeat()
    const instances = expander.expand(repeat, bigContainer)

    expect(instances).toHaveLength(REPEAT_MAX_INSTANCES)
    expect(REPEAT_MAX_INSTANCES).toBe(1000)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('truncated'))
    warnSpy.mockRestore()
  })

  it('Test 8: keyFrom compile error (CSP EvalError simulation) → fallback key + warn', () => {
    // Simulate CSP by passing an expression that throws during compile.
    // We use a keyFrom that has a syntax error causing new Function to throw SyntaxError.
    // To specifically test the EvalError path, we check that any Error during new Function
    // compilation triggers the warn + fallback behavior.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Passing a broken expression that throws SyntaxError during new Function construction
    // (similar to what EvalError would do in CSP-blocked environments)
    const repeat = makeRepeat({ keyFrom: 'return /* broken */' })
    const instances = expander.expand(repeat, container)

    instances.forEach((inst: RepeatInstance, i: number) => {
      expect(inst.key).toBe(`__idx_${i}`)
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('keyFrom compile failed'),
      expect.anything(),
    )
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Virtualized strategy tests — 100-row fixture (5 visible)
// ---------------------------------------------------------------------------

describe('RepeatExpander — Virtualized strategy (100-row fixture)', () => {
  let expander: RepeatExpander

  beforeEach(() => {
    document.body.innerHTML = ''
    expander = new RepeatExpander()
    // Default: isElementInViewport returns true
    vi.mocked(isElementInViewport).mockImplementation(() => true)
  })

  function makeVirtualizedRepeat(overrides: Partial<ManifestRepeat> = {}): ManifestRepeat {
    return makeRepeat({
      strategy: 'virtualized',
      keyFrom: 'el.dataset.rowId',
      targets: [
        {
          targetId: 'row_item',
          name: 'Row',
          actionKinds: ['click'],
          selector: { css: 'li.row-item' },
        },
      ],
      ...overrides,
    })
  }

  it('Test 9: viewport-only rows returned (5 of 100)', () => {
    // Mock isElementInViewport to return true only for .visible elements
    vi.mocked(isElementInViewport).mockImplementation((el: HTMLElement) =>
      el.classList.contains('visible'),
    )

    const { container } = make100RowDOM(5)
    const repeat = makeVirtualizedRepeat()
    const result: VirtualizedExpandResult = expander.expandVirtualized(repeat, container)

    expect(result.instances).toHaveLength(5)
    result.instances.forEach((inst: RepeatInstance, i: number) => {
      expect(inst.key).toBe(`row-${i}`)
    })
  })

  it('Test 10: aria-rowcount="100" → logicalSize=100', () => {
    vi.mocked(isElementInViewport).mockImplementation((el: HTMLElement) =>
      el.classList.contains('visible'),
    )

    const { container } = make100RowDOM(5)
    container.setAttribute('aria-rowcount', '100')

    const result = expander.expandVirtualized(makeVirtualizedRepeat(), container)
    expect(result.logicalSize).toBe(100)
  })

  it('Test 11: aria-setsize="50" (no aria-rowcount) → logicalSize=50', () => {
    vi.mocked(isElementInViewport).mockImplementation((el: HTMLElement) =>
      el.classList.contains('visible'),
    )

    const { container } = make100RowDOM(5)
    container.setAttribute('aria-setsize', '50')
    // no aria-rowcount

    const result = expander.expandVirtualized(makeVirtualizedRepeat(), container)
    expect(result.logicalSize).toBe(50)
  })

  it('Test 12: no aria-rowcount or aria-setsize → logicalSize=null', () => {
    vi.mocked(isElementInViewport).mockImplementation((el: HTMLElement) =>
      el.classList.contains('visible'),
    )

    const { container } = make100RowDOM(5)

    const result = expander.expandVirtualized(makeVirtualizedRepeat(), container)
    expect(result.logicalSize).toBeNull()
  })

  it('Test 13: aria-rowcount="abc" (NaN) → logicalSize=null', () => {
    vi.mocked(isElementInViewport).mockImplementation((el: HTMLElement) =>
      el.classList.contains('visible'),
    )

    const { container } = make100RowDOM(5)
    container.setAttribute('aria-rowcount', 'abc')

    const result = expander.expandVirtualized(makeVirtualizedRepeat(), container)
    expect(result.logicalSize).toBeNull()
  })

  it('Test 14: expandVirtualized does NOT write aria-rowcount (READ-ONLY)', () => {
    vi.mocked(isElementInViewport).mockImplementation(() => true)

    const { container } = make100RowDOM(5)
    // Container has no aria-rowcount initially
    expect(container.hasAttribute('aria-rowcount')).toBe(false)

    expander.expandVirtualized(makeVirtualizedRepeat(), container)

    // Must not have been written
    expect(container.hasAttribute('aria-rowcount')).toBe(false)
    expect(container.hasAttribute('aria-setsize')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Shared tests
// ---------------------------------------------------------------------------

describe('RepeatExpander — shared', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(isElementInViewport).mockImplementation(() => true)
  })

  it('Test 15: RepeatExpander is instantiable, has expand() and expandVirtualized()', () => {
    const expander = new RepeatExpander()
    expect(typeof expander.expand).toBe('function')
    expect(typeof expander.expandVirtualized).toBe('function')
  })

  it('Test 16: RepeatInstance type shape — el, key, index', () => {
    const li = document.createElement('li')
    li.className = 'post-item'
    li.dataset.postId = 'test-post'
    document.body.appendChild(li)

    const expander = new RepeatExpander()
    // Provide explicit container to avoid stale DOM interference
    const instances = expander.expand(makeRepeat(), document.body as unknown as HTMLElement)

    expect(instances).toHaveLength(1)
    expect(instances[0]).toMatchObject({
      el: expect.any(HTMLElement),
      key: 'test-post',
      index: 0,
    })
  })

  it('Test 17: REPEAT_MAX_INSTANCES = 1000', () => {
    expect(REPEAT_MAX_INSTANCES).toBe(1000)
  })
})
