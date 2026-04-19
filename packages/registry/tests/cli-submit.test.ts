import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runSubmitCli, PLACEHOLDER_CLIENT_ID } from '../src/cli/submit.js'
import type { RegistryEntry } from '../src/schema.js'

let tmp: string
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

/**
 * Build a mock Octokit that records every call and returns canned successful
 * responses for the submit flow.
 */
function mockOctokit() {
  const calls: Record<string, unknown[]> = {
    'users.getAuthenticated': [],
    'repos.getContent': [],
    'repos.createFork': [],
    'repos.createOrUpdateFileContents': [],
    'pulls.create': [],
  }
  return {
    calls,
    octokit: {
      users: {
        getAuthenticated: vi.fn(async () => {
          calls['users.getAuthenticated']!.push({})
          return { data: { login: 'alice' } }
        }),
      },
      repos: {
        getContent: vi.fn(async (args: unknown) => {
          calls['repos.getContent']!.push(args)
          const err = Object.assign(new Error('not found'), { status: 404 })
          throw err
        }),
        createFork: vi.fn(async (args: unknown) => {
          calls['repos.createFork']!.push(args)
          return { status: 202 }
        }),
        createOrUpdateFileContents: vi.fn(async (args: unknown) => {
          calls['repos.createOrUpdateFileContents']!.push(args)
          return { status: 201 }
        }),
      },
      pulls: {
        create: vi.fn(async (args: unknown) => {
          calls['pulls.create']!.push(args)
          return { data: { html_url: 'https://github.com/agrune/maps/pull/42' } }
        }),
      },
    },
  }
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'agrune-cli-submit-'))
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
  delete process.env.AGRUNE_GITHUB_TOKEN
  delete process.env.AGRUNE_OAUTH_CLIENT_ID
  await rm(tmp, { recursive: true, force: true })
})

