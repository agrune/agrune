// Verb registry + dispatch. SPEC §6.3 / A.2.
//
// Each browser verb builds its route + body and calls the daemon over HTTP (auto-spawning a
// detached daemon on first use). Daemon-lifecycle verbs talk to the daemon directly (no
// auto-spawn). M1: daemon start/stop/status/events, open, navigation, tabs, close.
// M4+ register the action/perception verbs.

import type { ParsedArgs } from './args.js'
import { getBooleanFlag, getStringFlag, getPositiveIntFlag } from './args.js'
import type { ProgramIO } from './program.js'
import { writeResult } from './format.js'
import { CliError } from './errors.js'
import { formatSnapshot, type PageSnapshot } from './snapshot.js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve as resolvePath, dirname } from 'node:path'
import { CLI_VERSION } from './version.js'
import {
  DaemonClient,
  requestJson,
  stopDaemon,
  isHealthy,
} from './session.js'
import { startDaemon } from './daemon.js'
import {
  getDaemonEndpoint,
  writeSessionFile,
  removeSessionFile,
  workspacePath,
} from './registry.js'

function clientFromFlags(flags: Record<string, string | boolean>): DaemonClient {
  const { endpoint, explicit } = getDaemonEndpoint(flags)
  const headless = getBooleanFlag(flags, 'headless')
  return new DaemonClient(endpoint, { explicit, headless })
}

function tabBody(flags: Record<string, string | boolean>): Record<string, unknown> {
  const tabId = getPositiveIntFlag(flags, 'tab')
  return tabId !== undefined ? { tabId } : {}
}

