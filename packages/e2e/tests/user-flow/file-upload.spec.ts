/**
 * browser_file_upload against a real Chrome file chooser.
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

test.describe('real user-flow: browser_file_upload end-to-end', () => {
  test.skip(!!skipReason, skipReason ?? '')

  let harness: RealHarness | null = null

  test.beforeEach(async () => {
    harness = await createRealHarness({
      startUrl: 'http://127.0.0.1:5555/file-upload.html',
    })
    await harness.driver.ensureReady()
  })

  test.afterEach(async () => {
    await harness?.teardown()
    harness = null
  })

  test('uploads one file to a pending file chooser', async ({}, testInfo) => {
    const h = harness!
    const uploadPath = testInfo.outputPath('profile.txt')
    await writeFile(uploadPath, 'hello from agrune upload')

    const target = await waitForTargetByName(h.call, t => t.targetId === 'single-upload')
    expect(target, 'single-upload target in snapshot').not.toBeNull()

    const clicked = await h.call('browser_click', { targetId: target!.targetId })
    expect((clicked.parsed as { ok?: boolean }).ok, clicked.text).toBe(true)

    const uploaded = await h.call('browser_file_upload', { paths: [uploadPath] })
    const parsed = uploaded.parsed as {
      ok?: boolean
      action?: string
      cancelled?: boolean
      paths?: string[]
      fileChooser?: { handled?: boolean; multiple?: boolean }
    }
    expect(parsed.ok, uploaded.text).toBe(true)
    expect(parsed.action).toBe('file-upload')
    expect(parsed.cancelled).toBe(false)
    expect(parsed.fileChooser).toMatchObject({ handled: true, multiple: false })
    expect(parsed.paths?.[0]).toBe(uploadPath)

    await expect
      .poll(() => readStatus(h), { timeout: 5_000 })
      .toBe('files:profile.txt')
  })

  test('uploads multiple files to a multiple chooser', async ({}, testInfo) => {
    const h = harness!
    const firstPath = testInfo.outputPath('first.txt')
    const secondPath = testInfo.outputPath('second.txt')
    await writeFile(firstPath, 'first file')
    await writeFile(secondPath, 'second file')

    const target = await waitForTargetByName(h.call, t => t.targetId === 'multi-upload')
    expect(target, 'multi-upload target in snapshot').not.toBeNull()

    const clicked = await h.call('browser_click', { targetId: target!.targetId })
    expect((clicked.parsed as { ok?: boolean }).ok, clicked.text).toBe(true)

    const uploaded = await h.call('browser_file_upload', { paths: [firstPath, secondPath] })
    const parsed = uploaded.parsed as {
      ok?: boolean
      cancelled?: boolean
      fileChooser?: { handled?: boolean; multiple?: boolean }
    }
    expect(parsed.ok, uploaded.text).toBe(true)
    expect(parsed.cancelled).toBe(false)
    expect(parsed.fileChooser).toMatchObject({ handled: true, multiple: true })

    await expect
      .poll(() => readStatus(h), { timeout: 5_000 })
      .toBe('multi:first.txt,second.txt')
  })

  test('cancels a pending file chooser when paths are omitted', async () => {
    const h = harness!
    const target = await waitForTargetByName(h.call, t => t.targetId === 'single-upload')
    expect(target, 'single-upload target in snapshot').not.toBeNull()

    const clicked = await h.call('browser_click', { targetId: target!.targetId })
    expect((clicked.parsed as { ok?: boolean }).ok, clicked.text).toBe(true)

    const uploaded = await h.call('browser_file_upload')
    const parsed = uploaded.parsed as {
      ok?: boolean
      cancelled?: boolean
      paths?: string[]
      fileChooser?: { handled?: boolean; cancelled?: boolean }
    }
    expect(parsed.ok, uploaded.text).toBe(true)
    expect(parsed.cancelled).toBe(true)
    expect(parsed.paths).toEqual([])
    expect(parsed.fileChooser).toMatchObject({ handled: true, cancelled: true })
  })
})

async function readStatus(harness: RealHarness): Promise<string> {
  const result = await harness.call('browser_evaluate', {
    function: '() => document.querySelector("#status")?.textContent',
  })
  return (result.parsed as { result?: string }).result ?? ''
}
