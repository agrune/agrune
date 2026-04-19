/**
 * `agrune maps add <host> [version]` — fetch a registry entry (or read from
 * the local disk cache when `--offline`), verify its content hash, persist
 * the file under `~/.agrune/maps/`, and upsert the project-root lockfile
 * entry.
 *
 * Threat model (plan 18-02 threat register):
 *  - T-18-11 (MITM on fetch) — defense-in-depth: registry-client enforces
 *    HTTPS and validates schema; we re-compute contentHash here from the
 *    received manifest to detect any tampering after fetch.
 *  - T-18-13 (path traversal via host arg) — inherited from cache.ts regex
 *    whitelist; this runner never constructs paths directly from argv.
 */
import type { AgruneManifest } from '@agrune/manifest'
import {
  contentHash,
  fetchRegistryEntry,
  readCacheEntry,
  writeCacheEntry,
  readLockfile,
  writeLockfile,
  RegistryError,
  type RegistryEntry,
  type RegistryClientOptions,
  type Lockfile,
} from '../index.js'
import { DEFAULT_REGISTRY_BASE_URL } from '../registry-client.js'
import { errorExit, makeColor, parseArgs } from './shared.js'

export interface AddCliDependencies {
  fetchEntry?: typeof fetchRegistryEntry
  readCache?: typeof readCacheEntry
  writeCache?: typeof writeCacheEntry
  readLock?: typeof readLockfile
  writeLock?: typeof writeLockfile
  cwd?: () => string
}

/**
 * Run `agrune maps add`. Returns a process exit code — never throws.
 *
 * Dependency injection is supported via the second argument to keep unit
 * tests hermetic (mock fetch + fs through the typed DI surface rather than
 * patching the module registry).
 */
export async function runAddCli(
  argv: string[],
  deps: AddCliDependencies = {},
): Promise<number> {
  const color = makeColor()
  let parsed
  try {
    parsed = parseArgs(argv, {
      flag: ['offline'],
      option: ['registry-base-url', 'cwd'],
    })
  } catch (err) {
    return errorExit(err)
  }

  const [host, versionArg] = parsed.positional
  if (!host) {
    process.stderr.write('Usage: agrune maps add <host> [version]\n')
    return 1
  }
  const version = versionArg ?? 'latest'

  const fetchEntry = deps.fetchEntry ?? fetchRegistryEntry
  const readCache = deps.readCache ?? readCacheEntry
  const writeCache = deps.writeCache ?? writeCacheEntry
  const readLock = deps.readLock ?? readLockfile
  const writeLock = deps.writeLock ?? writeLockfile
  const cwd = (deps.cwd ?? process.cwd)()
  const projectCwd = parsed.options['cwd'] ?? cwd

  const fetchOptions: RegistryClientOptions = {}
  if (parsed.options['registry-base-url']) {
    fetchOptions.baseUrl = parsed.options['registry-base-url']
  }

  let entry: RegistryEntry
  try {
    if (parsed.flags['offline']) {
      // Offline mode: only cache is consulted. If the cache lacks an exact
      // version (the user may have passed `latest`, which is not a valid
      // cache key on its own), surface REGISTRY_ENTRY_NOT_FOUND.
      const cached = await readCache(host, version)
      if (!cached) {
        throw new RegistryError(
          'REGISTRY_ENTRY_NOT_FOUND',
          `offline mode: no cached entry for ${host}@${version}`,
        )
      }
      entry = cached
    } else {
      entry = await fetchEntry(host, version, fetchOptions)
    }
  } catch (err) {
    return errorExit(err)
  }

  // T-18-11: re-compute the hash from the returned manifest. Even though
  // registry-client validated the envelope, we verify the manifest body to
  // detect any silent middleware / cache-poisoning between fetch and parse.
  // The zod-inferred `entry.manifest` shape is structurally identical to
  // `AgruneManifest` at runtime — the cast bridges a minor optional-field
  // divergence in TS inference (fiber.path required vs optional) that does
  // not affect the canonical-JSON serialization used by contentHash.
  const computedHash = contentHash(entry.manifest as unknown as AgruneManifest)

  try {
    await writeCache(entry)
  } catch (err) {
    return errorExit(err)
  }

  let lock: Lockfile
  try {
    lock = await readLock(projectCwd)
  } catch (err) {
    return errorExit(err)
  }

  // Idempotent upsert: remove any existing entry for this host, push the new
  // one. writeLockfile re-sorts.
  const withoutHost = lock.entries.filter((e) => e.host !== entry.registry.host)
  const baseUrl = fetchOptions.baseUrl ?? process.env.AGRUNE_REGISTRY_BASE_URL ?? DEFAULT_REGISTRY_BASE_URL
  const source = `${baseUrl.replace(/\/+$/, '')}/manifests/${encodeURIComponent(
    entry.registry.host,
  )}@${encodeURIComponent(entry.registry.version)}.json`
  withoutHost.push({
    host: entry.registry.host,
    version: entry.registry.version,
    contentHash: computedHash,
    tier: entry.registry.tier,
    fetchedAt: new Date().toISOString(),
    source,
    allowedEnvironments: entry.registry.allowedEnvironments,
  })

  try {
    await writeLock(projectCwd, { version: 1, entries: withoutHost })
  } catch (err) {
    return errorExit(err)
  }

  process.stdout.write(
    color.green('✓') +
      ` Added ${entry.registry.host}@${entry.registry.version}` +
      ` (tier=${entry.registry.tier}, hash=${computedHash})\n` +
      color.dim(`  source: ${source}\n`),
  )
  return 0
}
