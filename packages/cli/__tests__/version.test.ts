import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readVersionFile, writeVersionFile } from '../src/utils/version.js'

describe('version', () => {
  const testDir = join(tmpdir(), 'agrune-test-version')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns null when version.json does not exist', () => {
    expect(readVersionFile(join(testDir, 'version.json'))).toBeNull()
  })

  it('writes and reads version.json round-trip', () => {
    const path = join(testDir, 'version.json')
    const data = {
      version: '0.1.0',
      installedAt: '2026-03-25T00:00:00Z',
      updatedAt: '2026-03-25T00:00:00Z',
      components: {
        'mcp-server': true,
        'native-host': true,
        'claude-mcp': true,
        'codex-mcp': false,
        'chrome-extension': false,
      },
    }
    writeVersionFile(path, data)
    expect(readVersionFile(path)).toEqual(data)
  })
})
