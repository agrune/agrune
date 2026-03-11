import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { DEFAULT_COMPANION_CONFIG } from '@webcli-dom/core'
import type { CompanionPaths, PersistedState } from './types.js'

const DEFAULT_STATE: PersistedState = {
  approvals: {},
  activeSessionId: null,
  config: { ...DEFAULT_COMPANION_CONFIG },
}

export function resolveCompanionPaths(homeDirOverride?: string): CompanionPaths {
  const homeDir = homeDirOverride ?? path.join(os.homedir(), '.webcli-dom', 'companion')
  return {
    homeDir,
    statePath: path.join(homeDir, 'state.json'),
    tokenPath: path.join(homeDir, 'agent-token'),
    pidPath: path.join(homeDir, 'companion.pid'),
  }
}

export function ensureCompanionHome(paths: CompanionPaths): void {
  fs.mkdirSync(paths.homeDir, { recursive: true })
}

export function loadPersistedState(paths: CompanionPaths): PersistedState {
  ensureCompanionHome(paths)
  if (!fs.existsSync(paths.statePath)) {
    return {
      approvals: {},
      activeSessionId: null,
      config: { ...DEFAULT_COMPANION_CONFIG },
    }
  }

  try {
    const raw = fs.readFileSync(paths.statePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      approvals:
        parsed.approvals && typeof parsed.approvals === 'object'
          ? (parsed.approvals as PersistedState['approvals'])
          : {},
      activeSessionId:
        typeof parsed.activeSessionId === 'string' || parsed.activeSessionId === null
          ? parsed.activeSessionId
          : null,
      config: {
        ...DEFAULT_COMPANION_CONFIG,
        ...(parsed.config ?? {}),
      },
    }
  } catch {
    return { ...DEFAULT_STATE, config: { ...DEFAULT_COMPANION_CONFIG } }
  }
}

export function savePersistedState(paths: CompanionPaths, state: PersistedState): void {
  ensureCompanionHome(paths)
  fs.writeFileSync(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export function ensureAgentToken(paths: CompanionPaths): string {
  ensureCompanionHome(paths)
  if (fs.existsSync(paths.tokenPath)) {
    const raw = fs.readFileSync(paths.tokenPath, 'utf8').trim()
    if (raw) {
      return raw
    }
  }

  const token = randomBytes(24).toString('hex')
  fs.writeFileSync(paths.tokenPath, `${token}\n`, 'utf8')
  return token
}

export function readPid(paths: CompanionPaths): number | null {
  if (!fs.existsSync(paths.pidPath)) return null
  const raw = fs.readFileSync(paths.pidPath, 'utf8').trim()
  if (!raw) return null
  const pid = Number(raw)
  if (!Number.isInteger(pid) || pid <= 0) return null
  return pid
}

export function writePid(paths: CompanionPaths, pid: number): void {
  ensureCompanionHome(paths)
  fs.writeFileSync(paths.pidPath, `${pid}\n`, 'utf8')
}

export function removePid(paths: CompanionPaths): void {
  if (!fs.existsSync(paths.pidPath)) return
  fs.unlinkSync(paths.pidPath)
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
