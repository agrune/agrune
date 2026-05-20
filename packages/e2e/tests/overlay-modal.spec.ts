import { test, expect } from '@playwright/test'

const SKIP = process.env.PLAYWRIGHT_SKIP_E2E === '1'

test.describe('overlay-modal interactions', () => {
  test.skip(SKIP, 'PLAYWRIGHT_SKIP_E2E=1 set — run `pnpm test:e2e:install` to enable locally')

  test('save click does not open modal', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/overlay-modal.html')
    await page.click('#save')
    await expect(page.locator('#backdrop')).not.toBeVisible()
  })

  test('keep-editing closes modal without discard flag', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/overlay-modal.html')
    await page.click('#cancel')
    await expect(page.locator('#backdrop')).toBeVisible()
    await page.click('#keep')
    await expect(page.locator('#backdrop')).not.toBeVisible()
    const flag = await page.evaluate(() => document.body.getAttribute('data-discarded'))
    expect(flag).toBeNull()
  })

  test('modal keyboard focus trapping smoke', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/overlay-modal.html')
    await page.click('#cancel')
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
  })
})
