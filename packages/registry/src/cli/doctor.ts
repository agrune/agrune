/**
 * `agrune maps doctor` — classify staleness of each lockfile entry and
 * optionally auto-disable stale entries. Defaults to cache-only (no network)
 * for predictability and rate-limit safety (T-18-12, T-18-15).
 *
 * Flags:
 *   --refresh        fetch `incidents.json` from the registry (HTTPS GET)
 *                    and auto-disable any host listed as revoked.
 *   --auto-disable   when a stale entry is detected, update its lockfile
 *                    row with `disabled: { reason: 'stale', at: <now> }`.
 *   --cwd <path>     override the lockfile directory (default: process.cwd()).
 */
import {
  classifyStaleness,
  readLockfile,
  writeLockfile,
  type Lockfile,
  type LockfileEntry,
} from '../index.js'
import { DEFAULT_REGISTRY_BASE_URL } from '../registry-client.js'
import { RegistryError } from '../errors.js'
import { errorExit, makeColor, parseArgs } from './shared.js'

export interface DoctorCliDependencies {
  readLock?: typeof readLockfile
  writeLock?: typeof writeLockfile
  cwd?: () => string
  now?: () => Date
  fetchImpl?: typeof globalThis.fetch
}

interface IncidentEntry {
  host: string
  version?: string
  reason?: string
}

/**
 * Run `agrune maps doctor`. Returns a process exit code — never throws.
 */
export async function runDoctorCli(
  argv: string[],
  deps: DoctorCliDependencies = {},
): Promise<number> {
  const color = makeColor()
  let parsed
  try {
    parsed = parseArgs(argv, {
      flag: ['refresh', 'auto-disable'],
      option: ['cwd', 'registry-base-url'],
    })
  } catch (err) {
    return errorExit(err)
  }

  const readLock = deps.readLock ?? readLockfile
  const writeLock = deps.writeLock ?? writeLockfile
  const cwd = (deps.cwd ?? process.cwd)()
  const now = (deps.now ?? (() => new Date()))()
  const projectCwd = parsed.options['cwd'] ?? cwd

  let lock: Lockfile
  try {
    lock = await readLock(projectCwd)
  } catch (err) {
    return errorExit(err)
  }

  if (lock.entries.length === 0) {
    process.stdout.write('No entries in lockfile — nothing to diagnose.\n')
    return 0
  }

  // Optional incidents.json fetch. Only runs with `--refresh` to avoid
  // the every-run rate-limit foot-gun (T-18-15).
  //
  // WR-02 (review 18): revocation is keyed by (host, version). A version of
  // `'*'` means "all versions of this host are revoked".
  let revokedVersions = new Map<string, Set<string>>()
  if (parsed.flags['refresh']) {
    try {
      revokedVersions = await fetchRevokedHosts(
        parsed.options['registry-base-url'],
        deps.fetchImpl,
      )
    } catch (err) {
      // Refresh failure should not block the whole doctor run; print a
      // warning and proceed with cache-only classification.
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(color.yellow(`[agrune maps doctor] --refresh failed: ${msg}\n`))
    }
  }

  let stale = 0
  let autoDisabledDelta = 0
  const updated: LockfileEntry[] = []

  for (const entry of lock.entries) {
    // Revocation takes precedence over staleness classification.
    // WR-02 (review 18): honor `version` field in incidents.json — only
    // mark as revoked if this entry's version is listed, or a wildcard `*`
    // revokes all versions of the host.
    const versions = revokedVersions.get(entry.host)
    const isRevoked = !!versions && (versions.has('*') || versions.has(entry.version))
    if (isRevoked) {
      const next: LockfileEntry = {
        ...entry,
        disabled: entry.disabled ?? {
          reason: 'revoked',
          at: now.toISOString(),
        },
      }
      if (!entry.disabled) autoDisabledDelta += 1
      process.stdout.write(
        color.red('✗') + ` ${entry.host}@${entry.version} — revoked (incidents.json)\n`,
      )
      updated.push(next)
      continue
    }

    const state = classifyStaleness(entry, now)
    switch (state) {
      case 'fresh':
        // silent — keep output scannable
        updated.push(entry)
        break
      case 'week_old':
        process.stdout.write(
          color.dim(`  ${entry.host}@${entry.version} — week_old (fetched ${entry.fetchedAt})\n`),
        )
        updated.push(entry)
        break
      case 'stale': {
        stale += 1
        process.stdout.write(
          color.yellow('!') +
            ` ${entry.host}@${entry.version} — stale (fetched ${entry.fetchedAt})\n`,
        )
        if (parsed.flags['auto-disable'] && !entry.disabled) {
          const next: LockfileEntry = {
            ...entry,
            disabled: { reason: 'stale', at: now.toISOString() },
          }
          autoDisabledDelta += 1
          updated.push(next)
        } else {
          if (!parsed.flags['auto-disable']) {
            process.stdout.write(
              color.dim(
                `    run with --auto-disable to mark this entry disabled in the lockfile\n`,
              ),
            )
          }
          updated.push(entry)
        }
        break
      }
      case 'auto_disabled':
        process.stdout.write(
          color.red('✗') + ` ${entry.host}@${entry.version} — auto_disabled\n`,
        )
        updated.push(entry)
        break
    }
  }

  // Persist lockfile only when something actually changed, to keep doctor a
  // read-only operation by default.
  if (autoDisabledDelta > 0) {
    try {
      await writeLock(projectCwd, { version: 1, entries: updated })
    } catch (err) {
      return errorExit(err)
    }
    process.stdout.write(
      color.green('✓') + ` Updated lockfile: ${autoDisabledDelta} entr${autoDisabledDelta === 1 ? 'y' : 'ies'} disabled\n`,
    )
  } else if (stale > 0) {
    process.stdout.write(
      color.dim(`(${stale} stale entr${stale === 1 ? 'y' : 'ies'} — not modified; use --auto-disable to persist)\n`),
    )
  }

  // v0.5 default: lenient exit code (0). A `--strict` flag is reserved for
  // v0.6+ CI use (out of scope for the MVP).
  return 0
}

