import type { PageSnapshot, CommandResult, AgruneRuntimeConfig } from './index.js'
import type { AgruneManifest } from './manifest.js'

/**
 * MacroResult 유니온 타입 — source of truth: @agrune/runtime/macro-runner
 * 순환 import 회피를 위해 core 에 local 복제.
 */
export type MacroResult =
  | { status: 'ok' }
  | { status: 'already-satisfied' }
  | { status: 'precondition-failed'; reason: string }
  | { status: 'postcondition-failed'; reason: string }
  | { status: 'circuit-open'; failedStep: number }
  | { status: 'step-error'; stepIndex: number; error: string }
  | { status: 'target-not-found'; stepIndex: number; targetId: string }

export type MacroRunResponse = MacroResult & {
  macroId: string
  stepCount: number
  /** Phase 14-03: sensitive step 인덱스 목록 — CommandBroker redaction 용 (optional) */
  sensitiveStepIndices?: number[]
}

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

  /**
   * Phase 14: in-page MacroRunner 실행 — 단일 Runtime.evaluate 로 step loop 완결.
   * CdpDriver 구현은 window[QUICK_MODE_RUNTIME_KEY].runMacro({ macroId, params }) 를 호출.
   *
   * optional — mock driver에서 누락 시 MCP layer에서 typeof 타입 가드로 방어 (T-14-18).
   */
  runMacro?(
    tabId: number,
    macroId: string,
    params?: Record<string, unknown>,
  ): Promise<MacroRunResponse>
}
