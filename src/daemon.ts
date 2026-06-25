// The daemon: a node:http server over a Unix domain socket (TCP fallback). SPEC §7.4 / A.1.
//
// One PlaywrightSession (BrowserSession) owns the single chromium context. Every CLI verb is
// one HTTP request → one response (A.1.1). Success → 200 `{ ok:true, ... }`; any thrown error
// → 400 `{ ok:false, error }` (A.1.4 / A.1.6). M1 wires the lifecycle + navigation routes;
// M4 adds the action/perception routes.

import http from 'node:http'
import net from 'node:net'
import { BrowserSession } from './browser-session.js'
import { CliError, errorResponse } from './errors.js'
import {
  ensureRunDir,
  removeSocketFile,
  socketFileExists,
  type DaemonEndpoint,
} from './registry.js'
import type { DaemonEvent, DaemonHealth } from './types.js'

// ---- event ring buffer (§7.5, minimal) -------------------------------------

class DaemonEventBroker {
  private readonly buffer: DaemonEvent[] = []
  private counter = 0
  constructor(private readonly bufferSize = 500) {}

  nextId(): string {
    return `cmd-${this.counter++}`
  }

  record(event: DaemonEvent): void {
    this.buffer.push(event)
    if (this.buffer.length > this.bufferSize) this.buffer.shift()
  }

  history(): DaemonEvent[] {
    return [...this.buffer]
  }
}

// ---- body / query helpers --------------------------------------------------

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key]
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new CliError('INVALID_COMMAND', `Missing required string field: ${key}`)
  }
  return v
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function requirePositiveInteger(value: unknown, label: string): number {
  const n = optionalNumber(value)
  if (n === undefined || !Number.isInteger(n) || n <= 0) {
    throw new CliError('INVALID_COMMAND', `${label} must be a positive integer`)
  }
  return n
}

// ---- route table -----------------------------------------------------------

interface RouteCtx {
  method: string
  pathname: string
  query: URLSearchParams
  body: Record<string, unknown>
  session: BrowserSession
  broker: DaemonEventBroker
}

