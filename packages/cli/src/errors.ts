export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'CliError'
  }
}

export function asCliError(error: unknown): CliError {
  if (error instanceof CliError) return error
  if (error instanceof Error) return new CliError('INTERNAL_ERROR', error.message)
  return new CliError('INTERNAL_ERROR', String(error))
}

export function errorResponse(error: unknown) {
  const err = asCliError(error)
  return {
    ok: false as const,
    error: {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  }
}
