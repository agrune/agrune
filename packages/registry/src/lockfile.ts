import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { RegistryError } from './errors.js'
import { RegistryTierSchema } from './schema.js'

/**
 * Name of the project-root lockfile written by `agrune maps add` (Plan 02).
 *
 * Per RESEARCH Open Q 2: lockfile is git-committed by default (npm
 * package-lock convention) — documented in Plan 02 user messaging.
 */
export const LOCKFILE_NAME = 'agrune.maps.lock.json'

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface LockfileEntry {
  host: string
  version: string
  /** `sha256:<hex>` — must match contentHash(manifest) of the cached entry. */
  contentHash: string
  tier: z.infer<typeof RegistryTierSchema>
  /** ISO 8601 timestamp of the last successful registry fetch. */
  fetchedAt: string
  /** Fully-qualified URL from which the entry was fetched (for audit). */
  source: string
  allowedEnvironments: ('dev' | 'prod')[]
  disabled?: {
    reason: 'stale' | 'revoked' | 'user'
    at: string
  }
}

export interface Lockfile {
  version: 1
  entries: LockfileEntry[]
}

// ─── Runtime validation (defense-in-depth) ──────────────────────────────────

const LockfileEntrySchema = z.object({
  host: z.string().min(1),
  version: z.string().min(1),
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  tier: RegistryTierSchema,
  fetchedAt: z.string().datetime(),
  source: z.string().url(),
  allowedEnvironments: z.array(z.enum(['dev', 'prod'])),
  disabled: z
    .object({
      reason: z.enum(['stale', 'revoked', 'user']),
      at: z.string().datetime(),
    })
    .optional(),
})

const LockfileSchema = z.object({
  version: z.literal(1),
  entries: z.array(LockfileEntrySchema),
})

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Read `agrune.maps.lock.json` from `cwd`. If the file is absent, return the
 * canonical empty lockfile — callers can always treat the result as a
 * fully-initialized value without branching on existence.
 */
export async function readLockfile(cwd: string): Promise<Lockfile> {
  const path = join(cwd, LOCKFILE_NAME)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, entries: [] }
    }
    throw new RegistryError('LOCKFILE_WRITE_FAILED', `cannot read ${path}`, { cause: err })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new RegistryError('REGISTRY_SCHEMA_INVALID', `lockfile ${path} is not valid JSON`, {
      cause: err,
    })
  }

  const result = LockfileSchema.safeParse(parsed)
  if (!result.success) {
    throw new RegistryError(
      'REGISTRY_SCHEMA_INVALID',
      `lockfile ${path} does not match Lockfile shape: ${result.error.message}`,
    )
  }
  return result.data
}

/**
 * Atomic write: serialize, write to a uniquely-named tmp file in the same
 * directory, then `rename` onto the target. On POSIX, rename within a
 * directory is atomic — partial writes cannot leave a half-written lockfile
 * behind (T-18-09 mitigation). On any failure, the previous lockfile (if
 * present) is preserved.
 */
export async function writeLockfile(cwd: string, lock: Lockfile): Promise<void> {
  const sorted: Lockfile = {
    version: 1,
    entries: [...lock.entries].sort((a, b) => a.host.localeCompare(b.host)),
  }
  const target = join(cwd, LOCKFILE_NAME)
  const tmp = `${target}.tmp-${randomBytes(6).toString('hex')}`
  const body = JSON.stringify(sorted, null, 2) + '\n'

  try {
    await writeFile(tmp, body, 'utf8')
    await rename(tmp, target)
  } catch (err) {
    // Best-effort cleanup of the tmp file.
    try {
      await unlink(tmp)
    } catch {
      /* ignore */
    }
    throw new RegistryError('LOCKFILE_WRITE_FAILED', `cannot write ${target}`, { cause: err })
  }
}
