export type RuneExposureMode = 'grouped' | 'per-element'

export interface RuneRuntimeOptions {
  clickAutoScroll: boolean
  clickRetryCount: number
  clickRetryDelayMs: number
}

export type RuneSupportedAction = 'click' | 'fill'

export type RuneToolStatus = 'active' | 'skipped_unsupported_action'

export interface RuneTargetEntry {
  targetId: string
  name: string | null
  desc: string | null
  selector: string
  sourceFile: string
  sourceLine: number
  sourceColumn: number
}

export interface RuneToolEntry {
  toolName: string
  toolDesc: string
  action: string
  status: RuneToolStatus
  targets: RuneTargetEntry[]
}

export interface RuneGroupEntry {
  groupId: string
  groupName?: string
  groupDesc?: string
  tools: RuneToolEntry[]
}

export interface RuneManifest {
  version: 2
  generatedAt: string
  exposureMode: RuneExposureMode
  groups: RuneGroupEntry[]
}
