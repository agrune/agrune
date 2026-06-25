// The daemon: a node:http server over a Unix domain socket (TCP fallback). SPEC §7.4 / A.1.
//
// One PlaywrightSession (BrowserSession) owns the single chromium context. Every CLI verb is
// one HTTP request → one response (A.1.1). Success → 200 `{ ok:true, ... }`; any thrown error
// → 400 `{ ok:false, error }` (A.1.4 / A.1.6). M1 wires the lifecycle + navigation routes;
// M4 adds the action/perception routes.

import http from 'node:http'
import net from 'node:net'
import { BrowserSession } from './browser-session.js'
import { CliError, errorResponse } from './errors.js'
import {
  ensureRunDir,
  removeSocketFile,
  socketFileExists,
  type DaemonEndpoint,
} from './registry.js'
import type { DaemonEvent, DaemonHealth } from './types.js'

// ---- event ring buffer (§7.5, minimal) -------------------------------------

class DaemonEventBroker {
  private readonly buffer: DaemonEvent[] = []
  private counter = 0
  constructor(private readonly bufferSize = 500) {}

  nextId(): string {
    return `cmd-${this.counter++}`
  }

  record(event: DaemonEvent): void {
    this.buffer.push(event)
    if (this.buffer.length > this.bufferSize) this.buffer.shift()
  }

  history(): DaemonEvent[] {
    return [...this.buffer]
  }
}

// ---- body / query helpers --------------------------------------------------

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key]
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new CliError('INVALID_COMMAND', `Missing required string field: ${key}`)
  }
  return v
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function requirePositiveInteger(value: unknown, label: string): number {
  const n = optionalNumber(value)
  if (n === undefined || !Number.isInteger(n) || n <= 0) {
    throw new CliError('INVALID_COMMAND', `${label} must be a positive integer`)
  }
  return n
}

// ---- route table -----------------------------------------------------------

interface RouteCtx {
  method: string
  pathname: string
  query: URLSearchParams
  body: Record<string, unknown>
  session: BrowserSession
  broker: DaemonEventBroker
}

async function routeRequest(ctx: RouteCtx): Promise<Record<string, unknown>> {
  const { method, pathname, query, body, session } = ctx
  const route = `${method} ${pathname}`

  switch (route) {
    case 'GET /health': {
      const health: DaemonHealth = {
        ok: true,
        name: 'agrune-daemon',
        browser: 'playwright',
        tabs: session.tabCount,
      }
      return health as unknown as Record<string, unknown>
    }

    case 'GET /events/history':
      return { ok: true, events: ctx.broker.history() }

    case 'GET /tabs':
      return { ok: true, tabs: await session.listTabs() }

    case 'GET /targets': {
      // Server builds + filters the snapshot; the CLI formats it (A.2.3).
      const snapshot = await session.snapshot(optionalNumber(query.get('tabId')))
      return { ok: true, snapshot }
    }

    case 'GET /snapshot': {
      const result = await session.ariaSnapshot(optionalNumber(query.get('tabId')), {
        target: query.get('target') ?? undefined,
        mode: parseAriaMode(query.get('mode')),
        depth: parseDepth(query.get('depth')),
      })
      return { ok: true, ...result }
    }

    case 'POST /open':
    case 'POST /tabs/new': {
      const url = requireString(body, 'url')
      const { index, tab } = await session.open(url)
      return { ok: true, index, tab }
    }

    case 'POST /navigate': {
      const url = requireString(body, 'url')
      const tab = await session.navigate(url, optionalNumber(body.tabId))
      return { ok: true, action: 'navigate', tab }
    }

    case 'POST /back':
      return { ok: true, action: 'back', tab: await session.back(optionalNumber(body.tabId)) }

    case 'POST /forward':
      return { ok: true, action: 'forward', tab: await session.forward(optionalNumber(body.tabId)) }

    case 'POST /reload':
      return { ok: true, action: 'reload', tab: await session.reload(optionalNumber(body.tabId)) }

    case 'POST /resize': {
      const width = requirePositiveInteger(body.width, 'width')
      const height = requirePositiveInteger(body.height, 'height')
      const r = await session.resize(width, height, optionalNumber(body.tabId))
      return { ok: true, action: 'resize', tabId: r.tabId, width: r.width, height: r.height }
    }

    case 'POST /tabs/select':
    case 'POST /tabs/focus': {
      const tabId = resolveTabSelector(body, session)
      const { index, tab } = await session.focusTab(tabId)
      return { ok: true, index, tab }
    }

    case 'POST /close':
    case 'POST /tabs/close': {
      let tabId: number | undefined
      if (body.index !== undefined) tabId = session.tabIdByIndex(requireIndex(body.index))
      else tabId = optionalNumber(body.tabId)
      const r = await session.closeTab(tabId)
      return { ok: true, index: r.index, closedTabId: r.closedTabId, tabs: r.tabs }
    }

    default:
      throw new CliError('INVALID_COMMAND', `Unknown endpoint: ${method} ${pathname}`)
  }
}

