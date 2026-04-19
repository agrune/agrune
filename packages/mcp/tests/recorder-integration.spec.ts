import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import WebSocket from 'ws'
import type { PageSnapshot, Session } from '@agrune/core'
import { PendingStore } from '../src/pending-store.js'
import {
  RecorderController,
  type RecorderBroadcast,
} from '../src/recorder-controller.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEVTOOLS_DIST = join(__dirname, '..', '..', 'devtools', 'dist')

// Minimal mock driver (same shape as devtools-server-extensions.spec.ts).
function createMockDriver() {
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
    onSnapshotUpdate: () => {
      /* noop */
    },
    onSessionOpen: () => {
      /* noop */
    },
    onSessionClose: () => {
      /* noop */
    },
    execute: async () => ({ ok: true }),
  }
}

function connectWs(port: number): Promise<{
  ws: WebSocket
  waitForMessage: (timeoutMs?: number) => Promise<unknown>
}> {
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
        const handler = (msg: unknown) => {
          clearTimeout(timer)
          res(msg)
        }
        waiters.push(handler)
      })
    }

    ws.on('open', () => resolve({ ws, waitForMessage }))
    ws.on('error', reject)
  })
}

async function nextOfType<T = unknown>(
  waitForMessage: (t?: number) => Promise<unknown>,
  type: string,
  timeoutMs = 2000,
): Promise<{ type: string } & T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = Math.max(50, deadline - Date.now())
    const msg = (await waitForMessage(remaining)) as { type: string }
    if (msg.type === type) return msg as { type: string } & T
  }
  throw new Error(`nextOfType: never saw ${type} within ${timeoutMs}ms`)
}