export async function runCommand(parsed: ParsedArgs, io: ProgramIO): Promise<number> {
  const { command, flags, positionals } = parsed
  const primary = command[0]!
  const secondary = command[1]
  const json = getBooleanFlag(flags, 'json')
  const raw = getBooleanFlag(flags, 'raw')

  const print = (value: unknown, formatter?: (v: unknown) => string) =>
    writeResult(io.stdout, value, { json, raw, formatter })

  switch (primary) {
    case 'daemon':
      return runDaemon(secondary, flags, io)

    case 'open': {
      const url = positionals[0]
      if (!url) throw new CliError('INVALID_COMMAND', 'open requires a <url>')
      print(await clientFromFlags(flags).request('POST', '/open', { url }))
      return 0
    }

    case 'navigate':
    case 'goto': {
      const url = positionals[0]
      if (!url) throw new CliError('INVALID_COMMAND', `${primary} requires a <url>`)
      print(await clientFromFlags(flags).request('POST', '/navigate', { url, ...tabBody(flags) }))
      return 0
    }

    case 'back':
    case 'forward':
    case 'reload': {
      print(await clientFromFlags(flags).request('POST', `/${primary}`, tabBody(flags)))
      return 0
    }

    // playwright-cli rename aliases (A.6).
    case 'go-back': {
      print(await clientFromFlags(flags).request('POST', '/back', tabBody(flags)))
      return 0
    }
    case 'go-forward': {
      print(await clientFromFlags(flags).request('POST', '/forward', tabBody(flags)))
      return 0
    }

    case 'resize': {
      const width = getPositiveIntFlag(flags, 'width') ?? toInt(positionals[0], 'width')
      const height = getPositiveIntFlag(flags, 'height') ?? toInt(positionals[1], 'height')
      print(await clientFromFlags(flags).request('POST', '/resize', { width, height, ...tabBody(flags) }))
      return 0
    }

    case 'targets':
      return runTargets(flags, io)

    case 'snapshot':
    case 'aria-snapshot':
      return runSnapshot(flags, io)

    case 'click':
    case 'dblclick':
    case 'double-click':
    case 'right-click':
    case 'hover':
      return runClick(primary, positionals, flags, print)

    case 'fill':
      return runFill(positionals, flags, print)

    case 'fill-form':
    case 'fill_form':
      return runFillForm(flags, print)

    case 'type':
      return runType(positionals, flags, print)

    case 'press':
    case 'press-key':
      return runPress(positionals, flags, print)

    case 'select':
    case 'select-option':
      return runSelect(positionals, flags, print)

    case 'upload':
      return runUpload(positionals, flags, print)

    case 'drop':
      return runDrop(positionals, flags, print)

    case 'drag':
      return runDrag(positionals, flags, print)

    case 'wait':
      return runWait(positionals, flags, print)

    case 'read':
      return runRead(flags, io)

    case 'screenshot':
      return runScreenshot(flags, io)

    case 'evaluate':
    case 'eval':
      return runEvaluate(positionals, flags, print)

    case 'run-code-unsafe':
    case 'run-code':
      return runRunCode(positionals, flags, print)

    case 'console':
    case 'console-messages':
      return runConsole(flags, io)

    case 'network':
    case 'network-requests':
      return runNetwork(secondary, positionals, flags, io)

    case 'dialogs':
      return runDialogs(flags, io)

    case 'handle-dialog':
    case 'dialog':
      return runHandleDialog(secondary, flags, print)

    case 'file-choosers':
    case 'filechoosers':
      return runFileChoosers(flags, io)

    case 'file-upload':
      return runFileUpload(positionals, flags, print)

    case 'tabs':
    case 'tab':
      return runTabs(secondary, positionals, flags, io, print)

    case 'close':
      return runClose(positionals, flags, print)

    case 'events': {
      const value = await daemonGet(flags, '/events/history')
      print(value)
      return 0
    }

    case 'dialog-accept':
      return runHandleDialog('accept', flags, print)
    case 'dialog-dismiss':
      return runHandleDialog('dismiss', flags, print)

    // ---- M5 parity MISSING set --------------------------------------------

    case 'check':
    case 'uncheck': {
      const target = requireRef(positionals, primary)
      print(await clientFromFlags(flags).request('POST', `/${primary}`, { target, ...tabBody(flags) }))
      return 0
    }
    case 'keydown':
    case 'keyup': {
      const key = positionals[0] ?? getStringFlag(flags, 'key')
      if (!key) throw new CliError('INVALID_COMMAND', `${primary} requires a <key>`)
      print(await clientFromFlags(flags).request('POST', `/${primary}`, { key, ...tabBody(flags) }))
      return 0
    }
    case 'mousemove': {
      const x = toInt(positionals[0], 'x')
      const y = toInt(positionals[1], 'y')
      print(await clientFromFlags(flags).request('POST', '/mousemove', { x, y, ...tabBody(flags) }))
      return 0
    }
    case 'mousedown':
    case 'mouseup': {
      const body: Record<string, unknown> = { ...tabBody(flags) }
      const button = positionals[0] ?? getStringFlag(flags, 'button')
      if (button !== undefined) body.button = button
      print(await clientFromFlags(flags).request('POST', `/${primary}`, body))
      return 0
    }
    case 'mousewheel': {
      const deltaX = Number(positionals[0] ?? 0)
      const deltaY = Number(positionals[1] ?? 0)
      print(await clientFromFlags(flags).request('POST', '/mousewheel', { deltaX, deltaY, ...tabBody(flags) }))
      return 0
    }
    case 'pdf': {
      const path = positionals[0] ?? getStringFlag(flags, 'output', 'filename') ?? defaultRunPath('pdf')
      const res = await clientFromFlags(flags).request<{ ok: true; path: string }>('POST', '/pdf', {
        path,
        ...tabBody(flags),
      })
      writeResult(io.stdout, res, { json, formatter: () => res.path })
      return 0
    }
    case 'highlight': {
      const target = requireRef(positionals, 'highlight')
      print(await clientFromFlags(flags).request('POST', '/highlight', { target, ...tabBody(flags) }))
      return 0
    }
    case 'generate-locator': {
      const target = positionals[0] ?? getStringFlag(flags, 'target')
      if (!target) throw new CliError('INVALID_COMMAND', 'generate-locator requires a <target-ref>')
      const tabId = getPositiveIntFlag(flags, 'tab')
      const qp = new URLSearchParams({ target })
      if (tabId !== undefined) qp.set('tabId', String(tabId))
      print(await clientFromFlags(flags).request('GET', `/generate-locator?${qp.toString()}`))
      return 0
    }
    case 'cookie-list':
      print(await daemonClientGet(flags, '/cookies'))
      return 0
    case 'cookie-get': {
      const name = positionals[0] ?? getStringFlag(flags, 'name')
      if (!name) throw new CliError('INVALID_COMMAND', 'cookie-get requires a <name>')
      print(await clientFromFlags(flags).request('GET', `/cookies/get?name=${encodeURIComponent(name)}`))
      return 0
    }
    case 'cookie-set': {
      const cookieJson = getStringFlag(flags, 'cookie', 'json')
      if (!cookieJson) throw new CliError('INVALID_COMMAND', 'cookie-set requires --cookie <json>')
      print(await clientFromFlags(flags).request('POST', '/cookies/set', { cookie: JSON.parse(cookieJson) }))
      return 0
    }
    case 'cookie-delete': {
      const name = positionals[0] ?? getStringFlag(flags, 'name')
      if (!name) throw new CliError('INVALID_COMMAND', 'cookie-delete requires a <name>')
      print(await clientFromFlags(flags).request('POST', '/cookies/delete', { name }))
      return 0
    }
    case 'cookie-clear':
      print(await clientFromFlags(flags).request('POST', '/cookies/clear', {}))
      return 0

    case 'localstorage-get':
    case 'localstorage-set':
    case 'localstorage-remove':
    case 'localstorage-list':
    case 'localstorage-clear':
    case 'sessionstorage-get':
    case 'sessionstorage-set':
    case 'sessionstorage-remove':
    case 'sessionstorage-list':
    case 'sessionstorage-clear':
      return runStorage(primary, positionals, flags, print)

    case 'network-state-set': {
      const offline = getBooleanFlag(flags, 'offline') || positionals[0] === 'offline'
      print(await clientFromFlags(flags).request('POST', '/network-state', { offline, ...tabBody(flags) }))
      return 0
    }
    case 'state-save': {
      const path = positionals[0] ?? getStringFlag(flags, 'output', 'filename') ?? defaultRunPath('state', 'json')
      const res = await clientFromFlags(flags).request<{ ok: true; path: string }>('POST', '/state-save', { path })
      writeResult(io.stdout, res, { json, formatter: () => res.path })
      return 0
    }
    case 'state-load': {
      const file = positionals[0] ?? getStringFlag(flags, 'file', 'input')
      if (!file) throw new CliError('INVALID_COMMAND', 'state-load requires a <file>')
      const state = JSON.parse(readFileSync(resolvePath(file), 'utf8'))
      print(await clientFromFlags(flags).request('POST', '/state-load', { state, ...tabBody(flags) }))
      return 0
    }
    case 'delete-data':
      print(await clientFromFlags(flags).request('POST', '/delete-data', tabBody(flags)))
      return 0
    case 'route': {
      const glob = positionals[0] ?? getStringFlag(flags, 'glob')
      if (!glob) throw new CliError('INVALID_COMMAND', 'route requires a <glob>')
      const action = getBooleanFlag(flags, 'allow') ? 'allow' : 'block'
      print(await clientFromFlags(flags).request('POST', '/route', { glob, action, ...tabBody(flags) }))
      return 0
    }
    case 'route-list':
      print(await daemonClientGet(flags, '/route-list'))
      return 0
    case 'unroute': {
      const glob = positionals[0] ?? getStringFlag(flags, 'glob')
      if (!glob) throw new CliError('INVALID_COMMAND', 'unroute requires a <glob>')
      print(await clientFromFlags(flags).request('POST', '/unroute', { glob, ...tabBody(flags) }))
      return 0
    }
    case 'tracing-start':
      print(await clientFromFlags(flags).request('POST', '/tracing/start', {}))
      return 0
    case 'tracing-stop': {
      const path = positionals[0] ?? getStringFlag(flags, 'output', 'filename') ?? defaultRunPath('trace', 'zip')
      const res = await clientFromFlags(flags).request<{ ok: true; path: string }>('POST', '/tracing/stop', { path })
      writeResult(io.stdout, res, { json, formatter: () => res.path })
      return 0
    }
    case 'video':
    case 'video-chapter':
      print(await daemonClientGet(flags, '/video'))
      return 0
    case 'show':
      io.stdout.write('show is a no-op in the headless daemon (use "npx playwright show-trace <trace.zip>").\n')
      return 0
    case 'pause-at':
    case 'resume':
    case 'step-over':
      print(await clientFromFlags(flags).request('POST', '/pause', tabBody(flags)))
      return 0

    case 'list':
      print(await daemonClientGet(flags, '/list'))
      return 0
    case 'close-all':
      print(await clientFromFlags(flags).request('POST', '/close-all', {}))
      return 0
    case 'kill-all': {
      const result = await stopDaemon()
      io.stdout.write(result.stopped ? `Stopped Agrune daemon (pid ${result.pid}).\n` : 'No Agrune daemon running.\n')
      return 0
    }
    case 'install':
    case 'install-browser':
      return runInstall(primary, positionals, flags, io)

    case 'attach': {
      // Off-default (DECISIONS #26): run a FOREGROUND daemon connected to the user's Chrome over
      // CDP. The manifest security posture does not constrain an attached browser.
      const cdp = positionals[0] ?? getStringFlag(flags, 'endpoint')
      if (!cdp) throw new CliError('INVALID_COMMAND', 'attach requires a <cdp-endpoint> (e.g. http://localhost:9222)')
      const attachFlags = { ...flags, attach: cdp }
      return runDaemon('run', attachFlags, io)
    }
    case 'detach': {
      const result = await stopDaemon()
      io.stdout.write(
        result.stopped
          ? `Detached Agrune daemon (pid ${result.pid}); the attached browser was left running.\n`
          : 'No Agrune daemon to detach.\n',
      )
      return 0
    }

    default:
      io.stderr.write(`Unknown command: ${command.join(' ')}\n`)
      return 1
  }
}

