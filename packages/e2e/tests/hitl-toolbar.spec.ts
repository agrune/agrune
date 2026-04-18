import { test, expect } from '@playwright/test'
import { WebSocket } from 'ws'

const SKIP = process.env.PLAYWRIGHT_SKIP_E2E === '1'

// This spec spins up the real @agrune/mcp devtools-server against a mock driver
// and asserts the protocol used by the devtools webapp. It's a pure Node WS check
// wrapped in Playwright's runner for parity with the rest of the E2E suite.

test.describe('HITL toolbar WebSocket contract', () => {
  test.skip(SKIP, 'PLAYWRIGHT_SKIP_E2E=1 set — run `pnpm test:e2e:install` to enable locally')

  test('server emits hitl_state + accepts pause/resume', async () => {
    const mcp = await import('@agrune/mcp')
    const serverMod = await import('@agrune/mcp/devtools-server')

    const { HitlController, CommandBroker } = mcp as unknown as {
      HitlController: new () => { pause: () => void; resume: () => void }
      CommandBroker: new () => Record<string, unknown>
    }
    const { startDevtoolsServer, stopDevtoolsServer } = serverMod as unknown as {
      startDevtoolsServer: (driver: unknown, port?: number, opts?: unknown) => Promise<number>
      stopDevtoolsServer: () => Promise<void>
    }

    const driver = {
      listSessions: () => [{ tabId: 1, url: 'https://x', title: 'x', hasSnapshot: false, snapshotVersion: null }],
      getSnapshot: () => null,
      onSnapshotUpdate: () => {},
      onSessionOpen: () => {},
      onSessionClose: () => {},
      execute: async () => ({ ok: true }),
    }

    const hitl = new HitlController()
    const broker = new CommandBroker()
    const port = await startDevtoolsServer(driver, 0, { hitl, commandBroker: broker })

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/ws`)
      const messages: Array<{ type: string; data?: unknown }> = []
      ws.on('message', (raw: Buffer) => { messages.push(JSON.parse(raw.toString())) })

      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', reject)
      })

      await expect.poll(() => messages.find(m => m.type === 'hitl_state')?.data ?? null, { timeout: 2000 })
        .toMatchObject({ paused: false })

      ws.send(JSON.stringify({ type: 'hitl', action: 'pause' }))

      await expect.poll(
        () => messages.filter(m => m.type === 'hitl_state').pop()?.data ?? null,
        { timeout: 2000 },
      ).toMatchObject({ paused: true })

      hitl.resume()
      ws.close()
    } finally {
      await stopDevtoolsServer()
    }
  })
})
