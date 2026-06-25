// Real-chromium resolver test — exposes the golden manifest on the page and resolves every
// target through the ladder, including repeat-by-key, ladder precedence, sensitive masking, and
// the core (no-self-heal) TARGET_NOT_FOUND path (A.0.4).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import {
  loadManifestFromPage,
  resolveTargetLocator,
  resolveLocator,
  resolveLocatorMulti,
} from '../src/resolver.js'
import { captureElementState } from '../src/page-functions.js'
import { CliError } from '../src/errors.js'
import { goldenManifest, goldenHtml } from './fixtures/golden-manifest.js'

let browser: Browser | null = null
let page: Page | null = null
let available = true

beforeAll(async () => {
  try {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
    await page.setContent(goldenHtml)
    await page.evaluate((m) => {
      ;(window as unknown as { __agrune_manifest__: unknown }).__agrune_manifest__ = m
    }, goldenManifest)
  } catch {
    available = false
  }
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

describe('M2 — resolver (real chromium)', () => {
  it('loads + validates the page manifest', async () => {
    if (!available || !page) return
    const manifest = await loadManifestFromPage(page)
    expect(manifest.version).toBe(3)
    expect(manifest.groups).toHaveLength(4)
  })

  it('every direct target resolves via the ladder', async () => {
    if (!available || !page) return
    for (const ref of ['username_input', 'password_input', 'new_todo_input', 'filter_all']) {
      const locator = await resolveTargetLocator(page, ref)
      expect(await locator.count()).toBeGreaterThan(0)
    }
  })

  it('repeat targets resolve by stable key (golden rows a1/b2)', async () => {
    if (!available || !page) return
    const toggleA1 = await resolveTargetLocator(page, 'todo_items[key=a1].todo_item_toggle')
    expect(await toggleA1.getAttribute('data-id')).toBe('a1')

    const destroyB2 = await resolveTargetLocator(page, 'todo_items[key=b2].todo_item_destroy')
    expect(await destroyB2.evaluate((el) => el.className)).toBe('destroy')
    expect(await destroyB2.getAttribute('data-id')).toBe('b2')

    // resolveLocatorMulti sees BOTH rows (no .first() collapse).
    const multi = await resolveLocatorMulti(page, { css: '.toggle' })
    expect(await multi!.locator.count()).toBe(2)
  })

  it('ladder precedence: role beats css when both match', async () => {
    if (!available || !page) return
    // #new-todo is a textbox; resolve via { role: textbox, css: #new-todo } → role rung wins.
    const resolved = await resolveLocator(page, { role: { name: 'textbox' }, css: '#new-todo' })
    expect(resolved?.strategy).toBe('role')
  })

  it('a non-declared ref → TARGET_NOT_FOUND with manifestTarget:false and NO repair field (A.0.4)', async () => {
    if (!available || !page) return
    try {
      await resolveTargetLocator(page, 'does_not_exist')
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      const e = err as CliError
      expect(e.code).toBe('TARGET_NOT_FOUND')
      expect(e.details?.manifestTarget).toBe(false)
      expect(e.details?.repair).toBeUndefined()
    }
  })

  it('a declared-but-drifted target → TARGET_NOT_FOUND manifestTarget:true, NO repair field (A.0.4)', async () => {
    if (!available || !page) return
    // Remove #user from the DOM so its declared selector resolves nothing.
    await page.evaluate(() => document.getElementById('user')?.remove())
    try {
      await resolveTargetLocator(page, 'username_input')
      throw new Error('expected throw')
    } catch (err) {
      const e = err as CliError
      expect(e.code).toBe('TARGET_NOT_FOUND')
      expect(e.details?.manifestTarget).toBe(true)
      expect(e.details?.reason).toBe('selector-unresolved')
      expect(e.details?.repair).toBeUndefined()
    } finally {
      await page.setContent(goldenHtml)
      await page.evaluate((m) => {
        ;(window as unknown as { __agrune_manifest__: unknown }).__agrune_manifest__ = m
      }, goldenManifest)
    }
  })

  it('sensitive password input: reason=sensitive, valuePreview masked to null (A.0.5)', async () => {
    if (!available || !page) return
    // captureElementState is self-contained — Playwright serializes it to run in-page.
    const withFlag = await page
      .locator('#pass')
      .evaluate(captureElementState, { sensitiveFlag: true, fillAction: true })
    expect(withFlag.sensitive).toBe(true)
    expect(withFlag.reason).toBe('sensitive')
    expect(withFlag.valuePreview).toBeNull()

    // The always-on core heuristic flags type=password even WITHOUT the manifest flag.
    const noFlag = await page
      .locator('#pass')
      .evaluate(captureElementState, { fillAction: true })
    expect(noFlag.sensitive).toBe(true)

    // A non-sensitive fillable target surfaces its value.
    const username = await page
      .locator('#user')
      .evaluate(captureElementState, { fillAction: true })
    expect(username.sensitive).toBe(false)
    expect(username.valuePreview).toBe('')
  })
})