async function routeRequest(ctx: RouteCtx): Promise<Record<string, unknown>> {
  const { method, pathname, query, body, session } = ctx
  const route = `${method} ${pathname}`

  switch (route) {
    case 'GET /health': {
      const health: DaemonHealth = {
        ok: true,
        name: 'agrune-daemon',
        browser: 'playwright',
        tabs: session.tabCount,
      }
      return health as unknown as Record<string, unknown>
    }

    case 'GET /events/history':
      return { ok: true, events: ctx.broker.history() }

    case 'GET /tabs':
      return { ok: true, tabs: await session.listTabs() }

    case 'GET /targets': {
      // Server builds + filters the snapshot; the CLI formats it (A.2.3).
      const snapshot = await session.snapshot(optionalNumber(query.get('tabId')))
      return { ok: true, snapshot }
    }

    case 'GET /snapshot': {
      const result = await session.ariaSnapshot(optionalNumber(query.get('tabId')), {
        target: query.get('target') ?? undefined,
        mode: parseAriaMode(query.get('mode')),
        depth: parseDepth(query.get('depth')),
      })
      return { ok: true, ...result }
    }

    case 'POST /open':
    case 'POST /tabs/new': {
      const url = requireString(body, 'url')
      const { index, tab } = await session.open(url)
      return { ok: true, index, tab }
    }

    case 'POST /navigate': {
      const url = requireString(body, 'url')
      const tab = await session.navigate(url, optionalNumber(body.tabId))
      return { ok: true, action: 'navigate', tab }
    }

    case 'POST /back':
      return { ok: true, action: 'back', tab: await session.back(optionalNumber(body.tabId)) }

    case 'POST /forward':
      return { ok: true, action: 'forward', tab: await session.forward(optionalNumber(body.tabId)) }

    case 'POST /reload':
      return { ok: true, action: 'reload', tab: await session.reload(optionalNumber(body.tabId)) }

    case 'POST /resize': {
      const width = requirePositiveInteger(body.width, 'width')
      const height = requirePositiveInteger(body.height, 'height')
      const r = await session.resize(width, height, optionalNumber(body.tabId))
      return { ok: true, action: 'resize', tabId: r.tabId, width: r.width, height: r.height }
    }

    case 'POST /tabs/select':
    case 'POST /tabs/focus': {
      const tabId = resolveTabSelector(body, session)
      const { index, tab } = await session.focusTab(tabId)
      return { ok: true, index, tab }
    }

    // ---- actions (M4) ------------------------------------------------------

    case 'POST /click': {
      const target = requireString(body, 'target')
      const action = parseClickAction(body)
      const r = await session.click(optionalNumber(body.tabId), target, action.action, action.options)
      return {
        ok: true,
        target,
        action: action.responseAction,
        ...(action.options.button ? { button: action.options.button } : {}),
        ...(action.options.modifiers ? { modifiers: action.options.modifiers } : {}),
        ...(r.dialog ? { dialog: r.dialog } : {}),
        ...(r.fileChooser ? { fileChooser: r.fileChooser } : {}),
      }
    }

    case 'POST /fill': {
      const target = requireString(body, 'target')
      const value = typeof body.value === 'string' ? body.value : ''
      const clear = body.clear !== false
      const strategy = parseFillStrategy(body.strategy)
      const used = await session.fill(optionalNumber(body.tabId), target, value, clear, strategy)
      return { ok: true, target, value, strategy: used }
    }

    case 'POST /fill-form': {
      const fields = parseFillFormFields(body.fields)
      await session.fillForm(optionalNumber(body.tabId), fields)
      return {
        ok: true,
        action: 'fill-form',
        fields: fields.map((f) => ({ ...(f.name ? { name: f.name } : {}), target: f.target, type: f.type })),
      }
    }

    case 'POST /type': {
      const target = requireString(body, 'target')
      const text = typeof body.text === 'string' ? body.text : ''
      await session.type(
        optionalNumber(body.tabId),
        target,
        text,
        optionalNumber(body.delayMs),
        body.submit === true,
      )
      return { ok: true, action: 'type', target, text }
    }

    case 'POST /press': {
      const key = requireString(body, 'key')
      const target = typeof body.target === 'string' ? body.target : undefined
      await session.press(optionalNumber(body.tabId), key, target, optionalNumber(body.delayMs))
      return { ok: true, action: 'press', key, ...(target ? { target } : {}) }
    }

    case 'POST /select': {
      const target = requireString(body, 'target')
      const values = parseSelectValues(body)
      await session.select(optionalNumber(body.tabId), target, values)
      return { ok: true, action: 'select', target, values: rawSelectValues(body) }
    }

    case 'POST /upload': {
      const target = requireString(body, 'target')
      const paths = requireStringArray(body.paths, 'paths')
      const result = await session.upload(optionalNumber(body.tabId), target, paths)
      return { ok: true, action: 'upload', target, paths: result }
    }

    case 'POST /drop': {
      const target = requireString(body, 'target')
      const data = parseDropData(body)
      const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === 'string') : []
      if (Object.keys(data).length === 0 && paths.length === 0) {
        throw new CliError('INVALID_COMMAND', 'drop requires at least one of --data/--text/--uri or a file path')
      }
      const r = await session.drop(optionalNumber(body.tabId), target, data, paths)
      return { ok: true, action: 'drop', target, paths: r.paths, dataTypes: r.dataTypes }
    }

    case 'POST /drag': {
      const startTarget = requireString(body, 'startTarget')
      const endTarget = requireString(body, 'endTarget')
      await session.drag(optionalNumber(body.tabId), startTarget, endTarget)
      return { ok: true, target: startTarget, action: 'drag' }
    }

    case 'GET /read':
      return { ok: true, text: await session.read(optionalNumber(query.get('tabId'))) }

    case 'POST /wait':
      return waitRoute(body, session)

    case 'POST /screenshot': {
      const path = requireString(body, 'path')
      const target = typeof body.target === 'string' ? body.target : undefined
      const type = parseScreenshotType(body.type, path)
      const saved = await session.screenshot(optionalNumber(body.tabId), path, {
        fullPage: body.fullPage === true,
        targetRef: target,
        type,
      })
      return { ok: true, path: saved, type, fullPage: body.fullPage === true, ...(target ? { target } : {}) }
    }

    case 'POST /evaluate': {
      const source = requireString(body, 'source')
      const target = typeof body.target === 'string' ? body.target : undefined
      const result = await session.evaluate(optionalNumber(body.tabId), source, body.arg, target)
      return {
        ok: true,
        action: 'evaluate',
        ...(target ? { target } : {}),
        result: result === undefined ? null : result,
        ...(result === undefined ? { undefinedResult: true } : {}),
      }
    }

    case 'POST /run-code-unsafe':
    case 'POST /run-code': {
      const code = await resolveRunCode(body)
      const result = await session.runCodeUnsafe(optionalNumber(body.tabId), code)
      return {
        ok: true,
        action: 'run-code-unsafe',
        result: result === undefined ? null : result,
        ...(result === undefined ? { undefinedResult: true } : {}),
      }
    }

    case 'GET /console':
      return {
        ok: true,
        messages: session.consoleMessages(optionalNumber(query.get('tabId')), {
          level: parseConsoleLevel(query.get('level')),
          all: query.get('all') !== null,
        }),
      }

    case 'GET /network':
      return {
        ok: true,
        requests: session.networkRequests(optionalNumber(query.get('tabId')), {
          filter: query.get('filter') ?? undefined,
          includeStatic: query.get('static') !== null,
          all: query.get('all') !== null,
        }),
      }

    case 'GET /network/request': {
      const index = requirePositiveInteger(query.get('index'), 'index')
      const detail = await session.networkRequestDetail(
        optionalNumber(query.get('tabId')),
        index,
        parseNetworkPart(query.get('part')),
      )
      return { ok: true, ...detail }
    }

    case 'GET /dialogs':
      return { ok: true, dialogs: session.dialogs(optionalNumber(query.get('tabId'))) }

    case 'POST /dialog/handle':
    case 'POST /dialog': {
      const accept = body.accept === true
      const promptText = typeof body.promptText === 'string' ? body.promptText : undefined
      const r = await session.handleDialog(optionalNumber(body.tabId), { accept, promptText })
      return { ok: true, action: 'dialog.handle', armed: r.armed, ...(r.dialog ? { dialog: r.dialog } : {}) }
    }

    case 'GET /file-choosers':
      return { ok: true, fileChoosers: session.fileChoosers(optionalNumber(query.get('tabId'))) }

    case 'POST /file-upload':
    case 'POST /filechooser/upload': {
      const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === 'string') : []
      const r = await session.uploadToFileChooser(optionalNumber(body.tabId), paths)
      return { ok: true, action: 'file-upload', paths: r.paths, cancelled: r.cancelled, fileChooser: r.fileChooser }
    }

    // ---- parity MISSING set (M5) -------------------------------------------

    case 'POST /check': {
      const target = requireString(body, 'target')
      await session.check(optionalNumber(body.tabId), target)
      return { ok: true, action: 'check', target }
    }
    case 'POST /uncheck': {
      const target = requireString(body, 'target')
      await session.uncheck(optionalNumber(body.tabId), target)
      return { ok: true, action: 'uncheck', target }
    }
    case 'POST /keydown': {
      const key = requireString(body, 'key')
      await session.keydown(optionalNumber(body.tabId), key)
      return { ok: true, action: 'keydown', key }
    }
    case 'POST /keyup': {
      const key = requireString(body, 'key')
      await session.keyup(optionalNumber(body.tabId), key)
      return { ok: true, action: 'keyup', key }
    }
    case 'POST /mousemove': {
      const x = numberField(body.x, 'x')
      const y = numberField(body.y, 'y')
      await session.mousemove(optionalNumber(body.tabId), x, y)
      return { ok: true, action: 'mousemove', x, y }
    }
    case 'POST /mousedown': {
      await session.mousedown(optionalNumber(body.tabId), parseButton(body.button))
      return { ok: true, action: 'mousedown' }
    }
    case 'POST /mouseup': {
      await session.mouseup(optionalNumber(body.tabId), parseButton(body.button))
      return { ok: true, action: 'mouseup' }
    }
    case 'POST /mousewheel': {
      const deltaX = numberField(body.deltaX ?? 0, 'deltaX')
      const deltaY = numberField(body.deltaY ?? 0, 'deltaY')
      await session.mousewheel(optionalNumber(body.tabId), deltaX, deltaY)
      return { ok: true, action: 'mousewheel', deltaX, deltaY }
    }
    case 'POST /pdf': {
      const path = requireString(body, 'path')
      const saved = await session.pdf(optionalNumber(body.tabId), path)
      return { ok: true, action: 'pdf', path: saved }
    }
    case 'POST /highlight': {
      const target = requireString(body, 'target')
      await session.highlight(optionalNumber(body.tabId), target)
      return { ok: true, action: 'highlight', target }
    }
    case 'GET /generate-locator': {
      const target = query.get('target')
      if (!target) throw new CliError('INVALID_COMMAND', 'generate-locator requires --target')
      return { ok: true, ...(await session.generateLocator(optionalNumber(query.get('tabId')), target)) }
    }
    case 'GET /cookies':
      return { ok: true, cookies: await session.cookieList() }
    case 'GET /cookies/get': {
      const name = query.get('name')
      if (!name) throw new CliError('INVALID_COMMAND', 'cookie-get requires --name')
      return { ok: true, cookies: await session.cookieGet(name) }
    }
    case 'POST /cookies/set': {
      await session.cookieSet(body.cookie as Record<string, unknown>)
      return { ok: true, action: 'cookie-set' }
    }
    case 'POST /cookies/delete': {
      const name = requireString(body, 'name')
      await session.cookieDelete(name)
      return { ok: true, action: 'cookie-delete', name }
    }
    case 'POST /cookies/clear':
      await session.cookieClear()
      return { ok: true, action: 'cookie-clear' }
    case 'POST /storage': {
      const area = body.area === 'session' ? 'session' : 'local'
      const op = String(body.op)
      const tabId = optionalNumber(body.tabId)
      if (op === 'get') return { ok: true, value: await session.storageGet(tabId, area, requireString(body, 'key')) }
      if (op === 'set') {
        await session.storageSet(tabId, area, requireString(body, 'key'), String(body.value ?? ''))
        return { ok: true, action: 'storage-set' }
      }
      if (op === 'remove') {
        await session.storageRemove(tabId, area, requireString(body, 'key'))
        return { ok: true, action: 'storage-remove' }
      }
      if (op === 'clear') {
        await session.storageClear(tabId, area)
        return { ok: true, action: 'storage-clear' }
      }
      if (op === 'list') return { ok: true, items: await session.storageList(tabId, area) }
      throw new CliError('INVALID_COMMAND', 'storage op must be one of: get, set, remove, list, clear')
    }
    case 'POST /network-state': {
      const offline = body.offline === true
      await session.networkStateSet(offline)
      return { ok: true, action: 'network-state-set', offline }
    }
    case 'POST /state-save': {
      const path = requireString(body, 'path')
      return { ok: true, action: 'state-save', path: await session.stateSave(path) }
    }
    case 'POST /state-load': {
      await session.stateLoad(optionalNumber(body.tabId), (body.state ?? {}) as never)
      return { ok: true, action: 'state-load' }
    }
    case 'POST /delete-data':
      await session.deleteData(optionalNumber(body.tabId))
      return { ok: true, action: 'delete-data' }
    case 'POST /route': {
      const glob = requireString(body, 'glob')
      const action = body.action === 'allow' ? 'allow' : 'block'
      await session.route(optionalNumber(body.tabId), glob, action)
      return { ok: true, action: 'route', glob, mode: action }
    }
    case 'GET /route-list':
      return { ok: true, routes: session.routeList(optionalNumber(query.get('tabId'))) }
    case 'POST /unroute': {
      const glob = requireString(body, 'glob')
      await session.unroute(optionalNumber(body.tabId), glob)
      return { ok: true, action: 'unroute', glob }
    }
    case 'POST /tracing/start':
      await session.tracingStart()
      return { ok: true, action: 'tracing-start' }
    case 'POST /tracing/stop': {
      const path = requireString(body, 'path')
      return { ok: true, action: 'tracing-stop', path: await session.tracingStop(path) }
    }
    case 'GET /video': {
      const path = await session.videoPath(optionalNumber(query.get('tabId')))
      return { ok: true, path, ...(path ? {} : { note: 'No video; start the daemon with video recording enabled.' }) }
    }
    case 'POST /pause':
      await session.pause(optionalNumber(body.tabId))
      return { ok: true, action: 'pause' }
    case 'GET /list':
      return { ok: true, ...(await session.listSessions()) }
    case 'POST /close-all':
      await session.closeAll()
      return { ok: true, action: 'close-all', tabs: await session.listTabs() }

    case 'POST /close':
    case 'POST /tabs/close': {
      let tabId: number | undefined
      if (body.index !== undefined) tabId = session.tabIdByIndex(requireIndex(body.index))
      else tabId = optionalNumber(body.tabId)
      const r = await session.closeTab(tabId)
      return { ok: true, index: r.index, closedTabId: r.closedTabId, tabs: r.tabs }
    }

    default:
      throw new CliError('INVALID_COMMAND', `Unknown endpoint: ${method} ${pathname}`)
  }
}

