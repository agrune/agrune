// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import {
  resolveByLadder,
  computeAccessibleName,
  assertNoHashClass,
  assertNoNthChild,
  SelectorForbiddenError,
  HASH_CLASS_PATTERN,
  NTH_CHILD_PATTERN,
} from '../src/runtime/target-resolver'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('resolveByLadder — priority', () => {
  it('role > text > testId > attr > css — role wins when present', () => {
    document.body.innerHTML = `
      <button role="button" aria-label="Submit">Save</button>
      <button data-testid="submit-btn">Submit</button>
    `
    const matched = resolveByLadder({
      role: { name: 'button', level: 'Submit' },
      text: 'Save',
      testId: 'submit-btn',
    })
    expect(matched).toHaveLength(1)
    expect(matched[0].getAttribute('aria-label')).toBe('Submit')
  })

  it('text wins when role absent', () => {
    document.body.innerHTML = `<button>Save</button>`
    const matched = resolveByLadder({ text: 'Save' })
    expect(matched).toHaveLength(1)
    expect(matched[0].textContent).toBe('Save')
  })

  it('testId wins when role+text absent', () => {
    document.body.innerHTML = `<div data-testid="user-card">x</div>`
    const matched = resolveByLadder({ testId: 'user-card' })
    expect(matched).toHaveLength(1)
  })

  it('attr wins when role+text+testId absent', () => {
    document.body.innerHTML = `<input data-field="email" />`
    const matched = resolveByLadder({ attr: '[data-field="email"]' })
    expect(matched).toHaveLength(1)
  })

  it('css is last resort', () => {
    document.body.innerHTML = `<button class="submit">x</button>`
    const matched = resolveByLadder({ css: 'button.submit' })
    expect(matched).toHaveLength(1)
  })

  it('returns [] if no step matches', () => {
    document.body.innerHTML = ``
    expect(resolveByLadder({ css: 'button.missing' })).toEqual([])
  })

  it('falls through to lower priority when higher returns empty', () => {
    document.body.innerHTML = `<div data-testid="t1">x</div>`
    // role and text return empty; testId should be used
    const matched = resolveByLadder({
      role: { name: 'button' },
      text: 'NotThere',
      testId: 't1',
    })
    expect(matched).toHaveLength(1)
  })

  it('role without level matches all elements with that role', () => {
    document.body.innerHTML = `
      <button role="button" aria-label="A">A</button>
      <button role="button" aria-label="B">B</button>
    `
    const matched = resolveByLadder({ role: { name: 'button' } })
    expect(matched).toHaveLength(2)
  })

  it('text exact match is preferred over contains match', () => {
    document.body.innerHTML = `
      <button>Submit Form</button>
      <button>Submit</button>
    `
    const matched = resolveByLadder({ text: 'Submit' })
    // exact match ('Submit') should be returned — not the one with 'Submit Form'
    expect(matched).toHaveLength(1)
    expect(matched[0].textContent).toBe('Submit')
  })

  it('text fallback to contains when exact match returns empty', () => {
    document.body.innerHTML = `<button>Submit now</button>`
    const matched = resolveByLadder({ text: 'Submit' })
    expect(matched).toHaveLength(1)
    expect(matched[0].textContent).toBe('Submit now')
  })
})

describe('resolveByLadder — forbidden selectors', () => {
  it('throws on hash class in css', () => {
    expect(() => resolveByLadder({ css: '.abc12345xyz' })).toThrow(SelectorForbiddenError)
  })
  it('throws on hash class in attr', () => {
    expect(() => resolveByLadder({ attr: '.abc12345xyz' })).toThrow(SelectorForbiddenError)
  })
  it('throws on :nth-child in css', () => {
    expect(() => resolveByLadder({ css: 'div:nth-child(2)' })).toThrow(SelectorForbiddenError)
  })
  it('throws on :nth-child in attr', () => {
    expect(() => resolveByLadder({ attr: 'div:nth-child(1)' })).toThrow(SelectorForbiddenError)
  })
  it('allows Tailwind utility classes', () => {
    document.body.innerHTML = `<button class="flex items-center bg-blue-500">X</button>`
    expect(() => resolveByLadder({ css: '.flex.items-center.bg-blue-500' })).not.toThrow()
  })
  it('allows short class names (under 8 chars)', () => {
    document.body.innerHTML = `<button class="btn">X</button>`
    expect(() => resolveByLadder({ css: 'button.btn' })).not.toThrow()
  })
})

describe('computeAccessibleName', () => {
  it('prefers aria-label', () => {
    document.body.innerHTML = `<button aria-label="Alpha">Beta</button>`
    const btn = document.querySelector('button')!
    expect(computeAccessibleName(btn)).toBe('Alpha')
  })
  it('falls back to aria-labelledby referenced text', () => {
    document.body.innerHTML = `<h2 id="hd">Title</h2><button aria-labelledby="hd">X</button>`
    const btn = document.querySelector('button')!
    expect(computeAccessibleName(btn)).toBe('Title')
  })
  it('falls back to textContent', () => {
    document.body.innerHTML = `<button>Only</button>`
    const btn = document.querySelector('button')!
    expect(computeAccessibleName(btn)).toBe('Only')
  })
  it('returns empty string when no name source available', () => {
    document.body.innerHTML = `<button></button>`
    const btn = document.querySelector('button')!
    expect(computeAccessibleName(btn)).toBe('')
  })
})

describe('HASH_CLASS_PATTERN / NTH_CHILD_PATTERN', () => {
  it('HASH_CLASS_PATTERN matches 8+ char class with no trailing hyphen', () => {
    expect(HASH_CLASS_PATTERN.test('.abc12345xy')).toBe(true)
  })
  it('HASH_CLASS_PATTERN rejects Tailwind bg-blue-500', () => {
    expect(HASH_CLASS_PATTERN.test('.bg-blue-500')).toBe(false)
  })
  it('HASH_CLASS_PATTERN rejects items-center (has hyphen in name)', () => {
    expect(HASH_CLASS_PATTERN.test('.items-center')).toBe(false)
  })
  it('NTH_CHILD_PATTERN matches :nth-child(', () => {
    expect(NTH_CHILD_PATTERN.test('div:nth-child(2)')).toBe(true)
  })
})

describe('assertNoHashClass / assertNoNthChild', () => {
  it('assertNoHashClass throws on hash class', () => {
    expect(() => assertNoHashClass('.abc12345def')).toThrow(SelectorForbiddenError)
  })
  it('assertNoHashClass does NOT throw on Tailwind class', () => {
    expect(() => assertNoHashClass('.flex.items-center')).not.toThrow()
  })
  it('assertNoNthChild throws on :nth-child', () => {
    expect(() => assertNoNthChild('div:nth-child(1)')).toThrow(SelectorForbiddenError)
  })
  it('assertNoNthChild does NOT throw on normal selectors', () => {
    expect(() => assertNoNthChild('button.submit')).not.toThrow()
  })
})