async function daemonClientGet(flags: Record<string, string | boolean>, path: string): Promise<unknown> {
  const tabId = getPositiveIntFlag(flags, 'tab')
  return clientFromFlags(flags).request('GET', `${path}${tabId !== undefined ? `?tabId=${tabId}` : ''}`)
}

function defaultRunPath(name: string, ext = 'pdf'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return resolvePath(`.agrune/runs/${stamp}/${name}.${ext}`)
}

async function runStorage(
  verb: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const area = verb.startsWith('session') ? 'session' : 'local'
  const op = verb.split('-')[1]! // get/set/remove/list/clear
  const body: Record<string, unknown> = { area, op, ...tabBody(flags) }
  if (op === 'get' || op === 'remove') {
    const key = positionals[0] ?? getStringFlag(flags, 'key')
    if (!key) throw new CliError('INVALID_COMMAND', `${verb} requires a <key>`)
    body.key = key
  } else if (op === 'set') {
    const key = positionals[0] ?? getStringFlag(flags, 'key')
    if (!key) throw new CliError('INVALID_COMMAND', `${verb} requires a <key> and <value>`)
    body.key = key
    body.value = positionals.slice(1).join(' ') || (getStringFlag(flags, 'value') ?? '')
  }
  print(await clientFromFlags(flags).request('POST', '/storage', body))
  return 0
}

