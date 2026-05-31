/**
 * Scenario A — INPUT-01/02/03: browser_fill against tricky-inputs fixture
 * via the real MCP handler → CdpDriver → real Chrome.
 */

import { test, expect } from '@playwright/test'
import {
  createRealHarness,
  realE2eSkipReason,
  waitForTargetByName,
  type RealHarness,
} from './helpers'

const skipReason = realE2eSkipReason()

test.describe('real user-flow: browser_fill end-to-end', () => {
  test.skip(!!skipReason, skipReason ?? '')

  let harness: RealHarness | null = null

  test.beforeEach(async () => {
    harness = await createRealHarness({
      startUrl: 'http://127.0.0.1:5555/tricky-inputs.html',
    })
    // The fixture owns window.__agrune_manifest__; no MCP manifest-load tool is involved.
    await harness.driver.ensureReady()
  })

  test.afterEach(async () => {
    await harness?.teardown()
    harness = null
  })

  test('fills the credit-card input via keystroke strategy', async () => {
    const h = harness!
    const cc = await waitForTargetByName(h.call, t => t.targetId === 'cc-number')
    expect(cc, 'cc-number target in snapshot').not.toBeNull()

    const res = await h.call('browser_fill', {
      targetId: cc!.targetId,
      value: '4242424242424242',
      strategy: 'keystroke',
    })

    const parsed = res.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true)

    // Verify DOM-level outcome directly via CDP Runtime.evaluate so we don't
    // rely on Playwright's browser. Poll briefly because keystroke strategy
    // dispatches per-character events asynchronously.
    await expect
      .poll(() => readInputValue(h, '#cc'), { timeout: 5_000 })
      .toBe('4242424242424242')
  })

  test('fills a contenteditable via auto strategy', async () => {
    const h = harness!
    const bio = await waitForTargetByName(h.call, t => t.targetId === 'bio')
    expect(bio, 'bio contenteditable target in snapshot').not.toBeNull()

    const res = await h.call('browser_fill', {
      targetId: bio!.targetId,
      value: 'hello from real E2E',
    })
    const parsed = res.parsed as { ok?: boolean }
    expect(parsed.ok).toBe(true)

    await expect
      .poll(() => readTextContent(h, '#bio'), { timeout: 5_000 })
      .toContain('hello from real E2E')
  })

  test('keystroke strategy is accepted on a sensitive password input', async () => {
    const h = harness!
    const pw = await waitForTargetByName(h.call, t => t.targetId === 'pw')
    expect(pw, 'pw target in snapshot').not.toBeNull()

    const res = await h.call('browser_fill', {
      targetId: pw!.targetId,
      value: 'hunter2',
      strategy: 'keystroke',
    })
    const parsed = res.parsed as { ok?: boolean }
    expect(parsed.ok).toBe(true)

    await expect
      .poll(() => readInputValue(h, '#pw'), { timeout: 5_000 })
      .toBe('hunter2')
  })
})

async function readInputValue(harness: RealHarness, selector: string): Promise<string> {
  return evaluateInActiveTarget<string>(
    harness,
    `(document.querySelector(${JSON.stringify(selector)})?.value) ?? ''`,
  )
}

async function readTextContent(harness: RealHarness, selector: string): Promise<string> {
  return evaluateInActiveTarget<string>(
    harness,
    `document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`,
  )
}

async function evaluateInActiveTarget<T>(harness: RealHarness, expression: string): Promise<T> {
  // We reach into CdpDriver internals ONLY to observe DOM state. No mutations.
  const anyDriver = harness.driver as unknown as {
    targetManager: { getTargets: () => Array<{ sessionId: string | null }> }
    connection: {
      send: (
        method: string,
        params: Record<string, unknown>,
        sessionId?: string,
      ) => Promise<Record<string, unknown>>
    }
  }
  const target = anyDriver.targetManager.getTargets().find(t => t.sessionId)
  if (!target?.sessionId) throw new Error('no attached session to evaluate in')
  const result = await anyDriver.connection.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    target.sessionId,
  )
  const remote = result.result as { value?: T } | undefined
  return remote?.value as T
}
