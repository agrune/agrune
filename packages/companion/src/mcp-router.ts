import http from 'node:http'
import type { CallQueue } from './call-queue.js'
import { parseJson, readBody, safeObject, stringifyError, writeJson } from './http-utils.js'
import {
  CompanionRpcError,
  type CompanionRpcMessage,
  createInitializeResult,
  toRpcError,
  toRpcResult,
} from './protocol.js'
import type { RuntimeStore } from './runtime-store.js'
import { requiresToolCallConfirmation } from './security.js'
import type { SessionManager } from './session-manager.js'

export interface McpRouter {
  handleMcp: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
}

interface McpRouterOptions {
  store: RuntimeStore
  sessionManager: SessionManager
  callQueue: CallQueue
}

export function createMcpRouter({
  store,
  sessionManager,
  callQueue,
}: McpRouterOptions): McpRouter {
  const handleMcp = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'Method Not Allowed' })
      return
    }

    const body = parseJson(await readBody(req))
    const request = safeObject(body) as CompanionRpcMessage | undefined
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      writeJson(res, 400, toRpcError(null, -32600, 'Invalid Request'))
      return
    }

    const id = request.id ?? null
    sessionManager.pruneExpiredSessions()

    if (request.id === undefined || request.id === null) {
      writeJson(res, 202, { accepted: true })
      return
    }

    try {
      let result: unknown
      if (request.method === 'initialize') {
        result = createInitializeResult()
      } else if (request.method === 'ping') {
        result = {}
      } else if (request.method === 'resources/list') {
        result = { resources: [] }
      } else if (request.method === 'resources/templates/list') {
        result = { resourceTemplates: [] }
      } else if (request.method === 'tools/list') {
        try {
          const session = sessionManager.getActiveApprovedSession()
          result = { tools: session.tools }
          store.addLog('mcp', 'tools/list', { sessionId: session.id, toolCount: session.tools.length })
        } catch (error) {
          if (
            error instanceof CompanionRpcError &&
            (error.code === -32001 || error.code === -32003)
          ) {
            result = { tools: [] }
            store.addLog('mcp', 'tools/list empty', { reason: error.message, code: error.code })
          } else {
            throw error
          }
        }
      } else if (request.method === 'tools/call') {
        const params = safeObject(request.params)
        const toolName = typeof params?.name === 'string' ? params.name.trim() : ''
        if (!toolName) {
          throw new CompanionRpcError(-32602, 'Invalid params: name')
        }

        const args = safeObject(params?.arguments) ?? {}
        const session = sessionManager.getActiveApprovedSession()
        const requiresConfirm = requiresToolCallConfirmation(session, args)
        result = await callQueue.queueCallForSession(session, toolName, args, requiresConfirm)
        store.addLog('mcp', 'tools/call completed', {
          sessionId: session.id,
          toolName,
          requiresConfirm,
        })
      } else {
        throw new CompanionRpcError(-32601, `Method not found: ${request.method}`)
      }

      writeJson(res, 200, toRpcResult(id, result))
    } catch (error) {
      const rpcError =
        error instanceof CompanionRpcError
          ? error
          : new CompanionRpcError(-32000, stringifyError(error))
      store.addLog('error', 'mcp request failed', {
        method: request.method,
        code: rpcError.code,
        message: rpcError.message,
      })
      writeJson(res, 200, toRpcError(id, rpcError.code, rpcError.message))
    }
  }

  return { handleMcp }
}