async function runInstall(
  verb: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  io: ProgramIO,
): Promise<number> {
  // `agrune install --skills` writes the bundled SKILL.md into the workspace agent dir (§9 / #30).
  if (verb === 'install' && getBooleanFlag(flags, 'skills')) {
    return installSkills(io)
  }
  const { spawnSync } = await import('node:child_process')
  const browser = verb === 'install-browser' ? (positionals[0] ?? 'chromium') : 'chromium'
  io.stdout.write(`Running: npx playwright install ${browser}\n`)
  const result = spawnSync('npx', ['playwright', 'install', browser], { stdio: 'inherit' })
  return result.status ?? 0
}

async function installSkills(io: ProgramIO): Promise<number> {
  const { fileURLToPath } = await import('node:url')
  // The bundled SKILL.md ships under dist/src/skill/ (and src/skill/ when run un-bundled).
  const candidates = [
    new URL('./skill/SKILL.md', import.meta.url),
    new URL('../src/skill/SKILL.md', import.meta.url),
    new URL('../../src/skill/SKILL.md', import.meta.url),
  ]
  let source: string | undefined
  for (const c of candidates) {
    const p = fileURLToPath(c)
    try {
      source = readFileSync(p, 'utf8')
      break
    } catch {
      /* try next */
    }
  }
  if (source === undefined) {
    throw new CliError('INTERNAL_ERROR', 'Bundled SKILL.md not found in the agrune package.')
  }
  const dest = resolvePath('.claude/skills/agrune/SKILL.md')
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, source)
  io.stdout.write(`Installed agrune skill to ${dest}\n`)
  return 0
}

// ---- perception: targets / snapshot ----------------------------------------

function writeOutputFile(path: string, text: string): string {
  const abs = resolvePath(path)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
  return abs
}

async function runTargets(flags: Record<string, string | boolean>, io: ProgramIO): Promise<number> {
  const json = getBooleanFlag(flags, 'json')
  const tabId = getPositiveIntFlag(flags, 'tab')

  const mode = getStringFlag(flags, 'mode')
  if (mode !== undefined && mode !== 'outline' && mode !== 'full') {
    throw new CliError('INVALID_COMMAND', 'targets mode must be one of: outline, full')
  }

  const groupIdsRaw = getStringFlag(flags, 'group-ids', 'groupIds')
  let groupIds: string[] | undefined
  if (groupIdsRaw !== undefined) {
    groupIds = groupIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (groupIds.length === 0) {
      throw new CliError('INVALID_COMMAND', '--group-ids requires at least one group id')
    }
  }

  const query = tabId !== undefined ? `?tabId=${tabId}` : ''
  const res = await clientFromFlags(flags).request<{ ok: true; snapshot: PageSnapshot }>(
    'GET',
    `/targets${query}`,
  )

  if (json) {
    writeResult(io.stdout, res, { json: true })
    return 0
  }

  const text = formatSnapshot(res.snapshot, {
    full: mode === 'full' || getBooleanFlag(flags, 'full'),
    groupId: getStringFlag(flags, 'group'),
    groupIds,
    targetRef: getStringFlag(flags, 'target'),
    includeTextContent: getBooleanFlag(flags, 'text', 'include-text-content'),
  })

  const filename = getStringFlag(flags, 'filename', 'output')
  if (filename !== undefined) {
    const path = writeOutputFile(filename, text)
    io.stdout.write(`${path}\n`)
    return 0
  }
  io.stdout.write(`${text}\n`)
  return 0
}

async function runSnapshot(flags: Record<string, string | boolean>, io: ProgramIO): Promise<number> {
  const json = getBooleanFlag(flags, 'json')
  const tabId = getPositiveIntFlag(flags, 'tab')
  const params = new URLSearchParams()
  if (tabId !== undefined) params.set('tabId', String(tabId))
  const target = getStringFlag(flags, 'target')
  if (target !== undefined) params.set('target', target)
  const mode = getStringFlag(flags, 'mode')
  if (mode !== undefined) {
    if (mode !== 'ai' && mode !== 'default') {
      throw new CliError('INVALID_COMMAND', 'snapshot mode must be one of: ai, default')
    }
    params.set('mode', mode)
  }
  const depth = getPositiveIntFlag(flags, 'depth')
  if (depth !== undefined) params.set('depth', String(depth))

  const qs = params.toString()
  const res = await clientFromFlags(flags).request<{
    ok: true
    text: string
    mode: string
    target?: string
    depth?: number
  }>('GET', `/snapshot${qs ? `?${qs}` : ''}`)

  if (json) {
    writeResult(io.stdout, res, { json: true })
    return 0
  }
  const filename = getStringFlag(flags, 'filename', 'output')
  if (filename !== undefined) {
    io.stdout.write(`${writeOutputFile(filename, res.text)}\n`)
    return 0
  }
  io.stdout.write(`${res.text}\n`)
  return 0
}

