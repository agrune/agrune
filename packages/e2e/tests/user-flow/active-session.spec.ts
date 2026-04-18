/**
 * Scenario B — SESS-01/02/03: agrune_focus + implicit-active-session routing
 * via the real MCP handler → CdpDriver → real Chrome.
 *
 * Opens two tabs (tricky-inputs and overlay-modal), then verifies:
 *   1. A tool call without tabId targets whichever tab is currently active.
 *   2. agrune_focus flips the active session and the response payload
 *      reports session.{wasActive, becameActive} correctly.
 *   3. A follow-up call without tabId is now routed to the newly focused tab.
 */

import { test, expect } from '@playwright/test'
import {
  createRealHarness,
  forceReprepare,
  realE2eSkipReason,
  type RealHarness,
} from './helpers'

const skipReason = realE2eSkipReason()

const URL_A = 'http://127.0.0.1:5555/tricky-inputs.html'
const URL_B = 'http://127.0.0.1:5555/overlay-modal.html'

test.describe('real user-flow: active-session + agrune_focus', () => {
  test.skip(!!skipReason, skipReason ?? '')

  let harness: RealHarness | null = null

  test.beforeEach(async () => {
    harness = await createRealHarness({ startUrl: URL_A })
    await harness.driver.ensureReady()
  })

  test.afterEach(async () => {
    await harness?.teardown()
    harness = null
  })

  test('agrune_focus flips active tab and subsequent call routes there', async () => {
    const h = harness!

    // Open a second tab via raw CDP Target.createTarget. Driver auto-attaches.
    const tabBId = await openNewTab(h, URL_B)

    // Inject the runtime into ALL attached sessions. The launch-mode
    // Chrome quirk that required this on the first tab applies here too.
    await forceReprepare(h.driver)

    // Wait for the snapshot scan to settle on the second tab.
    await waitUntil(() => h.driver.listSessions().some(s => s.tabId === tabBId && s.hasSnapshot), 10_000)

    const sessionsRes = await h.call('agrune_sessions')
    const sessions = sessionsRes.parsed as Array<{ tabId: number; active: boolean; url: string }>
    expect(sessions.length).toBeGreaterThanOrEqual(2)

    const tabAId = sessions.find(s => s.url.includes('tricky-inputs'))?.tabId
    expect(tabAId, 'tab A tabId').toBeDefined()
    expect(tabBId).not.toBe(tabAId!)

    // Step 1: focus tab A explicitly (deterministic starting state).
    const focusA = await h.call('agrune_focus', { tabId: tabAId })
    const focusAParsed = focusA.parsed as {
      ok?: boolean
      session?: { wasActive: boolean; becameActive: boolean }
    }
    expect(focusAParsed.ok).toBe(true)

    // Step 2: implicit-target snapshot — no tabId, expect it to hit tab A.
    const implicitA = await h.call('agrune_snapshot', {})
    const implicitAParsed = implicitA.parsed as { url?: string } | null
    expect(implicitAParsed?.url ?? '').toContain('tricky-inputs')

    // Step 3: flip to tab B via agrune_focus.
    const focusB = await h.call('agrune_focus', { tabId: tabBId })
    const focusBParsed = focusB.parsed as {
      ok?: boolean
      session?: { tabId: number; wasActive: boolean; becameActive: boolean }
    }
    expect(focusBParsed.ok).toBe(true)
    expect(focusBParsed.session?.tabId).toBe(tabBId)
    expect(focusBParsed.session?.wasActive).toBe(false)
    expect(focusBParsed.session?.becameActive).toBe(true)

    // Step 4: implicit-target snapshot — now should hit tab B.
    const implicitB = await h.call('agrune_snapshot', {})
    const implicitBParsed = implicitB.parsed as { url?: string } | null
    expect(implicitBParsed?.url ?? '').toContain('overlay-modal')

    // Step 5: re-focusing tab B reports wasActive=true.
    const focusBAgain = await h.call('agrune_focus', { tabId: tabBId })
    const focusBAgainParsed = focusBAgain.parsed as {
      session?: { wasActive: boolean; becameActive: boolean }
    }
    expect(focusBAgainParsed.session?.wasActive).toBe(true)
  })

  test('unknown tabId returns TAB_NOT_FOUND', async () => {
    const h = harness!
    const res = await h.call('agrune_focus', { tabId: 9999 })
    expect(res.isError).toBe(true)
    const parsed = res.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('TAB_NOT_FOUND')
  })
})

async function openNewTab(harness: RealHarness, url: string): Promise<number> {
  const anyDriver = harness.driver as unknown as {
    connection: {
      send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
  }
  await anyDriver.connection.send('Target.createTarget', { url })
  // Wait until the new target shows up as a session.
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const sessions = harness.driver.listSessions()
    const hit = sessions.find(s => s.url === url)
    if (hit) return hit.tabId
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`new tab ${url} did not appear as a session within 10s`)
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(r => setTimeout(r, 100))
  }
}
