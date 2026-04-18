import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import type { PageSnapshot, Session } from '@agrune/core'
import { CommandBroker } from '../src/command-broker.js'
import { HitlController } from '../src/hitl-controller.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The devtools-server resolves dist relative to __dirname of the source file
// (packages/mcp/src). For tests, we create a temporary dist directory at the
// expected monorepo path: packages/mcp/src/../../devtools/dist → packages/devtools/dist
const DEVTOOLS_DIST = join(__dirname, '..', '..', 'devtools', 'dist')

function createMockDriver() {
  const snapshotCbs: Array<(tabId: number, snapshot: PageSnapshot) => void> = []
  const sessionOpenCbs: Array<(session: Session) => void> = []
  const sessionCloseCbs: Array<(tabId: number) => void> = []
  const executeCalls: Array<{ tabId: number; command: Record<string, unknown> & { kind: string } }> = []

  const mockSnapshot: PageSnapshot = {
    version: 1,
    capturedAt: Date.now(),
    url: 'https://example.com',
    title: 'Example',
    groups: [],
    targets: [],
  }

  const sessions: Session[] = [
    { tabId: 1, url: 'https://example.com', title: 'Example', hasSnapshot: true, snapshotVersion: 1 },
  ]

  return {
    listSessions: () => sessions,
    getSnapshot: (tabId: number) => (tabId === 1 ? mockSnapshot : null),
    onSnapshotUpdate: (cb: (tabId: number, snapshot: PageSnapshot) => void) => {
      snapshotCbs.push(cb)
    },
    onSessionOpen: (cb: (session: Session) => void) => {
      sessionOpenCbs.push(cb)
    },
    onSessionClose: (cb: (tabId: number) => void) => {
      sessionCloseCbs.push(cb)
    },
    execute: async (tabId: number, command: Record<string, unknown> & { kind: string }) => {
      executeCalls.push({ tabId, command })
      return { ok: true }
    },
    emitSnapshotUpdate: (tabId: number, snapshot: PageSnapshot) => {
      snapshotCbs.forEach(cb => cb(tabId, snapshot))
    },
    emitSessionOpen: (session: Session) => {
      sessionOpenCbs.forEach(cb => cb(session))
    },
    emitSessionClose: (tabId: number) => {
      sessionCloseCbs.forEach(cb => cb(tabId))
    },
    executeCalls,
    sessions,
    mockSnapshot,
  }
}

/**
 * Create a WebSocket with a buffered message queue so messages arriving
 * before we call waitForMessage() are not lost.
 */