function toInt(value: string | undefined, label: string): number {
  if (value === undefined) throw new CliError('INVALID_COMMAND', `${label} is required`)
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new CliError('INVALID_COMMAND', `${label} must be a positive integer`)
  return n
}

// ---- actions (M4) ----------------------------------------------------------

function requireRef(positionals: string[], verb: string): string {
  const ref = positionals[0]
  if (!ref) throw new CliError('INVALID_COMMAND', `${verb} requires a <target-ref>`)
  return ref
}

async function runClick(
  verb: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const target = requireRef(positionals, verb)
  const action =
    verb === 'hover'
      ? 'hover'
      : verb === 'right-click'
        ? 'contextmenu'
        : verb === 'dblclick' || verb === 'double-click'
          ? 'dblclick'
          : 'click'
  const body: Record<string, unknown> = { target, action, ...tabBody(flags) }
  const button = getStringFlag(flags, 'button')
  if (button !== undefined) body.button = button
  const modifiers = getStringFlag(flags, 'modifiers')
  if (modifiers !== undefined) body.modifiers = modifiers
  if (getBooleanFlag(flags, 'double-click', 'doubleClick')) body.doubleClick = true
  print(await clientFromFlags(flags).request('POST', '/click', body))
  return 0
}

async function runFill(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const target = requireRef(positionals, 'fill')
  const value = positionals.slice(1).join(' ')
  const body: Record<string, unknown> = {
    target,
    value,
    clear: !getBooleanFlag(flags, 'append'),
    ...tabBody(flags),
  }
  const strategy = getStringFlag(flags, 'strategy')
  if (strategy !== undefined) body.strategy = strategy
  print(await clientFromFlags(flags).request('POST', '/fill', body))
  return 0
}

async function runFillForm(
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const raw = getStringFlag(flags, 'fields')
  const file = getStringFlag(flags, 'file')
  let fieldsJson: string
  if (raw !== undefined) fieldsJson = raw
  else if (file !== undefined) fieldsJson = readFileSync(resolvePath(file), 'utf8')
  else throw new CliError('INVALID_COMMAND', 'fill-form requires --fields json or --file path')
  let fields: unknown
  try {
    fields = JSON.parse(fieldsJson)
  } catch (err) {
    throw new CliError('INVALID_COMMAND', `fill-form --fields is not valid JSON: ${(err as Error).message}`)
  }
  print(await clientFromFlags(flags).request('POST', '/fill-form', { fields, ...tabBody(flags) }))
  return 0
}

async function runType(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const target = requireRef(positionals, 'type')
  const text = positionals.slice(1).join(' ')
  const body: Record<string, unknown> = { target, text, submit: getBooleanFlag(flags, 'submit'), ...tabBody(flags) }
  const delay = getPositiveIntFlag(flags, 'delay')
  if (delay !== undefined) body.delayMs = delay
  print(await clientFromFlags(flags).request('POST', '/type', body))
  return 0
}

async function runPress(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  // `press [target] <key>`: 2 positionals → [target, key]; 1 → [key].
  let target = getStringFlag(flags, 'target')
  let key = getStringFlag(flags, 'key')
  if (positionals.length >= 2) {
    target = target ?? positionals[0]
    key = key ?? positionals[1]
  } else if (positionals.length === 1) {
    key = key ?? positionals[0]
  }
  if (!key) throw new CliError('INVALID_COMMAND', 'press requires a <key>')
  const body: Record<string, unknown> = { key, ...tabBody(flags) }
  if (target !== undefined) body.target = target
  const delay = getPositiveIntFlag(flags, 'delay')
  if (delay !== undefined) body.delayMs = delay
  print(await clientFromFlags(flags).request('POST', '/press', body))
  return 0
}

async function runSelect(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const target = requireRef(positionals, 'select')
  const values = positionals.slice(1)
  if (values.length === 0) throw new CliError('INVALID_COMMAND', 'select requires at least one value')
  let mode = getStringFlag(flags, 'mode') ?? 'value'
  if (getBooleanFlag(flags, 'label')) mode = 'label'
  if (getBooleanFlag(flags, 'index')) mode = 'index'
  print(await clientFromFlags(flags).request('POST', '/select', { target, values, mode, ...tabBody(flags) }))
  return 0
}

async function runUpload(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const target = requireRef(positionals, 'upload')
  const paths = positionals.slice(1)
  if (paths.length === 0) throw new CliError('INVALID_COMMAND', 'upload requires at least one path')
  print(await clientFromFlags(flags).request('POST', '/upload', { target, paths, ...tabBody(flags) }))
  return 0
}

