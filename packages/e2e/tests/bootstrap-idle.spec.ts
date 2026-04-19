import { test, expect } from '@playwright/test'

// Phase 17 note: `source` union no longer includes 'inline' — the runtime
// does not read legacy data-agrune-* DOM attributes at all. `descriptorCount`
// is surfaced by the fixtures so specs can positively verify the empty
// manifest path even when the DOM contains legacy bait.
const SKIP = process.env.PLAYWRIGHT_SKIP_E2E === '1'

interface RuntimeState {
  hasManifest: boolean
  source: 'idle' | 'window' | 'preload' | 'runtime-missing'
  descriptorCount: number
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
    expect(state!.descriptorCount).toBe(0)
  })

  test('legacy-annotated.html: runtime ignores legacy data-agrune-* attributes (source=idle)', async ({ page }) => {
    // Phase 17 REMOVE-01 regression: the fixture body deliberately still has
    // data-agrune-group / data-agrune-action / data-agrune-key attributes.
    // The runtime must NOT interpret them — it must resolve to the empty
    // manifest exactly like idle-boot.html.
    await page.goto('http://127.0.0.1:5555/legacy-annotated.html')
    await page.waitForFunction(() => window.__agrune_runtime_state__ !== undefined, null, { timeout: 10000 })
    const state = await page.evaluate(() => window.__agrune_runtime_state__)
    expect(state).toBeDefined()
    expect(state!.hasManifest).toBe(false)
    expect(state!.source).toBe('idle')
    expect(state!.descriptorCount).toBe(0)
    // Belt-and-suspenders: the legacy bait attributes are still present in
    // the DOM, proving we really are testing ignore (not absence).
    const legacyDomPresent = await page.evaluate(() => ({
      actions: document.querySelectorAll('[data-agrune-action]').length,
      groups: document.querySelectorAll('[data-agrune-group]').length,
    }))
    expect(legacyDomPresent.actions).toBeGreaterThan(0)
    expect(legacyDomPresent.groups).toBeGreaterThan(0)
  })

  test('__agrune_runtime_state__ is tamper-proof (writable:false)', async ({ page }) => {
    await page.goto('http://127.0.0.1:5555/idle-boot.html')
    await page.waitForFunction(() => window.__agrune_runtime_state__ !== undefined, null, { timeout: 10000 })
    const tamperResult = await page.evaluate(() => {
      const before = window.__agrune_runtime_state__
      try {
        // intentional tamper attempt — runtime publishes with writable:false
        ;(window as unknown as { __agrune_runtime_state__: unknown }).__agrune_runtime_state__ = {
          hasManifest: true,
          source: 'window',
        }
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
