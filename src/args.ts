// CLI argument parser. Algorithm per SPEC §6.1 + A.2.2.
//
// - `--` toggles parsingFlags off (rest positional).
// - `--name=value` (only when the `=` index > 2, i.e. a real long flag) → flags[name]=value.
// - `--name` → consume the next token as the value when it exists and is not `-`-prefixed,
//   else the flag is a boolean `true`.
// - `-s=<id>` → session selector (A.0.2 parity form). No other short flags.
// - First non-flag token → command[0]. A second non-flag is pushed onto `command` ONLY when
//   command[0] is a namespaced verb {daemon, dialog, network, tab, tabs}; otherwise it is a
//   positional.

export interface ParsedArgs {
  command: string[]
  flags: Record<string, string | boolean>
  positionals: string[]
}

const NAMESPACED = new Set(['daemon', 'dialog', 'network', 'tab', 'tabs'])

export function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = []
  const flags: Record<string, string | boolean> = {}
  const positionals: string[] = []
  let parsingFlags = true

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!

    if (parsingFlags && token === '--') {
      parsingFlags = false
      continue
    }

    if (parsingFlags && token.startsWith('-s=')) {
      // A.0.2: playwright-cli session form `-s=<id>`.
      flags.session = token.slice('-s='.length)
      continue
    }

    if (parsingFlags && token.startsWith('--')) {
      const eq = token.indexOf('=')
      if (eq > 2) {
        const name = token.slice(2, eq)
        flags[name] = token.slice(eq + 1)
        continue
      }
      const name = token.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        flags[name] = next
        i++
      } else {
        flags[name] = true
      }
      continue
    }

    // Non-flag token.
    if (command.length === 0) {
      command.push(token)
    } else if (command.length === 1 && NAMESPACED.has(command[0]!)) {
      command.push(token)
    } else {
      positionals.push(token)
    }
  }

  return { command, flags, positionals }
}

export function getStringFlag(
  flags: Record<string, string | boolean>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const v = flags[name]
    if (typeof v === 'string') return v
  }
  return undefined
}

export function getBooleanFlag(
  flags: Record<string, string | boolean>,
  ...names: string[]
): boolean {
  for (const name of names) {
    const v = flags[name]
    if (v === true) return true
    if (typeof v === 'string') return v !== 'false'
  }
  return false
}

/** Optional positive-integer flag (e.g. `--tab`, `--port`). Throws on non-int / <= 0. */
export function getPositiveIntFlag(
  flags: Record<string, string | boolean>,
  name: string,
): number | undefined {
  const v = flags[name]
  if (v === undefined || v === true || v === false) return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--${name} must be a positive integer`)
  }
  return n
}
