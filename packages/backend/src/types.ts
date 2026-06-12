export interface PublicTab {
  index: number
  tabId: number
  url: string
  title: string
  active: boolean
  hasSnapshot: boolean
  snapshotVersion: number | null
}

export type ClickButton = 'left' | 'right' | 'middle'
export type ClickModifier = 'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'

export type FillFormFieldType = 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider'

export interface FillFormField {
  name?: string
  target: string
  type: FillFormFieldType
  value: string | boolean | number
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
