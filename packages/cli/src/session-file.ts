import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

declare const __AGRUNE_CLI_VERSION__: string | undefined

export const CLI_VERSION =
  typeof __AGRUNE_CLI_VERSION__ !== 'undefined' ? __AGRUNE_CLI_VERSION__ : '0.0.0'

/** Persisted by `agrune daemon run` so one-shot CLI invocations can find the socket. */
export interface DaemonSessionFile {
  pid: number
  socketPath: string
  workspace: string
  startedAt: number
  version: string
}

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

/** Per-workspace state directory: `~/.agrune/run/<sha256(cwd) 12>`. */
export function workspaceRunDir(cwd: string = process.cwd()): string {
  return join(homedir(), '.agrune', 'run', workspaceHash(cwd))
}

export function defaultSocketPath(cwd: string = process.cwd()): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\agrune-${workspaceHash(cwd)}`
  }
  return join(workspaceRunDir(cwd), 'daemon.sock')
}

export function sessionFilePath(cwd: string = process.cwd()): string {
  return join(workspaceRunDir(cwd), 'daemon.json')
}

export function readSessionFile(cwd: string = process.cwd()): DaemonSessionFile | null {
  try {
    const raw = readFileSync(sessionFilePath(cwd), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DaemonSessionFile>
    if (
      typeof parsed.pid === 'number' &&
      typeof parsed.socketPath === 'string' &&
      typeof parsed.workspace === 'string' &&
      typeof parsed.startedAt === 'number' &&
      typeof parsed.version === 'string'
    ) {
      return parsed as DaemonSessionFile
    }
    return null
  } catch {
    return null
  }
}

export function writeSessionFile(file: DaemonSessionFile, cwd: string = process.cwd()): void {
  mkdirSync(workspaceRunDir(cwd), { recursive: true })
  writeFileSync(sessionFilePath(cwd), `${JSON.stringify(file, null, 2)}\n`, 'utf-8')
}

export function removeSessionFile(cwd: string = process.cwd()): void {
  rmSync(sessionFilePath(cwd), { force: true })
}

export function removeSocketFile(socketPath: string): void {
  if (process.platform === 'win32') return
  rmSync(socketPath, { force: true })
}

export function socketFileExists(socketPath: string): boolean {
  if (process.platform === 'win32') return false
  return existsSync(socketPath)
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