describe('runSubmitCli', () => {
  it('returns 1 with usage when <file> is missing', async () => {
    const code = await runSubmitCli([])
    expect(code).toBe(1)
    expect(stderrChunks.join('')).toContain('Usage: agrune maps submit')
  })

  it('with AGRUNE_GITHUB_TOKEN skips device flow and creates a PR', async () => {
    process.env.AGRUNE_GITHUB_TOKEN = 'ghp_test_fake_token'
    const file = join(tmp, 'entry.json')
    await writeFile(file, JSON.stringify(sampleEntry()), 'utf8')
    const m = mockOctokit()
    const deviceFlow = vi.fn()
    const createOctokit = vi.fn(() => m.octokit as unknown as Parameters<typeof runSubmitCli>[1] extends infer D ? D extends { createOctokit?: (t: string) => infer O } ? O : never : never)

    const code = await runSubmitCli([file], {
      createOctokit: createOctokit as never,
      deviceFlow: deviceFlow as never,
    })
    expect(code).toBe(0)
    expect(deviceFlow).not.toHaveBeenCalled()
    expect(createOctokit).toHaveBeenCalledWith('ghp_test_fake_token')
    expect(m.calls['repos.createFork']).toHaveLength(1)
    expect(m.calls['repos.createOrUpdateFileContents']).toHaveLength(1)
    expect(m.calls['pulls.create']).toHaveLength(1)
    expect(stdoutChunks.join('')).toContain('https://github.com/agrune/maps/pull/42')
  })

  it('triggers device flow when no env token is set and surfaces verification details', async () => {
    const file = join(tmp, 'entry.json')
    await writeFile(file, JSON.stringify(sampleEntry()), 'utf8')
    const m = mockOctokit()
    const deviceFlow = vi.fn(
      async (
        _clientId: string,
        onV: (v: { verification_uri: string; user_code: string }) => void,
      ) => {
        onV({ verification_uri: 'https://github.com/login/device', user_code: 'ABCD-1234' })
        return 'device-flow-token'
      },
    )
    const code = await runSubmitCli([file], {
      createOctokit: (() => m.octokit) as never,
      deviceFlow: deviceFlow as never,
    })
    expect(code).toBe(0)
    expect(deviceFlow).toHaveBeenCalledTimes(1)
    const out = stdoutChunks.join('')
    expect(out).toContain('github.com/login/device')
    expect(out).toContain('ABCD-1234')
    // stderr should warn about placeholder client_id since AGRUNE_OAUTH_CLIENT_ID is unset
    expect(stderrChunks.join('')).toContain('placeholder OAuth client_id')
  })

  it('calls createFork / createOrUpdateFileContents / pulls.create in the right repo / branch', async () => {
    process.env.AGRUNE_GITHUB_TOKEN = 'ghp_test_fake_token'
    const file = join(tmp, 'entry.json')
    const entry = sampleEntry('pypi.org', '2.1.3')
    await writeFile(file, JSON.stringify(entry), 'utf8')
    const m = mockOctokit()
    await runSubmitCli([file], {
      createOctokit: (() => m.octokit) as never,
      deviceFlow: vi.fn() as never,
    })
    expect(m.calls['repos.createFork'][0]).toMatchObject({ owner: 'agrune', repo: 'maps' })
    expect(m.calls['repos.createOrUpdateFileContents'][0]).toMatchObject({
      owner: 'alice',
      repo: 'maps',
      path: 'manifests/pypi.org@2.1.3.json',
      branch: 'submit/pypi.org-2.1.3',
    })
    expect(m.calls['pulls.create'][0]).toMatchObject({
      owner: 'agrune',
      repo: 'maps',
      head: 'alice:submit/pypi.org-2.1.3',
      base: 'main',
    })
  })

  it('does NOT persist token to disk (Pitfall 2 structural assertion)', async () => {
    const file = join(tmp, 'entry.json')
    await writeFile(file, JSON.stringify(sampleEntry()), 'utf8')
    const m = mockOctokit()
    const deviceFlow = vi.fn(
      async (
        _clientId: string,
        onV: (v: { verification_uri: string; user_code: string }) => void,
      ) => {
        onV({ verification_uri: 'https://github.com/login/device', user_code: 'ABCD-1234' })
        return 'device-flow-token-that-must-not-leak'
      },
    )
    await runSubmitCli([file], {
      createOctokit: (() => m.octokit) as never,
      deviceFlow: deviceFlow as never,
    })
    // No `.auth*` file anywhere under the typical persistence locations.
    // We check the tmp dir (what agrune cache-dir tests use) plus
    // ~/.agrune/maps/ (the real cache dir). Neither should contain auth files.
    const itemsTmp = await readdir(tmp).catch(() => [] as string[])
    expect(itemsTmp.filter((f) => f.startsWith('.auth') || f.includes('auth.json'))).toEqual([])
    const cacheDir = join(homedir(), '.agrune', 'maps')
    const cacheItems = await readdir(cacheDir).catch(() => [] as string[])
    expect(cacheItems.filter((f) => f.startsWith('.auth') || f.includes('auth.json'))).toEqual([])
  })

  it('warns when AGRUNE_OAUTH_CLIENT_ID equals placeholder', async () => {
    const file = join(tmp, 'entry.json')
    await writeFile(file, JSON.stringify(sampleEntry()), 'utf8')
    const m = mockOctokit()
    await runSubmitCli([file], {
      createOctokit: (() => m.octokit) as never,
      deviceFlow: (async (_cid: string, onV: (v: { verification_uri: string; user_code: string }) => void) => {
        onV({ verification_uri: 'u', user_code: 'c' })
        return 't'
      }) as never,
    })
    expect(stderrChunks.join('')).toContain(PLACEHOLDER_CLIENT_ID.length > 0 ? 'placeholder OAuth client_id' : '')
  })

  it('does NOT warn when AGRUNE_OAUTH_CLIENT_ID is set to a non-placeholder value', async () => {
    process.env.AGRUNE_OAUTH_CLIENT_ID = 'my-real-oauth-client-id'
    const file = join(tmp, 'entry.json')
    await writeFile(file, JSON.stringify(sampleEntry()), 'utf8')
    const m = mockOctokit()
    await runSubmitCli([file], {
      createOctokit: (() => m.octokit) as never,
      deviceFlow: (async (cid: string, onV: (v: { verification_uri: string; user_code: string }) => void) => {
        expect(cid).toBe('my-real-oauth-client-id')
        onV({ verification_uri: 'u', user_code: 'c' })
        return 't'
      }) as never,
    })
    expect(stderrChunks.join('')).not.toContain('placeholder OAuth client_id')
  })

  it('supports --dry-run (no PR creation)', async () => {
    process.env.AGRUNE_GITHUB_TOKEN = 'ghp_test_fake_token'
    const file = join(tmp, 'entry.json')
    await writeFile(file, JSON.stringify(sampleEntry()), 'utf8')
    const m = mockOctokit()
    const code = await runSubmitCli([file, '--dry-run'], {
      createOctokit: (() => m.octokit) as never,
      deviceFlow: vi.fn() as never,
    })
    expect(code).toBe(0)
    expect(m.calls['pulls.create']).toHaveLength(0)
    expect(m.calls['repos.createFork']).toHaveLength(0)
    expect(stdoutChunks.join('')).toContain('dry-run complete')
  })

  it('rejects non-.json manifest files (v0.5 MVP)', async () => {
    const file = join(tmp, 'entry.ts')
    await writeFile(file, 'export default {}\n', 'utf8')
    const code = await runSubmitCli([file], {
      createOctokit: vi.fn() as never,
      deviceFlow: vi.fn() as never,
    })
    expect(code).toBe(1)
    expect(stderrChunks.join('')).toContain('REGISTRY_SCHEMA_INVALID')
  })
})
