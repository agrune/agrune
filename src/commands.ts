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

    case 'resize': {
      const width = getPositiveIntFlag(flags, 'width') ?? toInt(positionals[0], 'width')
      const height = getPositiveIntFlag(flags, 'height') ?? toInt(positionals[1], 'height')
      print(await clientFromFlags(flags).request('POST', '/resize', { width, height, ...tabBody(flags) }))
      return 0
    }

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

    default:
      io.stderr.write(`Unknown command: ${command.join(' ')}\n`)
      return 1
  }
}

function toInt(value: string | undefined, label: string): number {
  if (value === undefined) throw new CliError('INVALID_COMMAND', `${label} is required`)
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new CliError('INVALID_COMMAND', `${label} must be a positive integer`)
  return n
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

  // Guard against a second daemon for the same workspace.
  if (await isHealthy(endpoint)) {
    throw new CliError('DAEMON_ALREADY_RUNNING', `An Agrune daemon is already running at ${endpoint}.`)
  }

  const handle = await startDaemon({ endpoint, headless })
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
