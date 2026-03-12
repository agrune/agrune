import type {
  WebCliDeclarativeCompat,
  WebCliDomPluginOptions,
  WebCliEmitTrackingAttr,
  WebCliExposureMode,
  WebCliRuntimeOptions,
} from '../types'

export interface ResolvedWebCliDomOptions {
  include: string[]
  exclude: string[]
  manifestFile: string
  toolPrefix: string
  preserveSourceAttrs: boolean
  strict: boolean
  unsupportedActionHandling: 'warn-skip' | 'error'
  exposureMode: WebCliExposureMode
  groupAttr: string
  emitTrackingAttr: WebCliEmitTrackingAttr
  declarativeCompat: WebCliDeclarativeCompat
  click: WebCliRuntimeOptions
}

export const DEFAULT_INCLUDE = ['**/*.{html,htm,js,jsx,ts,tsx,vue,svelte}']

export function resolveOptions(
  input: WebCliDomPluginOptions = {},
): ResolvedWebCliDomOptions {
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
    declarativeCompat: input.declarativeCompat ?? 'webcli-form-draft-2025-10',
    click: {
      clickAutoScroll: input.click?.autoScroll ?? true,
      clickRetryCount: input.click?.retryCount ?? 2,
      clickRetryDelayMs: input.click?.retryDelayMs ?? 120,
    },
  }
}
