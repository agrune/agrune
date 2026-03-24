import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { WebCliBackend } from '../src/backend.js'
import type { NativeMessage } from '@webcli-dom/core'

describe('WebCliBackend agent activity lease', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses guard and tail blocks so agent activity stays on until the tail expires', async () => {
    const backend = new WebCliBackend()
    const sent: NativeMessage[] = []
    backend.setNativeSender((msg) => {
      sent.push(msg)
    })

    backend.handleNativeMessage({
      type: 'session_open',
      tabId: 42,
      url: 'http://localhost:5173',
      title: 'Project Management Tool',
    } as NativeMessage)
    backend.handleNativeMessage({
      type: 'snapshot_update',
      tabId: 42,
      snapshot: {
        version: 1,
        capturedAt: Date.now(),
        url: 'http://localhost:5173',
        title: 'Project Management Tool',
        groups: [],
        targets: [],
      },
    } as NativeMessage)

    await backend.handleToolCall('webcli_snapshot', { tabId: 42 })

    expect(sent).toContainEqual({ type: 'agent_activity', active: true })

    await vi.advanceTimersByTimeAsync(4_000)
    expect(sent).not.toContainEqual({ type: 'agent_activity', active: false })

    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent).toContainEqual({ type: 'agent_activity', active: false })
  })
})
