/**
 * browser_handle_dialog against real Chrome JavaScript dialogs.
 */

import { test, expect } from '@playwright/test'
import {
  createRealHarness,
  realE2eSkipReason,
  waitForTargetByName,
  type RealHarness,
} from './helpers'

const skipReason = realE2eSkipReason()

test.describe('real user-flow: browser_handle_dialog end-to-end', () => {
  test.skip(!!skipReason, skipReason ?? '')

  let harness: RealHarness | null = null

  test.beforeEach(async () => {
    harness = await createRealHarness({
      startUrl: 'http://127.0.0.1:5555/dialogs.html',
    })
    await harness.driver.ensureReady()
  })

  test.afterEach(async () => {
    await harness?.teardown()
    harness = null
  })

  test('dismisses a confirm dialog opened by click without hanging', async () => {
    const h = harness!
    const target = await waitForTargetByName(h.call, t => t.targetId === 'confirm-button')
    expect(target, 'confirm-button target in snapshot').not.toBeNull()

    const clicked = await h.call('browser_click', { targetId: target!.targetId })
    const clickParsed = clicked.parsed as {
      ok?: boolean
      result?: { dialog?: { handled?: boolean; type?: string; message?: string } }
    }
    expect(clickParsed.ok, clicked.text).toBe(true)
    expect(clickParsed.result?.dialog).toMatchObject({
      type: 'confirm',
      message: 'Delete item?',
      handled: false,
    })

    const handled = await h.call('browser_handle_dialog', { accept: false })
    const handleParsed = handled.parsed as {
      ok?: boolean
      action?: string
      dialog?: { handled?: boolean; accepted?: boolean }
    }
    expect(handleParsed.ok, handled.text).toBe(true)
    expect(handleParsed.action).toBe('dialog.handle')
    expect(handleParsed.dialog).toMatchObject({ handled: true, accepted: false })

    await expect
      .poll(() => readStatus(h), { timeout: 5_000 })
      .toBe('confirm:dismissed')
  })

  test('accepts a prompt dialog with promptText', async () => {
    const h = harness!
    const target = await waitForTargetByName(h.call, t => t.targetId === 'prompt-button')
    expect(target, 'prompt-button target in snapshot').not.toBeNull()

    const clicked = await h.call('browser_click', { targetId: target!.targetId })
    const clickParsed = clicked.parsed as {
      ok?: boolean
      result?: { dialog?: { handled?: boolean; type?: string; defaultValue?: string } }
    }
    expect(clickParsed.ok, clicked.text).toBe(true)
    expect(clickParsed.result?.dialog).toMatchObject({
      type: 'prompt',
      defaultValue: 'Anon',
      handled: false,
    })

    const handled = await h.call('browser_handle_dialog', {
      accept: true,
      promptText: 'Ada',
    })
    const handleParsed = handled.parsed as {
      ok?: boolean
      dialog?: { handled?: boolean; accepted?: boolean; promptText?: string }
    }
    expect(handleParsed.ok, handled.text).toBe(true)
    expect(handleParsed.dialog).toMatchObject({
      handled: true,
      accepted: true,
      promptText: 'Ada',
    })

    await expect
      .poll(() => readStatus(h), { timeout: 5_000 })
      .toBe('prompt:Ada')
  })
})

async function readStatus(harness: RealHarness): Promise<string> {
  const result = await harness.call('browser_evaluate', {
    function: '() => document.querySelector("#status")?.textContent',
  })
  return (result.parsed as { result?: string }).result ?? ''
}
