import { RegistryError } from './errors.js'
import { RegistryEntrySchema, type RegistryEntry } from './schema.js'

/**
 * Base URL for registry raw-content fetches. Points at `raw.githubusercontent.com`
 * serving the canonical `github.com/agrune/maps` main branch. Can be
 * overridden via `AGRUNE_REGISTRY_BASE_URL` for tests / enterprise mirrors /
 * staging registries (Plan 02 doctor uses this for CI image pinning).
 *
 * T-18-07 mitigation: consumers cannot override with an http:// URL at
 * runtime — `fetchRegistryEntry` enforces `https:` scheme below.
 */
export const DEFAULT_REGISTRY_BASE_URL =
  'https://raw.githubusercontent.com/agrune/maps/main'

export interface RegistryClientOptions {
  baseUrl?: string
  /**
   * Optional fetch implementation override. Defaults to the Node 22 built-in
   * `globalThis.fetch`. Tests / PR bot scripts can inject a custom
   * implementation for recording + replay.
   */
  fetch?: typeof globalThis.fetch
}

function resolveBaseUrl(options?: RegistryClientOptions): string {
  const override = options?.baseUrl ?? process.env.AGRUNE_REGISTRY_BASE_URL
  const base = override && override.length > 0 ? override : DEFAULT_REGISTRY_BASE_URL
  const trimmed = base.replace(/\/+$/, '')
  // T-18-07: HTTPS-only.
  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'https:') {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      `registry base URL must use https:// (got ${parsed.protocol})`,
    )
  }
  return trimmed
}

/**
 * Fetch a single registry entry at exact `version` (or `latest`).
 *
 * v0.5 MVP scope (RESEARCH Open Q 5): only exact semver matches and the
 * `latest` keyword are supported. Semver ranges (`^1.2.0`, `~1.0.0`) are a
 * v0.6+ feature; callers passing them today will get a 404 response and a
 * `REGISTRY_ENTRY_NOT_FOUND` error.
 *
 *   host=news.ycombinator.com, version=1.0.0 ->
 *     GET {baseUrl}/manifests/news.ycombinator.com@1.0.0.json
 *   host=news.ycombinator.com, version=latest ->
 *     GET {baseUrl}/index.json (resolve latest) -> recurse with resolved version
 */
export async function fetchRegistryEntry(
  host: string,
  version: string,
  options?: RegistryClientOptions,
): Promise<RegistryEntry> {
  const fetchImpl = options?.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      'global fetch is not available — requires Node 22 or a polyfill',
    )
  }
  const base = resolveBaseUrl(options)

  // Resolve `latest` via the top-level index.json. Plan 03 owns the schema
  // of that file; we assume `{ hosts: { "<host>": { latest: "<semver>" } } }`
  // as the minimal shape. An entry missing `latest` for the requested host
  // is surfaced as REGISTRY_ENTRY_NOT_FOUND.
  let effectiveVersion = version
  if (version === 'latest') {
    effectiveVersion = await resolveLatestVersion(host, base, fetchImpl)
  }

  const url = `${base}/manifests/${encodeURIComponent(host)}@${encodeURIComponent(effectiveVersion)}.json`

  let res: Response
  try {
    res = await fetchImpl(url)
  } catch (err) {
    throw new RegistryError('REGISTRY_FETCH_FAILED', `network error fetching ${url}`, {
      cause: err,
    })
  }

  if (res.status === 404) {
    throw new RegistryError(
      'REGISTRY_ENTRY_NOT_FOUND',
      `registry entry ${host}@${effectiveVersion} not found at ${url}`,
    )
  }
  if (!res.ok) {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      `registry ${url} returned HTTP ${res.status}`,
    )
  }

  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    throw new RegistryError(
      'REGISTRY_SCHEMA_INVALID',
      `registry ${url} returned non-JSON body`,
      { cause: err },
    )
  }

  // T-18-02 defense-in-depth: the response body is untrusted; zod.strictObject
  // ensures unknown fields are rejected even if the registry mirror is
  // compromised.
  const result = RegistryEntrySchema.safeParse(body)
  if (!result.success) {
    throw new RegistryError(
      'REGISTRY_SCHEMA_INVALID',
      `registry ${url} response did not match RegistryEntrySchema: ${result.error.message}`,
    )
  }
  return result.data
}

async function resolveLatestVersion(
  host: string,
  base: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<string> {
  const url = `${base}/index.json`
  let res: Response
  try {
    res = await fetchImpl(url)
  } catch (err) {
    throw new RegistryError('REGISTRY_FETCH_FAILED', `network error fetching ${url}`, {
      cause: err,
    })
  }
  if (!res.ok) {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      `registry index ${url} returned HTTP ${res.status}`,
    )
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    throw new RegistryError(
      'REGISTRY_SCHEMA_INVALID',
      `registry index ${url} returned non-JSON body`,
      { cause: err },
    )
  }
  // Minimal shape assertion — Plan 03 will formalize via zod schema.
  const latest = (body as { hosts?: Record<string, { latest?: string }> })?.hosts?.[host]?.latest
  if (typeof latest !== 'string' || latest.length === 0) {
    throw new RegistryError(
      'REGISTRY_ENTRY_NOT_FOUND',
      `registry index has no 'latest' version for host ${host}`,
    )
  }
  return latest
}
