import { describe, it, expect } from 'vitest'
import {
  workspaceHash,
  defaultSocketPath,
  getDaemonEndpoint,
} from '../src/registry.js'

describe('M1 — workspace hash & socket path (§7.1 / A.1.2)', () => {
  it('hash is a deterministic 12-hex-char sha256 prefix', () => {
    const h = workspaceHash('/Users/chenjing/dev/agrune/agrune')
    expect(h).toMatch(/^[0-9a-f]{12}$/)
    expect(workspaceHash('/Users/chenjing/dev/agrune/agrune')).toBe(h)
  })

  it('default socket path lives under ~/.agrune/run/<hash>/daemon.sock on posix', () => {
    if (process.platform === 'win32') return
    const p = defaultSocketPath('/Users/chenjing/dev/agrune/agrune')
    expect(p).toMatch(/\.agrune\/run\/[0-9a-f]{12}\/daemon\.sock$/)
  })
})

describe('M1 — endpoint precedence (A.1.2)', () => {
  it('--host/--port → http://… explicit', () => {
    const e = getDaemonEndpoint({ host: '127.0.0.1', port: '47999' })
    expect(e.endpoint).toBe('http://127.0.0.1:47999')
    expect(e.explicit).toBe(true)
  })

  it('AGRUNE_DAEMON_SOCKET → unix:… explicit (when no host/port)', () => {
    const prev = process.env.AGRUNE_DAEMON_SOCKET
    process.env.AGRUNE_DAEMON_SOCKET = '/tmp/custom.sock'
    try {
      const e = getDaemonEndpoint({})
      expect(e.endpoint).toBe('unix:/tmp/custom.sock')
      expect(e.explicit).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.AGRUNE_DAEMON_SOCKET
      else process.env.AGRUNE_DAEMON_SOCKET = prev
    }
  })

  it('default → unix workspace socket, non-explicit (auto-spawns)', () => {
    const prev = process.env.AGRUNE_DAEMON_SOCKET
    delete process.env.AGRUNE_DAEMON_SOCKET
    try {
      const e = getDaemonEndpoint({})
      expect(e.endpoint.startsWith('unix:')).toBe(true)
      expect(e.explicit).toBe(false)
    } finally {
      if (prev !== undefined) process.env.AGRUNE_DAEMON_SOCKET = prev
    }
  })
})