async function runDrop(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const target = requireRef(positionals, 'drop')
  const paths = positionals.slice(1)
  const body: Record<string, unknown> = { target, paths, ...tabBody(flags) }
  const data = getStringFlag(flags, 'data')
  if (data !== undefined) {
    try {
      body.data = JSON.parse(data)
    } catch (err) {
      throw new CliError('INVALID_COMMAND', `drop --data is not valid JSON: ${(err as Error).message}`)
    }
  }
  const text = getStringFlag(flags, 'text')
  if (text !== undefined) body.text = text
  const uri = getStringFlag(flags, 'uri')
  if (uri !== undefined) body.uri = uri
  print(await clientFromFlags(flags).request('POST', '/drop', body))
  return 0
}

async function runDrag(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const startTarget = requireRef(positionals, 'drag')
  const endTarget = positionals[1] ?? getStringFlag(flags, 'to')
  if (!endTarget) throw new CliError('INVALID_COMMAND', 'drag requires --to <end-ref> (or a second positional)')
  print(await clientFromFlags(flags).request('POST', '/drag', { startTarget, endTarget, ...tabBody(flags) }))
  return 0
}

async function runWait(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const body: Record<string, unknown> = { ...tabBody(flags) }
  const text = getStringFlag(flags, 'text')
  const textGone = getStringFlag(flags, 'text-gone', 'textGone')
  const timeSec = getStringFlag(flags, 'time')
  const timeMs = getStringFlag(flags, 'time-ms')
  if (positionals[0] !== undefined) {
    body.target = positionals[0]
    body.state = getStringFlag(flags, 'state') ?? 'visible'
  } else if (text !== undefined) body.text = text
  else if (textGone !== undefined) body.textGone = textGone
  else if (timeSec !== undefined) body.timeMs = Math.round(Number(timeSec) * 1000)
  else if (timeMs !== undefined) body.timeMs = Number(timeMs)
  else throw new CliError('INVALID_COMMAND', 'wait requires a <target-ref> or --text/--text-gone/--time')
  const timeout = getPositiveIntFlag(flags, 'timeout')
  if (timeout !== undefined) body.timeoutMs = timeout
  print(await clientFromFlags(flags).request('POST', '/wait', body))
  return 0
}

async function runRead(flags: Record<string, string | boolean>, io: ProgramIO): Promise<number> {
  const tabId = getPositiveIntFlag(flags, 'tab')
  const res = await clientFromFlags(flags).request<{ ok: true; text: string }>(
    'GET',
    `/read${tabId !== undefined ? `?tabId=${tabId}` : ''}`,
  )
  writeResult(io.stdout, res, { json: getBooleanFlag(flags, 'json'), formatter: () => res.text })
  return 0
}

async function runScreenshot(flags: Record<string, string | boolean>, io: ProgramIO): Promise<number> {
  const body: Record<string, unknown> = { ...tabBody(flags) }
  const output = getStringFlag(flags, 'output', 'filename')
  body.path = output ?? defaultScreenshotPath(getStringFlag(flags, 'type'))
  if (getBooleanFlag(flags, 'full-page', 'fullPage')) body.fullPage = true
  const target = getStringFlag(flags, 'target')
  if (target !== undefined) body.target = target
  const type = getStringFlag(flags, 'type')
  if (type !== undefined) body.type = type
  const res = await clientFromFlags(flags).request<{ ok: true; path: string }>('POST', '/screenshot', body)
  writeResult(io.stdout, res, { json: getBooleanFlag(flags, 'json'), formatter: () => res.path })
  return 0
}

function defaultScreenshotPath(type?: string): string {
  const ext = type === 'jpeg' ? 'jpg' : 'png'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return resolvePath(`.agrune/runs/${stamp}/screenshot.${ext}`)
}

async function runEvaluate(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const source =
    getStringFlag(flags, 'expression', 'function') ?? (positionals.length > 0 ? positionals.join(' ') : undefined)
  if (!source) throw new CliError('INVALID_COMMAND', 'evaluate requires <js> (or --expression/--function)')
  const body: Record<string, unknown> = { source, ...tabBody(flags) }
  const target = getStringFlag(flags, 'target')
  if (target !== undefined) body.target = target
  const arg = getStringFlag(flags, 'arg')
  if (arg !== undefined) {
    try {
      body.arg = JSON.parse(arg)
    } catch {
      body.arg = arg
    }
  }
  print(await clientFromFlags(flags).request('POST', '/evaluate', body))
  return 0
}

async function runRunCode(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const body: Record<string, unknown> = { ...tabBody(flags) }
  const file = getStringFlag(flags, 'file', 'filename')
  const code = getStringFlag(flags, 'code') ?? (positionals.length > 0 ? positionals.join(' ') : undefined)
  if (file !== undefined) body.filename = resolvePath(file)
  else if (code !== undefined) body.code = code
  else throw new CliError('INVALID_COMMAND', 'run-code-unsafe requires <js>, --code, or --file')
  print(await clientFromFlags(flags).request('POST', '/run-code-unsafe', body))
  return 0
}

