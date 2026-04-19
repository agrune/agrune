// Public API barrel for `@agrune/registry`.
//
// Plan 18-01 establishes the library layer. The CLI (Plan 02), registry-seed
// validators (Plan 03), and PR bot scripts (Plan 04) consume these
// re-exports — do not break the shape without a coordinated major bump.

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

export {
  getCacheDir,
  readCacheEntry,
  writeCacheEntry,
  clearCache,
} from './cache.js'

export {
  LOCKFILE_NAME,
  readLockfile,
  writeLockfile,
  type Lockfile,
  type LockfileEntry,
} from './lockfile.js'

export {
  DEFAULT_REGISTRY_BASE_URL,
  fetchRegistryEntry,
  type RegistryClientOptions,
} from './registry-client.js'

export {
  STALENESS_THRESHOLDS,
  classifyStaleness,
  type StalenessInput,
  type StalenessState,
} from './staleness.js'
