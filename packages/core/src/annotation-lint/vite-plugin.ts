import { scanSource } from './scanner.js'
import { formatDiagnostic } from './index.js'

export interface AgruneLintPluginOptions {
  include?: RegExp
  severityFailLevel?: 'error' | 'warning'
}

export interface VitePluginLike {
  name: string
  enforce: 'pre'
  transform(code: string, id: string): null
}

export function agruneAnnotationLintVite(options: AgruneLintPluginOptions = {}): VitePluginLike {
  const include = options.include ?? /\.(tsx|jsx|html)$/
  const fail = options.severityFailLevel ?? 'error'

  return {
    name: 'agrune-annotation-lint',
    enforce: 'pre',
    transform(this: { error: (msg: string) => never } | null | undefined, code: string, id: string): null {
      if (!include.test(id)) return null
      if (!code.includes('data-agrune-')) return null
      const diagnostics = scanSource(code, { file: id })
      const blocking = diagnostics.filter(d => (fail === 'error' ? d.severity === 'error' : true))
      if (blocking.length > 0) {
        const message = blocking.map(formatDiagnostic).join('\n')
        // `this.error` is a Rollup plugin context method; at runtime it will
        // abort the build. We don't import Rollup types to keep @agrune/core dep-light.
        if (this && typeof this.error === 'function') this.error(message)
        else throw new Error(message)
      }
      return null
    },
  }
}
