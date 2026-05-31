import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import type {
  AgruneManifest,
  AgruneRuntimeConfig,
  BrowserDriver,
  CloseTabResult,
  CommandResult,
  ConsoleLevel,
  ConsoleMessageEntry,
  ConsoleMessagesQuery,
  DialogHandleOptions,
  DialogHandleResult,
  DialogInfo,
  DropData,
  DropResult,
  EvaluateResult,
  FileChooserInfo,
  FileUploadResult,
  FillFormField,
  FillFormResult,
  FocusResult,
  MacroRunResponse,
  NavigationResult,
  NetworkRequestDetail,
  NetworkRequestPart,
  NetworkRequestSummary,
  NetworkRequestsQuery,
  OpenTabResult,
  PageSnapshot,
  PressKeyResult,
  ResizeResult,
  RunCodeUnsafeResult,
  ScreenshotImageType,
  ScreenshotResult,
  SelectOptionResult,
  Session,
  TypeTextOptions,
  TypeTextResult,
} from '@agrune/core'
import { createCommandError } from '@agrune/core'
import { ActivityBlockStack } from './activity-tracker.js'
import { SessionManager } from './session-manager.js'
import { ChromeLauncher } from './chrome-launcher.js'
import { CdpConnection, type CdpEventCallback } from './cdp-connection.js'
import { CdpTargetManager, type TargetInfo } from './cdp-target-manager.js'
import {
  CdpRuntimeInjector,
  QUICK_MODE_RUNTIME_KEY,
} from './cdp-runtime-injector.js'
import {
  RecoverySupervisor,
  type RecoveryEvent,
  type RecoveryStrategy,
} from './recovery-supervisor.js'

const ENSURE_READY_TIMEOUT_MS = 10_000
const ACTIVITY_TAIL_BLOCK_MS = 5_000
const OPEN_TAB_READY_TIMEOUT_MS = 10_000
const CLOSE_TAB_TIMEOUT_MS = 5_000
const NAVIGATION_TIMEOUT_MS = 10_000
const FILE_CHOOSER_WAIT_TIMEOUT_MS = 2_000
const CDP_ALT_MODIFIER = 1
const CDP_CONTROL_MODIFIER = 2
const CDP_META_MODIFIER = 4
const CDP_SHIFT_MODIFIER = 8

interface SelectorBounds {
  x: number
  y: number
  width: number
  height: number
}

type SelectorProbeResult =
  | { status: 'ok'; count: 1 }
  | { status: 'not-found'; count: 0 }
  | { status: 'not-unique'; count: number }
  | { status: 'invalid'; message: string }

type SelectorBoundsProbeResult =
  | { status: 'ok'; count: 1; bounds: SelectorBounds }
  | { status: 'not-found'; count: 0 }
  | { status: 'not-unique'; count: number }
  | { status: 'invalid'; message: string }

