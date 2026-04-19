// React 20 is not released as of 2026-04-19.
// This file reserves the adapter slot so that when bippy's fiber shape changes
// in React 20, we only replace this file without touching identity-index.ts.
//
// Expected contract (TODO once React 20 ships):
//   export function getComponentNameV20(fiber: unknown): string
//   export function getKeyV20(fiber: unknown): string | null
//   export function getIndexV20(fiber: unknown): number
//
// For now, we re-export bippy's getters so identity-index.ts can swap imports
// in one place when the adapter is needed.
export { getDisplayName, getLatestFiber } from 'bippy'
