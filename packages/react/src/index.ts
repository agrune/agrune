// Task 2에서 완성될 barrel — 현재는 typecheck 통과용 최소 export
export type { FiberIdentityPath, FiberPathSegment } from '@agrune/manifest'
export { FiberIdentityIndex } from './fiber/identity-index.js'
export { isProdEnabled } from './guard/prod-guard.js'
export { waitForHydration } from './guard/ssr-barrier.js'