const SPECIAL_KEY_INFO: Record<string, Omit<KeyboardKeyInfo, 'modifiers'>> = {
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
  Return: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
  Shift: { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 },
  Control: { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 },
  Ctrl: { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 },
  Alt: { key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 },
  Meta: { key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Esc: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Space: { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 },
  ' ': { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  Left: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  Up: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  Right: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  Down: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  Insert: { key: 'Insert', code: 'Insert', windowsVirtualKeyCode: 45 },
  Delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
  Home: { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 },
  End: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', windowsVirtualKeyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
}

export interface CdpDriverOptions {
  mode: 'launch' | 'attach'
  wsEndpoint?: string
  headless?: boolean
  userDataDir?: string
  chromePath?: string
  chromeArgs?: string[]
  startUrl?: string
}

interface RuntimeBridgeMessage {
  type: string
  data?: unknown
}

interface NetworkRequestRecord {
  index: number
  requestId: string
  sessionId: string
  tabId: number
  method: string
  url: string
  resourceType: string
  isNavigationRequest: boolean
  timestamp: number
  navigationIndex: number
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseHeaders: Record<string, string>
  responseBody?: string | null
  status?: number
  statusText?: string
  failureText?: string
}

interface FileChooserRecord extends FileChooserInfo {
  sessionId: string
  backendNodeId?: number
  mode: 'selectSingle' | 'selectMultiple'
}

interface DialogRecord extends DialogInfo {
  sessionId: string
  actionPromise?: Promise<CommandResult>
}

interface DropFilePayload {
  name: string
  type: string
  base64: string
}

type PlaywrightBrowser = import('playwright').Browser
type PlaywrightPage = import('playwright').Page

type DialogWaiter = {
  tabId: number
  afterId: number
  resolve(dialog: DialogRecord): void
}

interface KeyboardKeyInfo {
  key: string
  code: string
  modifiers: number
  text?: string
  windowsVirtualKeyCode?: number
}

export class CdpDriver implements BrowserDriver {
  readonly sessions = new SessionManager()
  onActivity: (() => void) | null = null

  private readonly connection = new CdpConnection()
  private readonly targetManager = new CdpTargetManager()
  private readonly activityBlocks: ActivityBlockStack
  private readonly options: CdpDriverOptions
  private readonly launcher = new ChromeLauncher()
  private readonly preparedSessions = new Set<string>()
  private readonly desiredConfig: Partial<AgruneRuntimeConfig> = {}
  private readonly sessionOpenCbs: Array<(session: Session) => void> = []
  private readonly sessionCloseCbs: Array<(tabId: number) => void> = []
  private readonly snapshotUpdateCbs: Array<(tabId: number, snapshot: PageSnapshot) => void> = []
  private readonly consoleMessagesByTab = new Map<number, ConsoleMessageEntry[]>()
  private readonly navigationIndexByTab = new Map<number, number>()
  private readonly networkRequestsByTab = new Map<number, NetworkRequestRecord[]>()
  private readonly networkByRequestId = new Map<string, NetworkRequestRecord>()
  private readonly dialogs: DialogRecord[] = []
  private readonly dialogWaiters: DialogWaiter[] = []
  private nextDialogId = 1
  private readonly fileChoosers: FileChooserRecord[] = []
  private nextFileChooserId = 1
  private connectPromise: Promise<void> | null = null
  private commandCounter = 0
  private bindingsRegistered = false
  private readonly handleBindingCalled: CdpEventCallback
  private readonly handleDragIntercepted: CdpEventCallback
  private readonly handleConsoleAPICalled: CdpEventCallback
  private readonly handleExceptionThrown: CdpEventCallback
  private readonly handleFrameNavigated: CdpEventCallback
  private readonly handleNetworkRequestWillBeSent: CdpEventCallback
  private readonly handleNetworkRequestWillBeSentExtraInfo: CdpEventCallback
  private readonly handleNetworkResponseReceived: CdpEventCallback
  private readonly handleNetworkResponseReceivedExtraInfo: CdpEventCallback
  private readonly handleNetworkLoadingFailed: CdpEventCallback
  private readonly handleJavascriptDialogOpening: CdpEventCallback
  private readonly handleJavascriptDialogClosed: CdpEventCallback
  private readonly handleFileChooserOpened: CdpEventCallback
  private recovery: RecoverySupervisor | null = null
  private resolvedWsEndpoint: string | null = null
  private unsubscribeDisconnect: (() => void) | null = null
  private unsubscribeExit: (() => void) | null = null
  private readonly recoveryListeners: Array<(event: RecoveryEvent) => void> = []
  private recoveredFlag = false

  constructor(options: CdpDriverOptions) {
    this.options = options
    this.activityBlocks = new ActivityBlockStack((active) => {
      for (const target of this.targetManager.getTargets()) {
        if (!target.sessionId) continue
        this.runBackgroundTask(this.setAgentActivity(target.sessionId, active))
      }
    })

    this.handleBindingCalled = (params, sessionId) => {
      void this.runBackgroundTask(this.onBindingCalled(params, sessionId))
    }
    this.handleDragIntercepted = (params, sessionId) => {
      void this.runBackgroundTask(this.onDragIntercepted(params, sessionId))
    }
    this.handleConsoleAPICalled = (params, sessionId) => {
      this.recordConsoleMessage(params, sessionId)
    }
    this.handleExceptionThrown = (params, sessionId) => {
      this.recordExceptionThrown(params, sessionId)
    }
    this.handleFrameNavigated = (params, sessionId) => {
      this.recordFrameNavigated(params, sessionId)
    }
    this.handleNetworkRequestWillBeSent = (params, sessionId) => {
      this.recordNetworkRequestWillBeSent(params, sessionId)
    }
    this.handleNetworkRequestWillBeSentExtraInfo = (params, sessionId) => {
      this.recordNetworkRequestExtraInfo(params, sessionId)
    }
    this.handleNetworkResponseReceived = (params, sessionId) => {
      this.recordNetworkResponseReceived(params, sessionId)
    }
    this.handleNetworkResponseReceivedExtraInfo = (params, sessionId) => {
      this.recordNetworkResponseExtraInfo(params, sessionId)
    }
    this.handleNetworkLoadingFailed = (params, sessionId) => {
      this.recordNetworkLoadingFailed(params, sessionId)
    }
    this.handleJavascriptDialogOpening = (params, sessionId) => {
      this.recordJavascriptDialogOpening(params, sessionId)
    }
    this.handleJavascriptDialogClosed = (params, sessionId) => {
      this.recordJavascriptDialogClosed(params, sessionId)
    }
    this.handleFileChooserOpened = (params, sessionId) => {
      this.recordFileChooserOpened(params, sessionId)
    }

    this.targetManager.onTargetCreated((target) => {
      this.sessions.openSession(target.tabId, target.url, target.title)
      this.ensureConsoleState(target.tabId)
      this.ensureNetworkState(target.tabId)
      this.sessionOpenCbs.forEach(cb => cb(this.toSession(target.tabId)))
      this.runBackgroundTask(this.prepareTarget(target))
    })

    this.targetManager.onTargetInfoChanged((target) => {
      this.sessions.openSession(target.tabId, target.url, target.title)
      this.ensureConsoleState(target.tabId)
      this.ensureNetworkState(target.tabId)
      this.runBackgroundTask(this.prepareTarget(target))
    })

    this.targetManager.onTargetDestroyed((target) => {
      this.sessions.closeSession(target.tabId)
      this.consoleMessagesByTab.delete(target.tabId)
      this.navigationIndexByTab.delete(target.tabId)
      const records = this.networkRequestsByTab.get(target.tabId) ?? []
      for (const record of records) this.networkByRequestId.delete(networkRequestKey(record.sessionId, record.requestId))
      this.networkRequestsByTab.delete(target.tabId)
      removeDialogsForTab(this.dialogs, target.tabId)
      removeFileChoosersForTab(this.fileChoosers, target.tabId)
      this.sessionCloseCbs.forEach(cb => cb(target.tabId))
    })
  }

  async connect(): Promise<void> {
    if (this.connection.isConnected()) return
    if (this.connectPromise) {
      await this.connectPromise
      return
    }

    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null
    })
    await this.connectPromise
  }

  async disconnect(): Promise<void> {
    this.unsubscribeDisconnect?.()
    this.unsubscribeDisconnect = null
    this.unsubscribeExit?.()
    this.unsubscribeExit = null
    this.targetManager.stop()
    this.preparedSessions.clear()
    this.unregisterBindings()
    this.sessions.clear()
    this.dialogs.splice(0, this.dialogs.length)
    this.dialogWaiters.splice(0, this.dialogWaiters.length)
    this.nextDialogId = 1
    this.fileChoosers.splice(0, this.fileChoosers.length)
    this.nextFileChooserId = 1
    await this.connection.disconnect()
    if (this.options.mode === 'launch') {
      await this.launcher.kill()
    }
  }

  isConnected(): boolean {
    return this.connection.isConnected()
  }

  listSessions(): Session[] {
    const activeId = this.sessions.getActiveSessionId()
    return this.sessions.getSessions().map(session => ({
      tabId: session.tabId,
      url: session.url,
      title: session.title,
      hasSnapshot: session.snapshot !== null,
      snapshotVersion: session.snapshot?.version ?? null,
      active: session.tabId === activeId,
      lastInteractionAt: session.lastInteractionAt ?? null,
    }))
  }

  getSnapshot(tabId: number): PageSnapshot | null {
    return this.sessions.getSnapshot(tabId)
  }

  consoleMessages(tabId: number | undefined, query: ConsoleMessagesQuery = {}): ConsoleMessageEntry[] {
    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) return []
    const currentNavigationIndex = this.navigationIndexByTab.get(resolvedTabId) ?? 0
    const minSeverity = severityForConsoleLevel(query.level ?? 'info')
    return (this.consoleMessagesByTab.get(resolvedTabId) ?? []).filter(message => {
      if (!query.all && message.navigationIndex !== currentNavigationIndex) return false
      return severityForConsoleLevel(message.level) >= minSeverity
    })
  }

  networkRequests(tabId: number | undefined, query: NetworkRequestsQuery = {}): NetworkRequestSummary[] {
    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) return []
    const currentNavigationIndex = this.navigationIndexByTab.get(resolvedTabId) ?? 0
    return (this.networkRequestsByTab.get(resolvedTabId) ?? [])
      .filter(record => networkRequestMatches(record, query, currentNavigationIndex))
      .map(toNetworkRequestSummary)
  }

  async networkRequestDetail(
    tabId: number | undefined,
    index: number,
    part?: NetworkRequestPart,
  ): Promise<NetworkRequestDetail> {
    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available for network request lookup.')
    }
    const record = (this.networkRequestsByTab.get(resolvedTabId) ?? []).find(request => request.index === index)
    if (!record) {
      throw createCommandError('NETWORK_REQUEST_NOT_FOUND', `Network request not found: ${index}`, { index })
    }
    const summary = toNetworkRequestSummary(record)
    if (part) {
      return {
        request: summary,
        part,
        value: await this.networkRequestPartValue(record, part),
      }
    }
    return {
      request: summary,
      requestHeaders: record.requestHeaders,
      requestBody: record.requestBody,
      responseHeaders: record.responseHeaders,
      responseBody: await this.networkResponseBody(record),
    }
  }

  onSessionOpen(cb: (session: Session) => void): void {
    this.sessionOpenCbs.push(cb)
  }

  onSessionClose(cb: (tabId: number) => void): void {
    this.sessionCloseCbs.push(cb)
  }

  onSnapshotUpdate(cb: (tabId: number, snapshot: PageSnapshot) => void): void {
    this.snapshotUpdateCbs.push(cb)
  }

  onRecoveryEvent(cb: (event: RecoveryEvent) => void): void {
    this.recoveryListeners.push(cb)
  }

  isRecovering(): boolean {
    return this.recovery?.isRecovering() ?? false
  }

  getLastRecoveryFailure(): ReturnType<RecoverySupervisor['getLastFailure']> {
    return this.recovery?.getLastFailure() ?? null
  }

  async execute(
    tabId: number,
    command: Record<string, unknown> & { kind: string },
  ): Promise<CommandResult> {
    return this.withActivityBlocks(command.kind, async () => {
      const target = this.targetManager.getTarget(tabId)
      const commandId =
        typeof command.commandId === 'string'
          ? command.commandId
          : `cmd-${++this.commandCounter}-${Date.now()}`

      if (!target?.sessionId) {
        return {
          commandId,
          ok: false,
          error: createCommandError(
            'SESSION_NOT_ACTIVE',
            `No active CDP session is attached for tab ${tabId}.`,
          ),
        }
      }

      const payload = {
        ...command,
        commandId,
      }

      try {
        if (this.recovery?.isRecovering()) {
          await this.recovery.waitForRecovery()
        }
        await this.setAgentActivity(target.sessionId, true)
        const dialogAfterId = this.dialogs.length
        const dialogWaiter = this.waitForNextDialog(tabId, dialogAfterId)
        const actionPromise = this.evaluateInSession<CommandResult>(
          target.sessionId,
          `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}].handleCommand(${JSON.stringify(command.kind)}, ${JSON.stringify(payload)})`,
        )
        const winner = await Promise.race([
          actionPromise.then(result => ({ kind: 'result' as const, result })),
          dialogWaiter.promise.then(dialog => ({ kind: 'dialog' as const, dialog })),
        ])
        dialogWaiter.cancel()

        if (winner.kind === 'dialog') {
          winner.dialog.actionPromise = actionPromise.catch(error => ({
            commandId,
            ok: false,
            error: createCommandError(
              'INVALID_COMMAND',
              error instanceof Error ? error.message : String(error),
            ),
          }))
          this.sessions.touchSession(tabId)
          return {
            commandId,
            ok: true,
            result: {
              actionKind: command.action ?? command.kind,
              ...(typeof command.targetId === 'string' ? { targetId: command.targetId } : {}),
              dialog: toPublicDialog(winner.dialog),
            },
          }
        }

        const result = winner.result
        if (result.ok) {
          this.sessions.touchSession(tabId)
        }
        if (this.recoveredFlag) {
          if (result.ok) {
            this.recoveredFlag = false
            const merged = { ...(result.result ?? {}), recovered: true }
            return { ...result, result: merged }
          }
          // leave recoveredFlag set so the next successful call can surface it
        }
        return result
      } catch (error) {
        const failure = this.recovery?.getLastFailure() ?? null
        if (failure) {
          const code = failure.cause === 'chrome_crashed' ? 'CHROME_CRASHED' : 'RECOVERY_FAILED'
          return {
            commandId,
            ok: false,
            error: createCommandError(
              code,
              `Automatic recovery failed after ${failure.attempts} attempts: ${failure.error.message}`,
              {
                cause: failure.cause,
                attempts: failure.attempts,
                guidance:
                  this.options.mode === 'launch'
                    ? 'Close the quick-mode browser window and rerun the command to start a fresh session.'
                    : 'Restart the attached Chrome instance or verify the wsEndpoint, then retry.',
              },
            ),
          }
        }
        if (this.recovery?.isRecovering()) {
          return {
            commandId,
            ok: false,
            error: createCommandError(
              'CONNECTION_LOST',
              error instanceof Error ? error.message : String(error),
              { guidance: 'Automatic recovery is in progress. Retry shortly.' },
            ),
          }
        }
        return {
          commandId,
          ok: false,
          error: createCommandError(
            'INVALID_COMMAND',
            error instanceof Error ? error.message : String(error),
          ),
        }
      }
    })
  }

  updateConfig(config: Partial<AgruneRuntimeConfig>): void {
    Object.assign(this.desiredConfig, config)

    for (const target of this.targetManager.getTargets()) {
      if (!target.sessionId) continue
      void this.evaluateInSession(
        target.sessionId,
        `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.applyConfig(${JSON.stringify(config)})`,
      ).catch(() => {})
    }
  }

  async ensureReady(): Promise<string | null> {
    await this.connect()
    if (this.sessions.hasReadySession()) return null

    const ready = await this.sessions.waitForSnapshot(ENSURE_READY_TIMEOUT_MS)
    if (ready) return null

    if (this.sessions.getSessions().length === 0) {
      return 'No browser pages are attached in CDP quick mode.'
    }

    return 'No browser sessions available. Open a page with agrune annotations in the quick mode browser.'
  }

  resolveTabId(tabId?: number): number | null {
    if (typeof tabId === 'number') return tabId

    const activeId = this.sessions.getActiveSessionId()
    if (activeId !== null && this.sessions.getSession(activeId) !== null) {
      return activeId
    }

    const sessions = this.sessions.getSessions()
    const ready = sessions.find(session => session.snapshot !== null)
    return ready?.tabId ?? sessions[0]?.tabId ?? null
  }

  async focusSession(tabId: number): Promise<FocusResult> {
    const session = this.sessions.getSession(tabId)
    if (!session) {
      throw createCommandError(
        'TAB_NOT_FOUND',
        `No session exists for tabId ${tabId}.`,
        { tabId },
      )
    }

    const wasActive = this.sessions.getActiveSessionId() === tabId
    this.sessions.setActiveSession(tabId)

    let cdpFocusError: string | undefined
    const target = this.targetManager.getTarget(tabId)
    if (target) {
      try {
        await this.connection.send('Target.activateTarget', { targetId: target.targetId })
      } catch (error) {
        cdpFocusError = error instanceof Error ? error.message : String(error)
      }
      if (target.sessionId) {
        try {
          await this.connection.send('Page.bringToFront', {}, target.sessionId)
        } catch (error) {
          if (!cdpFocusError) {
            cdpFocusError = error instanceof Error ? error.message : String(error)
          }
        }
      }
    }

    return {
      tabId,
      wasActive,
      becameActive: true,
      ...(cdpFocusError ? { cdpFocusError } : {}),
    }
  }

  async openTab(url: string): Promise<OpenTabResult> {
    await this.connect()

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw createCommandError('INVALID_COMMAND', `Invalid URL for new tab: ${url}`, { url })
    }

    const response = await this.connection.send('Target.createTarget', { url: parsed.toString() })
    const targetId = typeof response.targetId === 'string' ? response.targetId : null
    if (!targetId) {
      throw createCommandError('INVALID_COMMAND', 'CDP Target.createTarget did not return a targetId.', {
        response,
      })
    }

    const target = await this.waitForTarget(targetId, 5_000)
    if (!target) {
      throw createCommandError('SESSION_NOT_ACTIVE', 'New tab was created but no attached session became available.', {
        targetId,
        url: parsed.toString(),
      })
    }

    await this.focusSession(target.tabId).catch(() => undefined)
    await this.refreshSnapshot(target.tabId).catch(() => undefined)
    await this.sessions.waitForSessionSnapshot(target.tabId, OPEN_TAB_READY_TIMEOUT_MS)

    const session = this.sessions.getSession(target.tabId)
    return {
      tabId: target.tabId,
      url: session?.url ?? target.url,
      title: session?.title ?? target.title,
    }
  }

  async closeTab(tabId?: number): Promise<CloseTabResult> {
    await this.connect()

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available to close.')
    }

    const session = this.sessions.getSession(resolvedTabId)
    if (!session) {
      throw createCommandError(
        'TAB_NOT_FOUND',
        `No session exists for tabId ${resolvedTabId}.`,
        { tabId: resolvedTabId },
      )
    }

    const target = this.targetManager.getTarget(resolvedTabId)
    if (!target) {
      throw createCommandError(
        'TAB_NOT_FOUND',
        `No browser target exists for tabId ${resolvedTabId}.`,
        { tabId: resolvedTabId },
      )
    }

    await this.connection.send('Target.closeTarget', { targetId: target.targetId })
    const closed = await this.waitForSessionClosed(resolvedTabId, CLOSE_TAB_TIMEOUT_MS)
    if (!closed) {
      throw createCommandError(
        'INVALID_COMMAND',
        `Timed out waiting for tabId ${resolvedTabId} to close.`,
        { tabId: resolvedTabId },
      )
    }

    return { tabId: resolvedTabId, closed: true }
  }

  async navigateTab(tabId: number | undefined, url: string): Promise<NavigationResult> {
    await this.connect()

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available to navigate.')
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw createCommandError('INVALID_COMMAND', `Invalid URL for navigation: ${url}`, { url })
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    const nextUrl = parsed.toString()
    const response = await this.connection.send('Page.navigate', { url: nextUrl }, target.sessionId)
    if (typeof response.errorText === 'string' && response.errorText.length > 0) {
      throw createCommandError('INVALID_COMMAND', response.errorText, { url: nextUrl })
    }

    this.sessions.openSession(resolvedTabId, nextUrl, this.sessions.getSession(resolvedTabId)?.title ?? target.title)
    await this.waitForNavigationSettled(resolvedTabId, nextUrl, NAVIGATION_TIMEOUT_MS)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return this.navigationResult(resolvedTabId, nextUrl)
  }

  async navigateBack(tabId?: number): Promise<NavigationResult> {
    await this.connect()

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available to navigate back.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    const history = await this.connection.send('Page.getNavigationHistory', {}, target.sessionId)
    const currentIndex = typeof history.currentIndex === 'number' ? history.currentIndex : -1
    const entries = Array.isArray(history.entries) ? history.entries as Array<Record<string, unknown>> : []
    const previous = currentIndex > 0 ? entries[currentIndex - 1] : null
    const entryId = typeof previous?.id === 'number' ? previous.id : null
    const previousUrl = typeof previous?.url === 'string' ? previous.url : null

    if (entryId == null || !previousUrl) {
      throw createCommandError('INVALID_COMMAND', 'No previous browser history entry is available.')
    }
    const previousTitle = typeof previous?.title === 'string' ? previous.title : ''

    await this.connection.send('Page.navigateToHistoryEntry', { entryId }, target.sessionId)
    this.sessions.openSession(resolvedTabId, previousUrl, previousTitle)
    await this.waitForNavigationSettled(resolvedTabId, previousUrl, NAVIGATION_TIMEOUT_MS)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return this.navigationResult(resolvedTabId, previousUrl)
  }

  async resizeTab(tabId: number | undefined, width: number, height: number): Promise<ResizeResult> {
    await this.connect()

    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw createCommandError('INVALID_COMMAND', 'resize requires positive integer width and height.', {
        width,
        height,
      })
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available to resize.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    await this.connection.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      },
      target.sessionId,
    )

    const actual = await this.evaluateInSession<{ width: number; height: number }>(
      target.sessionId,
      `(() => ({ width: window.innerWidth, height: window.innerHeight }))()`,
    ).catch(() => ({ width, height }))

    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return {
      tabId: resolvedTabId,
      width: Number.isFinite(actual.width) ? actual.width : width,
      height: Number.isFinite(actual.height) ? actual.height : height,
    }
  }

  async screenshotTab(
    tabId: number | undefined,
    path: string,
    options: { fullPage?: boolean; targetId?: string; type?: ScreenshotImageType } = {},
  ): Promise<ScreenshotResult> {
    await this.connect()

    if (typeof path !== 'string' || path.trim().length === 0) {
      throw createCommandError('INVALID_COMMAND', 'screenshot requires a non-empty path.')
    }
    if (options.targetId && options.fullPage) {
      throw createCommandError('INVALID_COMMAND', 'Element screenshots cannot use fullPage.')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available to screenshot.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    const type = options.type ?? screenshotTypeFromPath(path) ?? 'png'
    const params: Record<string, unknown> = {
      format: type,
      fromSurface: true,
    }

    if (options.fullPage) {
      params.captureBeyondViewport = true
      params.clip = await this.fullPageScreenshotClip(target.sessionId)
    } else if (options.targetId) {
      params.clip = await this.targetScreenshotClip(resolvedTabId, target.sessionId, options.targetId)
    }

    const response = await this.connection.send('Page.captureScreenshot', params, target.sessionId)
    if (typeof response.data !== 'string' || response.data.length === 0) {
      throw createCommandError('INVALID_COMMAND', 'CDP Page.captureScreenshot did not return image data.')
    }

    const absolutePath = resolve(path)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, Buffer.from(response.data, 'base64'))

    return {
      tabId: resolvedTabId,
      path: absolutePath,
      type,
      fullPage: options.fullPage === true,
      ...(options.targetId ? { targetId: options.targetId } : {}),
    }
  }

  async evaluateTab(
    tabId: number | undefined,
    source: string,
    options: { arg?: unknown; targetId?: string } = {},
  ): Promise<EvaluateResult> {
    await this.connect()

    if (typeof source !== 'string' || source.trim().length === 0) {
      throw createCommandError('INVALID_COMMAND', 'evaluate requires a non-empty function.')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available to evaluate.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    const result = options.targetId
      ? await this.evaluateInSession<unknown>(
          target.sessionId,
          await this.targetEvaluationExpression(resolvedTabId, target.sessionId, options.targetId, source, options.arg),
        )
      : await this.evaluateInSession<unknown>(
          target.sessionId,
          buildPageEvaluationExpression(source, options.arg),
        )

    this.sessions.touchSession(resolvedTabId)
    return {
      tabId: resolvedTabId,
      result: result === undefined ? null : result,
      ...(result === undefined ? { undefinedResult: true as const } : {}),
      ...(options.targetId ? { targetId: options.targetId } : {}),
    }
  }

  async runCodeUnsafe(tabId: number | undefined, source: string): Promise<RunCodeUnsafeResult> {
    await this.connect()

    if (typeof source !== 'string' || source.trim().length === 0) {
      throw createCommandError('INVALID_COMMAND', 'browser_run_code_unsafe requires non-empty code.')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available to run code.')
    }

    this.requireAttachedTarget(resolvedTabId)
    if (!this.resolvedWsEndpoint) {
      throw createCommandError('INVALID_COMMAND', 'CDP endpoint is not available for Playwright connection.')
    }

    const { chromium } = await import('playwright')
    const browser = await chromium.connectOverCDP(this.resolvedWsEndpoint)
    try {
      const page = await this.playwrightPageForTab(browser, resolvedTabId)
      await page.bringToFront().catch(() => undefined)
      const fn = compileRunCodeUnsafeFunction(source)
      const result = await fn(page)

      this.sessions.touchSession(resolvedTabId)
      return {
        tabId: resolvedTabId,
        result: result === undefined ? null : toJsonCompatible(result),
        ...(result === undefined ? { undefinedResult: true as const } : {}),
      }
    } finally {
      await browser.close().catch(() => undefined)
    }
  }

  async pressKey(tabId: number | undefined, key: string): Promise<PressKeyResult> {
    await this.connect()

    if (typeof key !== 'string' || key.length === 0) {
      throw createCommandError('INVALID_COMMAND', 'pressKey requires a non-empty key.')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available for key press.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    await this.dispatchKeyboardKey(target.sessionId, key)

    this.sessions.touchSession(resolvedTabId)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return { tabId: resolvedTabId, key }
  }

  async typeText(
    tabId: number | undefined,
    targetId: string,
    text: string,
    options: TypeTextOptions = {},
  ): Promise<TypeTextResult> {
    await this.connect()

    if (typeof targetId !== 'string' || targetId.length === 0) {
      throw createCommandError('INVALID_TARGET', 'typeText requires a targetId.')
    }
    if (typeof text !== 'string') {
      throw createCommandError('INVALID_COMMAND', 'typeText requires text (string).')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available for typing.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    await this.focusTargetForTextInput(resolvedTabId, target.sessionId, targetId)

    if (options.slowly === true) {
      for (const ch of Array.from(text)) {
        await this.connection.send('Input.insertText', { text: ch }, target.sessionId)
      }
    } else if (text.length > 0) {
      await this.connection.send('Input.insertText', { text }, target.sessionId)
    }

    if (options.submit === true) {
      await this.dispatchKeyboardKey(target.sessionId, 'Enter')
    }

    this.sessions.touchSession(resolvedTabId)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return {
      tabId: resolvedTabId,
      targetId,
      text,
      submitted: options.submit === true,
    }
  }

  async selectOptions(
    tabId: number | undefined,
    targetId: string,
    values: string[],
  ): Promise<SelectOptionResult> {
    await this.connect()

    if (typeof targetId !== 'string' || targetId.length === 0) {
      throw createCommandError('INVALID_TARGET', 'selectOptions requires a targetId.')
    }
    if (!Array.isArray(values) || values.length === 0 || values.some(value => typeof value !== 'string')) {
      throw createCommandError('INVALID_COMMAND', 'selectOptions requires one or more string values.')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available for option selection.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    const selected = await this.evaluateInSession<string[]>(
      target.sessionId,
      buildSelectOptionsExpression(await this.targetEvaluationPoint(resolvedTabId, targetId), values),
    )

    this.sessions.touchSession(resolvedTabId)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return {
      tabId: resolvedTabId,
      targetId,
      values: selected,
    }
  }

  async fillForm(
    tabId: number | undefined,
    fields: FillFormField[],
  ): Promise<FillFormResult> {
    await this.connect()

    if (!Array.isArray(fields) || fields.length === 0) {
      throw createCommandError('INVALID_COMMAND', 'fillForm requires one or more fields.')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available for form filling.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    const preparedFields = await Promise.all(fields.map(async (field, index) => {
      if (!isFillFormField(field)) {
        throw createCommandError('INVALID_COMMAND', `fillForm field ${index} is invalid.`, { index })
      }
      return {
        ...field,
        point: await this.targetEvaluationPoint(resolvedTabId, field.targetId),
      }
    }))

    await this.evaluateInSession(
      target.sessionId,
      buildFillFormExpression(preparedFields),
    )

    this.sessions.touchSession(resolvedTabId)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return {
      tabId: resolvedTabId,
      fields: fields.map(field => ({
        ...(field.name ? { name: field.name } : {}),
        targetId: field.targetId,
        type: field.type,
      })),
    }
  }

  async fileUpload(
    tabId: number | undefined,
    paths: string[],
  ): Promise<FileUploadResult> {
    await this.connect()

    if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string')) {
      throw createCommandError('INVALID_COMMAND', 'fileUpload paths must be an array of strings.')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available for file upload.')
    }

    const record = await this.waitForPendingFileChooser(resolvedTabId, FILE_CHOOSER_WAIT_TIMEOUT_MS)
    if (!record) {
      throw createCommandError('FILE_CHOOSER_NOT_FOUND', 'No pending file chooser is available to upload to.')
    }
    if (typeof record.backendNodeId !== 'number') {
      throw createCommandError('INVALID_COMMAND', 'Pending file chooser does not expose a file input node.')
    }
    if (!record.multiple && paths.length > 1) {
      throw createCommandError('INVALID_COMMAND', 'Cannot upload multiple files to a single-file chooser.')
    }

    const absolutePaths = paths.map(path => resolve(path))
    try {
      await this.connection.send(
        'DOM.setFileInputFiles',
        {
          files: absolutePaths,
          backendNodeId: record.backendNodeId,
        },
        record.sessionId,
      )
      record.paths = absolutePaths
      record.cancelled = absolutePaths.length === 0
      record.handled = true
      record.handledTimestamp = Date.now()
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error)
      throw error
    }

    this.sessions.touchSession(resolvedTabId)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return {
      tabId: resolvedTabId,
      paths: absolutePaths,
      cancelled: absolutePaths.length === 0,
      fileChooser: toPublicFileChooser(record),
    }
  }

  async drop(
    tabId: number | undefined,
    targetId: string,
    data: DropData,
    paths: string[],
  ): Promise<DropResult> {
    await this.connect()

    if (typeof targetId !== 'string' || targetId.length === 0) {
      throw createCommandError('INVALID_TARGET', 'drop requires a targetId.')
    }
    if (!isDropData(data)) {
      throw createCommandError('INVALID_COMMAND', 'drop data must be an object with string values.')
    }
    if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string')) {
      throw createCommandError('INVALID_COMMAND', 'drop paths must be an array of strings.')
    }
    if (Object.keys(data).length === 0 && paths.length === 0) {
      throw createCommandError('INVALID_COMMAND', 'drop requires at least one of: data, paths.')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available for drop.')
    }

    const target = this.requireAttachedTarget(resolvedTabId)
    const absolutePaths = paths.map(path => resolve(path))
    const files = await Promise.all(absolutePaths.map(path => filePayloadFromPath(path)))
    await this.evaluateInSession<void>(
      target.sessionId,
      buildDropExpression(await this.targetEvaluationPoint(resolvedTabId, targetId), { data, files }),
    )

    this.sessions.touchSession(resolvedTabId)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return {
      tabId: resolvedTabId,
      targetId,
      paths: absolutePaths,
      dataTypes: Object.keys(data),
    }
  }

  async handleDialog(
    tabId: number | undefined,
    options: DialogHandleOptions,
  ): Promise<DialogHandleResult> {
    await this.connect()

    if (typeof options?.accept !== 'boolean') {
      throw createCommandError('INVALID_COMMAND', 'handleDialog requires accept (boolean).')
    }

    const resolvedTabId = this.resolveTabId(tabId)
    if (resolvedTabId == null) {
      throw createCommandError('TAB_NOT_FOUND', 'No browser tab is available for dialog handling.')
    }

    const record = this.dialogs.find(dialog => dialog.tabId === resolvedTabId && !dialog.handled)
    if (!record) {
      throw createCommandError('DIALOG_NOT_FOUND', 'No pending dialog is available to handle.')
    }

    try {
      await this.connection.send(
        'Page.handleJavaScriptDialog',
        {
          accept: options.accept,
          ...(typeof options.promptText === 'string' ? { promptText: options.promptText } : {}),
        },
        record.sessionId,
      )
      record.accepted = options.accept
      if (typeof options.promptText === 'string') record.promptText = options.promptText
      record.handled = true
      record.handledTimestamp = Date.now()
      if (record.actionPromise) {
        await record.actionPromise.catch(() => undefined)
      }
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error)
      throw error
    }

    this.sessions.touchSession(resolvedTabId)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return {
      tabId: resolvedTabId,
      armed: false,
      dialog: toPublicDialog(record),
    }
  }

  async injectManifest(tabId: number, manifest: AgruneManifest): Promise<void> {
    const target = this.targetManager.getTarget(tabId)
    if (!target?.sessionId) {
      throw createCommandError(
        'TAB_NOT_FOUND',
        `No session for tabId ${tabId}.`,
        { tabId },
      )
    }

    // JSON.stringify 이중 인코딩 + U+2028/U+2029 이스케이프 (T-12-05)
    const jsonLiteral = JSON.stringify(JSON.stringify(manifest))
    const escaped = jsonLiteral
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')

    const expression =
      `window.__agrune_manifest__ = JSON.parse(${escaped});` +
      `if (window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}] && ` +
      `typeof window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}].reloadRuntime === 'function') {` +
      `  window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}].reloadRuntime();` +
      `}`

    await this.evaluateInSession(target.sessionId, expression)
    await this.refreshSnapshot(tabId)
  }

  async runMacro(
    tabId: number,
    macroId: string,
    params: Record<string, unknown> = {},
  ): Promise<MacroRunResponse> {
    const target = this.targetManager.getTarget(tabId)
    if (!target?.sessionId) {
      throw createCommandError('TAB_NOT_FOUND', `No session for tabId ${tabId}.`, { tabId })
    }

    const macroIdLiteral = JSON.stringify(macroId)
    // JSON.stringify 이중 인코딩 + U+2028/U+2029 이스케이프 (T-12-05 회귀 방지)
    const paramsJson = JSON.stringify(JSON.stringify(params))
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')

    const expression =
      `(async () => {` +
      `  const rt = window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}];` +
      `  if (!rt || typeof rt.runMacro !== 'function') {` +
      `    return { status: 'step-error', stepIndex: -1, error: 'runtime not ready', macroId: ${macroIdLiteral}, stepCount: 0 };` +
      `  }` +
      `  return await rt.runMacro({ macroId: ${macroIdLiteral}, params: JSON.parse(${paramsJson}) });` +
      `})()`

    const raw = await this.evaluateInSession<MacroRunResponse>(target.sessionId, expression)
    if (!raw || typeof raw !== 'object' || typeof raw.status !== 'string') {
      throw createCommandError('INVALID_COMMAND', 'MacroRunner returned invalid result.', { raw: raw as unknown })
    }
    return raw
  }

  private async doConnect(): Promise<void> {
    const wsEndpoint = await this.resolveWsEndpoint()
    await this.connection.connect(wsEndpoint)
    this.resolvedWsEndpoint = wsEndpoint
    this.ensureRecoverySupervisor()
    this.subscribeLifecycle()
    this.registerBindings()
    await this.targetManager.start(this.connection)
  }

  private async waitForSessionClosed(tabId: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!this.sessions.getSession(tabId)) return true
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    return !this.sessions.getSession(tabId)
  }

  private requireAttachedTarget(tabId: number): TargetInfo & { sessionId: string } {
    const target = this.targetManager.getTarget(tabId)
    if (!target?.sessionId) {
      throw createCommandError(
        'TAB_NOT_FOUND',
        `No active browser target exists for tabId ${tabId}.`,
        { tabId },
      )
    }
    return target as TargetInfo & { sessionId: string }
  }

  private async playwrightPageForTab(browser: PlaywrightBrowser, tabId: number): Promise<PlaywrightPage> {
    const session = this.listSessions().find(candidate => candidate.tabId === tabId)
    if (!session) {
      throw createCommandError('TAB_NOT_FOUND', `No browser tab exists for tabId ${tabId}.`, { tabId })
    }

    const pages = browser.contexts()
      .flatMap(context => context.pages())
      .filter(page => !page.isClosed())

    if (pages.length === 0) {
      throw createCommandError('TAB_NOT_FOUND', 'Playwright did not expose any pages for the CDP browser.')
    }

    const sameUrl = pages.filter(page => page.url() === session.url)
    if (sameUrl.length === 1) return sameUrl[0]

    if (sameUrl.length > 1 && session.title) {
      for (const page of sameUrl) {
        const title = await page.title().catch(() => '')
        if (title === session.title) return page
      }
    }

    const sessionIndex = this.listSessions().findIndex(candidate => candidate.tabId === tabId)
    if (sessionIndex >= 0 && pages[sessionIndex]) return pages[sessionIndex]
    return sameUrl[0] ?? pages[0]
  }

  private async waitForNavigationSettled(
    tabId: number,
    expectedUrl: string,
    timeoutMs: number,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const target = this.targetManager.getTarget(tabId)
      if (!target?.sessionId) {
        throw createCommandError('TAB_NOT_FOUND', `No active browser target exists for tabId ${tabId}.`, { tabId })
      }

      try {
        const state = await this.evaluateInSession<{ url: string; title: string; readyState: string } | null>(
          target.sessionId,
          `(() => ({ url: location.href, title: document.title, readyState: document.readyState }))()`,
        )
        if (state?.url === expectedUrl && (state.readyState === 'interactive' || state.readyState === 'complete')) {
          this.sessions.openSession(tabId, state.url, state.title)
          return
        }
      } catch {
        // The execution context can disappear while the navigation commits.
      }

      if (target.url === expectedUrl && target.title) {
        this.sessions.openSession(tabId, target.url, target.title)
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    throw createCommandError(
      'TIMEOUT',
      `Timed out waiting for tabId ${tabId} to navigate to ${expectedUrl}.`,
      { tabId, url: expectedUrl },
    )
  }

  private navigationResult(tabId: number, fallbackUrl: string): NavigationResult {
    const session = this.sessions.getSession(tabId)
    return {
      tabId,
      url: session?.url ?? fallbackUrl,
      title: session?.title ?? '',
    }
  }

  private async fullPageScreenshotClip(
    sessionId: string,
  ): Promise<{ x: number; y: number; width: number; height: number; scale: number }> {
    const metrics = await this.connection.send('Page.getLayoutMetrics', {}, sessionId)
    const size = (metrics.cssContentSize ?? metrics.contentSize) as Record<string, unknown> | undefined
    const width = typeof size?.width === 'number' ? size.width : NaN
    const height = typeof size?.height === 'number' ? size.height : NaN
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw createCommandError('INVALID_COMMAND', 'CDP Page.getLayoutMetrics did not return content size.')
    }
    return {
      x: 0,
      y: 0,
      width: Math.ceil(width),
      height: Math.ceil(height),
      scale: 1,
    }
  }

  private async targetScreenshotClip(
    tabId: number,
    sessionId: string,
    targetId: string,
  ): Promise<{ x: number; y: number; width: number; height: number; scale: number }> {
    const snapshotTarget = await this.findSnapshotTarget(tabId, targetId)
    if (!snapshotTarget) {
      return this.selectorScreenshotClip(sessionId, targetId)
    }
    if (!snapshotTarget.center || !snapshotTarget.size) {
      throw createCommandError('INVALID_TARGET', `target has no screenshot bounds: ${targetId}`, { targetId })
    }

    const width = Number(snapshotTarget.size.w)
    const height = Number(snapshotTarget.size.h)
    const centerX = Number(snapshotTarget.center.x)
    const centerY = Number(snapshotTarget.center.y)
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(centerX) ||
      !Number.isFinite(centerY) ||
      width <= 0 ||
      height <= 0
    ) {
      throw createCommandError('INVALID_TARGET', `target has invalid screenshot bounds: ${targetId}`, { targetId })
    }

    const scroll = await this.evaluateInSession<{ x: number; y: number }>(
      sessionId,
      `(() => ({ x: window.scrollX, y: window.scrollY }))()`,
    ).catch(() => ({ x: 0, y: 0 }))

    return {
      x: Math.max(0, scroll.x + centerX - width / 2),
      y: Math.max(0, scroll.y + centerY - height / 2),
      width: Math.ceil(width),
      height: Math.ceil(height),
      scale: 1,
    }
  }

  private async selectorScreenshotClip(
    sessionId: string,
    selector: string,
  ): Promise<{ x: number; y: number; width: number; height: number; scale: number }> {
    const bounds = await this.resolveSelectorBounds(sessionId, selector)
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw createCommandError('INVALID_TARGET', `selector has invalid screenshot bounds: ${selector}`, {
        targetId: selector,
      })
    }
    return {
      x: Math.max(0, Math.floor(bounds.x)),
      y: Math.max(0, Math.floor(bounds.y)),
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
      scale: 1,
    }
  }

  private async targetEvaluationExpression(
    tabId: number,
    sessionId: string,
    targetId: string,
    source: string,
    arg: unknown,
  ): Promise<string> {
    const snapshotTarget = await this.findSnapshotTarget(tabId, targetId)
    if (!snapshotTarget) {
      await this.ensureUniqueSelectorTarget(sessionId, targetId)
      return buildSelectorEvaluationExpression(source, arg, targetId)
    }
    if (!snapshotTarget.center) {
      throw createCommandError('INVALID_TARGET', `target has no evaluation point: ${targetId}`, { targetId })
    }
    const x = Number(snapshotTarget.center.x)
    const y = Number(snapshotTarget.center.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw createCommandError('INVALID_TARGET', `target has invalid evaluation point: ${targetId}`, { targetId })
    }
    return buildTargetEvaluationExpression(source, arg, { x, y })
  }

  private async targetEvaluationPoint(
    tabId: number,
    targetId: string,
  ): Promise<{ x: number; y: number }> {
    const snapshotTarget = await this.findSnapshotTarget(tabId, targetId)
    if (!snapshotTarget) {
      throw createCommandError('TARGET_NOT_FOUND', `target not found: ${targetId}`, { targetId })
    }
    if (!snapshotTarget.center) {
      throw createCommandError('INVALID_TARGET', `target has no evaluation point: ${targetId}`, { targetId })
    }
    const x = Number(snapshotTarget.center.x)
    const y = Number(snapshotTarget.center.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw createCommandError('INVALID_TARGET', `target has invalid evaluation point: ${targetId}`, { targetId })
    }
    return { x, y }
  }

  private async findSnapshotTarget(
    tabId: number,
    targetId: string,
  ): Promise<PageSnapshot['targets'][number] | null> {
    const snapshot = this.sessions.getSnapshot(tabId) ?? await this.refreshSnapshot(tabId).catch(() => null)
    return snapshot?.targets.find(candidate => candidate.targetId === targetId) ?? null
  }

  private async ensureUniqueSelectorTarget(sessionId: string, selector: string): Promise<void> {
    const probe = await this.evaluateInSession<SelectorProbeResult>(
      sessionId,
      buildSelectorProbeExpression(selector),
    )
    assertUniqueSelectorProbe(selector, probe)
  }

  private async resolveSelectorBounds(sessionId: string, selector: string): Promise<SelectorBounds> {
    const probe = await this.evaluateInSession<SelectorBoundsProbeResult>(
      sessionId,
      buildSelectorBoundsProbeExpression(selector),
    )
    assertUniqueSelectorProbe(selector, probe)
    if (probe.status !== 'ok' || !('bounds' in probe)) {
      throw createCommandError('TARGET_NOT_FOUND', `target not found: ${selector}`, { targetId: selector })
    }
    return probe.bounds
  }

  private async focusTargetForTextInput(
    tabId: number,
    sessionId: string,
    targetId: string,
  ): Promise<void> {
    await this.evaluateInSession(
      sessionId,
      buildTargetFocusExpression(await this.targetEvaluationPoint(tabId, targetId)),
    )
  }

  private async dispatchKeyboardKey(sessionId: string, key: string): Promise<void> {
    const keyInfo = keyboardKeyInfo(key)
    const base: Record<string, unknown> = {
      key: keyInfo.key,
      code: keyInfo.code,
      modifiers: keyInfo.modifiers,
      ...(typeof keyInfo.windowsVirtualKeyCode === 'number'
        ? {
            windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
            nativeVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
          }
        : {}),
    }
    const textParams = keyInfo.text
      ? { text: keyInfo.text, unmodifiedText: keyInfo.text }
      : {}

    await this.connection.send('Input.dispatchKeyEvent', {
      type: keyInfo.text ? 'keyDown' : 'rawKeyDown',
      ...base,
      ...textParams,
    }, sessionId)
    await this.connection.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      ...base,
    }, sessionId)
  }

  private async resolveWsEndpoint(): Promise<string> {
    if (this.options.mode === 'attach') {
      if (!this.options.wsEndpoint) {
        throw new Error('CDP attach mode requires a wsEndpoint.')
      }
      return resolveCdpWsEndpoint(this.options.wsEndpoint)
    }

    const launched = await this.launcher.launch({
      chromePath: this.options.chromePath,
      headless: this.options.headless,
      userDataDir: this.options.userDataDir,
      args: this.options.chromeArgs,
      startUrl: this.options.startUrl,
    })
    return launched.wsEndpoint
  }

  private registerBindings(): void {
    if (this.bindingsRegistered) return
    this.bindingsRegistered = true
    this.connection.on('Runtime.bindingCalled', this.handleBindingCalled)
    this.connection.on('Input.dragIntercepted', this.handleDragIntercepted)
    this.connection.on('Runtime.consoleAPICalled', this.handleConsoleAPICalled)
    this.connection.on('Runtime.exceptionThrown', this.handleExceptionThrown)
    this.connection.on('Page.frameNavigated', this.handleFrameNavigated)
    this.connection.on('Network.requestWillBeSent', this.handleNetworkRequestWillBeSent)
    this.connection.on('Network.requestWillBeSentExtraInfo', this.handleNetworkRequestWillBeSentExtraInfo)
    this.connection.on('Network.responseReceived', this.handleNetworkResponseReceived)
    this.connection.on('Network.responseReceivedExtraInfo', this.handleNetworkResponseReceivedExtraInfo)
    this.connection.on('Network.loadingFailed', this.handleNetworkLoadingFailed)
    this.connection.on('Page.javascriptDialogOpening', this.handleJavascriptDialogOpening)
    this.connection.on('Page.javascriptDialogClosed', this.handleJavascriptDialogClosed)
    this.connection.on('Page.fileChooserOpened', this.handleFileChooserOpened)
  }

  private unregisterBindings(): void {
    if (!this.bindingsRegistered) return
    this.bindingsRegistered = false
    this.connection.off('Runtime.bindingCalled', this.handleBindingCalled)
    this.connection.off('Input.dragIntercepted', this.handleDragIntercepted)
    this.connection.off('Runtime.consoleAPICalled', this.handleConsoleAPICalled)
    this.connection.off('Runtime.exceptionThrown', this.handleExceptionThrown)
    this.connection.off('Page.frameNavigated', this.handleFrameNavigated)
    this.connection.off('Network.requestWillBeSent', this.handleNetworkRequestWillBeSent)
    this.connection.off('Network.requestWillBeSentExtraInfo', this.handleNetworkRequestWillBeSentExtraInfo)
    this.connection.off('Network.responseReceived', this.handleNetworkResponseReceived)
    this.connection.off('Network.responseReceivedExtraInfo', this.handleNetworkResponseReceivedExtraInfo)
    this.connection.off('Network.loadingFailed', this.handleNetworkLoadingFailed)
    this.connection.off('Page.javascriptDialogOpening', this.handleJavascriptDialogOpening)
    this.connection.off('Page.javascriptDialogClosed', this.handleJavascriptDialogClosed)
    this.connection.off('Page.fileChooserOpened', this.handleFileChooserOpened)
  }

  private async prepareTarget(target: TargetInfo): Promise<void> {
    if (!target.sessionId || this.preparedSessions.has(target.sessionId)) return

    this.preparedSessions.add(target.sessionId)
    const injector = new CdpRuntimeInjector(this.connection)

    try {
      await injector.prepareSession(target.sessionId)
      await this.connection.send(
        'Page.setInterceptFileChooserDialog',
        { enabled: true },
        target.sessionId,
      )
      if (Object.keys(this.desiredConfig).length > 0) {
        await this.evaluateInSession(
          target.sessionId,
          `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.applyConfig(${JSON.stringify(this.desiredConfig)})`,
        )
      }
      if (this.activityBlocks.hasActiveBlocks()) {
        await this.setAgentActivity(target.sessionId, true)
      }
      await this.refreshSnapshot(target.tabId)
    } catch (error) {
      this.preparedSessions.delete(target.sessionId)
      throw error
    }
  }

  private async refreshSnapshot(tabId: number): Promise<void> {
    const target = this.targetManager.getTarget(tabId)
    if (!target?.sessionId) return

    const snapshot = await this.evaluateInSession<PageSnapshot | null>(
      target.sessionId,
      `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.getSnapshot() ?? null`,
    )

    if (!snapshot) return
    this.sessions.updateSnapshot(tabId, snapshot)
    this.snapshotUpdateCbs.forEach(cb => cb(tabId, snapshot))
  }

  private async onBindingCalled(
    params: Record<string, unknown>,
    sessionId?: string,
  ): Promise<void> {
    if (typeof sessionId !== 'string') return
    if (params.name !== 'agrune_send') return
    if (typeof params.payload !== 'string') return

    const target = this.targetManager.getTargetBySessionId(sessionId)
    if (!target) return

    const message = JSON.parse(params.payload) as RuntimeBridgeMessage
    switch (message.type) {
      case 'runtime_ready':
        await this.refreshSnapshot(target.tabId)
        return
      case 'snapshot_update': {
        const snapshot = this.asSnapshot(message.data)
        if (!snapshot) return
        this.sessions.updateSnapshot(target.tabId, snapshot)
        this.snapshotUpdateCbs.forEach(cb => cb(target.tabId, snapshot))
        return
      }
      case 'cdp_request':
        await this.handleCdpRequest(target, message.data)
        return
      default:
        return
    }
  }

  private async onDragIntercepted(
    params: Record<string, unknown>,
    sessionId?: string,
  ): Promise<void> {
    if (typeof sessionId !== 'string') return
    await this.dispatchCdpMessage(sessionId, {
      type: 'cdp_event',
      method: 'Input.dragIntercepted',
      params,
    })
  }

  private async handleCdpRequest(
    target: TargetInfo,
    data: unknown,
  ): Promise<void> {
    if (!target.sessionId) return
    if (!data || typeof data !== 'object') return

    const request = data as Record<string, unknown>
    if (
      typeof request.requestId !== 'string' ||
      typeof request.method !== 'string' ||
      !request.params ||
      typeof request.params !== 'object'
    ) {
      return
    }

    try {
      const result = await this.connection.send(
        request.method,
        request.params as Record<string, unknown>,
        target.sessionId,
      )
      await this.dispatchCdpMessage(target.sessionId, {
        type: 'cdp_response',
        requestId: request.requestId,
        result,
      })
    } catch (error) {
      await this.dispatchCdpMessage(target.sessionId, {
        type: 'cdp_response',
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async dispatchCdpMessage(
    sessionId: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.evaluateInSession(
      sessionId,
      `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.dispatchCdpMessage(${JSON.stringify(detail)})`,
    )
  }

  private recordConsoleMessage(params: Record<string, unknown>, sessionId?: string): void {
    const tabId = this.tabIdForSession(sessionId)
    if (tabId == null) return
    this.ensureConsoleState(tabId)
    const stackTrace = params.stackTrace as Record<string, unknown> | undefined
    const callFrame = firstCallFrame(stackTrace)
    const args = Array.isArray(params.args) ? params.args as Array<Record<string, unknown>> : []
    const type = typeof params.type === 'string' ? params.type : 'log'
    this.consoleMessagesByTab.get(tabId)!.push({
      tabId,
      level: normalizeConsoleLevel(type),
      type,
      text: consoleTextFromArgs(args),
      timestamp: typeof params.timestamp === 'number' ? params.timestamp : Date.now(),
      navigationIndex: this.navigationIndexByTab.get(tabId) ?? 0,
      location: {
        url: typeof callFrame?.url === 'string' ? callFrame.url : this.sessions.getSession(tabId)?.url ?? '',
        lineNumber: typeof callFrame?.lineNumber === 'number' ? callFrame.lineNumber : 0,
        columnNumber: typeof callFrame?.columnNumber === 'number' ? callFrame.columnNumber : 0,
      },
    })
  }

  private recordExceptionThrown(params: Record<string, unknown>, sessionId?: string): void {
    const tabId = this.tabIdForSession(sessionId)
    if (tabId == null) return
    this.ensureConsoleState(tabId)
    const details = params.exceptionDetails as Record<string, unknown> | undefined
    const exception = details?.exception as Record<string, unknown> | undefined
    const stackTrace = details?.stackTrace as Record<string, unknown> | undefined
    const callFrame = firstCallFrame(stackTrace)
    this.consoleMessagesByTab.get(tabId)!.push({
      tabId,
      level: 'error',
      type: 'pageerror',
      text: exceptionText(details, exception),
      timestamp: typeof params.timestamp === 'number' ? params.timestamp : Date.now(),
      navigationIndex: this.navigationIndexByTab.get(tabId) ?? 0,
      location: {
        url: typeof callFrame?.url === 'string' ? callFrame.url : this.sessions.getSession(tabId)?.url ?? '',
        lineNumber: typeof details?.lineNumber === 'number' ? details.lineNumber : typeof callFrame?.lineNumber === 'number' ? callFrame.lineNumber : 0,
        columnNumber: typeof details?.columnNumber === 'number' ? details.columnNumber : typeof callFrame?.columnNumber === 'number' ? callFrame.columnNumber : 0,
      },
    })
  }

  private recordFrameNavigated(params: Record<string, unknown>, sessionId?: string): void {
    const tabId = this.tabIdForSession(sessionId)
    if (tabId == null) return
    const frame = params.frame as Record<string, unknown> | undefined
    if (!frame || typeof frame.parentId === 'string') return
    this.ensureConsoleState(tabId)
    this.navigationIndexByTab.set(tabId, (this.navigationIndexByTab.get(tabId) ?? 0) + 1)
  }

  private recordJavascriptDialogOpening(params: Record<string, unknown>, sessionId?: string): void {
    const tabId = this.tabIdForSession(sessionId)
    if (tabId == null || !sessionId) return
    const type = typeof params.type === 'string' ? params.type : 'alert'
    const record: DialogRecord = {
      id: this.nextDialogId++,
      tabId,
      sessionId,
      type,
      message: typeof params.message === 'string' ? params.message : '',
      ...(typeof params.defaultPrompt === 'string' ? { defaultValue: params.defaultPrompt } : {}),
      timestamp: Date.now(),
      handled: false,
    }
    this.dialogs.push(record)
    this.notifyDialogWaiters(record)
  }

  private recordJavascriptDialogClosed(params: Record<string, unknown>, sessionId?: string): void {
    const tabId = this.tabIdForSession(sessionId)
    if (tabId == null) return
    const pending = this.dialogs.find(dialog => dialog.tabId === tabId && !dialog.handled)
    if (!pending) return
    pending.handled = true
    pending.accepted = params.result === true
    if (typeof params.userInput === 'string') pending.promptText = params.userInput
    pending.handledTimestamp = Date.now()
  }

  private waitForNextDialog(tabId: number, afterId: number): { promise: Promise<DialogRecord>; cancel(): void } {
    const existing = this.dialogs.find(dialog => dialog.tabId === tabId && dialog.id > afterId && !dialog.handled)
    if (existing) {
      return {
        promise: Promise.resolve(existing),
        cancel() {},
      }
    }

    let waiter: DialogWaiter | null = null
    const promise = new Promise<DialogRecord>(resolve => {
      waiter = { tabId, afterId, resolve }
      this.dialogWaiters.push(waiter)
    })
    return {
      promise,
      cancel: () => {
        if (!waiter) return
        const index = this.dialogWaiters.indexOf(waiter)
        if (index >= 0) this.dialogWaiters.splice(index, 1)
      },
    }
  }

  private notifyDialogWaiters(dialog: DialogRecord): void {
    for (let index = this.dialogWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.dialogWaiters[index]
      if (waiter.tabId !== dialog.tabId || dialog.id <= waiter.afterId) continue
      this.dialogWaiters.splice(index, 1)
      waiter.resolve(dialog)
    }
  }

  private recordFileChooserOpened(params: Record<string, unknown>, sessionId?: string): void {
    const tabId = this.tabIdForSession(sessionId)
    if (tabId == null || !sessionId) return
    const mode = params.mode === 'selectMultiple' ? 'selectMultiple' : 'selectSingle'
    const backendNodeId = typeof params.backendNodeId === 'number' ? params.backendNodeId : undefined
    this.fileChoosers.push({
      id: this.nextFileChooserId++,
      tabId,
      sessionId,
      timestamp: Date.now(),
      mode,
      multiple: mode === 'selectMultiple',
      handled: false,
      ...(typeof backendNodeId === 'number' ? { backendNodeId } : {}),
    })
  }

  private async waitForPendingFileChooser(tabId: number, timeoutMs: number): Promise<FileChooserRecord | null> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const pending = this.fileChoosers.find(fileChooser => fileChooser.tabId === tabId && !fileChooser.handled)
      if (pending) return pending
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    return this.fileChoosers.find(fileChooser => fileChooser.tabId === tabId && !fileChooser.handled) ?? null
  }

  private ensureConsoleState(tabId: number): void {
    if (!this.consoleMessagesByTab.has(tabId)) this.consoleMessagesByTab.set(tabId, [])
    if (!this.navigationIndexByTab.has(tabId)) this.navigationIndexByTab.set(tabId, 0)
  }

  private recordNetworkRequestWillBeSent(params: Record<string, unknown>, sessionId?: string): void {
    const tabId = this.tabIdForSession(sessionId)
    if (tabId == null || !sessionId) return
    const requestId = typeof params.requestId === 'string' ? params.requestId : null
    const request = params.request as Record<string, unknown> | undefined
    if (!requestId || !request) return

    this.ensureNetworkState(tabId)
    const records = this.networkRequestsByTab.get(tabId)!
    const resourceType = normalizeResourceType(typeof params.type === 'string' ? params.type : 'other')
    const navigationIndex = resourceType === 'document'
      ? (this.navigationIndexByTab.get(tabId) ?? 0) + 1
      : this.navigationIndexByTab.get(tabId) ?? 0
    const record: NetworkRequestRecord = {
      index: records.length + 1,
      requestId,
      sessionId,
      tabId,
      method: typeof request.method === 'string' ? request.method : 'GET',
      url: typeof request.url === 'string' ? request.url : '',
      resourceType,
      isNavigationRequest: resourceType === 'document',
      timestamp: typeof params.wallTime === 'number' ? Math.round(params.wallTime * 1000) : Date.now(),
      navigationIndex,
      requestHeaders: headersFromUnknown(request.headers),
      requestBody: typeof request.postData === 'string' ? request.postData : null,
      responseHeaders: {},
    }
    records.push(record)
    this.networkByRequestId.set(networkRequestKey(sessionId, requestId), record)
  }

  private recordNetworkRequestExtraInfo(params: Record<string, unknown>, sessionId?: string): void {
    const record = this.networkRecordFor(params, sessionId)
    if (!record) return
    record.requestHeaders = { ...record.requestHeaders, ...headersFromUnknown(params.headers) }
  }

  private recordNetworkResponseReceived(params: Record<string, unknown>, sessionId?: string): void {
    const record = this.networkRecordFor(params, sessionId)
    if (!record) return
    const response = params.response as Record<string, unknown> | undefined
    if (!response) return
    if (typeof response.status === 'number') record.status = response.status
    if (typeof response.statusText === 'string') record.statusText = response.statusText
    record.responseHeaders = { ...record.responseHeaders, ...headersFromUnknown(response.headers) }
  }

  private recordNetworkResponseExtraInfo(params: Record<string, unknown>, sessionId?: string): void {
    const record = this.networkRecordFor(params, sessionId)
    if (!record) return
    if (typeof params.statusCode === 'number') record.status = params.statusCode
    record.responseHeaders = { ...record.responseHeaders, ...headersFromUnknown(params.headers) }
  }

  private recordNetworkLoadingFailed(params: Record<string, unknown>, sessionId?: string): void {
    const record = this.networkRecordFor(params, sessionId)
    if (!record) return
    record.failureText = typeof params.errorText === 'string' ? params.errorText : 'Request failed'
  }

  private networkRecordFor(params: Record<string, unknown>, sessionId?: string): NetworkRequestRecord | null {
    if (!sessionId || typeof params.requestId !== 'string') return null
    return this.networkByRequestId.get(networkRequestKey(sessionId, params.requestId)) ?? null
  }

  private ensureNetworkState(tabId: number): void {
    if (!this.networkRequestsByTab.has(tabId)) this.networkRequestsByTab.set(tabId, [])
  }

  private async networkRequestPartValue(
    record: NetworkRequestRecord,
    part: NetworkRequestPart,
  ): Promise<string | Record<string, string> | null> {
    if (part === 'request-headers') return record.requestHeaders
    if (part === 'request-body') return record.requestBody
    if (part === 'response-headers') {
      if (!hasNetworkResponse(record)) {
        throw createCommandError('NETWORK_RESPONSE_NOT_FOUND', `No response is available for request ${record.index}.`, { index: record.index })
      }
      return record.responseHeaders
    }
    if (!hasNetworkResponse(record)) {
      throw createCommandError('NETWORK_RESPONSE_NOT_FOUND', `No response is available for request ${record.index}.`, { index: record.index })
    }
    return this.networkResponseBody(record)
  }

  private async networkResponseBody(record: NetworkRequestRecord): Promise<string | null> {
    if (!hasNetworkResponse(record)) return null
    if (record.responseBody !== undefined) return record.responseBody
    try {
      const response = await this.connection.send('Network.getResponseBody', { requestId: record.requestId }, record.sessionId)
      const body = typeof response.body === 'string' ? response.body : ''
      record.responseBody = response.base64Encoded === true ? Buffer.from(body, 'base64').toString('utf8') : body
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw createCommandError('NETWORK_RESPONSE_NOT_FOUND', `Response body is unavailable: ${message}`, { index: record.index })
    }
    return record.responseBody
  }

  private tabIdForSession(sessionId?: string): number | null {
    if (!sessionId) return null
    return this.targetManager.getTargets().find(target => target.sessionId === sessionId)?.tabId ?? null
  }

  private async evaluateInSession<TResult>(
    sessionId: string,
    expression: string,
  ): Promise<TResult> {
    const response = await this.connection.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    )

    if (response.exceptionDetails) {
      const details = response.exceptionDetails as Record<string, unknown>
      const text =
        typeof details.text === 'string'
          ? details.text
          : 'Runtime evaluation failed.'
      throw new Error(text)
    }

    const remoteObject = response.result as Record<string, unknown> | undefined
    return (remoteObject?.value ?? undefined) as TResult
  }

  private runBackgroundTask(task: Promise<void>): void {
    void task.catch((error) => {
      if (this.isIgnorableDisconnectError(error)) {
        return
      }
      console.error('[agrune quick-mode] background task failed:', error)
    })
  }

  private async setAgentActivity(sessionId: string, active: boolean): Promise<void> {
    await this.evaluateInSession(
      sessionId,
      `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.setAgentActivity(${JSON.stringify(active)})`,
    )
  }

  private async withActivityBlocks<T>(
    kind: string,
    effect: () => Promise<T>,
  ): Promise<T> {
    const guardId = this.activityBlocks.pushGuard(`${kind}:guard`)
    try {
      return await effect()
    } finally {
      this.activityBlocks.pushTimed(`${kind}:tail`, ACTIVITY_TAIL_BLOCK_MS)
      this.activityBlocks.release(guardId)
    }
  }

  private isIgnorableDisconnectError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message === 'CDP connection disconnected.' ||
        error.message === 'CDP connection is not open.' ||
        error.message === 'Session with given id not found.'
    }
    return false
  }

  private toSession(tabId: number): Session {
    const session = this.sessions.getSession(tabId)
    return {
      tabId,
      url: session?.url ?? '',
      title: session?.title ?? '',
      hasSnapshot: session?.snapshot != null,
      snapshotVersion: session?.snapshot?.version ?? null,
    }
  }

  private ensureRecoverySupervisor(): void {
    if (this.recovery) return
    const strategy: RecoveryStrategy = {
      canRelaunch: this.options.mode === 'launch',
      reconnect: () => this.performReconnect(),
      relaunchAndReconnect: () => this.performRelaunch(),
    }
    const supervisor = new RecoverySupervisor(strategy)
    supervisor.onEvent((event) => {
      if (event.kind === 'succeeded') this.recoveredFlag = true
      for (const listener of this.recoveryListeners) {
        try { listener(event) } catch { /* ignore */ }
      }
    })
    this.recovery = supervisor
  }

  private subscribeLifecycle(): void {
    this.unsubscribeDisconnect?.()
    this.unsubscribeExit?.()
    this.unsubscribeDisconnect = this.connection.onDisconnect((reason) => {
      void this.triggerRecovery('connection_lost', reason)
    })
    if (this.options.mode === 'launch') {
      this.unsubscribeExit = this.launcher.onUnexpectedExit(({ code, signal }) => {
        const reason = new Error(
          `Chrome exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`,
        )
        void this.triggerRecovery('chrome_crashed', reason)
      })
    }
  }

  private async triggerRecovery(
    cause: 'connection_lost' | 'chrome_crashed',
    reason: Error,
  ): Promise<void> {
    if (!this.recovery) this.ensureRecoverySupervisor()
    try {
      await this.recovery!.trigger(cause, reason)
    } catch {
      // failure already reported via event listeners
    }
  }

  private async performReconnect(): Promise<void> {
    this.preparedSessions.clear()
    this.unregisterBindings()
    this.targetManager.stop()
    if (!this.resolvedWsEndpoint) {
      throw new Error('Cannot reconnect: no cached ws endpoint.')
    }
    await this.connection.connect(this.resolvedWsEndpoint)
    this.registerBindings()
    await this.targetManager.start(this.connection)
    await this.reprepareAllTargets()
  }

  private async performRelaunch(): Promise<void> {
    this.preparedSessions.clear()
    this.unregisterBindings()
    this.targetManager.stop()
    await this.connection.disconnect().catch(() => {})
    if (this.launcher.hasChild()) {
      await this.launcher.kill().catch(() => {})
    }
    const launched = await this.launcher.launch({
      chromePath: this.options.chromePath,
      headless: this.options.headless,
      userDataDir: this.options.userDataDir,
      args: this.options.chromeArgs,
      startUrl: this.options.startUrl,
    })
    this.resolvedWsEndpoint = launched.wsEndpoint
    await this.connection.connect(launched.wsEndpoint)
    this.registerBindings()
    await this.targetManager.start(this.connection)
    await this.reprepareAllTargets()
  }

  private async reprepareAllTargets(): Promise<void> {
    const targets = this.targetManager.getTargets()
    for (const target of targets) {
      if (!target.sessionId) continue
      this.preparedSessions.delete(target.sessionId)
      await this.prepareTarget(target).catch(() => {})
    }
  }

  private async waitForTarget(targetId: string, timeoutMs: number): Promise<TargetInfo | null> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() <= deadline) {
      const target = this.targetManager.getTargets().find(candidate => candidate.targetId === targetId)
      if (target?.sessionId) return target
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    return null
  }

  private asSnapshot(value: unknown): PageSnapshot | null {
    if (!value || typeof value !== 'object') return null
    const snapshot = value as Record<string, unknown>
    if (
      typeof snapshot.version !== 'number' ||
      !Array.isArray(snapshot.groups) ||
      !Array.isArray(snapshot.targets) ||
      typeof snapshot.url !== 'string' ||
      typeof snapshot.title !== 'string'
    ) {
      return null
    }
    return value as PageSnapshot
  }
}