// ---- action body/query parsers (A.2.4) -------------------------------------

const CLICK_BUTTONS = new Set(['left', 'right', 'middle'])
const MODIFIERS = new Set(['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'])

function parseClickAction(body: Record<string, unknown>): {
  action: string
  responseAction: string
  options: { button?: 'left' | 'right' | 'middle'; modifiers?: Array<'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'>; doubleClick?: boolean }
} {
  const action = typeof body.action === 'string' ? body.action : 'click'
  let button = typeof body.button === 'string' ? body.button : undefined
  if (button !== undefined && !CLICK_BUTTONS.has(button)) {
    throw new CliError('INVALID_COMMAND', 'click button must be one of: left, right, middle')
  }
  if (action === 'contextmenu') {
    if (button !== undefined && button !== 'right') {
      throw new CliError('INVALID_COMMAND', 'right-click only supports --button right')
    }
    button = 'right'
  }
  let modifiers: Array<'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'> | undefined
  if (typeof body.modifiers === 'string' && body.modifiers.length > 0) {
    const parts = body.modifiers.split(',').map((m) => m.trim()).filter(Boolean)
    for (const m of parts) {
      if (!MODIFIERS.has(m)) throw new CliError('INVALID_COMMAND', `Invalid modifier: ${m}`)
    }
    modifiers = parts as Array<'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'>
  }
  const doubleClick = body.doubleClick === true
  const responseAction = doubleClick && action === 'click' ? 'dblclick' : action
  return {
    action,
    responseAction,
    options: {
      ...(button ? { button: button as 'left' | 'right' | 'middle' } : {}),
      ...(modifiers ? { modifiers } : {}),
      doubleClick,
    },
  }
}

