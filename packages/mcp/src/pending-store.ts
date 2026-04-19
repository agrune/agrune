import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'

// ─── Constants ──────────────────────────────────────────────────────────────

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/
const TARGET_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * On-disk shape of a pending capture file. The recorder UI commits one file
 * per capture, indexed by `<sessionId>/<ts>.json`. Task 16-03 (manifest dev
 * watcher) consumes these files and merges them into the source manifest.ts
 * via ts-morph.
 *
 * Trust boundary: devtools-server validates the inbound WS `recorder_commit`
 * payload with `isValidCommitPayload` and RecorderController hardens sessionId
 * and targetId with PendingStore sanitizers before a write reaches disk.
 */
export interface PendingCaptureFile {
  ts: number
  sessionId: string
  url: string
  targets: Array<{
    targetId: string
    selector: unknown // validated at author-time via @agrune/manifest schema; kept loose here for storage
    sensitive?: true
  }>
}

// ─── Class ──────────────────────────────────────────────────────────────────

/**
 * Filesystem write surface for the recorder authoring flow. All writes are
 * pinned beneath `rootDir` (default: `$HOME/.agrune/authoring/pending`). The
 * sanitizers + path-relative containment checks together block the T-16-02
 * traversal and T-16-06 elevation threats.
 */
export class PendingStore {
  readonly rootDir: string

  constructor(rootDir: string = join(homedir(), '.agrune', 'authoring', 'pending')) {
    this.rootDir = rootDir
  }

  /**
   * Validate a sessionId for use as a directory component.
   *
   * Accept: 1-128 chars, `[A-Za-z0-9_-]` only.
   * Reject (T-16-02): `..`, path separators, empty string, over-length input.
   */
  static sanitizeSessionId(id: string): string {
    if (typeof id !== 'string' || !SESSION_ID_RE.test(id)) {
      throw new Error(`Invalid sessionId: ${id === '' ? '<empty>' : JSON.stringify(id)}`)
    }
    return id
  }

  /**
   * Validate a targetId for use in pending JSON. Plan 03 (ts-morph) will
   * re-check before touching source, but we want to hard-stop injection
   * payloads (T-16-03) at the MCP boundary too.
   */
  static sanitizeTargetId(id: string): string {
    if (typeof id !== 'string' || !TARGET_ID_RE.test(id)) {
      throw new Error(`Invalid targetId: ${id === '' ? '<empty>' : JSON.stringify(id)}`)
    }
    return id
  }

  /**
   * Write a pending capture file, returning its absolute path.
   * Path is `<rootDir>/<sessionId>/<payload.ts>.json`.
   *
   * Defense-in-depth: after sanitizeSessionId the resulting directory is
   * re-checked with `path.relative` so that a future refactor cannot
   * reintroduce T-16-02.
   */
  async writePending(sessionId: string, payload: PendingCaptureFile): Promise<string> {
    const safe = PendingStore.sanitizeSessionId(sessionId)
    const dir = join(this.rootDir, safe)
    const rel = relative(this.rootDir, dir)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Path traversal detected for sessionId ${safe}`)
    }
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, `${payload.ts}.json`)
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return filePath
  }

  /**
   * Delete a specific pending file. Refuses any path that does not resolve
   * beneath `rootDir` (T-16-06 — arbitrary-file-write elevation prevention).
   */
  async deletePending(filePath: string): Promise<void> {
    const rel = relative(this.rootDir, filePath)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Path outside pending dir: ${filePath}`)
    }
    await rm(filePath, { force: true })
  }

  /**
   * Remove all pending files whose mtime is older than `maxAgeMs`.
   * Returns count of files deleted. Empty session directories are also
   * cleaned up (T-16-05 — unbounded disk growth mitigation).
   */
  async cleanup(maxAgeMs = SEVEN_DAYS_MS): Promise<number> {
    let removed = 0
    let sessionDirs: string[]
    try {
      sessionDirs = await readdir(this.rootDir)
    } catch {
      return 0
    }
    const cutoff = Date.now() - maxAgeMs
    for (const session of sessionDirs) {
      const dir = join(this.rootDir, session)
      let entries: string[]
      try {
        const s = await stat(dir)
        if (!s.isDirectory()) continue
        entries = await readdir(dir)
      } catch {
        continue
      }
      let remaining = 0
      for (const name of entries) {
        const file = join(dir, name)
        try {
          const s = await stat(file)
          if (!s.isFile()) continue
          if (s.mtimeMs < cutoff) {
            await rm(file, { force: true })
            removed += 1
          } else {
            remaining += 1
          }
        } catch {
          // best effort — skip
        }
      }
      if (remaining === 0) {
        await rm(dir, { recursive: true, force: true })
      }
    }
    return removed
  }
}
