import http from 'node:http'
import { CliError } from './errors.js'

/**
 * Daemon endpoint token:
 * - `unix:<socketPath>` — unix domain socket (win32: named pipe path)
 * - `http://host:port`  — TCP fallback for --host/--port (tests, remote)
 *
 * The token shape keeps every CLI call site on a single opaque string.
 */
export function isSocketEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('unix:')
}

export function socketPathFromEndpoint(endpoint: string): string {
  return endpoint.slice('unix:'.length)
}

/**
 * Auto-spawn hook, registered per CLI invocation for non-pinned workspace
 * endpoints. Running it lazily — right before the first real request — keeps
 * argument validation failures from spawning a daemon.
 */
let autoSpawn: (() => Promise<void>) | null = null

export function setDaemonAutoSpawn(hook: (() => Promise<void>) | null): void {
  autoSpawn = hook
}

export async function requestJson<T>(
  endpoint: string,
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<T> {
  if (autoSpawn) {
    const spawnHook = autoSpawn
    autoSpawn = null
    await spawnHook()
  }
  const { status, text } = await rawRequest(endpoint, path, init)
  const parsed = text ? safeParseJson(text) : null
  if (status < 200 || status >= 300) {
    const err = parsed && typeof parsed === 'object' && 'error' in parsed
      ? (parsed as { error: { code?: string; message?: string; details?: Record<string, unknown> } }).error
      : null
    throw new CliError(
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Agrune daemon returned HTTP ${status}.`,
      err?.details,
    )
  }
  return parsed as T
}

function rawRequest(
  endpoint: string,
  path: string,
  init: { method?: string; body?: string },
): Promise<{ status: number; text: string }> {
  const options: http.RequestOptions = {
    method: init.method ?? 'GET',
    path,
    headers: {
      'content-type': 'application/json',
      ...(init.body ? { 'content-length': Buffer.byteLength(init.body) } : {}),
    },
  }

  if (isSocketEndpoint(endpoint)) {
    options.socketPath = socketPathFromEndpoint(endpoint)
  } else {
    const url = new URL(endpoint)
    options.host = url.hostname
    options.port = url.port ? Number(url.port) : 80
  }

  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf-8') })
      })
    })
    req.on('error', error => {
      reject(new CliError(
        'DAEMON_UNAVAILABLE',
        `Agrune daemon is not reachable at ${endpoint}. Start it with "agrune daemon start".`,
        { cause: error instanceof Error ? error.message : String(error) },
      ))
    })
    if (init.body) req.write(init.body)
    req.end()
  })
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
