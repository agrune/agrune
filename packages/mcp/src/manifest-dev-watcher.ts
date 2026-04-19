import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join, resolve as resolvePath } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { PendingStore, type PendingCaptureFile } from './pending-store.js'
import { MergeError, mergeTargetIntoManifest } from './manifest-merger.js'

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Hard size cap on a single pending JSON before ts-morph is invoked
 * (T-16-15). A normal capture is < 2 KB; 256 KB covers generous payloads
 * while keeping hostile input out of the AST pipeline.
 */
export const MAX_PENDING_SIZE = 256 * 1024

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ManifestDevWatcherLog {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

export interface ManifestDevWatcherDeps {
  /** Build a chokidar-like watcher. Override for tests. */
  watcherFactory?: (root: string) => FSWatcher
  /**
   * Prompt the user for `y/n` confirmation. Must return `true` **only** for
   * exact `y` (case-insensitive) — any other input, including empty strings,
   * returns `false`. T-16-13 demands explicit consent.
   */
  confirmPrompt?: (diff: string) => Promise<boolean>
  pendingStore?: PendingStore
  log?: ManifestDevWatcherLog
  /** Override for tests — base dir for pending files. */
  pendingRoot?: string
}

// ─── Watcher class ───────────────────────────────────────────────────────────

/**
 * Watches `$HOME/.agrune/authoring/pending/` and, on each new JSON file,
 * (1) reads + parses + validates size, (2) runs `mergeTargetIntoManifest`,
 * (3) prints a diff preview, (4) prompts for explicit `y` confirmation,
 * and (5) only then writes the merged text back to `manifestPath` and
 * deletes the pending file.
 *
 * Dependency injection is used throughout so tests can drive chokidar
 * emissions and mock `confirmPrompt` without touching real stdin.
 *
 * T-16-12 — the pending root is fixed to `$HOME/.agrune/authoring/pending`
 * (or an injected test path) and cannot be overridden via CLI args or
 * environment variables.
 * T-16-16 — chokidar's `awaitWriteFinish` is enabled so we never read a
 * partially-written pending JSON.
 */
export class ManifestDevWatcher {
  private watcher: FSWatcher | null = null
  private readonly pendingStore: PendingStore
  private readonly confirmPrompt: (diff: string) => Promise<boolean>
  private readonly log: ManifestDevWatcherLog
  private readonly watcherFactory: (root: string) => FSWatcher
  private readonly pendingRoot: string

  constructor(
    private readonly manifestPath: string,
    deps: ManifestDevWatcherDeps = {},
  ) {
    this.pendingRoot =
      deps.pendingRoot ?? join(homedir(), '.agrune', 'authoring', 'pending')
    this.pendingStore = deps.pendingStore ?? new PendingStore(this.pendingRoot)
    this.confirmPrompt = deps.confirmPrompt ?? defaultConfirmPrompt
    this.log = deps.log ?? {
      info: (m) => process.stderr.write(`${m}\n`),
      warn: (m) => process.stderr.write(`${m}\n`),
      error: (m) => process.stderr.write(`${m}\n`),
    }
    this.watcherFactory =
      deps.watcherFactory ??
      ((root) =>
        chokidarWatch(root, {
          persistent: true,
          ignoreInitial: false,
          depth: 2,
          awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        }))
  }

  async start(): Promise<void> {
    this.watcher = this.watcherFactory(this.pendingRoot)
    this.watcher.on('add', (filePath: string) => {
      // Only react to JSON under the pending root — defence-in-depth if the
      // injected factory returns a watcher whose scope ever drifts.
      if (extname(filePath) !== '.json') return
      void this.processPending(filePath).catch((err) => {
        this.log.error(
          `[manifest dev] process error: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    })
    this.log.info(
      `[manifest dev] watching ${this.pendingRoot} → ${this.manifestPath}`,
    )
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Handle a single pending JSON. Any failure here is logged and swallowed —
   * one bad file should not kill the watcher loop, so the user can fix the
   * JSON (or delete it) and the next `add` event retries.
   */
  private async processPending(filePath: string): Promise<void> {
    // Size cap (T-16-15)
    let sizeInfo
    try {
      sizeInfo = await stat(filePath)
    } catch (err) {
      this.log.error(
        `[manifest dev] stat failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    if (sizeInfo.size > MAX_PENDING_SIZE) {
      this.log.warn(
        `[manifest dev] skip large pending (>${MAX_PENDING_SIZE}B): ${filePath}`,
      )
      return
    }

    // Parse pending JSON
    let raw: string
    try {
      raw = await readFile(filePath, 'utf-8')
    } catch (err) {
      this.log.error(
        `[manifest dev] read failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    let pending: PendingCaptureFile
    try {
      pending = JSON.parse(raw) as PendingCaptureFile
    } catch {
      this.log.error(`[manifest dev] invalid JSON: ${filePath}`)
      return
    }

    // Read current manifest source
    let sourceText: string
    try {
      sourceText = await readFile(this.manifestPath, 'utf-8')
    } catch (err) {
      this.log.error(
        `[manifest dev] cannot read manifest ${this.manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }

    // Merge
    let result: ReturnType<typeof mergeTargetIntoManifest>
    try {
      result = mergeTargetIntoManifest(sourceText, pending, this.manifestPath)
    } catch (err) {
      if (err instanceof MergeError) {
        this.log.warn(`[manifest dev] skip (${err.code}): ${err.message}`)
        return
      }
      this.log.error(
        `[manifest dev] merge error: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }

    // Preview + confirm
    this.log.info(`--- pending: ${filePath} ---`)
    this.log.info(result.diff)
    let approved: boolean
    try {
      approved = await this.confirmPrompt(result.diff)
    } catch (err) {
      this.log.error(
        `[manifest dev] prompt error: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    if (!approved) {
      this.log.info(`[manifest dev] skipped (user declined)`)
      return
    }

    // Write merged source (caller-controlled path, not ts-morph) + delete pending.
    try {
      await writeFile(this.manifestPath, result.merged, 'utf-8')
    } catch (err) {
      this.log.error(
        `[manifest dev] write failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    try {
      await this.pendingStore.deletePending(filePath)
    } catch (err) {
      this.log.warn(
        `[manifest dev] merge applied but pending delete failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    this.log.info(
      `[manifest dev] merged: ${result.addedTargetIds.join(', ')}`,
    )
  }
}

// ─── Default confirm prompt ─────────────────────────────────────────────────

/**
 * readline-based `y/N` gate. Per T-16-13, only exact `y` (case-insensitive,
 * trimmed) returns `true`. Everything else — empty enter, `n`, stray chars —
 * returns `false`. No timeout; the user decides when to answer.
 */
async function defaultConfirmPrompt(_diff: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const ans = await rl.question('Apply? [y/N] ')
    return ans.trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}

// ─── CLI entrypoint ──────────────────────────────────────────────────────────

/**
 * `agrune manifest dev <manifest.ts>` entrypoint. Returns a process exit
 * code without calling `process.exit` so it can be unit-tested directly.
 * The long-running watcher loop only starts after arg validation passes.
 *
 * - T-16-11 — validates file existence + `.ts`/`.tsx` extension before the
 *   watcher starts.
 */
export async function runManifestDevCli(args: string[]): Promise<number> {
  const manifestArg = args[0]
  if (!manifestArg) {
    process.stderr.write('Usage: agrune manifest dev <manifest.ts>\n')
    return 1
  }
  const abs = resolvePath(process.cwd(), manifestArg)
  const ext = extname(abs)
  if (ext !== '.ts' && ext !== '.tsx') {
    process.stderr.write(
      `[manifest dev] file must be .ts or .tsx: ${manifestArg}\n`,
    )
    return 1
  }
  try {
    await stat(abs)
  } catch {
    process.stderr.write(`[manifest dev] file not found: ${abs}\n`)
    return 1
  }

  const watcher = new ManifestDevWatcher(abs)
  await watcher.start()
  // Keep alive until SIGINT/SIGTERM.
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      void watcher.stop().finally(() => resolve())
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
  return 0
}
