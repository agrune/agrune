// Workspace discovery, endpoint derivation, and the daemon session file. SPEC §7.1 / A.1.2.

import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { realpathSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { getStringFlag, getPositiveIntFlag } from './args.js'

export const DEFAULT_DAEMON_HOST = '127.0.0.1'
export const DEFAULT_DAEMON_PORT = 47654

export function workspacePath(cwd: string = process.cwd()): string {
  try {
    return realpathSync(cwd)
  } catch {
    return cwd
  }
}

export function workspaceHash(cwd: string = process.cwd()): string {
  return createHash('sha256').update(workspacePath(cwd)).digest('hex').slice(0, 12)
}

export function workspaceRunDir(cwd: string = process.cwd()): string {
  return join(homedir(), '.agrune', 'run', workspaceHash(cwd))
}

/** POSIX → `<runDir>/daemon.sock`; win32 → named pipe `\\.\pipe\agrune-<hash12>`. */
export function defaultSocketPath(cwd: string = process.cwd()): string {
  const hash = workspaceHash(cwd)
  if (process.platform === 'win32') return `\\\\.\\pipe\\agrune-${hash}`
  return join(workspaceRunDir(cwd), 'daemon.sock')
}

export function sessionFilePath(cwd: string = process.cwd()): string {
  return join(workspaceRunDir(cwd), 'daemon.json')
}

export interface DaemonEndpoint {
  /** `unix:<socketPath>` or `http://<host>:<port>`. */
  endpoint: string
  explicit: boolean
}

/**
 * Endpoint token (A.1.2). Override precedence:
 *   --host/--port (→ http://…, explicit) > AGRUNE_DAEMON_SOCKET (→ unix:…, explicit) >
 *   default workspace socket (unix:…, non-explicit → auto-spawns).
 */
export function getDaemonEndpoint(
  flags: Record<string, string | boolean>,
  cwd: string = process.cwd(),
): DaemonEndpoint {
  const host = getStringFlag(flags, 'host')
  const port = getPositiveIntFlag(flags, 'port')
  if (host !== undefined || port !== undefined) {
    if (port !== undefined && (port < 1 || port > 65535)) {
      throw new Error('--port must be between 1 and 65535')
    }
    const h = host ?? DEFAULT_DAEMON_HOST
    const p = port ?? DEFAULT_DAEMON_PORT
    return { endpoint: `http://${h}:${p}`, explicit: true }
  }
  const envSock = process.env.AGRUNE_DAEMON_SOCKET
  if (envSock && envSock.trim().length > 0) {
    return { endpoint: `unix:${envSock.trim()}`, explicit: true }
  }
  return { endpoint: `unix:${defaultSocketPath(cwd)}`, explicit: false }
}

export interface DaemonSessionFile {
  pid: number
  socketPath: string
  workspace: string
  startedAt: number
  version: string
}

export function readSessionFile(cwd: string = process.cwd()): DaemonSessionFile | null {
  try {
    const raw = readFileSync(sessionFilePath(cwd), 'utf8')
    return JSON.parse(raw) as DaemonSessionFile
  } catch {
    return null
  }
}

export function writeSessionFile(file: DaemonSessionFile, cwd: string = process.cwd()): void {
  mkdirSync(workspaceRunDir(cwd), { recursive: true })
  writeFileSync(sessionFilePath(cwd), JSON.stringify(file, null, 2))
}

export function removeSessionFile(cwd: string = process.cwd()): void {
  try {
    rmSync(sessionFilePath(cwd), { force: true })
  } catch {
    /* ignore */
  }
}

/** No-op on win32 (named pipes are not filesystem-unlinkable). §7.6. */
export function removeSocketFile(socketPath: string): void {
  if (process.platform === 'win32') return
  try {
    rmSync(socketPath, { force: true })
  } catch {
    /* ignore */
  }
}

/** win32 returns false → stale-socket probe never runs there (§7.6). */
export function socketFileExists(socketPath: string): boolean {
  if (process.platform === 'win32') return false
  return existsSync(socketPath)
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH = no such process; EPERM = exists but not ours (alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function ensureRunDir(cwd: string = process.cwd()): string {
  const dir = workspaceRunDir(cwd)
  mkdirSync(dir, { recursive: true })
  return dir
}
