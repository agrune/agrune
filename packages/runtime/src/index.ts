export type {
  AgruneManifest,
  AgruneRuntimeOptions,
  ManifestTarget,
  ManifestGroup,
  ManifestRepeat,
  ManifestMacro,
  SelectorLadder,
  ActionKind,
} from './types'

export {
  createPageAgentRuntime,
  getInstalledPageAgentRuntime,
  installPageAgentRuntime,
  type PageAgentRuntime,
  type PageAgentRuntimeHandle,
} from './runtime/page-agent-runtime'

export { scanAnnotations, scanGroups } from './dom-scanner.js'
export type { ScannedTarget, ScannedGroup } from './dom-scanner.js'
export { buildManifest } from './manifest-builder.js'

export {
  MacroRunner,
  interpolateParams,
  type MacroResult,
  type MacroRunnerDeps,
} from './runtime/macro-runner'

export {
  RepeatExpander,
  REPEAT_MAX_INSTANCES,
  type RepeatInstance,
  type VirtualizedExpandResult,
} from './runtime/repeat-expander'
