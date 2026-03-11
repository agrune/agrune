declare module '@webcli-dom/build-core/manifest' {
  import type { WebMcpManifest, WebMcpRuntimeOptions } from './types'
  export const runtimeOptions: WebMcpRuntimeOptions
  const manifest: WebMcpManifest
  export default manifest
}

declare module 'webcli-dom/manifest' {
  import type { WebMcpManifest, WebMcpRuntimeOptions } from './types'
  export const runtimeOptions: WebMcpRuntimeOptions
  const manifest: WebMcpManifest
  export default manifest
}

declare module 'virtual:webcli-dom/manifest' {
  import type { WebMcpManifest, WebMcpRuntimeOptions } from './types'
  export const runtimeOptions: WebMcpRuntimeOptions
  const manifest: WebMcpManifest
  export default manifest
}
