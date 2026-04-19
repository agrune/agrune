import type { AgruneManifest } from './types'

/**
 * Returns an empty v3 AgruneManifest for use when no manifest source is available.
 * Used by the bootstrap source for idle boot (RESOLVE-04).
 */
export function buildEmptyManifest(): AgruneManifest {
  return { version: 3, groups: [] }
}

export {
  createPageAgentRuntime,
  getInstalledPageAgentRuntime,
  installPageAgentRuntime,
  type PageAgentRuntime,
  type PageAgentRuntimeHandle,
} from './runtime/page-agent-runtime'