function screenshotTypeFromPath(path: string): ScreenshotImageType | null {
  const ext = extname(path).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg'
  if (ext === '.png') return 'png'
  return null
}

function keyboardKeyInfo(input: string): KeyboardKeyInfo {
  const parts = input.includes('+') && input !== '+'
    ? input.split('+').filter(part => part.length > 0)
    : [input]
  let modifiers = 0
  let keyPart = parts[parts.length - 1] ?? input
  for (const part of parts.slice(0, -1)) {
    const modifier = modifierBit(part)
    if (modifier === 0) {
      keyPart = input
      modifiers = 0
      break
    }
    modifiers |= modifier
  }

  const base = baseKeyboardKeyInfo(keyPart)
  if ((modifiers & (CDP_ALT_MODIFIER | CDP_CONTROL_MODIFIER | CDP_META_MODIFIER)) !== 0) {
    const rest = { ...base }
    delete rest.text
    return { ...rest, modifiers }
  }
  return { ...base, modifiers }
}

function baseKeyboardKeyInfo(key: string): Omit<KeyboardKeyInfo, 'modifiers'> {
  const specialName = Object.keys(SPECIAL_KEY_INFO).find(name => name.toLowerCase() === key.toLowerCase())
  const special = specialName ? SPECIAL_KEY_INFO[specialName] : undefined
  if (special) return special

  const functionKey = /^F([1-9]|1[0-2])$/.exec(key)
  if (functionKey) {
    const number = Number(functionKey[1])
    return {
      key,
      code: key,
      windowsVirtualKeyCode: 111 + number,
    }
  }

  if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    return {
      key,
      code: `Key${key.toUpperCase()}`,
      text: key,
      windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    }
  }
  if (key.length === 1 && /[0-9]/.test(key)) {
    return {
      key,
      code: `Digit${key}`,
      text: key,
      windowsVirtualKeyCode: key.charCodeAt(0),
    }
  }
  if (key.length === 1) {
    return {
      key,
      code: '',
      text: key,
      windowsVirtualKeyCode: key.charCodeAt(0),
    }
  }
  return { key, code: key }
}

