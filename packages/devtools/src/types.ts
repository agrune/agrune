import type { Session } from '@agrune/core'

export type CommandEventPhase = 'start' | 'end' | 'error'

export interface CommandEvent {
  id: string
  ts: number
  sessionId: number | null
  tool: string
  phase: CommandEventPhase
  durationMs?: number
  args?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
}

export interface HitlState {
  paused: boolean
  pausedAt: number | null
  pendingTool: string | null
}

export type HitlAction = 'pause' | 'resume' | 'step' | 'skip'

export type InboundMessage =
  | { type: 'sessions_update'; data: Session[] }
  | { type: 'snapshot_update'; data: { tabId: number; snapshot: unknown } }
  | { type: 'command_event'; data: CommandEvent }
  | { type: 'command_backfill'; data: CommandEvent[] }
  | { type: 'hitl_state'; data: HitlState }

export type OutboundMessage =
  | { type: 'subscribe'; tabId: number }
  | { type: 'highlight'; targetId: string }
  | { type: 'clear_highlight' }
  | { type: 'hitl'; action: HitlAction }
  | { type: 'focus_session'; sessionId: number }

export type TabId = 'snapshot' | 'logs' | 'sessions'
