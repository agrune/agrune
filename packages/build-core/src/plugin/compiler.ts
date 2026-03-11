import type { ResolvedWebMcpDomOptions } from './options'
import type { CompileResult } from './compiler/shared'
import { htmlCompile } from './compiler/html-compiler'
import { jsxCompile } from './compiler/jsx-compiler'
import { canContainJsx, isHtmlLike } from './compiler/shared'

export function compileSource(
  code: string,
  relativePath: string,
  options: ResolvedWebMcpDomOptions,
  isDevBuild = false,
): CompileResult {
  const emitTrackingAttr = options.emitTrackingAttr !== 'none'

  if (isHtmlLike(relativePath)) {
    return htmlCompile(code, relativePath, options, emitTrackingAttr)
  }

  if (canContainJsx(relativePath)) {
    return jsxCompile(code, relativePath, options, emitTrackingAttr)
  }

  return {
    code,
    changed: false,
    entries: [],
    diagnostics: [],
  }
}
