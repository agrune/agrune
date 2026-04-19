// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { isSensitive } from '../src/runtime/dom-utils'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('isSensitive — OR-only contract', () => {
  it('returns true when manifest flag is true (overrides all)', () => {
    document.body.innerHTML = `<input type="text" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el, true)).toBe(true)
  })

  it('returns true when DOM has type=password (regardless of manifest)', () => {
    document.body.innerHTML = `<input type="password" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
    expect(isSensitive(el, undefined)).toBe(true)
  })

  it('returns false for plain input when manifest flag absent', () => {
    document.body.innerHTML = `<input type="text" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(false)
    expect(isSensitive(el, undefined)).toBe(false)
  })

  it('backward-compat: single-arg call still works', () => {
    document.body.innerHTML = `<input type="text" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(false)
  })

  it('detects autocomplete=current-password', () => {
    document.body.innerHTML = `<input type="text" autocomplete="current-password" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=new-password', () => {
    document.body.innerHTML = `<input type="text" autocomplete="new-password" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=one-time-code', () => {
    document.body.innerHTML = `<input type="text" autocomplete="one-time-code" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=cc-number', () => {
    document.body.innerHTML = `<input type="text" autocomplete="cc-number" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=cc-csc', () => {
    document.body.innerHTML = `<input type="text" autocomplete="cc-csc" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=cc-exp', () => {
    document.body.innerHTML = `<input type="text" autocomplete="cc-exp" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects legacy data-agrune-sensitive=true (maintained until Phase 17)', () => {
    document.body.innerHTML = `<input type="text" data-agrune-sensitive="true" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('type-level: manifestFlag: false is not allowed', () => {
    const el = document.createElement('input')
    // @ts-expect-error manifestFlag must be `true | undefined`, not `false`
    void isSensitive(el, false)
    expect(true).toBe(true)
  })

  it('OR combination: non-password input + manifest true = true', () => {
    document.body.innerHTML = `<input type="text" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el, true)).toBe(true)
  })
})
