import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runTypesCli } from '../src/cli/types.js'
import { writeCacheEntry } from '../src/cache.js'
import { writeLockfile } from '../src/lockfile.js'
import type { RegistryEntry } from '../src/schema.js'
import type { Lockfile } from '../src/lockfile.js'

let tmpCache: string
let cwd: string
let stdoutSpy: ReturnType<typeof vi.spyOn>
let stderrSpy: ReturnType<typeof vi.spyOn>
let stdoutChunks: string[]
let stderrChunks: string[]

function entryOf(host: string, targetIds: string[]): RegistryEntry {
  return {
    registry: {
      host,
      version: '1.0.0',
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
          targets: targetIds.map((tid) => ({
            targetId: tid,
            actionKinds: ['click' as const],
            selector: { role: { name: 'Button' } },
          })),
        },
      ],
    },
  }
}

function lockOf(entries: Array<{ host: string; version: string }>): Lockfile {
  return {
    version: 1,
    entries: entries.map((e) => ({
      host: e.host,
      version: e.version,
      contentHash: 'sha256:' + '0'.repeat(64),
      tier: 'community',
      fetchedAt: '2026-04-20T00:00:00.000Z',
      source: `https://example.com/manifests/${e.host}@${e.version}.json`,
      allowedEnvironments: ['dev'],
    })),
  }
}

beforeEach(async () => {
  tmpCache = await mkdtemp(join(tmpdir(), 'agrune-cli-types-cache-'))
  cwd = await mkdtemp(join(tmpdir(), 'agrune-cli-types-cwd-'))
  process.env.AGRUNE_CACHE_DIR = tmpCache
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
  await rm(tmpCache, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

describe('runTypesCli', () => {
  it('emits d.ts with AgruneMapsHost union for all lockfile hosts', async () => {
    await writeCacheEntry(entryOf('news.ycombinator.com', ['storyLink', 'upVoteButton']))
    await writeCacheEntry(entryOf('en.wikipedia.org', ['searchBox']))
    await writeLockfile(
      cwd,
      lockOf([
        { host: 'news.ycombinator.com', version: '1.0.0' },
        { host: 'en.wikipedia.org', version: '1.0.0' },
      ]),
    )

    const outPath = join(cwd, 'maps.d.ts')
    const code = await runTypesCli(['--out', outPath, '--cwd', cwd])
    expect(code).toBe(0)
    const dts = await readFile(outPath, 'utf8')
    expect(dts).toContain("'news.ycombinator.com'")
    expect(dts).toContain("'en.wikipedia.org'")
    expect(dts).toContain('AgruneMapsHost')
  })

  it('emits per-host targetId unions in AgruneMapsTargetIds', async () => {
    await writeCacheEntry(entryOf('pypi.org', ['searchQuery', 'searchSubmit']))
    await writeLockfile(cwd, lockOf([{ host: 'pypi.org', version: '1.0.0' }]))
    const outPath = join(cwd, 'maps.d.ts')
    await runTypesCli(['--out', outPath, '--cwd', cwd])
    const dts = await readFile(outPath, 'utf8')
    expect(dts).toMatch(/'pypi\.org': 'searchQuery' \| 'searchSubmit'/)
  })

  it('honours --out to redirect output path', async () => {
    await writeCacheEntry(entryOf('hn.algolia.com', ['searchInput']))
    await writeLockfile(cwd, lockOf([{ host: 'hn.algolia.com', version: '1.0.0' }]))
    const customOut = join(cwd, 'custom/out/maps-types.d.ts')
    const code = await runTypesCli(['--out', customOut, '--cwd', cwd])
    expect(code).toBe(0)
    const dts = await readFile(customOut, 'utf8')
    expect(dts).toContain('hn.algolia.com')
  })

  it('emits never when lockfile is empty and exits 0', async () => {
    await writeLockfile(cwd, { version: 1, entries: [] })
    const outPath = join(cwd, 'maps.d.ts')
    const code = await runTypesCli(['--out', outPath, '--cwd', cwd])
    expect(code).toBe(0)
    const dts = await readFile(outPath, 'utf8')
    expect(dts).toContain('export type AgruneMapsHost = never')
  })

  it('includes repeat targetIds in per-host union as repeatId:targetId', async () => {
    const entry: RegistryEntry = {
      registry: {
        host: 'todomvc.example',
        version: '1.0.0',
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
                targetId: 'header',
                actionKinds: ['click'],
                selector: { role: { name: 'Button' } },
              },
            ],
            repeats: [
              {
                repeatId: 'todoItem',
                template: 'todoItem_${key}',
                keyFrom: 'el.dataset.todoId',
                strategy: 'dom' as const,
                targets: [
                  {
                    targetId: 'deleteButton',
                    actionKinds: ['click'],
                    selector: { role: { name: 'Button' } },
                  },
                ],
              },
            ],
          },
        ],
      },
    }
    await writeCacheEntry(entry)
    await writeLockfile(cwd, lockOf([{ host: 'todomvc.example', version: '1.0.0' }]))
    const outPath = join(cwd, 'maps.d.ts')
    await runTypesCli(['--out', outPath, '--cwd', cwd])
    const dts = await readFile(outPath, 'utf8')
    expect(dts).toContain("'header'")
    expect(dts).toContain("'todoItem:deleteButton'")
  })
})
