import { test, expect } from '@playwright/test'

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

  test('__agrune_runtime_state__ resists direct reassignment (writable:false)', async ({ page }) => {
    // Scope note (Phase 17 REVIEW WR-03): this test verifies ONLY that the
    // property is non-writable — i.e. a direct `window.__agrune_runtime_state__ = ...`
    // reassignment does not mutate the published snapshot. It intentionally does
    // NOT claim full tamper-proofness:
    //   - The property is defined with `configurable: true` (see idle-boot.html);
    //     a determined script could `delete` and redefine it. That is acceptable for the v1 threat model where the
    //     fixtures are under repo control and we only care about catching
    //     accidental runtime self-overwrite.
    //   - The reassignment below runs in a Playwright page.evaluate() context,
    //     which is sloppy mode by default. Sloppy writes to non-writable
    //     properties are silently ignored rather than throwing — the test would
    //     still pass even if the underlying assignment is a no-op for a reason
    //     other than `writable: false`. The meaningful regression this guards
    //     against is a future runtime change that drops the `Object.defineProperty`
    //     wrapper entirely (making the property plainly writable), in which case
    //     `afterSource` would become `'window'` and the assertion fails.
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
