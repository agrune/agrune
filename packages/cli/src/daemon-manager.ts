import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { requestJson } from './daemon-client.js'
import type { DaemonHealth } from './types.js'
import {
  CLI_VERSION,
  isPidAlive,
  readSessionFile,
  removeSessionFile,
  removeSocketFile,
  workspaceRunDir,
} from './session-file.js'

// Generous: a cold browser launch can take a while — stealing a live lock
// would double-spawn daemons, which is worse than waiting out a crashed one.
const SPAWN_LOCK_STALE_MS = 60_000
const HEALTH_POLL_TIMEOUT_MS = 15_000
const HEALTH_POLL_INTERVAL_MS = 150

/**
 * Make sure a workspace daemon is reachable at `endpoint` (a `unix:` token).
 * Health-check first; on failure clean up stale state and spawn a detached
 * `agrune daemon run` bound to the workspace socket, then poll until healthy.
 */
export async function ensureDaemon(
  endpoint: string,
  options: { headless?: boolean } = {},
): Promise<void> {
  if (await isHealthy(endpoint)) {
    const session = readSessionFile()
    if (session && session.version !== CLI_VERSION) {
      // Version skew: restart so client and daemon agree on the protocol.
      await stopDaemon()
      await spawnAndWait(endpoint, options)
    }
    return
  }

  cleanupStaleState()
  await spawnAndWait(endpoint, options)
}

/** SIGTERM the recorded daemon (if any) and clear its session state. */
export async function stopDaemon(): Promise<{ stopped: boolean; pid?: number }> {
  const session = readSessionFile()
  if (!session) return { stopped: false }

  if (isPidAlive(session.pid)) {
    try {
      process.kill(session.pid, 'SIGTERM')
    } catch {
      // already gone
    }
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline && isPidAlive(session.pid)) {
      await sleep(100)
    }
    if (isPidAlive(session.pid)) {
      // Refuses to die gracefully — escalate before clearing its session
      // state, otherwise we'd leave an unreachable orphan running.
      try {
        process.kill(session.pid, 'SIGKILL')
      } catch {
        // already gone
      }
      const killDeadline = Date.now() + 2_000
      while (Date.now() < killDeadline && isPidAlive(session.pid)) {
        await sleep(100)
      }
    }
  }
  removeSocketFile(session.socketPath)
  removeSessionFile()
  return { stopped: true, pid: session.pid }
}

function cleanupStaleState(): void {
  const session = readSessionFile()
  if (session) {
    if (isPidAlive(session.pid)) {
      // Process exists but the socket is unhealthy — likely wedged. Terminate.
      try {
        process.kill(session.pid, 'SIGTERM')
      } catch {
        // ignore
      }
    }
    removeSocketFile(session.socketPath)
    removeSessionFile()
  }
}

async function spawnAndWait(
  endpoint: string,
  options: { headless?: boolean },
): Promise<void> {
  const runDir = workspaceRunDir()
  mkdirSync(runDir, { recursive: true })
  const lockPath = join(runDir, 'spawn.lock')

  if (!acquireLock(lockPath)) {
    // Another invocation is spawning the daemon — just wait for it.
    await waitForHealthy(endpoint)
    return
  }

  try {
    const args = [process.argv[1], 'daemon', 'run']
    if (options.headless) args.push('--headless')
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    })
    child.unref()
    try {
      await waitForHealthy(endpoint)
    } catch (error) {
      // Don't leave a late-arriving orphan daemon behind a failed wait.
      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGTERM')
        } catch {
          // already gone
        }
      }
      throw error
    }
  } finally {
    rmSync(lockPath, { force: true })
  }
}

function acquireLock(lockPath: string): boolean {
  try {
    const fd = openSync(lockPath, 'wx')
    closeSync(fd)
    return true
  } catch {
    try {
      const age = Date.now() - statSync(lockPath).mtimeMs
      if (age > SPAWN_LOCK_STALE_MS) {
        rmSync(lockPath, { force: true })
        const fd = openSync(lockPath, 'wx')
        closeSync(fd)
        return true
      }
    } catch {
      // raced with another process — fall through to waiting
    }
    return false
  }
}

async function waitForHealthy(endpoint: string): Promise<void> {
  const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await isHealthy(endpoint)) return
    await sleep(HEALTH_POLL_INTERVAL_MS)
  }
  throw new Error(
    `Agrune daemon did not become healthy at ${endpoint} within ${HEALTH_POLL_TIMEOUT_MS}ms. ` +
    'Try "agrune daemon start" in a separate terminal to inspect startup errors.',
  )
}

async function isHealthy(endpoint: string): Promise<boolean> {
  try {
    const health = await requestJson<DaemonHealth>(endpoint, '/health')
    return health.ok === true && health.name === 'agrune-daemon'
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
