// Re-export v3 manifest types from @agrune/core (which re-exports from @agrune/manifest)
export type {
  AgruneManifest,
  ManifestTarget,
  ManifestGroup,
  ManifestRepeat,
  ManifestMacro,
  SelectorLadder,
  ActionKind,
} from '@agrune/core'

// Runtime-specific types
export interface AgruneRuntimeOptions {
  clickAutoScroll: boolean
  clickRetryCount: number
  clickRetryDelayMs: number
  postMessage?: (type: string, data: unknown) => void
  /** Bridge callback for CDP request relay. When provided, CDP event sequences are activated. */
  cdpPostMessage?: (type: string, data: unknown) => void
}
