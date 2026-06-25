// Verb registry + dispatch. SPEC §6.3 / A.2.
//
// M0: empty registry — every verb is "unknown" until milestones land. M1+ register
// lifecycle + browser verbs here, each mapping a CLI verb onto a daemon route (A.2.3) or a
// local lifecycle action.

import type { ParsedArgs } from './args.js'
import type { ProgramIO } from './program.js'

/** Dispatch a parsed command. Returns the exit code; throws CliError on failure. */
export async function runCommand(parsed: ParsedArgs, io: ProgramIO): Promise<number> {
  // Registry lookup is added in M1+. For now nothing is registered.
  io.stderr.write(`Unknown command: ${parsed.command.join(' ')}\n`)
  return 1
}
