import { describe, it, expect } from 'vitest'
import { defineManifest, defineGroup, defineTarget, defineRepeat, defineMacro } from '../src/index.js'

describe('defineTarget', () => {
  it('preserves targetId literal type and fields', () => {
    const t = defineTarget({
      targetId: 'login_submit',
      actionKinds: ['click'],
      selector: { role: { name: 'button', level: 'Sign in' } },
    })
    expect(t.targetId).toBe('login_submit')
    expect(t.actionKinds).toEqual(['click'])
  })

  it('accepts multiple action kinds', () => {
    const t = defineTarget({
      targetId: 'multi',
      actionKinds: ['click', 'hover', 'dblclick'],
      selector: { css: 'button.primary' },
    })
    expect(t.actionKinds).toEqual(['click', 'hover', 'dblclick'])
  })

  it('accepts sensitive: true', () => {
    const t = defineTarget({
      targetId: 'pw_field',
      actionKinds: ['fill'],
      selector: { testId: 'password' },
      sensitive: true,
    })
    expect(t.sensitive).toBe(true)
  })

  it('rejects sensitive:false at type level', () => {
    defineTarget({
      targetId: 'pw',
      actionKinds: ['fill'],
      selector: { css: 'input' },
      // @ts-expect-error sensitive: false is not allowed — OR-only contract
      sensitive: false,
    })
    expect(true).toBe(true)
  })

  it('rejects invalid action kind at type level', () => {
    defineTarget({
      targetId: 'x',
      // @ts-expect-error 'submit' is not a valid ActionKind
      actionKinds: ['submit'],
      selector: { css: 'button' },
    })
    expect(true).toBe(true)
  })

  it('rejects empty SelectorLadder at type level', () => {
    defineTarget({
      targetId: 'x',
      actionKinds: ['click'],
      // @ts-expect-error SelectorLadder requires at least one field — AtLeastOne<T>
      selector: {},
    })
    expect(true).toBe(true)
  })

  it('preserves optional name and desc', () => {
    const t = defineTarget({
      targetId: 'btn',
      name: 'Submit',
      desc: 'Submits the form',
      actionKinds: ['click'],
      selector: { text: 'Submit' },
    })
    expect(t.name).toBe('Submit')
    expect(t.desc).toBe('Submits the form')
  })
})

describe('defineRepeat', () => {
  it('accepts dom strategy', () => {
    const r = defineRepeat({
      repeatId: 'feed',
      template: 'post_${key}',
      keyFrom: 'el.dataset.postId',
      strategy: 'dom',
      targets: [],
    })
    expect(r.strategy).toBe('dom')
  })

  it('accepts virtualized strategy', () => {
    const r = defineRepeat({
      repeatId: 'rows',
      template: 'row_${key}',
      keyFrom: 'el.dataset.rowId',
      strategy: 'virtualized',
      targets: [],
    })
    expect(r.strategy).toBe('virtualized')
  })

  it('accepts optional nameFrom field', () => {
    const r = defineRepeat({
      repeatId: 'items',
      template: 'item_${key}',
      keyFrom: 'el.dataset.id',
      nameFrom: 'el.textContent',
      strategy: 'dom',
      targets: [],
    })
    expect(r.nameFrom).toBe('el.textContent')
  })

  it('rejects invalid strategy at type level', () => {
    defineRepeat({
      repeatId: 'x',
      template: 't',
      keyFrom: 'k',
      // @ts-expect-error 'canvas' is not a valid strategy
      strategy: 'canvas',
      targets: [],
    })
    expect(true).toBe(true)
  })
})

describe('defineMacro', () => {
  it('accepts full macro shape', () => {
    const m = defineMacro({
      macroId: 'login',
      params: {
        email: { type: 'string', required: true },
        password: { type: 'string', required: true },
      },
      steps: [{ targetId: 'login_email', action: 'fill', value: '${params.email}' }],
      precondition: 'document.querySelector(".login-form") !== null',
      postcondition: 'location.pathname !== "/login"',
      circuitBreaker: { maxRetries: 3, resetAfterMs: 60000 },
    })
    expect(m.macroId).toBe('login')
    expect(m.steps).toHaveLength(1)
    expect(m.circuitBreaker?.maxRetries).toBe(3)
  })

  it('accepts sensitive step', () => {
    const m = defineMacro({
      macroId: 'fill_sensitive',
      params: {},
      steps: [{ targetId: 'pw', action: 'fill', sensitive: true }],
    })
    expect(m.steps[0].sensitive).toBe(true)
  })

  it('accepts minimal macro without optional fields', () => {
    const m = defineMacro({
      macroId: 'simple',
      params: {},
      steps: [{ targetId: 'btn', action: 'click' }],
    })
    expect(m.macroId).toBe('simple')
    expect(m.precondition).toBeUndefined()
    expect(m.circuitBreaker).toBeUndefined()
  })
})

describe('defineGroup', () => {
  it('returns object with groupId and targets', () => {
    const t = defineTarget({ targetId: 'btn', actionKinds: ['click'], selector: { css: 'button' } })
    const g = defineGroup({ groupId: 'main', targets: [t] })
    expect(g.groupId).toBe('main')
    expect(g.targets).toHaveLength(1)
  })

  it('accepts optional route', () => {
    const g = defineGroup({ groupId: 'login_page', route: '/login', targets: [] })
    expect(g.route).toBe('/login')
  })
})

describe('defineManifest', () => {
  it('injects version: 3 and preserves groups', () => {
    const target = defineTarget({
      targetId: 'submit',
      actionKinds: ['click'],
      selector: { role: { name: 'button' } },
    })
    const group = defineGroup({ groupId: 'form', targets: [target] })
    const manifest = defineManifest({ groups: [group] })
    expect(manifest.version).toBe(3)
    expect(manifest.groups).toHaveLength(1)
  })

  it('includes macros when provided', () => {
    const macro = defineMacro({ macroId: 'test', params: {}, steps: [{ targetId: 'btn', action: 'click' }] })
    const manifest = defineManifest({ groups: [], macros: [macro] })
    expect(manifest.macros).toHaveLength(1)
  })

  it('omits macros key when not provided', () => {
    const manifest = defineManifest({ groups: [] })
    expect(manifest.macros).toBeUndefined()
  })
})