function modifierBit(part: string): number {
  switch (part.toLowerCase()) {
    case 'alt':
    case 'option':
      return CDP_ALT_MODIFIER
    case 'control':
    case 'ctrl':
      return CDP_CONTROL_MODIFIER
    case 'meta':
    case 'command':
    case 'cmd':
      return CDP_META_MODIFIER
    case 'shift':
      return CDP_SHIFT_MODIFIER
    default:
      return 0
  }
}

function compileRunCodeUnsafeFunction(source: string): (page: PlaywrightPage) => unknown | Promise<unknown> {
  let candidate: unknown
  try {
    candidate = new Function(`return (${source});`)()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw createCommandError(
      'INVALID_COMMAND',
      `browser_run_code_unsafe code must be a JavaScript function: ${message}`,
    )
  }

  if (typeof candidate !== 'function') {
    throw createCommandError('INVALID_COMMAND', 'browser_run_code_unsafe code must evaluate to a function.')
  }
  return candidate as (page: PlaywrightPage) => unknown | Promise<unknown>
}

function toJsonCompatible(value: unknown): unknown {
  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, nested) => {
    if (typeof nested === 'bigint') return nested.toString()
    if (typeof nested === 'function') return `[Function ${nested.name || 'anonymous'}]`
    if (typeof nested === 'symbol') return String(nested)
    if (nested && typeof nested === 'object') {
      if (seen.has(nested)) return '[Circular]'
      seen.add(nested)
    }
    return nested
  })
  if (serialized === undefined) return String(value)
  return JSON.parse(serialized)
}

