import type { RuneRuntimeConfig } from '@runeai/core'
import { getConfig } from '../shared/config.js'

type BridgeSender = (type: 'config_update', data: Partial<RuneRuntimeConfig>) => void

export async function syncStoredConfigToRuntime(
  sendToBridge: BridgeSender,
): Promise<void> {
  try {
    const config = await getConfig()
    sendToBridge('config_update', config)
  } catch (error) {
    console.warn('[rune-extension] failed to sync stored config to runtime', error)
  }
}
