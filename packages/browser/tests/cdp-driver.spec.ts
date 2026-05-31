import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  it('swallows background callbacks racing with a closed CDP session', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/devtools/browser/mock' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(driver as never, 'onBindingCalled' as never).mockRejectedValue(
      new Error('Session with given id not found.'),
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

describe('CdpDriver.closeTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws TAB_NOT_FOUND when no tab can be resolved', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()

    await expect(driver.closeTab()).rejects.toMatchObject({
      code: 'TAB_NOT_FOUND',
    })
  })

  it('sends Target.closeTarget and waits until the session is removed', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const sendSpy = vi
      .spyOn((driver as any).connection, 'send')
      .mockImplementation(async () => {
        driver.sessions.closeSession(1)
        return {}
      })

    const result = await driver.closeTab(1)

    expect(sendSpy).toHaveBeenCalledWith('Target.closeTarget', { targetId: 'cdp-target-1' })
    expect(result).toEqual({ tabId: 1, closed: true })
    expect(driver.sessions.getSession(1)).toBeNull()
  })

  it('closes the active session when no explicit tabId is provided', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.openSession(2, 'https://b.com', 'B')
    driver.sessions.setActiveSession(2)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 2,
      targetId: 'cdp-target-2',
      sessionId: 'session-2',
    })
    vi.spyOn((driver as any).connection, 'send').mockImplementation(async () => {
      driver.sessions.closeSession(2)
      return {}
    })

    const result = await driver.closeTab()

    expect(result).toEqual({ tabId: 2, closed: true })
    expect(driver.sessions.getSession(2)).toBeNull()
    expect(driver.sessions.getSession(1)).not.toBeNull()
  })
})

describe('CdpDriver navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('navigateTab sends Page.navigate and returns the settled page metadata', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
      url: 'https://next.test/',
      title: 'Next',
    })
    const sendSpy = vi
      .spyOn((driver as any).connection, 'send')
      .mockResolvedValue({})
    vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue({
      url: 'https://next.test/',
      title: 'Next',
      readyState: 'complete',
    } as never)

    const result = await driver.navigateTab(undefined, 'https://next.test')

    expect(sendSpy).toHaveBeenCalledWith('Page.navigate', { url: 'https://next.test/' }, 'session-1')
    expect(result).toEqual({ tabId: 1, url: 'https://next.test/', title: 'Next' })
  })

  it('navigateTab rejects invalid URLs before sending CDP commands', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    await expect(driver.navigateTab(undefined, 'not a url')).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('navigateBack uses the previous CDP history entry', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://current.test/', 'Current')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
      url: 'https://previous.test/',
      title: 'Previous',
    })
    const sendSpy = vi
      .spyOn((driver as any).connection, 'send')
      .mockImplementation(async (method: string) => {
        if (method === 'Page.getNavigationHistory') {
          return {
            currentIndex: 1,
            entries: [
              { id: 7, url: 'https://previous.test/', title: 'Previous' },
              { id: 8, url: 'https://current.test/', title: 'Current' },
            ],
          }
        }
        return {}
      })
    vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue({
      url: 'https://previous.test/',
      title: 'Previous',
      readyState: 'complete',
    } as never)

    const result = await driver.navigateBack()

    expect(sendSpy).toHaveBeenCalledWith('Page.getNavigationHistory', {}, 'session-1')
    expect(sendSpy).toHaveBeenCalledWith('Page.navigateToHistoryEntry', { entryId: 7 }, 'session-1')
    expect(result).toEqual({ tabId: 1, url: 'https://previous.test/', title: 'Previous' })
  })

  it('navigateBack rejects when there is no previous history entry', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://current.test/', 'Current')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    vi.spyOn((driver as any).connection, 'send').mockResolvedValue({
      currentIndex: 0,
      entries: [{ id: 8, url: 'https://current.test/', title: 'Current' }],
    })

    await expect(driver.navigateBack()).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
  })
})

