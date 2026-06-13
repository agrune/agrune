import type { Browser, BrowserContext, ConsoleMessage, Dialog as PlaywrightDialog, FileChooser as PlaywrightFileChooser, Locator, Page, Request as PlaywrightRequest, Response as PlaywrightResponse } from 'playwright'
import { chromium } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import type { FillStrategy, PageSnapshot } from '@agrune/core'
import {
  REPEATED_TARGET_KEY_DELIMITER,
  normalizeAgentTargetId,
} from '@agrune/core'
import type { AgruneManifest, ManifestGroup, ManifestRepeat, ManifestTarget } from '@agrune/manifest'
import { CliError } from './errors.js'
import { loadManifestFromPage, routeApplies } from './manifest-loader.js'
import { resolveLocator } from './locator.js'
import { buildSnapshotFromManifest, createSnapshotStore, type SnapshotStore } from './snapshot.js'
import type { ClickButton, ClickModifier, ConsoleLevel, ConsoleMessageEntry, DialogInfo, FileChooserInfo, FillFormField, NetworkRequestPart, NetworkRequestSummary, PublicTab } from './types.js'

export type PlaywrightConnection =
  | { mode: 'launch'; headless?: boolean }
  | { mode: 'persistent'; userDataDir: string; headless?: boolean; channel?: string }
  | { mode: 'attach'; endpoint: string }

export interface PlaywrightSessionOptions {
  headless?: boolean
  connection?: PlaywrightConnection
}

interface ManagedPage {
  tabId: number
  page: Page
  title: string
  snapshotStore: SnapshotStore
  navigationIndex: number
  consoleMessages: ConsoleMessageEntry[]
  networkRequests: InternalNetworkRequest[]
  networkByRequest: Map<PlaywrightRequest, InternalNetworkRequest>
  dialogs: DialogInfo[]
  pendingDialogs: Map<number, PlaywrightDialog>
  dialogWaiters: DialogWaiter[]
  dialogActions: Map<number, Promise<unknown>>
  fileChoosers: FileChooserInfo[]
  pendingFileChoosers: Map<number, PlaywrightFileChooser>
  fileChooserWaiters: FileChooserWaiter[]
  fileChooserActions: Map<number, Promise<unknown>>
}

type SelectOptionInput = { value?: string; label?: string; index?: number }
type ConsoleQuery = { level?: ConsoleLevel; all?: boolean }
type NetworkQuery = { filter?: string; includeStatic?: boolean; all?: boolean }
type DialogAction = { accept: boolean; promptText?: string }
type ClickOptions = { button?: ClickButton; modifiers?: ClickModifier[]; doubleClick?: boolean }
type DialogWaiter = {
  afterId: number
  resolve(dialog: DialogInfo): void
}
type FileChooserWaiter = {
  afterId: number
  resolve(fileChooser: FileChooserInfo): void
}
type DropData = Record<string, string>
type DropFilePayload = {
  name: string
  type: string
  base64: string
}
type ScreenshotType = 'png' | 'jpeg'
type AriaSnapshotMode = 'ai' | 'default'
type NetworkDetail =
  | {
      request: NetworkRequestSummary
      requestHeaders: Record<string, string>
      requestBody: string | null
      responseHeaders: Record<string, string>
      responseBody: string | null
    }
  | {
      request: NetworkRequestSummary
      part: NetworkRequestPart
      value: string | Record<string, string> | null
    }

interface InternalNetworkRequest {
  index: number
  tabId: number
  method: string
  url: string
  resourceType: string
  isNavigationRequest: boolean
  timestamp: number
  navigationIndex: number
  request: PlaywrightRequest
  response?: PlaywrightResponse
  status?: number
  statusText?: string
  failureText?: string
}

export class PlaywrightSession {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private readonly pages = new Map<number, ManagedPage>()
  private activeTabId: number | null = null
  private nextTabId = 1

  constructor(private readonly options: PlaywrightSessionOptions = {}) {}

  async start(): Promise<void> {
    if (this.context) return
    const connection: PlaywrightConnection =
      this.options.connection ?? { mode: 'launch', headless: this.options.headless ?? false }

    if (connection.mode === 'persistent') {
      this.context = await chromium.launchPersistentContext(connection.userDataDir, {
        headless: connection.headless ?? false,
        ...(connection.channel ? { channel: connection.channel } : {}),
      })
    } else if (connection.mode === 'attach') {
      this.browser = await chromium.connectOverCDP(connection.endpoint)
      this.context = this.browser.contexts()[0] ?? await this.browser.newContext()
    } else {
      this.browser = await chromium.launch({ headless: connection.headless ?? false })
      this.context = await this.browser.newContext()
    }

    this.context.on('page', page => {
      this.registerPage(page)
    })
    for (const page of this.context.pages()) {
      this.registerPage(page)
    }
  }

