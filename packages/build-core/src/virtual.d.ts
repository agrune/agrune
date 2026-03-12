declare module '@webcli-dom/build-core/manifest' {
  import type { WebCliManifest, WebCliRuntimeOptions } from './types'
  export const runtimeOptions: WebCliRuntimeOptions
  const manifest: WebCliManifest
  export default manifest
}

declare module 'webcli-dom/manifest' {
  import type { WebCliManifest, WebCliRuntimeOptions } from './types'
  export const runtimeOptions: WebCliRuntimeOptions
  const manifest: WebCliManifest
  export default manifest
}

declare module 'virtual:webcli-dom/manifest' {
  import type { WebCliManifest, WebCliRuntimeOptions } from './types'
  export const runtimeOptions: WebCliRuntimeOptions
  const manifest: WebCliManifest
  export default manifest
}
