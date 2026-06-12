import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from './types.js'
import { defaultSocketPath } from './session-file.js'

export interface ParsedArgs {
  command: string[]
  flags: Record<string, string | boolean>
  positionals: string[]
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = []
  const flags: Record<string, string | boolean> = {}
  const positionals: string[] = []
  let parsingFlags = true

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (parsingFlags && arg === '--') {
      parsingFlags = false
      continue
    }

    if (parsingFlags && arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=')
      if (eqIdx > 2) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1)
        continue
      }

      const name = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('-')) {
        flags[name] = next
        i += 1
      } else {
        flags[name] = true
      }
      continue
    }

    if (command.length === 0) {
      command.push(arg)
    } else if ((command[0] === 'daemon' || command[0] === 'dialog' || command[0] === 'network' || command[0] === 'tab' || command[0] === 'tabs') && command.length === 1) {
      command.push(arg)
    } else {
      positionals.push(arg)
    }
  }

  return { command, flags, positionals }
}

export function getStringFlag(
  flags: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

export function getBooleanFlag(
  flags: Record<string, string | boolean>,
  name: string,
): boolean {
  const value = flags[name]
  if (value === true) return true
  if (typeof value === 'string') return value !== 'false'
  return false
}

export interface DaemonEndpointInfo {
  /**
   * Opaque endpoint token consumed by daemon-client:
   * `unix:<socketPath>` (default, per-workspace) or `http://host:port`
   * (explicit --host/--port — tests and remote daemons).
   */
  baseUrl: string
  /** true when the user pinned the endpoint (--host/--port/AGRUNE_DAEMON_SOCKET) — skip auto-spawn. */
  explicit: boolean
  host?: string
  port?: number
}

export function getDaemonEndpoint(flags: Record<string, string | boolean>): DaemonEndpointInfo {
  const hostFlag = getStringFlag(flags, 'host')
  const portValue = getStringFlag(flags, 'port')

  if (hostFlag !== undefined || portValue !== undefined) {
    const host = hostFlag ?? DEFAULT_DAEMON_HOST
    const port = portValue ? Number(portValue) : DEFAULT_DAEMON_PORT
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      throw new Error(`Invalid --port value: ${portValue}`)
    }
    return { baseUrl: `http://${host}:${port}`, explicit: true, host, port }
  }

  const envSocket = process.env.AGRUNE_DAEMON_SOCKET
  if (envSocket && envSocket.trim().length > 0) {
    return { baseUrl: `unix:${envSocket.trim()}`, explicit: true }
  }

  return { baseUrl: `unix:${defaultSocketPath()}`, explicit: false }
}
