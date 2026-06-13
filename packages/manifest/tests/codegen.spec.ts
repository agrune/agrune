import { describe, expect, it } from 'vitest'
import type { AgruneManifest } from '../src/schema'
import { actionToCallExpr, generatePlaywrightTests, selectorToLocatorExpr } from '../src/codegen'

const manifest: AgruneManifest = {
  version: 3,
  groups: [
    {
      groupId: 'auth',
      name: 'Login',
      route: '/login',
      targets: [
        { targetId: 'email', name: 'Email', actionKinds: ['fill'], selector: { role: { name: 'textbox', level: 'Email' } } },
        { targetId: 'password', name: 'Password', actionKinds: ['fill'], selector: { testId: 'password' }, sensitive: true },
        { targetId: 'submit', name: 'Sign in', actionKinds: ['click'], selector: { role: { name: 'button', level: 'Sign in' } } },
      ],
    },
  ],
  macros: [
    {
      macroId: 'login',
      name: 'Log in',
      params: {},
      steps: [
        { targetId: 'email', action: 'fill', value: 'a@b.com' },
        { targetId: 'password', action: 'fill', value: 'secret', sensitive: true },
        { targetId: 'submit', action: 'click' },
      ],
    },
  ],
}

describe('selectorToLocatorExpr', () => {
  it('renders role with accessible name', () => {
    expect(selectorToLocatorExpr({ role: { name: 'button', level: 'Sign in' } })).toBe('page.getByRole("button", { name: "Sign in" })')
  })
  it('falls back through the ladder', () => {
    expect(selectorToLocatorExpr({ text: 'Next' })).toBe('page.getByText("Next")')
    expect(selectorToLocatorExpr({ testId: 'pw' })).toBe('page.getByTestId("pw")')
    expect(selectorToLocatorExpr({ css: '.x' })).toBe('page.locator(".x")')
  })
})

describe('actionToCallExpr', () => {
  it('maps actions to Playwright calls', () => {
    expect(actionToCallExpr('L', 'click')).toBe('await L.click()')
    expect(actionToCallExpr('L', 'fill', 'hi')).toBe('await L.fill("hi")')
    expect(actionToCallExpr('L', 'press', 'Enter')).toBe('await L.press("Enter")')
    expect(actionToCallExpr('L', 'contextmenu')).toContain("button: 'right'")
  })
})

describe('generatePlaywrightTests', () => {
  const code = generatePlaywrightTests(manifest, { baseUrl: 'https://example.com/login' })

  it('emits a runnable Playwright file header', () => {
    expect(code).toContain("import { test, expect } from '@playwright/test'")
    expect(code).toContain('AUTO-GENERATED')
  })

  it('emits a per-group drift check that asserts each target visible', () => {
    expect(code).toContain('test.describe("Login"')
    expect(code).toContain('targets resolve (drift check)')
    expect(code).toContain('await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()')
    expect(code).toContain('await expect(page.getByTestId("password")).toBeVisible()')
    expect(code).toContain('await page.goto("https://example.com/login")')
  })

  it('emits the macro flow as an executable test', () => {
    expect(code).toContain("test.describe('macros'")
    expect(code).toContain('test("Log in"')
    expect(code).toContain('await page.getByRole("textbox", { name: "Email" }).fill("a@b.com")')
    expect(code).toContain('await page.getByRole("button", { name: "Sign in" }).click()')
  })

  it('comments out steps whose target is missing', () => {
    const orphan: AgruneManifest = {
      version: 3,
      groups: [],
      macros: [{ macroId: 'm', params: {}, steps: [{ targetId: 'ghost', action: 'click' }] }],
    }
    expect(generatePlaywrightTests(orphan)).toContain('// unresolved target: ghost')
  })
})
