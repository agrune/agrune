// Top-level CLI entry + dispatch. SPEC §6.1 / A.2.
//
// runCli(argv, io) → sets process.exitCode. It wraps runCliOrThrow; on throw it coerces via
// asCliError, writes `${code}: ${message}\n` to stderr, and returns exitCodeFor(code).
//
// M0: parsing + --help/--version + unknown-command handling. The verb registry
// (commands.ts) is wired in M1+ as milestones land; runCommand dispatches into it.

import { parseArgs, type ParsedArgs } from './args.js'
import { asCliError, exitCodeFor } from './errors.js'
import { helpText } from './help.js'
import { CLI_VERSION } from './version.js'
import { runCommand } from './commands.js'

export interface ProgramIO {
  stdout: { write(text: string): void }
  stderr: { write(text: string): void }
}

const defaultIO: ProgramIO = {
  stdout: { write: (t) => process.stdout.write(t) },
  stderr: { write: (t) => process.stderr.write(t) },
}

/** Parse + dispatch; returns the intended exit code. Throws CliError on command failure. */
export async function runCliOrThrow(argv: string[], io: ProgramIO): Promise<number> {
  const parsed = parseArgs(argv)

  // Global --version (parity gap closed; SPEC §9 / A.0.3). Checked before the empty-command
  // help branch so `agrune --version` (no verb) prints the version, not the help text.
  if (parsed.flags.version === true) {
    io.stdout.write(`${CLI_VERSION}\n`)
    return 0
  }

  if (parsed.command.length === 0 || parsed.flags.help === true) {
    io.stdout.write(helpText())
    return 0
  }

  return runCommand(parsed, io)
}

/** Top-level wrapper: never throws; maps failures to stderr + exit code. */
export async function runCli(argv: string[], io: ProgramIO = defaultIO): Promise<number> {
  try {
    return await runCliOrThrow(argv, io)
  } catch (error) {
    const err = asCliError(error)
    io.stderr.write(`${err.code}: ${err.message}\n`)
    return exitCodeFor(err.code)
  }
}

/** bin shim entry. Sets process.exitCode from the resolved code. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  process.exitCode = await runCli(argv)
}

export type { ParsedArgs }