  async stop(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined)
    } else {
      await this.context?.close().catch(() => undefined)
    }
    this.browser = null
    this.context = null
    this.pages.clear()
    this.activeTabId = null
  }

  listTabs(): PublicTab[] {
    return [...this.pages.values()].map((entry, index) => ({
      index,
      tabId: entry.tabId,
      url: entry.page.url(),
      title: entry.title,
      active: entry.tabId === this.activeTabId,
      hasSnapshot: entry.snapshotStore.version > 0,
      snapshotVersion: entry.snapshotStore.version === 0 ? null : entry.snapshotStore.version,
    }))
  }

  /** Playwright `Page` for a tab — used by the driver for low-level pointer input and by tests. */
  page(tabId?: number): Page {
    return this.requireTab(this.resolveTabId(tabId)).page
  }

  /**
   * Install the visual-effects bundle into the context (future documents) and
   * best-effort into already-open pages. Decoration only — failures are ignored.
   */
  async installVisualRuntime(installExpression: string): Promise<void> {
    const context = this.requireContext()
    await context.addInitScript(installExpression).catch(() => undefined)
    await Promise.all(
      [...this.pages.values()].map(entry =>
        entry.page.evaluate(installExpression).catch(() => undefined),
      ),
    )
  }

  /** Best-effort evaluate on every open page (visual config broadcast). */
  broadcastEvaluate(expression: string): void {
    for (const entry of this.pages.values()) {
      void entry.page.evaluate(expression).catch(() => undefined)
    }
  }

  /** Resolve a manifest target ref to its Playwright locator. */
  async locatorForTarget(tabId: number | undefined, targetRef: string): Promise<Locator> {
    return this.resolveTargetLocator(this.resolveTabId(tabId), targetRef)
  }

  async open(url: string): Promise<PublicTab> {
    await this.start()
    const context = this.requireContext()
    const page = await context.newPage()
    const entry = this.registerPage(page)
    await page.goto(url)
    this.activeTabId = entry.tabId
    return this.afterNavigation(entry)
  }

  async focus(tabId: number): Promise<PublicTab> {
    const entry = this.requireTab(tabId)
    await entry.page.bringToFront()
    this.activeTabId = tabId
    return this.publicTab(entry)
  }

  async close(tabId?: number): Promise<{ closedTabId: number; tabs: PublicTab[] }> {
    const resolvedTabId = this.resolveTabId(tabId)
    const entry = this.requireTab(resolvedTabId)
    await entry.page.close()
    this.pages.delete(resolvedTabId)
    if (this.activeTabId === resolvedTabId) {
      this.activeTabId = this.pages.keys().next().value ?? null
    }
    return {
      closedTabId: resolvedTabId,
      tabs: this.listTabs(),
    }
  }

  async navigate(tabId: number | undefined, url: string): Promise<PublicTab> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    await entry.page.goto(url)
    this.activeTabId = entry.tabId
    return this.afterNavigation(entry)
  }

  async back(tabId?: number): Promise<PublicTab> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    await entry.page.goBack()
    this.activeTabId = entry.tabId
    return this.afterNavigation(entry)
  }

  async forward(tabId?: number): Promise<PublicTab> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    await entry.page.goForward()
    this.activeTabId = entry.tabId
    return this.afterNavigation(entry)
  }

  async reload(tabId?: number): Promise<PublicTab> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    await entry.page.reload()
    this.activeTabId = entry.tabId
    return this.afterNavigation(entry)
  }

  async resize(tabId: number | undefined, width: number, height: number): Promise<{ tabId: number; width: number; height: number }> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    await entry.page.setViewportSize({ width, height })
    this.activeTabId = entry.tabId
    return { tabId: entry.tabId, width, height }
  }

  async evaluate(
    tabId: number | undefined,
    source: string,
    arg: unknown,
    targetRef?: string,
  ): Promise<unknown> {
    const resolvedTabId = this.resolveTabId(tabId)
    if (targetRef) {
      const locator = await this.resolveTargetOrSelectorLocator(resolvedTabId, targetRef)
      return locator.evaluate(evaluateTargetInBrowser, { source, arg })
    }
    const entry = this.requireTab(resolvedTabId)
    return entry.page.evaluate(evaluatePageInBrowser, { source, arg })
  }

  async runCodeUnsafe(tabId: number | undefined, source: string): Promise<unknown> {
    if (typeof source !== 'string' || source.trim().length === 0) {
      throw new CliError('INVALID_COMMAND', 'run-code-unsafe requires non-empty code.')
    }
    const entry = this.requireTab(this.resolveTabId(tabId))
    const fn = compileRunCodeUnsafeFunction(source)
    await entry.page.bringToFront().catch(() => undefined)
    this.activeTabId = entry.tabId
    const result = await fn(entry.page)
    return result === undefined ? undefined : toJsonCompatible(result)
  }

  consoleMessages(tabId: number | undefined, query: ConsoleQuery = {}): ConsoleMessageEntry[] {
    const entry = this.requireTab(this.resolveTabId(tabId))
    const minSeverity = severityForConsoleLevel(query.level ?? 'info')
    return entry.consoleMessages.filter(message => {
      if (!query.all && message.navigationIndex !== entry.navigationIndex) return false
      return severityForConsoleLevel(message.level) >= minSeverity
    })
  }

  networkRequests(tabId: number | undefined, query: NetworkQuery = {}): NetworkRequestSummary[] {
    const entry = this.requireTab(this.resolveTabId(tabId))
    return entry.networkRequests
      .filter(request => networkRequestMatches(request, query, entry.navigationIndex))
      .map(toNetworkRequestSummary)
  }

  async networkRequestDetail(
    tabId: number | undefined,
    index: number,
    part?: NetworkRequestPart,
  ): Promise<NetworkDetail> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    const record = entry.networkRequests.find(request => request.index === index)
    if (!record) {
      throw new CliError('NETWORK_REQUEST_NOT_FOUND', `Network request not found: ${index}`, { index })
    }
    const summary = toNetworkRequestSummary(record)
    if (part) {
      return {
        request: summary,
        part,
        value: await networkRequestPartValue(record, part),
      }
    }
    return {
      request: summary,
      requestHeaders: record.request.headers(),
      requestBody: record.request.postData(),
      responseHeaders: record.response?.headers() ?? {},
      responseBody: record.response ? await responseText(record.response) : null,
    }
  }

  dialogs(tabId: number | undefined): DialogInfo[] {
    const entry = this.requireTab(this.resolveTabId(tabId))
    return entry.dialogs.map(dialog => ({ ...dialog }))
  }

  fileChoosers(tabId: number | undefined): FileChooserInfo[] {
    const entry = this.requireTab(this.resolveTabId(tabId))
    return entry.fileChoosers.map(fileChooser => ({ ...fileChooser }))
  }

  async handleDialog(
    tabId: number | undefined,
    action: DialogAction,
  ): Promise<{ armed: boolean; dialog?: DialogInfo }> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    const pending = firstPendingDialog(entry)
    if (!pending) {
      throw new CliError('DIALOG_NOT_FOUND', 'No pending dialog is available to handle.')
    }

    entry.pendingDialogs.delete(pending.record.id)
    await applyDialogAction(pending.dialog, pending.record, action)
    const actionPromise = entry.dialogActions.get(pending.record.id)
    entry.dialogActions.delete(pending.record.id)
    if (actionPromise) {
      await actionPromise.catch(() => undefined)
    }
    return {
      armed: false,
      dialog: { ...pending.record },
    }
  }

  async uploadToFileChooser(
    tabId: number | undefined,
    paths: string[],
  ): Promise<{ paths: string[]; cancelled: boolean; fileChooser: FileChooserInfo }> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    const pending = firstPendingFileChooser(entry)
    if (!pending) {
      throw new CliError('FILE_CHOOSER_NOT_FOUND', 'No pending file chooser is available to upload to.')
    }

    const absolutePaths = paths.map(path => resolve(path))
    try {
      await pending.fileChooser.setFiles(absolutePaths)
      entry.pendingFileChoosers.delete(pending.record.id)
      pending.record.paths = absolutePaths
      pending.record.cancelled = absolutePaths.length === 0
      pending.record.handled = true
      pending.record.handledTimestamp = Date.now()
      const actionPromise = entry.fileChooserActions.get(pending.record.id)
      entry.fileChooserActions.delete(pending.record.id)
      if (actionPromise) {
        await actionPromise.catch(() => undefined)
      }
    } catch (error) {
      pending.record.error = error instanceof Error ? error.message : String(error)
      throw error
    }

    return {
      paths: absolutePaths,
      cancelled: absolutePaths.length === 0,
      fileChooser: { ...pending.record },
    }
  }

  async snapshot(
    tabId?: number,
    options: { allowMissingManifest?: boolean } = {},
  ): Promise<PageSnapshot> {
    return this.refreshSnapshot(this.resolveTabId(tabId), options)
  }

  async ariaSnapshot(
    tabId: number | undefined,
    options: { targetRef?: string; depth?: number; mode?: AriaSnapshotMode } = {},
  ): Promise<string> {
    const resolvedTabId = this.resolveTabId(tabId)
    const snapshotOptions = {
      mode: options.mode ?? 'ai',
      ...(typeof options.depth === 'number' ? { depth: options.depth } : {}),
    }
    if (options.targetRef) {
      const locator = await this.resolveTargetLocator(resolvedTabId, options.targetRef)
      return locator.ariaSnapshot(snapshotOptions)
    }
    const entry = this.requireTab(resolvedTabId)
    return entry.page.ariaSnapshot(snapshotOptions)
  }

  async click(
    tabId: number | undefined,
    targetRef: string,
    action = 'click',
    options: ClickOptions = {},
  ): Promise<{ dialog?: DialogInfo; fileChooser?: FileChooserInfo }> {
    const resolvedTabId = this.resolveTabId(tabId)
    const entry = this.requireTab(resolvedTabId)
    const locator = await this.resolveTargetLocator(resolvedTabId, targetRef)
    const clickOptions = {
      ...(options.button ? { button: options.button } : {}),
      ...(options.modifiers ? { modifiers: options.modifiers } : {}),
    }
    return this.runActionWithInterruptions(entry, async () => {
      switch (action) {
        case 'click':
          if (options.doubleClick) {
            await locator.dblclick(clickOptions)
          } else {
            await locator.click(clickOptions)
          }
          return
        case 'dblclick':
          await locator.dblclick(clickOptions)
          return
        case 'contextmenu':
          await locator.click({ ...clickOptions, button: 'right' })
          return
        case 'hover':
          await locator.hover()
          return
        case 'longpress':
          await locator.click({ delay: 650 })
          return
        default:
          throw new CliError('INVALID_COMMAND', `Unsupported click action: ${action}`, { action })
      }
    }, action === 'click')
  }

  async fill(
    tabId: number | undefined,
    targetRef: string,
    value: string,
    clear = true,
    strategy: FillStrategy = 'auto',
  ): Promise<FillStrategy> {
    const locator = await this.resolveTargetLocator(this.resolveTabId(tabId), targetRef)
    const effectiveStrategy = strategy === 'auto' && await shouldUseKeystrokeFill(locator)
      ? 'keystroke'
      : strategy === 'auto'
        ? 'insert'
        : strategy
    if (effectiveStrategy === 'keystroke') {
      await fillWithKeystrokes(locator, value, clear)
      return effectiveStrategy
    }
    if (clear) {
      await locator.fill(value)
      return effectiveStrategy
    }
    const current = await locator.inputValue().catch(() => '')
    await locator.fill(`${current}${value}`)
    return effectiveStrategy
  }

  async fillForm(tabId: number | undefined, fields: FillFormField[]): Promise<void> {
    const resolvedTabId = this.resolveTabId(tabId)
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index]
      try {
        const locator = await this.resolveTargetLocator(resolvedTabId, field.target)
        await applyFillFormField(locator, field)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new CliError('FIELD_FAILED', `Failed to fill form field ${field.name ?? field.target}: ${message}`, {
          index,
          name: field.name,
          target: field.target,
          type: field.type,
        })
      }
    }
  }

  async type(
    tabId: number | undefined,
    targetRef: string,
    text: string,
    delayMs?: number,
    submit = false,
  ): Promise<void> {
    const locator = await this.resolveTargetLocator(this.resolveTabId(tabId), targetRef)
    await locator.pressSequentially(text, typeof delayMs === 'number' ? { delay: delayMs } : undefined)
    if (submit) {
      await locator.press('Enter')
    }
  }

  async press(
    tabId: number | undefined,
    key: string,
    targetRef?: string,
    delayMs?: number,
  ): Promise<void> {
    const resolvedTabId = this.resolveTabId(tabId)
    const options = typeof delayMs === 'number' ? { delay: delayMs } : undefined
    if (targetRef) {
      const locator = await this.resolveTargetLocator(resolvedTabId, targetRef)
      await locator.press(key, options)
      return
    }
    const entry = this.requireTab(resolvedTabId)
    await entry.page.keyboard.press(key, options)
  }

  async select(
    tabId: number | undefined,
    targetRef: string,
    values: SelectOptionInput[],
  ): Promise<string[]> {
    const locator = await this.resolveTargetLocator(this.resolveTabId(tabId), targetRef)
    return locator.selectOption(values)
  }

  async upload(
    tabId: number | undefined,
    targetRef: string,
    paths: string[],
  ): Promise<string[]> {
    const locator = await this.resolveTargetLocator(this.resolveTabId(tabId), targetRef)
    const absolutePaths = paths.map(path => resolve(path))
    await locator.setInputFiles(absolutePaths)
    return absolutePaths
  }

  async drop(
    tabId: number | undefined,
    targetRef: string,
    data: DropData,
    paths: string[],
  ): Promise<{ paths: string[]; dataTypes: string[] }> {
    const locator = await this.resolveTargetLocator(this.resolveTabId(tabId), targetRef)
    const absolutePaths = paths.map(path => resolve(path))
    const files = await Promise.all(absolutePaths.map(path => filePayloadFromPath(path)))
    await locator.evaluate(dispatchDropInBrowser, { data, files })
    return {
      paths: absolutePaths,
      dataTypes: Object.keys(data),
    }
  }

  async drag(
    tabId: number | undefined,
    sourceRef: string,
    destinationRef: string,
  ): Promise<void> {
    const resolvedTabId = this.resolveTabId(tabId)
    const source = await this.resolveTargetLocator(resolvedTabId, sourceRef)
    const destination = await this.resolveTargetLocator(resolvedTabId, destinationRef)
    await source.dragTo(destination)
  }

  async read(tabId?: number): Promise<string> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    return entry.page.locator('body').innerText()
  }

  async waitForTarget(
    tabId: number | undefined,
    targetRef: string,
    state: 'visible' | 'hidden' | 'enabled' | 'disabled',
    timeoutMs = 10_000,
  ): Promise<void> {
    const locator = await this.resolveTargetLocator(this.resolveTabId(tabId), targetRef)
    if (state === 'visible' || state === 'hidden') {
      await locator.waitFor({ state, timeout: timeoutMs })
      return
    }
    await pollUntil(
      async () => state === 'enabled' ? locator.isEnabled() : !(await locator.isEnabled()),
      timeoutMs,
    )
  }

  async waitForText(
    tabId: number | undefined,
    text: string,
    state: 'visible' | 'hidden',
    timeoutMs = 10_000,
  ): Promise<void> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    await entry.page.getByText(text).waitFor({ state, timeout: timeoutMs })
  }

  async waitForTime(tabId: number | undefined, timeMs: number): Promise<void> {
    const entry = this.requireTab(this.resolveTabId(tabId))
    await entry.page.waitForTimeout(timeMs)
  }

  async screenshot(
    tabId: number | undefined,
    path: string,
    options: { fullPage?: boolean; targetRef?: string; type?: ScreenshotType } = {},
  ): Promise<string> {
    if (options.targetRef && options.fullPage) {
      throw new CliError('INVALID_COMMAND', 'Element screenshots cannot use fullPage.')
    }
    const resolvedTabId = this.resolveTabId(tabId)
    const entry = this.requireTab(resolvedTabId)
    const absolutePath = resolve(path)
    await mkdir(dirname(absolutePath), { recursive: true })
    if (options.targetRef) {
      const locator = await this.resolveTargetOrSelectorLocator(resolvedTabId, options.targetRef)
      await locator.screenshot({ path: absolutePath, type: options.type })
      return absolutePath
    }
    await entry.page.screenshot({ path: absolutePath, fullPage: options.fullPage === true, type: options.type })
    return absolutePath
  }

  private registerPage(page: Page): ManagedPage {
    for (const existing of this.pages.values()) {
      if (existing.page === page) return existing
    }

    const entry: ManagedPage = {
      tabId: this.nextTabId,
      page,
      title: '',
      snapshotStore: createSnapshotStore(),
      navigationIndex: 0,
      consoleMessages: [],
      networkRequests: [],
      networkByRequest: new Map(),
      dialogs: [],
      pendingDialogs: new Map(),
      dialogWaiters: [],
      dialogActions: new Map(),
      fileChoosers: [],
      pendingFileChoosers: new Map(),
      fileChooserWaiters: [],
      fileChooserActions: new Map(),
    }
    this.nextTabId += 1
    this.pages.set(entry.tabId, entry)
    this.activeTabId = entry.tabId
    page.on('close', () => {
      this.pages.delete(entry.tabId)
      if (this.activeTabId === entry.tabId) {
        this.activeTabId = this.pages.keys().next().value ?? null
      }
    })
    const updateTitle = () => {
      page.title().then(title => {
        entry.title = title
      }).catch(() => undefined)
    }
    updateTitle()
    page.on('load', updateTitle)
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        entry.navigationIndex += 1
        updateTitle()
      }
    })
    page.on('console', message => {
      entry.consoleMessages.push(toConsoleMessageEntry(entry, message))
    })
    page.on('pageerror', error => {
      entry.consoleMessages.push(toPageErrorConsoleEntry(entry, error))
    })
    page.on('request', request => {
      const record: InternalNetworkRequest = {
        index: entry.networkRequests.length + 1,
        tabId: entry.tabId,
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        isNavigationRequest: request.isNavigationRequest(),
        timestamp: Date.now(),
        navigationIndex: navigationIndexForRequest(entry, page, request),
        request,
      }
      entry.networkRequests.push(record)
      entry.networkByRequest.set(request, record)
    })
    page.on('response', response => {
      const record = entry.networkByRequest.get(response.request())
      if (!record) return
      record.response = response
      record.status = response.status()
      record.statusText = response.statusText()
    })
    page.on('requestfailed', request => {
      const record = entry.networkByRequest.get(request)
      if (!record) return
      record.failureText = request.failure()?.errorText ?? 'Request failed'
    })
    page.on('dialog', dialog => {
      void this.handlePageDialog(entry, dialog)
    })
    page.on('filechooser', fileChooser => {
      this.handlePageFileChooser(entry, fileChooser)
    })
    return entry
  }

  private async handlePageDialog(entry: ManagedPage, dialog: PlaywrightDialog): Promise<void> {
    const record: DialogInfo = {
      id: entry.dialogs.length + 1,
      tabId: entry.tabId,
      type: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue(),
      timestamp: Date.now(),
      handled: false,
    }
    entry.dialogs.push(record)
    entry.pendingDialogs.set(record.id, dialog)
    notifyDialogWaiters(entry, record)
  }

  private waitForNextDialog(entry: ManagedPage): { promise: Promise<DialogInfo>; cancel(): void } {
    const afterId = entry.dialogs.length
    let waiter: DialogWaiter | null = null
    const promise = new Promise<DialogInfo>(resolve => {
      waiter = { afterId, resolve }
      entry.dialogWaiters.push(waiter)
    })
    return {
      promise,
      cancel() {
        if (!waiter) return
        entry.dialogWaiters = entry.dialogWaiters.filter(candidate => candidate !== waiter)
      },
    }
  }

  private handlePageFileChooser(entry: ManagedPage, fileChooser: PlaywrightFileChooser): FileChooserInfo {
    for (const [id, pending] of entry.pendingFileChoosers) {
      if (pending !== fileChooser) continue
      const existing = entry.fileChoosers.find(record => record.id === id)
      if (existing) return existing
    }
    const record: FileChooserInfo = {
      id: entry.fileChoosers.length + 1,
      tabId: entry.tabId,
      timestamp: Date.now(),
      multiple: fileChooser.isMultiple(),
      handled: false,
    }
    entry.fileChoosers.push(record)
    entry.pendingFileChoosers.set(record.id, fileChooser)
    notifyFileChooserWaiters(entry, record)
    return record
  }

  private waitForNextFileChooser(entry: ManagedPage): { promise: Promise<FileChooserInfo>; cancel(): void } {
    const afterId = entry.fileChoosers.length
    let waiter: FileChooserWaiter | null = null
    const promise = new Promise<FileChooserInfo>(resolve => {
      waiter = { afterId, resolve }
      entry.fileChooserWaiters.push(waiter)
    })
    return {
      promise,
      cancel() {
        if (!waiter) return
        entry.fileChooserWaiters = entry.fileChooserWaiters.filter(candidate => candidate !== waiter)
      },
    }
  }

  private async runActionWithInterruptions(
    entry: ManagedPage,
    action: () => Promise<void>,
    watchFileChooser = false,
  ): Promise<{ dialog?: DialogInfo; fileChooser?: FileChooserInfo }> {
    const dialogAfterId = entry.dialogs.length
    const fileChooserAfterId = entry.fileChoosers.length
    const dialogWaiter = this.waitForNextDialog(entry)
    const fileChooserWaiter = this.waitForNextFileChooser(entry)
    const playwrightFileChooser = watchFileChooser
      ? entry.page.waitForEvent('filechooser', { timeout: 250 }).then(
        fileChooser => this.handlePageFileChooser(entry, fileChooser),
        () => null,
      )
      : Promise.resolve(null)
    const actionPromise = action()
    const settled = actionPromise.then(
      () => ({ kind: 'done' as const }),
      error => ({ kind: 'error' as const, error }),
    )
    const dialogResult = dialogWaiter.promise.then(dialog => ({ kind: 'dialog' as const, dialog }))
    const fileChooserResult = fileChooserWaiter.promise.then(fileChooser => ({ kind: 'fileChooser' as const, fileChooser }))
    const explicitFileChooserResult = playwrightFileChooser.then(fileChooser => (
      fileChooser
        ? { kind: 'fileChooser' as const, fileChooser }
        : new Promise<never>(() => undefined)
    ))
    const winner = await Promise.race([settled, dialogResult, fileChooserResult, explicitFileChooserResult])
    dialogWaiter.cancel()
    fileChooserWaiter.cancel()

    if (winner.kind === 'dialog') {
      entry.dialogActions.set(winner.dialog.id, actionPromise.catch(() => undefined))
      return { dialog: { ...winner.dialog } }
    }
    if (winner.kind === 'fileChooser') {
      entry.fileChooserActions.set(winner.fileChooser.id, actionPromise.catch(() => undefined))
      return { fileChooser: { ...winner.fileChooser } }
    }
    if (winner.kind === 'error') {
      throw winner.error
    }
    const explicitFileChooser = await playwrightFileChooser
    if (explicitFileChooser && explicitFileChooser.id > fileChooserAfterId && !explicitFileChooser.handled) {
      return { fileChooser: { ...explicitFileChooser } }
    }
    const dialog = latestRecordAfter(entry.dialogs, dialogAfterId)
    if (dialog && !dialog.handled) {
      return { dialog: { ...dialog } }
    }
    const fileChooser = latestRecordAfter(entry.fileChoosers, fileChooserAfterId)
    if (fileChooser && !fileChooser.handled) {
      return { fileChooser: { ...fileChooser } }
    }
    return {}
  }

  private async refreshSnapshot(
    tabId: number,
    options: { allowMissingManifest?: boolean } = {},
  ): Promise<PageSnapshot> {
    const entry = this.requireTab(tabId)
    let manifest: AgruneManifest
    try {
      manifest = await loadManifestFromPage(entry.page)
    } catch (error) {
      // Idle-manifest fallback (runtime bootstrap parity): pages without an
      // Agrune manifest still produce an empty, versioned snapshot.
      if (
        options.allowMissingManifest === true &&
        error instanceof CliError &&
        error.code === 'MANIFEST_NOT_FOUND'
      ) {
        manifest = { version: 3, groups: [] }
      } else {
        throw error
      }
    }
    return buildSnapshotFromManifest(entry.page, manifest, entry.snapshotStore)
  }

  private async resolveTargetLocator(tabId: number, targetRef: string): Promise<Locator> {
    const entry = this.requireTab(tabId)
    const manifest = await loadManifestFromPage(entry.page)
    const normalized = normalizeAgentTargetId(targetRef)
    const found = await findTargetLocator(entry.page, manifest, normalized)
    if (!found) {
      const manifestTarget = manifestDeclaresTarget(manifest, normalized, entry.page.url())
      throw new CliError('TARGET_NOT_FOUND', `Target not found: ${targetRef}`, {
        target: targetRef,
        manifestTarget,
        reason: manifestTarget ? 'selector-unresolved' : 'not-declared',
      })
    }
    return found
  }

  private async resolveTargetOrSelectorLocator(tabId: number, targetRef: string): Promise<Locator> {
    const entry = this.requireTab(tabId)
    const manifest = await loadManifestFromPage(entry.page)
    let targetError: unknown
    try {
      const normalizedTargetRef = normalizeAgentTargetId(targetRef)
      const found = await findTargetLocator(entry.page, manifest, normalizedTargetRef)
      if (found) return found
      if (manifestDeclaresTarget(manifest, normalizedTargetRef, entry.page.url())) {
        throw new CliError('TARGET_NOT_FOUND', `Target not found: ${targetRef}`, {
          target: targetRef,
          manifestTarget: true,
          reason: 'selector-unresolved',
        })
      }
    } catch (error) {
      targetError = error
      if (error instanceof CliError && error.details?.manifestTarget === true) {
        throw error
      }
    }

    const selector = targetRef.trim()
    if (selector.length === 0) {
      throw targetError instanceof CliError
        ? targetError
        : new CliError('INVALID_TARGET', 'Target selector must be non-empty.', { target: targetRef })
    }

    try {
      const locator = entry.page.locator(selector)
      const count = await locator.count()
      if (count === 1) return locator
      if (count > 1) {
        throw new CliError('INVALID_TARGET', `Selector is not unique: ${targetRef}`, { target: targetRef, count })
      }
    } catch (error) {
      if (error instanceof CliError) throw error
      if (!(targetError instanceof CliError)) {
        const message = error instanceof Error ? error.message : String(error)
        throw new CliError('INVALID_TARGET', `Invalid target selector: ${targetRef}`, { target: targetRef, reason: message })
      }
    }

    if (targetError instanceof CliError) throw targetError
    if (targetError instanceof Error) {
      throw new CliError('INVALID_TARGET', targetError.message, { target: targetRef })
    }
    throw new CliError('TARGET_NOT_FOUND', `Target not found: ${targetRef}`, { target: targetRef })
  }

  private resolveTabId(tabId?: number): number {
    if (typeof tabId === 'number') return tabId
    if (this.activeTabId !== null) return this.activeTabId
    const first = this.pages.keys().next().value
    if (typeof first === 'number') return first
    throw new CliError('SESSION_NOT_ACTIVE', 'No active browser tabs. Run "agrune open <url>" first.')
  }

  private requireTab(tabId: number): ManagedPage {
    const entry = this.pages.get(tabId)
    if (!entry) {
      throw new CliError('TAB_NOT_FOUND', `No tab exists for tabId ${tabId}.`, { tabId })
    }
    return entry
  }

  private requireContext(): BrowserContext {
    if (!this.context) {
      throw new CliError('SESSION_NOT_ACTIVE', 'Playwright context is not ready.')
    }
    return this.context
  }

  private async publicTab(entry: ManagedPage): Promise<PublicTab> {
    return {
      index: this.tabIndex(entry.tabId) ?? 0,
      tabId: entry.tabId,
      url: entry.page.url(),
      title: await entry.page.title().catch(() => ''),
      active: entry.tabId === this.activeTabId,
      hasSnapshot: entry.snapshotStore.version > 0,
      snapshotVersion: entry.snapshotStore.version === 0 ? null : entry.snapshotStore.version,
    }
  }

  private async afterNavigation(entry: ManagedPage): Promise<PublicTab> {
    entry.snapshotStore = createSnapshotStore()
    await this.refreshSnapshot(entry.tabId).catch(() => null)
    return this.publicTab(entry)
  }

  private tabIndex(tabId: number): number | null {
    const index = [...this.pages.keys()].indexOf(tabId)
    return index >= 0 ? index : null
  }
}