describe('CdpDriver.resizeTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets device metrics override and returns evaluated viewport size', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})
    vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue({
      width: 900,
      height: 700,
    } as never)

    const result = await driver.resizeTab(undefined, 900, 700)

    expect(sendSpy).toHaveBeenCalledWith(
      'Emulation.setDeviceMetricsOverride',
      {
        width: 900,
        height: 700,
        deviceScaleFactor: 1,
        mobile: false,
      },
      'session-1',
    )
    expect(result).toEqual({ tabId: 1, width: 900, height: 700 })
  })

  it('rejects non-positive dimensions before sending CDP commands', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    await expect(driver.resizeTab(undefined, 0, 700)).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
    expect(sendSpy).not.toHaveBeenCalled()
  })
})

describe('CdpDriver.screenshotTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('captures the active viewport and writes the image file', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-cdp-'))
    try {
      const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
      vi.spyOn(driver, 'connect').mockResolvedValue()
      driver.sessions.openSession(1, 'https://a.com', 'A')
      driver.sessions.setActiveSession(1)

      vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
        tabId: 1,
        targetId: 'cdp-target-1',
        sessionId: 'session-1',
      })
      const image = Buffer.from('fake-png')
      const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({
        data: image.toString('base64'),
      })
      const path = join(tempDir, 'viewport.png')

      const result = await driver.screenshotTab(undefined, path)

      expect(sendSpy).toHaveBeenCalledWith(
        'Page.captureScreenshot',
        { format: 'png', fromSurface: true },
        'session-1',
      )
      expect(await readFile(path)).toEqual(image)
      expect(result).toEqual({ tabId: 1, path, type: 'png', fullPage: false })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('uses full-page layout metrics when fullPage is true', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-cdp-'))
    try {
      const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
      vi.spyOn(driver, 'connect').mockResolvedValue()
      driver.sessions.openSession(1, 'https://a.com', 'A')
      driver.sessions.setActiveSession(1)

      vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
        tabId: 1,
        targetId: 'cdp-target-1',
        sessionId: 'session-1',
      })
      const sendSpy = vi.spyOn((driver as any).connection, 'send').mockImplementation(async (method: string) => {
        if (method === 'Page.getLayoutMetrics') {
          return { cssContentSize: { width: 800.2, height: 1200.1 } }
        }
        return { data: Buffer.from('jpeg').toString('base64') }
      })

      const result = await driver.screenshotTab(undefined, join(tempDir, 'full.jpg'), {
        fullPage: true,
        type: 'jpeg',
      })

      expect(sendSpy).toHaveBeenCalledWith('Page.getLayoutMetrics', {}, 'session-1')
      expect(sendSpy).toHaveBeenCalledWith(
        'Page.captureScreenshot',
        {
          format: 'jpeg',
          fromSurface: true,
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: 801, height: 1201, scale: 1 },
        },
        'session-1',
      )
      expect(result).toMatchObject({ tabId: 1, type: 'jpeg', fullPage: true })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('captures a target clip from snapshot bounds plus page scroll', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-cdp-'))
    try {
      const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
      vi.spyOn(driver, 'connect').mockResolvedValue()
      driver.sessions.openSession(1, 'https://a.com', 'A')
      driver.sessions.setActiveSession(1)
      driver.sessions.updateSnapshot(1, {
        schemaVersion: 3,
        version: 1,
        capturedAt: Date.now(),
        url: 'https://a.com',
        title: 'A',
        groups: [],
        targets: [
          {
            targetId: 'save_button',
            center: { x: 50, y: 70 },
            size: { w: 20, h: 30 },
          },
        ],
      } as any)

      vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
        tabId: 1,
        targetId: 'cdp-target-1',
        sessionId: 'session-1',
      })
      vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue({ x: 10, y: 20 } as never)
      const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({
        data: Buffer.from('png').toString('base64'),
      })

      const result = await driver.screenshotTab(undefined, join(tempDir, 'target.png'), {
        targetId: 'save_button',
      })

      expect(sendSpy).toHaveBeenCalledWith(
        'Page.captureScreenshot',
        {
          format: 'png',
          fromSurface: true,
          clip: { x: 50, y: 75, width: 20, height: 30, scale: 1 },
        },
        'session-1',
      )
      expect(result).toMatchObject({ tabId: 1, type: 'png', fullPage: false, targetId: 'save_button' })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('CdpDriver.evaluateTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('evaluates a page function in the active tab', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(42 as never)

    const result = await driver.evaluateTab(undefined, '() => 42')

    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('() => 42'))
    expect(result).toEqual({ tabId: 1, result: 42 })
  })

  it('evaluates a target function at the snapshot target point', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    driver.sessions.updateSnapshot(1, {
      schemaVersion: 3,
      version: 1,
      capturedAt: Date.now(),
      url: 'https://a.com',
      title: 'A',
      groups: [],
      targets: [
        {
          targetId: 'save_button',
          center: { x: 50, y: 70 },
          size: { w: 20, h: 30 },
        },
      ],
    } as any)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue('Save' as never)

    const result = await driver.evaluateTab(undefined, '(element) => element.textContent', {
      targetId: 'save_button',
    })

    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('document.elementFromPoint'))
    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('"x":50'))
    expect(result).toEqual({ tabId: 1, result: 'Save', targetId: 'save_button' })
  })

  it('preserves undefined results as null plus undefinedResult marker', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(undefined as never)

    const result = await driver.evaluateTab(undefined, '() => undefined')

    expect(result).toEqual({ tabId: 1, result: null, undefinedResult: true })
  })
})

