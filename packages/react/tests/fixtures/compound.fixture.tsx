/**
 * Compound component 엣지케이스 fixture
 *
 * 검증 목표:
 * - Modal.Header / Modal.Body 처럼 parent 컴포넌트에 namespace된 sub-컴포넌트.
 * - displayName이 명시 설정된 경우 그것을 우선 사용 (함수명이 아님).
 * - 없으면 함수명 반환 (bippy getDisplayName 기본 동작).
 *
 * @see RESEARCH.md §must_haves.truths: "Compound component displayName 명시 설정 우선"
 */
import type { ReactElement, ReactNode } from 'react'

// --- Modal compound component ---

function ModalRoot({ children }: { children: ReactNode }): ReactElement {
  return <div data-testid="modal-root">{children}</div>
}
// displayName 미설정 — 함수명 'ModalRoot' 반환 테스트용

function ModalHeader({ children }: { children: ReactNode }): ReactElement {
  return <header data-testid="modal-header">{children}</header>
}
// displayName 명시 설정 — 'Modal.Header' 우선
ModalHeader.displayName = 'Modal.Header'

function ModalBody({ children }: { children: ReactNode }): ReactElement {
  return <div data-testid="modal-body">{children}</div>
}
// displayName 명시 설정 — 'Modal.Body' 우선
ModalBody.displayName = 'Modal.Body'

/**
 * Modal compound component.
 * Object.assign으로 sub-컴포넌트를 namespace에 매달아 Modal.Header, Modal.Body로 접근.
 *
 * 사용:
 * ```tsx
 * <Modal>
 *   <Modal.Header>Title</Modal.Header>
 *   <Modal.Body>Content</Modal.Body>
 * </Modal>
 * ```
 */
export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body: ModalBody,
})

// --- Select compound component (두 번째 케이스 — displayName 없음) ---

function SelectRoot({ children }: { children: ReactNode }): ReactElement {
  return <div data-testid="select-root">{children}</div>
}

function SelectOption({ children, value }: { children: ReactNode; value: string }): ReactElement {
  return (
    <div data-testid={`select-option-${value}`} data-value={value}>
      {children}
    </div>
  )
}
// displayName 명시 설정
SelectOption.displayName = 'Select.Option'

export const Select = Object.assign(SelectRoot, {
  Option: SelectOption,
})

// --- 테스트 앱 컴포넌트 ---

/**
 * Compound component 테스트 앱.
 * Modal + Select 두 패턴 모두 포함.
 */
export function CompoundApp(): ReactElement {
  return (
    <div data-testid="compound-app">
      <Modal>
        <Modal.Header>Title</Modal.Header>
        <Modal.Body>Content</Modal.Body>
      </Modal>
      <Select>
        <Select.Option value="a">Option A</Select.Option>
        <Select.Option value="b">Option B</Select.Option>
      </Select>
    </div>
  )
}
CompoundApp.displayName = 'CompoundApp'
