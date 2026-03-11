import { webCliDomUnplugin } from './plugin/index'
import type { WebMcpDomPluginOptions } from './types'

export default function webMcpDomRollupPlugin(options?: WebMcpDomPluginOptions): any {
  return webCliDomUnplugin.rollup(options) as any
}
