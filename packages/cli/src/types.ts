import type { FillStrategy, PageSnapshot } from '@agrune/core'
import type { DaemonEvent } from './events.js'

export const DEFAULT_DAEMON_HOST = '127.0.0.1'
export const DEFAULT_DAEMON_PORT = 47654

export interface CliIo {
  stdout: Pick<NodeJS.WriteStream, 'write'>
  stderr: Pick<NodeJS.WriteStream, 'write'>
}

export interface DaemonOptions {
  host?: string
  port?: number
  headless?: boolean
}

export interface DaemonHealth {
  ok: true
  name: 'agrune-daemon'
  browser: 'playwright'
  tabs: number
}

export interface PublicTab {
  index: number
  tabId: number
  url: string
  title: string
  active: boolean
  hasSnapshot: boolean
  snapshotVersion: number | null
}

export interface TabsResponse {
  ok: true
  tabs: PublicTab[]
}

export interface OpenTabResponse {
  ok: true
  index?: number | null
  tab: PublicTab
}

export interface NavigationResponse {
  ok: true
  tab: PublicTab
  action: 'navigate' | 'back' | 'forward' | 'reload'
}

export interface CloseTabResponse {
  ok: true
  index?: number | null
  closedTabId: number
  tabs: PublicTab[]
}

export interface SnapshotResponse {
  ok: true
  snapshot: PageSnapshot
  path?: string
}

export interface AriaSnapshotResponse {
  ok: true
  text: string
  mode: 'ai' | 'default'
  target?: string
  depth?: number
  path?: string
  boxes?: boolean
  includeTextContent?: boolean
}

export type ClickButton = 'left' | 'right' | 'middle'
export type ClickModifier = 'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'

export interface ActionResponse {
  ok: true
  target: string
  action: string
  button?: ClickButton
  modifiers?: ClickModifier[]
  dialog?: DialogInfo
  fileChooser?: FileChooserInfo
}

export interface FillResponse {
  ok: true
  target: string
  value: string
  strategy?: FillStrategy
}

export type FillFormFieldType = 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider'

export interface FillFormField {
  name?: string
  target: string
  type: FillFormFieldType
  value: string | boolean | number
}

export interface FillFormResponse {
  ok: true
  action: 'fill-form'
  fields: Array<{
    name?: string
    target: string
    type: FillFormFieldType
  }>
}

export interface PressResponse {
  ok: true
  action: 'press'
  key: string
  target?: string
}

export interface TypeResponse {
  ok: true
  action: 'type'
  target: string
  text: string
}

export interface SelectResponse {
  ok: true
  action: 'select'
  target: string
  values: string[]
}

export interface UploadResponse {
  ok: true
  action: 'upload'
  target: string
  paths: string[]
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
  error?: string
}

export interface FileChoosersResponse {
  ok: true
  fileChoosers: FileChooserInfo[]
}

export interface FileUploadResponse {
  ok: true
  action: 'file-upload'
  paths: string[]
  cancelled: boolean
  fileChooser: FileChooserInfo
}

export interface DropResponse {
  ok: true
  action: 'drop'
  target: string
  paths: string[]
  dataTypes: string[]
}

export interface WaitResponse {
  ok: true
  action: string
  target?: string
  text?: string
  timeMs?: number
}

export interface ResizeResponse {
  ok: true
  action: 'resize'
  tabId: number
  width: number
  height: number
}

export interface EvaluateResponse {
  ok: true
  action: 'evaluate'
  target?: string
  result: unknown
  undefinedResult?: true
  path?: string
}

export interface RunCodeUnsafeResponse {
  ok: true
  action: 'run-code-unsafe'
  result: unknown
  undefinedResult?: true
  filename?: string
}

export type ConsoleLevel = 'debug' | 'info' | 'warning' | 'error'

export interface ConsoleMessageEntry {
  tabId: number
  level: ConsoleLevel
  type: string
  text: string
  timestamp: number
  navigationIndex: number
  location: {
    url: string
    lineNumber: number
    columnNumber: number
  }
}

export interface ConsoleMessagesResponse {
  ok: true
  messages: ConsoleMessageEntry[]
  path?: string
}

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

export type NetworkRequestPart =
  | 'request-headers'
  | 'request-body'
  | 'response-headers'
  | 'response-body'

export interface NetworkRequestsResponse {
  ok: true
  requests: NetworkRequestSummary[]
  path?: string
}

export interface NetworkRequestDetailResponse {
  ok: true
  request: NetworkRequestSummary
  requestHeaders?: Record<string, string>
  requestBody?: string | null
  responseHeaders?: Record<string, string>
  responseBody?: string | null
  path?: string
}

export interface NetworkRequestPartResponse {
  ok: true
  request: NetworkRequestSummary
  part: NetworkRequestPart
  value: string | Record<string, string> | null
  path?: string
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

export interface DialogsResponse {
  ok: true
  dialogs: DialogInfo[]
}

export interface DialogHandleResponse {
  ok: true
  action: 'dialog.handle'
  armed: boolean
  dialog?: DialogInfo
}

export interface ReadResponse {
  ok: true
  text: string
}

export interface ScreenshotResponse {
  ok: true
  path: string
  type: 'png' | 'jpeg'
  fullPage: boolean
  target?: string
}

export interface EventsResponse {
  ok: true
  events: DaemonEvent[]
}

export interface ErrorResponse {
  ok: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export type JsonResponse =
  | DaemonHealth
  | TabsResponse
  | OpenTabResponse
  | NavigationResponse
  | CloseTabResponse
  | SnapshotResponse
  | AriaSnapshotResponse
  | ActionResponse
  | FillResponse
  | FillFormResponse
  | PressResponse
  | TypeResponse
  | SelectResponse
  | UploadResponse
  | FileChoosersResponse
  | FileUploadResponse
  | DropResponse
  | WaitResponse
  | ResizeResponse
  | EvaluateResponse
  | RunCodeUnsafeResponse
  | ConsoleMessagesResponse
  | NetworkRequestsResponse
  | NetworkRequestDetailResponse
  | NetworkRequestPartResponse
  | DialogsResponse
  | DialogHandleResponse
  | ReadResponse
  | ScreenshotResponse
  | EventsResponse
  | ErrorResponse
