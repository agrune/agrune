/**
 * React 17 렌더 헬퍼 — RTL 의존 없음
 *
 * @testing-library/react 16.x는 React 17 미지원 (peerDependency: React 18+).
 * React 17 matrix CI에서는 ReactDOM.render() + act() 직접 사용.
 *
 * 주의: 이 파일은 React 17 matrix job에서만 실제 실행됨.
 *       React 18/19 default build에서도 compile 가능하도록 타입 compatible하게 작성.
 */
import React from 'react'
import type { ReactElement } from 'react'

/**
 * React 17용 렌더 헬퍼.
 * ReactDOM.render() + act() 조합으로 컴포넌트를 마운트.
 *
 * React 17: ReactDOM.render + react-dom/test-utils act 사용.
 * React 18/19: 이 함수는 import되지 않으므로 deprecated API 경고 무관.
 *
 * @param ui - 렌더할 React element
 * @param container - 마운트 대상 HTMLElement
 * @returns unmount 함수
 *
 * @example
 * ```tsx
 * const container = document.createElement('div')
 * document.body.appendChild(container)
 * const unmount = renderReact17(<App />, container)
 * // ...assertions...
 * unmount()
 * document.body.removeChild(container)
 * ```
 */
export async function renderReact17(ui: ReactElement, container: HTMLElement): Promise<() => void> {
  // React 17에서만 동작하는 API를 동적 import로 접근
  // React 18/19에서는 이 함수 자체를 호출하지 않으므로 안전
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ReactDOM = (await import('react-dom')) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { act } = (await import('react-dom/test-utils')) as any

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  act(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    ReactDOM.default?.render(ui, container)
  })

  return () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      ReactDOM.default?.unmountComponentAtNode(container)
    })
  }
}

/**
 * React 버전 런타임 guard — React 17 환경인지 확인.
 * Matrix CI에서 override된 React 버전을 런타임에 검증.
 */
export function isReact17(): boolean {
  return React.version.startsWith('17.')
}
