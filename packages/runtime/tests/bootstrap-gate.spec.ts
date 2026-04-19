import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Bootstrap gate removal (RESOLVE-04).
 *
 * The bootstrap source is a template literal inside
 * packages/browser/src/cdp-runtime-injector.ts. These tests ensure the
 * source no longer contains the annotation-gating logic.
 */
const INJECTOR_PATH = join(__dirname, '..', '..', 'browser', 'src', 'cdp-runtime-injector.ts')
const source = readFileSync(INJECTOR_PATH, 'utf-8')

describe('cdp-runtime-injector.ts — bootstrap gate removed', () => {
  it('has no hasAnnotations symbol', () => {
    expect(source).not.toContain('hasAnnotations')
  })

  it('has no mutationTouchesAnnotations symbol', () => {
    expect(source).not.toContain('mutationTouchesAnnotations')
  })

  it('has no installObserver (annotation-specific MutationObserver retrigger)', () => {
    expect(source).not.toContain('installObserver')
  })

  it('does not gate installRuntime on annotation presence', () => {
    // `if (!hasAnnotations()) return;` must be gone
    expect(source).not.toMatch(/if\s*\(\s*!\s*hasAnnotations\s*\(\s*\)\s*\)\s*return/)
  })

  it('uses buildEmptyManifest for idle boot', () => {
    expect(source).toContain('buildEmptyManifest')
  })

  it('posts hasManifest in runtime_ready event', () => {
    expect(source).toContain("post('runtime_ready'")
    expect(source).toContain('hasManifest')
  })

  it('checks window.__agrune_manifest__ for owned-app injection', () => {
    expect(source).toContain('__agrune_manifest__')
  })

  it('checks window.__agrune_preload_manifest__ for CDP preload', () => {
    expect(source).toContain('__agrune_preload_manifest__')
  })

  it('exposes reloadRuntime hook for Phase 12 manifest injection', () => {
    expect(source).toContain('reloadRuntime')
  })

  it('exposes __agrune_runtime_state__ for test visibility via Object.defineProperty', () => {
    expect(source).toContain('__agrune_runtime_state__')
    expect(source).toContain('Object.defineProperty')
  })
})
