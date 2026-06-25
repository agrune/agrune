import { describe, it, expect } from 'vitest'
import { runCli } from '../src/program.js'
import { helpText } from '../src/help.js'
import { exitCodeFor, COMMAND_ERROR_CODES } from '../src/errors.js'
import { CLI_VERSION } from '../src/version.js'

function makeIO() {
  let out = ''
  let err = ''
  return {
    io: {
      stdout: { write: (t: string) => void (out += t) },
      stderr: { write: (t: string) => void (err += t) },
    },
    getOut: () => out,
    getErr: () => err,
  }
}

describe('M0 — helpText (A.5 verbatim)', () => {
  it('starts with "agrune CLI" and ends with a trailing newline after "agrune read"', () => {
    const text = helpText()
    expect(text.startsWith('agrune CLI\n')).toBe(true)
    expect(text.endsWith('  agrune read\n')).toBe(true)
  })

  it('contains the exact namespaced + extra verb lines', () => {
    const text = helpText()
    expect(text).toContain(
      '  agrune daemon start [--headless] [--port 47654]   # foreground; default binds the workspace socket',
    )
    expect(text).toContain('  agrune file-upload [path...]   # no paths cancels the pending chooser')
    expect(text).toContain(
      '  agrune targets [--mode outline|full] [--full] [--group <groupId>] [--group-ids csv] [--target <target-ref>] [--text] [--filename path] [--json]',
    )
    expect(text).toContain('  agrune read')
  })
})

describe('M0 — runCli --help / --version', () => {
  it('--help writes helpText verbatim to stdout, exit 0', async () => {
    const { io, getOut, getErr } = makeIO()
    const code = await runCli(['--help'], io)
    expect(code).toBe(0)
    expect(getOut()).toBe(helpText())
    expect(getErr()).toBe('')
  })

  it('no command writes helpText, exit 0', async () => {
    const { io, getOut } = makeIO()
    const code = await runCli([], io)
    expect(code).toBe(0)
    expect(getOut()).toBe(helpText())
  })

  it('--version writes CLI_VERSION + newline, exit 0', async () => {
    const { io, getOut } = makeIO()
    const code = await runCli(['--version'], io)
    expect(code).toBe(0)
    expect(getOut()).toBe(`${CLI_VERSION}\n`)
  })

  it('unknown command writes "Unknown command:" to stderr, exit 1', async () => {
    const { io, getErr } = makeIO()
    const code = await runCli(['frobnicate'], io)
    expect(code).toBe(1)
    expect(getErr()).toBe('Unknown command: frobnicate\n')
  })
})

describe('M0 — exitCodeFor (A.4.3 verbatim)', () => {
  it('maps the four named codes', () => {
    expect(exitCodeFor('DAEMON_UNAVAILABLE')).toBe(4)
    expect(exitCodeFor('SESSION_NOT_ACTIVE')).toBe(4)
    expect(exitCodeFor('TARGET_NOT_FOUND')).toBe(3)
    expect(exitCodeFor('INVALID_MANIFEST')).toBe(3)
  })

  it('every other CommandErrorCode falls through to 1', () => {
    for (const code of COMMAND_ERROR_CODES) {
      if (code === 'TARGET_NOT_FOUND' || code === 'INVALID_MANIFEST' || code === 'SESSION_NOT_ACTIVE') {
        continue
      }
      expect(exitCodeFor(code)).toBe(1)
    }
    expect(exitCodeFor('INTERNAL_ERROR')).toBe(1)
    expect(exitCodeFor('HTTP_ERROR')).toBe(1)
    expect(exitCodeFor('SOME_UNKNOWN_CODE')).toBe(1)
  })

  it('the union has exactly 26 entries in source order', () => {
    expect(COMMAND_ERROR_CODES.length).toBe(26)
    expect(COMMAND_ERROR_CODES[0]).toBe('STALE_SNAPSHOT')
    expect(COMMAND_ERROR_CODES[25]).toBe('NETWORK_RESPONSE_NOT_FOUND')
  })
})
