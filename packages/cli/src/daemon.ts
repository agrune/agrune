import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { PlaywrightSession } from '@agrune/backend'
import { CliError, errorResponse } from './errors.js'
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from './types.js'
import type { ClickButton, ClickModifier, DaemonOptions, FillFormField, FillFormFieldType, JsonResponse, NetworkRequestPart } from './types.js'
import type { FillStrategy } from '@agrune/core'
import { DaemonEventBroker } from './events.js'
import { filterSnapshot } from '@agrune/backend'
import { removeSocketFile, socketFileExists } from './session-file.js'

type TabSelector = { tabId: number; index?: number }

export interface RunningDaemon {
  /** Human-readable endpoint: `http://host:port` (TCP) or the socket path. */
  url: string
  /** `unix:<socketPath>` or `http://host:port` — token consumed by daemon-client. */
  endpoint: string
  close(): Promise<void>
}

export async function startDaemon(options: DaemonOptions = {}): Promise<RunningDaemon> {
  const host = options.host ?? DEFAULT_DAEMON_HOST
  const port = options.port ?? DEFAULT_DAEMON_PORT
  const session = new PlaywrightSession({ headless: options.headless })
  const eventBroker = new DaemonEventBroker()
  await session.start()

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`)
    const method = req.method ?? 'GET'
    const shouldTrack = shouldTrackRequest(method, url)
    const id = eventBroker.nextId()
    const start = Date.now()
    if (shouldTrack) {
      const tabId = optionalNumber(url.searchParams.get('tabId')) ?? null
      eventBroker.emit({
        id,
        ts: start,
        sessionId: tabId,
        tool: toolNameFor(method, url.pathname),
        method,
        path: url.pathname,
        command: `${method} ${url.pathname}`,
        phase: 'start',
        tabId,
        args: safeEventArgs(method, url),
      })
    }

    try {
      const result = await routeRequest(method, url, req, session, eventBroker)
      if (shouldTrack) {
        const tabId = optionalNumber(url.searchParams.get('tabId')) ?? null
        eventBroker.emit({
          id,
          ts: Date.now(),
          sessionId: tabId,
          tool: toolNameFor(method, url.pathname),
          method,
          path: url.pathname,
          command: `${method} ${url.pathname}`,
          phase: 'end',
          durationMs: Date.now() - start,
          tabId,
          args: safeEventArgs(method, url),
        })
      }
      sendJson(res, 200, result)
    } catch (error) {
      if (shouldTrack) {
        const payload = errorResponse(error)
        const tabId = optionalNumber(url.searchParams.get('tabId')) ?? null
        eventBroker.emit({
          id,
          ts: Date.now(),
          sessionId: tabId,
          tool: toolNameFor(method, url.pathname),
          method,
          path: url.pathname,
          command: `${method} ${url.pathname}`,
          phase: 'error',
          durationMs: Date.now() - start,
          tabId,
          args: safeEventArgs(method, url),
          error: payload.error,
        })
      }
      sendJson(res, 400, errorResponse(error))
    }
  })

  const socketPath = options.socketPath
  if (socketPath && socketFileExists(socketPath)) {
    // Stale socket from a crashed daemon would make listen() fail with EADDRINUSE.
    removeSocketFile(socketPath)
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    if (socketPath) {
      server.listen(socketPath, () => {
        server.off('error', reject)
        resolve()
      })
    } else {
      server.listen(port, host, () => {
        server.off('error', reject)
        resolve()
      })
    }
  })

  if (socketPath) {
    return {
      url: socketPath,
      endpoint: `unix:${socketPath}`,
      async close() {
        await new Promise<void>(resolve => server.close(() => resolve()))
        removeSocketFile(socketPath)
        await session.stop()
      },
    }
  }

  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port

  return {
    url: `http://${host}:${actualPort}`,
    endpoint: `http://${host}:${actualPort}`,
    async close() {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await session.stop()
    },
  }
}

