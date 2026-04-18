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
