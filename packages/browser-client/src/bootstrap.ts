import type { BootstrapSessionResponse } from '@webcli-dom/core'
import { postJson } from './http-fallback'

type TimerWindow = Pick<Window & typeof globalThis, 'setTimeout' | 'clearTimeout'>

type BootstrapSessionOptions = {
  windowRef: TimerWindow
  fetchImpl: typeof fetch
  companionBaseUrl: string
  appId: string
  clientId: string
  sessionId: string | null
  origin: string
  url: string
  title: string
  clientVersion: string
}

function normalizeSessionToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeTokenExpiresAt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber)) {
    return asNumber
  }

  const asDate = Date.parse(trimmed)
  return Number.isNaN(asDate) ? null : asDate
}

export async function bootstrapSession({
  windowRef,
  fetchImpl,
  companionBaseUrl,
  appId,
  clientId,
  sessionId,
  origin,
  url,
  title,
  clientVersion,
}: BootstrapSessionOptions): Promise<BootstrapSessionResponse> {
  const connectRes = (await postJson(
    fetchImpl,
    `${companionBaseUrl}/page/connect`,
    {
      sessionId,
      clientId,
      appId,
      origin,
      url,
      title,
      clientVersion,
    },
    { windowRef },
  )) as {
    sessionId?: string
    sessionToken?: string
    tokenExpiresAt?: unknown
    status?: BootstrapSessionResponse['status']
    active?: boolean
    pollIntervalMs?: number
  }

  if (typeof connectRes.sessionId !== 'string' || !connectRes.sessionId.trim()) {
    throw new Error('invalid sessionId from /page/connect')
  }

  return {
    sessionId: connectRes.sessionId.trim(),
    sessionToken: normalizeSessionToken(connectRes.sessionToken),
    tokenExpiresAt: normalizeTokenExpiresAt(connectRes.tokenExpiresAt),
    status: connectRes.status,
    active: connectRes.active,
    pollIntervalMs: connectRes.pollIntervalMs,
  }
}
