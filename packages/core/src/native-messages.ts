import type {
  PageSnapshot,
  CommandRequest,
  CommandResult,
  CompanionConfig,
} from './index'

// ── Message interfaces ──────────────────────────────────────────────

export interface SnapshotUpdateMessage {
  type: 'snapshot_update'
  tabId: number
  snapshot: PageSnapshot
}

export interface CommandRequestMessage {
  type: 'command_request'
  tabId: number
  commandId: string
  command: Pick<CommandRequest, 'kind'> & Record<string, unknown>
}

export interface CommandResultMessage {
  type: 'command_result'
  tabId: number
  commandId: string
  result: CommandResult
}

export interface SessionOpenMessage {
  type: 'session_open'
  tabId: number
  url: string
  title: string
}

export interface SessionCloseMessage {
  type: 'session_close'
  tabId: number
}

export interface ConfigUpdateMessage {
  type: 'config_update'
  config: Partial<CompanionConfig>
}

// ── Union type ──────────────────────────────────────────────────────

export type NativeMessage =
  | SnapshotUpdateMessage
  | CommandRequestMessage
  | CommandResultMessage
  | SessionOpenMessage
  | SessionCloseMessage
  | ConfigUpdateMessage

// ── Type guards ─────────────────────────────────────────────────────

export function isSnapshotUpdate(msg: NativeMessage): msg is SnapshotUpdateMessage {
  return msg.type === 'snapshot_update'
}

export function isCommandRequest(msg: NativeMessage): msg is CommandRequestMessage {
  return msg.type === 'command_request'
}

export function isCommandResult(msg: NativeMessage): msg is CommandResultMessage {
  return msg.type === 'command_result'
}

export function isSessionOpen(msg: NativeMessage): msg is SessionOpenMessage {
  return msg.type === 'session_open'
}

export function isSessionClose(msg: NativeMessage): msg is SessionCloseMessage {
  return msg.type === 'session_close'
}

export function isConfigUpdate(msg: NativeMessage): msg is ConfigUpdateMessage {
  return msg.type === 'config_update'
}
