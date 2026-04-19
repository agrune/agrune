import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import type { PageSnapshot, Session } from '@agrune/core'
import type { CommandBroker, CommandEvent } from './command-broker.js'
import type { HitlController, HitlState } from './hitl-controller.js'
import type { RecorderController, CommitPayload } from './recorder-controller.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface DevtoolsDriver {
  listSessions(): Session[]
  getSnapshot(tabId: number): PageSnapshot | null
  onSnapshotUpdate(cb: (tabId: number, snapshot: PageSnapshot) => void): void
  onSessionOpen(cb: (session: Session) => void): void
  onSessionClose(cb: (tabId: number) => void): void
  execute(tabId: number, command: Record<string, unknown> & { kind: string }): Promise<unknown>
}

export interface DevtoolsServerOptions {
  commandBroker?: CommandBroker
  hitl?: HitlController
  onFocusSession?: (tabId: number) => Promise<void> | void
  /** Phase 16 RECORD-02 — recorder controller for recorder_* WS routing. */
  recorder?: RecorderController
}

interface ConnectedClient {
  ws: WebSocket
  subscribedTabId: number | null
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
}

let httpServer: ReturnType<typeof createServer> | null = null
let wss: WebSocketServer | null = null

export function resolveDevtoolsDist(): string {
  // Primary: sibling devtools package dist (monorepo layout)
  const monorepoPath = join(__dirname, '..', '..', 'devtools', 'dist')
  // Fallback: bundled devtools-dist alongside this package
  const fallbackPath = join(__dirname, '..', 'devtools-dist')
  // We try monorepo first at startup; stat is async so we just return the
  // candidate paths and let the caller check.  For synchronous resolution we
  // return the first path — the static file handler will 404 gracefully if
  // neither exists.
  return monorepoPath
}

export async function resolveDevtoolsDistAsync(): Promise<string> {
  const monorepoPath = join(__dirname, '..', '..', 'devtools', 'dist')
  try {
    const s = await stat(monorepoPath)
    if (s.isDirectory()) return monorepoPath
  } catch { /* not found */ }

  const fallbackPath = join(__dirname, '..', 'devtools-dist')
  try {
    const s = await stat(fallbackPath)
    if (s.isDirectory()) return fallbackPath
  } catch { /* not found */ }

  return monorepoPath // fall back to monorepo path even if missing
}

