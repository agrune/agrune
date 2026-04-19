import { afterEach, describe, expect, it, vi } from 'vitest'
import { CdpDriver } from '../src/cdp-driver.js'

describe('CdpDriver background callbacks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('swallows expected disconnect errors from binding callbacks', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/devtools/browser/mock' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(driver as never, 'onBindingCalled' as never).mockRejectedValue(
      new Error('CDP connection disconnected.'),
    )

    ;(driver as any).handleBindingCalled({}, 'session-1')
    await Promise.resolve()

    expect(consoleError).not.toHaveBeenCalled()
  })

  it('logs unexpected background callback errors', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/devtools/browser/mock' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(driver as never, 'onBindingCalled' as never).mockRejectedValue(
      new Error('boom'),
    )

    ;(driver as any).handleBindingCalled({}, 'session-1')
    await Promise.resolve()

    expect(consoleError).toHaveBeenCalledWith(
      '[agrune quick-mode] background task failed:',
      expect.any(Error),
    )
  })

  it('execute는 quick mode runtime에 agent activity를 알린다', async () => {
    vi.useFakeTimers()

    try {
      const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/devtools/browser/mock' })
      const evaluateInSession = vi
        .spyOn(driver as never, 'evaluateInSession' as never)
        .mockImplementation(async (_sessionId: string, expression: string) => {
          if (expression.includes('handleCommand')) {
            return {
              commandId: 'cmd-1',
              ok: true,
            }
          }
          return undefined
        })

      vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
        tabId: 1,
        sessionId: 'session-1',
      })
      vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
        { tabId: 1, sessionId: 'session-1' },
      ])

      const result = await driver.execute(1, { kind: 'act', targetId: 'login' })
      expect(result.ok).toBe(true)

      await Promise.resolve()

      expect(evaluateInSession).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('setAgentActivity(true)'),
      )
      expect(evaluateInSession).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('.handleCommand('),
      )

      await vi.advanceTimersByTimeAsync(5_000)

      expect(evaluateInSession).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('setAgentActivity(false)'),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('CdpDriver recovery surface', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('execute()가 복구 실패 후 RECOVERY_FAILED 에러를 반환한다', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])

    ;(driver as any).recovery = {
      isRecovering: () => false,
      waitForRecovery: () => Promise.resolve(),
      getLastFailure: () => ({
        cause: 'connection_lost',
        error: new Error('backoff exhausted'),
        attempts: 5,
      }),
    }

    vi.spyOn(driver as never, 'evaluateInSession' as never).mockImplementation(
      async (..._args: unknown[]) => {
        const expression = _args[1] as string
        if (expression.includes('handleCommand')) {
          throw new Error('not open')
        }
        return undefined as never
      },
    )

    const result = await driver.execute(1, { kind: 'act', targetId: 't' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RECOVERY_FAILED')
      expect(result.error.details).toMatchObject({ attempts: 5, cause: 'connection_lost' })
    }
  })

  it('execute()가 복구 진행 중일 때 CONNECTION_LOST 에러를 반환한다', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])

    ;(driver as any).recovery = {
      isRecovering: () => true,
      waitForRecovery: () => Promise.resolve(),
      getLastFailure: () => null,
    }

    vi.spyOn(driver as never, 'evaluateInSession' as never).mockImplementation(
      async (..._args: unknown[]) => {
        const expression = _args[1] as string
        if (expression.includes('handleCommand')) {
          throw new Error('disconnected mid-command')
        }
        return undefined as never
      },
    )

    const result = await driver.execute(1, { kind: 'act', targetId: 't' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CONNECTION_LOST')
    }
  })
})

describe('CdpDriver.resolveTabId precedence', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the argument tabId when provided', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.openSession(2, 'https://b.com', 'B')
    driver.sessions.setActiveSession(2)
    expect(driver.resolveTabId(1)).toBe(1)
  })

  it('falls back to the active session when no argument is given', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.openSession(2, 'https://b.com', 'B')
    driver.sessions.setActiveSession(2)
    expect(driver.resolveTabId()).toBe(2)
  })

  it('falls back to the first ready session if no active session', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.openSession(2, 'https://b.com', 'B')
    driver.sessions.updateSnapshot(2, {
      version: 1,
      capturedAt: Date.now(),
      url: 'https://b.com',
      title: 'B',
      groups: [],
      targets: [],
    })
    expect(driver.resolveTabId()).toBe(2)
  })

  it('falls back to the first session if no active and no ready session', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.openSession(2, 'https://b.com', 'B')
    expect(driver.resolveTabId()).toBe(1)
  })

  it('returns null when there are no sessions', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    expect(driver.resolveTabId()).toBeNull()
  })
})

