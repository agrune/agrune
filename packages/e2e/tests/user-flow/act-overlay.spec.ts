/**
 * Scenario D — browser_click end-to-end on the overlay-modal fixture:
 *   1. Fetch page targets → cancel button is reachable (context: page).
 *   2. Click the cancel button via browser_click → modal opens.
 *   3. Fetch targets again → active context flips to overlay; the underlying
 *      cancel button must no longer be returned as actionable.
 *   4. Clicking the modal's "Keep editing" button closes the modal.
 */

import { test, expect } from '@playwright/test'
import {
  createRealHarness,
  realE2eSkipReason,
  waitForTargetByName,
  getFullTargets,
  type RealHarness,
} from './helpers'

const skipReason = realE2eSkipReason()

test.describe('real user-flow: browser_click + overlay context', () => {
  test.skip(!!skipReason, skipReason ?? '')

  let harness: RealHarness | null = null

  test.beforeEach(async () => {
    harness = await createRealHarness({
      startUrl: 'http://127.0.0.1:5555/overlay-modal.html',
    })
    // The fixture owns window.__agrune_manifest__; no MCP manifest-load tool is involved.
    await harness.driver.ensureReady()
  })

  test.afterEach(async () => {
    await harness?.teardown()
    harness = null
  })

  test('opening modal flips active context and hides background targets', async () => {
    const h = harness!

    const cancelTarget = await waitForTargetByName(
      h.call,
      t => t.targetId === 'cancel-btn',
    )
    expect(cancelTarget, 'cancel-btn target').not.toBeNull()

    const clickRes = await h.call('browser_click', {
      targetId: cancelTarget!.targetId,
    })
    const clickParsed = clickRes.parsed as { ok?: boolean }
    expect(clickParsed.ok).toBe(true)

    // After the click, the runtime re-scans; the overlay context takes over
    // because the modal has role="dialog" with an annotated group.
    // We retry for a short window because scans are async.
    const deadline = Date.now() + 5_000
    let sawOverlay = false
    while (Date.now() < deadline && !sawOverlay) {
      const res = await h.call('browser_get_targets', {})
      const parsed = res.parsed as { context?: string } | null
      if (parsed?.context === 'overlay') {
        sawOverlay = true
        break
      }
      await new Promise(r => setTimeout(r, 200))
    }
    expect(sawOverlay, 'snapshot switched to overlay context after opening modal').toBe(true)

    // In overlay mode the underlying Save/Cancel buttons should NOT appear.
    const overlayTargets = await getFullTargets(h.call)
    const leakedBackground = overlayTargets.find(
      t => t.targetId === 'save-btn' || t.targetId === 'cancel-btn',
    )
    expect(leakedBackground, 'background toolbar targets should be suppressed while modal is open').toBeUndefined()

    // Click "Keep editing" to close the modal.
    const keep = overlayTargets.find(t => t.targetId === 'modal-keep')
    expect(keep, 'modal-keep overlay target').toBeDefined()
    const keepRes = await h.call('browser_click', {
      targetId: keep!.targetId,
    })
    const keepParsed = keepRes.parsed as { ok?: boolean }
    expect(keepParsed.ok).toBe(true)
  })
})
