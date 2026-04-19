import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import type { AgruneManifest } from '@agrune/manifest'
import {
  instrument,
  secure,
  traverseRenderedFibers,
  getLatestFiber,
  isHostFiber,
} from 'bippy'
import { FiberIdentityIndex } from '../fiber/identity-index.js'
import { activateBridge } from '../bridge/identity-bridge.js'
import { isProdEnabled } from '../guard/prod-guard.js'
import { waitForHydration } from '../guard/ssr-barrier.js'

export interface AgruneDevtoolsProps {
  manifest: AgruneManifest
  mode: 'dev' | 'prod'
}

/**
 * <AgruneDevtools manifest={m} mode="dev|prod" />
 *
 * Author가 React 앱 entry에 이 컴포넌트를 1줄 추가하면:
 * 1. 2단계 prod guard 통과 확인 (mode="prod"일 때)
 * 2. SSR hydration 완료 대기 (readyState + _fiberRoots)
 * 3. bippy instrument로 React commit마다 DOM↔fiber 매핑 유지
 * 4. window.__agrune_identity__ 를 configurable:false lock으로 게시
 *
 * 시각적 출력 없음 — bridge 설치 전용 컴포넌트.
 *
 * @note manifest prop은 현재 bridge 활성화 경로에서 소비되지 않음.
 *       Phase 14 MacroRunner가 manifest를 소비할 예정. @see Phase 14 plans.
 */
export function AgruneDevtools({ manifest, mode }: AgruneDevtoolsProps): ReactElement | null {
  // StrictMode 이중 mount 방어 — useEffect cleanup + activatedRef 이중 가드
  const activatedRef = useRef(false)

  // manifest prop을 현재는 사용하지 않음 — Phase 14에서 MacroRunner가 소비 예정
  // lint unused variable 방지
  void manifest

  useEffect(() => {
    // StrictMode: 첫 번째 mount에서 설정되면 두 번째 mount에서 early return
    if (activatedRef.current) return
    // 2단계 prod guard (mode='dev'는 항상 통과)
    if (!isProdEnabled(mode)) return
    // SSR defensive guard (useEffect는 client에서만 실행되지만 방어적으로 체크)
    if (typeof window === 'undefined') return

    let cancelled = false

    waitForHydration().then(() => {
      if (cancelled) return

      const index = new FiberIdentityIndex()

      instrument(
        secure(
          {
            onCommitFiberRoot(_rendererID: unknown, root: unknown) {
              traverseRenderedFibers(root, (fiber, phase) => {
                if (phase === 'unmount') {
                  if (isHostFiber(fiber)) index.deindexFiber(fiber)
                  return
                }
                if (!isHostFiber(fiber)) return
                const latest = getLatestFiber(fiber)
                index.indexFiber(latest)
              })
            },
          },
          // Pitfall 7: mode='prod'에서 bippy 자체 production guard 우회
          // Phase 13의 isProdEnabled가 이미 통과했으므로 dangerouslyRunInProduction 전달
          mode === 'prod' ? { dangerouslyRunInProduction: true } : undefined,
        ),
      )

      activateBridge(index)
      activatedRef.current = true
    })

    return () => {
      // cleanup: cancelled flag 설정 (bridge lock은 해제 불가 — REACT-02 intentional)
      cancelled = true
    }
  }, [mode]) // manifest는 현재 bridge 경로에 영향 없음 — Phase 14에서 deps 추가 예정

  // 시각적 출력 없음
  return null
}
