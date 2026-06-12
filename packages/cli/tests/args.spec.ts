import { describe, expect, it } from 'vitest'
import { getDaemonEndpoint, parseArgs } from '../src/args'

describe('parseArgs', () => {
  it('keeps a single-word command and positional URL separate', () => {
    const parsed = parseArgs(['open', 'http://localhost:5173', '--json'])
    expect(parsed.command).toEqual(['open'])
    expect(parsed.positionals).toEqual(['http://localhost:5173'])
    expect(parsed.flags.json).toBe(true)
  })

  it('keeps daemon subcommands as a two-word command', () => {
    const parsed = parseArgs(['daemon', 'start', '--headless', '--port', '47654'])
    expect(parsed.command).toEqual(['daemon', 'start'])
    expect(parsed.positionals).toEqual([])
    expect(parsed.flags.headless).toBe(true)
    expect(parsed.flags.port).toBe('47654')
  })

  it('keeps tabs subcommands as a two-word command', () => {
    const parsed = parseArgs(['tabs', 'focus', '2', '--json'])
    expect(parsed.command).toEqual(['tabs', 'focus'])
    expect(parsed.positionals).toEqual(['2'])
    expect(parsed.flags.json).toBe(true)
  })

  it('parses zero-based tabs index flags', () => {
    const parsed = parseArgs(['tabs', 'select', '--index', '0', '--json'])
    expect(parsed.command).toEqual(['tabs', 'select'])
    expect(parsed.positionals).toEqual([])
    expect(parsed.flags.index).toBe('0')
    expect(parsed.flags.json).toBe(true)
  })

  it('keeps network request as a two-word command', () => {
    const parsed = parseArgs(['network', 'request', '3', '--part', 'response-body'])
    expect(parsed.command).toEqual(['network', 'request'])
    expect(parsed.positionals).toEqual(['3'])
    expect(parsed.flags.part).toBe('response-body')
  })

  it('keeps dialog accept as a two-word command', () => {
    const parsed = parseArgs(['dialog', 'accept', '--prompt-text', 'Ada'])
    expect(parsed.command).toEqual(['dialog', 'accept'])
    expect(parsed.positionals).toEqual([])
    expect(parsed.flags['prompt-text']).toBe('Ada')
  })

  it('keeps daemon events as a two-word command', () => {
    const parsed = parseArgs(['daemon', 'events', '--follow', '--no-replay'])
    expect(parsed.command).toEqual(['daemon', 'events'])
    expect(parsed.flags.follow).toBe(true)
    expect(parsed.flags['no-replay']).toBe(true)
  })

  it('keeps evaluate source and JSON arg separate', () => {
    const parsed = parseArgs(['evaluate', '--target', 'save_button', '--arg={"suffix":"!"}', '--', 'arg => document.title + arg.suffix'])
    expect(parsed.command).toEqual(['evaluate'])
    expect(parsed.flags.target).toBe('save_button')
    expect(parsed.flags.arg).toBe('{"suffix":"!"}')
    expect(parsed.positionals).toEqual(['arg => document.title + arg.suffix'])
  })

  it('keeps negative JSON arg when passed with equals syntax', () => {
    const parsed = parseArgs(['evaluate', '--arg=-1', 'arg => arg'])
    expect(parsed.command).toEqual(['evaluate'])
    expect(parsed.flags.arg).toBe('-1')
    expect(parsed.positionals).toEqual(['arg => arg'])
  })

  it('parses target filtering flags for targets snapshots', () => {
    const parsed = parseArgs(['targets', '--group-ids', 'main,secondary', '--target', 'save_button'])
    expect(parsed.command).toEqual(['targets'])
    expect(parsed.flags['group-ids']).toBe('main,secondary')
    expect(parsed.flags.target).toBe('save_button')
    expect(parsed.positionals).toEqual([])
  })
})

describe('getDaemonEndpoint', () => {
  it('defaults to the per-workspace unix socket (auto-spawn eligible)', () => {
    const endpoint = getDaemonEndpoint({})
    expect(endpoint.explicit).toBe(false)
    expect(endpoint.baseUrl).toMatch(/^unix:.+/)
  })

  it('pins a TCP endpoint when --port is given (no auto-spawn)', () => {
    expect(getDaemonEndpoint({ port: '47654' })).toEqual({
      host: '127.0.0.1',
      port: 47654,
      baseUrl: 'http://127.0.0.1:47654',
      explicit: true,
    })
  })

  it('honors AGRUNE_DAEMON_SOCKET as an explicit socket endpoint', () => {
    const previous = process.env.AGRUNE_DAEMON_SOCKET
    process.env.AGRUNE_DAEMON_SOCKET = '/tmp/custom-agrune.sock'
    try {
      expect(getDaemonEndpoint({})).toEqual({
        baseUrl: 'unix:/tmp/custom-agrune.sock',
        explicit: true,
      })
    } finally {
      if (previous === undefined) delete process.env.AGRUNE_DAEMON_SOCKET
      else process.env.AGRUNE_DAEMON_SOCKET = previous
    }
  })
})
