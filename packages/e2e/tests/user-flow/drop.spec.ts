/**
 * browser_drop against a real Chrome DataTransfer drop target.
 */

import { writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import {
  createRealHarness,
  realE2eSkipReason,
  waitForTargetByName,
  type RealHarness,
} from './helpers'

const skipReason = realE2eSkipReason()

test.describe('real user-flow: browser_drop end-to-end', () => {
  test.skip(!!skipReason, skipReason ?? '')

  let harness: RealHarness | null = null

  test.beforeEach(async () => {
    harness = await createRealHarness({
      startUrl: 'http://127.0.0.1:5555/drop.html',
    })
    await harness.driver.ensureReady()
  })

  test.afterEach(async () => {
    await harness?.teardown()
    harness = null
  })

  test('drops MIME data and a file onto a target', async ({}, testInfo) => {
    const h = harness!
    const dropPath = testInfo.outputPath('drop.txt')
    await writeFile(dropPath, 'file from drop')

    const target = await waitForTargetByName(h.call, t => t.targetId === 'drop-zone')
    expect(target, 'drop-zone target in snapshot').not.toBeNull()

    const dropped = await h.call('browser_drop', {
      targetId: target!.targetId,
      data: {
        'text/plain': 'plain drop text',
        'text/uri-list': 'https://example.test/item',
      },
      paths: [dropPath],
    })
    const parsed = dropped.parsed as {
      ok?: boolean
      action?: string
      target?: string
      paths?: string[]
      dataTypes?: string[]
    }
    expect(parsed.ok, dropped.text).toBe(true)
    expect(parsed.action).toBe('drop')
    expect(parsed.target).toBe('drop-zone')
    expect(parsed.paths?.[0]).toBe(dropPath)
    expect(parsed.dataTypes).toEqual(['text/plain', 'text/uri-list'])

    await expect
      .poll(() => readStatus(h), { timeout: 5_000 })
      .toBe('drop:plain drop text|https://example.test/item|drop.txt|file from drop')
  })
})

async function readStatus(harness: RealHarness): Promise<string> {
  const result = await harness.call('browser_evaluate', {
    function: '() => document.querySelector("#status")?.textContent',
  })
  return (result.parsed as { result?: string }).result ?? ''
}
