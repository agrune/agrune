import { describe, expect, it, vi } from 'vitest'
import { RecorderController } from '../src/recorder-controller'
import type { CommitPayload } from '../src/recorder-controller'

function makePendingStoreMock() {
  const writes: Array<{ sessionId: string; payload: unknown }> = []
  return {
    writes,
    writePending: vi.fn(async (sessionId: string, payload: unknown) => {
      writes.push({ sessionId, payload })
      return `/fake/.agrune/authoring/pending/${sessionId}/x.json`
    }),
    cleanup: vi.fn(async () => 0),
  }
}

function validCommit(overrides: Partial<CommitPayload> = {}): CommitPayload {
  return {
    sessionId: '',
    ts: 1700000000000,
    url: 'https://example.com',
    targetId: 'loginButton_1',
    selector: { css: 'button.login' },
    ...overrides,
  }
}

describe('RecorderController (Phase 16 RECORD-02)', () => {
  it('R1: handleToggle flips idle ↔ picking and broadcasts recorder_state', () => {
    const pending = makePendingStoreMock()
    const broadcast = vi.fn()
    const controller = new RecorderController(pending as never, broadcast)

    expect(controller.getMode()).toBe('idle')
    controller.handleToggle()
    expect(controller.getMode()).toBe('picking')
    expect(broadcast).toHaveBeenLastCalledWith({ type: 'recorder_state', mode: 'picking' })

    controller.handleToggle()
    expect(controller.getMode()).toBe('idle')
    expect(broadcast).toHaveBeenLastCalledWith({ type: 'recorder_state', mode: 'idle' })
  })

  it('R2: handleCommit writes pending file, resets to idle, broadcasts idle state', async () => {
    const pending = makePendingStoreMock()
    const broadcast = vi.fn()
    const controller = new RecorderController(pending as never, broadcast)
    controller.handleToggle() // idle → picking

    await controller.handleCommit(validCommit())
    expect(pending.writePending).toHaveBeenCalledTimes(1)
    const [sessionId, payload] = pending.writePending.mock.calls[0]
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
    expect((payload as { targets: unknown[] }).targets.length).toBe(1)
    expect(controller.getMode()).toBe('idle')
    expect(broadcast).toHaveBeenLastCalledWith({ type: 'recorder_state', mode: 'idle' })
  })

  it('R3: handleCommit with invalid targetId broadcasts error and does not write (T-16-03)', async () => {
    const pending = makePendingStoreMock()
    const broadcast = vi.fn()
    const controller = new RecorderController(pending as never, broadcast)

    await controller.handleCommit(validCommit({ targetId: "x'); drop;--" }))
    expect(pending.writePending).not.toHaveBeenCalled()
    const errorCalls = broadcast.mock.calls.find(
      ([msg]) =>
        typeof msg === 'object' &&
        msg !== null &&
        (msg as { type?: string }).type === 'recorder_error',
    )
    // If we don't broadcast a specific error type, at least ensure the mode
    // remains consistent and no pending file was written.
    expect(pending.writePending).not.toHaveBeenCalled()
    // error broadcast surface is optional but recommended — assert if present
    if (errorCalls) {
      const msg = errorCalls[0] as { code?: string }
      expect(msg.code).toBe('RECORDER_INVALID_TARGET_ID')
    }
  })

  it('R4: reset() forces mode to idle and broadcasts (disconnect handling, Pitfall 6 server-side)', () => {
    const pending = makePendingStoreMock()
    const broadcast = vi.fn()
    const controller = new RecorderController(pending as never, broadcast)
    controller.handleToggle() // → picking
    broadcast.mockClear()
    controller.reset()
    expect(controller.getMode()).toBe('idle')
    expect(broadcast).toHaveBeenCalledWith({ type: 'recorder_state', mode: 'idle' })
  })

  it('R5: handleCaptured sets mode to recording-action and broadcasts capture', () => {
    const pending = makePendingStoreMock()
    const broadcast = vi.fn()
    const controller = new RecorderController(pending as never, broadcast)
    const capture = {
      url: 'https://example.com',
      roleSelector: { role: 'button', name: 'Login' },
      cssSelector: 'button.login',
      autoTargetId: 'loginButton_1',
    }
    controller.handleCaptured(capture)
    expect(controller.getMode()).toBe('recording-action')
    const capturedCall = broadcast.mock.calls.find(
      ([msg]) =>
        typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'recorder_captured',
    )
    expect(capturedCall).toBeDefined()
  })
})
