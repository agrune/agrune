import { join } from 'node:path'
import { homedir } from 'node:os'

export const HOST_NAME = 'com.agrune.agrune'
export const AGRUNE_HOME = join(homedir(), '.agrune')
export const CLI_VERSION = '0.1.0'

// Derived from packages/extension/manifest.json key field.
// This is deterministic — the same key always produces the same ID.
// Update this if the extension key changes.
export const CWS_EXTENSION_ID = 'homjkbmhgmccfjpcllcbofcnpciephlh'
