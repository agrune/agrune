import type { FiberIdentityPath } from '@agrune/manifest'
import type { FiberIdentityIndex } from '../fiber/identity-index.js'

export interface AgruneIdentityBridge {
  /** path → DOM 역방향 조회 (Phase 13) */
  resolve(path: FiberIdentityPath): HTMLElement | null
  /** DOM → path 정방향 조회 (Phase 16 RECORD-01) — recorder picking 모드에서 사용 */
  resolvePath(el: HTMLElement): FiberIdentityPath | null
  /** bridge 버전. v1 (Phase 13) → v2 (Phase 16, resolvePath 추가) */
  readonly version: '2'
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
 * v2 (Phase 16 RECORD-01):
 * - resolvePath(el) 추가 — recorder picking 모드에서 DOM→FiberIdentityPath 역방향 조회
 * - version: '1' → '2' bump (소비자는 `in` / `typeof` feature detection 권장)
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
    resolvePath(el: HTMLElement): FiberIdentityPath | null {
      // defensive: mockIndex / 구버전 index 에 getPathByDom 이 없을 수 있으므로
      // 존재 확인 후 delegate. 이렇게 해야 bridge v2 가 v1-shape index 에서도 graceful.
      if (typeof index.getPathByDom !== 'function') return null
      return index.getPathByDom(el)
    },
    version: '2',
  }

  Object.defineProperty(window, '__agrune_identity__', {
    value: bridge,
    writable: false,
    configurable: false, // REACT-02: no-overwrite tamper-proof lock
    enumerable: false,
  })

  return true
}
