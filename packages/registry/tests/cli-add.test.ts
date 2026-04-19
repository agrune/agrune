import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAddCli } from '../src/cli/add.js'
import { RegistryError } from '../src/errors.js'
import type { RegistryEntry } from '../src/schema.js'
import { LOCKFILE_NAME } from '../src/lockfile.js'

let tmp: string
let cwd: string
let stdoutSpy: ReturnType<typeof vi.spyOn>
let stderrSpy: ReturnType<typeof vi.spyOn>
let stdoutChunks: string[]
let stderrChunks: string[]

function sampleEntry(host = 'news.ycombinator.com', version = '1.0.0'): RegistryEntry {
  return {
    registry: {
      host,
      version,
      tier: 'community',
      author: 'alice',
      submittedAt: '2026-04-20T12:00:00.000Z',
      allowedEnvironments: ['dev'],
    },
    manifest: {
      version: 3,
      groups: [
        {
          groupId: 'main',
          targets: [
            {
              targetId: 'search',
              actionKinds: ['click'],
              selector: { role: { name: 'Search' } },
            },
          ],
        },
      ],
    },
  }
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'agrune-cli-add-cache-'))
  cwd = await mkdtemp(join(tmpdir(), 'agrune-cli-add-cwd-'))
  process.env.AGRUNE_CACHE_DIR = tmp
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
  delete process.env.AGRUNE_CACHE_DIR
  stdoutSpy.mockRestore()
  stderrSpy.mockRestore()
  await rm(tmp, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

describe('runAddCli', () => {
  it('returns 1 with usage when host is missing', async () => {
    const code = await runAddCli([])
    expect(code).toBe(1)
    expect(stderrChunks.join('')).toContain('Usage: agrune maps add')
  })

  it('fetches latest, writes cache, updates lockfile, returns 0', async () => {
    const entry = sampleEntry()
    const fetchEntry = vi.fn().mockResolvedValue(entry)
    const code = await runAddCli(['news.ycombinator.com'], {
      fetchEntry,
      cwd: () => cwd,
    })
    expect(code).toBe(0)
    expect(fetchEntry).toHaveBeenCalledWith('news.ycombinator.com', 'latest', expect.any(Object))

    const lockRaw = await readFile(join(cwd, LOCKFILE_NAME), 'utf8')
    const lock = JSON.parse(lockRaw) as { entries: Array<{ host: string; contentHash: string }> }
    expect(lock.entries).toHaveLength(1)
    expect(lock.entries[0]?.host).toBe('news.ycombinator.com')
    expect(lock.entries[0]?.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    const cacheRaw = await readFile(
      join(tmp, `news.ycombinator.com@1.0.0.json`),
      'utf8',
    )
    expect(JSON.parse(cacheRaw)).toEqual(entry)
    expect(stdoutChunks.join('')).toContain('Added news.ycombinator.com@1.0.0')
  })

  it('fetches exact version when [version] positional is provided', async () => {
    const entry = sampleEntry('pypi.org', '2.1.3')
    const fetchEntry = vi.fn().mockResolvedValue(entry)
    const code = await runAddCli(['pypi.org', '2.1.3'], {
      fetchEntry,
      cwd: () => cwd,
    })
    expect(code).toBe(0)
    expect(fetchEntry).toHaveBeenCalledWith('pypi.org', '2.1.3', expect.any(Object))
  })

  it('returns 1 when fetch throws REGISTRY_ENTRY_NOT_FOUND', async () => {
    const fetchEntry = vi.fn().mockRejectedValue(
      new RegistryError('REGISTRY_ENTRY_NOT_FOUND', 'not in registry'),
    )
    const code = await runAddCli(['ghost.example'], {
      fetchEntry,
      cwd: () => cwd,
    })
    expect(code).toBe(1)
    const stderr = stderrChunks.join('')
    expect(stderr).toContain('REGISTRY_ENTRY_NOT_FOUND')
  })

  it('is idempotent — running twice upserts (host unique in lockfile)', async () => {
    const entry = sampleEntry()
    const fetchEntry = vi.fn().mockResolvedValue(entry)
    await runAddCli(['news.ycombinator.com'], { fetchEntry, cwd: () => cwd })
    await runAddCli(['news.ycombinator.com'], { fetchEntry, cwd: () => cwd })
    const lockRaw = await readFile(join(cwd, LOCKFILE_NAME), 'utf8')
    const lock = JSON.parse(lockRaw) as { entries: Array<{ host: string }> }
    expect(lock.entries).toHaveLength(1)
    expect(lock.entries.filter((e) => e.host === 'news.ycombinator.com')).toHaveLength(1)
  })

  it('with --offline uses cache only', async () => {
    const entry = sampleEntry('cached.example', '1.0.0')
    const { writeCacheEntry } = await import('../src/cache.js')
    await writeCacheEntry(entry)

    const fetchEntry = vi.fn() // must not be called
    const code = await runAddCli(['cached.example', '1.0.0', '--offline'], {
      fetchEntry,
      cwd: () => cwd,
    })
    expect(code).toBe(0)
    expect(fetchEntry).not.toHaveBeenCalled()
  })

  it('with --offline fails when cache is empty', async () => {
    const fetchEntry = vi.fn()
    const code = await runAddCli(['ghost.example', '1.0.0', '--offline'], {
      fetchEntry,
      cwd: () => cwd,
    })
    expect(code).toBe(1)
    expect(fetchEntry).not.toHaveBeenCalled()
    expect(stderrChunks.join('')).toContain('REGISTRY_ENTRY_NOT_FOUND')
  })
})
