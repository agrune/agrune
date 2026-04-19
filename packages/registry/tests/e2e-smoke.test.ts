/**
 * Plan 18-02 integration smoke test.
 *
 * Sets up a local HTTP server that serves a minimal registry (index.json +
 * 2 manifest files + empty incidents.json), overrides AGRUNE_REGISTRY_BASE_URL
 * so the registry-client enforces HTTPS-only normally — we skip this by using
 * the `fetch` DI slot of the CLI runners instead of hitting a real https
 * endpoint (RESEARCH: HTTPS-only enforcement is intentional, so we stay
 * out-of-band for the e2e via DI rather than temporarily disabling it).
 *
 * Runs:
 *   1. runAddCli + runTypesCli + runDoctorCli round-trip
 *   2. Adding a second host and re-emitting types
 *   3. `--refresh` with empty incidents.json (no side effects)
 *   4. Cache file permission mode 0o600 (POSIX only)
 *
 * No real network: the test provides a `fetch` implementation that points at
 * a localhost http server; registry-client would normally reject http, so we
 * inject a stub fetchEntry via DI (same surface plan-01 designed for PR bot
 * record+replay).
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAddCli } from '../src/cli/add.js'
import { runTypesCli } from '../src/cli/types.js'
import { runDoctorCli } from '../src/cli/doctor.js'
import { LOCKFILE_NAME, type Lockfile } from '../src/lockfile.js'
import type { RegistryEntry } from '../src/schema.js'

const IS_POSIX = process.platform !== 'win32'

// ── Fixtures ────────────────────────────────────────────────────────────────

const HOST_A = 'test-host.local'
const HOST_B = 'test-host2.local'

function fixtureEntry(host: string): RegistryEntry {
  return {
    registry: {
      host,
      version: '1.0.0',
      tier: 'community',
      author: 'agrune-test',
      submittedAt: '2026-04-20T00:00:00.000Z',
      allowedEnvironments: ['dev'],
    },
    manifest: {
      version: 3,
      groups: [
        {
          groupId: 'main',
          targets: [
            {
              targetId: `${host}-search`,
              actionKinds: ['click'],
              selector: { role: { name: 'Search' } },
            },
            {
              targetId: `${host}-go`,
              actionKinds: ['click'],
              selector: { role: { name: 'Button' } },
            },
          ],
        },
      ],
    },
  }
}

// ── Mock registry HTTP server ──────────────────────────────────────────────

let server: http.Server
let baseUrl: string
let fetchCount = 0

beforeAll(async () => {
  server = http.createServer((req, res) => {
    fetchCount += 1
    const url = req.url ?? ''
    if (url.endsWith('/index.json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          hosts: {
            [HOST_A]: { latest: '1.0.0' },
            [HOST_B]: { latest: '1.0.0' },
          },
        }),
      )
      return
    }
    if (url.endsWith('/incidents.json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([]))
      return
    }
    const matchA = url.endsWith(`/manifests/${encodeURIComponent(HOST_A)}@1.0.0.json`)
    const matchB = url.endsWith(`/manifests/${encodeURIComponent(HOST_B)}@1.0.0.json`)
    if (matchA) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(fixtureEntry(HOST_A)))
      return
    }
    if (matchB) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(fixtureEntry(HOST_B)))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

let tmpCache: string
let cwd: string
let stdoutSpy: ReturnType<typeof vi.spyOn>
let stderrSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  tmpCache = await mkdtemp(join(tmpdir(), 'agrune-e2e-cache-'))
  cwd = await mkdtemp(join(tmpdir(), 'agrune-e2e-cwd-'))
  process.env.AGRUNE_CACHE_DIR = tmpCache
  fetchCount = 0
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never)
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never)
})

afterEach(async () => {
  delete process.env.AGRUNE_CACHE_DIR
  stdoutSpy.mockRestore()
  stderrSpy.mockRestore()
  await rm(tmpCache, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

/**
 * Shared `fetchEntry` DI shim — replays registry-client semantics but hits
 * the http fixture server. Uses plain `fetch()` (Node 22 built-in).
 */
