import { describe, expect, it } from 'vitest'
import type { AgruneManifest } from '@agrune/manifest'
import { contentHash } from '../src/content-hash.js'

// Minimal but complete ManifestSchema-compatible manifest. We reuse it across
// tests so each case focuses on hash behaviour, not manifest construction.
function baseManifest(): AgruneManifest {
  return {
    version: 3,
    groups: [
      {
        groupId: 'main',
        targets: [
          {
            targetId: 'search',
            actionKinds: ['click'],
            selector: { role: { name: 'Search' } },
          },
        ],
      },
    ],
  }
}

describe('contentHash', () => {
  it('returns a string prefixed with "sha256:" and a 64-char hex body', () => {
    const hash = contentHash(baseManifest())
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('is stable across key-reorder (canonical serialization)', () => {
    // Same logical manifest, different key insertion order at every object
    // level. fast-json-stable-stringify must canonicalize to the same bytes.
    const a: AgruneManifest = {
      version: 3,
      groups: [
        {
          groupId: 'main',
          targets: [
            {
              targetId: 'search',
              actionKinds: ['click'],
              selector: { role: { name: 'Search' } },
            },
          ],
        },
      ],
    }
    const b: AgruneManifest = {
      // Keys rotated: groups before version, selector before actionKinds, etc.
      groups: [
        {
          targets: [
            {
              selector: { role: { name: 'Search' } },
              actionKinds: ['click'],
              targetId: 'search',
            },
          ],
          groupId: 'main',
        },
      ],
      version: 3,
    } as AgruneManifest

    expect(contentHash(a)).toBe(contentHash(b))
  })

  it('is deterministic across repeated calls with the same input', () => {
    const m = baseManifest()
    expect(contentHash(m)).toBe(contentHash(m))
    // Also deterministic on freshly constructed but identical manifests.
    expect(contentHash(baseManifest())).toBe(contentHash(baseManifest()))
  })

  it('differs when any value changes (sensitivity guard)', () => {
    const original = baseManifest()
    const mutated: AgruneManifest = {
      ...original,
      groups: [
        {
          ...original.groups[0]!,
          targets: [
            {
              ...original.groups[0]!.targets[0]!,
              // Single string change must cascade to the hash.
              selector: { role: { name: 'Search2' } },
            },
          ],
        },
      ],
    }

    expect(contentHash(original)).not.toBe(contentHash(mutated))
  })

  // WR-04 (review 18): fast-json-stable-stringify drops `undefined`-valued
  // keys but serialises `null` as the literal string `"null"`. For OPTIONAL
  // fields (e.g. `target.name`, `group.name`, `macroStep.value`) the two
  // must produce the same canonical bytes, otherwise different toolchains
  // (protobuf-to-json, some serialisers) can produce diverging hashes for
  // semantically identical manifests.
  //
  // Note: `FiberPathSegment.key: string | null` is a LEGIT null — it is an
  // explicit semantic value ("not keyed"), not an "absent optional". That
  // case is intentionally excluded from this regression.
  it('treats null and undefined on optional fields as identical (cross-toolchain drift guard)', () => {
    const withUndefined: AgruneManifest = {
      version: 3,
      groups: [
        {
          groupId: 'main',
          // `name` and `desc` absent entirely
          targets: [
            {
              targetId: 'search',
              actionKinds: ['click'],
              selector: { role: { name: 'Search' } },
              // `name`, `desc` absent
            },
          ],
        },
      ],
    }
    const withNull = {
      version: 3,
      groups: [
        {
          groupId: 'main',
          name: null,
          desc: null,
          targets: [
            {
              targetId: 'search',
              actionKinds: ['click'],
              selector: { role: { name: 'Search' } },
              name: null,
              desc: null,
            },
          ],
        },
      ],
    } as unknown as AgruneManifest

    expect(contentHash(withNull)).toBe(contentHash(withUndefined))
  })
})