function parseAriaMode(value: string | null): 'ai' | 'default' | undefined {
  if (value === null) return undefined
  if (value !== 'ai' && value !== 'default') {
    throw new CliError('INVALID_COMMAND', 'snapshot mode must be one of: ai, default')
  }
  return value
}

function parseDepth(value: string | null): number | undefined {
  if (value === null) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new CliError('INVALID_COMMAND', 'depth must be a positive integer')
  }
  return n
}

function requireIndex(value: unknown): number {
  const n = optionalNumber(value)
  if (n === undefined || !Number.isInteger(n) || n < 0) {
    throw new CliError('INVALID_COMMAND', 'index must be a non-negative integer')
  }
  return n
}

function resolveTabSelector(body: Record<string, unknown>, session: BrowserSession): number {
  if (body.index !== undefined && body.tabId !== undefined) {
    throw new CliError('INVALID_COMMAND', 'Use either --index or tabId, not both')
  }
  if (body.index !== undefined) return session.tabIdByIndex(requireIndex(body.index))
  const tabId = optionalNumber(body.tabId)
  if (tabId === undefined) {
    throw new CliError('INVALID_COMMAND', 'A tabId or --index is required')
  }
  return tabId
}

function shouldTrack(method: string, pathname: string): boolean {
  return !(method === 'GET' && (pathname === '/health' || pathname === '/events/history'))
}

// ---- server lifecycle ------------------------------------------------------

export interface DaemonHandle {
  url: string
  close(): Promise<void>
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function socketAccepting(socketPath: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ path: socketPath })
    const done = (v: boolean) => {
      sock.destroy()
      resolve(v)
    }
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.setTimeout(timeoutMs, () => done(false))
  })
}

export async function startDaemon(opts: {
  endpoint: DaemonEndpoint['endpoint']
  headless: boolean
  cwd?: string
}): Promise<DaemonHandle> {
  const session = new BrowserSession(opts.headless)
  await session.start()
  const broker = new DaemonEventBroker()

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, session, broker)
  })

  const isUnix = opts.endpoint.startsWith('unix:')
  let url: string

  if (isUnix) {
    const socketPath = opts.endpoint.slice('unix:'.length)
    ensureRunDir(opts.cwd)
    if (socketFileExists(socketPath)) {
      if (await socketAccepting(socketPath)) {
        await session.stop()
        throw new CliError('DAEMON_ALREADY_RUNNING', `A daemon is already listening on ${socketPath}.`)
      }
      removeSocketFile(socketPath)
    }
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, () => resolve())
    })
    url = `unix:${socketPath}`
  } else {
    const u = new URL(opts.endpoint)
    const port = u.port ? Number(u.port) : 80
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, u.hostname, () => resolve())
    })
    url = opts.endpoint
  }

  return {
    url,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      if (isUnix) removeSocketFile(opts.endpoint.slice('unix:'.length))
      await session.stop()
    },
  }
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  session: BrowserSession,
  broker: DaemonEventBroker,
): Promise<void> {
  const method = req.method ?? 'GET'
  const parsed = new URL(req.url ?? '/', 'http://localhost')
  const pathname = parsed.pathname
  const track = shouldTrack(method, pathname)
  const eventId = track ? broker.nextId() : ''
  const startedAt = process.hrtime.bigint()

  try {
    const body = method === 'GET' ? {} : await readJsonBody(req)
    if (track) {
      broker.record({ id: eventId, ts: Date.now(), method, path: pathname, phase: 'start' })
    }
    const result = await routeRequest({
      method,
      pathname,
      query: parsed.searchParams,
      body,
      session,
      broker,
    })
    if (track) {
      broker.record({
        id: eventId,
        ts: Date.now(),
        method,
        path: pathname,
        phase: 'end',
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      })
    }
    sendJson(res, 200, result)
  } catch (error) {
    const env = errorResponse(error)
    if (track) {
      broker.record({
        id: eventId,
        ts: Date.now(),
        method,
        path: pathname,
        phase: 'error',
        error: { code: env.error.code, message: env.error.message },
      })
    }
    sendJson(res, 400, env)
  }
}
