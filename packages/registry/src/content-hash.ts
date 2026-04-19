import { createHash } from 'node:crypto'
import stableStringify from 'fast-json-stable-stringify'
import type { AgruneManifest } from '@agrune/manifest'

/**
 * Content hash of a manifest using canonical JSON serialization + SHA-256.
 *
 * Purpose:
 *  - Deterministic identity for lockfile (`agrune.maps.lock.json`) integrity.
 *  - Cache invalidation key for `~/.agrune/maps/<host>@<ver>.json`.
 *  - Cross-author hash parity: two authors producing the same logical manifest
 *    must get the same hash regardless of JSON key insertion order
 *    (Pitfall 1 — V8 insertion order varies across toolchains).
 *
 * Format: `sha256:<64-hex>` — multihash convention matching npm integrity
 * (`sha512-...`). Keeping the prefix makes future migration to a different
 * algorithm an additive change on the consumer side.
 */
export function contentHash(manifest: AgruneManifest): string {
  const canonical = stableStringify(stripNullOptionals(manifest, ''))
  const hex = createHash('sha256').update(canonical, 'utf-8').digest('hex')
  return `sha256:${hex}`
}

/**
 * WR-04 (review 18): `fast-json-stable-stringify` drops `undefined`-valued
 * keys but serialises `null` as `"null"`. For OPTIONAL fields the two inputs
 * must produce identical canonical bytes so that different toolchains
 * (protobuf-to-json, ad-hoc serialisers) cannot produce diverging content
 * hashes for semantically-identical manifests.
 *
 * The exception is `FiberPathSegment.key: string | null` — `null` there is a
 * legit semantic value meaning "fiber has no React key". The recursion path
 * is tracked via a dotted `path` string and this specific location is held
 * out of the strip.
 */
function stripNullOptionals<T>(v: T, path: string): T {
  if (Array.isArray(v)) {
    return v.map((item) => stripNullOptionals(item, `${path}[]`)) as unknown as T
  }
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      // Preserve legit `null` only at the documented location.
      if (val === null && isLegitNullField(path, k)) {
        out[k] = null
        continue
      }
      if (val === null || val === undefined) continue
      out[k] = stripNullOptionals(val, `${path}.${k}`)
    }
    return out as unknown as T
  }
  return v
}

/**
 * The only place a manifest is allowed to carry an explicit `null` value is
 * `FiberPathSegment.key`. All paths that can reach that field end in
 * `.selector.fiber.path[].key` or `.containerSelector.fiber.path[].key`
 * (the latter for `ManifestRepeat`).
 */
function isLegitNullField(path: string, key: string): boolean {
  if (key !== 'key') return false
  return path.endsWith('.fiber.path[]')
}
