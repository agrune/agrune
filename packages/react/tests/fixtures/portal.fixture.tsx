/**
 * Portal (createPortal) 엣지케이스 fixture
 *
 * 검증 목표:
 * - Portal로 렌더된 DOM 노드의 fiber path가 DOM 위치가 아닌 fiber tree 논리적 위치 기반.
 * - portal-root 컨테이너 밖에 렌더된 DOM 요소도 Modal 컴포넌트 하위 fiber path를 가짐.
 *
 * @see RESEARCH.md §Pattern 7: portal과 Suspense fiber 처리
 * @see RESEARCH.md §Pitfall 3: portal DOM 노드의 fiber path
 */
import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal Modal 컴포넌트.
 * DOM에서는 document.body 직속 자식 div에 렌더되지만,
 * fiber tree에서는 PortalApp → Modal → portal content 순서를 유지.
 *
 * 이 불일치가 "portal fiber path is logical, not DOM position"의 핵심.
 */
function Modal({ children }: { children: ReactNode }): ReactElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    // portal 전용 컨테이너를 document.body에 추가
    const el = document.createElement('div')
    el.id = 'portal-root'
    el.setAttribute('data-testid', 'portal-container')
    document.body.appendChild(el)
    setContainer(el)

    return () => {
      // cleanup: portal 컨테이너 제거
      if (document.body.contains(el)) {
        document.body.removeChild(el)
      }
    }
  }, [])

  // container가 준비되기 전 (초기 렌더): null 반환
  if (!container) return null

  // createPortal: children을 container DOM 위치에 렌더하지만
  // fiber tree 위치는 Modal 컴포넌트 하위로 유지됨
  return createPortal(
    <div data-testid="portal-content">{children}</div>,
    container,
  )
}
Modal.displayName = 'Modal'

/**
 * 테스트 앱 컴포넌트 — Modal portal을 포함하는 최소 트리.
 *
 * DOM 구조 (렌더 후):
 * document.body
 *   └─ <div id="test-root">        ← 테스트 마운트 포인트
 *       └─ <div data-testid="header">
 *   └─ <div id="portal-root">      ← portal 컨테이너 (document.body 직속)
 *       └─ <div data-testid="portal-content">
 *           └─ <button data-testid="portal-btn">
 *
 * fiber tree 구조:
 * PortalApp → div → [header, Modal → createPortal → div → button]
 *
 * portal-btn의 fiber path는 Modal을 포함하는 논리적 위치를 가짐.
 */
export function PortalApp(): ReactElement {
  return (
    <div data-testid="portal-app">
      <header data-testid="header">In tree</header>
      <Modal>
        <button data-testid="portal-btn">Close</button>
      </Modal>
    </div>
  )
}
PortalApp.displayName = 'PortalApp'

// Modal 컴포넌트를 외부에서 참조 가능하도록 export (테스트에서 displayName 확인 용도)
export { Modal as PortalModal }