function parseFillStrategy(value: unknown): 'insert' | 'keystroke' | 'auto' {
  if (value === undefined) return 'auto'
  if (value === 'insert' || value === 'keystroke' || value === 'auto') return value
  throw new CliError('INVALID_COMMAND', 'fill strategy must be one of: insert, keystroke, auto')
}

function parseFillFormFields(value: unknown): import('./types.js').FillFormField[] {
  if (!Array.isArray(value)) throw new CliError('INVALID_COMMAND', 'fill-form requires a --fields array')
  const types = new Set(['textbox', 'checkbox', 'radio', 'combobox', 'slider'])
  return value.map((raw, i) => {
    const f = raw as Record<string, unknown>
    const target = typeof f.target === 'string' ? f.target : typeof f.targetId === 'string' ? f.targetId : undefined
    if (!target) throw new CliError('INVALID_COMMAND', `fill-form field[${i}] requires a target`)
    if (typeof f.type !== 'string' || !types.has(f.type)) {
      throw new CliError('INVALID_COMMAND', `fill-form field[${i}].type must be one of: textbox, checkbox, radio, combobox, slider`)
    }
    const v = f.value
    if (typeof v !== 'string' && typeof v !== 'boolean' && typeof v !== 'number') {
      throw new CliError('INVALID_COMMAND', `fill-form field[${i}].value must be string|boolean|number`)
    }
    return {
      ...(typeof f.name === 'string' ? { name: f.name } : {}),
      target,
      type: f.type as import('./types.js').FillFormFieldType,
      value: v,
    }
  })
}

