/**
 * memo(forwardRef(Component)) 엣지케이스 fixture
 *
 * 검증 목표:
 * - bippy getDisplayName이 memo/forwardRef 래퍼를 투과해 내부 컴포넌트 이름 반환.
 * - FiberIdentityIndex의 componentName이 'Button' (래퍼 이름 아님).
 * - React 19 호환: displayName 명시 설정으로 all versions에서 안정.
 *
 * @see RESEARCH.md §Pattern 3: memo(forwardRef(...)) displayName 처리
 */
import { memo, forwardRef } from 'react'
import type { ReactElement, Ref } from 'react'

export interface ButtonProps {
  label: string
}

/**
 * 내부 Button 컴포넌트 — forwardRef로 래핑.
 * displayName을 명시적으로 설정해 bippy getDisplayName이 올바른 이름을 추출하도록 함.
 */
const ButtonInner = forwardRef<HTMLButtonElement, ButtonProps>(function ButtonInner(
  { label },
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <button ref={ref} data-testid="memo-btn">
      {label}
    </button>
  )
})
// displayName 명시 — bippy getDisplayName이 내부 이름을 우선 사용
ButtonInner.displayName = 'Button'

/**
 * memo로 한 번 더 래핑된 MemoButton.
 * fiber tag: MemoComponentTag(14) → ForwardRefTag(11) → FunctionComponent
 *
 * bippy getDisplayName 동작:
 * - MemoComponentTag: fiber.type.type (inner function) 탐색
 * - ForwardRefTag: fiber.type.render (inner function) 탐색
 * - 최종: 'Button' (displayName 우선)
 */
export const MemoButton = memo(ButtonInner)
// React 19 호환: memo 래퍼에도 displayName 설정
MemoButton.displayName = 'Button'

/**
 * 테스트 앱 컴포넌트 — MemoButton을 포함하는 최소 트리.
 *
 * 렌더 시 fiber tree:
 * MemoForwardRefApp → div → MemoButton(memo) → ButtonInner(forwardRef) → button(host)
 */
export function MemoForwardRefApp(): ReactElement {
  return (
    <div data-testid="memo-app">
      <MemoButton label="Click me" />
    </div>
  )
}
MemoForwardRefApp.displayName = 'MemoForwardRefApp'