function manifestDeclaresTarget(
  manifest: AgruneManifest,
  normalizedTargetId: string,
  url: string,
): boolean {
  const repeated = parseRepeatedTargetId(normalizedTargetId)
  for (const group of manifest.groups) {
    if (!routeApplies(group.route, url)) continue
    if (!repeated && group.targets.some(target => target.targetId === normalizedTargetId)) return true
    if (
      repeated &&
      group.repeats?.some(repeat =>
        repeat.repeatId === repeated.repeatId &&
        repeat.targets.some(target => target.targetId === repeated.baseTargetId),
      )
    ) {
      return true
    }
  }
  return false
}

function parseRepeatedTargetId(targetId: string): { repeatId: string; baseTargetId: string } | null {
  const delimiterIndex = targetId.indexOf(REPEATED_TARGET_KEY_DELIMITER)
  if (delimiterIndex <= 0) return null
  const repeatId = targetId.slice(0, delimiterIndex)
  const rest = targetId.slice(delimiterIndex + REPEATED_TARGET_KEY_DELIMITER.length)
  const dotIndex = rest.indexOf('.')
  if (!repeatId || dotIndex <= 0) return null
  const baseTargetId = rest.slice(dotIndex + 1)
  if (!baseTargetId) return null
  return { repeatId, baseTargetId }
}

