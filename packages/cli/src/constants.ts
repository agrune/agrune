import { join } from 'node:path'
import { homedir } from 'node:os'

declare const __CLI_VERSION__: string

export const HOST_NAME = 'com.agrune.agrune'
export const AGRUNE_HOME = join(homedir(), '.agrune')
export const CLI_VERSION: string = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : '0.0.0'

// CWS production extension ID (assigned by Chrome Web Store)
export const CWS_EXTENSION_ID = 'gchelkphnedibjihiomlbpjhjlajplke'

// Local dev extension ID (derived from manifest.json key field)
export const DEV_EXTENSION_ID = 'homjkbmhgmccfjpcllcbofcnpciephlh'
