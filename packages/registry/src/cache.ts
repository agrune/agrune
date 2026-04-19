import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { RegistryError } from './errors.js'
import { RegistryEntrySchema, type RegistryEntry } from './schema.js'

/**
 * Disk cache for registry entries under `~/.agrune/maps/<host>@<ver>.json`.
 *
 * Threat model:
 *  - T-18-04 (info disclosure via multi-user home): mkdir mode 0o700,
 *    writeFile mode 0o600 — POSIX only; Windows falls back to default ACL.
 *  - T-18-05 (tampering by malicious local process): readCacheEntry parses
 *    the file and re-runs RegistryEntrySchema.parse as a defense-in-depth
 *    check. Values persisted by writeCacheEntry are trusted; values reloaded
 *    from disk are NOT.
 *  - T-18-08 (symlink attack on cache path): writeCacheEntry lstat's the
 *    target and refuses to write if a symbolic link exists there.
 *  - T-18-10 (path traversal via host/version): both arguments are matched
 *    against a strict whitelist before constructing the filesystem path.
 *
 * Configuration: `AGRUNE_CACHE_DIR` environment variable overrides the
 * default location (useful for tests, CI containers, or XDG-compliant
 * setups).
 */

// RFC 1123-ish host: labels of [a-z0-9][a-z0-9-]*, joined by dots. Case
// insensitive. Max length 253 per DNS. We also allow ports just in case a
// caller ever passes `host:port` — but NOT slashes / ../ / anything that
// could traverse directories.
const HOST_PATTERN = /^[a-z0-9][a-z0-9.\-]{0,252}$/i

// Deliberately permissive version pattern: semver-ish plus 'latest' keyword
// support. A malicious value cannot escape the final `${host}@${version}.json`
// path because characters outside [A-Za-z0-9.\-+] are rejected here.
const VERSION_PATTERN = /^(latest|[A-Za-z0-9][A-Za-z0-9.\-+]{0,63})$/

export function getCacheDir(): string {
  const override = process.env.AGRUNE_CACHE_DIR
  if (override && override.length > 0) return override
  return join(homedir(), '.agrune', 'maps')
}

function cacheFilePath(host: string, version: string): string {
  if (!HOST_PATTERN.test(host)) {
    throw new RegistryError(
      'CACHE_PERMISSION_DENIED',
      `invalid host '${host}' — must match ${HOST_PATTERN.source}`,
    )
  }
  if (!VERSION_PATTERN.test(version)) {
    throw new RegistryError(
      'CACHE_PERMISSION_DENIED',
      `invalid version '${version}' — must match ${VERSION_PATTERN.source}`,
    )
  }
  return join(getCacheDir(), `${host}@${version}.json`)
}

export async function writeCacheEntry(entry: RegistryEntry): Promise<void> {
  const dir = getCacheDir()
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 })
  } catch (err) {
    throw new RegistryError('CACHE_PERMISSION_DENIED', `cannot create cache dir ${dir}`, {
      cause: err,
    })
  }

  const path = cacheFilePath(entry.registry.host, entry.registry.version)

  // T-18-08 symlink guard: lstat the target; bail if someone has prepared
  // a symlink under our expected path to redirect the write.
  try {
    const st = await lstat(path)
    if (st.isSymbolicLink()) {
      throw new RegistryError(
        'CACHE_PERMISSION_DENIED',
        `cache path ${path} is a symbolic link — refusing to write (T-18-08)`,
      )
    }
  } catch (err) {
    if (err instanceof RegistryError) throw err
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new RegistryError('CACHE_PERMISSION_DENIED', `cannot lstat ${path}`, { cause: err })
    }
    // ENOENT: path does not exist yet, which is the normal case.
  }

  try {
    await writeFile(path, JSON.stringify(entry, null, 2), { mode: 0o600 })
  } catch (err) {
    throw new RegistryError('CACHE_PERMISSION_DENIED', `cannot write ${path}`, { cause: err })
  }
}

/**
 * Read cache entry by host+version. Returns `null` when the file is missing
 * (treat as cache miss). Throws `RegistryError` on invalid input, permission
 * errors, or schema-mismatched content (T-18-05 defense-in-depth).
 */
export async function readCacheEntry(
  host: string,
  version: string,
): Promise<RegistryEntry | null> {
  const path = cacheFilePath(host, version)

  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    const errno = (err as NodeJS.ErrnoException).code
    if (errno === 'ENOENT') return null
    throw new RegistryError('CACHE_PERMISSION_DENIED', `cannot read ${path}`, { cause: err })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new RegistryError(
      'REGISTRY_SCHEMA_INVALID',
      `cache file ${path} is not valid JSON`,
      { cause: err },
    )
  }

  const result = RegistryEntrySchema.safeParse(parsed)
  if (!result.success) {
    throw new RegistryError(
      'REGISTRY_SCHEMA_INVALID',
      `cache file ${path} does not match RegistryEntrySchema: ${result.error.message}`,
    )
  }
  return result.data
}

/**
 * Remove the entire cache directory. Intended to be a user-initiated,
 * opt-in operation (CLI `agrune maps doctor --clear-cache` in Plan 02) —
 * never called implicitly from doctor/add flows.
 */
export async function clearCache(): Promise<void> {
  const dir = getCacheDir()
  try {
    await rm(dir, { recursive: true, force: true })
  } catch (err) {
    throw new RegistryError('CACHE_PERMISSION_DENIED', `cannot remove cache dir ${dir}`, {
      cause: err,
    })
  }
}
