import { mkdtemp, rm, stat, symlink, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RegistryEntry } from '../src/schema.js'
import {
  clearCache,
  getCacheDir,
  readCacheEntry,
  writeCacheEntry,
} from '../src/cache.js'
import { RegistryError } from '../src/errors.js'

const IS_POSIX = process.platform !== 'win32'

let tmp: string

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
  tmp = await mkdtemp(join(tmpdir(), 'agrune-cache-test-'))
  process.env.AGRUNE_CACHE_DIR = tmp
})

afterEach(async () => {
  delete process.env.AGRUNE_CACHE_DIR
  await rm(tmp, { recursive: true, force: true })
})

describe('getCacheDir', () => {
  it('honors AGRUNE_CACHE_DIR env override', () => {
    expect(getCacheDir()).toBe(tmp)
  })

  it('falls back to ~/.agrune/maps when env var is unset', async () => {
    delete process.env.AGRUNE_CACHE_DIR
    const os = await import('node:os')
    expect(getCacheDir()).toBe(join(os.homedir(), '.agrune', 'maps'))
  })
})

describe('writeCacheEntry / readCacheEntry', () => {
  it('round-trips a RegistryEntry through disk', async () => {
    const entry = sampleEntry()
    await writeCacheEntry(entry)
    const reloaded = await readCacheEntry(entry.registry.host, entry.registry.version)
    expect(reloaded).toEqual(entry)
  })

  it('returns null when cache file is missing (not an error)', async () => {
    expect(await readCacheEntry('absent.example', '9.9.9')).toBeNull()
  })

  it.skipIf(!IS_POSIX)('creates dir with mode 0o700 and file with mode 0o600 (POSIX)', async () => {
    const entry = sampleEntry()
    await writeCacheEntry(entry)
    const dirStat = await stat(tmp)
    const fileStat = await stat(
      join(tmp, `${entry.registry.host}@${entry.registry.version}.json`),
    )
    // Lower 9 bits = permission mask.
    expect(dirStat.mode & 0o777).toBe(0o700)
    expect(fileStat.mode & 0o777).toBe(0o600)
  })

  it.skipIf(!IS_POSIX)('refuses to write over a symlink target (Pitfall T-18-08)', async () => {
    const entry = sampleEntry()
    await mkdir(tmp, { recursive: true })
    const target = join(tmp, `${entry.registry.host}@${entry.registry.version}.json`)
    const elsewhere = join(tmp, 'elsewhere.json')
    await writeFile(elsewhere, '{}', 'utf8')
    await symlink(elsewhere, target)

    await expect(writeCacheEntry(entry)).rejects.toMatchObject({
      code: 'CACHE_PERMISSION_DENIED',
    })
  })

  it('rejects host containing path traversal characters', async () => {
    await expect(readCacheEntry('../etc/passwd', '1.0.0')).rejects.toBeInstanceOf(RegistryError)
  })

  it('re-validates cache content via RegistryEntrySchema (Pitfall 5 defense-in-depth)', async () => {
    const badPath = join(tmp, 'tampered.example@1.0.0.json')
    // Hand-write a file that would satisfy JSON.parse but fails schema.
    await writeFile(badPath, JSON.stringify({ registry: { host: 'tampered.example' } }), 'utf8')
    await expect(readCacheEntry('tampered.example', '1.0.0')).rejects.toBeInstanceOf(RegistryError)
  })
})

describe('clearCache', () => {
  it('removes the cache directory', async () => {
    await writeCacheEntry(sampleEntry())
    await clearCache()
    await expect(stat(tmp)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
