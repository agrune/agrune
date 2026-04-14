import type { PageSnapshot, CommandResult, AgruneRuntimeConfig } from './index.js'

export interface Session {
  tabId: number
  url: string
  title: string
  hasSnapshot: boolean
  snapshotVersion?: number | null
}

export interface BrowserDriver {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  listSessions(): Session[]
  getSnapshot(tabId: number): PageSnapshot | null
  onSessionOpen(cb: (session: Session) => void): void
  onSessionClose(cb: (tabId: number) => void): void
  onSnapshotUpdate(cb: (tabId: number, snapshot: PageSnapshot) => void): void

  execute(tabId: number, command: Record<string, unknown> & { kind: string }): Promise<CommandResult>
  updateConfig(config: Partial<AgruneRuntimeConfig>): void
  ensureReady(): Promise<string | null>
  resolveTabId(tabId?: number): number | null
}