describe('CdpDriver.pressKey', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches printable key events to the active tab', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    const result = await driver.pressKey(undefined, '4')

    expect(sendSpy).toHaveBeenCalledWith(
      'Input.dispatchKeyEvent',
      expect.objectContaining({
        type: 'keyDown',
        key: '4',
        code: 'Digit4',
        text: '4',
        unmodifiedText: '4',
        windowsVirtualKeyCode: 52,
      }),
      'session-1',
    )
    expect(sendSpy).toHaveBeenCalledWith(
      'Input.dispatchKeyEvent',
      expect.objectContaining({
        type: 'keyUp',
        key: '4',
        code: 'Digit4',
      }),
      'session-1',
    )
    expect(result).toEqual({ tabId: 1, key: '4' })
  })

  it('dispatches named key events without text', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    await driver.pressKey(undefined, 'Backspace')

    expect(sendSpy).toHaveBeenCalledWith(
      'Input.dispatchKeyEvent',
      expect.not.objectContaining({
        text: expect.anything(),
      }),
      'session-1',
    )
    expect(sendSpy).toHaveBeenCalledWith(
      'Input.dispatchKeyEvent',
      expect.objectContaining({
        type: 'rawKeyDown',
        key: 'Backspace',
        code: 'Backspace',
        windowsVirtualKeyCode: 8,
      }),
      'session-1',
    )
  })

  it('rejects empty keys before sending CDP commands', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    await expect(driver.pressKey(undefined, '')).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
    expect(sendSpy).not.toHaveBeenCalled()
  })
})

