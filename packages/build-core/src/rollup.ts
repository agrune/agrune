import { webCliDomUnplugin } from './plugin/index'
import type { WebCliDomPluginOptions } from './types'

export default function webCliDomRollupPlugin(options?: WebCliDomPluginOptions): any {
  return webCliDomUnplugin.rollup(options) as any
}
