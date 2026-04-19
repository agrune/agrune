import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDoctorCli } from '../src/cli/doctor.js'
import { writeLockfile, LOCKFILE_NAME, type Lockfile, type LockfileEntry } from '../src/lockfile.js'

let cwd: string
let stdoutSpy: ReturnType<typeof vi.spyOn>
let stderrSpy: ReturnType<typeof vi.spyOn>
let stdoutChunks: string[]
let stderrChunks: string[]

const NOW = new Date('2026-04-20T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function entry(host: string, fetchedDaysAgo: number, overrides: Partial<LockfileEntry> = {}): LockfileEntry {
  return {
    host,
    version: '1.0.0',
    contentHash: 'sha256:' + '0'.repeat(64),
    tier: 'community',
    fetchedAt: new Date(NOW.getTime() - fetchedDaysAgo * DAY_MS).toISOString(),
    source: `https://example.com/manifests/${host}@1.0.0.json`,
    allowedEnvironments: ['dev'],
    ...overrides,
  }
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'agrune-cli-doctor-cwd-'))
  stdoutChunks = []
  stderrChunks = []
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    stdoutChunks.push(String(chunk))
    return true
  }) as never)
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    stderrChunks.push(String(chunk))
    return true
  }) as never)
})

afterEach(async () => {
  stdoutSpy.mockRestore()
  stderrSpy.mockRestore()
  await rm(cwd, { recursive: true, force: true })
})

describe('runDoctorCli', () => {
  it('exits 0 when all entries are fresh', async () => {
    const lock: Lockfile = { version: 1, entries: [entry('a.example', 2), entry('b.example', 1)] }
    await writeLockfile(cwd, lock)
    const code = await runDoctorCli(['--cwd', cwd], { now: () => NOW })
    expect(code).toBe(0)
  })

  it('exits 0 but prints info line for week_old entry', async () => {
    const lock: Lockfile = { version: 1, entries: [entry('a.example', 10)] }
    await writeLockfile(cwd, lock)
    const code = await runDoctorCli(['--cwd', cwd], { now: () => NOW })
    expect(code).toBe(0)
    expect(stdoutChunks.join('')).toContain('week_old')
  })

  it('exits 0 and warns on stale entry', async () => {
    const lock: Lockfile = { version: 1, entries: [entry('a.example', 30)] }
    await writeLockfile(cwd, lock)
    const code = await runDoctorCli(['--cwd', cwd], { now: () => NOW })
    expect(code).toBe(0)
    expect(stdoutChunks.join('')).toContain('stale')
    expect(stdoutChunks.join('')).toContain('--auto-disable')
  })

  it('with --auto-disable persists disabled field on stale entry', async () => {
    const lock: Lockfile = { version: 1, entries: [entry('a.example', 30)] }
    await writeLockfile(cwd, lock)
    const code = await runDoctorCli(['--cwd', cwd, '--auto-disable'], { now: () => NOW })
    expect(code).toBe(0)
    const raw = await readFile(join(cwd, LOCKFILE_NAME), 'utf8')
    const written = JSON.parse(raw) as Lockfile
    expect(written.entries[0]?.disabled).toEqual({
      reason: 'stale',
      at: NOW.toISOString(),
    })
  })

  it('with --refresh fetches incidents.json and revokes listed hosts', async () => {
    const lock: Lockfile = { version: 1, entries: [entry('a.example', 2)] }
    await writeLockfile(cwd, lock)
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ host: 'a.example', reason: 'typosquatting' }]), {
        status: 200,
      }),
    )
    const code = await runDoctorCli(
      ['--cwd', cwd, '--refresh', '--registry-base-url', 'https://registry.example.com'],
      { now: () => NOW, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch },
    )
    expect(code).toBe(0)
    expect(fetchImpl).toHaveBeenCalledWith('https://registry.example.com/incidents.json')
    const raw = await readFile(join(cwd, LOCKFILE_NAME), 'utf8')
    const written = JSON.parse(raw) as Lockfile
    expect(written.entries[0]?.disabled?.reason).toBe('revoked')
  })

  it('does NOT perform any network fetch without --refresh', async () => {
    const lock: Lockfile = { version: 1, entries: [entry('a.example', 30)] }
    await writeLockfile(cwd, lock)
    const fetchImpl = vi.fn()
    await runDoctorCli(['--cwd', cwd], {
      now: () => NOW,
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 0 and prints helpful message when lockfile is empty', async () => {
    await writeLockfile(cwd, { version: 1, entries: [] })
    const code = await runDoctorCli(['--cwd', cwd], { now: () => NOW })
    expect(code).toBe(0)
    expect(stdoutChunks.join('')).toContain('No entries')
  })
})
