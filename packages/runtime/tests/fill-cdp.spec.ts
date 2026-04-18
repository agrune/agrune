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
    constructor() {}
  },
}))

import { createPageAgentRuntime } from '../src/runtime/page-agent-runtime'

function mockRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    top: 0,
    left: 0,
    right: 120,
    bottom: 40,
    toJSON: () => ({}),
  } as DOMRect
}

function makeFillManifest(targetId: string, selector: string): AgruneManifest {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    exposureMode: 'grouped',
    groups: [
      {
        groupId: 'forms',
        groupName: 'Forms',
        tools: [
          {
            action: 'fill',
            status: 'active',
            targets: [
              {
                desc: null,
                name: null,
                selector,
                sourceColumn: 1,
                sourceFile: 'Form.tsx',
                sourceLine: 1,
                targetId,
              },
            ],
            toolDesc: '입력',
            toolName: 'form_fill',
          },
        ],
      },
    ],
  }
}

const mockCdpPostMessage = vi.fn((_type: string, data: unknown) => {
  const { requestId } = data as { requestId: string }
  window.dispatchEvent(
    new CustomEvent('agrune:cdp', {
      detail: { type: 'cdp_response', requestId, result: {} },
    }),
  )
})

function cdpCalls(): Array<{ method: string; params: Record<string, unknown> }> {
  return mockCdpPostMessage.mock.calls
    .map(([, data]) => data as { method?: string; params?: Record<string, unknown> })
    .filter((m): m is { method: string; params: Record<string, unknown> } =>
      typeof m.method === 'string' && !!m.params,
    )
}

function buildRuntime(manifest: AgruneManifest) {
  const runtime = createPageAgentRuntime(manifest, {
    cdpPostMessage: mockCdpPostMessage,
  })
  runtime.applyConfig({ pointerAnimation: false })
  return runtime
}

describe('handleFill — CDP Input domain', () => {
  beforeEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    mockCdpPostMessage.mockReset()
    const elementFromPoint = vi.fn(() => null)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
      writable: true,
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    })
  })

  it('INPUT-01: plain text input uses Input.insertText (strategy=auto)', async () => {
    const input = document.createElement('input')
    input.setAttribute('data-agrune-key', 'plain')
    input.type = 'text'
    input.getBoundingClientRect = () => mockRect()
    document.body.appendChild(input)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => input,
    )

    const runtime = buildRuntime(makeFillManifest('plain', '[data-agrune-key="plain"]'))
    const snapshot = runtime.getSnapshot()
    const result = await runtime.fill({
      expectedVersion: snapshot.version,
      targetId: 'plain',
      value: 'hello',
      clear: true,
    })

    expect(result.ok).toBe(true)
    const calls = cdpCalls()
    const insert = calls.find(c => c.method === 'Input.insertText')
    expect(insert).toBeTruthy()
    expect(insert?.params.text).toBe('hello')
    // Should NOT fall back to per-character dispatchKeyEvent.
    const dispatchEvents = calls.filter(c => c.method === 'Input.dispatchKeyEvent')
    const perCharEvents = dispatchEvents.filter(c => c.params.text === 'h' || c.params.text === 'e')
    expect(perCharEvents.length).toBe(0)
  })

  it('INPUT-03: masked tel input uses per-character dispatchKeyEvent', async () => {
    const input = document.createElement('input')
    input.setAttribute('data-agrune-key', 'phone')
    input.type = 'tel'
    input.setAttribute('pattern', '\\d{3}-\\d{4}')
    input.setAttribute('inputmode', 'tel')
    input.getBoundingClientRect = () => mockRect()
    document.body.appendChild(input)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => input,
    )

    const runtime = buildRuntime(makeFillManifest('phone', '[data-agrune-key="phone"]'))
    const snapshot = runtime.getSnapshot()
    const result = await runtime.fill({
      expectedVersion: snapshot.version,
      targetId: 'phone',
      value: '123',
      strategy: 'auto',
      clear: true,
    })

    expect(result.ok).toBe(true)
    const calls = cdpCalls()
    // Should NOT use insertText for masked inputs.
    expect(calls.find(c => c.method === 'Input.insertText')).toBeFalsy()
    // Each character of "123" should be dispatched as keyDown/keyUp.
    const keyDowns = calls.filter(
      c => c.method === 'Input.dispatchKeyEvent' && c.params.type === 'keyDown' && typeof c.params.text === 'string',
    )
    expect(keyDowns.length).toBeGreaterThanOrEqual(3)
    expect(keyDowns.map(k => k.params.text)).toEqual(expect.arrayContaining(['1', '2', '3']))
  })

  it('INPUT-02: contenteditable element is accepted and receives insertText', async () => {
    const div = document.createElement('div')
    div.setAttribute('data-agrune-key', 'note')
    div.setAttribute('contenteditable', 'true')
    div.getBoundingClientRect = () => mockRect()
    // jsdom does not auto-compute isContentEditable reliably.
    Object.defineProperty(div, 'isContentEditable', {
      configurable: true,
      value: true,
    })
    document.body.appendChild(div)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => div,
    )

    const runtime = buildRuntime(makeFillManifest('note', '[data-agrune-key="note"]'))
    const snapshot = runtime.getSnapshot()
    const result = await runtime.fill({
      expectedVersion: snapshot.version,
      targetId: 'note',
      value: '한글 텍스트',
      clear: false,
    })

    expect(result.ok).toBe(true)
    const calls = cdpCalls()
    const insert = calls.find(c => c.method === 'Input.insertText')
    expect(insert).toBeTruthy()
    expect(insert?.params.text).toBe('한글 텍스트')
  })

  it('INPUT-04: clear=false skips selectAll; clear=true triggers selectAll command', async () => {
    const input = document.createElement('input')
    input.setAttribute('data-agrune-key', 'noclear')
    input.type = 'text'
    input.value = 'existing'
    input.getBoundingClientRect = () => mockRect()
    document.body.appendChild(input)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => input,
    )

    const runtime = buildRuntime(makeFillManifest('noclear', '[data-agrune-key="noclear"]'))
    let snapshot = runtime.getSnapshot()
    const noClearResult = await runtime.fill({
      expectedVersion: snapshot.version,
      targetId: 'noclear',
      value: 'more',
      clear: false,
    })
    expect(noClearResult.ok).toBe(true)
    const afterNoClear = cdpCalls()
    const selectAllAfterNoClear = afterNoClear.find(
      c =>
        c.method === 'Input.dispatchKeyEvent' &&
        Array.isArray((c.params as { commands?: string[] }).commands) &&
        ((c.params as { commands?: string[] }).commands ?? []).includes('selectAll'),
    )
    expect(selectAllAfterNoClear).toBeFalsy()

    mockCdpPostMessage.mockClear()
    snapshot = runtime.getSnapshot()
    const clearResult = await runtime.fill({
      expectedVersion: snapshot.version,
      targetId: 'noclear',
      value: 'reset',
      clear: true,
    })
    expect(clearResult.ok).toBe(true)
    const afterClear = cdpCalls()
    const selectAllAfterClear = afterClear.find(
      c =>
        c.method === 'Input.dispatchKeyEvent' &&
        Array.isArray((c.params as { commands?: string[] }).commands) &&
        ((c.params as { commands?: string[] }).commands ?? []).includes('selectAll'),
    )
    expect(selectAllAfterClear).toBeTruthy()
  })
})
