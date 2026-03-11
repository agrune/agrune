export type UnsupportedActionHandling = 'warn-skip' | 'error'

export type WebMcpExposureMode = 'grouped' | 'per-element'

export type WebMcpEmitTrackingAttr = 'none' | 'debug' | 'always'

export type WebMcpDeclarativeCompat = 'off' | 'webmcp-form-draft-2025-10'

export interface WebMcpDomPluginOptions {
  include?: string[]
  exclude?: string[]
  manifestFile?: string
  toolPrefix?: string
  preserveSourceAttrs?: boolean
  strict?: boolean
  unsupportedActionHandling?: UnsupportedActionHandling
  exposureMode?: WebMcpExposureMode
  groupAttr?: string
  emitTrackingAttr?: WebMcpEmitTrackingAttr
  declarativeCompat?: WebMcpDeclarativeCompat
  click?: {
    autoScroll?: boolean
    retryCount?: number
    retryDelayMs?: number
  }
}

export interface WebMcpRuntimeOptions {
  clickAutoScroll: boolean
  clickRetryCount: number
  clickRetryDelayMs: number
}

export type WebMcpSupportedAction = 'click' | 'fill'

export type WebMcpToolStatus = 'active' | 'skipped_unsupported_action'

export interface WebMcpTargetEntry {
  targetId: string
  name: string
  desc: string
  selector: string
  sourceFile: string
  sourceLine: number
  sourceColumn: number
}

export interface WebMcpToolEntry {
  toolName: string
  toolDesc: string
  action: string
  status: WebMcpToolStatus
  targets: WebMcpTargetEntry[]
}

export interface WebMcpGroupEntry {
  groupId: string
  groupName?: string
  groupDesc?: string
  tools: WebMcpToolEntry[]
}

export interface WebMcpManifest {
  version: 2
  generatedAt: string
  exposureMode: WebMcpExposureMode
  groups: WebMcpGroupEntry[]
}

export interface WebMcpCompiledTarget {
  action: string
  status: WebMcpToolStatus
  groupId: string
  groupName?: string
  groupDesc?: string
  toolNameOverride?: string
  toolDescOverride?: string
  target: WebMcpTargetEntry
}

export interface WebMcpDiagnostic {
  level: 'warning' | 'error'
  code:
    | 'WMCP_COMPILE_MISSING_ATTR'
    | 'WMCP_COMPILE_EMPTY_ATTR'
    | 'WMCP_COMPILE_DYNAMIC_ATTR'
    | 'WMCP_COMPILE_UNSUPPORTED_ACTION'
    | 'WMCP_COMPILE_DUPLICATE_TOOL'
    | 'WMCP_COMPILE_PARSE_ERROR'
  message: string
  file: string
  line: number
  column: number
}
