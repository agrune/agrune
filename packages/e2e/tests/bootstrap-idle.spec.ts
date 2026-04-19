import { test, expect } from '@playwright/test'

const SKIP = process.env.PLAYWRIGHT_SKIP_E2E === '1'

interface RuntimeState {
  hasManifest: boolean
  source: 'idle' | 'inline' | 'window' | 'preload' | 'runtime-missing'
}

declare global {
  interface Window {
    __agrune_runtime_state__?: RuntimeState
  }
}

test.describe('RESOLVE-04 — bootstrap always runs, idle when no manifest', () => {
  test.skip(SKIP, 'PLAYWRIGHT_SKIP_E2E=1 set — run `pnpm test:e2e:install` to enable locally')

  test('idle-boot.html: runtime boots idle (hasManifest=false, source=idle)', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/idle-boot.html')
    await page.waitForFunction(() => window.__agrune_runtime_state__ !== undefined, null, { timeout: 10000 })
    const state = await page.evaluate(() => window.__agrune_runtime_state__)
    expect(state).toBeDefined()
    expect(state!.hasManifest).toBe(false)
    expect(state!.source).toBe('idle')
  })

  test('legacy-annotated.html: runtime boots active via inline scan (hasManifest=true, source=inline)', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/legacy-annotated.html')
    await page.waitForFunction(() => window.__agrune_runtime_state__ !== undefined, null, { timeout: 10000 })
    const state = await page.evaluate(() => window.__agrune_runtime_state__)
    expect(state).toBeDefined()
    expect(state!.hasManifest).toBe(true)
    expect(state!.source).toBe('inline')
  })

  test('__agrune_runtime_state__ is tamper-proof (writable:false)', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/idle-boot.html')
    await page.waitForFunction(() => window.__agrune_runtime_state__ !== undefined, null, { timeout: 10000 })
    const tamperResult = await page.evaluate(() => {
      const before = window.__agrune_runtime_state__
      try {
        // @ts-expect-error — intentional tamper attempt
        window.__agrune_runtime_state__ = { hasManifest: true, source: 'window' }
      } catch (e) {
        // strict-mode throws; non-strict silently ignores — either is acceptable
      }
      const after = window.__agrune_runtime_state__
      return { beforeSource: before?.source, afterSource: after?.source }
    })
    expect(tamperResult.beforeSource).toBe('idle')
    expect(tamperResult.afterSource).toBe('idle') // unchanged
  })
})