async function findTargetLocator(
  page: Page,
  manifest: AgruneManifest,
  normalizedTargetId: string,
): Promise<Locator | null> {
  const url = page.url()
  for (const group of manifest.groups) {
    if (!routeApplies(group.route, url)) continue

    const direct = group.targets.find(target => target.targetId === normalizedTargetId)
    if (direct) {
      return firstLocator(page, direct)
    }

    const repeatLocator = await findRepeatTargetLocator(page, group, normalizedTargetId)
    if (repeatLocator) return repeatLocator
  }
  return null
}

function evaluatePageInBrowser(payload: { source: string; arg: unknown }): unknown {
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

function evaluateTargetInBrowser(el: Element, payload: { source: string; arg: unknown }): unknown {
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

function compileRunCodeUnsafeFunction(source: string): (page: Page) => unknown | Promise<unknown> {
  let candidate: unknown
  try {
    candidate = new Function(`return (${source});`)()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new CliError('INVALID_COMMAND', `run-code-unsafe code must be a JavaScript function: ${message}`)
  }

  if (typeof candidate !== 'function') {
    throw new CliError('INVALID_COMMAND', 'run-code-unsafe code must evaluate to a function.')
  }
  return candidate as (page: Page) => unknown | Promise<unknown>
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

function toConsoleMessageEntry(entry: ManagedPage, message: ConsoleMessage): ConsoleMessageEntry {
  const location = message.location()
  return {
    tabId: entry.tabId,
    level: normalizeConsoleLevel(message.type()),
    type: message.type(),
    text: message.text(),
    timestamp: Date.now(),
    navigationIndex: entry.navigationIndex,
    location: {
      url: location.url,
      lineNumber: location.lineNumber,
      columnNumber: location.columnNumber,
    },
  }
}

function toPageErrorConsoleEntry(entry: ManagedPage, error: Error): ConsoleMessageEntry {
  return {
    tabId: entry.tabId,
    level: 'error',
    type: 'pageerror',
    text: error.stack ?? error.message,
    timestamp: Date.now(),
    navigationIndex: entry.navigationIndex,
    location: {
      url: entry.page.url(),
      lineNumber: 0,
      columnNumber: 0,
    },
  }
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

async function applyFillFormField(locator: Locator, field: FillFormField): Promise<void> {
  switch (field.type) {
    case 'textbox':
      await locator.fill(String(field.value))
      return
    case 'checkbox':
    case 'radio':
      await locator.setChecked(booleanFillFormValue(field.value))
      return
    case 'combobox':
      await locator.selectOption(String(field.value))
      return
    case 'slider':
      await locator.fill(String(field.value))
      await locator.dispatchEvent('input')
      await locator.dispatchEvent('change')
      return
  }
}

async function fillWithKeystrokes(locator: Locator, value: string, clear: boolean): Promise<void> {
  await locator.click()
  if (clear) {
    await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await locator.press('Backspace')
  }
  await locator.pressSequentially(value)
}

async function shouldUseKeystrokeFill(locator: Locator): Promise<boolean> {
  return locator.evaluate(element => {
    if (!(element instanceof HTMLInputElement)) return false
    const type = element.type.toLowerCase()
    if (type === 'password') return true
    if (element.inputMode === 'numeric' || element.inputMode === 'decimal' || element.inputMode === 'tel') return true
    const autocomplete = element.autocomplete.toLowerCase()
    return autocomplete.startsWith('cc-') || autocomplete === 'one-time-code'
  }).catch(() => false)
}

function booleanFillFormValue(value: string | boolean | number): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on', 'checked'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'unchecked'].includes(normalized)) return false
  throw new Error('checkbox/radio values must be boolean-like')
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

function toNetworkRequestSummary(record: InternalNetworkRequest): NetworkRequestSummary {
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

function firstPendingDialog(entry: ManagedPage): { record: DialogInfo; dialog: PlaywrightDialog } | null {
  for (const record of entry.dialogs) {
    const dialog = entry.pendingDialogs.get(record.id)
    if (!record.handled && dialog) return { record, dialog }
  }
  return null
}

function firstPendingFileChooser(entry: ManagedPage): { record: FileChooserInfo; fileChooser: PlaywrightFileChooser } | null {
  for (const record of entry.fileChoosers) {
    const fileChooser = entry.pendingFileChoosers.get(record.id)
    if (!record.handled && fileChooser) return { record, fileChooser }
  }
  return null
}

function latestRecordAfter<T extends { id: number }>(records: T[], afterId: number): T | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]
    if (record.id > afterId) return record
  }
  return undefined
}

async function applyDialogAction(
  dialog: PlaywrightDialog,
  record: DialogInfo,
  action: DialogAction,
): Promise<void> {
  try {
    if (action.accept) {
      await dialog.accept(action.promptText)
    } else {
      await dialog.dismiss()
    }
    record.handled = true
    record.accepted = action.accept
    if (action.promptText !== undefined) {
      record.promptText = action.promptText
    }
    record.handledTimestamp = Date.now()
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error)
    throw error
  }
}

function notifyDialogWaiters(entry: ManagedPage, record: DialogInfo): void {
  const remaining: DialogWaiter[] = []
  for (const waiter of entry.dialogWaiters) {
    if (record.id > waiter.afterId) {
      waiter.resolve({ ...record })
    } else {
      remaining.push(waiter)
    }
  }
  entry.dialogWaiters = remaining
}

function notifyFileChooserWaiters(entry: ManagedPage, record: FileChooserInfo): void {
  const remaining: FileChooserWaiter[] = []
  for (const waiter of entry.fileChooserWaiters) {
    if (record.id > waiter.afterId) {
      waiter.resolve({ ...record })
    } else {
      remaining.push(waiter)
    }
  }
  entry.fileChooserWaiters = remaining
}

function networkRequestMatches(record: InternalNetworkRequest, query: NetworkQuery, activeNavigationIndex: number): boolean {
  if (!query.all && record.navigationIndex !== activeNavigationIndex) return false
  if (!query.includeStatic && isSuccessfulStaticRequest(record)) return false
  if (!query.filter) return true
  try {
    return new RegExp(query.filter).test(record.url)
  } catch {
    return record.url.includes(query.filter)
  }
}

function navigationIndexForRequest(
  entry: ManagedPage,
  page: Page,
  request: PlaywrightRequest,
): number {
  if (!request.isNavigationRequest()) return entry.navigationIndex
  try {
    if (request.frame() === page.mainFrame()) return entry.navigationIndex + 1
  } catch {
    return entry.navigationIndex
  }
  return entry.navigationIndex
}

function isSuccessfulStaticRequest(record: InternalNetworkRequest): boolean {
  if (typeof record.status !== 'number' || record.status < 200 || record.status >= 400) return false
  return STATIC_RESOURCE_TYPES.has(record.resourceType)
}

async function networkRequestPartValue(
  record: InternalNetworkRequest,
  part: NetworkRequestPart,
): Promise<string | Record<string, string> | null> {
  if (part === 'request-headers') return record.request.headers()
  if (part === 'request-body') return record.request.postData()
  if (part === 'response-headers') {
    if (!record.response) {
      throw new CliError('NETWORK_RESPONSE_NOT_FOUND', `No response is available for request ${record.index}.`, { index: record.index })
    }
    return record.response.headers()
  }
  if (!record.response) {
    throw new CliError('NETWORK_RESPONSE_NOT_FOUND', `No response is available for request ${record.index}.`, { index: record.index })
  }
  return responseText(record.response)
}

async function responseText(response: PlaywrightResponse): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new CliError('NETWORK_BODY_UNAVAILABLE', `Response body is unavailable: ${message}`)
  }
}

