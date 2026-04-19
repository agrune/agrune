import type { FiberIdentityPath } from '@agrune/manifest'
import type { FiberIdentityIndex } from '../fiber/identity-index.js'

export interface AgruneIdentityBridge {
  resolve(path: FiberIdentityPath): HTMLElement | null
  readonly version: '1'
}

declare global {
  interface Window {
    __agrune_identity__?: AgruneIdentityBridge
  }
}

/**
 * activateBridge — FiberIdentityIndex를 window.__agrune_identity__ 로 lock-publish.
 *
 * - Object.defineProperty({ writable:false, configurable:false }) — REACT-02 tamper-proof lock
 * - 이미 lock된 경우 false 반환 (StrictMode 이중 mount 방어, Pitfall 2)
 * - SSR 환경(typeof window === 'undefined') 에서 false 반환
 *
 * @returns true: 신규 lock 설정 성공, false: 이미 존재하거나 SSR
 */
export function activateBridge(index: FiberIdentityIndex): boolean {
  if (typeof window === 'undefined') return false

  const existing = Object.getOwnPropertyDescriptor(window, '__agrune_identity__')
  if (existing && existing.configurable === false) {
    // 이미 configurable:false lock이 걸린 bridge — StrictMode 이중 mount 방어
    return false
  }

  const bridge: AgruneIdentityBridge = {
    resolve(path: FiberIdentityPath): HTMLElement | null {
      return index.getByPath(path)
    },
    version: '1',
  }

  Object.defineProperty(window, '__agrune_identity__', {
    value: bridge,
    writable: false,
    configurable: false, // REACT-02: no-overwrite tamper-proof lock
    enumerable: false,
  })

  return true
}
