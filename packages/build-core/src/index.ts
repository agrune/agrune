import webCliDomPlugin from './vite'

export default webCliDomPlugin
export { webCliDomPlugin }
export { webCliDomUnplugin } from './plugin/index'

export type {
  UnsupportedActionHandling,
  WebCliDeclarativeCompat,
  WebCliDiagnostic,
  WebCliDomPluginOptions,
  WebCliEmitTrackingAttr,
  WebCliExposureMode,
  WebCliGroupEntry,
  WebCliManifest,
  WebCliRuntimeOptions,
  WebCliToolEntry,
  WebCliToolStatus,
  WebCliTargetEntry,
} from './types'

export {
  createPageAgentRuntime,
  getInstalledPageAgentRuntime,
  installPageAgentRuntime,
  type PageAgentRuntime,
  type PageAgentRuntimeHandle,
} from './runtime/page-agent-runtime'