describe('CdpDriver.execute marks the tab active on success', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('touches the session after a successful command', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])

    vi.spyOn(driver as never, 'evaluateInSession' as never).mockImplementation(
      async (..._args: unknown[]) => {
        const expression = _args[1] as string
        if (expression.includes('handleCommand')) {
          return { commandId: 'cmd-x', ok: true } as never
        }
        return undefined as never
      },
    )

    const touchSpy = vi.spyOn(driver.sessions, 'touchSession')
    const result = await driver.execute(1, { kind: 'act', targetId: 't' })
    expect(result.ok).toBe(true)
    expect(touchSpy).toHaveBeenCalledWith(1)
    expect(driver.sessions.getActiveSessionId()).toBe(1)
  })

  it('does not touch the session when the command fails', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])
    ;(driver as any).recovery = {
      isRecovering: () => false,
      waitForRecovery: () => Promise.resolve(),
      getLastFailure: () => null,
    }

    vi.spyOn(driver as never, 'evaluateInSession' as never).mockImplementation(
      async (..._args: unknown[]) => {
        const expression = _args[1] as string
        if (expression.includes('handleCommand')) {
          return {
            commandId: 'cmd-x',
            ok: false,
            error: { code: 'INVALID_COMMAND', message: 'bad' },
          } as never
        }
        return undefined as never
      },
    )

    const touchSpy = vi.spyOn(driver.sessions, 'touchSession')
    const result = await driver.execute(1, { kind: 'act', targetId: 't' })
    expect(result.ok).toBe(false)
    expect(touchSpy).not.toHaveBeenCalled()
    expect(driver.sessions.getActiveSessionId()).toBeNull()
  })
})

describe('CdpDriver.focusSession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws TAB_NOT_FOUND for unknown tabs', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    await expect(driver.focusSession(999)).rejects.toMatchObject({
      code: 'TAB_NOT_FOUND',
    })
  })

  it('sets the active session and returns wasActive=false for a new tab', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.openSession(2, 'https://b.com', 'B')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue(null)

    const result = await driver.focusSession(2)
    expect(result).toMatchObject({ tabId: 2, wasActive: false, becameActive: true })
    expect(driver.sessions.getActiveSessionId()).toBe(2)
  })

  it('returns wasActive=true when focusing the already-active tab', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue(null)

    const result = await driver.focusSession(1)
    expect(result.wasActive).toBe(true)
  })

  it('calls Target.activateTarget and Page.bringToFront when a target is attached', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })

    const sendSpy = vi
      .spyOn((driver as any).connection, 'send')
      .mockResolvedValue({})

    const result = await driver.focusSession(1)
    expect(sendSpy).toHaveBeenCalledWith('Target.activateTarget', { targetId: 'cdp-target-1' })
    expect(sendSpy).toHaveBeenCalledWith('Page.bringToFront', {}, 'session-1')
    expect(result.cdpFocusError).toBeUndefined()
  })

  it('returns cdpFocusError when CDP focus calls fail but still flips active', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })

    vi.spyOn((driver as any).connection, 'send').mockRejectedValue(new Error('cdp broken'))

    const result = await driver.focusSession(1)
    expect(result.becameActive).toBe(true)
    expect(result.cdpFocusError).toBe('cdp broken')
    expect(driver.sessions.getActiveSessionId()).toBe(1)
  })
})

describe('CdpDriver.listSessions reflects active flag', () => {
  it('marks the active session with active=true and others false', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.openSession(2, 'https://b.com', 'B')
    driver.sessions.setActiveSession(2)

    const sessions = driver.listSessions()
    const active = sessions.find(s => s.tabId === 2)
    const inactive = sessions.find(s => s.tabId === 1)
    expect(active?.active).toBe(true)
    expect(inactive?.active).toBe(false)
  })
})

// ─── injectManifest ──────────────────────────────────────────────────────────

import type { AgruneManifest } from '@agrune/core'

function makeManifest(groupId = 'g1'): AgruneManifest {
  return {
    version: 3,
    groups: [{ groupId, targets: [{ targetId: 't1', actionKinds: ['click'], selector: { css: '#btn' } }] }],
  }
}

