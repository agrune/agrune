import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import type { PageSnapshot, Session } from '@agrune/core'
import { CommandBroker } from '../src/command-broker.js'
import { HitlController } from '../src/hitl-controller.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
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
    onSnapshotUpdate: (cb: (tabId: number, snapshot: PageSnapshot) => void) => { snapshotCbs.push(cb) },
    onSessionOpen: (cb: (session: Session) => void) => { sessionOpenCbs.push(cb) },
    onSessionClose: (cb: (tabId: number) => void) => { sessionCloseCbs.push(cb) },
    execute: async (tabId: number, command: Record<string, unknown> & { kind: string }) => {
      executeCalls.push({ tabId, command })
      return { ok: true }
    },
    emitSnapshotUpdate: (tabId: number, snapshot: PageSnapshot) => { snapshotCbs.forEach(cb => cb(tabId, snapshot)) },
    emitSessionOpen: (session: Session) => { sessionOpenCbs.forEach(cb => cb(session)) },
    emitSessionClose: (tabId: number) => { sessionCloseCbs.forEach(cb => cb(tabId)) },
    executeCalls,
    sessions,
    mockSnapshot,
  }
}

function connectWs(port: number): Promise<{ ws: WebSocket; waitForMessage: (timeoutMs?: number) => Promise<unknown>; messageCount: () => number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/ws`)
    const buffer: unknown[] = []
    const waiters: Array<(msg: unknown) => void> = []

    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString())
      const waiter = waiters.shift()
      if (waiter) waiter(parsed)
      else buffer.push(parsed)
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
        const handler = (msg: unknown) => { clearTimeout(timer); res(msg) }
        waiters.push(handler)
      })
    }

    ws.on('open', () => resolve({ ws, waitForMessage, messageCount: () => buffer.length }))
    ws.on('error', reject)
  })
}

async function nextOfType<T = unknown>(
  waitForMessage: (t?: number) => Promise<unknown>,
  type: string,
  timeoutMs = 2000,
): Promise<{ type: string; data: T }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = Math.max(50, deadline - Date.now())
    const msg = await waitForMessage(remaining) as { type: string; data: T }
    if (msg.type === type) return msg
  }
  throw new Error(`nextOfType: never saw ${type} within ${timeoutMs}ms`)
}

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
    // Stop any leftover singleton before starting a fresh one.
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
    const msg = await nextOfType<{ paused: boolean }>(waitForMessage, 'hitl_state')
    expect(msg.data.paused).toBe(false)
    ws.close()
  })

  it('broadcasts command_event when broker emits', async () => {
    const { ws, waitForMessage } = await connectWs(port2)
    await nextOfType<{ paused: boolean }>(waitForMessage, 'hitl_state') // initial
    broker.emit({
      id: 'test-1', ts: Date.now(), sessionId: 1,
      tool: 'agrune_act', phase: 'start',
    })
    const msg = await nextOfType<{ tool: string; phase: string }>(waitForMessage, 'command_event')
    expect(msg.data.tool).toBe('agrune_act')
    expect(msg.data.phase).toBe('start')
    ws.close()
  })

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
    await nextOfType<Session[]>(waitForMessage, 'sessions_update')
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
    for (let i = 0; i < 6; i += 1) {
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