async function routeRequest(
  method: string,
  url: URL,
  req: http.IncomingMessage,
  session: PlaywrightSession,
  eventBroker: DaemonEventBroker,
): Promise<JsonResponse> {
  if (method === 'GET' && url.pathname === '/health') {
    return {
      ok: true,
      name: 'agrune-daemon',
      browser: 'playwright',
      tabs: session.listTabs().length,
    }
  }

  if (method === 'GET' && url.pathname === '/tabs') {
    return { ok: true, tabs: session.listTabs() }
  }

  if (method === 'GET' && url.pathname === '/events/history') {
    return { ok: true, events: eventBroker.getBuffered() }
  }

  if (method === 'POST' && (url.pathname === '/open' || url.pathname === '/tabs/new')) {
    const body = await readJsonBody(req)
    const urlValue = requireString(body, 'url')
    const tab = await session.open(urlValue)
    return { ok: true, index: tab.index, tab }
  }

  if (method === 'POST' && url.pathname === '/navigate') {
    const body = await readJsonBody(req)
    const urlValue = requireString(body, 'url')
    return { ok: true, action: 'navigate', tab: await session.navigate(optionalNumber(body.tabId), urlValue) }
  }

  if (method === 'POST' && url.pathname === '/back') {
    const body = await readJsonBody(req)
    return { ok: true, action: 'back', tab: await session.back(optionalNumber(body.tabId)) }
  }

  if (method === 'POST' && url.pathname === '/forward') {
    const body = await readJsonBody(req)
    return { ok: true, action: 'forward', tab: await session.forward(optionalNumber(body.tabId)) }
  }

  if (method === 'POST' && url.pathname === '/reload') {
    const body = await readJsonBody(req)
    return { ok: true, action: 'reload', tab: await session.reload(optionalNumber(body.tabId)) }
  }

  if (method === 'POST' && url.pathname === '/resize') {
    const body = await readJsonBody(req)
    const size = await session.resize(
      optionalNumber(body.tabId),
      requirePositiveInteger(body, 'width'),
      requirePositiveInteger(body, 'height'),
    )
    return { ok: true, action: 'resize', ...size }
  }

  if (method === 'POST' && url.pathname === '/evaluate') {
    const body = await readJsonBody(req)
    const source = requireString(body, 'source')
    const target = optionalString(body.target)
    const filename = optionalOutputFilename(body.filename, 'evaluate')
    const result = await session.evaluate(optionalNumber(body.tabId), source, body.arg, target)
    const path = filename ? await writeOutputFile(filename, formatEvaluationResultForFile(result)) : undefined
    return {
      ok: true,
      action: 'evaluate',
      ...(target ? { target } : {}),
      result: result === undefined ? null : result,
      ...(result === undefined ? { undefinedResult: true } : {}),
      ...(path ? { path } : {}),
    }
  }

  if (method === 'POST' && (url.pathname === '/run-code-unsafe' || url.pathname === '/run-code')) {
    const body = await readJsonBody(req)
    const source = await resolveRunCodeUnsafeSource(body)
    const result = await session.runCodeUnsafe(optionalNumber(body.tabId), source.source)
    return {
      ok: true,
      action: 'run-code-unsafe',
      result: result === undefined ? null : result,
      ...(result === undefined ? { undefinedResult: true } : {}),
      ...(source.filename ? { filename: source.filename } : {}),
    }
  }

  if (method === 'GET' && url.pathname === '/console') {
    const filename = optionalOutputFilename(url.searchParams.get('filename') ?? undefined, 'console')
    const messages = session.consoleMessages(
      optionalNumber(url.searchParams.get('tabId')),
      {
        level: optionalConsoleLevel(url.searchParams.get('level')),
        all: optionalBoolean(url.searchParams.get('all')),
      },
    )
    const path = filename ? await writeOutputFile(filename, `${JSON.stringify(messages, null, 2)}\n`) : undefined
    return {
      ok: true,
      messages,
      ...(path ? { path } : {}),
    }
  }

  if (method === 'GET' && url.pathname === '/network') {
    const filename = optionalOutputFilename(url.searchParams.get('filename') ?? undefined, 'network')
    const requests = session.networkRequests(
      optionalNumber(url.searchParams.get('tabId')),
      {
        filter: optionalString(url.searchParams.get('filter')),
        includeStatic: optionalBoolean(url.searchParams.get('static')) === true,
        all: optionalBoolean(url.searchParams.get('all')) === true,
      },
    )
    const path = filename ? await writeOutputFile(filename, `${JSON.stringify(requests, null, 2)}\n`) : undefined
    return {
      ok: true,
      requests,
      ...(path ? { path } : {}),
    }
  }

  if (method === 'GET' && url.pathname === '/dialogs') {
    return {
      ok: true,
      dialogs: session.dialogs(optionalNumber(url.searchParams.get('tabId'))),
    }
  }

  if (method === 'GET' && url.pathname === '/file-choosers') {
    return {
      ok: true,
      fileChoosers: session.fileChoosers(optionalNumber(url.searchParams.get('tabId'))),
    }
  }

  if (method === 'POST' && (url.pathname === '/dialog/handle' || url.pathname === '/dialog')) {
    const body = await readJsonBody(req)
    return {
      ok: true,
      action: 'dialog.handle',
      ...await session.handleDialog(
        optionalNumber(body.tabId),
        {
          accept: requireBoolean(body, 'accept'),
          promptText: optionalString(body.promptText),
        },
      ),
    }
  }

  if (method === 'POST' && (url.pathname === '/file-upload' || url.pathname === '/filechooser/upload')) {
    const body = await readJsonBody(req)
    const result = await session.uploadToFileChooser(
      optionalNumber(body.tabId),
      optionalStringArray(body.paths) ?? [],
    )
    return { ok: true, action: 'file-upload', ...result }
  }

  if (method === 'GET' && url.pathname === '/network/request') {
    const index = requirePositiveInteger({ index: url.searchParams.get('index') }, 'index')
    const filename = optionalOutputFilename(url.searchParams.get('filename') ?? undefined, 'network request')
    const detail = await session.networkRequestDetail(
      optionalNumber(url.searchParams.get('tabId')),
      index,
      optionalNetworkRequestPart(url.searchParams.get('part')),
    )
    const path = filename ? await writeOutputFile(filename, `${JSON.stringify(detail, null, 2)}\n`) : undefined
    return {
      ok: true,
      ...detail,
      ...(path ? { path } : {}),
    }
  }

  if (method === 'POST' && (url.pathname === '/tabs/focus' || url.pathname === '/tabs/select')) {
    const body = await readJsonBody(req)
    const selector = requireTabSelector(body, session, 'select')
    const tab = await session.focus(selector.tabId)
    return { ok: true, index: selector.index ?? tab.index, tab }
  }

  if (method === 'POST' && (url.pathname === '/tabs/close' || url.pathname === '/close')) {
    const body = await readJsonBody(req)
    const selector = optionalTabSelector(body, session, 'close')
    const closed = await session.close(selector?.tabId)
    return { ok: true, ...(selector ? { index: selector.index ?? null } : {}), ...closed }
  }

  if (method === 'GET' && url.pathname === '/targets') {
    const tabId = optionalNumber(url.searchParams.get('tabId'))
    const target = optionalString(url.searchParams.get('target'))
    const groupId = optionalString(url.searchParams.get('groupId'))
    const groupIds = groupIdsFromSearchParams(url.searchParams)
    const snapshot = filterSnapshot(await session.snapshot(tabId), {
      targetRef: target,
      groupId,
      groupIds,
    })
    return { ok: true, snapshot }
  }

  if (method === 'GET' && url.pathname === '/snapshot') {
    const tabId = optionalNumber(url.searchParams.get('tabId'))
    const target = optionalString(url.searchParams.get('target'))
    const depth = optionalPositiveInteger(url.searchParams.get('depth'), 'depth')
    const mode = optionalAriaSnapshotMode(url.searchParams.get('mode')) ?? 'ai'
    const filename = optionalOutputFilename(url.searchParams.get('filename') ?? undefined, 'snapshot')
    const boxes = optionalBoolean(url.searchParams.get('boxes'))
    const includeTextContent = optionalBoolean(url.searchParams.get('includeTextContent'))
    const text = await session.ariaSnapshot(tabId, { targetRef: target, depth, mode })
    const path = filename ? await writeOutputFile(filename, text) : undefined
    return {
      ok: true,
      text,
      mode,
      ...(target ? { target } : {}),
      ...(typeof depth === 'number' ? { depth } : {}),
      ...(path ? { path } : {}),
      ...(typeof boxes === 'boolean' ? { boxes } : {}),
      ...(typeof includeTextContent === 'boolean' ? { includeTextContent } : {}),
    }
  }

  if (method === 'POST' && url.pathname === '/click') {
    const body = await readJsonBody(req)
    const target = requireString(body, 'target')
    const action = optionalString(body.action) ?? 'click'
    const button = optionalClickButton(body.button)
    const modifiers = optionalClickModifiers(body.modifiers)
    const doubleClick = body.doubleClick === true
    if (action === 'contextmenu' && button !== undefined && button !== 'right') {
      throw new Error('right-click only supports button: right')
    }
    const effectiveButton = action === 'contextmenu' ? 'right' : button
    const result = await session.click(
      optionalNumber(body.tabId),
      target,
      doubleClick && action === 'click' ? 'click' : action,
      { button: effectiveButton, modifiers, doubleClick },
    )
    return {
      ok: true,
      target,
      action: doubleClick && action === 'click' ? 'dblclick' : action,
      ...(effectiveButton ? { button: effectiveButton } : {}),
      ...(modifiers ? { modifiers } : {}),
      ...(result.dialog ? { dialog: result.dialog } : {}),
      ...(result.fileChooser ? { fileChooser: result.fileChooser } : {}),
    }
  }

  if (method === 'POST' && url.pathname === '/fill') {
    const body = await readJsonBody(req)
    const target = requireString(body, 'target')
    const value = requireString(body, 'value')
    const strategy = optionalFillStrategy(body.strategy)
    const appliedStrategy = await session.fill(optionalNumber(body.tabId), target, value, body.clear !== false, strategy)
    return { ok: true, target, value, strategy: appliedStrategy }
  }

  if (method === 'POST' && url.pathname === '/fill-form') {
    const body = await readJsonBody(req)
    const fields = fillFormFieldsFromBody(body)
    await session.fillForm(optionalNumber(body.tabId), fields)
    return {
      ok: true,
      action: 'fill-form',
      fields: fields.map(field => ({
        ...(field.name ? { name: field.name } : {}),
        target: field.target,
        type: field.type,
      })),
    }
  }

  if (method === 'POST' && url.pathname === '/type') {
    const body = await readJsonBody(req)
    const target = requireString(body, 'target')
    const text = requireString(body, 'text')
    await session.type(
      optionalNumber(body.tabId),
      target,
      text,
      optionalDelayMs(body.delayMs),
      body.submit === true,
    )
    return { ok: true, target, action: 'type', text }
  }

  if (method === 'POST' && url.pathname === '/press') {
    const body = await readJsonBody(req)
    const key = requireString(body, 'key')
    const target = optionalString(body.target)
    await session.press(optionalNumber(body.tabId), key, target, optionalDelayMs(body.delayMs))
    return { ok: true, action: 'press', key, ...(target ? { target } : {}) }
  }

  if (method === 'POST' && url.pathname === '/select') {
    const body = await readJsonBody(req)
    const target = requireString(body, 'target')
    const selected = await session.select(
      optionalNumber(body.tabId),
      target,
      selectOptionsFromBody(body),
    )
    return { ok: true, target, action: 'select', values: selected }
  }

  if (method === 'POST' && url.pathname === '/upload') {
    const body = await readJsonBody(req)
    const target = requireString(body, 'target')
    const paths = await session.upload(optionalNumber(body.tabId), target, requireStringArray(body, 'paths'))
    return { ok: true, target, action: 'upload', paths }
  }

  if (method === 'POST' && url.pathname === '/drop') {
    const body = await readJsonBody(req)
    const target = requireString(body, 'target')
    const data = optionalStringRecord(body.data) ?? {}
    const paths = optionalStringArray(body.paths) ?? []
    if (Object.keys(data).length === 0 && paths.length === 0) {
      throw new Error('drop requires at least one of: data, paths')
    }
    const result = await session.drop(optionalNumber(body.tabId), target, data, paths)
    return { ok: true, target, action: 'drop', ...result }
  }

  if (method === 'POST' && url.pathname === '/drag') {
    const body = await readJsonBody(req)
    const startTarget = requireString(body, 'startTarget')
    const endTarget = requireString(body, 'endTarget')
    await session.drag(optionalNumber(body.tabId), startTarget, endTarget)
    return { ok: true, target: startTarget, action: 'drag' }
  }

  if (method === 'GET' && url.pathname === '/read') {
    return { ok: true, text: await session.read(optionalNumber(url.searchParams.get('tabId'))) }
  }

  if (method === 'POST' && url.pathname === '/wait') {
    const body = await readJsonBody(req)
    const request = waitRequestFromBody(body)
    if (request.kind === 'target') {
      await session.waitForTarget(request.tabId, request.target, request.state, request.timeoutMs)
      return { ok: true, target: request.target, action: `wait:${request.state}` }
    }
    if (request.kind === 'text') {
      await session.waitForText(request.tabId, request.text, 'visible', request.timeoutMs)
      return { ok: true, text: request.text, action: 'wait:text' }
    }
    if (request.kind === 'textGone') {
      await session.waitForText(request.tabId, request.text, 'hidden', request.timeoutMs)
      return { ok: true, text: request.text, action: 'wait:textGone' }
    }
    await session.waitForTime(request.tabId, request.timeMs)
    return { ok: true, timeMs: request.timeMs, action: 'wait:time' }
  }

  if (method === 'POST' && url.pathname === '/screenshot') {
    const body = await readJsonBody(req)
    const path = requireString(body, 'path')
    const target = optionalString(body.target)
    const type = optionalScreenshotType(body.type)
    const fullPage = body.fullPage === true
    const saved = await session.screenshot(
      optionalNumber(body.tabId),
      path,
      {
        fullPage,
        targetRef: target,
        type,
      },
    )
    return {
      ok: true,
      path: saved,
      type: type ?? screenshotTypeFromPath(saved),
      fullPage,
      ...(target ? { target } : {}),
    }
  }

  throw new Error(`Unknown endpoint: ${method} ${url.pathname}`)
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function shouldTrackRequest(method: string, url: URL): boolean {
  if (method === 'GET' && url.pathname === '/health') return false
  if (method === 'GET' && url.pathname === '/events/history') return false
  return true
}

function toolNameFor(method: string, path: string): string {
  if (method === 'POST' && path === '/open') return 'open'
  if (method === 'POST' && path === '/tabs/new') return 'tabs.new'
  if (method === 'POST' && path === '/navigate') return 'navigate'
  if (method === 'POST' && path === '/back') return 'back'
  if (method === 'POST' && path === '/forward') return 'forward'
  if (method === 'POST' && path === '/reload') return 'reload'
  if (method === 'POST' && path === '/resize') return 'resize'
  if (method === 'POST' && path === '/evaluate') return 'evaluate'
  if (method === 'POST' && (path === '/run-code-unsafe' || path === '/run-code')) return 'run-code-unsafe'
  if (method === 'GET' && path === '/console') return 'console'
  if (method === 'GET' && path === '/network') return 'network.list'
  if (method === 'GET' && path === '/network/request') return 'network.request'
  if (method === 'GET' && path === '/dialogs') return 'dialogs'
  if (method === 'GET' && path === '/file-choosers') return 'file-choosers'
  if (method === 'POST' && (path === '/dialog/handle' || path === '/dialog')) return 'dialog.handle'
  if (method === 'POST' && (path === '/file-upload' || path === '/filechooser/upload')) return 'file-upload'
  if (method === 'GET' && path === '/tabs') return 'tabs.list'
  if (method === 'POST' && path === '/tabs/focus') return 'tabs.focus'
  if (method === 'POST' && path === '/tabs/select') return 'tabs.select'
  if (method === 'POST' && path === '/tabs/close') return 'tabs.close'
  if (method === 'POST' && path === '/close') return 'close'
  if (method === 'GET' && path === '/targets') return 'targets'
  if (method === 'GET' && path === '/snapshot') return 'snapshot'
  if (method === 'POST' && path === '/click') return 'click'
  if (method === 'POST' && path === '/fill') return 'fill'
  if (method === 'POST' && path === '/fill-form') return 'fill-form'
  if (method === 'POST' && path === '/type') return 'type'
  if (method === 'POST' && path === '/press') return 'press'
  if (method === 'POST' && path === '/select') return 'select'
  if (method === 'POST' && path === '/upload') return 'upload'
  if (method === 'POST' && path === '/drop') return 'drop'
  if (method === 'POST' && path === '/drag') return 'drag'
  if (method === 'GET' && path === '/read') return 'read'
  if (method === 'POST' && path === '/wait') return 'wait'
  if (method === 'POST' && path === '/screenshot') return 'screenshot'
  return `${method} ${path}`
}

function safeEventArgs(method: string, url: URL): Record<string, unknown> | undefined {
  const args: Record<string, unknown> = {}
  const tabId = optionalNumber(url.searchParams.get('tabId'))
  if (typeof tabId === 'number') args.tabId = tabId
  const level = url.searchParams.get('level')
  if (level) args.level = level
  if (url.searchParams.get('all') === 'true') args.all = true
  const filter = url.searchParams.get('filter')
  if (filter) args.filter = filter
  if (url.searchParams.get('static') === 'true') args.static = true
  const index = optionalNumber(url.searchParams.get('index'))
  if (typeof index === 'number') args.index = index
  const part = url.searchParams.get('part')
  if (part) args.part = part
  const target = url.searchParams.get('target')
  if (target) args.target = target
  const filename = url.searchParams.get('filename')
  if (filename) args.filename = filename
  const depth = optionalNumber(url.searchParams.get('depth'))
  if (typeof depth === 'number') args.depth = depth
  const mode = url.searchParams.get('mode')
  if (mode) args.mode = mode
  const boxes = url.searchParams.get('boxes')
  if (boxes) args.boxes = boxes
  const includeTextContent = url.searchParams.get('includeTextContent')
  if (includeTextContent) args.includeTextContent = includeTextContent
  if (method === 'POST' && (url.pathname === '/dialog/handle' || url.pathname === '/dialog')) args.redacted = true
  if (method === 'POST' && (url.pathname === '/file-upload' || url.pathname === '/filechooser/upload')) args.redacted = true
  if (method === 'POST' && (url.pathname === '/fill' || url.pathname === '/type')) args.redacted = true
  if (method === 'POST' && (url.pathname === '/run-code-unsafe' || url.pathname === '/run-code')) args.redacted = true
  return Object.keys(args).length > 0 ? args : undefined
}

async function resolveRunCodeUnsafeSource(body: Record<string, unknown>): Promise<{ source: string; filename?: string }> {
  if (body.filename !== undefined) {
    if (typeof body.filename !== 'string' || body.filename.trim().length === 0) {
      throw new CliError('INVALID_COMMAND', 'run-code-unsafe filename must be a non-empty string.')
    }
    const filename = resolve(body.filename)
    try {
      return {
        source: await readFile(filename, 'utf-8'),
        filename,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new CliError('INVALID_COMMAND', `Failed to read run-code-unsafe filename: ${message}`)
    }
  }

  if (typeof body.code !== 'string' || body.code.trim().length === 0) {
    throw new CliError('INVALID_COMMAND', 'run-code-unsafe requires code or filename.')
  }
  return { source: body.code }
}

function optionalOutputFilename(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' && value.trim().length > 0) return value
  throw new CliError('INVALID_COMMAND', `${label} filename must be a non-empty string.`)
}

function requireTabSelector(body: Record<string, unknown>, session: PlaywrightSession, action: string): TabSelector {
  const selector = optionalTabSelector(body, session, action)
  if (selector) return selector
  throw new CliError('INVALID_COMMAND', `tabs ${action} requires tabId or index.`)
}

function optionalTabSelector(body: Record<string, unknown>, session: PlaywrightSession, action: string): TabSelector | undefined {
  const hasTabId = body.tabId !== undefined
  const hasIndex = body.index !== undefined
  if (hasTabId && hasIndex) {
    throw new CliError('INVALID_COMMAND', `tabs ${action} accepts either tabId or index, not both.`)
  }
  if (hasIndex) {
    return resolveIndexedTab(session, optionalTabIndex(body.index, action))
  }
  if (hasTabId) {
    const tabId = optionalPositiveInteger(body.tabId, 'tabId')
    if (typeof tabId !== 'number') {
      throw new CliError('INVALID_COMMAND', 'tabId must be a positive integer.')
    }
    const index = tabIndexForTabId(session, tabId)
    return {
      tabId,
      ...(index !== null ? { index } : {}),
    }
  }
  return undefined
}

function optionalTabIndex(value: unknown, action: string): number {
  const index = optionalNumber(value)
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    throw new CliError('TAB_NOT_FOUND', `tabs ${action} requires a valid zero-based tab index.`)
  }
  return index
}

function resolveIndexedTab(session: PlaywrightSession, index: number): TabSelector {
  const tab = session.listTabs()[index]
  if (!tab) {
    throw new CliError('TAB_NOT_FOUND', `No tab exists at index ${index}.`, { index })
  }
  return { tabId: tab.tabId, index }
}

function tabIndexForTabId(session: PlaywrightSession, tabId: number): number | null {
  const index = session.listTabs().findIndex(tab => tab.tabId === tabId)
  return index >= 0 ? index : null
}

async function writeOutputFile(filename: string, text: string): Promise<string> {
  const path = resolve(filename)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf-8')
  return path
}

function formatEvaluationResultForFile(result: unknown): string {
  if (typeof result === 'string') return result
  return `${JSON.stringify(result, null, 2)}\n`
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf-8')
  return JSON.parse(text) as Record<string, unknown>
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required string field: ${key}`)
  }
  return value
}

function requireStringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key]
  if (!Array.isArray(value) || value.length === 0 || !value.every(item => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error(`Missing required string array field: ${key}`)
  }
  return value
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error('Expected string array')
  }
  return value
}

function optionalStringRecord(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected string record')
  }
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') {
      throw new Error('Expected string record')
    }
    result[key] = item
  }
  return result
}

function fillFormFieldsFromBody(body: Record<string, unknown>): FillFormField[] {
  const rawFields = body.fields
  if (!Array.isArray(rawFields) || rawFields.length === 0) {
    throw new Error('fill-form requires a non-empty fields array')
  }
  return rawFields.map((rawField, index) => {
    if (!rawField || typeof rawField !== 'object' || Array.isArray(rawField)) {
      throw new Error(`fill-form field ${index} must be an object`)
    }
    const field = rawField as Record<string, unknown>
    return {
      name: optionalString(field.name),
      target: requireString(field, 'target'),
      type: requireFillFormFieldType(field.type),
      value: requireFillFormValue(field),
    }
  })
}

function requireFillFormFieldType(value: unknown): FillFormFieldType {
  if (
    value === 'textbox'
    || value === 'checkbox'
    || value === 'radio'
    || value === 'combobox'
    || value === 'slider'
  ) {
    return value
  }
  throw new Error('fill-form field type must be one of: textbox, checkbox, radio, combobox, slider')
}

function optionalFillStrategy(value: unknown): FillStrategy | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'insert' || value === 'keystroke' || value === 'auto') return value
  throw new Error('fill strategy must be one of: insert, keystroke, auto')
}

function requireFillFormValue(field: Record<string, unknown>): string | boolean | number {
  const value = field.value
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }
  throw new Error('fill-form field value must be a string, boolean, or number')
}

function requireBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key]
  if (value === true || value === false) return value
  throw new Error(`Missing required boolean field: ${key}`)
}

function requirePositiveInteger(body: Record<string, unknown>, key: string): number {
  const value = optionalNumber(body[key])
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`)
  }
  return value
}

