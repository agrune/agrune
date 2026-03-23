import { describe, it, expect, vi } from 'vitest'
import { getNativeHostManifest, getNativeHostPath } from '../src/install'
import * as os from 'node:os'
import * as path from 'node:path'

describe('getNativeHostManifest', () => {
  it('generates correct manifest structure', () => {
    const binaryPath = '/usr/local/bin/webcli-dom'
    const extensionId = 'abcdefghijklmnopqrstuvwxyz'

    const manifest = getNativeHostManifest(binaryPath, extensionId)

    expect(manifest).toEqual({
      name: 'com.webcli.dom',
      description: 'webcli-dom MCP server native messaging host',
      path: binaryPath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${extensionId}/`],
    })
  })

  it('uses the provided binaryPath and extensionId', () => {
    const manifest = getNativeHostManifest('/other/path', 'xyz123')

    expect(manifest.path).toBe('/other/path')
    expect(manifest.allowed_origins).toEqual(['chrome-extension://xyz123/'])
  })
})

describe('getNativeHostPath', () => {
  it('returns macOS path on darwin', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    const result = getNativeHostPath()
    const home = os.homedir()

    expect(result).toBe(
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'com.webcli.dom.json'),
    )
  })

  it('returns Linux path on linux', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')

    const result = getNativeHostPath()
    const home = os.homedir()

    expect(result).toBe(
      path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts', 'com.webcli.dom.json'),
    )
  })

  it('throws on unsupported platform', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

    expect(() => getNativeHostPath()).toThrow()
  })
})
