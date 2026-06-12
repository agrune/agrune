// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { captureElementState, expandRepeatRows, readContainerLogicalSize } from '../src/page-functions'

function makeRows(html: string): HTMLElement[] {
  document.body.innerHTML = html
  return Array.from(document.querySelectorAll<HTMLElement>('[data-row]'))
}

function mockRect(el: HTMLElement, rect: { top: number; left: number; width: number; height: number }): void {
  el.getBoundingClientRect = () => ({
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect
}

const BASE_ARGS = { nameFrom: null, virtualized: false, maxInstances: 1000 }

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('expandRepeatRows', () => {
  it('derives stable keys from the keyFrom expression', () => {
    const rows = makeRows(`
      <div data-row data-id="a"></div>
      <div data-row data-id="b"></div>
    `)
    const result = expandRepeatRows(rows, { ...BASE_ARGS, keyFrom: 'el.dataset.id' })
    expect(result.map(row => row.key)).toEqual(['a', 'b'])
    expect(result.map(row => row.domIndex)).toEqual([0, 1])
    expect(result.map(row => row.index)).toEqual([0, 1])
  })

  it('suffixes duplicate keys with __dup_{index}', () => {
    const rows = makeRows(`
      <div data-row data-id="same"></div>
      <div data-row data-id="same"></div>
      <div data-row data-id="same"></div>
    `)
    const result = expandRepeatRows(rows, { ...BASE_ARGS, keyFrom: 'el.dataset.id' })
    expect(result.map(row => row.key)).toEqual(['same', 'same__dup_1', 'same__dup_2'])
  })

  it('falls back to __idx_{index} when keyFrom evaluation fails for a row', () => {
    const rows = makeRows(`
      <div data-row data-id="ok"></div>
      <div data-row></div>
    `)
    const result = expandRepeatRows(rows, { ...BASE_ARGS, keyFrom: 'el.dataset.id.toUpperCase()' })
    expect(result[0]?.key).toBe('OK')
    expect(result[1]?.key).toBe('__idx_1')
  })

  it('falls back for every row when keyFrom does not compile', () => {
    const rows = makeRows(`
      <div data-row></div>
      <div data-row></div>
    `)
    const result = expandRepeatRows(rows, { ...BASE_ARGS, keyFrom: 'this is not js (' })
    expect(result.map(row => row.key)).toEqual(['__idx_0', '__idx_1'])
  })

  it('falls back when keyFrom yields undefined/null text', () => {
    const rows = makeRows('<div data-row></div>')
    const result = expandRepeatRows(rows, { ...BASE_ARGS, keyFrom: 'el.dataset.missing' })
    expect(result[0]?.key).toBe('__idx_0')
  })

  it('evaluates nameFrom and swallows per-row failures', () => {
    const rows = makeRows(`
      <div data-row data-id="a" data-name=" First "></div>
      <div data-row data-id="b"></div>
    `)
    const result = expandRepeatRows(rows, {
      ...BASE_ARGS,
      keyFrom: 'el.dataset.id',
      nameFrom: 'el.dataset.name.trim()',
    })
    expect(result[0]?.name).toBe('First')
    expect(result[1]?.name).toBe('')
  })

  it('caps instances at maxInstances', () => {
    const rows = makeRows(Array.from({ length: 5 }, (_, i) => `<div data-row data-id="r${i}"></div>`).join(''))
    const result = expandRepeatRows(rows, { ...BASE_ARGS, keyFrom: 'el.dataset.id', maxInstances: 3 })
    expect(result).toHaveLength(3)
    expect(result.map(row => row.key)).toEqual(['r0', 'r1', 'r2'])
  })

  it('virtualized mode keeps only in-viewport rows but preserves domIndex', () => {
    const rows = makeRows(`
      <div data-row data-id="off-top"></div>
      <div data-row data-id="visible"></div>
      <div data-row data-id="off-bottom"></div>
    `)
    mockRect(rows[0]!, { top: -500, left: 0, width: 100, height: 40 })
    mockRect(rows[1]!, { top: 100, left: 0, width: 100, height: 40 })
    mockRect(rows[2]!, { top: window.innerHeight + 500, left: 0, width: 100, height: 40 })

    const result = expandRepeatRows(rows, { ...BASE_ARGS, keyFrom: 'el.dataset.id', virtualized: true })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ key: 'visible', domIndex: 1, index: 0 })
  })
})

describe('readContainerLogicalSize', () => {
  it('prefers aria-rowcount over aria-setsize, rejects invalid values', () => {
    document.body.innerHTML = '<div id="c" aria-rowcount="120" aria-setsize="50"></div>'
    expect(readContainerLogicalSize(document.querySelector('#c')!)).toBe(120)

    document.body.innerHTML = '<div id="c" aria-setsize="50"></div>'
    expect(readContainerLogicalSize(document.querySelector('#c')!)).toBe(50)

    document.body.innerHTML = '<div id="c" aria-rowcount="-1" aria-setsize="50"></div>'
    expect(readContainerLogicalSize(document.querySelector('#c')!)).toBe(null)

    document.body.innerHTML = '<div id="c"></div>'
    expect(readContainerLogicalSize(document.querySelector('#c')!)).toBe(null)
  })
})

describe('captureElementState', () => {
  it('masks valuePreview for sensitive inputs (OR-only with manifest flag)', () => {
    document.body.innerHTML = `
      <input id="plain" value="hello" />
      <input id="pw" type="password" value="secret" />
    `
    const plain = document.querySelector<HTMLElement>('#plain')!
    const pw = document.querySelector<HTMLElement>('#pw')!

    expect(captureElementState(plain).sensitive).toBe(false)
    expect(captureElementState(plain).valuePreview).toBe('hello')
    expect(captureElementState(pw).sensitive).toBe(true)
    expect(captureElementState(pw).valuePreview).toBe(null)
    expect(captureElementState(plain, { sensitiveFlag: true }).valuePreview).toBe(null)
  })

  it('detects overlay ancestry via role=dialog / aria-modal', () => {
    document.body.innerHTML = `
      <div role="dialog"><button id="in-dialog">ok</button></div>
      <button id="outside">no</button>
    `
    expect(captureElementState(document.querySelector('#in-dialog')!).overlay).toBe(true)
    expect(captureElementState(document.querySelector('#outside')!).overlay).toBe(false)
  })

  it('reports hidden reason when the element has no layout box', () => {
    document.body.innerHTML = '<button id="b">x</button>'
    const state = captureElementState(document.querySelector('#b')!)
    expect(state.visible).toBe(false)
    expect(state.reason).toBe('hidden')
    expect(state.actionableNow).toBe(false)
  })
})
