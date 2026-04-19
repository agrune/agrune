/**
 * Shared helpers for `agrune maps {add, types, doctor, submit}` CLI runners.
 *
 * This module intentionally mirrors the argv-parsing style of
 * `packages/mcp/src/manifest-validate-cli.ts` (no commander/cac dep) — the
 * existing `agrune manifest …` surface uses manual argv walks, and plan 18-02
 * keeps the new `maps` surface consistent with that pattern to minimise
 * reader surprise and avoid pulling a new dep into `@agrune/registry`.
 */
import { RegistryError } from '../errors.js'

// ─── Argv parsing ───────────────────────────────────────────────────────────

export interface ParsedArgs {
  positional: string[]
  flags: Record<string, boolean>
  options: Record<string, string>
}

export interface FlagSpec {
  /** Long flag name without leading `--` (e.g. 'offline'). Boolean toggle. */
  flag?: string[]
  /** Long option name without leading `--` (e.g. 'out'). Consumes next argv. */
  option?: string[]
}

/**
 * Parse argv into `{ positional, flags, options }` using the declared flag/
 * option names. Unknown flags starting with `--` are ignored (not an error)
 * to allow forward-compat pass-through (e.g. mcp bin may forward a global
 * flag that the CLI does not consume). Unknown positional arguments are
 * collected in `positional` in order.
 */
export function parseArgs(argv: string[], spec: FlagSpec = {}): ParsedArgs {
  const flagSet = new Set(spec.flag ?? [])
  const optionSet = new Set(spec.option ?? [])

  const positional: string[] = []
  const flags: Record<string, boolean> = {}
  const options: Record<string, string> = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) continue

    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      if (optionSet.has(name)) {
        const value = argv[i + 1]
        if (value === undefined || value.startsWith('--')) {
          throw new RegistryError(
            'REGISTRY_FETCH_FAILED',
            `option --${name} requires a value`,
          )
        }
        options[name] = value
        i += 1
        continue
      }
      if (flagSet.has(name)) {
        flags[name] = true
        continue
      }
      // Unknown --flag: silently drop (forward-compat).
      continue
    }

    positional.push(arg)
  }

  return { positional, flags, options }
}

// ─── Colored output (picocolors, lazy) ──────────────────────────────────────

/**
 * Minimal color surface. Picocolors is a dependency of `@agrune/registry`
 * (see package.json), so we load it synchronously at the top level of each
 * CLI runner. If stdout is not a TTY we fall back to no-op — same behaviour
 * as picocolors default but more explicit for test determinism.
 */
export interface Color {
  green: (s: string) => string
  yellow: (s: string) => string
  red: (s: string) => string
  dim: (s: string) => string
  bold: (s: string) => string
}

export function makeColor(isTTY: boolean = process.stdout.isTTY === true): Color {
  if (!isTTY) {
    const identity = (s: string) => s
    return {
      green: identity,
      yellow: identity,
      red: identity,
      dim: identity,
      bold: identity,
    }
  }
  // Synchronous require via dynamic import is awkward; picocolors is CJS-safe
  // and tiny, so we fall back to a minimal ANSI shim rather than adding a
  // top-level await. This keeps CLI runners free of async import boilerplate.
  return {
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
  }
}

// ─── Error rendering ────────────────────────────────────────────────────────

/**
 * Render a RegistryError (or unknown error) onto stderr with a consistent
 * "[agrune maps] <code>: <message>" prefix. Returns the exit code the caller
 * should return (2 for lockfile write failures, 1 for everything else —
 * mirrors the plan's action spec so CI can disambiguate transient write
 * errors from schema/not-found errors).
 */
export function errorExit(err: unknown): number {
  if (err instanceof RegistryError) {
    process.stderr.write(`[agrune maps] ${err.code}: ${err.message}\n`)
    if (err.cause && (err.cause as NodeJS.ErrnoException).code) {
      process.stderr.write(
        `  caused by: ${(err.cause as NodeJS.ErrnoException).code} — ${String(
          (err.cause as Error).message ?? err.cause,
        )}\n`,
      )
    }
    return err.code === 'LOCKFILE_WRITE_FAILED' ? 2 : 1
  }
  process.stderr.write(`[agrune maps] unexpected error: ${(err as Error).message ?? String(err)}\n`)
  return 1
}

// ─── Usage ──────────────────────────────────────────────────────────────────

export function printMapsUsage(): void {
  process.stdout.write(
    `Usage: agrune maps <command>\n\n` +
      `Commands:\n` +
      `  add <host> [version]  registry 에서 manifest 를 받아 ~/.agrune/maps/ 캐시 + lockfile 에 기록\n` +
      `  types [--out <path>]  lockfile 을 읽어 host / targetId union 타입 선언을 emit\n` +
      `  doctor [--refresh]    로컬 캐시 staleness 진단 (+ --refresh 시 incidents.json 조회)\n` +
      `  submit <file>         manifest 를 agrune/maps registry 에 PR 로 제출 (device flow 인증)\n` +
      `\nCommon flags:\n` +
      `  --cwd <path>          lockfile 위치 override (default: process.cwd())\n`,
  )
}
