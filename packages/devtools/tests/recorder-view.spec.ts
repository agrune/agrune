// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecorderView } from '../src/recorder-view'
import type { CaptureResult, OutboundMessage } from '../src/types'
import type { DevtoolsWsClient } from '../src/ws-client'

type StatusListener = (connected: boolean) => void

function createMockWs(): DevtoolsWsClient & {
  _statusListeners: StatusListener[]
  _sent: OutboundMessage[]
  _fireStatus: (connected: boolean) => void
} {
  const sent: OutboundMessage[] = []
  const statusListeners: StatusListener[] = []
  const ws = {
    _statusListeners: statusListeners,
    _sent: sent,
    _fireStatus(connected: boolean) {
      for (const l of statusListeners) l(connected)
    },
    send(msg: OutboundMessage) {
      sent.push(msg)
    },
    onStatusChange(listener: StatusListener) {
      statusListeners.push(listener)
      return () => {
        const i = statusListeners.indexOf(listener)
        if (i !== -1) statusListeners.splice(i, 1)
      }
    },
    onMessage() {
      return () => {}
    },
    connect() {},
  } as unknown as DevtoolsWsClient & {
    _statusListeners: StatusListener[]
    _sent: OutboundMessage[]
    _fireStatus: (connected: boolean) => void
  }
  return ws
}

function sampleCapture(overrides: Partial<CaptureResult> = {}): CaptureResult {
  return {
    url: 'https://example.com/login',
    roleSelector: { role: 'button', name: 'Login' },
    cssSelector: '[data-testid="login-btn"]',
    autoTargetId: 'loginButton_1',
    ...overrides,
  }
}

function dispatchKey(opts: {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
}): void {
  const event = new KeyboardEvent('keydown', {
    key: opts.key,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    metaKey: opts.metaKey ?? false,
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
}

describe('RecorderView (Phase 16 RECORD-01/02)', () => {
  let root: HTMLDivElement
  let ws: ReturnType<typeof createMockWs>
  let view: RecorderView

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
    ws = createMockWs()
    view = new RecorderView(root, ws)
  })

  afterEach(() => {
    view.dispose()
    root.remove()
    vi.restoreAllMocks()
  })

  it('Test 1: starts in idle mode and renders "Recorder idle"', () => {
    expect(root.textContent).toMatch(/recorder.*idle/i)
    // A visible badge should reflect current mode
    expect(root.querySelector('.recorder-mode-badge')?.textContent?.toLowerCase()).toContain('idle')
  })

  it('Test 2: transitions to picking when receiving recorder_state with mode=picking', () => {
    view.update({ type: 'recorder_state', mode: 'picking' })
    expect(root.querySelector('.recorder-mode-badge')?.textContent?.toLowerCase()).toContain(
      'picking',
    )
    expect(root.textContent?.toLowerCase()).toMatch(/picking/)
  })

  it('Test 3: transitions to recording-action with candidates on recorder_captured', () => {
    const capture = sampleCapture({
      roleSelector: { role: 'button', name: 'Login' },
      cssSelector: 'button.login',
      autoTargetId: 'loginButton_1',
    })
    view.update({ type: 'recorder_captured', data: capture })
    expect(root.querySelector('.recorder-mode-badge')?.textContent?.toLowerCase()).toContain(
      'recording',
    )
    const candidates = root.querySelectorAll('.candidate-selector')
    // role + css (fiber path missing → 2 candidates)
    expect(candidates.length).toBeGreaterThanOrEqual(2)
    const input = root.querySelector<HTMLInputElement>('.recorder-target-input')
    expect(input).not.toBeNull()
    expect(input?.value).toBe('loginButton_1')
  })

  it('Test 4: Ctrl+Shift+R sends recorder_toggle', () => {
    dispatchKey({ key: 'R', ctrlKey: true, shiftKey: true })
    const toggles = ws._sent.filter(m => m.type === 'recorder_toggle')
    expect(toggles.length).toBe(1)
  })

  it('Test 5: Escape key sends recorder_toggle to cancel picking', () => {
    view.update({ type: 'recorder_state', mode: 'picking' })
    ws._sent.length = 0
    dispatchKey({ key: 'Escape' })
    const toggles = ws._sent.filter(m => m.type === 'recorder_toggle')
    expect(toggles.length).toBe(1)
  })

  it('Test 6: Enter with candidates sends recorder_commit with targetId override', () => {
    const capture = sampleCapture({ autoTargetId: 'loginButton_1' })
    view.update({ type: 'recorder_captured', data: capture })
    // User edits the targetId
    const input = root.querySelector<HTMLInputElement>('.recorder-target-input')!
    input.value = 'my_custom_id'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    dispatchKey({ key: 'Enter' })
    const commits = ws._sent.filter(
      (m): m is Extract<OutboundMessage, { type: 'recorder_commit' }> =>
        m.type === 'recorder_commit',
    )
    expect(commits.length).toBe(1)
    expect(commits[0].data.targetId).toBe('my_custom_id')
    expect(commits[0].data.url).toBe(capture.url)
    // selector should contain at least one key (ladder requires AtLeastOne)
    expect(commits[0].data.selector).toBeDefined()
    expect(Object.keys(commits[0].data.selector as object).length).toBeGreaterThanOrEqual(1)
  })

  it('Test 7: WS disconnect forces mode back to idle', () => {
    view.update({ type: 'recorder_state', mode: 'picking' })
    expect(root.querySelector('.recorder-mode-badge')?.textContent?.toLowerCase()).toContain(
      'picking',
    )
    ws._fireStatus(false)
    expect(root.querySelector('.recorder-mode-badge')?.textContent?.toLowerCase()).toContain(
      'idle',
    )
    // Candidates should also be cleared
    expect(root.querySelector('.candidate-selector')).toBeNull()
  })
})
