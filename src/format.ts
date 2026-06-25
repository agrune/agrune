// Output conventions. SPEC §6.2.
//
// writeResult: with --json → pretty JSON (2-space) + trailing newline. Without --json, MOST
// commands ALSO print `JSON.stringify(value, null, 2)\n` — i.e. text and JSON are identical
// unless the command supplies a custom text formatter (console/network/dialogs/file-choosers/
// events/targets/snapshot/read/screenshot). Those pass a `formatter` here.

export interface WriteIO {
  write(text: string): void
}

export interface WriteResultOptions {
  json?: boolean
  /** Custom text formatter; used only when --json is absent. */
  formatter?: (value: unknown) => string
  /** When true, suppress the pretty wrapper and print the raw value (global --raw). */
  raw?: boolean
}

export function writeResult(io: WriteIO, value: unknown, options: WriteResultOptions = {}): void {
  if (!options.json && options.formatter) {
    io.write(ensureNewline(options.formatter(value)))
    return
  }
  if (options.raw && !options.json) {
    io.write(ensureNewline(formatRaw(value)))
    return
  }
  io.write(`${JSON.stringify(value, null, 2)}\n`)
}

function formatRaw(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function ensureNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}
