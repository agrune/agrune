import { describe, it, expect } from 'vitest'
import {
  NativeMessage,
  isSnapshotUpdate,
  isCommandRequest,
  isCommandResult,
  isSessionOpen,
  isSessionClose,
  isConfigUpdate,
} from '../src/native-messages'

describe('NativeMessage type guards', () => {
  it('identifies snapshot_update', () => {
    const msg: NativeMessage = {
      type: 'snapshot_update',
      tabId: 1,
      snapshot: { version: 1, capturedAt: Date.now(), url: '', title: '', groups: [], targets: [] },
    }
    expect(isSnapshotUpdate(msg)).toBe(true)
    expect(isCommandRequest(msg)).toBe(false)
  })

  it('identifies command_request', () => {
    const msg: NativeMessage = {
      type: 'command_request',
      tabId: 1,
      commandId: 'cmd-1',
      command: { kind: 'act', targetId: 'btn-1' },
    }
    expect(isCommandRequest(msg)).toBe(true)
  })

  it('identifies command_result', () => {
    const msg: NativeMessage = {
      type: 'command_result',
      tabId: 1,
      commandId: 'cmd-1',
      result: { commandId: 'cmd-1', ok: true },
    }
    expect(isCommandResult(msg)).toBe(true)
  })

  it('identifies session_open', () => {
    const msg: NativeMessage = { type: 'session_open', tabId: 1, url: 'http://localhost', title: 'Test' }
    expect(isSessionOpen(msg)).toBe(true)
  })

  it('identifies session_close', () => {
    const msg: NativeMessage = { type: 'session_close', tabId: 1 }
    expect(isSessionClose(msg)).toBe(true)
  })

  it('identifies config_update', () => {
    const msg: NativeMessage = {
      type: 'config_update',
      config: { pointerAnimation: true, auroraGlow: false },
    }
    expect(isConfigUpdate(msg)).toBe(true)
  })
})
