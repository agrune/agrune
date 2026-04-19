import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AgruneRuntimeConfig, BrowserDriver, CommandErrorShape, MacroRunResponse, Session } from '@agrune/core'
import { validateManifest } from '@agrune/manifest'
import type { AgruneManifest } from '@agrune/manifest'
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

    if (name !== 'agrune_config') {
      const readyError = await driver.ensureReady()
      if (readyError) return { text: readyError, isError: true }
    }

    const tabId = driver.resolveTabId(args.tabId as number | undefined)

    switch (name) {
      case 'agrune_sessions': {
        return { text: JSON.stringify(driver.listSessions().map(toPublicSession), null, 2) }
      }
      case 'agrune_snapshot': {
        if (tabId == null) return { text: 'No active sessions.', isError: true }
        const snapshot = driver.getSnapshot(tabId)
        if (!snapshot) return { text: `No snapshot available for tab ${tabId}.`, isError: true }
        const payload = {
          ...toPublicSnapshot(snapshot, resolveSnapshotOptions(args)),
          session: buildSessionMeta(driver, tabId, false),
        }
        return { text: JSON.stringify(payload, null, 2) }
      }
      case 'agrune_act':
      case 'agrune_fill':
      case 'agrune_drag':
      case 'agrune_pointer':
      case 'agrune_wait':
      case 'agrune_guide':
      case 'agrune_read': {
        if (tabId == null) return { text: 'No active sessions.', isError: true }
        const wasActive = driver.listSessions().find(s => s.tabId === tabId)?.active === true
        const command: Record<string, unknown> & { kind: string } = {
          kind: name.replace('agrune_', ''), ...args,
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
      case 'agrune_focus': {
        const focusArg = resolveFocusTabId(args)
        if (focusArg == null) {
          return errorText('TAB_NOT_FOUND', 'agrune_focus requires tabId or numeric sessionId.')
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
      case 'agrune_manifest_load': {
        const validation = validateManifest(args.manifest)
        if (!validation.ok) {
          return errorText(
            'INVALID_MANIFEST',
            'Manifest failed schema validation.',
            { errors: validation.errors },
          )
        }
        if (tabId == null) {
          return errorText('SESSION_NOT_ACTIVE', 'No active session for manifest load.')
        }
        if (typeof driver.injectManifest !== 'function') {
          return errorText('INVALID_COMMAND', 'Driver does not support injectManifest.')
        }
        try {
          await driver.injectManifest(tabId, validation.manifest as AgruneManifest)
        } catch (error) {
          const shape = error as Partial<CommandErrorShape>
          if (shape && typeof shape.code === 'string' && shape.code === 'TAB_NOT_FOUND') {
            return errorText('TAB_NOT_FOUND', shape.message ?? 'Tab not found.', shape.details)
          }
          return errorText('INVALID_COMMAND', error instanceof Error ? error.message : String(error))
        }
        const session = driver.listSessions().find(s => s.tabId === tabId)
        const payload = {
          ok: true,
          session: session
            ? toPublicSessionMeta(session as Session, {
                wasActive: session.active === true,
                becameActive: false,
              })
            : null,
          manifestSource: 'window' as const,
        }
        return { text: JSON.stringify(payload, null, 2) }
      }
      case 'agrune_macro_run': {
        if (tabId == null) {
          return errorText('SESSION_NOT_ACTIVE', 'No active session for macro run.')
        }
        if (typeof driver.runMacro !== 'function') {
          return errorText('INVALID_COMMAND', 'Driver does not support runMacro.')
        }
        const macroId = typeof args.macroId === 'string' ? args.macroId : null
        if (!macroId) {
          return errorText('INVALID_COMMAND', 'agrune_macro_run requires macroId (string).')
        }
        const params = (args.params ?? {}) as Record<string, unknown>

        let response: MacroRunResponse
        try {
          response = await driver.runMacro(tabId, macroId, params)
        } catch (error) {
          const shape = error as Partial<CommandErrorShape>
          if (shape && typeof shape.code === 'string' && shape.code === 'TAB_NOT_FOUND') {
            return errorText('TAB_NOT_FOUND', shape.message ?? 'Tab not found.', shape.details)
          }
          return errorText('INVALID_COMMAND', error instanceof Error ? error.message : String(error))
        }

        // Status → error code 매핑 (per 14-RESEARCH.md Q4)
        switch (response.status) {
          case 'ok':
          case 'already-satisfied':
            return {
              text: JSON.stringify(
                { ok: true, status: response.status, macroId: response.macroId, stepCount: response.stepCount },
                null,
                2,
              ),
            }
          case 'circuit-open':
            return errorText('MACRO_CIRCUIT_OPEN', 'Circuit breaker opened — consecutive failures.', {
              failedStep: response.failedStep,
              macroId,
            })
          case 'precondition-failed':
            return errorText(
              'MACRO_PRECONDITION_FAILED',
              `Macro precondition failed: ${response.reason}`,
              { macroId, reason: response.reason },
            )
          case 'postcondition-failed':
            return errorText(
              'MACRO_POSTCONDITION_FAILED',
              `Macro postcondition failed: ${response.reason}`,
              { macroId, reason: response.reason },
            )
          case 'step-error':
            // macro not found 는 PageAgentRuntime 에서 error="macro not found: xxx" 로 반환 → 매핑
            if (response.stepIndex === -1 && response.error.startsWith('macro not found')) {
              return errorText('MACRO_NOT_FOUND', response.error, { macroId })
            }
            return errorText('INVALID_COMMAND', `Macro step failed: ${response.error}`, {
              macroId,
              stepIndex: response.stepIndex,
              error: response.error,
            })
          case 'target-not-found':
            return errorText(
              'TARGET_NOT_FOUND',
              `Macro target not found at step ${response.stepIndex}: ${response.targetId}`,
              { macroId, stepIndex: response.stepIndex, targetId: response.targetId },
            )
          default: {
            // TypeScript exhaustiveness guard — unknown status → INVALID_COMMAND
            const _exhaustive: never = response
            return errorText('INVALID_COMMAND', `Unknown macro result status.`, { macroId, response: _exhaustive })
          }
        }
      }
      case 'agrune_config': {
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