const STATIC_RESOURCE_TYPES = new Set(['font', 'image', 'media', 'script', 'stylesheet'])

async function findRepeatTargetLocator(
  page: Page,
  group: ManifestGroup,
  normalizedTargetId: string,
): Promise<Locator | null> {
  const delimiterIdx = normalizedTargetId.indexOf(REPEATED_TARGET_KEY_DELIMITER)
  if (delimiterIdx < 0) return null

  const repeatId = normalizedTargetId.slice(0, delimiterIdx)
  const restStart = delimiterIdx + REPEATED_TARGET_KEY_DELIMITER.length
  const dotIdx = normalizedTargetId.indexOf('.', restStart)
  if (dotIdx <= restStart) return null

  const key = normalizedTargetId.slice(restStart, dotIdx)
  const baseTargetId = normalizedTargetId.slice(dotIdx + 1)
  const repeat = group.repeats?.find(candidate => candidate.repeatId === repeatId)
  const target = repeat?.targets.find(candidate => candidate.targetId === baseTargetId)
  if (!repeat || !target) return null

  return findLocatorByRepeatKey(page, repeat, target, key)
}

async function firstLocator(page: Page, target: ManifestTarget): Promise<Locator | null> {
  const resolved = await resolveLocator(page, target.selector)
  return resolved?.locator ?? null
}

async function findLocatorByRepeatKey(
  page: Page,
  repeat: ManifestRepeat,
  target: ManifestTarget,
  key: string,
): Promise<Locator | null> {
  const resolved = await resolveLocator(page, target.selector)
  if (!resolved) return null

  const count = await resolved.locator.count().catch(() => 0)
  for (let index = 0; index < count; index += 1) {
    const locator = resolved.locator.nth(index)
    const candidateKey = await locator.evaluate(
      (el, expr) => {
        const fn = new Function('el', `return String(${expr})`) as (el: Element) => string
        return fn(el).trim()
      },
      repeat.keyFrom,
    ).catch(() => '')
    if (candidateKey === key) return locator
  }
  return null
}

async function pollUntil(check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if (await check().catch(() => false)) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new CliError('TIMEOUT', `Timed out after ${timeoutMs}ms.`)
}