async function runConsole(flags: Record<string, string | boolean>, io: ProgramIO): Promise<number> {
  const params = new URLSearchParams()
  const tabId = getPositiveIntFlag(flags, 'tab')
  if (tabId !== undefined) params.set('tabId', String(tabId))
  const level = getStringFlag(flags, 'level')
  if (level !== undefined) params.set('level', level)
  if (getBooleanFlag(flags, 'all')) params.set('all', '1')
  const qs = params.toString()
  const res = await clientFromFlags(flags).request<{ ok: true; messages: Array<{ level: string; type: string; text: string }> }>(
    'GET',
    `/console${qs ? `?${qs}` : ''}`,
  )
  writeResult(io.stdout, res, {
    json: getBooleanFlag(flags, 'json'),
    formatter: () =>
      res.messages.length === 0
        ? '(no console messages)'
        : res.messages.map((m) => `[${m.level}] ${m.text}`).join('\n'),
  })
  return 0
}

async function runNetwork(
  sub: string | undefined,
  positionals: string[],
  flags: Record<string, string | boolean>,
  io: ProgramIO,
): Promise<number> {
  const tabId = getPositiveIntFlag(flags, 'tab')
  if (sub === 'request') {
    const idxRaw = positionals[0] ?? getStringFlag(flags, 'index')
    if (idxRaw === undefined) throw new CliError('INVALID_COMMAND', 'network request requires an <index>')
    const params = new URLSearchParams()
    if (tabId !== undefined) params.set('tabId', String(tabId))
    params.set('index', idxRaw)
    const part = getStringFlag(flags, 'part')
    if (part !== undefined) params.set('part', part)
    const res = await clientFromFlags(flags).request('GET', `/network/request?${params.toString()}`)
    writeResult(io.stdout, res, { json: getBooleanFlag(flags, 'json') })
    return 0
  }
  const params = new URLSearchParams()
  if (tabId !== undefined) params.set('tabId', String(tabId))
  const filter = getStringFlag(flags, 'filter')
  if (filter !== undefined) params.set('filter', filter)
  if (getBooleanFlag(flags, 'static')) params.set('static', '1')
  if (getBooleanFlag(flags, 'all')) params.set('all', '1')
  const qs = params.toString()
  const res = await clientFromFlags(flags).request<{ ok: true; requests: Array<{ method: string; url: string; status?: number }> }>(
    'GET',
    `/network${qs ? `?${qs}` : ''}`,
  )
  writeResult(io.stdout, res, {
    json: getBooleanFlag(flags, 'json'),
    formatter: () =>
      res.requests.length === 0
        ? '(no network requests)'
        : res.requests.map((r) => `${r.status ?? '...'} ${r.method} ${r.url}`).join('\n'),
  })
  return 0
}

async function runDialogs(flags: Record<string, string | boolean>, io: ProgramIO): Promise<number> {
  const tabId = getPositiveIntFlag(flags, 'tab')
  const res = await clientFromFlags(flags).request<{ ok: true; dialogs: Array<{ type: string; message: string; handled: boolean }> }>(
    'GET',
    `/dialogs${tabId !== undefined ? `?tabId=${tabId}` : ''}`,
  )
  writeResult(io.stdout, res, {
    json: getBooleanFlag(flags, 'json'),
    formatter: () =>
      res.dialogs.length === 0
        ? '(no dialogs)'
        : res.dialogs.map((d) => `${d.type}: ${d.message} ${d.handled ? '[handled]' : '[pending]'}`).join('\n'),
  })
  return 0
}

async function runHandleDialog(
  sub: string | undefined,
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  let accept: boolean
  if (sub === 'accept' || getBooleanFlag(flags, 'accept')) accept = true
  else if (sub === 'dismiss' || getBooleanFlag(flags, 'dismiss')) accept = false
  else throw new CliError('INVALID_COMMAND', 'handle-dialog requires --accept or --dismiss (or "dialog accept|dismiss")')
  const body: Record<string, unknown> = { accept, ...tabBody(flags) }
  const promptText = getStringFlag(flags, 'prompt-text', 'promptText')
  if (promptText !== undefined) body.promptText = promptText
  print(await clientFromFlags(flags).request('POST', '/dialog/handle', body))
  return 0
}

async function runFileChoosers(flags: Record<string, string | boolean>, io: ProgramIO): Promise<number> {
  const tabId = getPositiveIntFlag(flags, 'tab')
  const res = await clientFromFlags(flags).request('GET', `/file-choosers${tabId !== undefined ? `?tabId=${tabId}` : ''}`)
  writeResult(io.stdout, res, { json: getBooleanFlag(flags, 'json') })
  return 0
}

