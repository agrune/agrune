import { webCliDomUnplugin } from './plugin/index'
import type { WebMcpDomPluginOptions } from './types'

export default function webMcpDomWebpackPlugin(options?: WebMcpDomPluginOptions): any {
  return webCliDomUnplugin.webpack(options) as any
}