describe('CdpDriver.injectManifest', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Case A: 유효한 tabId + manifest → Runtime.evaluate 호출에 __agrune_manifest__ + reloadRuntime 포함', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    const evaluateInSession = vi
      .spyOn(driver as never, 'evaluateInSession' as never)
      .mockResolvedValue(null as never)

    const manifest = makeManifest()
    await driver.injectManifest(1, manifest)

    // Runtime.evaluate 경로 호출 확인
    expect(evaluateInSession).toHaveBeenCalled()
    const expression = evaluateInSession.mock.calls[0][1] as string
    expect(expression).toContain('__agrune_manifest__')
    expect(expression).toContain('reloadRuntime')
  })

  it('Case A-2: expression에 JSON.parse wrapper로 manifest 값이 embed됨', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    const evaluateInSession = vi
      .spyOn(driver as never, 'evaluateInSession' as never)
      .mockResolvedValue(null as never)

    const manifest = makeManifest('my-special-group')
    await driver.injectManifest(1, manifest)

    const expression = evaluateInSession.mock.calls[0][1] as string
    expect(expression).toContain('JSON.parse(')
    expect(expression).toContain('my-special-group')
  })

  it('Case B: 존재하지 않는 tabId → TAB_NOT_FOUND 에러 throw', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue(undefined)

    const manifest = makeManifest()
    await expect(driver.injectManifest(999, manifest)).rejects.toMatchObject({
      code: 'TAB_NOT_FOUND',
    })
  })

  it('Case B-2: sessionId가 없는 target → TAB_NOT_FOUND 에러 throw', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: undefined,
    })

    const manifest = makeManifest()
    await expect(driver.injectManifest(1, manifest)).rejects.toMatchObject({
      code: 'TAB_NOT_FOUND',
    })
  })

  it('Case C: U+2028 포함 manifest → expression에 \\u2028 이스케이프됨', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    const evaluateInSession = vi
      .spyOn(driver as never, 'evaluateInSession' as never)
      .mockResolvedValue(null as never)

    const manifest = makeManifest('g\u2028ls')
    await driver.injectManifest(1, manifest)

    const expression = evaluateInSession.mock.calls[0][1] as string
    expect(expression).not.toContain('\u2028')
    expect(expression).toContain('\\u2028')
  })

  it('Case D: 호출 후 refreshSnapshot이 트리거됨 (evaluateInSession으로 getSnapshot 호출)', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    const evaluateInSession = vi
      .spyOn(driver as never, 'evaluateInSession' as never)
      .mockResolvedValue(null as never)

    const manifest = makeManifest()
    await driver.injectManifest(1, manifest)

    // refreshSnapshot은 getSnapshot expression을 포함한 evaluateInSession 호출
    const allExpressions = evaluateInSession.mock.calls.map(c => c[1] as string)
    const hasSnapshot = allExpressions.some(e => e.includes('getSnapshot'))
    expect(hasSnapshot).toBe(true)
  })
})

// ─── CdpDriver.runMacro ───────────────────────────────────────────────────────

describe('CdpDriver.runMacro — Runtime.evaluate 단일 호출 (Phase 14-03)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Case A: runMacro → evaluateInSession 정확히 1회만 호출 (step 수 무관)', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    const mockResult = { status: 'ok', macroId: 'login', stepCount: 3 }
    const evaluateInSession = vi
      .spyOn(driver as never, 'evaluateInSession' as never)
      .mockResolvedValue(mockResult as never)

    await driver.runMacro(1, 'login', { username: 'user' })

    // step 수(3)와 무관하게 evaluate 1회만 호출 — 핵심 요구사항
    expect(evaluateInSession).toHaveBeenCalledTimes(1)
  })

  it('Case B: expression에 macroId와 params가 JSON.stringify되어 포함됨', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    const mockResult = { status: 'ok', macroId: 'login', stepCount: 2 }
    const evaluateInSession = vi
      .spyOn(driver as never, 'evaluateInSession' as never)
      .mockResolvedValue(mockResult as never)

    await driver.runMacro(1, 'login', { password: 'secret' })

    const expression = evaluateInSession.mock.calls[0][1] as string
    // macroId JSON literal이 포함되어야 함
    expect(expression).toContain(JSON.stringify('login'))
    // params 직렬화가 포함되어야 함
    expect(expression).toContain('JSON.parse')
  })

  it('Case C: evaluate 반환 객체를 그대로 MacroRunResponse로 전달', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    const mockResult = { status: 'ok', macroId: 'fill-form', stepCount: 5 }
    vi.spyOn(driver as never, 'evaluateInSession' as never)
      .mockResolvedValue(mockResult as never)

    const result = await driver.runMacro(1, 'fill-form', {})
    expect(result).toMatchObject(mockResult)
  })

  it('Case D: U+2028/U+2029 이스케이프 적용 (T-12-05 회귀 방지)', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    const mockResult = { status: 'ok', macroId: 'm', stepCount: 0 }
    const evaluateInSession = vi
      .spyOn(driver as never, 'evaluateInSession' as never)
      .mockResolvedValue(mockResult as never)

    // U+2028 포함 params 전달
    await driver.runMacro(1, 'm', { note: 'line\u2028break' })

    const expression = evaluateInSession.mock.calls[0][1] as string
    // 원시 U+2028이 expression에 없어야 함 (이스케이프됨)
    expect(expression).not.toContain('\u2028')
    expect(expression).toContain('\\u2028')
  })

  it('Case E: target session 없음 → TAB_NOT_FOUND 에러 throw', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue(undefined)

    await expect(driver.runMacro(999, 'login', {})).rejects.toMatchObject({
      code: 'TAB_NOT_FOUND',
    })
  })

  it('Case E-2: sessionId가 없는 target → TAB_NOT_FOUND 에러 throw', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: undefined,
    })

    await expect(driver.runMacro(1, 'login', {})).rejects.toMatchObject({
      code: 'TAB_NOT_FOUND',
    })
  })

  it('Case F: evaluate exceptionDetails → Error throw (기존 evaluateInSession 경로)', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      sessionId: 'session-1',
    })

    // evaluateInSession 내부에서 exceptionDetails → Error throw 시뮬레이션
    vi.spyOn(driver as never, 'evaluateInSession' as never)
      .mockRejectedValue(new Error('ReferenceError: __agrune_runtime__ is not defined') as never)

    await expect(driver.runMacro(1, 'login', {})).rejects.toThrow('ReferenceError')
  })
})
