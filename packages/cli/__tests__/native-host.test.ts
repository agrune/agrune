import { describe, it, expect } from 'vitest'
import { getNativeHostManifest, deriveExtensionIdFromManifestKey } from '../src/utils/native-host.js'

describe('native-host', () => {
  it('creates correct manifest shape', () => {
    const manifest = getNativeHostManifest('/path/to/binary', ['abcdefghijklmnop'])
    expect(manifest).toEqual({
      name: 'com.agrune.agrune',
      description: 'agrune MCP server native messaging host',
      path: '/path/to/binary',
      type: 'stdio',
      allowed_origins: ['chrome-extension://abcdefghijklmnop/'],
    })
  })

  it('derives extension ID from manifest key', () => {
    const key = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqLVmjeM2Lfnlwtas6edYoGZwPYZeRe8AnI1zmbkJWpskfHMGga9t9k4tfn99EEsV4Ebsoh+H9lCHyp6AHsaM1t3cAUlXALNBJzcpVts6PFOvMMlVI78NSshwbX79YoA2KP5UFCTk7ulqNbHPm5s/zcp6Q2eO+DH+PGGmjDGDFUiWXOJiWrCiLs7rRe1aibTOVktYKaobdKgLEvBrUO7JItRvyp9mMwaZbUl+6NWyhjfvivmjJ+qslvWrr+zlXsp8RKkN+0mlURnhsR1CPZA9arI1QKjt5007w99oOCXZ6Auuc5O8pYugZrj0EojjUW8dp2UX8ys2PcojSzTffzkVpQIDAQAB'
    const id = deriveExtensionIdFromManifestKey(key)
    expect(id).toMatch(/^[a-p]{32}$/)
    expect(deriveExtensionIdFromManifestKey(key)).toBe(id)
  })
})
