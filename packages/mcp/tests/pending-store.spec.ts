import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PendingStore } from '../src/pending-store'
import type { PendingCaptureFile } from '../src/pending-store'

describe('PendingStore (Phase 16 RECORD-02)', () => {
  let root: string
  let store: PendingStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agrune-pending-'))
    store = new PendingStore(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('P1: sanitizeSessionId accepts alphanumerics, dashes, underscores', () => {
    expect(PendingStore.sanitizeSessionId('abc-123_XYZ')).toBe('abc-123_XYZ')
  })

  it('P2: sanitizeSessionId rejects path-traversal attempts (T-16-02)', () => {
    expect(() => PendingStore.sanitizeSessionId('../etc')).toThrow(/Invalid sessionId/i)
    expect(() => PendingStore.sanitizeSessionId('a/b')).toThrow(/Invalid sessionId/i)
    expect(() => PendingStore.sanitizeSessionId('')).toThrow(/Invalid sessionId/i)
  })

  it('P3: sanitizeSessionId rejects over-length input (>128 chars)', () => {
    expect(() => PendingStore.sanitizeSessionId('a'.repeat(129))).toThrow(/Invalid sessionId/i)
    // exactly 128 ok
    expect(PendingStore.sanitizeSessionId('a'.repeat(128))).toBe('a'.repeat(128))
  })

  it('P4: writePending creates ~/.agrune/.../<sessionId>/<ts>.json with JSON content', async () => {
    const payload: PendingCaptureFile = {
      ts: 1700000000000,
      sessionId: 'sess_abc',
      url: 'https://example.com',
      targets: [
        {
          targetId: 'loginButton_1',
          selector: { css: 'button.login' },
        },
      ],
    }
    const filePath = await store.writePending('sess_abc', payload)
    expect(filePath).toBe(join(root, 'sess_abc', '1700000000000.json'))
    const written = JSON.parse(await readFile(filePath, 'utf-8'))
    expect(written.targets[0].targetId).toBe('loginButton_1')
    expect(written.url).toBe('https://example.com')
  })

  it('P5: writePending rejects path-traversal sessionId upfront', async () => {
    const payload: PendingCaptureFile = {
      ts: 1,
      sessionId: '../etc',
      url: '',
      targets: [],
    }
    await expect(store.writePending('../etc', payload)).rejects.toThrow(/Invalid sessionId/i)
  })

  it('P6: cleanup deletes files older than maxAgeMs, keeps fresh ones', async () => {
    const sessionDir = join(root, 'sess_old')
    await mkdir(sessionDir, { recursive: true })
    const oldFile = join(sessionDir, '111.json')
    const freshFile = join(sessionDir, '222.json')
    await writeFile(oldFile, '{}', 'utf-8')
    await writeFile(freshFile, '{}', 'utf-8')
    // backdate oldFile mtime
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    const { utimesSync } = await import('node:fs')
    utimesSync(oldFile, eightDaysAgo / 1000, eightDaysAgo / 1000)
    const removed = await store.cleanup()
    expect(removed).toBeGreaterThanOrEqual(1)
    // old file gone
    await expect(stat(oldFile)).rejects.toMatchObject({ code: 'ENOENT' })
    // fresh file preserved
    const s = await stat(freshFile)
    expect(s.isFile()).toBe(true)
  })

  it('P7: deletePending refuses paths outside pendingRoot (T-16-06)', async () => {
    const outside = join(tmpdir(), 'not-agrune-file.json')
    await writeFile(outside, '{}', 'utf-8')
    await expect(store.deletePending(outside)).rejects.toThrow(/Path outside pending dir/i)
    // sanity: file still present
    const s = await stat(outside)
    expect(s.isFile()).toBe(true)
    rmSync(outside, { force: true })
  })

  it('P8: sanitizeTargetId accepts safe names and rejects injections (T-16-03)', () => {
    expect(PendingStore.sanitizeTargetId('loginButton_1')).toBe('loginButton_1')
    expect(() => PendingStore.sanitizeTargetId("x'); drop;--")).toThrow(/Invalid targetId/i)
    expect(() => PendingStore.sanitizeTargetId('')).toThrow(/Invalid targetId/i)
    expect(() => PendingStore.sanitizeTargetId('a'.repeat(65))).toThrow(/Invalid targetId/i)
  })
})
