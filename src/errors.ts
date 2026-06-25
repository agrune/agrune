// Error/exit-code contract. Verbatim from SPEC Appendix A.4.
//
// CliError / AgruneBackendError carry { code, message, details? }. The CLI top-level catch
// prints `${code}: ${message}\n` to stderr and returns exitCodeFor(code).

/**
 * The complete CommandErrorCode union (A.4.1) — exactly these 26 entries, in source order.
 * These are the codes the daemon/driver layer can produce.
 */
export const COMMAND_ERROR_CODES = [
  'STALE_SNAPSHOT',
  'TARGET_NOT_FOUND',
  'NOT_VISIBLE',
  'DISABLED',
  'FLOW_BLOCKED',
  'TIMEOUT',
  'SESSION_NOT_ACTIVE',
  'AGENT_STOPPED',
  'INVALID_TARGET',
  'INVALID_COMMAND',
  'INVALID_MANIFEST',
  'MACRO_NOT_FOUND',
  'MACRO_CIRCUIT_OPEN',
  'MACRO_PRECONDITION_FAILED',
  'MACRO_POSTCONDITION_FAILED',
  'REPEAT_INDEX_OUT_OF_RANGE',
  'CANVAS_PAN_FAILED',
  'DESTINATION_OUTSIDE_CANVAS',
  'CONNECTION_LOST',
  'CHROME_CRASHED',
  'RECOVERY_FAILED',
  'TAB_NOT_FOUND',
  'DIALOG_NOT_FOUND',
  'FILE_CHOOSER_NOT_FOUND',
  'NETWORK_REQUEST_NOT_FOUND',
  'NETWORK_RESPONSE_NOT_FOUND',
] as const

export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number]

/**
 * Additional CLI/backend-layer codes carried on the wire (A.4.2) — NOT part of the
 * CommandErrorCode union but produced as CliError codes and consumed by exitCodeFor.
 */
export type WireErrorCode =
  | CommandErrorCode
  | 'DAEMON_UNAVAILABLE'
  | 'DAEMON_ALREADY_RUNNING'
  | 'INTERNAL_ERROR'
  | 'HTTP_ERROR'
  | 'MANIFEST_NOT_FOUND'
  | 'FIELD_FAILED'
  | 'NETWORK_BODY_UNAVAILABLE'

export interface CommandErrorShape {
  code: CommandErrorCode | WireErrorCode
  message: string
  details?: Record<string, unknown>
}

/**
 * The single error type used across the CLI, client, and daemon. (`AgruneBackendError` in
 * the original split package is folded into this one class for the lean single package.)
 */
export class CliError extends Error {
  readonly code: WireErrorCode | string
  readonly details?: Record<string, unknown>

  constructor(code: WireErrorCode | string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CliError'
    this.code = code
    this.details = details
  }
}

/** Alias kept for parity with SPEC's source references; identical to CliError. */
export const AgruneBackendError = CliError

/** Coerce any thrown value into a CliError (non-CliError → INTERNAL_ERROR), per A.1.6. */
export function asCliError(error: unknown): CliError {
  if (error instanceof CliError) return error
  if (error instanceof Error) return new CliError('INTERNAL_ERROR', error.message)
  return new CliError('INTERNAL_ERROR', String(error))
}

/**
 * code → exit-code map. Verbatim A.4.3 / §6.4:
 *   DAEMON_UNAVAILABLE | SESSION_NOT_ACTIVE → 4
 *   TARGET_NOT_FOUND   | INVALID_MANIFEST   → 3
 *   everything else                          → 1
 * (Exit 0 is returned on success / --help by the caller.)
 */
export function exitCodeFor(code: string): number {
  if (code === 'DAEMON_UNAVAILABLE' || code === 'SESSION_NOT_ACTIVE') return 4
  if (code === 'TARGET_NOT_FOUND' || code === 'INVALID_MANIFEST') return 3
  return 1
}

/** Error envelope written by the daemon (A.1.6). `details` present only when carried. */
export function errorResponse(error: unknown): {
  ok: false
  error: CommandErrorShape
} {
  const err = asCliError(error)
  const shape: CommandErrorShape = { code: err.code as CommandErrorShape['code'], message: err.message }
  if (err.details && Object.keys(err.details).length > 0) shape.details = err.details
  return { ok: false, error: shape }
}