describe('CdpDriver.typeText', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('focuses the snapshot target and inserts text into it', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    driver.sessions.updateSnapshot(1, {
      schemaVersion: 3,
      version: 1,
      capturedAt: Date.now(),
      url: 'https://a.com',
      title: 'A',
      groups: [],
      targets: [
        {
          targetId: 'cc-number',
          center: { x: 50, y: 70 },
        },
      ],
    } as any)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(true as never)
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    const result = await driver.typeText(undefined, 'cc-number', 'Ada')

    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('document.elementFromPoint'))
    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('"x":50'))
    expect(sendSpy).toHaveBeenCalledWith('Input.insertText', { text: 'Ada' }, 'session-1')
    expect(result).toEqual({
      tabId: 1,
      targetId: 'cc-number',
      text: 'Ada',
      submitted: false,
    })
  })

  it('can type slowly and submit with Enter', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    driver.sessions.updateSnapshot(1, {
      schemaVersion: 3,
      version: 1,
      capturedAt: Date.now(),
      url: 'https://a.com',
      title: 'A',
      groups: [],
      targets: [
        {
          targetId: 'name-input',
          center: { x: 10, y: 20 },
        },
      ],
    } as any)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(true as never)
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    const result = await driver.typeText(undefined, 'name-input', 'AB', { slowly: true, submit: true })

    expect(sendSpy).toHaveBeenCalledWith('Input.insertText', { text: 'A' }, 'session-1')
    expect(sendSpy).toHaveBeenCalledWith('Input.insertText', { text: 'B' }, 'session-1')
    expect(sendSpy).toHaveBeenCalledWith(
      'Input.dispatchKeyEvent',
      expect.objectContaining({
        type: 'rawKeyDown',
        key: 'Enter',
        code: 'Enter',
      }),
      'session-1',
    )
    expect(result.submitted).toBe(true)
  })
})

describe('CdpDriver.selectOptions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('selects option values through the snapshot target', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    driver.sessions.updateSnapshot(1, {
      schemaVersion: 3,
      version: 1,
      capturedAt: Date.now(),
      url: 'https://a.com',
      title: 'A',
      groups: [],
      targets: [
        {
          targetId: 'country',
          center: { x: 30, y: 40 },
        },
      ],
    } as any)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(['kr'] as never)

    const result = await driver.selectOptions(undefined, 'country', ['kr'])

    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('document.elementFromPoint'))
    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('HTMLSelectElement'))
    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('"kr"'))
    expect(result).toEqual({ tabId: 1, targetId: 'country', values: ['kr'] })
  })

  it('rejects empty values before evaluating the page', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue([] as never)

    await expect(driver.selectOptions(undefined, 'country', [])).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
    expect(evaluateSpy).not.toHaveBeenCalled()
  })
})

describe('CdpDriver.fillForm', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fills multiple form fields through snapshot targets', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    driver.sessions.updateSnapshot(1, {
      schemaVersion: 3,
      version: 1,
      capturedAt: Date.now(),
      url: 'https://a.com',
      title: 'A',
      groups: [],
      targets: [
        { targetId: 'email', center: { x: 10, y: 20 } },
        { targetId: 'subscribe', center: { x: 30, y: 40 } },
        { targetId: 'country', center: { x: 50, y: 60 } },
      ],
    } as any)

    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(undefined as never)

    const result = await driver.fillForm(undefined, [
      { name: 'Email', targetId: 'email', type: 'textbox', value: 'ada@example.test' },
      { name: 'Subscribe', targetId: 'subscribe', type: 'checkbox', value: true },
      { name: 'Country', targetId: 'country', type: 'combobox', value: 'kr' },
    ])

    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('document.elementFromPoint'))
    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('booleanFillFormValue'))
    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('"targetId":"email"'))
    expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('"x":50'))
    expect(result).toEqual({
      tabId: 1,
      fields: [
        { name: 'Email', targetId: 'email', type: 'textbox' },
        { name: 'Subscribe', targetId: 'subscribe', type: 'checkbox' },
        { name: 'Country', targetId: 'country', type: 'combobox' },
      ],
    })
  })

  it('rejects invalid fields before evaluating the page', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(undefined as never)

    await expect(driver.fillForm(undefined, [])).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
    expect(evaluateSpy).not.toHaveBeenCalled()
  })
})

