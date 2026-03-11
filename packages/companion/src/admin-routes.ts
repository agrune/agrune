import http from 'node:http'
import {
  buildAdminSessionCookie,
  clearAdminSessionCookie,
  isAdminAuthorized,
} from './admin-auth.js'
import type { CallQueue } from './call-queue.js'
import { renderAdminHtml, renderAdminLoginHtml } from './admin-ui.js'
import { parseJson, readBody, redirect, safeObject, writeHtml, writeJson } from './http-utils.js'
import type { RuntimeStore } from './runtime-store.js'
import type { SessionManager } from './session-manager.js'
import type { CompanionPaths } from './types.js'

interface AdminPostSessionActivate {
  sessionId?: string | null
}

interface AdminPostOrigin {
  origin?: string
}

interface AdminPostConfirmation {
  callId?: string
}

interface CompanionStatusPayload {
  version: string
  endpoint: string
  adminUrl: string
  tokenPath: string
  pidPath: string
  homeDir: string
  activeSessionId: string | null
  sessionCount: number
  approvals: Record<string, number>
}

export interface AdminRoutes {
  handleAdminUi: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<boolean>
  handleAdminApi: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<boolean>
}

interface AdminRoutesOptions {
  host: string
  port: number
  mcpPath: string
  version: string
  adminToken: string
  signingSecret: Buffer
  paths: CompanionPaths
  store: RuntimeStore
  sessionManager: SessionManager
  callQueue: CallQueue
}

export function createAdminRoutes({
  host,
  port,
  mcpPath,
  version,
  adminToken,
  signingSecret,
  paths,
  store,
  sessionManager,
  callQueue,
}: AdminRoutesOptions): AdminRoutes {
  const handleAdminUi = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<boolean> => {
    if (url.pathname === '/admin/login') {
      if (req.method !== 'GET') {
        writeJson(res, 405, { error: 'Method Not Allowed' })
        return true
      }

      const token = url.searchParams.get('token')?.trim() ?? ''
      if (!token) {
        res.setHeader('set-cookie', clearAdminSessionCookie())
        writeHtml(res, 200, renderAdminLoginHtml(paths.tokenPath))
        return true
      }

      if (token !== adminToken) {
        res.setHeader('set-cookie', clearAdminSessionCookie())
        writeHtml(res, 401, renderAdminLoginHtml(paths.tokenPath, 'Invalid admin token'))
        return true
      }

      res.setHeader('set-cookie', buildAdminSessionCookie(signingSecret))
      store.addLog('admin', 'admin session established')
      redirect(res, '/admin')
      return true
    }

    if (url.pathname !== '/admin') return false
    if (!isAdminAuthorized(req, signingSecret)) {
      res.setHeader('set-cookie', clearAdminSessionCookie())
      redirect(res, '/admin/login')
      return true
    }

    writeHtml(res, 200, renderAdminHtml())
    return true
  }

  const handleAdminApi = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<boolean> => {
    if (!url.pathname.startsWith('/admin/api/')) return false
    if (!isAdminAuthorized(req, signingSecret)) {
      writeJson(res, 401, { error: 'Unauthorized' })
      return true
    }

    sessionManager.pruneExpiredSessions()
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/admin/api/status') {
      const payload: CompanionStatusPayload = {
        version,
        endpoint: `http://${host}:${port}${mcpPath}`,
        adminUrl: `http://${host}:${port}/admin`,
        tokenPath: paths.tokenPath,
        pidPath: paths.pidPath,
        homeDir: paths.homeDir,
        activeSessionId: store.persisted.activeSessionId,
        sessionCount: sessionManager.countSessions(),
        approvals: sessionManager.getApprovalCounts(),
      }
      writeJson(res, 200, payload)
      return true
    }

    if (req.method === 'GET' && pathname === '/admin/api/sessions') {
      writeJson(res, 200, { sessions: sessionManager.listSessionSnapshots() })
      return true
    }

    if (req.method === 'POST' && pathname === '/admin/api/sessions/activate') {
      const payload = safeObject(parseJson(await readBody(req))) as AdminPostSessionActivate | undefined
      const sessionId =
        payload?.sessionId === null
          ? null
          : typeof payload?.sessionId === 'string'
            ? payload.sessionId
            : undefined
      if (sessionId === undefined) {
        writeJson(res, 400, { error: 'sessionId must be string or null' })
        return true
      }
      if (sessionId && !sessionManager.getSession(sessionId)) {
        writeJson(res, 404, { error: 'session not found' })
        return true
      }
      if (sessionId && sessionManager.getSession(sessionId)?.approvalStatus !== 'approved') {
        writeJson(res, 400, { error: 'session origin is not approved' })
        return true
      }
      sessionManager.setActiveSession(sessionId)
      writeJson(res, 200, { ok: true, activeSessionId: store.persisted.activeSessionId })
      return true
    }

    if (req.method === 'GET' && pathname === '/admin/api/origins') {
      writeJson(res, 200, { origins: sessionManager.listOrigins() })
      return true
    }

    if (req.method === 'POST' && pathname === '/admin/api/origins/approve') {
      const payload = safeObject(parseJson(await readBody(req))) as AdminPostOrigin | undefined
      const origin = typeof payload?.origin === 'string' ? payload.origin.trim() : ''
      if (!origin) {
        writeJson(res, 400, { error: 'origin is required' })
        return true
      }
      sessionManager.applyOriginApproval(origin, 'approved')
      writeJson(res, 200, { ok: true })
      return true
    }

    if (req.method === 'POST' && pathname === '/admin/api/origins/revoke') {
      const payload = safeObject(parseJson(await readBody(req))) as AdminPostOrigin | undefined
      const origin = typeof payload?.origin === 'string' ? payload.origin.trim() : ''
      if (!origin) {
        writeJson(res, 400, { error: 'origin is required' })
        return true
      }
      sessionManager.applyOriginApproval(origin, 'pending')
      writeJson(res, 200, { ok: true })
      return true
    }

    if (req.method === 'GET' && pathname === '/admin/api/logs') {
      const limitRaw = Number(url.searchParams.get('limit') ?? 100)
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 100
      writeJson(res, 200, { logs: store.listLogs(limit) })
      return true
    }

    if (req.method === 'GET' && pathname === '/admin/api/confirmations') {
      writeJson(res, 200, {
        confirmations: callQueue.listConfirmations().sort((a, b) => b.createdAt - a.createdAt),
      })
      return true
    }

    if (req.method === 'POST' && pathname === '/admin/api/confirmations/approve') {
      const payload = safeObject(parseJson(await readBody(req))) as AdminPostConfirmation | undefined
      const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : ''
      if (!callId) {
        writeJson(res, 400, { error: 'callId is required' })
        return true
      }
      if (!callQueue.approveConfirmation(callId)) {
        writeJson(res, 404, { error: 'confirmation not found' })
        return true
      }
      writeJson(res, 200, { ok: true })
      return true
    }

    if (req.method === 'POST' && pathname === '/admin/api/confirmations/reject') {
      const payload = safeObject(parseJson(await readBody(req))) as AdminPostConfirmation | undefined
      const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : ''
      if (!callId) {
        writeJson(res, 400, { error: 'callId is required' })
        return true
      }
      if (!callQueue.rejectConfirmation(callId, 'call rejected by admin')) {
        writeJson(res, 404, { error: 'confirmation not found' })
        return true
      }
      writeJson(res, 200, { ok: true })
      return true
    }

    writeJson(res, 404, { error: 'Not found' })
    return true
  }

  return {
    handleAdminUi,
    handleAdminApi,
  }
}