function optionalPositiveInteger(value: unknown, key: string): number | undefined {
  const parsed = optionalNumber(value)
  if (typeof parsed !== 'number') return undefined
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`)
  }
  return parsed
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function groupIdsFromSearchParams(params: URLSearchParams): string[] | undefined {
  const values = [
    ...params.getAll('groupIds'),
    ...params.getAll('group-ids'),
  ]
  const groupIds = values.flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)
  return groupIds.length > 0 ? groupIds : undefined
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function optionalDelayMs(value: unknown): number | undefined {
  const parsed = optionalNumber(value)
  if (typeof parsed !== 'number') return undefined
  if (parsed < 0) throw new Error('delayMs must be non-negative')
  return parsed
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

function optionalConsoleLevel(value: unknown): 'debug' | 'info' | 'warning' | 'error' | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'debug' || value === 'info' || value === 'warning' || value === 'error') return value
  throw new Error('console level must be one of: debug, info, warning, error')
}

function optionalNetworkRequestPart(value: unknown): NetworkRequestPart | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (
    value === 'request-headers'
    || value === 'request-body'
    || value === 'response-headers'
    || value === 'response-body'
  ) {
    return value
  }
  throw new Error('network request part must be one of: request-headers, request-body, response-headers, response-body')
}

function optionalScreenshotType(value: unknown): 'png' | 'jpeg' | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'png' || value === 'jpeg') return value
  throw new Error('screenshot type must be one of: png, jpeg')
}

function optionalAriaSnapshotMode(value: unknown): 'ai' | 'default' | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'ai' || value === 'default') return value
  throw new Error('snapshot mode must be one of: ai, default')
}

function optionalClickButton(value: unknown): ClickButton | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'left' || value === 'right' || value === 'middle') return value
  throw new Error('click button must be one of: left, right, middle')
}

function optionalClickModifiers(value: unknown): ClickModifier[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error('click modifiers must be an array')
  }
  return value.map(item => {
    if (
      item === 'Alt'
      || item === 'Control'
      || item === 'ControlOrMeta'
      || item === 'Meta'
      || item === 'Shift'
    ) {
      return item
    }
    throw new Error('click modifiers must be one of: Alt, Control, ControlOrMeta, Meta, Shift')
  })
}

function screenshotTypeFromPath(path: string): 'png' | 'jpeg' {
  return path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png'
}

function selectOptionsFromBody(body: Record<string, unknown>): Array<{ value?: string; label?: string; index?: number }> {
  const values = requireStringArray(body, 'values')
  const mode = optionalString(body.mode) ?? 'value'
  if (mode === 'value') return values.map(value => ({ value }))
  if (mode === 'label') return values.map(label => ({ label }))
  if (mode === 'index') {
    return values.map(value => {
      const index = Number(value)
      if (!Number.isInteger(index) || index < 0) {
        throw new Error('select index values must be non-negative integers')
      }
      return { index }
    })
  }
  throw new Error('select mode must be one of: value, label, index')
}

type WaitRequest =
  | {
      kind: 'target'
      tabId?: number
      target: string
      state: 'visible' | 'hidden' | 'enabled' | 'disabled'
      timeoutMs: number
    }
  | {
      kind: 'text'
      tabId?: number
      text: string
      timeoutMs: number
    }
  | {
      kind: 'textGone'
      tabId?: number
      text: string
      timeoutMs: number
    }
  | {
      kind: 'time'
      tabId?: number
      timeMs: number
    }

function waitRequestFromBody(body: Record<string, unknown>): WaitRequest {
  const hasTarget = typeof body.target === 'string' && body.target.trim().length > 0
  const hasText = typeof body.text === 'string' && body.text.trim().length > 0
  const hasTextGone = typeof body.textGone === 'string' && body.textGone.trim().length > 0
  const hasTime = typeof optionalNumber(body.timeMs) === 'number'
  const modeCount = [hasTarget, hasText, hasTextGone, hasTime].filter(Boolean).length
  if (modeCount !== 1) {
    throw new Error('wait requires exactly one of: target, text, textGone, timeMs')
  }

  const tabId = optionalNumber(body.tabId)
  if (hasTarget) {
    return {
      kind: 'target',
      tabId,
      target: requireString(body, 'target'),
      state: requireWaitState(body.state),
      timeoutMs: optionalTimeoutMs(body.timeoutMs) ?? 10_000,
    }
  }
  if (hasText) {
    return {
      kind: 'text',
      tabId,
      text: requireString(body, 'text'),
      timeoutMs: optionalTimeoutMs(body.timeoutMs) ?? 10_000,
    }
  }
  if (hasTextGone) {
    return {
      kind: 'textGone',
      tabId,
      text: requireString(body, 'textGone'),
      timeoutMs: optionalTimeoutMs(body.timeoutMs) ?? 10_000,
    }
  }
  return {
    kind: 'time',
    tabId,
    timeMs: requireNonNegativeNumber(body, 'timeMs'),
  }
}

function optionalTimeoutMs(value: unknown): number | undefined {
  const parsed = optionalNumber(value)
  if (typeof parsed !== 'number') return undefined
  if (parsed < 0) throw new Error('timeoutMs must be non-negative')
  return parsed
}

function requireNonNegativeNumber(body: Record<string, unknown>, key: string): number {
  const value = optionalNumber(body[key])
  if (typeof value !== 'number') throw new Error(`Missing required number field: ${key}`)
  if (value < 0) throw new Error(`${key} must be non-negative`)
  return value
}

function requireWaitState(value: unknown): 'visible' | 'hidden' | 'enabled' | 'disabled' {
  if (value === 'visible' || value === 'hidden' || value === 'enabled' || value === 'disabled') {
    return value
  }
  throw new Error('wait state must be one of: visible, hidden, enabled, disabled')
}