describe('CdpDriver.fileUpload', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads files to the pending file chooser backend node', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, targetId: 'cdp-target-1', sessionId: 'session-1' },
    ])
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    ;(driver as any).recordFileChooserOpened({
      mode: 'selectMultiple',
      backendNodeId: 77,
    }, 'session-1')

    const result = await driver.fileUpload(undefined, ['/tmp/a.txt', '/tmp/b.txt'])

    expect(sendSpy).toHaveBeenCalledWith(
      'DOM.setFileInputFiles',
      {
        files: ['/tmp/a.txt', '/tmp/b.txt'],
        backendNodeId: 77,
      },
      'session-1',
    )
    expect(result).toMatchObject({
      tabId: 1,
      paths: ['/tmp/a.txt', '/tmp/b.txt'],
      cancelled: false,
      fileChooser: {
        id: 1,
        tabId: 1,
        multiple: true,
        handled: true,
        cancelled: false,
        paths: ['/tmp/a.txt', '/tmp/b.txt'],
      },
    })
  })

  it('cancels a pending file chooser when paths are empty', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, targetId: 'cdp-target-1', sessionId: 'session-1' },
    ])
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    ;(driver as any).recordFileChooserOpened({
      mode: 'selectSingle',
      backendNodeId: 88,
    }, 'session-1')

    const result = await driver.fileUpload(undefined, [])

    expect(sendSpy).toHaveBeenCalledWith(
      'DOM.setFileInputFiles',
      {
        files: [],
        backendNodeId: 88,
      },
      'session-1',
    )
    expect(result.cancelled).toBe(true)
    expect(result.fileChooser.cancelled).toBe(true)
  })
})

describe('CdpDriver.drop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops MIME data and file payloads onto a snapshot target', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-drop-'))
    try {
      const filePath = join(tempDir, 'drop.txt')
      await writeFile(filePath, 'file from drop')

      const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
      vi.spyOn(driver, 'connect').mockResolvedValue()
      vi.spyOn(driver as never, 'refreshSnapshot' as never).mockResolvedValue(undefined as never)
      driver.sessions.openSession(1, 'https://a.com', 'A')
      driver.sessions.setActiveSession(1)
      driver.sessions.updateSnapshot(1, {
        schemaVersion: 3,
        version: 1,
        capturedAt: Date.now(),
        url: 'https://a.com',
        title: 'A',
        groups: [],
        targets: [
          { targetId: 'drop-zone', center: { x: 30, y: 40 } },
        ],
      } as any)

      vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
        tabId: 1,
        targetId: 'cdp-target-1',
        sessionId: 'session-1',
      })
      const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(undefined as never)

      const result = await driver.drop(
        undefined,
        'drop-zone',
        { 'text/plain': 'plain text' },
        [filePath],
      )

      expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('DataTransfer'))
      expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('dragenter'))
      expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('plain text'))
      expect(evaluateSpy).toHaveBeenCalledWith('session-1', expect.stringContaining('drop.txt'))
      expect(result).toEqual({
        tabId: 1,
        targetId: 'drop-zone',
        paths: [filePath],
        dataTypes: ['text/plain'],
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('rejects empty drop payloads before evaluating the page', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    const evaluateSpy = vi.spyOn(driver as never, 'evaluateInSession' as never).mockResolvedValue(undefined as never)

    await expect(driver.drop(undefined, 'drop-zone', {}, [])).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
    expect(evaluateSpy).not.toHaveBeenCalled()
  })
})