describe('devtools-server ↔ RecorderController wiring (CR-01)', () => {
  let port: number
  let start: typeof import('../src/devtools-server.js').startDevtoolsServer
  let stop: typeof import('../src/devtools-server.js').stopDevtoolsServer
  let recorder: RecorderController
  let pendingRoot: string
  let pendingStore: PendingStore
  let createdTestDist = false

  beforeAll(async () => {
    const mod = await import('../src/devtools-server.js')
    await mod.stopDevtoolsServer().catch(() => {})
    start = mod.startDevtoolsServer
    stop = mod.stopDevtoolsServer

    try {
      mkdirSync(DEVTOOLS_DIST, { recursive: true })
      writeFileSync(
        join(DEVTOOLS_DIST, 'index.html'),
        '<!DOCTYPE html><html><head><title>Agrune DevTools</title></head><body></body></html>',
      )
      createdTestDist = true
    } catch {
      // already exists
    }

    pendingRoot = mkdtempSync(join(tmpdir(), 'agrune-recorder-integration-'))
    pendingStore = new PendingStore(pendingRoot)

    // 실제 agrune-mcp.ts 와 동일한 deferred broadcast 패턴을 재현.
    let broadcastFn: RecorderBroadcast = () => {
      /* no-op until ready */
    }
    recorder = new RecorderController(pendingStore, (msg) => broadcastFn(msg))

    const driver = createMockDriver()
    port = await start(driver, 0, {
      recorder,
      onRecorderBroadcastReady: (fn) => {
        broadcastFn = fn
      },
    })
  })

  afterAll(async () => {
    await stop()
    if (createdTestDist) {
      try {
        rmSync(DEVTOOLS_DIST, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    rmSync(pendingRoot, { recursive: true, force: true })
  })

  it('WIRE-1: recorder_toggle WS message flips controller mode and broadcasts recorder_state', async () => {
    const { ws, waitForMessage } = await connectWs(port)
    // initial sessions_update is sent on connect — drain it first.
    await nextOfType(waitForMessage, 'sessions_update').catch(() => {
      /* may be absent in minimal driver */
    })

    expect(recorder.getMode()).toBe('idle')
    ws.send(JSON.stringify({ type: 'recorder_toggle' }))

    const stateMsg = await nextOfType<{ mode: string }>(waitForMessage, 'recorder_state')
    expect(stateMsg.mode).toBe('picking')
    expect(recorder.getMode()).toBe('picking')

    // Second toggle returns to idle.
    ws.send(JSON.stringify({ type: 'recorder_toggle' }))
    const idleMsg = await nextOfType<{ mode: string }>(waitForMessage, 'recorder_state')
    expect(idleMsg.mode).toBe('idle')
    expect(recorder.getMode()).toBe('idle')

    ws.close()
    // allow 'close' handler to fire — recorder should reset (no-op if already idle).
    await new Promise((r) => setTimeout(r, 50))
  })

  it('WIRE-2: recorder_commit WS message with valid payload writes PendingStore and broadcasts idle state', async () => {
    const { ws, waitForMessage } = await connectWs(port)
    await nextOfType(waitForMessage, 'sessions_update').catch(() => {
      /* ignore */
    })

    // Move into recording-action state (picking → captured).
    ws.send(JSON.stringify({ type: 'recorder_toggle' }))
    await nextOfType<{ mode: string }>(waitForMessage, 'recorder_state')
    recorder.handleCaptured({
      url: 'https://example.com/login',
      roleSelector: { role: 'button', name: 'Sign in' },
      cssSelector: 'button.login',
      autoTargetId: 'signIn_1',
    })
    await nextOfType(waitForMessage, 'recorder_captured')

    // Commit via WS — server should route to RecorderController.handleCommit.
    ws.send(
      JSON.stringify({
        type: 'recorder_commit',
        data: {
          sessionId: '',
          ts: 1700000000000,
          url: 'https://example.com/login',
          targetId: 'signIn_1',
          selector: { css: 'button.login' },
        },
      }),
    )

    // broadcast idle after successful write
    const idleMsg = await nextOfType<{ mode: string }>(waitForMessage, 'recorder_state')
    expect(idleMsg.mode).toBe('idle')
    expect(recorder.getMode()).toBe('idle')

    // pending file was actually written under pendingRoot
    const { readdirSync } = await import('node:fs')
    const sessionDirs = readdirSync(pendingRoot)
    expect(sessionDirs.length).toBeGreaterThan(0)

    ws.close()
    await new Promise((r) => setTimeout(r, 50))
  })

  it('WIRE-3: last-client-disconnect resets recorder to idle (Pitfall 6)', async () => {
    // Start fresh — toggle into picking
    const { ws, waitForMessage } = await connectWs(port)
    await nextOfType(waitForMessage, 'sessions_update').catch(() => {
      /* ignore */
    })
    ws.send(JSON.stringify({ type: 'recorder_toggle' }))
    await nextOfType<{ mode: string }>(waitForMessage, 'recorder_state')
    expect(recorder.getMode()).toBe('picking')

    ws.close()
    // Give the server's close handler a chance to fire
    await new Promise((r) => setTimeout(r, 100))
    expect(recorder.getMode()).toBe('idle')
  })

  it('WIRE-4: malformed recorder_commit payload is rejected before reaching RecorderController', async () => {
    const { ws, waitForMessage } = await connectWs(port)
    await nextOfType(waitForMessage, 'sessions_update').catch(() => {
      /* ignore */
    })
    const beforeMode = recorder.getMode()

    // __proto__ key is not in the selector allowlist (WR-04).
    ws.send(
      JSON.stringify({
        type: 'recorder_commit',
        data: {
          sessionId: '',
          ts: 1700000000000,
          url: 'https://example.com',
          targetId: 'x_1',
          selector: { __proto__: { polluted: 1 } },
        },
      }),
    )

    // No recorder_state/recorder_error broadcast expected — payload validation
    // happens in isValidCommitPayload before handleCommit is ever called.
    let received: string | null = null
    try {
      const msg = (await waitForMessage(150)) as { type: string }
      received = msg.type
    } catch {
      /* timeout is the expected outcome */
    }
    // Mode must not have changed
    expect(recorder.getMode()).toBe(beforeMode)
    expect(received).toBeNull()
    ws.close()
    await new Promise((r) => setTimeout(r, 50))
  })
})