function connectWs(port: number): Promise<{ ws: WebSocket; waitForMessage: (timeoutMs?: number) => Promise<unknown>; messageCount: () => number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/ws`)
    const buffer: unknown[] = []
    const waiters: Array<(msg: unknown) => void> = []

    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString())
      const waiter = waiters.shift()
      if (waiter) {
        waiter(parsed)
      } else {
        buffer.push(parsed)
      }
    })

    function waitForMessage(timeoutMs = 2000): Promise<unknown> {
      const buffered = buffer.shift()
      if (buffered !== undefined) return Promise.resolve(buffered)
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(handler)
          if (idx !== -1) waiters.splice(idx, 1)
          rej(new Error('Timed out waiting for message'))
        }, timeoutMs)
        const handler = (msg: unknown) => {
          clearTimeout(timer)
          res(msg)
        }
        waiters.push(handler)
      })
    }

    ws.on('open', () => resolve({ ws, waitForMessage, messageCount: () => buffer.length }))
    ws.on('error', reject)
  })
}

describe('devtools-server', () => {
  let port: number
  let driver: ReturnType<typeof createMockDriver>
  let startDevtoolsServer: typeof import('../src/devtools-server.js').startDevtoolsServer
  let stopDevtoolsServer: typeof import('../src/devtools-server.js').stopDevtoolsServer
  let createdTestDist = false

  beforeAll(async () => {
    // Create a temporary devtools dist directory with a test index.html
    try {
      mkdirSync(DEVTOOLS_DIST, { recursive: true })
      writeFileSync(
        join(DEVTOOLS_DIST, 'index.html'),
        '<!DOCTYPE html><html><head><title>Agrune DevTools</title></head><body></body></html>',
      )
      createdTestDist = true
    } catch {
      // Directory may already exist from a real build
    }

    const mod = await import('../src/devtools-server.js')
    startDevtoolsServer = mod.startDevtoolsServer
    stopDevtoolsServer = mod.stopDevtoolsServer

    driver = createMockDriver()
    port = await startDevtoolsServer(driver)
  })

  afterAll(async () => {
    await stopDevtoolsServer()
    if (createdTestDist) {
      try {
        rmSync(DEVTOOLS_DIST, { recursive: true, force: true })
      } catch { /* ignore */ }
    }
  })

  it('serves devtools HTML at /devtools', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/devtools`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('accepts WebSocket connection at /devtools/ws', async () => {
    const { ws } = await connectWs(port)
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('sends sessions_update on subscribe', async () => {
    const { ws, waitForMessage } = await connectWs(port)

    ws.send(JSON.stringify({ type: 'subscribe', tabId: 1 }))

    const sessionsMsg = await waitForMessage() as { type: string; data: Session[] }
    expect(sessionsMsg.type).toBe('sessions_update')
    expect(Array.isArray(sessionsMsg.data)).toBe(true)
    expect(sessionsMsg.data.length).toBeGreaterThan(0)
    expect(sessionsMsg.data[0].tabId).toBe(1)

    ws.close()
  })

  it('sends snapshot_update on subscribe when snapshot is available', async () => {
    const { ws, waitForMessage } = await connectWs(port)

    ws.send(JSON.stringify({ type: 'subscribe', tabId: 1 }))

    // First message: sessions_update
    const sessionsMsg = await waitForMessage() as { type: string }
    expect(sessionsMsg.type).toBe('sessions_update')

    // Second message: snapshot_update with current snapshot
    const snapshotMsg = await waitForMessage() as { type: string; data: { tabId: number; snapshot: PageSnapshot } }
    expect(snapshotMsg.type).toBe('snapshot_update')
    expect(snapshotMsg.data.tabId).toBe(1)
    expect(snapshotMsg.data.snapshot.url).toBe('https://example.com')

    ws.close()
  })

  it('broadcasts snapshot_update when driver emits', async () => {
    const { ws, waitForMessage } = await connectWs(port)

    ws.send(JSON.stringify({ type: 'subscribe', tabId: 1 }))

    // Drain the initial sessions_update + snapshot_update
    await waitForMessage()
    await waitForMessage()

    const updatedSnapshot: PageSnapshot = {
      version: 2,
      capturedAt: Date.now(),
      url: 'https://example.com/page2',
      title: 'Page 2',
      groups: [],
      targets: [],
    }

    driver.emitSnapshotUpdate(1, updatedSnapshot)

    const msg = await waitForMessage() as { type: string; data: { tabId: number; snapshot: PageSnapshot } }
    expect(msg.type).toBe('snapshot_update')
    expect(msg.data.tabId).toBe(1)
    expect(msg.data.snapshot.version).toBe(2)
    expect(msg.data.snapshot.url).toBe('https://example.com/page2')

    ws.close()
  })

  it('broadcasts sessions_update when a session opens', async () => {
    const { ws, waitForMessage } = await connectWs(port)

    ws.send(JSON.stringify({ type: 'subscribe', tabId: 1 }))

    // Drain initial messages
    await waitForMessage()
    await waitForMessage()

    driver.emitSessionOpen({
      tabId: 2,
      url: 'https://example.com/new',
      title: 'New Tab',
      hasSnapshot: false,
      snapshotVersion: null,
    })

    const msg = await waitForMessage() as { type: string; data: Session[] }
    expect(msg.type).toBe('sessions_update')

    ws.close()
  })

  it('does not receive snapshot_update for unsubscribed tabs', async () => {
    const { ws, waitForMessage } = await connectWs(port)

    ws.send(JSON.stringify({ type: 'subscribe', tabId: 1 }))

    // Drain initial messages
    await waitForMessage()
    await waitForMessage()

    // Emit snapshot for tab 99 (not subscribed)
    driver.emitSnapshotUpdate(99, {
      version: 1,
      capturedAt: Date.now(),
      url: 'https://other.com',
      title: 'Other',
      groups: [],
      targets: [],
    })

    // Should not receive this — wait briefly and verify timeout
    let received = false
    try {
      await waitForMessage(300)
      received = true
    } catch {
      // Expected: timeout means no message arrived
    }
    expect(received).toBe(false)

    ws.close()
  })
})

describe('devtools-server — phase 8 extensions', () => {
  let port2: number
  let driver2: ReturnType<typeof createMockDriver>
  let broker: CommandBroker
  let hitl: HitlController
  let start2: typeof import('../src/devtools-server.js').startDevtoolsServer
  let stop2: typeof import('../src/devtools-server.js').stopDevtoolsServer
  let createdTestDist2 = false
  let focusCalls: number[]

  beforeAll(async () => {
    // Stop the prior singleton server (shared module-level state) before starting a fresh one.
    const mod = await import('../src/devtools-server.js')
    await mod.stopDevtoolsServer().catch(() => {})
    start2 = mod.startDevtoolsServer
    stop2 = mod.stopDevtoolsServer

    try {
      mkdirSync(DEVTOOLS_DIST, { recursive: true })
      writeFileSync(
        join(DEVTOOLS_DIST, 'index.html'),
        '<!DOCTYPE html><html><head><title>Agrune DevTools</title></head><body></body></html>',
      )
      createdTestDist2 = true
    } catch {
      // already exists
    }

    driver2 = createMockDriver()
    broker = new CommandBroker()
    hitl = new HitlController()
    focusCalls = []
    port2 = await start2(driver2, 0, {
      commandBroker: broker,
      hitl,
      onFocusSession: (tabId) => { focusCalls.push(tabId) },
    })
  })

  afterAll(async () => {
    await stop2()
    if (createdTestDist2) {
      try {
        rmSync(DEVTOOLS_DIST, { recursive: true, force: true })
      } catch { /* ignore */ }
    }
  })

  it('sends hitl_state on connect', async () => {
    const { ws, waitForMessage } = await connectWs(port2)
    // First message is sessions_update
    await waitForMessage()
    // Next should be hitl_state
    const msg = await waitForMessage() as { type: string; data: { paused: boolean } }
    expect(msg.type).toBe('hitl_state')
    expect(msg.data.paused).toBe(false)
    ws.close()
  })

  it('broadcasts command_event when broker emits', async () => {
    const { ws, waitForMessage } = await connectWs(port2)
    await waitForMessage() // sessions_update
    await waitForMessage() // hitl_state
    broker.emit({
      id: 'test-1', ts: Date.now(), sessionId: 1,
      tool: 'agrune_act', phase: 'start',
    })
    const msg = await waitForMessage() as { type: string; data: { tool: string; phase: string } }
    expect(msg.type).toBe('command_event')
    expect(msg.data.tool).toBe('agrune_act')
    expect(msg.data.phase).toBe('start')
    ws.close()
  })

  async function nextOfType<T = unknown>(
    waitForMessage: (t?: number) => Promise<unknown>,
    type: string,
  ): Promise<{ type: string; data: T }> {
    for (let i = 0; i < 10; i += 1) {
      const msg = await waitForMessage() as { type: string; data: T }
      if (msg.type === type) return msg
    }
    throw new Error(`nextOfType: never saw ${type}`)
  }

  it('broadcasts hitl_state on pause/resume', async () => {
    const { ws, waitForMessage } = await connectWs(port2)
    await nextOfType<{ paused: boolean }>(waitForMessage, 'hitl_state') // initial
    hitl.pause()
    const paused = await nextOfType<{ paused: boolean }>(waitForMessage, 'hitl_state')
    expect(paused.data.paused).toBe(true)
    hitl.resume()
    const resumed = await nextOfType<{ paused: boolean }>(waitForMessage, 'hitl_state')
    expect(resumed.data.paused).toBe(false)
    ws.close()
  })

  it('accepts hitl pause action from client', async () => {
    const { ws, waitForMessage } = await connectWs(port2)
    await nextOfType<{ paused: boolean }>(waitForMessage, 'hitl_state') // initial
    ws.send(JSON.stringify({ type: 'hitl', action: 'pause' }))
    const msg = await nextOfType<{ paused: boolean }>(waitForMessage, 'hitl_state')
    expect(msg.data.paused).toBe(true)
    hitl.resume() // cleanup
    ws.close()
  })

  it('routes focus_session to onFocusSession callback', async () => {
    const { ws, waitForMessage } = await connectWs(port2)
    await waitForMessage()
    await waitForMessage()
    const before = focusCalls.length
    ws.send(JSON.stringify({ type: 'focus_session', sessionId: 7 }))
    // give event loop a tick to route
    await new Promise(r => setTimeout(r, 30))
    expect(focusCalls.length).toBe(before + 1)
    expect(focusCalls[focusCalls.length - 1]).toBe(7)
    ws.close()
  })

  it('sends command_backfill on connect when broker has buffered events', async () => {
    broker.emit({ id: 'bf-1', ts: 1, sessionId: null, tool: 'agrune_wait', phase: 'start' })
    const { ws, waitForMessage } = await connectWs(port2)
    const seen: string[] = []
    for (let i = 0; i < 5; i += 1) {
      try {
        const msg = await waitForMessage(300) as { type: string }
        seen.push(msg.type)
        if (msg.type === 'command_backfill') break
      } catch { break }
    }
    expect(seen).toContain('command_backfill')
    ws.close()
  })
})
