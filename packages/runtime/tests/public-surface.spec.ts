import { describe, it, expect } from 'vitest'
import * as runtime from '../src/index'

/**
 * Phase 17 REMOVE-01 — negative export-surface regression.
 *
 * `@agrune/runtime` must NOT re-export the legacy inline-annotation scanner
 * symbols (scanAnnotations / scanGroups / buildManifest) nor the associated
 * Scanned* type helpers once the legacy path is physically removed.
 *
 * Type-level absence is enforced by tsc at build time. This runtime-level
 * assertion catches accidental re-exports and gives bisect-friendly CI
 * feedback.
 */
describe('@agrune/runtime — public surface (REMOVE-01)', () => {
  it('does not export scanAnnotations', () => {
    expect((runtime as Record<string, unknown>).scanAnnotations).toBeUndefined()
  })

  it('does not export scanGroups', () => {
    expect((runtime as Record<string, unknown>).scanGroups).toBeUndefined()
  })

  it('does not export buildManifest', () => {
    expect((runtime as Record<string, unknown>).buildManifest).toBeUndefined()
  })

  it('still exports the manifest-based runtime surface', () => {
    // Negative sentinel: guard against accidental over-removal.
    expect(typeof (runtime as Record<string, unknown>).installPageAgentRuntime).toBe('function')
    expect(typeof (runtime as Record<string, unknown>).createPageAgentRuntime).toBe('function')
  })
})
