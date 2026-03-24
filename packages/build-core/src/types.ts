export type WebCliExposureMode = 'grouped' | 'per-element'

export interface WebCliRuntimeOptions {
  clickAutoScroll: boolean
  clickRetryCount: number
  clickRetryDelayMs: number
}

export type WebCliSupportedAction = 'click' | 'fill'

export type WebCliToolStatus = 'active' | 'skipped_unsupported_action'

export interface WebCliTargetEntry {
  targetId: string
  name: string | null
  desc: string | null
  selector: string
  sourceFile: string
  sourceLine: number
  sourceColumn: number
}

export interface WebCliToolEntry {
  toolName: string
  toolDesc: string
  action: string
  status: WebCliToolStatus
  targets: WebCliTargetEntry[]
}

export interface WebCliGroupEntry {
  groupId: string
  groupName?: string
  groupDesc?: string
  tools: WebCliToolEntry[]
}

export interface WebCliManifest {
  version: 2
  generatedAt: string
  exposureMode: WebCliExposureMode
  groups: WebCliGroupEntry[]
}
