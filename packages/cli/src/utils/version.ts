import { readJsonFile, writeJsonFile } from './fs-helpers.js'

export interface VersionData {
  version: string
  installedAt: string
  updatedAt: string
  components: {
    'mcp-server': boolean
    'native-host': boolean
    'claude-mcp': boolean
    'codex-mcp': boolean
    'chrome-extension': boolean
  }
}

export function readVersionFile(path: string): VersionData | null {
  return readJsonFile<VersionData>(path)
}

export function writeVersionFile(path: string, data: VersionData): void {
  writeJsonFile(path, data)
}
