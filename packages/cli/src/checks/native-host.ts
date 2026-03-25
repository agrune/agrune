import { existsSync, accessSync, constants, readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Check } from './types.js'
import { getNativeHostManifestPath, NATIVE_HOST_WRAPPER } from '../utils/paths.js'
import { installNativeHostWrapper, installNativeHostManifest } from '../utils/native-host.js'
import { CWS_EXTENSION_ID, DEV_EXTENSION_ID } from '../constants.js'

export function nativeHostManifestCheck(): Check {
  return {
    name: 'Native host manifest',
    async check() {
      const manifestPath = getNativeHostManifestPath()
      if (!existsSync(manifestPath)) {
        return { ok: false, message: 'Native host manifest not found' }
      }
      try {
        const content = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (content.name !== 'com.agrune.agrune') {
          return { ok: false, message: 'Native host manifest has wrong name' }
        }
        return { ok: true, message: 'Native host manifest valid' }
      } catch {
        return { ok: false, message: 'Native host manifest is not valid JSON' }
      }
    },
    async fix() {
      installNativeHostManifest([CWS_EXTENSION_ID, DEV_EXTENSION_ID])
    },
  }
}

export function nativeHostWrapperCheck(): Check {
  return {
    name: 'Native host wrapper',
    async check() {
      if (!existsSync(NATIVE_HOST_WRAPPER)) {
        return { ok: false, message: 'Native host wrapper not found' }
      }
      try {
        accessSync(NATIVE_HOST_WRAPPER, constants.X_OK)
      } catch {
        return { ok: false, message: 'Native host wrapper not executable' }
      }

      const content = readFileSync(NATIVE_HOST_WRAPPER, 'utf-8')
      const execLine = content
        .split('\n')
        .map(line => line.trim())
        .find(line => line.startsWith('exec '))

      if (!execLine) {
        return { ok: false, message: 'Native host wrapper has no exec line' }
      }

      const match = execLine.match(/^exec\s+(?:"([^"]+)"|'([^']+)'|(\S+))/)
      const command = match?.[1] ?? match?.[2] ?? match?.[3] ?? null

      if (!command) {
        return { ok: false, message: 'Native host wrapper has invalid exec command' }
      }

      if (!isAbsolute(command)) {
        return { ok: false, message: 'Native host wrapper must use an absolute Node path' }
      }

      if (!existsSync(command)) {
        return { ok: false, message: 'Native host wrapper references a missing Node binary' }
      }

      return { ok: true, message: 'Native host wrapper executable' }
    },
    async fix() {
      installNativeHostWrapper()
    },
  }
}
