import { readFile } from 'node:fs/promises'
import type { Diagnostic } from './rules.js'
import { scanSource } from './scanner.js'

export { scanSource } from './scanner.js'
export type { Diagnostic, DiagnosticCode, DiagnosticSeverity } from './rules.js'
export { KNOWN_AGRUNE_ATTRS, VALID_ACTION_KINDS } from './rules.js'

export async function scanFile(file: string): Promise<Diagnostic[]> {
  const source = await readFile(file, 'utf8')
  return scanSource(source, { file })
}

export function formatDiagnostic(d: Diagnostic): string {
  return `${d.file}:${d.line}:${d.column}\n  ${d.severity}  ${d.message}  ${d.code}`
}
