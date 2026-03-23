import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const HOST_NAME = 'com.webcli.dom'
const MANIFEST_FILENAME = `${HOST_NAME}.json`

export function getNativeHostPath(): string {
  const home = os.homedir()

  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', MANIFEST_FILENAME)
    case 'linux':
      return path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts', MANIFEST_FILENAME)
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

export function getNativeHostManifest(binaryPath: string, extensionId: string) {
  return {
    name: HOST_NAME,
    description: 'webcli-dom MCP server native messaging host',
    path: binaryPath,
    type: 'stdio' as const,
    allowed_origins: [`chrome-extension://${extensionId}/`],
  }
}

export function installNativeHost(binaryPath: string, extensionId: string): string {
  const manifestPath = getNativeHostPath()
  const manifest = getNativeHostManifest(binaryPath, extensionId)

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  return manifestPath
}
