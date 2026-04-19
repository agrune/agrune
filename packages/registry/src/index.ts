// Public API barrel for `@agrune/registry`.
//
// Plan 18-01 Task 1 lands errors + schema + content-hash. Task 2 will add
// cache/lockfile/registry-client/staleness. The CLI layer (Plan 02) and PR
// bot (Plan 04) consume these re-exports — do not break the shape without
// a coordinated major bump.

export {
  RegistryError,
  REGISTRY_ERROR_CODES,
  type RegistryErrorCode,
} from './errors.js'

export { contentHash } from './content-hash.js'

export {
  RegistryEntrySchema,
  RegistryMetadataSchema,
  RegistryTierSchema,
  AllowedEnvironmentsSchema,
  type RegistryEntry,
  type RegistryMetadata,
  type RegistryTier,
} from './schema.js'
