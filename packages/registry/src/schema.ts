import { z } from 'zod'
import { ManifestSchema } from '@agrune/manifest'

// ─── Registry metadata (wraps manifest v3) ──────────────────────────────────

export const RegistryTierSchema = z.enum(['verified', 'community', 'unlisted'])
export type RegistryTier = z.infer<typeof RegistryTierSchema>

/**
 * Allowed runtime environments for a registry entry.
 *
 * Default: `['dev']` (Pitfall 7 — community contributions must opt into prod
 * explicitly, and only verified-tier entries can use prod at all; that
 * cross-field rule is enforced at `RegistryEntrySchema` level below via a
 * `superRefine`, not here, because this schema is also reused for partial
 * validation contexts in the future).
 */
export const AllowedEnvironmentsSchema = z
  .array(z.enum(['dev', 'prod']))
  .default(['dev'])

/**
 * Registry-side metadata stored alongside the manifest JSON in
 * `github.com/agrune/maps/manifests/<host>@<ver>.json`.
 *
 * Strict mode: unknown keys are rejected so that a compromised registry
 * mirror cannot smuggle new fields past `RegistryEntrySchema.parse` and
 * then hope that a later CLI reads them (defense-in-depth).
 */
export const RegistryMetadataSchema = z.strictObject({
  host: z.string().min(1),
  version: z.string().min(1),
  tier: RegistryTierSchema,
  author: z.string().min(1),
  submittedAt: z.string().datetime(),
  reviewedBy: z.array(z.string()).optional(),
  allowedEnvironments: AllowedEnvironmentsSchema,
  seedUrl: z.string().url().optional(),
  staleSince: z.string().datetime().optional(),
})
export type RegistryMetadata = z.infer<typeof RegistryMetadataSchema>

/**
 * Full registry entry = metadata + manifest v3.
 *
 * Cross-field rule (Pitfall 7): community tier cannot include 'prod' in
 * `allowedEnvironments`. Verified tier may include both 'dev' and 'prod'.
 * Unlisted tier is treated like community (dev only) to avoid resurrection
 * of revoked entries with escalated env scope.
 */
export const RegistryEntrySchema = z
  .strictObject({
    registry: RegistryMetadataSchema,
    manifest: ManifestSchema,
  })
  .superRefine((entry, ctx) => {
    const { tier, allowedEnvironments } = entry.registry
    if (tier !== 'verified' && allowedEnvironments.includes('prod')) {
      ctx.addIssue({
        code: 'custom',
        message: `tier='${tier}' cannot enable 'prod' in allowedEnvironments (verified tier only)`,
        path: ['registry', 'allowedEnvironments'],
      })
    }
  })

export type RegistryEntry = z.infer<typeof RegistryEntrySchema>