function buildPageEvaluationExpression(source: string, arg: unknown): string {
  return `(${evaluatePageInBrowser.toString()})(${JSON.stringify({ source, arg })})`
}

function buildTargetEvaluationExpression(
  source: string,
  arg: unknown,
  point: { x: number; y: number },
): string {
  return `(() => {
    const payload = ${JSON.stringify({ source, arg })};
    const point = ${JSON.stringify(point)};
    const el = document.elementFromPoint(point.x, point.y);
    if (!el) throw new Error('No element exists at the target evaluation point.');
    return (${evaluateTargetInBrowser.toString()})(el, payload);
  })()`
}

function buildSelectorEvaluationExpression(
  source: string,
  arg: unknown,
  selector: string,
): string {
  return `(() => {
    const payload = ${JSON.stringify({ source, arg })};
    const selector = ${JSON.stringify(selector)};
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) throw new Error('No element matches selector: ' + selector);
    if (elements.length > 1) throw new Error('Selector is not unique: ' + selector);
    return (${evaluateTargetInBrowser.toString()})(elements[0], payload);
  })()`
}

function buildSelectorProbeExpression(selector: string): string {
  return `(() => {
    try {
      const elements = document.querySelectorAll(${JSON.stringify(selector)});
      if (elements.length === 0) return { status: 'not-found', count: 0 };
      if (elements.length > 1) return { status: 'not-unique', count: elements.length };
      return { status: 'ok', count: 1 };
    } catch (error) {
      return { status: 'invalid', message: error instanceof Error ? error.message : String(error) };
    }
  })()`
}

