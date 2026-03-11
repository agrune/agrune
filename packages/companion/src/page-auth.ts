import http from 'node:http'
import { writeJson } from './http-utils.js'
import type { SessionRuntime } from './runtime-types.js'
import type { SessionManager } from './session-manager.js'
import { readBearerToken, verifyPageSessionToken } from './tokens.js'

export function normalizeOriginHeader(input: unknown): string {
  if (typeof input !== 'string') return ''
  const trimmed = input.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ''
    }
    return `${url.protocol}//${url.host}`
  } catch {
    return ''
  }
}

export function getRequestOrigin(req: http.IncomingMessage): string {
  return normalizeOriginHeader(req.headers.origin)
}

export function withPageCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = getRequestOrigin(req)
  if (origin) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'origin')
  }
  res.setHeader('access-control-allow-headers', 'content-type, authorization')
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
}

export function writePageOriginRequired(res: http.ServerResponse): void {
  writeJson(res, 400, { error: 'Origin header is required' })
}

export function getPageBearerToken(req: http.IncomingMessage): string {
  return readBearerToken(req)
}

interface ResolveAuthenticatedPageSessionOptions {
  sessionManager: SessionManager
  expectedSessionId?: string
  origin: string
  bearerToken: string
  signingSecret: Buffer
}

export function resolveAuthenticatedPageSession({
  sessionManager,
  expectedSessionId,
  origin,
  bearerToken,
  signingSecret,
}: ResolveAuthenticatedPageSessionOptions): SessionRuntime | null {
  const claims = verifyPageSessionToken(signingSecret, bearerToken, origin)
  if (!claims) return null
  if (expectedSessionId && claims.sessionId !== expectedSessionId) return null

  const session = sessionManager.getSession(claims.sessionId)
  if (!session) return null
  if (session.clientId !== claims.clientId) return null
  if (session.origin !== origin || session.origin !== claims.origin) return null
  return session
}
