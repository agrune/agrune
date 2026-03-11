import type { SyncPayload, SyncResponse } from './types'

const DEFAULT_TIMEOUT_MS = 4_000

type TimerWindow = Pick<Window & typeof globalThis, 'setTimeout' | 'clearTimeout'>

type PostJsonOptions = {
  windowRef: TimerWindow
  headers?: Record<string, string>
  timeoutMs?: number
}

type SyncViaHttpOptions = {
  windowRef: TimerWindow
  fetchImpl: typeof fetch
  companionBaseUrl: string
  sessionId: string
  sessionToken: string | null
  payload: SyncPayload
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  payload: unknown,
  { windowRef, headers, timeoutMs = DEFAULT_TIMEOUT_MS }: PostJsonOptions,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = windowRef.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const text = await res.text()
    const parsed = text ? (JSON.parse(text) as unknown) : {}
    if (!res.ok) {
      throw new HttpError(res.status)
    }
    return parsed
  } finally {
    windowRef.clearTimeout(timer)
  }
}

export async function syncViaHttp({
  windowRef,
  fetchImpl,
  companionBaseUrl,
  sessionId,
  sessionToken,
  payload,
}: SyncViaHttpOptions): Promise<SyncResponse> {
  const headers = sessionToken ? { authorization: `Bearer ${sessionToken}` } : undefined
  return (await postJson(
    fetchImpl,
    `${companionBaseUrl}/page/sync`,
    {
      sessionId,
      ...payload,
    },
    { windowRef, headers },
  )) as SyncResponse
}