function rawSelectValues(body: Record<string, unknown>): string[] {
  return Array.isArray(body.values) ? body.values.filter((v): v is string => typeof v === 'string') : []
}

function parseSelectValues(body: Record<string, unknown>): Array<{ value?: string; label?: string; index?: number }> {
  const values = rawSelectValues(body)
  const mode = typeof body.mode === 'string' ? body.mode : 'value'
  if (mode === 'label') return values.map((label) => ({ label }))
  if (mode === 'index') return values.map((v) => ({ index: Number(v) }))
  if (mode !== 'value') throw new CliError('INVALID_COMMAND', 'select mode must be one of: value, label, index')
  return values.map((value) => ({ value }))
}

function parseDropData(body: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {}
  if (body.data && typeof body.data === 'object') {
    for (const [k, v] of Object.entries(body.data as Record<string, unknown>)) {
      if (typeof v === 'string') data[k] = v
    }
  }
  if (typeof body.text === 'string') data['text/plain'] = body.text
  if (typeof body.uri === 'string') data['text/uri-list'] = body.uri
  return data
}

function parseScreenshotType(value: unknown, path: string): 'png' | 'jpeg' | undefined {
  if (value === 'png' || value === 'jpeg') return value
  if (value !== undefined) throw new CliError('INVALID_COMMAND', 'screenshot type must be png or jpeg')
  if (/\.jpe?g$/i.test(path)) return 'jpeg'
  return undefined
}