export async function startDevtoolsServer(
  driver: DevtoolsDriver,
  port = 0,
  options: DevtoolsServerOptions = {},
): Promise<number> {
  if (httpServer) {
    const addr = httpServer.address()
    if (addr && typeof addr === 'object') return addr.port
    throw new Error('DevTools server already running but address unavailable.')
  }

  const distDir = await resolveDevtoolsDistAsync()
  const clients: ConnectedClient[] = []

  // --- HTTP server ---
  httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/'

    // Redirect /devtools to /devtools/ so relative asset paths resolve correctly
    if (url === '/devtools') {
      res.writeHead(301, { Location: '/devtools/' })
      res.end()
      return
    }

    if (!url.startsWith('/devtools/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }

    // Strip /devtools/ prefix to get the file path
    let filePath = url.replace(/^\/devtools\//, '/') || '/index.html'

    // Default to index.html for the root path
    if (filePath === '' || filePath === '/') {
      filePath = '/index.html'
    }

    // Strip query string
    filePath = filePath.split('?')[0]

    const fullPath = join(distDir, filePath)

    // Basic path traversal protection
    if (!fullPath.startsWith(distDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden')
      return
    }

    try {
      const content = await readFile(fullPath)
      const ext = extname(fullPath)
      const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
    }
  })

  // --- WebSocket server ---
  wss = new WebSocketServer({ server: httpServer, path: '/devtools/ws' })

  wss.on('connection', (ws: WebSocket) => {
    const client: ConnectedClient = { ws, subscribedTabId: null }
    clients.push(client)

    // Send current sessions list on connect so the UI populates immediately
    sendToClient(ws, {
      type: 'sessions_update',
      data: driver.listSessions(),
    })

    // Phase 8: send initial HITL state and any buffered command events
    if (options.hitl) {
      sendToClient(ws, { type: 'hitl_state', data: options.hitl.getState() })
    }
    if (options.commandBroker) {
      const buffered = options.commandBroker.getBuffered()
      if (buffered.length > 0) {
        sendToClient(ws, { type: 'command_backfill', data: buffered })
      }
    }

    ws.on('message', (raw: Buffer | string) => {
      try {
        const message = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))
        handleClientMessage(client, message, driver, clients, options)
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      const index = clients.indexOf(client)
      if (index !== -1) clients.splice(index, 1)
      // Phase 16 Pitfall 6 — when the last client drops, reset recorder mode
      // so picking state does not leak across reconnects.
      if (options.recorder && clients.length === 0) {
        options.recorder.reset()
      }
    })
  })

  // --- Driver event subscriptions ---
  driver.onSnapshotUpdate((tabId: number, snapshot: PageSnapshot) => {
    for (const client of clients) {
      if (client.subscribedTabId === tabId && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'snapshot_update',
          data: { tabId, snapshot },
        }))
      }
    }
  })

  driver.onSessionOpen(() => {
    broadcastSessions(clients, driver)
  })

  driver.onSessionClose(() => {
    broadcastSessions(clients, driver)
  })

  // --- Phase 8: command events + HITL state broadcasts ---
  if (options.commandBroker) {
    options.commandBroker.subscribe((event: CommandEvent) => {
      const payload = JSON.stringify({ type: 'command_event', data: event })
      for (const client of clients) {
        if (client.ws.readyState === client.ws.OPEN) {
          client.ws.send(payload)
        }
      }
    })
  }
  if (options.hitl) {
    options.hitl.onChange((state: HitlState) => {
      const payload = JSON.stringify({ type: 'hitl_state', data: state })
      for (const client of clients) {
        if (client.ws.readyState === client.ws.OPEN) {
          client.ws.send(payload)
        }
      }
    })
  }

  // --- Listen ---
  return new Promise<number>((resolve, reject) => {
    httpServer!.listen(port, '127.0.0.1', () => {
      const addr = httpServer!.address()
      if (addr && typeof addr === 'object') {
        resolve(addr.port)
      } else {
        reject(new Error('Failed to determine server port.'))
      }
    })
    httpServer!.on('error', reject)
  })
}