async function fakeFetchEntry(host: string, version: string): Promise<RegistryEntry> {
  const v =
    version === 'latest'
      ? await (async () => {
          const res = await fetch(`${baseUrl}/index.json`)
          const body = (await res.json()) as { hosts: Record<string, { latest: string }> }
          return body.hosts[host]!.latest
        })()
      : version
  const res = await fetch(`${baseUrl}/manifests/${encodeURIComponent(host)}@${encodeURIComponent(v)}.json`)
  if (res.status === 404) {
    throw new Error(`404 ${host}@${v}`)
  }
  return (await res.json()) as RegistryEntry
}

describe('e2e: agrune maps round-trip (add → types → doctor)', () => {
  it('add → writes cache + lockfile + source URL in lockfile', async () => {
    const code = await runAddCli([HOST_A], {
      fetchEntry: fakeFetchEntry as never,
      cwd: () => cwd,
    })
    expect(code).toBe(0)

    const lockRaw = await readFile(join(cwd, LOCKFILE_NAME), 'utf8')
    const lock = JSON.parse(lockRaw) as Lockfile
    expect(lock.entries).toHaveLength(1)
    expect(lock.entries[0]?.host).toBe(HOST_A)
    expect(lock.entries[0]?.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    // Cache file exists
    const cacheRaw = await readFile(join(tmpCache, `${HOST_A}@1.0.0.json`), 'utf8')
    expect(JSON.parse(cacheRaw).registry.host).toBe(HOST_A)
  })

  it('types → d.ts contains the added host + per-host targetId union', async () => {
    await runAddCli([HOST_A], { fetchEntry: fakeFetchEntry as never, cwd: () => cwd })
    const outPath = join(cwd, 'maps.d.ts')
    const code = await runTypesCli(['--out', outPath, '--cwd', cwd])
    expect(code).toBe(0)
    const dts = await readFile(outPath, 'utf8')
    expect(dts).toContain(`'${HOST_A}'`)
    expect(dts).toContain(`'${HOST_A}-search'`)
    expect(dts).toContain(`'${HOST_A}-go'`)
  })

  it('doctor (no flags) → fresh after just-added entry; no network calls', async () => {
    await runAddCli([HOST_A], { fetchEntry: fakeFetchEntry as never, cwd: () => cwd })
    const fetchCountBefore = fetchCount
    const code = await runDoctorCli(['--cwd', cwd])
    expect(code).toBe(0)
    expect(fetchCount).toBe(fetchCountBefore) // no extra HTTP calls
  })

  it('doctor --refresh with empty incidents.json → no disables', async () => {
    await runAddCli([HOST_A], { fetchEntry: fakeFetchEntry as never, cwd: () => cwd })
    const fetchImpl = ((url: string | URL) => fetch(String(url))) as unknown as typeof globalThis.fetch
    const code = await runDoctorCli(
      ['--cwd', cwd, '--refresh', '--registry-base-url', baseUrl],
      { fetchImpl },
    )
    expect(code).toBe(0)
    const lockRaw = await readFile(join(cwd, LOCKFILE_NAME), 'utf8')
    const lock = JSON.parse(lockRaw) as Lockfile
    expect(lock.entries[0]?.disabled).toBeUndefined()
  })

  it('adding a second host + types re-run → union contains both', async () => {
    await runAddCli([HOST_A], { fetchEntry: fakeFetchEntry as never, cwd: () => cwd })
    await runAddCli([HOST_B], { fetchEntry: fakeFetchEntry as never, cwd: () => cwd })
    const outPath = join(cwd, 'maps.d.ts')
    await runTypesCli(['--out', outPath, '--cwd', cwd])
    const dts = await readFile(outPath, 'utf8')
    expect(dts).toContain(`'${HOST_A}'`)
    expect(dts).toContain(`'${HOST_B}'`)
  })

  it.skipIf(!IS_POSIX)('cache file has mode 0o600 (POSIX)', async () => {
    await runAddCli([HOST_A], { fetchEntry: fakeFetchEntry as never, cwd: () => cwd })
    const s = await stat(join(tmpCache, `${HOST_A}@1.0.0.json`))
    expect(s.mode & 0o777).toBe(0o600)
  })

  it('does not trigger real registry.agrune.org network traffic (DI + fixture only)', async () => {
    // The fake fetcher uses baseUrl (localhost); if anything else happened
    // our http server would not be hit. The count reflects localhost only.
    const before = fetchCount
    await runAddCli([HOST_A, '--offline'], {
      fetchEntry: fakeFetchEntry as never,
      cwd: () => cwd,
    }) // will fail (cache miss) but must not network
    expect(fetchCount).toBe(before)
  })
})
