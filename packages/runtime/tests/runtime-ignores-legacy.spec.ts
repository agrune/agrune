// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgruneManifest } from '../src/types'

vi.mock('ai-motion', () => ({
  Motion: class Motion {
    element = document.createElement('div')
    autoResize = vi.fn()
    start = vi.fn()
    fadeIn = vi.fn()
    fadeOut = vi.fn()
  },
}))

import { createPageAgentRuntime } from '../src/runtime/page-agent-runtime'

/**
 * Phase 17 REMOVE-01 — positive regression.
 *
 * Once the inline-scan path is removed (dom-scanner.ts + snapshot.ts
 * LIVE_SCAN_*), the runtime MUST ignore legacy `data-agrune-*` attributes
 * still present in the DOM. Only manifest-provided descriptors count.
 *
 * This spec fails BEFORE Tasks 2-4 (live-scan still active) and PASSES after.
 */

const mockCdpPostMessage = vi.fn((_type: string, data: unknown) => {
  const { requestId } = data as { requestId: string }
  window.dispatchEvent(
    new CustomEvent('agrune:cdp', {
      detail: { type: 'cdp_response', requestId, result: {} },
    }),
  )
})

function buildEmptyManifest(): AgruneManifest {
  return { version: 3, groups: [] }
}

describe('runtime ignores legacy data-agrune-* attributes (REMOVE-01)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockCdpPostMessage.mockClear()
  })

  it('empty manifest + legacy DOM produces zero snapshot targets', () => {
    // Legacy inline-annotated DOM — runtime must NOT treat it as a target.
    document.body.innerHTML = `
      <div data-agrune-group="legacy" data-agrune-group-name="Legacy">
        <button data-agrune-action="click" data-agrune-key="submit" data-agrune-name="Submit">
          Go
        </button>
        <input data-agrune-action="fill" data-agrune-key="email" type="email" />
      </div>
    `

    const runtime = createPageAgentRuntime(buildEmptyManifest(), {
      cdpPostMessage: mockCdpPostMessage,
    })
    runtime.applyConfig({ pointerAnimation: false })

    const snapshot = runtime.getSnapshot()

    expect(snapshot.targets).toHaveLength(0)
    expect(snapshot.groups).toHaveLength(0)
  })

  it('snapshot does not reference data-agrune-action or data-agrune-key as targetIds', () => {
    document.body.innerHTML = `
      <button data-agrune-action="click" data-agrune-key="phantom">Phantom</button>
    `

    const runtime = createPageAgentRuntime(buildEmptyManifest(), {
      cdpPostMessage: mockCdpPostMessage,
    })
    runtime.applyConfig({ pointerAnimation: false })

    const snapshot = runtime.getSnapshot()

    for (const target of snapshot.targets) {
      expect(target.targetId).not.toBe('phantom')
      // No descriptor should be synthesised from the inline annotation.
      expect(JSON.stringify(target.selector)).not.toContain('data-agrune-action')
    }
  })
})
