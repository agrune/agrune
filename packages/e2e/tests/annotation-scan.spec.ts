import { test, expect } from '@playwright/test'

// Phase 17 note: this spec exercises DOM-level interactions against fixture
// pages (overlay-modal, tricky-inputs) that use `data-agrune-*` attributes
// as *fixture-only* CSS selectors / DOM hooks. The Phase 17 runtime does
// NOT auto-scan these attributes — they are equivalent to `data-testid`
// markers for Playwright assertions. Preserved under the Success Criteria
// 4 allow-list (scripts/regression-guard/data-agrune-allowlist.txt, landing
// in Wave 4). File name is also stable so the allow-list entry stays valid.
const SKIP = process.env.PLAYWRIGHT_SKIP_E2E === '1'

test.describe('fixture DOM hooks — real browser (legacy attribute allow-list)', () => {
  test.skip(SKIP, 'PLAYWRIGHT_SKIP_E2E=1 set — run `pnpm test:e2e:install` to enable locally')

  test('overlay-modal fixture yields 4 targets and 2 groups', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/overlay-modal.html')

    const result = await page.evaluate(() => {
      const actions = Array.from(document.querySelectorAll('[data-agrune-action]'))
      const groups = Array.from(document.querySelectorAll('[data-agrune-group]'))
      return { actionCount: actions.length, groupCount: groups.length }
    })

    expect(result.actionCount).toBe(4)
    expect(result.groupCount).toBe(2)
  })

  test('opening modal covers the cancel button', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/overlay-modal.html')
    await page.click('#cancel')

    const backdrop = page.locator('#backdrop')
    await expect(backdrop).toBeVisible()

    const elementUnderCancel = await page.evaluate(() => {
      const cancel = document.getElementById('cancel')!
      const r = cancel.getBoundingClientRect()
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return el?.id ?? el?.className ?? el?.tagName
    })

    expect(elementUnderCancel).not.toBe('cancel')
  })

  test('discard closes modal and marks document', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/overlay-modal.html')
    await page.click('#cancel')
    await page.click('#discard')
    await expect(page.locator('#backdrop')).not.toBeVisible()
    const flag = await page.evaluate(() => document.body.getAttribute('data-discarded'))
    expect(flag).toBe('1')
  })

  test('tricky-inputs fixture exposes contenteditable + sensitive + masked', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/tricky-inputs.html')

    const bioEditable = await page.evaluate(() =>
      document.getElementById('bio')?.getAttribute('contenteditable'),
    )
    expect(bioEditable).toBe('true')

    const sensitive = await page.evaluate(() =>
      document.getElementById('pw')?.hasAttribute('data-agrune-sensitive'),
    )
    expect(sensitive).toBe(true)

    const cc = page.locator('#cc')
    await cc.fill('1234123412341234')
    await expect(cc).toHaveValue('1234123412341234')
  })
})
