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
  const canonical = stableStringify(manifest)
  const hex = createHash('sha256').update(canonical, 'utf-8').digest('hex')
  return `sha256:${hex}`
}