async function runFileUpload(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  print(await clientFromFlags(flags).request('POST', '/file-upload', { paths: positionals, ...tabBody(flags) }))
  return 0
}

// ---- tabs / close ----------------------------------------------------------

async function runTabs(
  sub: string | undefined,
  positionals: string[],
  flags: Record<string, string | boolean>,
  io: ProgramIO,
  print: (value: unknown) => void,
): Promise<number> {
  const client = clientFromFlags(flags)
  switch (sub) {
    case undefined:
    case 'list':
      print(await client.request('GET', '/tabs'))
      return 0

    case 'new': {
      const url = positionals[0]
      if (!url) throw new CliError('INVALID_COMMAND', 'tabs new requires a <url>')
      print(await client.request('POST', '/tabs/new', { url }))
      return 0
    }

    case 'focus':
    case 'select': {
      const body = tabSelectorBody(positionals[0], flags)
      print(await client.request('POST', '/tabs/select', body))
      return 0
    }

    case 'close':
      return runClose(positionals, flags, print)

    default:
      io.stderr.write(`Unknown command: tabs ${sub}\n`)
      return 1
  }
}

async function runClose(
  positionals: string[],
  flags: Record<string, string | boolean>,
  print: (value: unknown) => void,
): Promise<number> {
  const body = tabSelectorBody(positionals[0], flags, true)
  print(await clientFromFlags(flags).request('POST', '/close', body))
  return 0
}

function tabSelectorBody(
  positional: string | undefined,
  flags: Record<string, string | boolean>,
  optional = false,
): Record<string, unknown> {
  const index = getPositiveIntFlag(flags, 'index') ?? getZeroIntFlag(flags, 'index')
  if (positional !== undefined && index !== undefined) {
    throw new CliError('INVALID_COMMAND', 'Use either --index or tabId, not both')
  }
  if (index !== undefined) return { index }
  if (positional !== undefined) {
    const n = Number(positional)
    if (!Number.isInteger(n) || n <= 0) throw new CliError('INVALID_COMMAND', 'tabId must be a positive integer')
    return { tabId: n }
  }
  if (!optional) throw new CliError('INVALID_COMMAND', 'A tabId or --index is required')
  return {}
}

function getZeroIntFlag(flags: Record<string, string | boolean>, name: string): number | undefined {
  const v = flags[name]
  if (v === undefined || v === true || v === false) return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new CliError('INVALID_COMMAND', `--${name} must be a non-negative integer`)
  return n
}

// ---- daemon lifecycle ------------------------------------------------------

async function runDaemon(
  sub: string | undefined,
  flags: Record<string, string | boolean>,
  io: ProgramIO,
): Promise<number> {
  switch (sub) {
    case 'start':
    case 'run':
      return runDaemonForeground(flags, io)

    case 'stop': {
      const result = await stopDaemon()
      io.stdout.write(
        result.stopped
          ? `Stopped Agrune daemon (pid ${result.pid}).\n`
          : 'No Agrune daemon session found for this workspace.\n',
      )
      return 0
    }

    case 'status': {
      const value = await daemonGet(flags, '/health')
      writeResult(io.stdout, value, { json: getBooleanFlag(flags, 'json') })
      return 0
    }

    case 'events': {
      const value = await daemonGet(flags, '/events/history')
      writeResult(io.stdout, value, { json: getBooleanFlag(flags, 'json') })
      return 0
    }

    default:
      io.stderr.write(`Unknown command: daemon ${sub ?? ''}\n`.replace(' \n', '\n'))
      return 1
  }
}

/** Daemon lifecycle GET — talks to the daemon directly, never auto-spawning (§A.2.3). */
async function daemonGet(flags: Record<string, string | boolean>, path: string): Promise<unknown> {
  if (flags.follow === true) throw new CliError('INVALID_COMMAND', '--follow is no longer supported')
  const { endpoint } = getDaemonEndpoint(flags)
  return requestJson(endpoint, 'GET', path)
}

async function runDaemonForeground(
  flags: Record<string, string | boolean>,
  io: ProgramIO,
): Promise<number> {
  const { endpoint } = getDaemonEndpoint(flags)
  const headless = getBooleanFlag(flags, 'headless')
  const attachEndpoint = getStringFlag(flags, 'attach')

  // Guard against a second daemon for the same workspace.
  if (await isHealthy(endpoint)) {
    throw new CliError('DAEMON_ALREADY_RUNNING', `An Agrune daemon is already running at ${endpoint}.`)
  }

  const handle = await startDaemon({ endpoint, headless, attachEndpoint })
  const isUnix = endpoint.startsWith('unix:')
  writeSessionFile({
    pid: process.pid,
    socketPath: isUnix ? endpoint.slice('unix:'.length) : '',
    workspace: workspacePath(),
    startedAt: Date.now(),
    version: CLI_VERSION,
  })
  io.stdout.write(`Agrune daemon listening on ${handle.url}\n`)

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      void handle.close().finally(() => {
        removeSessionFile()
        resolve()
      })
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
  return 0
}
