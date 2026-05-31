import { CliError } from './errors.js'

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  } catch (error) {
    throw new CliError(
      'DAEMON_UNAVAILABLE',
      `Agrune daemon is not reachable at ${baseUrl}. Start it with "agrune daemon start".`,
      { cause: error instanceof Error ? error.message : String(error) },
    )
  }

  const text = await response.text()
  const parsed = text ? safeParseJson(text) : null
  if (!response.ok) {
    const err = parsed && typeof parsed === 'object' && 'error' in parsed
      ? (parsed as { error: { code?: string; message?: string; details?: Record<string, unknown> } }).error
      : null
    throw new CliError(
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Agrune daemon returned HTTP ${response.status}.`,
      err?.details,
    )
  }
  return parsed as T
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
