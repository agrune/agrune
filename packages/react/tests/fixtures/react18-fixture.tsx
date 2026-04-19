/**
 * React 18 렌더 헬퍼 — createRoot + act()
 *
 * React 18에서 도입된 createRoot API 기반 렌더 헬퍼.
 * @testing-library/react 16.x (React 18/19 지원)를 직접 사용할 수도 있으나,
 * matrix 버전 fixture 일관성을 위해 createRoot 직접 사용.
 */
import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

export interface RenderResult18 {
  /** root.unmount() + act() 래핑 */
  unmount: () => void
  /** 렌더된 createRoot 인스턴스 (re-render 등에 사용) */
  root: Root
}

/**
 * React 18용 렌더 헬퍼.
 * createRoot() + act() 조합으로 컴포넌트를 마운트.
 *
 * @param ui - 렌더할 React element
 * @param container - 마운트 대상 HTMLElement
 * @returns { unmount, root }
 *
 * @example
 * ```tsx
 * const container = document.createElement('div')
 * document.body.appendChild(container)
 * const { unmount } = renderReact18(<App />, container)
 * // ...assertions...
 * unmount()
 * document.body.removeChild(container)
 * ```
 */
export function renderReact18(ui: ReactElement, container: HTMLElement): RenderResult18 {
  let root!: Root

  act(() => {
    root = createRoot(container)
    root.render(ui)
  })

  return {
    unmount() {
      act(() => root.unmount())
    },
    root,
  }
}

/**
 * React 버전 런타임 guard — React 18 환경인지 확인.
 */
export function isReact18(): boolean {
  // runtime import to avoid circular dependency issues
  const React = require('react') as typeof import('react')
  return (React.version as string).startsWith('18.')
}
