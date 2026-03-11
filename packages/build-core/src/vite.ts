import { webCliDomUnplugin } from './plugin/index'
import type { WebMcpDomPluginOptions } from './types'

// NOTE: linked-local installs can end up with duplicate Vite type instances.
// Keep the public return type broad to avoid cross-package type-identity errors.
export default function webCliDomPlugin(options?: WebMcpDomPluginOptions): any {
  return webCliDomUnplugin.vite(options) as any
}
