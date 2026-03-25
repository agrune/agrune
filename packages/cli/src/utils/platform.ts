export type SupportedPlatform = 'darwin' | 'linux'

export function getPlatform(): SupportedPlatform {
  const p = process.platform
  if (p === 'darwin' || p === 'linux') return p
  throw new Error(`Unsupported platform: ${p}. Only macOS and Linux are supported.`)
}