describe('CdpDriver.handleDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts a pending prompt dialog through CDP', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    vi.spyOn(driver as never, 'refreshSnapshot' as never).mockResolvedValue(undefined as never)
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, targetId: 'cdp-target-1', sessionId: 'session-1' },
    ])
    const sendSpy = vi.spyOn((driver as any).connection, 'send').mockResolvedValue({})

    ;(driver as any).recordJavascriptDialogOpening({
      type: 'prompt',
      message: 'Name?',
      defaultPrompt: 'Anon',
    }, 'session-1')

    const result = await driver.handleDialog(undefined, { accept: true, promptText: 'Ada' })

    expect(sendSpy).toHaveBeenCalledWith(
      'Page.handleJavaScriptDialog',
      { accept: true, promptText: 'Ada' },
      'session-1',
    )
    expect(result).toMatchObject({
      tabId: 1,
      armed: false,
      dialog: {
        id: 1,
        tabId: 1,
        type: 'prompt',
        message: 'Name?',
        defaultValue: 'Anon',
        handled: true,
        accepted: true,
        promptText: 'Ada',
      },
    })
  })

  it('returns the opened dialog immediately when an action triggers one', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTarget').mockReturnValue({
      tabId: 1,
      targetId: 'cdp-target-1',
      sessionId: 'session-1',
    })
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, targetId: 'cdp-target-1', sessionId: 'session-1' },
    ])
    vi.spyOn(driver as never, 'evaluateInSession' as never).mockImplementation(
      async (_sessionId: string, expression: string) => {
        if (expression.includes('handleCommand')) {
          ;(driver as any).recordJavascriptDialogOpening({
            type: 'confirm',
            message: 'Delete item?',
          }, 'session-1')
          return new Promise(() => {}) as never
        }
        return undefined as never
      },
    )

    const result = await driver.execute(1, {
      kind: 'act',
      targetId: 'confirm-button',
      action: 'click',
    })

    expect(result).toMatchObject({
      ok: true,
      result: {
        actionKind: 'click',
        targetId: 'confirm-button',
        dialog: {
          id: 1,
          tabId: 1,
          type: 'confirm',
          message: 'Delete item?',
          handled: false,
        },
      },
    })
  })

  it('fails when there is no pending dialog', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    vi.spyOn(driver, 'connect').mockResolvedValue()
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)

    await expect(driver.handleDialog(undefined, { accept: false })).rejects.toMatchObject({
      code: 'DIALOG_NOT_FOUND',
    })
  })
})

describe('CdpDriver.consoleMessages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records console API calls and filters by severity', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])

    ;(driver as any).handleConsoleAPICalled({
      type: 'log',
      args: [{ value: 'hello' }],
      timestamp: 10,
      stackTrace: { callFrames: [{ url: 'https://a.com', lineNumber: 1, columnNumber: 2 }] },
    }, 'session-1')
    ;(driver as any).handleConsoleAPICalled({
      type: 'warning',
      args: [{ value: 'warned' }],
      timestamp: 11,
      stackTrace: { callFrames: [{ url: 'https://a.com', lineNumber: 3, columnNumber: 4 }] },
    }, 'session-1')

    expect(driver.consoleMessages(undefined, { level: 'warning' })).toEqual([
      expect.objectContaining({
        level: 'warning',
        type: 'warning',
        text: 'warned',
        location: { url: 'https://a.com', lineNumber: 3, columnNumber: 4 },
      }),
    ])
  })

  it('records page exceptions as error console messages', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])

    ;(driver as any).handleExceptionThrown({
      exceptionDetails: {
        text: 'Uncaught',
        lineNumber: 5,
        columnNumber: 6,
        exception: { description: 'Error: boom' },
      },
    }, 'session-1')

    expect(driver.consoleMessages(undefined, { level: 'error' })).toEqual([
      expect.objectContaining({
        level: 'error',
        type: 'pageerror',
        text: 'Error: boom',
        location: { url: 'https://a.com', lineNumber: 5, columnNumber: 6 },
      }),
    ])
  })

  it('filters out prior-navigation messages unless all is true', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])

    ;(driver as any).handleConsoleAPICalled({ type: 'log', args: [{ value: 'old' }] }, 'session-1')
    ;(driver as any).handleFrameNavigated({ frame: { id: 'main', url: 'https://b.com' } }, 'session-1')
    ;(driver as any).handleConsoleAPICalled({ type: 'log', args: [{ value: 'new' }] }, 'session-1')

    expect(driver.consoleMessages(undefined).map(message => message.text)).toEqual(['new'])
    expect(driver.consoleMessages(undefined, { all: true }).map(message => message.text)).toEqual(['old', 'new'])
  })
})

