import type http from 'node:http'
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  isValidAdminSessionToken,
  issueAdminSessionToken,
  parseCookies,
} from './tokens.js'

export function isAdminAuthorized(req: http.IncomingMessage, signingSecret: Buffer): boolean {
  const cookieToken = parseCookies(req)[ADMIN_SESSION_COOKIE_NAME]
  return isValidAdminSessionToken(signingSecret, cookieToken ?? '')
}

export function buildAdminSessionCookie(signingSecret: Buffer): string {
  const maxAge = Math.floor(ADMIN_SESSION_TTL_MS / 1_000)
  return `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(issueAdminSessionToken(signingSecret))}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
}

export function clearAdminSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`
}
