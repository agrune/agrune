import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AgruneRuntimeConfig, BrowserDriver, CommandErrorShape, Session } from '@agrune/core'
import { registerAgruneTools } from './mcp-tools.js'
import type { ToolHandlerResult } from './mcp-tools.js'
import {
  toPublicCommandResult,
  toPublicSession,
  toPublicSessionMeta,
  toPublicSnapshot,
} from './public-shapes.js'
import type { PublicSessionMeta, PublicSnapshotOptions } from './public-shapes.js'
import { CommandBroker, type CommandEvent } from './command-broker.js'
import { HitlController, HitlSkipError } from './hitl-controller.js'

declare const __MCP_SERVER_VERSION__: string

export { registerAgruneTools } from './mcp-tools.js'
export { getToolDefinitions } from './tools.js'
export type { CommandEvent, CommandEventPhase, CommandEventListener } from './command-broker.js'
export type { HitlState, HitlStateListener } from './hitl-controller.js'
export { CommandBroker } from './command-broker.js'
export { HitlController, HitlSkipError } from './hitl-controller.js'

type ActivityAwareDriver = BrowserDriver & {
  onActivity?: (() => void) | null
}

export function createMcpServer<TDriver extends ActivityAwareDriver>(
  driver: TDriver,
) {
  const commandBroker = new CommandBroker()
  const hitl = new HitlController()

  const mcp = new McpServer(
    { name: 'agrune', version: typeof __MCP_SERVER_VERSION__ !== 'undefined' ? __MCP_SERVER_VERSION__ : '0.0.0' },
    { capabilities: { tools: {} } },
  )

  const innerHandleToolCall = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> => {
    driver.onActivity?.()
    if (!driver.isConnected()) {
      await driver.connect()
    }

    if (name !== 'browser_update_config' && name !== 'browser_open_tab') {
      const readyError = await driver.ensureReady()
      if (readyError) return { text: readyError, isError: true }
    }

    const tabId = driver.resolveTabId(args.tabId as number | undefined)

    switch (name) {
      case 'browser_list_tabs': {
        return { text: JSON.stringify(driver.listSessions().map(toPublicSession), null, 2) }
      }
      case 'browser_open_tab': {
        if (typeof args.url !== 'string' || args.url.trim().length === 0) {
          return errorText('INVALID_COMMAND', 'browser_open_tab requires url (string).')
        }
        if (typeof driver.openTab !== 'function') {
          return errorText('INVALID_COMMAND', 'Driver does not support openTab.')
        }
        try {
          const opened = await driver.openTab(args.url)
          const session = driver.listSessions().find(s => s.tabId === opened.tabId)
          const payload = {
            ok: true,
            tabId: opened.tabId,
            url: opened.url,
            title: opened.title,
            session: session
              ? toPublicSessionMeta(session as Session, {
                  wasActive: false,
                  becameActive: session.active === true,
                })
              : null,
          }
          return { text: JSON.stringify(payload, null, 2) }
        } catch (error) {
          const shape = error as Partial<CommandErrorShape>
          if (shape && typeof shape.code === 'string') {
            return errorText(shape.code, shape.message ?? 'Failed to open tab.', shape.details)
          }
          return errorText('INVALID_COMMAND', error instanceof Error ? error.message : String(error))
        }
      }
      case 'browser_get_targets': {
        if (tabId == null) return { text: 'No active sessions.', isError: true }
        const snapshot = driver.getSnapshot(tabId)
        if (!snapshot) return { text: `No snapshot available for tab ${tabId}.`, isError: true }
        const payload = {
          ...toPublicSnapshot(snapshot, resolveSnapshotOptions(args)),
          session: buildSessionMeta(driver, tabId, false),
        }
        return { text: JSON.stringify(payload, null, 2) }
      }
      case 'browser_click':
      case 'browser_double_click':
      case 'browser_right_click':
      case 'browser_hover':
      case 'browser_long_press':
      case 'browser_fill':
      case 'browser_drag':
      case 'browser_pointer':
      case 'browser_wait_for':
      case 'browser_read': {
        if (tabId == null) return { text: 'No active sessions.', isError: true }
        const wasActive = driver.listSessions().find(s => s.tabId === tabId)?.active === true
        const command: Record<string, unknown> & { kind: string } = {
          kind: resolveRuntimeCommandKind(name), ...args,
        }
        delete command.tabId
        const result = await driver.execute(tabId, command)
        const publicResult = toPublicCommandResult(result)
        const after = driver.listSessions().find(s => s.tabId === tabId)
        const sessionMeta = after
          ? toPublicSessionMeta(after as Session, {
              wasActive,
              becameActive: after.active === true && !wasActive,
            })
          : undefined
        const payload = sessionMeta ? { ...publicResult, session: sessionMeta } : publicResult
        return { text: JSON.stringify(payload, null, 2) }
      }
      case 'browser_focus_tab': {
        const focusArg = resolveFocusTabId(args)
        if (focusArg == null) {
          return errorText('TAB_NOT_FOUND', 'browser_focus_tab requires tabId or numeric sessionId.')
        }
        const target = driver.listSessions().find(s => s.tabId === focusArg)
        if (!target) {
          return errorText('TAB_NOT_FOUND', `No session exists for tabId ${focusArg}.`, { tabId: focusArg })
        }
        const wasActive = target.active === true
        try {
          const focusResult = await driver.focusSession(focusArg)
          const refreshed = driver.listSessions().find(s => s.tabId === focusArg) ?? target
          const sessionMeta = toPublicSessionMeta(refreshed as Session, {
            wasActive,
            becameActive: focusResult.becameActive && !wasActive,
          })
          const payload: Record<string, unknown> = {
            ok: true,
            session: sessionMeta,
          }
          if (focusResult.cdpFocusError) {
            payload.cdpFocusError = focusResult.cdpFocusError
          }
          return { text: JSON.stringify(payload, null, 2) }
        } catch (error) {
          const shape = error as Partial<CommandErrorShape>
          if (shape && typeof shape.code === 'string' && shape.code === 'TAB_NOT_FOUND') {
            return errorText('TAB_NOT_FOUND', shape.message ?? 'Tab not found.', shape.details)
          }
          return errorText('INVALID_COMMAND', error instanceof Error ? error.message : String(error))
        }
      }
      case 'browser_update_config': {
        const config: Partial<AgruneRuntimeConfig> = {}
        if (typeof args.pointerAnimation === 'boolean') config.pointerAnimation = args.pointerAnimation
        if (typeof args.auroraGlow === 'boolean') config.auroraGlow = args.auroraGlow
        if (typeof args.auroraTheme === 'string') config.auroraTheme = args.auroraTheme as AgruneRuntimeConfig['auroraTheme']
        if (typeof args.clickDelayMs === 'number') config.clickDelayMs = args.clickDelayMs
        if (typeof args.pointerDurationMs === 'number') config.pointerDurationMs = args.pointerDurationMs
        if (typeof args.autoScroll === 'boolean') config.autoScroll = args.autoScroll
        if (Object.keys(config).length > 0) driver.updateConfig(config)
        return { text: 'Configuration updated.' }
      }
      default:
        return { text: `Unknown tool: ${name}`, isError: true }
    }
  }

  const handleToolCall = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> => {
    const tool = name
    const id = commandBroker.nextId()
    const start = Date.now()
    const sessionId = typeof args.tabId === 'number' ? (args.tabId as number) : null

    try {
      await hitl.awaitGate(tool)
    } catch (err) {
      if (err instanceof HitlSkipError) {
        const event: CommandEvent = {
          id,
          ts: start,
          sessionId,
          tool,
          phase: 'error',
          durationMs: 0,
          error: { code: err.code, message: err.message },
        }
        commandBroker.emit(event)
        return {
          text: JSON.stringify({ ok: false, error: { code: err.code, message: err.message } }, null, 2),
          isError: true,
        }
      }
      throw err
    }

    commandBroker.emit({ id, ts: start, sessionId, tool, phase: 'start' })

    try {
      const result = await innerHandleToolCall(name, args)
      const durationMs = Date.now() - start
      if (result.isError) {
        const parsed = safeParseJson(result.text)
        const err = extractError(parsed)
        commandBroker.emit({
          id,
          ts: Date.now(),
          sessionId,
          tool,
          phase: 'error',
          durationMs,
          error: err,
        })
      } else {
        commandBroker.emit({ id, ts: Date.now(), sessionId, tool, phase: 'end', durationMs })
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      commandBroker.emit({
        id,
        ts: Date.now(),
        sessionId,
        tool,
        phase: 'error',
        durationMs: Date.now() - start,
        error: { code: 'INTERNAL_ERROR', message },
      })
      throw error
    }
  }

  registerAgruneTools(mcp, handleToolCall)

  return { server: mcp, driver, handleToolCall, commandBroker, hitl }
}

function resolveRuntimeCommandKind(toolName: string): string {
  switch (toolName) {
    case 'browser_click':
    case 'browser_double_click':
    case 'browser_right_click':
    case 'browser_hover':
    case 'browser_long_press':
      return 'act'
    case 'browser_fill':
      return 'fill'
    case 'browser_drag':
      return 'drag'
    case 'browser_pointer':
      return 'pointer'
    case 'browser_wait_for':
      return 'wait'
    case 'browser_read':
      return 'read'
    default:
      return toolName
  }
}

function resolveSnapshotOptions(args: Record<string, unknown>): PublicSnapshotOptions {
  const groupIds = new Set<string>()
  if (typeof args.groupId === 'string' && args.groupId.trim()) groupIds.add(args.groupId.trim())
  if (Array.isArray(args.groupIds)) {
    for (const value of args.groupIds) {
      if (typeof value === 'string' && value.trim()) groupIds.add(value.trim())
    }
  }
  return {
    mode: args.mode === 'full' ? 'full' : 'outline',
    ...(groupIds.size > 0 ? { groupIds: [...groupIds] } : {}),
    ...(args.includeTextContent === true ? { includeTextContent: true } : {}),
  }
}

function buildSessionMeta(
  driver: BrowserDriver,
  tabId: number,
  becameActive: boolean,
): PublicSessionMeta | undefined {
  const session = driver.listSessions().find(s => s.tabId === tabId)
  if (!session) return undefined
  return toPublicSessionMeta(session as Session, {
    wasActive: session.active === true,
    becameActive,
  })
}

function resolveFocusTabId(args: Record<string, unknown>): number | null {
  if (typeof args.tabId === 'number' && Number.isFinite(args.tabId)) return args.tabId
  if (typeof args.sessionId === 'string') {
    const parsed = Number(args.sessionId)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function errorText(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ToolHandlerResult {
  return {
    text: JSON.stringify(
      { ok: false, error: { code, message, ...(details ? { details } : {}) } },
      null,
      2,
    ),
    isError: true,
  }
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

function extractError(parsed: unknown): { code: string; message: string } {
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const err = (parsed as { error?: unknown }).error
    if (err && typeof err === 'object') {
      const code = typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : 'UNKNOWN_ERROR'
      const message = typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : 'Unknown error'
      return { code, message }
    }
  }
  return { code: 'UNKNOWN_ERROR', message: 'Unknown error' }
}
