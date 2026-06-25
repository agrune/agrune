// One-shot HTTP client + daemon lifecycle (auto-spawn / stop). SPEC §7.2–7.3 / A.1.3–A.1.9.
//
// Every CLI verb is one request → one response over the workspace Unix socket (TCP fallback).
// Non-explicit endpoints auto-spawn a detached `agrune daemon run` on first request.

import http from 'node:http'
import { openSync, closeSync, statSync, rmSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { CliError } from './errors.js'
import { CLI_VERSION } from './version.js'
import { assertBrowserInstalled } from './browser-check.js'
import {
  ensureRunDir,
  isPidAlive,
  readSessionFile,
  removeSessionFile,
  removeSocketFile,
  workspaceRunDir,
} from './registry.js'
import type { DaemonHealth } from './types.js'

const SPAWN_LOCK_STALE_MS = 60_000
const HEALTHY_TIMEOUT_MS = 15_000
const HEALTHY_POLL_MS = 150

interface RawResponse {
  status: number
  text: string
}

function rawRequest(
  endpoint: string,
  method: string,
  path: string,
  body?: string,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body))

    const options: http.RequestOptions = { method, path, headers }
    if (endpoint.startsWith('unix:')) {
      options.socketPath = endpoint.slice('unix:'.length)
    } else {
      const u = new URL(endpoint)
      options.host = u.hostname
      options.port = u.port ? Number(u.port) : 80
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

function safeParseJson(text: string): unknown {
  try {
    return text.length === 0 ? null : JSON.parse(text)
  } catch {
    return null
  }
}

/** requestJson (A.1.7): parse, throw on non-2xx, map socket errors to DAEMON_UNAVAILABLE. */
export async function requestJson<T = Record<string, unknown>>(
  endpoint: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  let raw: RawResponse
  try {
    raw = await rawRequest(endpoint, method, path, body ? JSON.stringify(body) : undefined)
  } catch (cause) {
    throw new CliError(
      'DAEMON_UNAVAILABLE',
      `Agrune daemon is not reachable at ${endpoint}. Start it with "agrune daemon start".`,
      { cause: String(cause) },
    )
  }
  const parsed = safeParseJson(raw.text) as
    | { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    | null
  if (raw.status < 200 || raw.status >= 300) {
    const err = parsed?.error
    throw new CliError(
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Agrune daemon returned HTTP ${raw.status}.`,
      err?.details,
    )
  }
  return parsed as T
}

// ---- health & lifecycle ----------------------------------------------------

export async function isHealthy(endpoint: string): Promise<boolean> {
  try {
    const health = await requestJson<DaemonHealth>(endpoint, 'GET', '/health')
    return health?.ok === true && health.name === 'agrune-daemon'
  } catch {
    return false
  }
}

async function waitForHealthy(endpoint: string, timeoutMs = HEALTHY_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHealthy(endpoint)) return
    await delay(HEALTHY_POLL_MS)
  }
  throw new CliError(
    'DAEMON_UNAVAILABLE',
    `Agrune daemon did not become healthy at ${endpoint}. Try "agrune daemon start".`,
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanupStaleState(cwd?: string): void {
  const file = readSessionFile(cwd)
  if (file && isPidAlive(file.pid)) {
    try {
      process.kill(file.pid, 'SIGTERM')
    } catch {
      /* ignore */
    }
  }
  if (file?.socketPath) removeSocketFile(file.socketPath)
  removeSessionFile(cwd)
}

/**
 * ensureDaemon (A.1.9): health-check; restart on version skew; clean stale state and spawn a
 * detached daemon otherwise. Spawn guarded by a stale-able lock file.
 */
export async function ensureDaemon(
  endpoint: string,
  opts: { headless: boolean; cwd?: string },
): Promise<void> {
  if (await isHealthy(endpoint)) {
    const file = readSessionFile(opts.cwd)
    if (file && file.version !== CLI_VERSION) {
      await stopDaemon(opts.cwd)
      await spawnAndWait(endpoint, opts)
    }
    return
  }
  cleanupStaleState(opts.cwd)
  await spawnAndWait(endpoint, opts)
}

async function spawnAndWait(endpoint: string, opts: { headless: boolean; cwd?: string }): Promise<void> {
  // Fail fast with an actionable hint instead of a 15s waitForHealthy timeout when the browser
  // is not downloaded (the daemon is detached, so its launch error would otherwise be lost). §9.
  assertBrowserInstalled()

  const runDir = ensureRunDir(opts.cwd)
  const lockPath = join(runDir, 'spawn.lock')

  let fd: number
  try {
    fd = openSync(lockPath, 'wx')
  } catch {
    // Lock held: steal if stale, else another invocation is spawning — just wait.
    let stale = false
    try {
      stale = Date.now() - statSync(lockPath).mtimeMs > SPAWN_LOCK_STALE_MS
    } catch {
      stale = true
    }
    if (stale) {
      try {
        unlinkSync(lockPath)
      } catch {
        /* ignore */
      }
      return spawnAndWait(endpoint, opts)
    }
    await waitForHealthy(endpoint)
    return
  }

  try {
    closeSync(fd)
    const entry = process.argv[1]
    if (!entry) throw new CliError('INTERNAL_ERROR', 'Cannot determine agrune entry point for auto-spawn.')
    const daemonArgs = [entry, 'daemon', 'run']
    if (opts.headless) daemonArgs.push('--headless')
    const child = spawn(process.execPath, daemonArgs, {
      detached: true,
      stdio: 'ignore',
      cwd: opts.cwd ?? process.cwd(),
    })
    child.unref()
    try {
      await waitForHealthy(endpoint)
    } catch (err) {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      throw err
    }
  } finally {
    try {
      rmSync(lockPath, { force: true })
    } catch {
      /* ignore */
    }
  }
}

/** stopDaemon (§7.3): SIGTERM (poll 5s) then SIGKILL (poll 2s), remove socket + session. */
export async function stopDaemon(cwd?: string): Promise<{ stopped: boolean; pid?: number }> {
  const file = readSessionFile(cwd)
  if (!file) return { stopped: false }

  if (isPidAlive(file.pid)) {
    try {
      process.kill(file.pid, 'SIGTERM')
    } catch {
      /* ignore */
    }
    if (!(await waitForExit(file.pid, 5000))) {
      try {
        process.kill(file.pid, 'SIGKILL')
      } catch {
        /* ignore */
      }
      await waitForExit(file.pid, 2000)
    }
  }
  if (file.socketPath) removeSocketFile(file.socketPath)
  removeSessionFile(cwd)
  return { stopped: true, pid: file.pid }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true
    await delay(100)
  }
  return !isPidAlive(pid)
}

/**
 * DaemonClient: holds the endpoint and lazily auto-spawns (non-explicit endpoints) on the
 * first request, so arg-validation failures never spawn a daemon (§7.2).
 */
export class DaemonClient {
  private spawnTriggered = false

  constructor(
    private readonly endpoint: string,
    private readonly opts: { explicit: boolean; headless: boolean; cwd?: string },
  ) {}

  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.opts.explicit && !this.spawnTriggered) {
      this.spawnTriggered = true
      await ensureDaemon(this.endpoint, { headless: this.opts.headless, cwd: this.opts.cwd })
    }
    return requestJson<T>(this.endpoint, method, path, body)
  }
}

export function cleanupRunDir(cwd?: string): void {
  try {
    rmSync(workspaceRunDir(cwd), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}
