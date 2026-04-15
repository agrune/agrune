import type {
  AgruneRuntimeConfig,
  BrowserDriver,
  CommandResult,
  PageSnapshot,
  Session,
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

const ENSURE_READY_TIMEOUT_MS = 10_000
const ACTIVITY_TAIL_BLOCK_MS = 5_000

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
  private connectPromise: Promise<void> | null = null
  private commandCounter = 0
  private bindingsRegistered = false
  private readonly handleBindingCalled: CdpEventCallback
  private readonly handleDragIntercepted: CdpEventCallback

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

    this.targetManager.onTargetCreated((target) => {
      this.sessions.openSession(target.tabId, target.url, target.title)
      this.sessionOpenCbs.forEach(cb => cb(this.toSession(target.tabId)))
      this.runBackgroundTask(this.prepareTarget(target))
    })

    this.targetManager.onTargetInfoChanged((target) => {
      this.sessions.openSession(target.tabId, target.url, target.title)
      this.runBackgroundTask(this.prepareTarget(target))
    })

    this.targetManager.onTargetDestroyed((target) => {
      this.sessions.closeSession(target.tabId)
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
    this.targetManager.stop()
    this.preparedSessions.clear()
    this.unregisterBindings()
    this.sessions.clear()
    await this.connection.disconnect()
    if (this.options.mode === 'launch') {
      await this.launcher.kill()
    }
  }

  isConnected(): boolean {
    return this.connection.isConnected()
  }

  listSessions(): Session[] {
    return this.sessions.getSessions().map(session => ({
      tabId: session.tabId,
      url: session.url,
      title: session.title,
      hasSnapshot: session.snapshot !== null,
      snapshotVersion: session.snapshot?.version ?? null,
    }))
  }

  getSnapshot(tabId: number): PageSnapshot | null {
    return this.sessions.getSnapshot(tabId)
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
        await this.setAgentActivity(target.sessionId, true)
        const result = await this.evaluateInSession<CommandResult>(
          target.sessionId,
          `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}].handleCommand(${JSON.stringify(command.kind)}, ${JSON.stringify(payload)})`,
        )
        return result
      } catch (error) {
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

    const sessions = this.sessions.getSessions()
    const ready = sessions.find(session => session.snapshot !== null)
    return ready?.tabId ?? sessions[0]?.tabId ?? null
  }

  private async doConnect(): Promise<void> {
    const wsEndpoint = await this.resolveWsEndpoint()
    await this.connection.connect(wsEndpoint)
    this.registerBindings()
    await this.targetManager.start(this.connection)
  }

  private async resolveWsEndpoint(): Promise<string> {
    if (this.options.mode === 'attach') {
      if (!this.options.wsEndpoint) {
        throw new Error('CDP attach mode requires a wsEndpoint.')
      }
      return this.options.wsEndpoint
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
  }

  private unregisterBindings(): void {
    if (!this.bindingsRegistered) return
    this.bindingsRegistered = false
    this.connection.off('Runtime.bindingCalled', this.handleBindingCalled)
    this.connection.off('Input.dragIntercepted', this.handleDragIntercepted)
  }

  private async prepareTarget(target: TargetInfo): Promise<void> {
    if (!target.sessionId || this.preparedSessions.has(target.sessionId)) return

    this.preparedSessions.add(target.sessionId)
    const injector = new CdpRuntimeInjector(this.connection)

    try {
      await injector.prepareSession(target.sessionId)
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
        error.message === 'CDP connection is not open.'
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
