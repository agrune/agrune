import type { WebMcpDiagnostic, WebMcpManifest } from '../types'

interface DiagnosticSink {
  warn: (message: string) => void
  error: (message: string) => never | void
}

export function formatDiagnostic(diag: WebMcpDiagnostic): string {
  return `${diag.file}:${diag.line}:${diag.column} [${diag.code}] ${diag.message}`
}

function formatDiagnosticBlock(diagnostics: WebMcpDiagnostic[]): string {
  return `[webcli-dom]\n${diagnostics.map(formatDiagnostic).join('\n')}`
}

export function reportCompileDiagnostics(
  sink: DiagnosticSink,
  diagnostics: WebMcpDiagnostic[],
  strict: boolean,
): void {
  const warnings = diagnostics.filter(diagnostic => diagnostic.level === 'warning')
  const errors = diagnostics.filter(diagnostic => diagnostic.level === 'error')

  for (const warning of warnings) {
    sink.warn(`[webcli-dom] ${formatDiagnostic(warning)}`)
  }

  if (errors.length === 0) return

  if (strict) {
    sink.error(formatDiagnosticBlock(errors))
    return
  }

  for (const error of errors) {
    sink.warn(`[webcli-dom] ${formatDiagnostic(error)}`)
  }
}

export function findDuplicateToolDiagnostics(
  manifest: WebMcpManifest,
): WebMcpDiagnostic[] {
  const seen = new Map<string, { file: string; line: number; column: number }>()
  const duplicates: WebMcpDiagnostic[] = []

  for (const group of manifest.groups) {
    for (const tool of group.tools) {
      const firstTarget = tool.targets[0]
      const prev = seen.get(tool.toolName)
      if (prev) {
        duplicates.push({
          level: 'error',
          code: 'WMCP_COMPILE_DUPLICATE_TOOL',
          message: `중복 toolName: ${tool.toolName}`,
          file: firstTarget?.sourceFile ?? prev.file,
          line: firstTarget?.sourceLine ?? prev.line,
          column: firstTarget?.sourceColumn ?? prev.column,
        })
        continue
      }

      seen.set(tool.toolName, {
        file: firstTarget?.sourceFile ?? 'unknown',
        line: firstTarget?.sourceLine ?? 1,
        column: firstTarget?.sourceColumn ?? 1,
      })
    }
  }

  return duplicates
}

export function reportDuplicateToolDiagnostics(
  sink: DiagnosticSink,
  manifest: WebMcpManifest,
): boolean {
  const duplicates = findDuplicateToolDiagnostics(manifest)
  if (duplicates.length === 0) return false

  sink.error(formatDiagnosticBlock(duplicates))
  return true
}
