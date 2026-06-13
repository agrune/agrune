import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type {
  AgruneRuntimeConfig,
  BrowserDriver,
  CommandErrorShape,
  ConsoleLevel,
  DropData,
  FillFormField,
  FillFormFieldType,
  FillFormFieldValue,
  NetworkRequestPart,
  PageSnapshot,
  ScreenshotImageType,
  Session,
} from '@agrune/core'
import { registerAgruneTools } from './mcp-tools.js'
import type { ToolHandlerResult } from './mcp-tools.js'
import { AgentTargetIdParseError, normalizeAgentTargetId } from './target-id-normalizer.js'
import {
  formatPublicSnapshot,
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
// Public snapshot projection helpers — exposed so token/accuracy benchmarks and
// external tooling can serialize a PageSnapshot exactly as the agent receives it.
export {
  formatPublicSnapshot,
  toPublicSnapshot,
  toPublicSession,
  toPublicSessionMeta,
  toPublicCommandResult,
} from './public-shapes.js'
export type {
  PublicSnapshot,
  PublicSnapshotDocument,
  PublicSnapshotOptions,
  PublicSnapshotGroup,
  PublicSnapshotTarget,
} from './public-shapes.js'

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

    if (!canRunWithoutReadySnapshot(name)) {
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
      case 'browser_tabs': {
        return handleBrowserTabs(driver, args)
      }
      case 'browser_close': {
        return handleBrowserClose(driver)
      }
      case 'browser_navigate': {
        return handleBrowserNavigate(driver, args)
      }
      case 'browser_navigate_back': {
        return handleBrowserNavigateBack(driver)
      }
      case 'browser_resize': {
        return handleBrowserResize(driver, args)
      }
      case 'browser_take_screenshot': {
        return handleBrowserTakeScreenshot(driver, args)
      }
      case 'browser_evaluate': {
        return handleBrowserEvaluate(driver, args)
      }
      case 'browser_run_code_unsafe': {
        return handleBrowserRunCodeUnsafe(driver, args)
      }
      case 'browser_console_messages': {
        return handleBrowserConsoleMessages(driver, args)
      }
      case 'browser_network_requests': {
        return handleBrowserNetworkRequests(driver, args)
      }
      case 'browser_network_request': {
        return handleBrowserNetworkRequest(driver, args)
      }
      case 'browser_press_key': {
        return handleBrowserPressKey(driver, args)
      }
      case 'browser_type': {
        return handleBrowserType(driver, args)
      }
      case 'browser_select_option': {
        return handleBrowserSelectOption(driver, args)
      }
      case 'browser_fill_form': {
        return handleBrowserFillForm(driver, args)
      }
      case 'browser_file_upload': {
        return handleBrowserFileUpload(driver, args)
      }
      case 'browser_drop': {
        return handleBrowserDrop(driver, args)
      }
      case 'browser_handle_dialog': {
        return handleBrowserHandleDialog(driver, args)
      }
      case 'browser_snapshot': {
        return handleBrowserSnapshot(driver, args)
      }
      case 'browser_get_targets': {
        if (tabId == null) return { text: 'No active sessions.', isError: true }
        const snapshot = driver.getSnapshot(tabId)
        if (!snapshot) return { text: `No snapshot available for tab ${tabId}.`, isError: true }
        const payload = {
          ...toPublicSnapshot(snapshot, resolveSnapshotOptions(args)),
          session: buildSessionMeta(driver, tabId, false),
        }
        return { text: formatPublicSnapshot(payload) }
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
        if (name === 'browser_wait_for' && typeof command.time === 'number') {
          command.timeMs = command.time * 1000
          delete command.time
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

function isTabManagementTool(name: string): boolean {
  return name === 'browser_list_tabs' ||
    name === 'browser_open_tab' ||
    name === 'browser_focus_tab' ||
    name === 'browser_tabs' ||
    name === 'browser_close' ||
    name === 'browser_navigate' ||
    name === 'browser_navigate_back' ||
    name === 'browser_resize' ||
    name === 'browser_take_screenshot' ||
    name === 'browser_evaluate' ||
    name === 'browser_run_code_unsafe' ||
    name === 'browser_console_messages' ||
    name === 'browser_network_requests' ||
    name === 'browser_network_request' ||
    name === 'browser_press_key'
}

function canRunWithoutReadySnapshot(name: string): boolean {
  return isTabManagementTool(name) ||
    name === 'browser_update_config' ||
    name === 'browser_handle_dialog'
}

async function handleBrowserTabs(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const action = typeof args.action === 'string' ? args.action : ''

  switch (action) {
    case 'list':
      return { text: JSON.stringify(listIndexedSessions(driver), null, 2) }
    case 'new':
      return openBrowserTab(driver, args.url)
    case 'select':
      return selectBrowserTabByIndex(driver, args.index)
    case 'close':
      return closeBrowserTabByIndex(driver, args.index)
    default:
      return errorText('INVALID_COMMAND', 'browser_tabs requires action: list, new, close, or select.')
  }
}

async function openBrowserTab(
  driver: BrowserDriver,
  url: unknown,
): Promise<ToolHandlerResult> {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return errorText('INVALID_COMMAND', 'browser_tabs action "new" requires url (string).')
  }
  if (typeof driver.openTab !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support openTab.')
  }

  try {
    const opened = await driver.openTab(url)
    const sessions = listIndexedSessions(driver)
    const session = sessions.find(s => s.tabId === opened.tabId)
    const payload = {
      ok: true,
      index: session?.index ?? null,
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
    return commandErrorText(error, 'Failed to open tab.')
  }
}

async function selectBrowserTabByIndex(
  driver: BrowserDriver,
  index: unknown,
): Promise<ToolHandlerResult> {
  const resolved = resolveIndexedSession(driver, index, 'select')
  if (!resolved.ok) return resolved.result

  try {
    const focusResult = await driver.focusSession(resolved.session.tabId)
    const refreshed = driver.listSessions().find(s => s.tabId === resolved.session.tabId) ?? resolved.session
    const sessionMeta = toPublicSessionMeta(refreshed as Session, {
      wasActive: resolved.session.active === true,
      becameActive: focusResult.becameActive && resolved.session.active !== true,
    })
    const payload: Record<string, unknown> = {
      ok: true,
      index: resolved.index,
      session: sessionMeta,
    }
    if (focusResult.cdpFocusError) {
      payload.cdpFocusError = focusResult.cdpFocusError
    }
    return { text: JSON.stringify(payload, null, 2) }
  } catch (error) {
    return commandErrorText(error, 'Failed to select tab.')
  }
}

async function closeBrowserTabByIndex(
  driver: BrowserDriver,
  index: unknown,
): Promise<ToolHandlerResult> {
  if (typeof driver.closeTab !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support closeTab.')
  }

  let tabId: number | undefined
  let resolvedIndex: number | null = null
  if (index !== undefined) {
    const resolved = resolveIndexedSession(driver, index, 'close')
    if (!resolved.ok) return resolved.result
    tabId = resolved.session.tabId
    resolvedIndex = resolved.index
  }

  try {
    const result = await driver.closeTab(tabId)
    return {
      text: JSON.stringify({
        ok: true,
        index: resolvedIndex,
        tabId: result.tabId,
        closed: result.closed,
        remaining: listIndexedSessions(driver),
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to close tab.')
  }
}

async function handleBrowserClose(driver: BrowserDriver): Promise<ToolHandlerResult> {
  if (typeof driver.closeTab !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support closeTab.')
  }

  try {
    const result = await driver.closeTab()
    return {
      text: JSON.stringify({
        ok: true,
        tabId: result.tabId,
        closed: result.closed,
        remaining: listIndexedSessions(driver),
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to close tab.')
  }
}

async function handleBrowserNavigate(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof args.url !== 'string' || args.url.trim().length === 0) {
    return errorText('INVALID_COMMAND', 'browser_navigate requires url (string).')
  }
  if (typeof driver.navigateTab !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support navigateTab.')
  }

  try {
    const result = await driver.navigateTab(undefined, args.url)
    return {
      text: JSON.stringify({
        ok: true,
        action: 'navigate',
        tabId: result.tabId,
        url: result.url,
        title: result.title,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to navigate.')
  }
}

async function handleBrowserNavigateBack(driver: BrowserDriver): Promise<ToolHandlerResult> {
  if (typeof driver.navigateBack !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support navigateBack.')
  }

  try {
    const result = await driver.navigateBack()
    return {
      text: JSON.stringify({
        ok: true,
        action: 'navigateBack',
        tabId: result.tabId,
        url: result.url,
        title: result.title,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to navigate back.')
  }
}

async function handleBrowserResize(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.resizeTab !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support resizeTab.')
  }
  const width = args.width
  const height = args.height
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) <= 0 || (height as number) <= 0) {
    return errorText('INVALID_COMMAND', 'browser_resize requires positive integer width and height.')
  }

  try {
    const result = await driver.resizeTab(undefined, width as number, height as number)
    return {
      text: JSON.stringify({
        ok: true,
        action: 'resize',
        tabId: result.tabId,
        width: result.width,
        height: result.height,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to resize browser.')
  }
}

async function handleBrowserTakeScreenshot(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.screenshotTab !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support screenshotTab.')
  }

  const type = resolveScreenshotType(args.type)
  if (type === 'invalid') {
    return errorText('INVALID_COMMAND', 'browser_take_screenshot type must be one of: png, jpeg.')
  }
  const filename = resolveScreenshotFilename(args.filename, type)
  if (!filename) {
    return errorText('INVALID_COMMAND', 'browser_take_screenshot filename must be a non-empty string.')
  }
  const targetId = typeof args.targetId === 'string' && args.targetId.length > 0 ? args.targetId : undefined
  const fullPage = args.fullPage === true
  if (targetId && fullPage) {
    return errorText('INVALID_COMMAND', 'Element screenshots cannot use fullPage.')
  }

  if (targetId) {
    const readyError = await driver.ensureReady()
    if (readyError) return { text: readyError, isError: true }
  }

  try {
    const result = await driver.screenshotTab(undefined, filename, {
      fullPage,
      ...(targetId ? { targetId } : {}),
      ...(type ? { type } : {}),
    })
    return {
      text: JSON.stringify({
        ok: true,
        action: 'screenshot',
        tabId: result.tabId,
        path: result.path,
        type: result.type,
        fullPage: result.fullPage,
        ...(targetId ? { target: targetId } : {}),
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to take screenshot.')
  }
}

async function handleBrowserEvaluate(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.evaluateTab !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support evaluateTab.')
  }

  const source = args.function
  if (typeof source !== 'string' || source.trim().length === 0) {
    return errorText('INVALID_COMMAND', 'browser_evaluate requires function (string).')
  }
  const filename = resolveEvaluateFilename(args.filename)
  if (filename === false) {
    return errorText('INVALID_COMMAND', 'browser_evaluate filename must be a non-empty string.')
  }

  const targetId = typeof args.targetId === 'string' && args.targetId.length > 0 ? args.targetId : undefined
  if (targetId) {
    const readyError = await driver.ensureReady()
    if (readyError) return { text: readyError, isError: true }
  }

  try {
    const result = await driver.evaluateTab(undefined, source, {
      ...(targetId ? { targetId } : {}),
    })
    const payload: Record<string, unknown> = {
      ok: true,
      action: 'evaluate',
      tabId: result.tabId,
      result: result.result,
      ...(result.undefinedResult ? { undefinedResult: true } : {}),
      ...(targetId ? { target: targetId } : {}),
      session: buildSessionMeta(driver, result.tabId, false) ?? null,
    }

    if (filename) {
      const outputPath = resolve(filename)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, formatEvaluationResultForFile(result.result))
      payload.path = outputPath
    }

    return { text: JSON.stringify(payload, null, 2) }
  } catch (error) {
    return commandErrorText(error, 'Failed to evaluate JavaScript.')
  }
}

async function handleBrowserRunCodeUnsafe(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.runCodeUnsafe !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support browser_run_code_unsafe.')
  }

  const source = await resolveRunCodeUnsafeSource(args)
  if (!source.ok) return source.result

  try {
    const result = await driver.runCodeUnsafe(args.tabId as number | undefined, source.source)
    const payload: Record<string, unknown> = {
      ok: true,
      action: 'run_code_unsafe',
      tabId: result.tabId,
      result: result.result,
      ...(result.undefinedResult ? { undefinedResult: true } : {}),
      ...(source.filename ? { filename: source.filename } : {}),
      session: buildSessionMeta(driver, result.tabId, false) ?? null,
    }
    return { text: JSON.stringify(payload, null, 2) }
  } catch (error) {
    return commandErrorText(error, 'Failed to run Playwright code.')
  }
}

async function handleBrowserConsoleMessages(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.consoleMessages !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support consoleMessages.')
  }

  const level = resolveConsoleLevel(args.level)
  if (level === 'invalid') {
    return errorText('INVALID_COMMAND', 'browser_console_messages level must be one of: debug, info, warning, error.')
  }
  const filename = resolveEvaluateFilename(args.filename)
  if (filename === false) {
    return errorText('INVALID_COMMAND', 'browser_console_messages filename must be a non-empty string.')
  }

  try {
    const messages = driver.consoleMessages(typeof args.tabId === 'number' ? args.tabId : undefined, {
      ...(level ? { level } : {}),
      all: args.all === true,
    })
    const payload: Record<string, unknown> = {
      ok: true,
      action: 'console.messages',
      messages,
    }

    if (filename) {
      const outputPath = resolve(filename)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, `${JSON.stringify(messages, null, 2)}\n`)
      payload.path = outputPath
    }

    return { text: JSON.stringify(payload, null, 2) }
  } catch (error) {
    return commandErrorText(error, 'Failed to read console messages.')
  }
}

async function handleBrowserNetworkRequests(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.networkRequests !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support networkRequests.')
  }

  const filename = resolveEvaluateFilename(args.filename)
  if (filename === false) {
    return errorText('INVALID_COMMAND', 'browser_network_requests filename must be a non-empty string.')
  }

  try {
    const requests = driver.networkRequests(typeof args.tabId === 'number' ? args.tabId : undefined, {
      ...(typeof args.filter === 'string' ? { filter: args.filter } : {}),
      includeStatic: args.static === true,
      all: args.all === true,
    })
    const payload: Record<string, unknown> = {
      ok: true,
      action: 'network.requests',
      requests,
    }
    if (filename) {
      const outputPath = resolve(filename)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, `${JSON.stringify(requests, null, 2)}\n`)
      payload.path = outputPath
    }
    return { text: JSON.stringify(payload, null, 2) }
  } catch (error) {
    return commandErrorText(error, 'Failed to read network requests.')
  }
}

async function handleBrowserNetworkRequest(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.networkRequestDetail !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support networkRequestDetail.')
  }
  if (!Number.isInteger(args.index) || (args.index as number) <= 0) {
    return errorText('INVALID_COMMAND', 'browser_network_request requires a positive integer index.')
  }
  const part = resolveNetworkRequestPart(args.part)
  if (part === 'invalid') {
    return errorText('INVALID_COMMAND', 'browser_network_request part must be one of: request-headers, request-body, response-headers, response-body.')
  }
  const filename = resolveEvaluateFilename(args.filename)
  if (filename === false) {
    return errorText('INVALID_COMMAND', 'browser_network_request filename must be a non-empty string.')
  }

  try {
    const detail = await driver.networkRequestDetail(
      typeof args.tabId === 'number' ? args.tabId : undefined,
      args.index as number,
      part,
    )
    const payload: Record<string, unknown> = {
      ok: true,
      action: 'network.request',
      ...detail,
    }
    if (filename) {
      const outputPath = resolve(filename)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, `${JSON.stringify(detail, null, 2)}\n`)
      payload.path = outputPath
    }
    return { text: JSON.stringify(payload, null, 2) }
  } catch (error) {
    return commandErrorText(error, 'Failed to read network request.')
  }
}

async function handleBrowserPressKey(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.pressKey !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support pressKey.')
  }
  if (typeof args.key !== 'string' || args.key.length === 0) {
    return errorText('INVALID_COMMAND', 'browser_press_key requires key (string).')
  }

  try {
    const result = await driver.pressKey(
      typeof args.tabId === 'number' ? args.tabId : undefined,
      args.key,
    )
    return {
      text: JSON.stringify({
        ok: true,
        action: 'press',
        tabId: result.tabId,
        key: result.key,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to press key.')
  }
}

async function handleBrowserType(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.typeText !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support typeText.')
  }
  if (typeof args.targetId !== 'string' || args.targetId.length === 0) {
    return errorText('INVALID_TARGET', 'browser_type requires target.')
  }
  if (typeof args.text !== 'string' || args.text.length === 0) {
    return errorText('INVALID_COMMAND', 'browser_type requires text (string).')
  }

  try {
    const result = await driver.typeText(
      typeof args.tabId === 'number' ? args.tabId : undefined,
      args.targetId,
      args.text,
      {
        slowly: args.slowly === true,
        submit: args.submit === true,
      },
    )
    return {
      text: JSON.stringify({
        ok: true,
        action: 'type',
        tabId: result.tabId,
        target: result.targetId,
        text: result.text,
        submitted: result.submitted,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to type text.')
  }
}

async function handleBrowserSelectOption(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.selectOptions !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support selectOptions.')
  }
  if (typeof args.targetId !== 'string' || args.targetId.length === 0) {
    return errorText('INVALID_TARGET', 'browser_select_option requires target.')
  }
  if (!Array.isArray(args.values) || args.values.length === 0 || args.values.some(value => typeof value !== 'string')) {
    return errorText('INVALID_COMMAND', 'browser_select_option requires non-empty string values.')
  }

  try {
    const result = await driver.selectOptions(
      typeof args.tabId === 'number' ? args.tabId : undefined,
      args.targetId,
      args.values,
    )
    return {
      text: JSON.stringify({
        ok: true,
        action: 'select',
        tabId: result.tabId,
        target: result.targetId,
        values: result.values,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to select option.')
  }
}

async function handleBrowserFillForm(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.fillForm !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support fillForm.')
  }

  const fields = parseFillFormFields(args.fields)
  if (!fields.ok) return fields.result

  try {
    const result = await driver.fillForm(
      typeof args.tabId === 'number' ? args.tabId : undefined,
      fields.fields,
    )
    return {
      text: JSON.stringify({
        ok: true,
        action: 'fill-form',
        tabId: result.tabId,
        fields: result.fields.map(field => ({
          ...(field.name ? { name: field.name } : {}),
          target: field.targetId,
          type: field.type,
        })),
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to fill form.')
  }
}

function parseFillFormFields(value: unknown): { ok: true; fields: FillFormField[] } | { ok: false; result: ToolHandlerResult } {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false,
      result: errorText('INVALID_COMMAND', 'browser_fill_form requires a non-empty fields array.'),
    }
  }

  const fields: FillFormField[] = []
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        ok: false,
        result: errorText('INVALID_COMMAND', `browser_fill_form field ${index} must be an object.`),
      }
    }
    const field = raw as Record<string, unknown>
    if (field.name !== undefined && typeof field.name !== 'string') {
      return {
        ok: false,
        result: errorText('INVALID_COMMAND', `browser_fill_form field ${index} name must be a string.`),
      }
    }
    if (typeof field.targetId !== 'string' || field.targetId.length === 0) {
      return {
        ok: false,
        result: errorText('INVALID_TARGET', `browser_fill_form field ${index} requires target.`),
      }
    }
    if (!isFillFormFieldType(field.type)) {
      return {
        ok: false,
        result: errorText('INVALID_COMMAND', `browser_fill_form field ${index} type must be one of: textbox, checkbox, radio, combobox, slider.`),
      }
    }
    if (!isFillFormFieldValue(field.value)) {
      return {
        ok: false,
        result: errorText('INVALID_COMMAND', `browser_fill_form field ${index} value must be a string, boolean, or number.`),
      }
    }
    fields.push({
      ...(typeof field.name === 'string' ? { name: field.name } : {}),
      targetId: field.targetId,
      type: field.type,
      value: field.value,
    })
  }

  return { ok: true, fields }
}

function isFillFormFieldType(value: unknown): value is FillFormFieldType {
  return value === 'textbox' ||
    value === 'checkbox' ||
    value === 'radio' ||
    value === 'combobox' ||
    value === 'slider'
}

function isFillFormFieldValue(value: unknown): value is FillFormFieldValue {
  return typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number'
}

async function handleBrowserFileUpload(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.fileUpload !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support fileUpload.')
  }
  if (args.paths !== undefined && (!Array.isArray(args.paths) || args.paths.some(path => typeof path !== 'string'))) {
    return errorText('INVALID_COMMAND', 'browser_file_upload paths must be an array of strings.')
  }

  try {
    const result = await driver.fileUpload(
      typeof args.tabId === 'number' ? args.tabId : undefined,
      Array.isArray(args.paths) ? args.paths : [],
    )
    return {
      text: JSON.stringify({
        ok: true,
        action: 'file-upload',
        tabId: result.tabId,
        paths: result.paths,
        cancelled: result.cancelled,
        fileChooser: result.fileChooser,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to upload files.')
  }
}

async function handleBrowserDrop(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.drop !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support drop.')
  }
  if (typeof args.targetId !== 'string' || args.targetId.length === 0) {
    return errorText('INVALID_TARGET', 'browser_drop requires target.')
  }
  const data = parseDropData(args.data)
  if (!data.ok) return data.result
  if (args.paths !== undefined && (!Array.isArray(args.paths) || args.paths.some(path => typeof path !== 'string'))) {
    return errorText('INVALID_COMMAND', 'browser_drop paths must be an array of strings.')
  }
  const paths = Array.isArray(args.paths) ? args.paths : []
  if (Object.keys(data.data).length === 0 && paths.length === 0) {
    return errorText('INVALID_COMMAND', 'browser_drop requires at least one of: data, paths.')
  }

  try {
    const result = await driver.drop(
      typeof args.tabId === 'number' ? args.tabId : undefined,
      args.targetId,
      data.data,
      paths,
    )
    return {
      text: JSON.stringify({
        ok: true,
        action: 'drop',
        tabId: result.tabId,
        target: result.targetId,
        paths: result.paths,
        dataTypes: result.dataTypes,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to drop data.')
  }
}

function parseDropData(value: unknown): { ok: true; data: DropData } | { ok: false; result: ToolHandlerResult } {
  if (value === undefined) return { ok: true, data: {} }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      result: errorText('INVALID_COMMAND', 'browser_drop data must be an object with string values.'),
    }
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    if (typeof item !== 'string') {
      return {
        ok: false,
        result: errorText('INVALID_COMMAND', 'browser_drop data must be an object with string values.'),
      }
    }
  }
  return { ok: true, data: value as DropData }
}

async function handleBrowserHandleDialog(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (typeof driver.handleDialog !== 'function') {
    return errorText('INVALID_COMMAND', 'Driver does not support handleDialog.')
  }
  if (typeof args.accept !== 'boolean') {
    return errorText('INVALID_COMMAND', 'browser_handle_dialog requires accept (boolean).')
  }
  if (args.promptText !== undefined && typeof args.promptText !== 'string') {
    return errorText('INVALID_COMMAND', 'browser_handle_dialog promptText must be a string.')
  }

  try {
    const result = await driver.handleDialog(
      typeof args.tabId === 'number' ? args.tabId : undefined,
      {
        accept: args.accept,
        ...(typeof args.promptText === 'string' ? { promptText: args.promptText } : {}),
      },
    )
    return {
      text: JSON.stringify({
        ok: true,
        action: 'dialog.handle',
        tabId: result.tabId,
        armed: result.armed,
        dialog: result.dialog,
        session: buildSessionMeta(driver, result.tabId, false) ?? null,
      }, null, 2),
    }
  } catch (error) {
    return commandErrorText(error, 'Failed to handle dialog.')
  }
}

async function handleBrowserSnapshot(
  driver: BrowserDriver,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const tabId = driver.resolveTabId(args.tabId as number | undefined)
  if (tabId == null) return { text: 'No active sessions.', isError: true }

  const snapshot = driver.getSnapshot(tabId)
  if (!snapshot) return { text: `No snapshot available for tab ${tabId}.`, isError: true }

  const targetIdResult = snapshotTargetIdArg(args)
  if (targetIdResult && typeof targetIdResult !== 'string') return targetIdResult
  const targetId = typeof targetIdResult === 'string' ? targetIdResult : undefined

  let scopedSnapshot = snapshot
  if (targetId) {
    const scoped = snapshotForTarget(snapshot, targetId)
    if (!scoped) {
      return errorText('TARGET_NOT_FOUND', `target not found: ${targetId}`, { target: targetId, targetId })
    }
    scopedSnapshot = scoped
  }

  const payload = {
    ...toPublicSnapshot(scopedSnapshot, {
      mode: 'full',
      ...(args.includeTextContent === true ? { includeTextContent: true } : {}),
    }),
    session: buildSessionMeta(driver, tabId, false),
  }
  const text = formatPublicSnapshot(payload)
  const filename = resolveEvaluateFilename(args.filename)
  if (filename === false) {
    return errorText('INVALID_COMMAND', 'browser_snapshot filename must be a non-empty string.')
  }
  if (filename) {
    const outputPath = resolve(filename)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, text)
    return {
      text: JSON.stringify({
        ok: true,
        action: 'snapshot',
        tabId,
        path: outputPath,
        session: buildSessionMeta(driver, tabId, false) ?? null,
      }, null, 2),
    }
  }

  return { text }
}

function snapshotTargetIdArg(args: Record<string, unknown>): string | undefined | ToolHandlerResult {
  const raw = typeof args.target === 'string' && args.target.length > 0
    ? args.target
    : typeof args.targetId === 'string' && args.targetId.length > 0
      ? args.targetId
      : undefined
  if (!raw) return undefined
  try {
    return normalizeAgentTargetId(raw)
  } catch (error) {
    if (error instanceof AgentTargetIdParseError) {
      return errorText('INVALID_TARGET', error.message, { target: raw })
    }
    throw error
  }
}

function snapshotForTarget(snapshot: PageSnapshot, targetId: string): PageSnapshot | null {
  const target = snapshot.targets.find(candidate => candidate.targetId === targetId)
  if (!target) return null
  return {
    ...snapshot,
    groups: snapshot.groups.filter(group => group.groupId === target.groupId),
    targets: [target],
  }
}

function listIndexedSessions(driver: BrowserDriver) {
  return driver.listSessions().map((session, index) => ({
    index,
    ...toPublicSession(session as Session),
  }))
}

function resolveScreenshotType(value: unknown): ScreenshotImageType | 'invalid' | undefined {
  if (value === undefined) return undefined
  if (value === 'png' || value === 'jpeg') return value
  return 'invalid'
}

function resolveScreenshotFilename(value: unknown, type?: ScreenshotImageType): string | null {
  if (value === undefined) return defaultScreenshotFilename(type)
  if (typeof value === 'string' && value.trim().length > 0) return value
  return null
}

function defaultScreenshotFilename(type?: ScreenshotImageType): string {
  const suffix = type === 'jpeg' ? 'jpg' : 'png'
  return `.agrune/runs/${new Date().toISOString().replace(/[:.]/g, '-')}/screenshot.${suffix}`
}

function resolveEvaluateFilename(value: unknown): string | false | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string' && value.trim().length > 0) return value
  return false
}

async function resolveRunCodeUnsafeSource(
  args: Record<string, unknown>,
): Promise<{ ok: true; source: string; filename?: string } | { ok: false; result: ToolHandlerResult }> {
  if (args.filename !== undefined) {
    if (typeof args.filename !== 'string' || args.filename.trim().length === 0) {
      return { ok: false, result: errorText('INVALID_COMMAND', 'browser_run_code_unsafe filename must be a non-empty string.') }
    }
    const filename = resolve(args.filename)
    try {
      return { ok: true, source: await readFile(filename, 'utf8'), filename }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, result: errorText('INVALID_COMMAND', `Failed to read browser_run_code_unsafe filename: ${message}`) }
    }
  }

  if (typeof args.code !== 'string' || args.code.trim().length === 0) {
    return { ok: false, result: errorText('INVALID_COMMAND', 'browser_run_code_unsafe requires code or filename.') }
  }

  return { ok: true, source: args.code }
}

function resolveConsoleLevel(value: unknown): ConsoleLevel | 'invalid' | undefined {
  if (value === undefined) return undefined
  if (value === 'debug' || value === 'info' || value === 'warning' || value === 'error') return value
  return 'invalid'
}

function resolveNetworkRequestPart(value: unknown): NetworkRequestPart | 'invalid' | undefined {
  if (value === undefined) return undefined
  if (
    value === 'request-headers' ||
    value === 'request-body' ||
    value === 'response-headers' ||
    value === 'response-body'
  ) {
    return value
  }
  return 'invalid'
}

function formatEvaluationResultForFile(result: unknown): string {
  if (typeof result === 'string') return result
  return `${JSON.stringify(result, null, 2)}\n`
}

function resolveIndexedSession(
  driver: BrowserDriver,
  index: unknown,
  action: 'select' | 'close',
): { ok: true; index: number; session: ReturnType<BrowserDriver['listSessions']>[number] } | { ok: false; result: ToolHandlerResult } {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    return {
      ok: false,
      result: errorText('TAB_NOT_FOUND', `browser_tabs action "${action}" requires a valid tab index.`),
    }
  }

  const sessions = driver.listSessions()
  const session = sessions[index]
  if (!session) {
    return {
      ok: false,
      result: errorText('TAB_NOT_FOUND', `No tab exists at index ${index}.`, { index }),
    }
  }

  return { ok: true, index, session }
}

function commandErrorText(error: unknown, fallbackMessage: string): ToolHandlerResult {
  const shape = error as Partial<CommandErrorShape>
  if (shape && typeof shape.code === 'string') {
    return errorText(shape.code, shape.message ?? fallbackMessage, shape.details)
  }
  return errorText('INVALID_COMMAND', error instanceof Error ? error.message : String(error))
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
