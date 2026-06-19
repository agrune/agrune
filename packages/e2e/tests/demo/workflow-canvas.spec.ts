/**
 * Real-xyflow canvas drag E2E. Serves the BUILT demo (../../demo/dist — a real
 * React Flow / @xyflow canvas) over a tiny static server and drives a node drag
 * through the real MCP tool layer → PlaywrightDriver → chromium, asserting:
 *   - the node lands at the requested CANVAS coordinates (auto-converted to
 *     viewport px, exact even at fitView's non-1 zoom), and movedTarget reports it;
 *   - a destination outside the visible pane is rejected (DESTINATION_OUTSIDE_CANVAS).
 *
 * Soft-skips when a real browser is unavailable OR the sibling demo repo is not
 * built — so the agrune repo's CI (which has no demo/dist) skips it cleanly while
 * a local run with `pnpm build` in ../demo exercises it against real React Flow.
 */

import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRealHarness, realE2eSkipReason, type RealHarness } from '../user-flow/helpers'
import type { AddressInfo } from 'node:net'
import type { PageTarget, PageSnapshot } from '@agrune/core'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEMO_DIST = join(__dirname, '../../../../../demo/dist')

const skipReason =
  realE2eSkipReason() ??
  (existsSync(join(DEMO_DIST, 'index.html'))
    ? null
    : 'demo/dist not built — run `pnpm build` in ../demo to exercise the real-xyflow canvas drag.')

const CONTENT_TYPE: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

test.describe('real-xyflow canvas drag end-to-end', () => {
  test.skip(!!skipReason, skipReason ?? '')

  let server: Server | null = null
  let baseUrl = ''
  let harness: RealHarness | null = null

  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      const path = new URL(req.url || '/', 'http://x').pathname
      let rel = path
      let data: Buffer
      try {
        data = await readFile(join(DEMO_DIST, rel))
      } catch {
        data = await readFile(join(DEMO_DIST, 'index.html')) // SPA fallback
        rel = '/index.html'
      }
      res.writeHead(200, { 'content-type': CONTENT_TYPE[extname(rel)] || 'text/plain' })
      res.end(data)
    })
    // Ephemeral port so parallel workers never collide on a fixed port.
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/`
  })

  test.afterAll(async () => {
    await new Promise<void>(resolve => server?.close(() => resolve()) ?? resolve())
    server = null
  })

  test.beforeEach(async () => {
    harness = await createRealHarness({ startUrl: baseUrl })
    await harness.driver.ensureReady()
    // Switch to the workflow tab (a state-driven view, not a route).
    const tabId = harness.driver.resolveTabId() as number
    await harness.driver.execute(tabId, { kind: 'act', targetId: 'nav_workflow_tab', action: 'click' })
    await harness.driver.playwrightSession.page(tabId).waitForTimeout(500)
    await harness.driver.ensureReady()
  })

  test.afterEach(async () => {
    await harness?.teardown()
    harness = null
  })

  function canvasNode(snapshot: PageSnapshot | null): PageTarget | undefined {
    return snapshot?.targets.find(
      t => t.groupId === 'workflow' && t.targetId === 'workflow_node_body_indexed' && t.center,
    )
  }

  test('drags a real React Flow node to exact canvas coords (movedTarget)', async () => {
    const h = harness!
    const tabId = h.driver.resolveTabId() as number
    const node = canvasNode(h.driver.getSnapshot(tabId))
    expect(node, 'a workflow canvas node with a center').toBeTruthy()
    expect(node!.coordSpace).toBe('canvas')

    const from = node!.center!
    const dest = { x: from.x + 60, y: from.y + 90 }
    const res = await h.call('browser_drag', {
      sourceTargetId: node!.targetId,
      destinationCoords: dest,
    })

    const parsed = res.parsed as {
      ok?: boolean
      result?: { coordSpace?: string; moved?: boolean; movedTarget?: { to?: { x: number; y: number } } }
    }
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true)
    expect(parsed.result?.coordSpace).toBe('canvas')
    expect(parsed.result?.moved).toBe(true)
    // Lands at the requested canvas point within a few px (drag interpolation +
    // rounding) — proven exact even at fitView's fractional zoom.
    expect(Math.abs((parsed.result?.movedTarget?.to?.x ?? 0) - dest.x)).toBeLessThanOrEqual(5)
    expect(Math.abs((parsed.result?.movedTarget?.to?.y ?? 0) - dest.y)).toBeLessThanOrEqual(5)
  })

  test('rejects an off-pane canvas destination (DESTINATION_OUTSIDE_CANVAS)', async () => {
    const h = harness!
    const tabId = h.driver.resolveTabId() as number
    const node = canvasNode(h.driver.getSnapshot(tabId))
    expect(node).toBeTruthy()

    const res = await h.call('browser_drag', {
      sourceTargetId: node!.targetId,
      destinationCoords: { x: 99999, y: 0 },
    })
    const parsed = res.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('DESTINATION_OUTSIDE_CANVAS')
  })
})
