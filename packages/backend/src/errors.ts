export class AgruneBackendError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AgruneBackendError'
  }
}

export function asBackendError(error: unknown): AgruneBackendError {
  if (error instanceof AgruneBackendError) return error
  if (error instanceof Error) return new AgruneBackendError('INTERNAL_ERROR', error.message)
  return new AgruneBackendError('INTERNAL_ERROR', String(error))
}

export function errorResponse(error: unknown) {
  const err = asBackendError(error)
  return {
    ok: false as const,
    error: {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  }
}

export { AgruneBackendError as CliError, asBackendError as asCliError }
