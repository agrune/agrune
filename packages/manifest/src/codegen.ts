// Dual-use codegen: turn an agrune manifest into a Playwright test file.
//
// The same drift-resistant selector ladder the agent uses for control becomes a
// stable test asset:
//   - per group: a "targets resolve" drift check (every declared target visible)
//   - per macro: the declared step sequence as an executable flow
//
// Pure string generation — no Playwright runtime dependency here.

import type { ActionKind, AgruneManifest, ManifestTarget, SelectorLadder } from './schema.js'

export interface CodegenOptions {
  /** If set, each test navigates here first. */
  baseUrl?: string
}

function q(value: string): string {
  return JSON.stringify(value ?? '')
}

/** Render a SelectorLadder as a Playwright locator expression (role-first, mirrors resolveLocator). */
export function selectorToLocatorExpr(selector: SelectorLadder, base = 'page'): string {
  if (selector.role) {
    const opts = selector.role.level ? `, { name: ${q(selector.role.level)} }` : ''
    return `${base}.getByRole(${q(selector.role.name)}${opts})`
  }
  if (selector.text) return `${base}.getByText(${q(selector.text)})`
  if (selector.testId) return `${base}.getByTestId(${q(selector.testId)})`
  if (selector.attr) return `${base}.locator(${q(selector.attr)})`
  if (selector.css) return `${base}.locator(${q(selector.css)})`
  return `${base}.locator('body')`
}

/** Render an action against a locator expression as an awaited Playwright call. */
export function actionToCallExpr(locatorExpr: string, action: ActionKind, value?: string): string {
  switch (action) {
    case 'click':
      return `await ${locatorExpr}.click()`
    case 'dblclick':
      return `await ${locatorExpr}.dblclick()`
    case 'contextmenu':
      return `await ${locatorExpr}.click({ button: 'right' })`
    case 'hover':
      return `await ${locatorExpr}.hover()`
    case 'longpress':
      return `await ${locatorExpr}.click({ delay: 650 })`
    case 'type':
      return `await ${locatorExpr}.pressSequentially(${q(value ?? '')})`
    case 'press':
      return `await ${locatorExpr}.press(${q(value ?? 'Enter')})`
    case 'fill':
      return `await ${locatorExpr}.fill(${q(value ?? '')})`
    case 'select':
      return `await ${locatorExpr}.selectOption(${q(value ?? '')})`
    case 'upload':
      return `await ${locatorExpr}.setInputFiles(${q(value ?? '')})`
    case 'drop':
      return `// drop step not auto-generated: ${locatorExpr}`
    default:
      return `// unsupported action '${action}': ${locatorExpr}`
  }
}

/** Generate a Playwright test file (source string) from a manifest. */
export function generatePlaywrightTests(manifest: AgruneManifest, options: CodegenOptions = {}): string {
  const targetsById = new Map<string, ManifestTarget>()
  for (const group of manifest.groups) {
    for (const target of group.targets) targetsById.set(target.targetId, target)
  }

  const goto = options.baseUrl ? `    await page.goto(${q(options.baseUrl)})` : null
  const lines: string[] = [
    '// AUTO-GENERATED from an agrune manifest. Edit the manifest, not this file.',
    `import { test, expect } from '@playwright/test'`,
    '',
  ]

  for (const group of manifest.groups) {
    if (group.targets.length === 0) continue
    lines.push(`test.describe(${q(group.name || group.groupId)}, () => {`)
    lines.push(`  test('targets resolve (drift check)', async ({ page }) => {`)
    if (goto) lines.push(goto)
    for (const target of group.targets) {
      lines.push(`    await expect(${selectorToLocatorExpr(target.selector)}).toBeVisible()`)
    }
    lines.push('  })', '})', '')
  }

  if (manifest.macros && manifest.macros.length > 0) {
    lines.push(`test.describe('macros', () => {`)
    for (const macro of manifest.macros) {
      lines.push(`  test(${q(macro.name || macro.macroId)}, async ({ page }) => {`)
      if (goto) lines.push(goto)
      for (const step of macro.steps) {
        const target = targetsById.get(step.targetId)
        if (!target) {
          lines.push(`    // unresolved target: ${step.targetId}`)
          continue
        }
        const locatorExpr = selectorToLocatorExpr(target.selector)
        lines.push(`    ${actionToCallExpr(locatorExpr, step.action, step.value)}`)
      }
      lines.push('  })')
    }
    lines.push('})', '')
  }

  return lines.join('\n')
}
