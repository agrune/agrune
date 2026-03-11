import webCliDomPlugin from './vite'

export default webCliDomPlugin
export { webCliDomPlugin }
export { webCliDomUnplugin } from './plugin/index'

export type {
  UnsupportedActionHandling,
  WebMcpDeclarativeCompat,
  WebMcpDiagnostic,
  WebMcpDomPluginOptions,
  WebMcpEmitTrackingAttr,
  WebMcpExposureMode,
  WebMcpGroupEntry,
  WebMcpManifest,
  WebMcpRuntimeOptions,
  WebMcpToolEntry,
  WebMcpToolStatus,
  WebMcpTargetEntry,
} from './types'

export {
  createPageAgentRuntime,
  getInstalledPageAgentRuntime,
  installPageAgentRuntime,
  type PageAgentRuntime,
  type PageAgentRuntimeHandle,
} from './runtime/page-agent-runtime'
