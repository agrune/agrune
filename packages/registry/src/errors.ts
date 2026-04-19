/**
 * Registry error codes — single surface for all `@agrune/registry` failure modes.
 *
 * Naming convention mirrors existing `@agrune/core` error code style
 * (SCREAMING_SNAKE_CASE, domain prefix). Callers in the CLI layer (Plan 02)
 * and PR bot scripts (Plan 04) switch on `error.code` to render user-facing
 * messages or branch behaviour.
 */
export type RegistryErrorCode =
  | 'REGISTRY_ENTRY_NOT_FOUND'
  | 'CONTENT_HASH_MISMATCH'
  | 'LOCKFILE_WRITE_FAILED'
  | 'CACHE_PERMISSION_DENIED'
  | 'REGISTRY_FETCH_FAILED'
  | 'REGISTRY_SCHEMA_INVALID'

export const REGISTRY_ERROR_CODES: readonly RegistryErrorCode[] = [
  'REGISTRY_ENTRY_NOT_FOUND',
  'CONTENT_HASH_MISMATCH',
  'LOCKFILE_WRITE_FAILED',
  'CACHE_PERMISSION_DENIED',
  'REGISTRY_FETCH_FAILED',
  'REGISTRY_SCHEMA_INVALID',
] as const

/**
 * Typed registry error. `cause` follows the Node 16+ `Error` options convention
 * so callers can unwrap the originating system error (e.g. EACCES from fs).
 */
export class RegistryError extends Error {
  public readonly code: RegistryErrorCode

  constructor(code: RegistryErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RegistryError'
    this.code = code
    // Preserve prototype chain when targeting ES2022 (TypeScript downlevel guard).
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
