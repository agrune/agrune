// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FiberIdentityPath } from '@agrune/manifest'
import {
  activateRecorderOverlay,
  buildCssFallback,
  buildRoleSelector,
  buildSelectorLadder,
  captureElement,
  generateAutoTargetId,
} from '../src/runtime/recorder-injected'
import type { CaptureResult } from '../src/runtime/recorder-injected'

// Helper — install / uninstall a mock identity bridge via Object.defineProperty
// so Phase 13 configurable:false lock emulation does not apply in tests.
function installBridge(impl: {
  resolvePath?: (el: HTMLElement) => FiberIdentityPath | null
  version?: string
}): void {
  Object.defineProperty(window, '__agrune_identity__', {
    value: {
      resolve: () => null,
      resolvePath: impl.resolvePath ?? (() => null),
      version: impl.version ?? '2',
    },
    configurable: true,
    writable: true,
  })
}

function clearBridge(): void {
  // Some tests set { configurable:true } — delete safely
  if ('__agrune_identity__' in window) {
    try {
      delete (window as { __agrune_identity__?: unknown }).__agrune_identity__
    } catch {
      // ignore if already locked
    }
  }
}

describe('recorder-injected (Phase 16 RECORD-02 Task 3)', () => {
  afterEach(() => {
    clearBridge()
    document.body.innerHTML = ''
  })

  // ──────────────────────── buildRoleSelector ─────────────────────────────

  it('I1: buildRoleSelector uses explicit role + aria-label', () => {
    const el = document.createElement('button')
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', 'Login')
    const r = buildRoleSelector(el)
    expect(r.role).toBe('button')
    expect(r.name).toBe('Login')
  })

  it('I2: buildRoleSelector falls back to tagName lowercase when role missing', () => {
    const el = document.createElement('a')
    el.textContent = 'Home'
    const r = buildRoleSelector(el)
    expect(r.role).toBe('a')
    // textContent collapses whitespace and is slice-limited
    expect(r.name).toBe('Home')
  })

  // ──────────────────────── buildCssFallback ─────────────────────────────

  it('I3: buildCssFallback prefers data-testid, then id, then DOM path', () => {
    const withTest = document.createElement('button')
    withTest.setAttribute('data-testid', 'login-btn')
    expect(buildCssFallback(withTest)).toBe('[data-testid="login-btn"]')

    const withStableId = document.createElement('button')
    withStableId.id = 'login'
    expect(buildCssFallback(withStableId)).toBe('#login')

    // Hash-y id (8+ alnum) is rejected
    const hashyId = document.createElement('button')
    hashyId.id = 'css-hash1234'
    document.body.appendChild(hashyId)
    const fallback = buildCssFallback(hashyId)
    expect(fallback.startsWith('#')).toBe(false)
    expect(fallback.length).toBeGreaterThan(0)
  })

  // ──────────────────────── captureElement ───────────────────────────────

  it('I4: captureElement populates fiberPath when bridge.resolvePath returns a path', () => {
    const path: FiberIdentityPath = [
      { componentName: 'LoginButton', key: null, index: 0 },
    ]
    installBridge({ resolvePath: () => path })
    const el = document.createElement('button')
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', 'Sign in')
    const result = captureElement(el, 1)
    expect(result.fiberPath).toBeDefined()
    expect(result.fiberPath?.[0].componentName).toBe('LoginButton')
  })

  it('I5: captureElement gracefully omits fiberPath when bridge is missing or returns null', () => {
    clearBridge()
    const el = document.createElement('button')
    el.setAttribute('aria-label', 'Click me')
    const result = captureElement(el, 1)
    expect(result.fiberPath).toBeUndefined()
    // Must still produce role + css so downstream ladder is non-empty
    expect(result.roleSelector).toBeDefined()
    expect(result.cssSelector).toBeDefined()

    // Bridge present but resolvePath returns null
    installBridge({ resolvePath: () => null })
    expect(captureElement(el, 2).fiberPath).toBeUndefined()
  })

  it('I6: captureElement sets sensitive:true for <input type="password"> (T-16-04 capture-time)', () => {
    const el = document.createElement('input')
    el.type = 'password'
    const result = captureElement(el, 1)
    expect(result.sensitive).toBe(true)
    // Non-sensitive input: no flag
    const plain = document.createElement('input')
    plain.type = 'text'
    const plainResult = captureElement(plain, 2)
    expect(plainResult.sensitive).toBeUndefined()
  })

  // ──────────────────────── generateAutoTargetId ─────────────────────────

  it('I7: generateAutoTargetId derives from fiber componentName, falls back to tagName', () => {
    const el = document.createElement('button')
    const path: FiberIdentityPath = [
      { componentName: 'LoginButton', key: null, index: 0 },
    ]
    expect(generateAutoTargetId(el, path, 1)).toBe('LoginButton_1')
    expect(generateAutoTargetId(el, undefined, 7)).toBe('button_7')
    // Non-alphanumeric stripping
    const path2: FiberIdentityPath = [
      { componentName: 'My.Scoped-Comp', key: null, index: 0 },
    ]
    expect(generateAutoTargetId(el, path2, 3)).toBe('MyScopedComp_3')
  })

  // ──────────────────────── buildSelectorLadder ──────────────────────────

  it('I8: buildSelectorLadder prioritizes fiber, role, css and always returns ≥1 key', () => {
    const fiberPath: FiberIdentityPath = [
      { componentName: 'LoginButton', key: null, index: 0 },
    ]
    const fullCapture: CaptureResult = {
      url: 'https://example.com',
      fiberPath,
      roleSelector: { role: 'button', name: 'Login' },
      cssSelector: 'button.login',
      autoTargetId: 'loginButton_1',
    }
    const ladder = buildSelectorLadder(fullCapture)
    expect(ladder).not.toBeNull()
    const keys = Object.keys(ladder!)
    expect(keys).toContain('fiber')
    expect(keys).toContain('role')
    expect(keys).toContain('css')

    // css-only capture still builds a valid ladder (AtLeastOne satisfied)
    const cssOnly: CaptureResult = {
      url: 'https://example.com',
      cssSelector: '.foo',
      autoTargetId: 'foo_1',
    }
    const ladder2 = buildSelectorLadder(cssOnly)
    expect(ladder2).not.toBeNull()
    expect(Object.keys(ladder2!)).toEqual(['css'])
  })

  // ──────────────────────── activateRecorderOverlay ──────────────────────

  it('I9: activateRecorderOverlay outlines hovered element', () => {
    const el = document.createElement('div')
    el.textContent = 'target'
    document.body.appendChild(el)

    const captures: CaptureResult[] = []
    const cleanup = activateRecorderOverlay(c => captures.push(c))

    // mousemove over el
    const move = new MouseEvent('mousemove', { bubbles: true })
    Object.defineProperty(move, 'target', { value: el, configurable: true })
    document.dispatchEvent(move)
    expect(el.style.outline).toContain('solid')
    cleanup()
  })

  it('I10: activateRecorderOverlay: click → capture → overlay cleans up (single-shot)', () => {
    const el = document.createElement('button')
    el.textContent = 'Login'
    document.body.appendChild(el)

    const captures: CaptureResult[] = []
    activateRecorderOverlay(c => captures.push(c))

    // Hover then click
    const move = new MouseEvent('mousemove', { bubbles: true })
    Object.defineProperty(move, 'target', { value: el, configurable: true })
    document.dispatchEvent(move)

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(click, 'target', { value: el, configurable: true })
    document.dispatchEvent(click)

    expect(captures.length).toBe(1)
    expect(captures[0].autoTargetId).toContain('_1')

    // Second click after cleanup should not emit another capture
    const click2 = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(click2, 'target', { value: el, configurable: true })
    document.dispatchEvent(click2)
    expect(captures.length).toBe(1)
  })
})
