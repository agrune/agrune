import { mergeCompanionConfig } from '@webcli-dom/core'
import { savePersistedState } from './state-store.js'
import type {
  ApprovalStatus,
  CompanionConfig,
  CompanionLogEntry,
  CompanionPaths,
  PersistedState,
} from './types.js'

export interface RuntimeStore {
  readonly persisted: PersistedState
  addLog: (
    kind: CompanionLogEntry['kind'],
    message: string,
    meta?: unknown,
    forceConsoleError?: boolean,
  ) => void
  listLogs: (limit: number) => CompanionLogEntry[]
  ensureApprovalTracked: (origin: string) => ApprovalStatus
  setOriginApproval: (origin: string, status: ApprovalStatus) => void
  setActiveSessionId: (sessionId: string | null) => void
  updateConfig: (patch: Partial<CompanionConfig>) => CompanionConfig
  listOrigins: () => Array<{ origin: string; status: ApprovalStatus }>
}

interface CreateRuntimeStoreOptions {
  paths: CompanionPaths
  persisted: PersistedState
  logger: (message: string) => void
  logLimit: number
}

export function createRuntimeStore(options: CreateRuntimeStoreOptions): RuntimeStore {
  const { paths, persisted, logger, logLimit } = options
  const logs: CompanionLogEntry[] = []
  let nextLogId = 1

  const persistState = (): void => {
    savePersistedState(paths, persisted)
  }

  const addLog: RuntimeStore['addLog'] = (kind, message, meta, forceConsoleError = false) => {
    logs.unshift({
      id: nextLogId,
      at: Date.now(),
      kind,
      message,
      meta,
    })
    nextLogId += 1
    if (logs.length > logLimit) {
      logs.length = logLimit
    }
    if (kind === 'error' || forceConsoleError) {
      logger(`${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`)
    }
  }

  const ensureApprovalTracked = (origin: string): ApprovalStatus => {
    const known = persisted.approvals[origin]
    if (known) return known
    persisted.approvals[origin] = 'pending'
    persistState()
    addLog('system', 'origin added to pending approvals', { origin })
    return 'pending'
  }

  const setOriginApproval = (origin: string, status: ApprovalStatus): void => {
    persisted.approvals[origin] = status
    persistState()
    addLog('api', 'origin approval updated', { origin, status })
  }

  const setActiveSessionId = (sessionId: string | null): void => {
    persisted.activeSessionId = sessionId
    persistState()
    addLog('api', 'active session updated', { sessionId })
  }

  const updateConfig = (patch: Partial<CompanionConfig>): CompanionConfig => {
    persisted.config = mergeCompanionConfig(persisted.config, patch)
    persistState()
    addLog('api', 'config updated', { config: persisted.config })
    return { ...persisted.config }
  }

  const listOrigins = (): Array<{ origin: string; status: ApprovalStatus }> =>
    Object.entries(persisted.approvals)
      .map(([origin, status]) => ({ origin, status }))
      .sort((a, b) => a.origin.localeCompare(b.origin))

  return {
    persisted,
    addLog,
    listLogs: limit => logs.slice(0, limit),
    ensureApprovalTracked,
    setOriginApproval,
    setActiveSessionId,
    updateConfig,
    listOrigins,
  }
}
