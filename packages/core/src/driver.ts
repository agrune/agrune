import type { PageSnapshot, CommandResult, AgruneRuntimeConfig } from './index.js'
import type { AgruneManifest } from './manifest.js'

export interface Session {
  tabId: number
  url: string
  title: string
  hasSnapshot: boolean
  snapshotVersion?: number | null
  active?: boolean
  lastInteractionAt?: number | null
}

export interface FocusResult {
  tabId: number
  wasActive: boolean
  becameActive: boolean
  cdpFocusError?: string
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
  focusSession(tabId: number): Promise<FocusResult>

  /**
   * manifest를 활성 세션에 런타임 주입한다.
   * window.__agrune_manifest__ = manifest; reloadRuntime() 시퀀스로 즉시 적용.
   * MCP layer(Plan 03)가 agrune_manifest_load tool에서 호출하는 계약점.
   *
   * optional — mock driver에서 누락 시 Plan 03에서 typeof 타입 가드로 방어 (T-12-07).
   */
  injectManifest?(tabId: number, manifest: AgruneManifest): Promise<void>
}