function buildSelectorBoundsProbeExpression(selector: string): string {
  return `(() => {
    try {
      const elements = document.querySelectorAll(${JSON.stringify(selector)});
      if (elements.length === 0) return { status: 'not-found', count: 0 };
      if (elements.length > 1) return { status: 'not-unique', count: elements.length };
      const rect = elements[0].getBoundingClientRect();
      return {
        status: 'ok',
        count: 1,
        bounds: {
          x: window.scrollX + rect.left,
          y: window.scrollY + rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
    } catch (error) {
      return { status: 'invalid', message: error instanceof Error ? error.message : String(error) };
    }
  })()`
}

function assertUniqueSelectorProbe(
  selector: string,
  probe: SelectorProbeResult | SelectorBoundsProbeResult,
): void {
  if (!probe || typeof probe !== 'object') {
    throw createCommandError('INVALID_TARGET', `invalid selector probe result: ${selector}`, { targetId: selector })
  }
  if (probe.status === 'ok') return
  if (probe.status === 'not-found') {
    throw createCommandError('TARGET_NOT_FOUND', `target not found: ${selector}`, { targetId: selector })
  }
  if (probe.status === 'not-unique') {
    throw createCommandError('INVALID_TARGET', `selector is not unique: ${selector}`, {
      targetId: selector,
      count: probe.count,
    })
  }
  throw createCommandError('INVALID_TARGET', `invalid selector: ${selector}`, {
    targetId: selector,
    reason: probe.message,
  })
}