/**
 * Fetch revoked (host, version) pairs from `<baseUrl>/incidents.json`.
 *
 * WR-02 (review 18): the original implementation returned a `Set<string>`
 * of hosts, discarding the `version` field. That over-revoked — an
 * `incidents.json` entry of `{host, version: '0.9.0'}` would revoke
 * `1.0.0` too. Now returns `Map<host, Set<version>>` where a version of
 * `'*'` means "revoke all versions of this host".
 */
async function fetchRevokedHosts(
  baseUrlOverride: string | undefined,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Map<string, Set<string>>> {
  if (typeof fetchImpl !== 'function') {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      'global fetch is not available — requires Node 22 or a polyfill',
    )
  }
  const base = (baseUrlOverride ?? process.env.AGRUNE_REGISTRY_BASE_URL ?? DEFAULT_REGISTRY_BASE_URL).replace(/\/+$/, '')
  const parsed = new URL(base)
  if (parsed.protocol !== 'https:') {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      `registry base URL must use https:// (got ${parsed.protocol})`,
    )
  }
  const url = `${base}/incidents.json`
  let res: Response
  try {
    res = await fetchImpl(url)
  } catch (err) {
    throw new RegistryError('REGISTRY_FETCH_FAILED', `network error fetching ${url}`, { cause: err })
  }
  if (!res.ok) {
    throw new RegistryError('REGISTRY_FETCH_FAILED', `${url} returned HTTP ${res.status}`)
  }
  const body = (await res.json()) as unknown
  const out = new Map<string, Set<string>>()
  if (!Array.isArray(body)) {
    // Plan 03 seeded incidents.json as []; future entries are {host,...}.
    // Tolerate both shapes defensively.
    return out
  }
  for (const item of body as IncidentEntry[]) {
    if (!item || typeof item.host !== 'string') continue
    const versionKey = typeof item.version === 'string' && item.version.length > 0 ? item.version : '*'
    const set = out.get(item.host) ?? new Set<string>()
    set.add(versionKey)
    out.set(item.host, set)
  }
  return out
}