async function resolveRunCode(body: Record<string, unknown>): Promise<string> {
  if (typeof body.filename === 'string' && body.filename.length > 0) {
    const { readFile } = await import('node:fs/promises')
    return readFile(body.filename, 'utf8')
  }
  if (typeof body.code === 'string' && body.code.length > 0) return body.code
  throw new CliError('INVALID_COMMAND', 'run-code-unsafe requires code or filename.')
}

function parseConsoleLevel(value: string | null): import('./types.js').ConsoleLevel | undefined {
  if (value === null) return undefined
  if (value === 'debug' || value === 'info' || value === 'warning' || value === 'error') return value
  throw new CliError('INVALID_COMMAND', 'console level must be one of: debug, info, warning, error')
}

function parseNetworkPart(value: string | null): import('./types.js').NetworkRequestPart | undefined {
  if (value === null) return undefined
  if (
    value === 'request-headers' ||
    value === 'request-body' ||
    value === 'response-headers' ||
    value === 'response-body'
  ) {
    return value
  }
  throw new CliError('INVALID_COMMAND', 'network part must be one of: request-headers, request-body, response-headers, response-body')
}

function waitRoute(body: Record<string, unknown>, session: BrowserSession): Promise<Record<string, unknown>> {
  const target = typeof body.target === 'string' ? body.target : undefined
  const text = typeof body.text === 'string' ? body.text : undefined
  const textGone = typeof body.textGone === 'string' ? body.textGone : undefined
  const timeMs = optionalNumber(body.timeMs)
  const timeoutMs = optionalNumber(body.timeoutMs) ?? 10_000
  const tabId = optionalNumber(body.tabId)
  const modeCount = [target, text, textGone, timeMs].filter((v) => v !== undefined).length
  if (modeCount !== 1) {
    throw new CliError('INVALID_COMMAND', 'wait requires exactly one of: target, --text, --text-gone, --time')
  }
  if (target !== undefined) {
    const state = (typeof body.state === 'string' ? body.state : 'visible') as
      | 'visible'
      | 'hidden'
      | 'enabled'
      | 'disabled'
    if (!['visible', 'hidden', 'enabled', 'disabled'].includes(state)) {
      throw new CliError('INVALID_COMMAND', 'wait state must be one of: visible, hidden, enabled, disabled')
    }
    return session.waitForTarget(tabId, target, state, timeoutMs).then(() => ({ ok: true, action: `wait:${state}`, target }))
  }
  if (text !== undefined) {
    return session.waitForText(tabId, text, 'visible', timeoutMs).then(() => ({ ok: true, action: 'wait:text', text }))
  }
  if (textGone !== undefined) {
    return session
      .waitForText(tabId, textGone, 'hidden', timeoutMs)
      .then(() => ({ ok: true, action: 'wait:textGone', text: textGone }))
  }
  return session.waitForTime(tabId, timeMs!).then(() => ({ ok: true, action: 'wait:time', timeMs }))
}

function numberField(value: unknown, key: string): number {
  const n = optionalNumber(value)
  if (n === undefined) throw new CliError('INVALID_COMMAND', `${key} must be a number`)
  return n
}

function parseButton(value: unknown): 'left' | 'right' | 'middle' | undefined {
  if (value === undefined) return undefined
  if (value === 'left' || value === 'right' || value === 'middle') return value
  throw new CliError('INVALID_COMMAND', 'button must be one of: left, right, middle')
}

function requireStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new CliError('INVALID_COMMAND', `${key} must be a non-empty array of non-empty strings`)
  }
  return value as string[]
}

function parseAriaMode(value: string | null): 'ai' | 'default' | undefined {
  if (value === null) return undefined
  if (value !== 'ai' && value !== 'default') {
    throw new CliError('INVALID_COMMAND', 'snapshot mode must be one of: ai, default')
  }
  return value
}

function parseDepth(value: string | null): number | undefined {
  if (value === null) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new CliError('INVALID_COMMAND', 'depth must be a positive integer')
  }
  return n
}

function requireIndex(value: unknown): number {
  const n = optionalNumber(value)
  if (n === undefined || !Number.isInteger(n) || n < 0) {
    throw new CliError('INVALID_COMMAND', 'index must be a non-negative integer')
  }
  return n
}

function resolveTabSelector(body: Record<string, unknown>, session: BrowserSession): number {
  if (body.index !== undefined && body.tabId !== undefined) {
    throw new CliError('INVALID_COMMAND', 'Use either --index or tabId, not both')
  }
  if (body.index !== undefined) return session.tabIdByIndex(requireIndex(body.index))
  const tabId = optionalNumber(body.tabId)
  if (tabId === undefined) {
    throw new CliError('INVALID_COMMAND', 'A tabId or --index is required')
  }
  return tabId
}

function shouldTrack(method: string, pathname: string): boolean {
  return !(method === 'GET' && (pathname === '/health' || pathname === '/events/history'))
}

// ---- server lifecycle ------------------------------------------------------

export interface DaemonHandle {
  url: string
  close(): Promise<void>
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function socketAccepting(socketPath: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ path: socketPath })
    const done = (v: boolean) => {
      sock.destroy()
      resolve(v)
    }
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.setTimeout(timeoutMs, () => done(false))
  })
}

export async function startDaemon(opts: {
  endpoint: DaemonEndpoint['endpoint']
  headless: boolean
  cwd?: string
  attachEndpoint?: string
}): Promise<DaemonHandle> {
  const session = new BrowserSession(opts.headless, opts.attachEndpoint)
  await session.start()
  const broker = new DaemonEventBroker()

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, session, broker)
  })

  const isUnix = opts.endpoint.startsWith('unix:')
  let url: string

  if (isUnix) {
    const socketPath = opts.endpoint.slice('unix:'.length)
    ensureRunDir(opts.cwd)
    if (socketFileExists(socketPath)) {
      if (await socketAccepting(socketPath)) {
        await session.stop()
        throw new CliError('DAEMON_ALREADY_RUNNING', `A daemon is already listening on ${socketPath}.`)
      }
      removeSocketFile(socketPath)
    }
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, () => resolve())
    })
    url = `unix:${socketPath}`
  } else {
    const u = new URL(opts.endpoint)
    const port = u.port ? Number(u.port) : 80
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, u.hostname, () => resolve())
    })
    url = opts.endpoint
  }

  return {
    url,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      if (isUnix) removeSocketFile(opts.endpoint.slice('unix:'.length))
      await session.stop()
    },
  }
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  session: BrowserSession,
  broker: DaemonEventBroker,
): Promise<void> {
  const method = req.method ?? 'GET'
  const parsed = new URL(req.url ?? '/', 'http://localhost')
  const pathname = parsed.pathname
  const track = shouldTrack(method, pathname)
  const eventId = track ? broker.nextId() : ''
  const startedAt = process.hrtime.bigint()

  try {
    const body = method === 'GET' ? {} : await readJsonBody(req)
    if (track) {
      broker.record({ id: eventId, ts: Date.now(), method, path: pathname, phase: 'start' })
    }
    const result = await routeRequest({
      method,
      pathname,
      query: parsed.searchParams,
      body,
      session,
      broker,
    })
    if (track) {
      broker.record({
        id: eventId,
        ts: Date.now(),
        method,
        path: pathname,
        phase: 'end',
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      })
    }
    sendJson(res, 200, result)
  } catch (error) {
    const env = errorResponse(error)
    if (track) {
      broker.record({
        id: eventId,
        ts: Date.now(),
        method,
        path: pathname,
        phase: 'error',
        error: { code: env.error.code, message: env.error.message },
      })
    }
    sendJson(res, 400, env)
  }
}
