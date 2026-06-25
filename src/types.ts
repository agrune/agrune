// Shared wire types used by both the one-shot client and the daemon.

/** Public view of a browser tab (A.2.3 responses). */
export interface PublicTab {
  tabId: number
  index: number
  url: string
  title: string
  active: boolean
}

/** GET /health response (A.1.8). */
export interface DaemonHealth {
  ok: true
  name: 'agrune-daemon'
  browser: 'playwright'
  tabs: number
}

// ---- action / recorder wire types (§5.6, A.3) ------------------------------

export type FillFormFieldType = 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider'
export type FillFormFieldValue = string | boolean | number
export interface FillFormField {
  name?: string
  target: string
  type: FillFormFieldType
  value: FillFormFieldValue
}

export type DropData = Record<string, string>

export type ConsoleLevel = 'debug' | 'info' | 'warning' | 'error'
export interface ConsoleMessageEntry {
  tabId: number
  level: ConsoleLevel
  type: string
  text: string
  timestamp: number
  navigationIndex: number
  location: { url: string; lineNumber: number; columnNumber: number }
}

export type NetworkRequestPart =
  | 'request-headers'
  | 'request-body'
  | 'response-headers'
  | 'response-body'

export interface NetworkRequestSummary {
  index: number
  tabId: number
  method: string
  url: string
  resourceType: string
  isNavigationRequest: boolean
  timestamp: number
  navigationIndex: number
  status?: number
  statusText?: string
  failureText?: string
}

export interface DialogInfo {
  id: number
  tabId: number
  type: string
  message: string
  defaultValue: string
  timestamp: number
  handled: boolean
  accepted?: boolean
  promptText?: string
  handledTimestamp?: number
  error?: string
}

export interface FileChooserInfo {
  id: number
  tabId: number
  timestamp: number
  multiple: boolean
  handled: boolean
  paths?: string[]
  cancelled?: boolean
  handledTimestamp?: number
}

/** In-memory daemon event (§7.5). */
export interface DaemonEvent {
  id: string
  ts: number
  method: string
  path: string
  phase: 'start' | 'end' | 'error'
  durationMs?: number
  tabId?: number
  args?: Record<string, unknown>
  error?: { code: string; message: string }
}