function buildTargetFocusExpression(point: { x: number; y: number }): string {
  return `(() => {
    const point = ${JSON.stringify(point)};
    const el = document.elementFromPoint(point.x, point.y);
    if (!el) throw new Error('No element exists at the target typing point.');
    const target = el.closest('input, textarea, [contenteditable], select') || el;
    if (typeof target.focus !== 'function') {
      throw new Error('Target element cannot be focused for typing.');
    }
    target.focus({ preventScroll: true });
    return true;
  })()`
}

function buildSelectOptionsExpression(point: { x: number; y: number }, values: string[]): string {
  return `(() => {
    const point = ${JSON.stringify(point)};
    const requested = ${JSON.stringify(values)};
    const el = document.elementFromPoint(point.x, point.y);
    if (!el) throw new Error('No element exists at the target selection point.');
    const select = el.closest('select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Target element is not a select element.');
    }
    if (!select.multiple && requested.length > 1) {
      throw new Error('Cannot select multiple values in a single-select element.');
    }
    const options = Array.from(select.options);
    const missing = requested.filter(value => !options.some(option => option.value === value));
    if (missing.length > 0) {
      throw new Error('Select option value not found: ' + missing.join(', '));
    }
    const selected = new Set(requested);
    for (const option of options) {
      option.selected = selected.has(option.value);
    }
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return Array.from(select.selectedOptions).map(option => option.value);
  })()`
}

type PreparedFillFormField = FillFormField & {
  point: { x: number; y: number }
}

function isFillFormField(field: unknown): field is FillFormField {
  if (!field || typeof field !== 'object' || Array.isArray(field)) return false
  const candidate = field as Partial<FillFormField>
  return (
    (candidate.name === undefined || typeof candidate.name === 'string') &&
    typeof candidate.targetId === 'string' &&
    candidate.targetId.length > 0 &&
    (
      candidate.type === 'textbox' ||
      candidate.type === 'checkbox' ||
      candidate.type === 'radio' ||
      candidate.type === 'combobox' ||
      candidate.type === 'slider'
    ) &&
    (
      typeof candidate.value === 'string' ||
      typeof candidate.value === 'boolean' ||
      typeof candidate.value === 'number'
    )
  )
}

