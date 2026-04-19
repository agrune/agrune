import { describe, expect, it } from 'vitest'
import { RegistryEntrySchema } from '../src/schema.js'

// Minimal-but-valid manifest satisfying ManifestSchema (version: 3 + at least
// one group with one target that has role/text/testId/attr/css/fiber).
const VALID_MANIFEST = {
  version: 3 as const,
  groups: [
    {
      groupId: 'main',
      targets: [
        {
          targetId: 'search',
          actionKinds: ['click' as const],
          selector: { role: { name: 'Search' } },
        },
      ],
    },
  ],
}

function entry(overrides: {
  registry?: Record<string, unknown>
  manifest?: unknown
} = {}) {
  return {
    registry: {
      host: 'news.ycombinator.com',
      version: '1.0.0',
      tier: 'community' as const,
      author: 'alice',
      submittedAt: '2026-04-20T12:00:00.000Z',
      ...overrides.registry,
    },
    manifest: overrides.manifest ?? VALID_MANIFEST,
  }
}

describe('RegistryEntrySchema', () => {
  it('accepts a minimal valid entry (community tier, host/version/tier/author/submittedAt)', () => {
    const result = RegistryEntrySchema.safeParse(entry())
    expect(result.success).toBe(true)
    if (result.success) {
      // Default injection: allowedEnvironments defaults to ['dev'] (Pitfall 7).
      expect(result.data.registry.allowedEnvironments).toEqual(['dev'])
    }
  })

  it('rejects entry missing registry.host', () => {
    const bad = entry()
    delete (bad.registry as Record<string, unknown>).host
    const result = RegistryEntrySchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects unknown top-level fields (strict mode)', () => {
    const bad = { ...entry(), extraneous: 'nope' }
    const result = RegistryEntrySchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('defaults allowedEnvironments to ["dev"] when omitted (Pitfall 7)', () => {
    const result = RegistryEntrySchema.safeParse(entry())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.registry.allowedEnvironments).toEqual(['dev'])
    }
  })

  it('allows verified tier with allowedEnvironments ["dev", "prod"]', () => {
    const result = RegistryEntrySchema.safeParse(
      entry({ registry: { tier: 'verified', allowedEnvironments: ['dev', 'prod'] } }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects community tier with allowedEnvironments including "prod" (Pitfall 7)', () => {
    const result = RegistryEntrySchema.safeParse(
      entry({ registry: { tier: 'community', allowedEnvironments: ['dev', 'prod'] } }),
    )
    expect(result.success).toBe(false)
  })
})
