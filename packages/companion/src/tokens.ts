import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type http from 'node:http'
import type { SessionRuntime } from './runtime-types.js'

export const PAGE_SESSION_TOKEN_TTL_MS = 24 * 60 * 60 * 1_000
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1_000
export const ADMIN_SESSION_COOKIE_NAME = 'webmcp_admin_session'

export interface PageSessionTokenClaims {
  kind: 'page-session'
  sessionId: string
  clientId: string
  origin: string
  iat: number
  exp: number
}

export interface AdminSessionTokenClaims {
  kind: 'admin-session'
  iat: number
  exp: number
}

type SignedTokenClaims = PageSessionTokenClaims | AdminSessionTokenClaims

export function createSigningSecret(): Buffer {
  return randomBytes(32)
}

export function readBearerToken(req: http.IncomingMessage): string {
  const header = req.headers.authorization
  if (typeof header !== 'string') return ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() ?? ''
}

export function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const header = req.headers.cookie
  if (typeof header !== 'string' || !header.trim()) return {}

  const cookies: Record<string, string> = {}
  for (const part of header.split(';')) {
    const [namePart, ...valueParts] = part.split('=')
    const name = namePart.trim()
    if (!name) continue
    const rawValue = valueParts.join('=').trim()
    try {
      cookies[name] = decodeURIComponent(rawValue)
    } catch {
      cookies[name] = rawValue
    }
  }

  return cookies
}

export function signToken(signingSecret: Buffer, claims: SignedTokenClaims): string {
  const encodedClaims = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  const signature = createHmac('sha256', signingSecret).update(encodedClaims).digest('base64url')
  return `${encodedClaims}.${signature}`
}

export function verifySignedToken(signingSecret: Buffer, token: string): Record<string, unknown> | null {
  const trimmed = token.trim()
  if (!trimmed) return null

  const [encodedClaims, encodedSignature, ...rest] = trimmed.split('.')
  if (!encodedClaims || !encodedSignature || rest.length > 0) return null

  const expectedSignature = createHmac('sha256', signingSecret).update(encodedClaims).digest()
  let actualSignature: Buffer
  try {
    actualSignature = Buffer.from(encodedSignature, 'base64url')
  } catch {
    return null
  }

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    const payload = parsed as Record<string, unknown>
    const exp = typeof payload.exp === 'number' ? payload.exp : 0
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function issuePageSessionToken(signingSecret: Buffer, session: SessionRuntime): string {
  return signToken(signingSecret, {
    kind: 'page-session',
    sessionId: session.id,
    clientId: session.clientId,
    origin: session.origin,
    iat: Date.now(),
    exp: Date.now() + PAGE_SESSION_TOKEN_TTL_MS,
  })
}

export function verifyPageSessionToken(
  signingSecret: Buffer,
  token: string,
  expectedOrigin: string,
): PageSessionTokenClaims | null {
  const payload = verifySignedToken(signingSecret, token)
  if (!payload || payload.kind !== 'page-session') return null

  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
  const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : ''
  const origin = typeof payload.origin === 'string' ? payload.origin.trim() : ''
  const iat = typeof payload.iat === 'number' ? payload.iat : 0
  const exp = typeof payload.exp === 'number' ? payload.exp : 0

  if (!sessionId || !clientId || !origin || !iat || !exp) return null
  if (origin !== expectedOrigin) return null

  return {
    kind: 'page-session',
    sessionId,
    clientId,
    origin,
    iat,
    exp,
  }
}

export function issueAdminSessionToken(signingSecret: Buffer): string {
  return signToken(signingSecret, {
    kind: 'admin-session',
    iat: Date.now(),
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
  })
}

export function isValidAdminSessionToken(signingSecret: Buffer, token: string): boolean {
  const payload = verifySignedToken(signingSecret, token)
  return Boolean(payload && payload.kind === 'admin-session')
}
