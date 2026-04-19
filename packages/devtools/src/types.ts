import type { Session } from '@agrune/core'
import type { FiberIdentityPath, SelectorLadder } from '@agrune/manifest'

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

// ─── Phase 16 RECORD-01/02 — Recorder types ────────────────────────────────

/** Recorder state machine: idle → picking → recording-action → idle */
export type RecorderMode = 'idle' | 'picking' | 'recording-action'

/**
 * Capture result produced in page context when the user clicks an element.
 * Contains at least one of fiberPath / roleSelector / cssSelector so that
 * `buildSelectorLadder` always produces a valid SelectorLadder downstream.
 *
 * Security (T-16-04): MUST NOT contain element VALUES. Only selectors + flags.
 */
export interface CaptureResult {
  url: string
  fiberPath?: FiberIdentityPath
  roleSelector?: { role: string; name?: string }
  cssSelector?: string
  sensitive?: true
  /** auto-generated from fiber componentName + counter (Decision A). */
  autoTargetId: string
}

/**
 * Payload sent to MCP when the user confirms the capture (Enter key).
 * The server persists this into ~/.agrune/authoring/pending/<sessionId>/<ts>.json.
 */
export interface CommitPayload {
  sessionId: string
  ts: number
  url: string
  /** autoTargetId 또는 사용자가 편집한 targetId */
  targetId: string
  selector: SelectorLadder
  sensitive?: true
}

/**
 * On-disk shape of a pending capture file (one per capture session).
 * Task 16-03 (watcher) reads these files and merges into manifest.ts.
 */
export interface PendingCaptureFile {
  ts: number
  sessionId: string
  url: string
  targets: Array<{
    targetId: string
    selector: SelectorLadder
    sensitive?: true
  }>
}

// ─── WebSocket union ───────────────────────────────────────────────────────

export type InboundMessage =
  | { type: 'sessions_update'; data: Session[] }
  | { type: 'snapshot_update'; data: { tabId: number; snapshot: unknown } }
  | { type: 'command_event'; data: CommandEvent }
  | { type: 'command_backfill'; data: CommandEvent[] }
  | { type: 'hitl_state'; data: HitlState }
  // Phase 16: recorder
  | { type: 'recorder_state'; mode: RecorderMode }
  | { type: 'recorder_captured'; data: CaptureResult }

export type OutboundMessage =
  | { type: 'subscribe'; tabId: number }
  | { type: 'highlight'; targetId: string }
  | { type: 'clear_highlight' }
  | { type: 'hitl'; action: HitlAction }
  | { type: 'focus_session'; sessionId: number }
  // Phase 16: recorder
  | { type: 'recorder_toggle' }
  | { type: 'recorder_commit'; data: CommitPayload }

export type TabId = 'snapshot' | 'logs' | 'sessions' | 'recorder'
