import { _fiberRoots } from 'bippy'

/**
 * waitForHydration — SSR hydration barrier
 *
 * `document.readyState === 'complete'` AND `_fiberRoots.size > 0` 두 조건이 모두 충족되어야 resolve.
 *
 * - SSR 환경 (`typeof document === 'undefined'`): 무한 대기 (useEffect는 클라이언트에서만 호출)
 * - DOMContentLoaded + load 이벤트 모두 구독, load 후 1 tick 대기 (fallback)
 */
export function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      // SSR: never resolves — useEffect 자체가 client에서만 호출되므로 reach 불가
      return
    }

    const ready = () => document.readyState === 'complete' && _fiberRoots.size > 0

    if (ready()) {
      resolve()
      return
    }

    const check = () => {
      if (ready()) resolve()
    }

    window.addEventListener('DOMContentLoaded', check)
    window.addEventListener('load', check)
    // 마지막 fallback: load 후 1 tick 대기 (React hydration이 load 직후 일어나는 경우 대비)
    window.addEventListener('load', () => setTimeout(() => resolve(), 0), { once: true })
  })
}