describe('CdpDriver.networkRequests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records network requests and filters successful static resources by default', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])

    ;(driver as any).handleNetworkRequestWillBeSent({
      requestId: '1',
      type: 'Fetch',
      request: { method: 'POST', url: 'https://a.com/api/data', headers: { 'x-test': '1' }, postData: '{"ok":true}' },
    }, 'session-1')
    ;(driver as any).handleNetworkResponseReceived({
      requestId: '1',
      response: { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' } },
    }, 'session-1')
    ;(driver as any).handleNetworkRequestWillBeSent({
      requestId: '2',
      type: 'Script',
      request: { method: 'GET', url: 'https://a.com/static/app.js', headers: {} },
    }, 'session-1')
    ;(driver as any).handleNetworkResponseReceived({
      requestId: '2',
      response: { status: 200, statusText: 'OK', headers: {} },
    }, 'session-1')

    expect(driver.networkRequests(undefined).map(request => request.url)).toEqual(['https://a.com/api/data'])
    expect(driver.networkRequests(undefined, { includeStatic: true }).map(request => request.url)).toEqual([
      'https://a.com/api/data',
      'https://a.com/static/app.js',
    ])
  })

  it('returns request detail and response body parts', async () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])
    vi.spyOn((driver as any).connection, 'send').mockResolvedValue({ body: '{"ok":true}', base64Encoded: false })

    ;(driver as any).handleNetworkRequestWillBeSent({
      requestId: '1',
      type: 'Fetch',
      request: { method: 'POST', url: 'https://a.com/api/data', headers: { 'x-test': '1' }, postData: '{"hello":"world"}' },
    }, 'session-1')
    ;(driver as any).handleNetworkResponseReceived({
      requestId: '1',
      response: { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' } },
    }, 'session-1')

    await expect(driver.networkRequestDetail(undefined, 1, 'request-headers')).resolves.toMatchObject({
      part: 'request-headers',
      value: { 'x-test': '1' },
    })
    await expect(driver.networkRequestDetail(undefined, 1, 'response-body')).resolves.toMatchObject({
      part: 'response-body',
      value: '{"ok":true}',
    })
    await expect(driver.networkRequestDetail(undefined, 1)).resolves.toMatchObject({
      request: { index: 1, status: 200 },
      requestBody: '{"hello":"world"}',
      responseBody: '{"ok":true}',
    })
  })

  it('filters prior-navigation requests unless all is true', () => {
    const driver = new CdpDriver({ mode: 'attach', wsEndpoint: 'ws://example.test/mock' })
    driver.sessions.openSession(1, 'https://a.com', 'A')
    driver.sessions.setActiveSession(1)
    vi.spyOn((driver as any).targetManager, 'getTargets').mockReturnValue([
      { tabId: 1, sessionId: 'session-1' },
    ])

    ;(driver as any).handleNetworkRequestWillBeSent({
      requestId: '1',
      type: 'Fetch',
      request: { method: 'GET', url: 'https://a.com/api/old', headers: {} },
    }, 'session-1')
    ;(driver as any).handleFrameNavigated({ frame: { id: 'main', url: 'https://b.com' } }, 'session-1')
    ;(driver as any).handleNetworkRequestWillBeSent({
      requestId: '2',
      type: 'Fetch',
      request: { method: 'GET', url: 'https://a.com/api/new', headers: {} },
    }, 'session-1')

    expect(driver.networkRequests(undefined).map(request => request.url)).toEqual(['https://a.com/api/new'])
    expect(driver.networkRequests(undefined, { all: true }).map(request => request.url)).toEqual([
      'https://a.com/api/old',
      'https://a.com/api/new',
    ])
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
