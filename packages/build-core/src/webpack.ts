import { webCliDomUnplugin } from './plugin/index'
import type { WebCliDomPluginOptions } from './types'

export default function webCliDomWebpackPlugin(options?: WebCliDomPluginOptions): any {
  return webCliDomUnplugin.webpack(options) as any
}
