// Public barrel — @agrune/react 패키지 public API

// 주 컴포넌트
export { AgruneDevtools } from './components/AgruneDevtools.js'
export type { AgruneDevtoolsProps } from './components/AgruneDevtools.js'

// 타입 re-export (@agrune/manifest 단일 소스)
export type { FiberIdentityPath, FiberPathSegment } from '@agrune/manifest'

// bridge 타입
export type { AgruneIdentityBridge } from './bridge/identity-bridge.js'

// Advanced API — power users / Plan 03 matrix tests
export { FiberIdentityIndex } from './fiber/identity-index.js'
export { isProdEnabled } from './guard/prod-guard.js'
export { waitForHydration } from './guard/ssr-barrier.js'
