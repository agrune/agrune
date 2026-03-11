import type {
  WebMcpDeclarativeCompat,
  WebMcpDomPluginOptions,
  WebMcpEmitTrackingAttr,
  WebMcpExposureMode,
  WebMcpRuntimeOptions,
} from '../types'

export interface ResolvedWebMcpDomOptions {
  include: string[]
  exclude: string[]
  manifestFile: string
  toolPrefix: string
  preserveSourceAttrs: boolean
  strict: boolean
  unsupportedActionHandling: 'warn-skip' | 'error'
  exposureMode: WebMcpExposureMode
  groupAttr: string
  emitTrackingAttr: WebMcpEmitTrackingAttr
  declarativeCompat: WebMcpDeclarativeCompat
  click: WebMcpRuntimeOptions
}

export const DEFAULT_INCLUDE = ['**/*.{html,htm,js,jsx,ts,tsx,vue,svelte}']

export function resolveOptions(
  input: WebMcpDomPluginOptions = {},
): ResolvedWebMcpDomOptions {
  return {
    include: input.include ?? DEFAULT_INCLUDE,
    exclude: input.exclude ?? ['**/node_modules/**', '**/.git/**'],
    manifestFile: input.manifestFile ?? 'webcli.manifest.json',
    toolPrefix: input.toolPrefix ?? 'wcli',
    preserveSourceAttrs: input.preserveSourceAttrs ?? false,
    strict: input.strict ?? true,
    unsupportedActionHandling: input.unsupportedActionHandling ?? 'warn-skip',
    exposureMode: input.exposureMode ?? 'grouped',
    groupAttr: input.groupAttr ?? 'data-webcli-group',
    emitTrackingAttr: input.emitTrackingAttr ?? 'debug',
    declarativeCompat: input.declarativeCompat ?? 'webmcp-form-draft-2025-10',
    click: {
      clickAutoScroll: input.click?.autoScroll ?? true,
      clickRetryCount: input.click?.retryCount ?? 2,
      clickRetryDelayMs: input.click?.retryDelayMs ?? 120,
    },
  }
}
