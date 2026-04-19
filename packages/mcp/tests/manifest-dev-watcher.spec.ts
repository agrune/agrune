import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ManifestDevWatcher,
  MAX_PENDING_SIZE,
  runManifestDevCli,
} from '../src/manifest-dev-watcher'
import type { FSWatcher } from 'chokidar'
import type { PendingCaptureFile } from '../src/pending-store'

// ─── Fake chokidar ──────────────────────────────────────────────────────────

class FakeWatcher extends EventEmitter {
  closed = false
  closeCalls = 0
  async close(): Promise<void> {
    this.closed = true
    this.closeCalls += 1
  }
  /** Test helper — synchronously fire an 'add' event. */
  emitAdd(filePath: string): void {
    this.emit('add', filePath)
  }
}

function makeFakeWatcher(): FakeWatcher {
  return new FakeWatcher()
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const MANIFEST_SRC = `import { defineManifest, defineTarget } from '@agrune/manifest'

export default defineManifest({
  version: 3,
  targets: [],
})
`

function makePending(targetId: string): PendingCaptureFile {
  return {
    ts: 1700000000000,
    sessionId: 'sess_abc',
    url: 'https://example.com/login',
    targets: [
      {
        targetId,
        selector: { css: '#login' },
      },
    ],
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLog() {
  const info: string[] = []
  const warn: string[] = []
  const error: string[] = []
  return {
    info,
    warn,
    error,
    log: {
      info: (m: string) => info.push(m),
      warn: (m: string) => warn.push(m),
      error: (m: string) => error.push(m),
    },
  }
}

/** Wait for async processPending to complete. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

/** Poll until predicate returns true or budget exhausted (default 2s). */
async function waitFor(
  predicate: () => boolean,
  budgetMs = 2000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < budgetMs) {
    if (predicate()) return
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  // Final check — throw if still false
  if (!predicate()) throw new Error('waitFor: predicate timed out')
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ManifestDevWatcher (Phase 16 RECORD-03)', () => {
  let workDir: string
  let manifestPath: string
  let pendingRoot: string

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'agrune-watcher-'))
    manifestPath = join(workDir, 'manifest.ts')
    pendingRoot = join(workDir, 'pending')
    writeFileSync(manifestPath, MANIFEST_SRC, 'utf-8')
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('W1: add event triggers read + merge + confirm prompt', async () => {
    const { log, info } = makeLog()
    const fake = makeFakeWatcher()
    const confirmPrompt = vi.fn(async (_diff: string) => false) // declined
    const pendingDir = join(pendingRoot, 'sess_abc')
    const pendingFile = join(pendingDir, '1700000000000.json')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(pendingDir, { recursive: true })
    writeFileSync(pendingFile, JSON.stringify(makePending('login_1')))

    const watcher = new ManifestDevWatcher(manifestPath, {
      watcherFactory: () => fake as unknown as FSWatcher,
      confirmPrompt,
      pendingRoot,
      log,
    })
    await watcher.start()
    fake.emitAdd(pendingFile)
    await waitFor(() => confirmPrompt.mock.calls.length >= 1)

    expect(confirmPrompt).toHaveBeenCalledTimes(1)
    // diff preview was logged before the prompt
    expect(info.some((m) => m.includes('@@'))).toBe(true)
    await watcher.stop()
  })

  it('W2: declined confirm leaves manifest.ts unchanged and pending file intact', async () => {
    const { log, info } = makeLog()
    const fake = makeFakeWatcher()
    const pendingDir = join(pendingRoot, 'sess_abc')
    const pendingFile = join(pendingDir, '1700000000000.json')
    const { mkdirSync, existsSync } = await import('node:fs')
    mkdirSync(pendingDir, { recursive: true })
    writeFileSync(pendingFile, JSON.stringify(makePending('login_1')))

    const watcher = new ManifestDevWatcher(manifestPath, {
      watcherFactory: () => fake as unknown as FSWatcher,
      confirmPrompt: async () => false,
      pendingRoot,
      log,
    })
    await watcher.start()
    fake.emitAdd(pendingFile)
    // Wait for the "skipped (user declined)" marker log from processPending.
    await waitFor(() => info.some((m) => /skipped \(user declined\)/.test(m)))

    // manifest.ts unchanged
    const post = await readFile(manifestPath, 'utf-8')
    expect(post).toBe(MANIFEST_SRC)
    // pending file still present
    expect(existsSync(pendingFile)).toBe(true)
    await watcher.stop()
  })

  it('W3: confirm=y writes manifest.ts AND deletes the pending file', async () => {
    const { log, info } = makeLog()
    const fake = makeFakeWatcher()
    const pendingDir = join(pendingRoot, 'sess_abc')
    const pendingFile = join(pendingDir, '1700000000000.json')
    const { mkdirSync, existsSync } = await import('node:fs')
    mkdirSync(pendingDir, { recursive: true })
    writeFileSync(pendingFile, JSON.stringify(makePending('login_1')))

    const watcher = new ManifestDevWatcher(manifestPath, {
      watcherFactory: () => fake as unknown as FSWatcher,
      confirmPrompt: async () => true,
      pendingRoot,
      log,
    })
    await watcher.start()
    fake.emitAdd(pendingFile)
    // Wait for the "merged: ..." completion marker from processPending.
    await waitFor(() => info.some((m) => /\[manifest dev\] merged:/.test(m)))

    const post = await readFile(manifestPath, 'utf-8')
    expect(post).toContain('login_1')
    expect(post).toContain('defineTarget({')
    expect(existsSync(pendingFile)).toBe(false)
    await watcher.stop()
  })

  it('W4: MergeError is logged and pending stays put (no crash)', async () => {
    const { log, warn } = makeLog()
    const fake = makeFakeWatcher()
    const pendingDir = join(pendingRoot, 'sess_abc')
    const pendingFile = join(pendingDir, '1700000000000.json')
    const { mkdirSync, existsSync } = await import('node:fs')
    mkdirSync(pendingDir, { recursive: true })
    // Inject a pending file with a traversal-unsafe targetId → INVALID_TARGET_ID
    const bad: PendingCaptureFile = {
      ts: 1,
      sessionId: 'sess',
      url: '',
      targets: [{ targetId: '../x', selector: { css: '#login' } }],
    }
    writeFileSync(pendingFile, JSON.stringify(bad))

    const confirmPrompt = vi.fn(async () => true)
    const watcher = new ManifestDevWatcher(manifestPath, {
      watcherFactory: () => fake as unknown as FSWatcher,
      confirmPrompt,
      pendingRoot,
      log,
    })
    await watcher.start()
    fake.emitAdd(pendingFile)
    await waitFor(() => warn.some((m) => /INVALID_TARGET_ID/.test(m)))

    // Confirm was never called because we errored before the preview
    expect(confirmPrompt).not.toHaveBeenCalled()
    expect(warn.some((m) => /INVALID_TARGET_ID/.test(m))).toBe(true)
    // pending still present
    expect(existsSync(pendingFile)).toBe(true)
    await watcher.stop()
  })

  it('W5: runManifestDevCli([]) — missing arg → exit 1', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const code = await runManifestDevCli([])
    expect(code).toBe(1)
    expect(stderr).toHaveBeenCalled()
    stderr.mockRestore()
  })

  it('W6: runManifestDevCli(["/nonexistent.ts"]) — missing file → exit 1', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const code = await runManifestDevCli([join(workDir, 'does-not-exist.ts')])
    expect(code).toBe(1)
    const writes = stderr.mock.calls.map(([m]) => String(m))
    expect(writes.some((m) => /file not found/i.test(m))).toBe(true)
    stderr.mockRestore()
  })

  it('W7: runManifestDevCli(["manifest.txt"]) — wrong extension → exit 1 (T-16-11)', async () => {
    const bad = join(workDir, 'manifest.txt')
    writeFileSync(bad, 'stub', 'utf-8')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const code = await runManifestDevCli([bad])
    expect(code).toBe(1)
    const writes = stderr.mock.calls.map(([m]) => String(m))
    expect(writes.some((m) => /\.ts or \.tsx/i.test(m))).toBe(true)
    stderr.mockRestore()
  })

  it('W8: oversize pending (>256KB) is skipped with a warning (T-16-15)', async () => {
    const { log, warn } = makeLog()
    const fake = makeFakeWatcher()
    const pendingDir = join(pendingRoot, 'sess_big')
    const pendingFile = join(pendingDir, '1700000000000.json')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(pendingDir, { recursive: true })
    // Make a file larger than MAX_PENDING_SIZE. Contents don't need to be
    // valid JSON — the size gate fires first.
    const blob = 'x'.repeat(MAX_PENDING_SIZE + 1024)
    writeFileSync(pendingFile, blob)

    const watcher = new ManifestDevWatcher(manifestPath, {
      watcherFactory: () => fake as unknown as FSWatcher,
      confirmPrompt: async () => true,
      pendingRoot,
      log,
    })
    await watcher.start()
    fake.emitAdd(pendingFile)
    await waitFor(() => warn.some((m) => /skip large pending/i.test(m)))

    expect(warn.some((m) => /skip large pending/i.test(m))).toBe(true)
    // manifest.ts untouched
    const post = await readFile(manifestPath, 'utf-8')
    expect(post).toBe(MANIFEST_SRC)
    await watcher.stop()
  })

  it('W9: start then stop closes the underlying watcher', async () => {
    const { log } = makeLog()
    const fake = makeFakeWatcher()
    const watcher = new ManifestDevWatcher(manifestPath, {
      watcherFactory: () => fake as unknown as FSWatcher,
      confirmPrompt: async () => false,
      pendingRoot,
      log,
    })
    await watcher.start()
    await watcher.stop()
    expect(fake.closed).toBe(true)
    expect(fake.closeCalls).toBe(1)
  })
})
