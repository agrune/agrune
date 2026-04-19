/**
 * React 19 렌더 헬퍼 — createRoot API (React 18과 동일)
 *
 * React 19는 createRoot API를 그대로 유지.
 * 주요 변경: forwardRef 불필요 (ref를 일반 prop으로 직접 전달 가능).
 *
 * @note React 19에서 forwardRef는 선택사항이 됨.
 *       기존 forwardRef 코드는 여전히 동작하므로 하위 호환성 유지.
 */

// React 19도 createRoot + act 조합을 그대로 사용
// API는 React 18과 동일하므로 re-export
export { renderReact18 as renderReact19 } from './react18-fixture.js'
export type { RenderResult18 as RenderResult19 } from './react18-fixture.js'

/**
 * React 버전 런타임 guard — React 19 환경인지 확인.
 */
export function isReact19(): boolean {
  const React = require('react') as typeof import('react')
  return (React.version as string).startsWith('19.')
}

/**
 * React 19 전용: ref prop 직접 사용 데모 컴포넌트.
 *
 * React 19에서는 forwardRef 없이 ref를 직접 prop으로 받을 수 있음.
 * 기존 React 17/18의 forwardRef 패턴과 비교 테스트에 사용.
 *
 * @example
 * ```tsx
 * // React 19: ref를 직접 prop으로 전달
 * const ref = useRef<HTMLButtonElement>(null)
 * <React19RefButton ref={ref} label="Click" />
 * ```
 */
export interface React19RefButtonProps {
  label: string
  ref?: React.Ref<HTMLButtonElement>
}

// React 19 style: ref as normal prop (forwardRef 불필요)
// React 17/18 호환을 위해 이 패턴은 react19-fixture.tsx에서만 사용
import React from 'react'
export function React19RefButton({ label, ref }: React19RefButtonProps): React.ReactElement {
  return (
    <button ref={ref} data-testid="react19-ref-btn">
      {label}
    </button>
  )
}
React19RefButton.displayName = 'React19RefButton'
