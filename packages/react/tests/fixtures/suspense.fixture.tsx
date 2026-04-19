/**
 * Suspense boundary 엣지케이스 fixture
 *
 * 검증 목표:
 * - Suspense fallback → content 전환 시 FiberIdentityIndex가
 *   unmount(fallback) + mount(content) 순으로 update.
 * - 전환 후 stale fallback entry가 인덱스에 남지 않음.
 *
 * @see RESEARCH.md §Pattern 7: portal과 Suspense fiber 처리
 * @see RESEARCH.md §Pitfall 4: SSR에서 bridge 조기 활성화
 */
import { Suspense, lazy, type ComponentType } from 'react'
import type { ReactElement } from 'react'

/**
 * lazy() 로드되는 컨텐츠 컴포넌트.
 * Promise.resolve()로 즉시 resolve되어 jsdom 환경에서 Suspense 전환 테스트 가능.
 *
 * 실제 사용에서는 import()로 코드 스플리팅된 컴포넌트를 로드.
 */
function Content() {
  return <div data-testid="suspense-content">Loaded</div>
}

const LazyContent = lazy(
  (): Promise<{ default: ComponentType }> =>
    Promise.resolve({ default: Content }),
)
// LazyExoticComponent 타입에 displayName이 없으므로 런타임에 직접 설정
// (bippy getDisplayName 검증용 — bippy는 fiber.type에서 displayName을 읽음)
;(LazyContent as unknown as { displayName: string }).displayName = 'LazyContent'

/**
 * Suspense 테스트 앱 — lazy 컴포넌트 + fallback 구성.
 *
 * 렌더 시 fiber tree:
 * 1. 초기: SuspenseApp → Suspense → [SuspenseComponentTag] → fallback div
 * 2. lazy resolve 후: SuspenseApp → Suspense → LazyContent → content div
 *
 * FiberIdentityIndex 업데이트 순서:
 * - fallback 단계: div(data-testid="suspense-fallback") indexFiber
 * - content 단계: div(data-testid="suspense-content") indexFiber
 *                 + div(data-testid="suspense-fallback") deindexFiber
 */
export function SuspenseApp(): ReactElement {
  return (
    <Suspense fallback={<div data-testid="suspense-fallback">Loading</div>}>
      <LazyContent />
    </Suspense>
  )
}
SuspenseApp.displayName = 'SuspenseApp'

/**
 * 통제된 지연 없이 즉시 resolve되는 lazy 컴포넌트 팩토리.
 * 테스트에서 waitFor() 없이 Suspense 전환을 테스트할 때 사용.
 *
 * @param displayName - 컴포넌트 displayName (FiberIdentityIndex 검증용)
 */
export function makeLazyComponent(displayName: string) {
  function LazyInner() {
    return <div data-testid={`lazy-${displayName.toLowerCase()}`}>{displayName}</div>
  }

  const component = lazy(
    (): Promise<{ default: ComponentType }> =>
      Promise.resolve({ default: LazyInner }),
  )
  // 런타임 displayName 설정 (LazyExoticComponent 타입에 없음)
  ;(component as unknown as { displayName: string }).displayName = displayName
  return component
}