function buildFillFormExpression(fields: PreparedFillFormField[]): string {
  return `(${fillFormInBrowser.toString()})(${JSON.stringify(fields)})`
}

function buildDropExpression(
  point: { x: number; y: number },
  payload: { data: DropData; files: DropFilePayload[] },
): string {
  return `(() => {
    const point = ${JSON.stringify(point)};
    const payload = ${JSON.stringify(payload)};
    const el = document.elementFromPoint(point.x, point.y);
    if (!el) throw new Error('No element exists at the target drop point.');
    return (${dispatchDropInBrowser.toString()})(el, payload);
  })()`
}

async function filePayloadFromPath(path: string): Promise<DropFilePayload> {
  const buffer = await readFile(path)
  return {
    name: basename(path),
    type: mimeTypeForPath(path),
    base64: buffer.toString('base64'),
  }
}

function mimeTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.css':
      return 'text/css'
    case '.csv':
      return 'text/csv'
    case '.gif':
      return 'image/gif'
    case '.htm':
    case '.html':
      return 'text/html'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.js':
    case '.mjs':
      return 'text/javascript'
    case '.json':
      return 'application/json'
    case '.pdf':
      return 'application/pdf'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.txt':
      return 'text/plain'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function isDropData(value: unknown): value is DropData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every(item => typeof item === 'string')
}

async function dispatchDropInBrowser(
  el: Element,
  payload: { data: DropData; files: DropFilePayload[] },
): Promise<void> {
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes.buffer
  }

  const dataTransfer = new DataTransfer()
  for (const [type, value] of Object.entries(payload.data)) {
    dataTransfer.setData(type, value)
  }
  for (const file of payload.files) {
    dataTransfer.items.add(new File([base64ToArrayBuffer(file.base64)], file.name, { type: file.type }))
  }

  const options = {
    bubbles: true,
    cancelable: true,
    dataTransfer,
  }
  el.dispatchEvent(new DragEvent('dragenter', options))
  el.dispatchEvent(new DragEvent('dragover', options))
  el.dispatchEvent(new DragEvent('drop', options))
}

function fillFormInBrowser(
  fields: Array<{
    name?: string
    targetId: string
    type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider'
    value: string | boolean | number
    point: { x: number; y: number }
  }>,
): Array<{ name?: string; targetId: string; type: string }> {
  const completed: Array<{ name?: string; targetId: string; type: string }> = []

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    const el = document.elementFromPoint(field.point.x, field.point.y)
    if (!el) {
      throw new Error(`No element exists at form field ${index} (${field.targetId}).`)
    }

    try {
      applyField(el, field)
      completed.push({
        ...(field.name ? { name: field.name } : {}),
        targetId: field.targetId,
        type: field.type,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fill form field ${field.name ?? field.targetId}: ${message}`)
    }
  }

  return completed

  function applyField(
    el: Element,
    field: {
      type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider'
      value: string | boolean | number
    },
  ): void {
    switch (field.type) {
      case 'textbox': {
        const target = closestOrSelf(el, 'input, textarea, [contenteditable]')
        if (target instanceof HTMLElement && target.isContentEditable) {
          target.focus({ preventScroll: true })
          target.textContent = String(field.value)
          target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(field.value) }))
          return
        }
        if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
          throw new Error('textbox field is not an input, textarea, or contenteditable element')
        }
        setNativeValue(target, String(field.value))
        dispatchInputAndChange(target)
        return
      }
      case 'checkbox':
      case 'radio': {
        const target = closestOrSelf(el, `input[type="${field.type}"]`)
        if (!(target instanceof HTMLInputElement) || target.type !== field.type) {
          throw new Error(`${field.type} field is not an input[type="${field.type}"] element`)
        }
        target.checked = booleanFillFormValue(field.value)
        dispatchInputAndChange(target)
        return
      }
      case 'combobox': {
        const target = closestOrSelf(el, 'select')
        if (!(target instanceof HTMLSelectElement)) {
          throw new Error('combobox field is not a select element')
        }
        const value = String(field.value)
        if (!Array.from(target.options).some(option => option.value === value)) {
          throw new Error(`select option value not found: ${value}`)
        }
        setNativeValue(target, value)
        dispatchInputAndChange(target)
        return
      }
      case 'slider': {
        const target = closestOrSelf(el, 'input[type="range"]')
        if (!(target instanceof HTMLInputElement) || target.type !== 'range') {
          throw new Error('slider field is not an input[type="range"] element')
        }
        setNativeValue(target, String(field.value))
        dispatchInputAndChange(target)
        return
      }
    }
  }

  function closestOrSelf(el: Element, selector: string): Element {
    return el.closest(selector) ?? el
  }

  function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
    const prototype = Object.getPrototypeOf(element) as object
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    if (descriptor?.set) {
      descriptor.set.call(element, value)
    } else {
      element.value = value
    }
  }

  function dispatchInputAndChange(element: Element): void {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function booleanFillFormValue(value: string | boolean | number): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on', 'checked'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off', 'unchecked'].includes(normalized)) return false
    throw new Error('checkbox/radio values must be boolean-like')
  }
}

function evaluatePageInBrowser(payload: { source: string; arg?: unknown }): unknown {
  const source = payload.source.trim()
  try {
    const candidate = new Function(`return (${source})`)()
    if (typeof candidate === 'function') {
      return candidate(payload.arg)
    }
  } catch {
    // Fall back to expression mode below.
  }
  return new Function('arg', `return (${payload.source})`)(payload.arg)
}

function evaluateTargetInBrowser(el: Element, payload: { source: string; arg?: unknown }): unknown {
  const source = payload.source.trim()
  try {
    const candidate = new Function(`return (${source})`)()
    if (typeof candidate === 'function') {
      return candidate(el, payload.arg)
    }
  } catch {
    // Fall back to expression mode below.
  }
  return new Function('el', 'arg', `return (${payload.source})`)(el, payload.arg)
}

function normalizeConsoleLevel(type: string): ConsoleLevel {
  if (type === 'debug') return 'debug'
  if (type === 'warning') return 'warning'
  if (type === 'error' || type === 'assert') return 'error'
  return 'info'
}

function severityForConsoleLevel(level: ConsoleLevel): number {
  switch (level) {
    case 'debug':
      return 10
    case 'info':
      return 20
    case 'warning':
      return 30
    case 'error':
      return 40
  }
}

function consoleTextFromArgs(args: Array<Record<string, unknown>>): string {
  return args.map(remoteObjectText).join(' ')
}

function remoteObjectText(object: Record<string, unknown>): string {
  if ('value' in object) {
    const value = object.value
    if (typeof value === 'string') return value
    if (value === undefined) return 'undefined'
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  if (typeof object.description === 'string') return object.description
  if (typeof object.type === 'string') return object.type
  return ''
}

function exceptionText(
  details?: Record<string, unknown>,
  exception?: Record<string, unknown>,
): string {
  if (typeof exception?.description === 'string') return exception.description
  if ('value' in (exception ?? {})) return remoteObjectText(exception!)
  if (typeof details?.text === 'string') return details.text
  return 'Uncaught exception'
}

function firstCallFrame(stackTrace?: Record<string, unknown>): Record<string, unknown> | null {
  const callFrames = stackTrace?.callFrames
  return Array.isArray(callFrames) && callFrames.length > 0 && typeof callFrames[0] === 'object'
    ? callFrames[0] as Record<string, unknown>
    : null
}

function toNetworkRequestSummary(record: NetworkRequestRecord): NetworkRequestSummary {
  return {
    index: record.index,
    tabId: record.tabId,
    method: record.method,
    url: record.url,
    resourceType: record.resourceType,
    isNavigationRequest: record.isNavigationRequest,
    timestamp: record.timestamp,
    navigationIndex: record.navigationIndex,
    ...(typeof record.status === 'number' ? { status: record.status } : {}),
    ...(record.statusText ? { statusText: record.statusText } : {}),
    ...(record.failureText ? { failureText: record.failureText } : {}),
  }
}

function networkRequestMatches(record: NetworkRequestRecord, query: NetworkRequestsQuery, activeNavigationIndex: number): boolean {
  if (!query.all && record.navigationIndex !== activeNavigationIndex) return false
  if (!query.includeStatic && isSuccessfulStaticRequest(record)) return false
  if (!query.filter) return true
  try {
    return new RegExp(query.filter).test(record.url)
  } catch {
    return record.url.includes(query.filter)
  }
}

function isSuccessfulStaticRequest(record: NetworkRequestRecord): boolean {
  if (typeof record.status !== 'number' || record.status < 200 || record.status >= 400) return false
  return STATIC_RESOURCE_TYPES.has(record.resourceType)
}

function hasNetworkResponse(record: NetworkRequestRecord): boolean {
  return typeof record.status === 'number' && !record.failureText
}

function headersFromUnknown(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const headers: Record<string, string> = {}
  for (const [key, headerValue] of Object.entries(value as Record<string, unknown>)) {
    headers[key.toLowerCase()] = typeof headerValue === 'string' ? headerValue : String(headerValue)
  }
  return headers
}

function normalizeResourceType(type: string): string {
  return type.toLowerCase()
}

function networkRequestKey(sessionId: string, requestId: string): string {
  return `${sessionId}:${requestId}`
}

function toPublicDialog(record: DialogRecord): DialogInfo {
  return {
    id: record.id,
    tabId: record.tabId,
    type: record.type,
    message: record.message,
    ...(typeof record.defaultValue === 'string' ? { defaultValue: record.defaultValue } : {}),
    timestamp: record.timestamp,
    handled: record.handled,
    ...(typeof record.accepted === 'boolean' ? { accepted: record.accepted } : {}),
    ...(typeof record.promptText === 'string' ? { promptText: record.promptText } : {}),
    ...(typeof record.handledTimestamp === 'number' ? { handledTimestamp: record.handledTimestamp } : {}),
    ...(record.error ? { error: record.error } : {}),
  }
}

function removeDialogsForTab(records: DialogRecord[], tabId: number): void {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].tabId === tabId) records.splice(index, 1)
  }
}

function toPublicFileChooser(record: FileChooserRecord): FileChooserInfo {
  return {
    id: record.id,
    tabId: record.tabId,
    timestamp: record.timestamp,
    multiple: record.multiple,
    handled: record.handled,
    ...(record.paths ? { paths: [...record.paths] } : {}),
    ...(typeof record.cancelled === 'boolean' ? { cancelled: record.cancelled } : {}),
    ...(typeof record.handledTimestamp === 'number' ? { handledTimestamp: record.handledTimestamp } : {}),
    ...(record.error ? { error: record.error } : {}),
  }
}

function removeFileChoosersForTab(records: FileChooserRecord[], tabId: number): void {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].tabId === tabId) records.splice(index, 1)
  }
}

const STATIC_RESOURCE_TYPES = new Set(['font', 'image', 'media', 'script', 'stylesheet'])

async function resolveCdpWsEndpoint(endpoint: string): Promise<string> {
  if (endpoint.startsWith('ws://') || endpoint.startsWith('wss://')) {
    return endpoint
  }

  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    throw new Error(`Unsupported CDP attach endpoint: ${endpoint}`)
  }

  const versionUrl = new URL('/json/version', endpoint.endsWith('/') ? endpoint : `${endpoint}/`)
  const response = await fetch(versionUrl)
  if (!response.ok) {
    throw new Error(`Failed to resolve CDP websocket endpoint from ${versionUrl}: HTTP ${response.status}`)
  }

  const json = await response.json() as { webSocketDebuggerUrl?: unknown }
  if (typeof json.webSocketDebuggerUrl !== 'string') {
    throw new Error(`CDP version response did not include webSocketDebuggerUrl: ${versionUrl}`)
  }

  return json.webSocketDebuggerUrl
}
