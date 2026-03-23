import type { PageSnapshot, CommandRequest, CommandResult, CompanionConfig } from '@webcli-dom/core'

export type ExtensionMessage =
  | { type: 'snapshot'; tabId: number; snapshot: PageSnapshot }
  | { type: 'command'; tabId: number; commandId: string; command: CommandRequest }
  | { type: 'command_result'; tabId: number; commandId: string; result: CommandResult }
  | { type: 'session_open'; tabId: number; url: string; title: string }
  | { type: 'session_close'; tabId: number }
  | { type: 'config_update'; config: Partial<CompanionConfig> }
