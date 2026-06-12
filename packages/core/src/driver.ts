import type { PageSnapshot, CommandResult, AgruneRuntimeConfig } from './index.js'

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

export interface OpenTabResult {
  tabId: number
  url: string
  title: string
}

export interface CloseTabResult {
  tabId: number
  closed: boolean
}

export interface NavigationResult {
  tabId: number
  url: string
  title: string
}

export interface ResizeResult {
  tabId: number
  width: number
  height: number
}

export type ScreenshotImageType = 'png' | 'jpeg'

export interface ScreenshotOptions {
  fullPage?: boolean
  targetId?: string
  type?: ScreenshotImageType
}

export interface ScreenshotResult {
  tabId: number
  path: string
  type: ScreenshotImageType
  fullPage: boolean
  targetId?: string
}

export interface EvaluateOptions {
  arg?: unknown
  targetId?: string
}

export interface EvaluateResult {
  tabId: number
  result: unknown
  undefinedResult?: true
  targetId?: string
}

export interface RunCodeUnsafeResult {
  tabId: number
  result: unknown
  undefinedResult?: true
}

export interface PressKeyResult {
  tabId: number
  key: string
}

export interface TypeTextOptions {
  slowly?: boolean
  submit?: boolean
}

export interface TypeTextResult {
  tabId: number
  targetId: string
  text: string
  submitted: boolean
}

export interface SelectOptionResult {
  tabId: number
  targetId: string
  values: string[]
}

export type FillFormFieldType = 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider'

export type FillFormFieldValue = string | boolean | number

export interface FillFormField {
  name?: string
  targetId: string
  type: FillFormFieldType
  value: FillFormFieldValue
}

export interface FillFormResult {
  tabId: number
  fields: Array<{
    name?: string
    targetId: string
    type: FillFormFieldType
  }>
}

export type DialogType = 'alert' | 'beforeunload' | 'confirm' | 'prompt'

export interface DialogInfo {
  id: number
  tabId: number
  type: DialogType | string
  message: string
  defaultValue?: string
  timestamp: number
  handled: boolean
  accepted?: boolean
  promptText?: string
  handledTimestamp?: number
  error?: string
}

export interface DialogHandleOptions {
  accept: boolean
  promptText?: string
}

export interface DialogHandleResult {
  tabId: number
  armed: boolean
  dialog: DialogInfo
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

export interface FileUploadResult {
  tabId: number
  paths: string[]
  cancelled: boolean
  fileChooser: FileChooserInfo
}

export type DropData = Record<string, string>

export interface DropResult {
  tabId: number
  targetId: string
  paths: string[]
  dataTypes: string[]
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

export interface ConsoleMessagesQuery {
  level?: ConsoleLevel
  all?: boolean
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

export interface NetworkRequestsQuery {
  filter?: string
  includeStatic?: boolean
  all?: boolean
}

export type NetworkRequestDetail =
  | {
      request: NetworkRequestSummary
      requestHeaders: Record<string, string>
      requestBody: string | null
      responseHeaders: Record<string, string>
      responseBody: string | null
    }
  | {
      request: NetworkRequestSummary
      part: NetworkRequestPart
      value: string | Record<string, string> | null
    }

export interface BrowserDriver {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  listSessions(): Session[]
  getSnapshot(tabId: number): PageSnapshot | null

  execute(tabId: number, command: Record<string, unknown> & { kind: string }): Promise<CommandResult>
  updateConfig(config: Partial<AgruneRuntimeConfig>): void
  ensureReady(): Promise<string | null>
  resolveTabId(tabId?: number): number | null
  focusSession(tabId: number): Promise<FocusResult>
  openTab?(url: string): Promise<OpenTabResult>
  closeTab?(tabId?: number): Promise<CloseTabResult>
  navigateTab?(tabId: number | undefined, url: string): Promise<NavigationResult>
  navigateBack?(tabId?: number): Promise<NavigationResult>
  resizeTab?(tabId: number | undefined, width: number, height: number): Promise<ResizeResult>
  screenshotTab?(
    tabId: number | undefined,
    path: string,
    options?: ScreenshotOptions,
  ): Promise<ScreenshotResult>
  evaluateTab?(
    tabId: number | undefined,
    source: string,
    options?: EvaluateOptions,
  ): Promise<EvaluateResult>
  runCodeUnsafe?(
    tabId: number | undefined,
    source: string,
  ): Promise<RunCodeUnsafeResult>
  pressKey?(
    tabId: number | undefined,
    key: string,
  ): Promise<PressKeyResult>
  typeText?(
    tabId: number | undefined,
    targetId: string,
    text: string,
    options?: TypeTextOptions,
  ): Promise<TypeTextResult>
  selectOptions?(
    tabId: number | undefined,
    targetId: string,
    values: string[],
  ): Promise<SelectOptionResult>
  fillForm?(
    tabId: number | undefined,
    fields: FillFormField[],
  ): Promise<FillFormResult>
  fileUpload?(
    tabId: number | undefined,
    paths: string[],
  ): Promise<FileUploadResult>
  drop?(
    tabId: number | undefined,
    targetId: string,
    data: DropData,
    paths: string[],
  ): Promise<DropResult>
  handleDialog?(
    tabId: number | undefined,
    options: DialogHandleOptions,
  ): Promise<DialogHandleResult>
  consoleMessages?(
    tabId: number | undefined,
    query?: ConsoleMessagesQuery,
  ): ConsoleMessageEntry[]
  networkRequests?(
    tabId: number | undefined,
    query?: NetworkRequestsQuery,
  ): NetworkRequestSummary[]
  networkRequestDetail?(
    tabId: number | undefined,
    index: number,
    part?: NetworkRequestPart,
  ): Promise<NetworkRequestDetail>
}