export async function stopDevtoolsServer(): Promise<void> {
  if (wss) {
    for (const client of wss.clients) {
      client.close()
    }
    wss.close()
    wss = null
  }
  if (httpServer) {
    await new Promise<void>((resolve, reject) => {
      httpServer!.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    httpServer = null
  }
}

function handleClientMessage(
  client: ConnectedClient,
  message: { type: string; tabId?: number; targetId?: string; action?: string; sessionId?: number },
  driver: DevtoolsDriver,
  clients: ConnectedClient[],
  options: DevtoolsServerOptions,
): void {
  switch (message.type) {
    case 'subscribe': {
      if (typeof message.tabId !== 'number') return
      client.subscribedTabId = message.tabId

      // Send current sessions list
      sendToClient(client.ws, {
        type: 'sessions_update',
        data: driver.listSessions(),
      })

      // Send current snapshot if available
      const snapshot = driver.getSnapshot(message.tabId)
      if (snapshot) {
        sendToClient(client.ws, {
          type: 'snapshot_update',
          data: { tabId: message.tabId, snapshot },
        })
      }
      return
    }
    case 'highlight': {
      if (typeof message.targetId !== 'string') return
      if (client.subscribedTabId == null) return
      void driver.execute(client.subscribedTabId, {
        kind: 'highlight',
        targetId: message.targetId,
      })
      return
    }
    case 'clear_highlight': {
      if (client.subscribedTabId == null) return
      void driver.execute(client.subscribedTabId, {
        kind: 'clear_highlight',
      })
      return
    }
    case 'hitl': {
      if (!options.hitl) return
      if (message.action === 'pause') options.hitl.pause()
      else if (message.action === 'resume') options.hitl.resume()
      else if (message.action === 'step') options.hitl.step()
      else if (message.action === 'skip') options.hitl.skip()
      return
    }
    case 'focus_session': {
      if (typeof message.sessionId !== 'number') return
      if (!options.onFocusSession) return
      void Promise.resolve(options.onFocusSession(message.sessionId)).catch(() => {
        // Swallow — onFocusSession is best-effort.
      })
      return
    }
    case 'recorder_toggle': {
      if (!options.recorder) return
      options.recorder.handleToggle()
      return
    }
    case 'recorder_commit': {
      if (!options.recorder) return
      const raw = (message as unknown as { data?: unknown }).data
      if (!isValidCommitPayload(raw)) return
      void options.recorder.handleCommit(raw)
      return
    }
    default:
      return
  }
}

/**
 * Validate the shape of a `recorder_commit` payload before handing it to
 * RecorderController. We deliberately avoid importing zod here so that the
 * MCP devtools-server stays minimal; fields 5-6 justify hand-rolled checks.
 *
 * Threat: T-16-01 (spoofed WS payload). Rejects anything we cannot safely
 * forward to PendingStore without a subsequent sanitize step.
 *
 * WR-04: selector 의 키 집합을 SelectorLadder allowlist (fiber/role/text/
 * testId/attr/css) 로 제한하고 string 필드의 타입을 검증한다. 이렇게 하면
 * `__proto__` 같은 prototype-pollution 페이로드나 거대한 중첩 객체가
 * RecorderController → PendingStore → manifest-merger 경로로 흘러들어가
 * 디스크에 직렬화되는 것을 MCP 경계에서 차단한다.
 */
const ALLOWED_SELECTOR_KEYS: ReadonlySet<string> = new Set([
  'fiber',
  'role',
  'text',
  'testId',
  'attr',
  'css',
])

function isValidCommitPayload(raw: unknown): raw is CommitPayload {
  if (typeof raw !== 'object' || raw === null) return false
  const r = raw as Record<string, unknown>
  if (typeof r.targetId !== 'string' || r.targetId.length === 0 || r.targetId.length > 256) return false
  if (typeof r.url !== 'string' || r.url.length > 4096) return false
  if (typeof r.ts !== 'number' || !Number.isFinite(r.ts)) return false
  if (typeof r.selector !== 'object' || r.selector === null) return false
  if ('sensitive' in r && r.sensitive !== true) return false

  // selector keys + 간이 타입 검증 (WR-04)
  const sel = r.selector as Record<string, unknown>
  const selKeys = Object.keys(sel)
  if (selKeys.length === 0) return false
  for (const k of selKeys) {
    if (!ALLOWED_SELECTOR_KEYS.has(k)) return false
  }
  if ('css' in sel && typeof sel.css !== 'string') return false
  if ('attr' in sel && typeof sel.attr !== 'string') return false
  if ('text' in sel && typeof sel.text !== 'string') return false
  if ('testId' in sel && typeof sel.testId !== 'string') return false
  // fiber/role 은 object shape 이므로 유형만 대략 확인
  if ('role' in sel && (typeof sel.role !== 'object' || sel.role === null)) return false
  if ('fiber' in sel && (typeof sel.fiber !== 'object' || sel.fiber === null)) return false
  return true
}

function broadcastSessions(
  clients: ConnectedClient[],
  driver: DevtoolsDriver,
): void {
  const sessions = driver.listSessions()
  const payload = JSON.stringify({
    type: 'sessions_update',
    data: sessions,
  })
  for (const client of clients) {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(payload)
    }
  }
}

function sendToClient(ws: WebSocket, data: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data))
  }
}
