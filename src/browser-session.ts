// The daemon's browser owner: one chromium Browser + BrowserContext + a tab registry, with
// per-tab recorders (console/network/dialog/file-chooser), the action dispatch table, and the
// dialog/file-chooser interruption model. Public Playwright API only (§2.4). Chromium-only v1.

import {
  chromium,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Dialog,
  type FileChooser,
  type Locator,
  type Page,
  type Request as PWRequest,
  type Response as PWResponse,
} from 'playwright'
import { resolve as resolvePath, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { CliError } from './errors.js'
import type {
  PublicTab,
  ConsoleMessageEntry,
  ConsoleLevel,
  DialogInfo,
  DropData,
  FileChooserInfo,
  FillFormField,
  NetworkRequestPart,
  NetworkRequestSummary,
} from './types.js'
import {
  createSnapshotStore,
  refreshSnapshot,
  buildSnapshotFromManifest,
  ariaSnapshot as ariaSnapshotImpl,
  type PageSnapshot,
  type SnapshotStore,
  type AriaSnapshotOptions,
} from './snapshot.js'
import { resolveTargetLocator, resolveTargetOrSelectorLocator } from './resolver.js'
import {
  shouldUseKeystrokeFill,
  fillWithKeystrokes,
  applyFillFormField,
  filePayloadFromPath,
  dispatchDropInBrowser,
  evaluatePageInBrowser,
  evaluateTargetInBrowser,
  compileRunCodeUnsafeFunction,
  toJsonCompatible,
  normalizeConsoleLevel,
  severityForConsoleLevel,
  STATIC_RESOURCE_TYPES,
  type FillStrategy,
} from './actions.js'

interface InternalNetworkRequest extends NetworkRequestSummary {
  request: PWRequest
  response?: PWResponse
}

interface DialogWaiter {
  afterId: number
  resolve: (info: DialogInfo) => void
}
interface FileChooserWaiter {
  afterId: number
  resolve: (info: FileChooserInfo) => void
}

interface TabEntry {
  id: number
  page: Page
  store: SnapshotStore
  navigationIndex: number
  consoleMessages: ConsoleMessageEntry[]
  networkRequests: InternalNetworkRequest[]
  networkByRequest: Map<PWRequest, InternalNetworkRequest>
  dialogs: DialogInfo[]
  pendingDialogs: Map<number, Dialog>
  dialogWaiters: DialogWaiter[]
  dialogActions: Map<number, Promise<unknown>>
  fileChoosers: FileChooserInfo[]
  pendingFileChoosers: Map<number, FileChooser>
  fileChooserWaiters: FileChooserWaiter[]
  fileChooserActions: Map<number, Promise<unknown>>
}

export interface ClickOptions {
  button?: 'left' | 'right' | 'middle'
  modifiers?: Array<'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'>
  doubleClick?: boolean
}

export class BrowserSession {
  private browser!: Browser
  private context!: BrowserContext
  private readonly tabs = new Map<number, TabEntry>()
  private readonly order: number[] = []
  private activeId: number | null = null
  private counter = 0

  constructor(private readonly headless: boolean) {}

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.headless })
    this.context = await this.browser.newContext()
    this.context.on('page', (page) => {
      this.registerPage(page)
    })
  }

  async stop(): Promise<void> {
    try {
      await this.browser?.close()
    } catch {
      /* ignore */
    }
  }

  get browserContext(): BrowserContext {
    return this.context
  }

  // ---- tab registry --------------------------------------------------------

  private registerPage(page: Page): TabEntry {
    for (const existing of this.tabs.values()) {
      if (existing.page === page) return existing
    }
    const id = ++this.counter
    const entry: TabEntry = {
      id,
      page,
      store: createSnapshotStore(),
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
    this.tabs.set(id, entry)
    this.order.push(id)
    if (this.activeId === null) this.activeId = id

    page.on('close', () => this.unregister(id))
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        entry.navigationIndex += 1
        entry.store = createSnapshotStore()
      }
    })
    page.on('console', (message) => entry.consoleMessages.push(this.toConsoleEntry(entry, message)))
    page.on('pageerror', (error) => entry.consoleMessages.push(this.toPageErrorEntry(entry, error)))
    page.on('request', (request) => this.recordRequest(entry, page, request))
    page.on('response', (response) => {
      const record = entry.networkByRequest.get(response.request())
      if (!record) return
      record.response = response
      record.status = response.status()
      record.statusText = response.statusText()
    })
    page.on('requestfailed', (request) => {
      const record = entry.networkByRequest.get(request)
      if (record) record.failureText = request.failure()?.errorText ?? 'Request failed'
    })
    page.on('dialog', (dialog) => void this.handlePageDialog(entry, dialog))
    page.on('filechooser', (fileChooser) => this.handlePageFileChooser(entry, fileChooser))
    return entry
  }

  private unregister(id: number): void {
    this.tabs.delete(id)
    const idx = this.order.indexOf(id)
    if (idx !== -1) this.order.splice(idx, 1)
    if (this.activeId === id) this.activeId = this.order.length > 0 ? this.order[this.order.length - 1]! : null
  }

  private entry(tabId?: number): TabEntry {
    const id = tabId ?? this.activeId
    if (id === null || id === undefined) {
      throw new CliError('SESSION_NOT_ACTIVE', 'No active tab. Open a page first with "agrune open <url>".')
    }
    const entry = this.tabs.get(id)
    if (!entry) throw new CliError('TAB_NOT_FOUND', `Tab not found: ${id}`, { tabId: id })
    return entry
  }

  page(tabId?: number): Page {
    return this.entry(tabId).page
  }

  get tabCount(): number {
    return this.tabs.size
  }

  private indexOf(id: number): number {
    return this.order.indexOf(id)
  }

  private async publicTab(entry: TabEntry): Promise<PublicTab> {
    return {
      tabId: entry.id,
      index: this.indexOf(entry.id),
      url: entry.page.url(),
      title: await entry.page.title().catch(() => ''),
      active: entry.id === this.activeId,
    }
  }

  async listTabs(): Promise<PublicTab[]> {
    const out: PublicTab[] = []
    for (const id of this.order) {
      const entry = this.tabs.get(id)
      if (entry) out.push(await this.publicTab(entry))
    }
    return out
  }

  tabIdByIndex(index: number): number {
    const id = this.order[index]
    if (id === undefined) throw new CliError('TAB_NOT_FOUND', `No tab at index ${index}`, { index })
    return id
  }

  // ---- navigation / lifecycle ----------------------------------------------

  async open(url: string): Promise<{ index: number; tab: PublicTab }> {
    const page = await this.context.newPage()
    const entry = this.registerPage(page)
    this.activeId = entry.id
    await page.goto(url)
    return { index: this.indexOf(entry.id), tab: await this.publicTab(entry) }
  }

  async navigate(url: string, tabId?: number): Promise<PublicTab> {
    const entry = this.entry(tabId)
    await entry.page.goto(url)
    return this.publicTab(entry)
  }

  async back(tabId?: number): Promise<PublicTab> {
    const entry = this.entry(tabId)
    await entry.page.goBack()
    return this.publicTab(entry)
  }

  async forward(tabId?: number): Promise<PublicTab> {
    const entry = this.entry(tabId)
    await entry.page.goForward()
    return this.publicTab(entry)
  }

  async reload(tabId?: number): Promise<PublicTab> {
    const entry = this.entry(tabId)
    await entry.page.reload()
    return this.publicTab(entry)
  }

  async resize(width: number, height: number, tabId?: number): Promise<{ tabId: number; width: number; height: number }> {
    const entry = this.entry(tabId)
    await entry.page.setViewportSize({ width, height })
    return { tabId: entry.id, width, height }
  }

  async newTab(url: string): Promise<{ index: number; tab: PublicTab }> {
    return this.open(url)
  }

  async focusTab(tabId: number): Promise<{ index: number; tab: PublicTab }> {
    const entry = this.entry(tabId)
    await entry.page.bringToFront()
    this.activeId = entry.id
    return { index: this.indexOf(entry.id), tab: await this.publicTab(entry) }
  }

  async closeTab(tabId?: number): Promise<{ closedTabId: number; index: number; tabs: PublicTab[] }> {
    const entry = this.entry(tabId)
    const index = this.indexOf(entry.id)
    await entry.page.close()
    return { closedTabId: entry.id, index, tabs: await this.listTabs() }
  }

  // ---- perception ----------------------------------------------------------

  async snapshot(tabId?: number): Promise<PageSnapshot> {
    const entry = this.entry(tabId)
    return refreshSnapshot(entry.page, entry.store)
  }

  async ariaSnapshot(
    tabId: number | undefined,
    opts: AriaSnapshotOptions,
  ): Promise<{ text: string; mode: 'ai' | 'default'; target?: string; depth?: number }> {
    const entry = this.entry(tabId)
    return ariaSnapshotImpl(entry.page, (ref) => resolveTargetOrSelectorLocator(entry.page, ref), opts)
  }

  // ---- resolve helper ------------------------------------------------------

  private resolve(entry: TabEntry, targetRef: string): Promise<Locator> {
    return resolveTargetLocator(entry.page, targetRef)
  }

  /**
   * Fast-fail when a JS dialog is pending (it freezes page script) — only for act/fill/drag.
   * §5.1 step 2.
   */
  private assertNotDialogBlocked(entry: TabEntry): void {
    if (firstPendingDialog(entry)) {
      throw new CliError('FLOW_BLOCKED', 'Page is blocked by a pending dialog. Handle it with handle-dialog first.', {
        tabId: entry.id,
      })
    }
  }

  /**
   * Flow-block gate (§5.8): while an overlay target is actionable, only overlay targets may
   * receive act/fill/drag commands. Uses a throwaway store so it never bumps the real version.
   */
  private async flowBlockGate(entry: TabEntry, refs: Array<string | undefined>): Promise<void> {
    const ids = refs.filter((r): r is string => typeof r === 'string')
    if (ids.length === 0) return
    let snapshot: PageSnapshot
    try {
      snapshot = await refreshSnapshot(entry.page, createSnapshotStore())
    } catch {
      return
    }
    const flowLocked = snapshot.targets.some((t) => t.overlay && t.actionableNow)
    if (!flowLocked) return
    for (const id of ids) {
      const target = snapshot.targets.find((t) => t.targetId === id)
      if (target && !target.overlay) {
        throw new CliError('FLOW_BLOCKED', `target is blocked by active overlay flow: ${id}`, {
          snapshotVersion: snapshot.version,
          targetId: id,
        })
      }
    }
  }

  // ---- actions (§5.3) ------------------------------------------------------

  async click(
    tabId: number | undefined,
    targetRef: string,
    action = 'click',
    options: ClickOptions = {},
  ): Promise<{ dialog?: DialogInfo; fileChooser?: FileChooserInfo }> {
    const entry = this.entry(tabId)
    this.assertNotDialogBlocked(entry)
    await this.flowBlockGate(entry, [targetRef])
    const locator = await this.resolve(entry, targetRef)
    const clickOptions = {
      ...(options.button ? { button: options.button } : {}),
      ...(options.modifiers ? { modifiers: options.modifiers } : {}),
    }
    return this.runActionWithInterruptions(
      entry,
      async () => {
        switch (action) {
          case 'click':
            if (options.doubleClick) await locator.dblclick(clickOptions)
            else await locator.click(clickOptions)
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
      },
      action === 'click',
    )
  }

  async fill(
    tabId: number | undefined,
    targetRef: string,
    value: string,
    clear = true,
    strategy: FillStrategy = 'auto',
  ): Promise<FillStrategy> {
    const entry = this.entry(tabId)
    this.assertNotDialogBlocked(entry)
    await this.flowBlockGate(entry, [targetRef])
    const locator = await this.resolve(entry, targetRef)
    const effective: FillStrategy =
      strategy === 'auto' && (await shouldUseKeystrokeFill(locator))
        ? 'keystroke'
        : strategy === 'auto'
          ? 'insert'
          : strategy
    if (effective === 'keystroke') {
      await fillWithKeystrokes(locator, value, clear)
      return effective
    }
    if (clear) {
      await locator.fill(value)
      return effective
    }
    const current = await locator.inputValue().catch(() => '')
    await locator.fill(`${current}${value}`)
    return effective
  }

  async fillForm(tabId: number | undefined, fields: FillFormField[]): Promise<void> {
    const entry = this.entry(tabId)
    this.assertNotDialogBlocked(entry)
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index]!
      try {
        const locator = await this.resolve(entry, field.target)
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

  async type(tabId: number | undefined, targetRef: string, text: string, delayMs?: number, submit = false): Promise<void> {
    const entry = this.entry(tabId)
    const locator = await this.resolve(entry, targetRef)
    await locator.pressSequentially(text, typeof delayMs === 'number' ? { delay: delayMs } : undefined)
    if (submit) await locator.press('Enter')
  }

  async press(tabId: number | undefined, key: string, targetRef?: string, delayMs?: number): Promise<void> {
    const entry = this.entry(tabId)
    const options = typeof delayMs === 'number' ? { delay: delayMs } : undefined
    if (targetRef) {
      const locator = await this.resolve(entry, targetRef)
      await locator.press(key, options)
      return
    }
    await entry.page.keyboard.press(key, options)
  }

  async select(
    tabId: number | undefined,
    targetRef: string,
    values: Array<{ value?: string; label?: string; index?: number }>,
  ): Promise<string[]> {
    const entry = this.entry(tabId)
    const locator = await this.resolve(entry, targetRef)
    return locator.selectOption(values)
  }

  async upload(tabId: number | undefined, targetRef: string, paths: string[]): Promise<string[]> {
    const entry = this.entry(tabId)
    const locator = await this.resolve(entry, targetRef)
    const absolutePaths = paths.map((p) => resolvePath(p))
    await locator.setInputFiles(absolutePaths)
    return absolutePaths
  }

  async drop(
    tabId: number | undefined,
    targetRef: string,
    data: DropData,
    paths: string[],
  ): Promise<{ paths: string[]; dataTypes: string[] }> {
    const entry = this.entry(tabId)
    this.assertNotDialogBlocked(entry)
    const locator = await this.resolve(entry, targetRef)
    const absolutePaths = paths.map((p) => resolvePath(p))
    const files = await Promise.all(absolutePaths.map((p) => filePayloadFromPath(p)))
    await locator.evaluate(dispatchDropInBrowser, { data, files })
    return { paths: absolutePaths, dataTypes: Object.keys(data) }
  }

  async drag(tabId: number | undefined, sourceRef: string, destinationRef: string): Promise<void> {
    const entry = this.entry(tabId)
    this.assertNotDialogBlocked(entry)
    await this.flowBlockGate(entry, [sourceRef, destinationRef])
    const source = await this.resolve(entry, sourceRef)
    const destination = await this.resolve(entry, destinationRef)
    await source.dragTo(destination)
  }

  async waitForTarget(
    tabId: number | undefined,
    targetRef: string,
    state: 'visible' | 'hidden' | 'enabled' | 'disabled',
    timeoutMs = 10_000,
  ): Promise<void> {
    const entry = this.entry(tabId)
    const locator = await this.resolve(entry, targetRef)
    if (state === 'visible' || state === 'hidden') {
      await locator.waitFor({ state, timeout: timeoutMs })
      return
    }
    await pollUntil(
      async () => (state === 'enabled' ? locator.isEnabled() : !(await locator.isEnabled())),
      timeoutMs,
    )
  }

  async waitForText(
    tabId: number | undefined,
    text: string,
    state: 'visible' | 'hidden',
    timeoutMs = 10_000,
  ): Promise<void> {
    const entry = this.entry(tabId)
    await entry.page.getByText(text).waitFor({ state, timeout: timeoutMs })
  }

  async waitForTime(tabId: number | undefined, timeMs: number): Promise<void> {
    const entry = this.entry(tabId)
    await entry.page.waitForTimeout(timeMs)
  }

  async read(tabId?: number): Promise<string> {
    const entry = this.entry(tabId)
    return entry.page.locator('body').innerText()
  }

  async screenshot(
    tabId: number | undefined,
    path: string,
    options: { fullPage?: boolean; targetRef?: string; type?: 'png' | 'jpeg' } = {},
  ): Promise<string> {
    if (options.targetRef && options.fullPage) {
      throw new CliError('INVALID_COMMAND', 'Element screenshots cannot use fullPage.')
    }
    const entry = this.entry(tabId)
    const absolutePath = resolvePath(path)
    await mkdir(dirname(absolutePath), { recursive: true })
    if (options.targetRef) {
      const locator = await resolveTargetOrSelectorLocator(entry.page, options.targetRef)
      await locator.screenshot({ path: absolutePath, type: options.type })
      return absolutePath
    }
    await entry.page.screenshot({ path: absolutePath, fullPage: options.fullPage === true, type: options.type })
    return absolutePath
  }

  async evaluate(tabId: number | undefined, source: string, arg: unknown, targetRef?: string): Promise<unknown> {
    const entry = this.entry(tabId)
    if (targetRef) {
      const locator = await resolveTargetOrSelectorLocator(entry.page, targetRef)
      return locator.evaluate(evaluateTargetInBrowser, { source, arg })
    }
    return entry.page.evaluate(evaluatePageInBrowser, { source, arg })
  }

  async runCodeUnsafe(tabId: number | undefined, source: string): Promise<unknown> {
    if (process.env.AGRUNE_ALLOW_RUN_CODE !== '1') {
      throw new CliError(
        'INVALID_COMMAND',
        'run-code-unsafe is disabled. Set AGRUNE_ALLOW_RUN_CODE=1 to enable it (it bypasses the manifest contract).',
      )
    }
    if (typeof source !== 'string' || source.trim().length === 0) {
      throw new CliError('INVALID_COMMAND', 'run-code-unsafe requires non-empty code.')
    }
    const entry = this.entry(tabId)
    let fn: (...args: unknown[]) => unknown
    try {
      fn = compileRunCodeUnsafeFunction(source)
    } catch (error) {
      throw new CliError('INVALID_COMMAND', error instanceof Error ? error.message : String(error))
    }
    await entry.page.bringToFront().catch(() => undefined)
    this.activeId = entry.id
    const result = await fn(entry.page)
    return result === undefined ? undefined : toJsonCompatible(result)
  }

  // ---- console / network queries (§5.6) ------------------------------------

  consoleMessages(tabId: number | undefined, query: { level?: ConsoleLevel; all?: boolean } = {}): ConsoleMessageEntry[] {
    const entry = this.entry(tabId)
    const minSeverity = severityForConsoleLevel(query.level ?? 'info')
    return entry.consoleMessages.filter((message) => {
      if (!query.all && message.navigationIndex !== entry.navigationIndex) return false
      return severityForConsoleLevel(message.level) >= minSeverity
    })
  }

  networkRequests(
    tabId: number | undefined,
    query: { filter?: string; includeStatic?: boolean; all?: boolean } = {},
  ): NetworkRequestSummary[] {
    const entry = this.entry(tabId)
    return entry.networkRequests
      .filter((record) => networkRequestMatches(record, query, entry.navigationIndex))
      .map(toNetworkRequestSummary)
  }

  async networkRequestDetail(
    tabId: number | undefined,
    index: number,
    part?: NetworkRequestPart,
  ): Promise<Record<string, unknown>> {
    const entry = this.entry(tabId)
    const record = entry.networkRequests.find((r) => r.index === index)
    if (!record) throw new CliError('NETWORK_REQUEST_NOT_FOUND', `Network request not found: ${index}`, { index })
    const summary = toNetworkRequestSummary(record)
    if (part) return { request: summary, part, value: await networkRequestPartValue(record, part) }
    return {
      request: summary,
      requestHeaders: record.request.headers(),
      requestBody: record.request.postData(),
      responseHeaders: record.response?.headers() ?? {},
      responseBody: record.response ? await responseText(record.response) : null,
    }
  }

  // ---- dialogs / file choosers (§5.5) --------------------------------------

  dialogs(tabId?: number): DialogInfo[] {
    return this.entry(tabId).dialogs.map((d) => ({ ...d }))
  }

  fileChoosers(tabId?: number): FileChooserInfo[] {
    return this.entry(tabId).fileChoosers.map((f) => ({ ...f }))
  }

  async handleDialog(
    tabId: number | undefined,
    action: { accept: boolean; promptText?: string },
  ): Promise<{ armed: boolean; dialog?: DialogInfo }> {
    const entry = this.entry(tabId)
    const pending = firstPendingDialog(entry)
    if (!pending) throw new CliError('DIALOG_NOT_FOUND', 'No pending dialog is available to handle.')
    entry.pendingDialogs.delete(pending.record.id)
    await applyDialogAction(pending.dialog, pending.record, action)
    const actionPromise = entry.dialogActions.get(pending.record.id)
    entry.dialogActions.delete(pending.record.id)
    if (actionPromise) await actionPromise.catch(() => undefined)
    return { armed: false, dialog: { ...pending.record } }
  }

  async uploadToFileChooser(
    tabId: number | undefined,
    paths: string[],
  ): Promise<{ paths: string[]; cancelled: boolean; fileChooser: FileChooserInfo }> {
    const entry = this.entry(tabId)
    const pending = firstPendingFileChooser(entry)
    if (!pending) throw new CliError('FILE_CHOOSER_NOT_FOUND', 'No pending file chooser is available to upload to.')
    const absolutePaths = paths.map((p) => resolvePath(p))
    await pending.fileChooser.setFiles(absolutePaths)
    entry.pendingFileChoosers.delete(pending.record.id)
    pending.record.paths = absolutePaths
    pending.record.cancelled = absolutePaths.length === 0
    pending.record.handled = true
    pending.record.handledTimestamp = Date.now()
    const actionPromise = entry.fileChooserActions.get(pending.record.id)
    entry.fileChooserActions.delete(pending.record.id)
    if (actionPromise) await actionPromise.catch(() => undefined)
    return { paths: absolutePaths, cancelled: absolutePaths.length === 0, fileChooser: { ...pending.record } }
  }

  // ---- interruption model (§5.5) -------------------------------------------

  private async runActionWithInterruptions(
    entry: TabEntry,
    action: () => Promise<void>,
    watchFileChooser = false,
  ): Promise<{ dialog?: DialogInfo; fileChooser?: FileChooserInfo }> {
    const dialogAfterId = entry.dialogs.length
    const fileChooserAfterId = entry.fileChoosers.length
    const dialogWaiter = this.waitForNextDialog(entry)
    const fileChooserWaiter = this.waitForNextFileChooser(entry)
    const playwrightFileChooser = watchFileChooser
      ? entry.page.waitForEvent('filechooser', { timeout: 250 }).then(
          (fileChooser) => this.handlePageFileChooser(entry, fileChooser),
          () => null,
        )
      : Promise.resolve(null)
    const actionPromise = action()
    const settled = actionPromise.then(
      () => ({ kind: 'done' as const }),
      (error: unknown) => ({ kind: 'error' as const, error }),
    )
    const dialogResult = dialogWaiter.promise.then((dialog) => ({ kind: 'dialog' as const, dialog }))
    const fileChooserResult = fileChooserWaiter.promise.then((fileChooser) => ({
      kind: 'fileChooser' as const,
      fileChooser,
    }))
    const explicitFileChooserResult = playwrightFileChooser.then((fileChooser) =>
      fileChooser
        ? { kind: 'fileChooser' as const, fileChooser }
        : new Promise<never>(() => undefined),
    )
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
    if (winner.kind === 'error') throw winner.error

    const explicitFileChooser = await playwrightFileChooser
    if (explicitFileChooser && explicitFileChooser.id > fileChooserAfterId && !explicitFileChooser.handled) {
      return { fileChooser: { ...explicitFileChooser } }
    }
    const dialog = latestRecordAfter(entry.dialogs, dialogAfterId)
    if (dialog && !dialog.handled) return { dialog: { ...dialog } }
    const fileChooser = latestRecordAfter(entry.fileChoosers, fileChooserAfterId)
    if (fileChooser && !fileChooser.handled) return { fileChooser: { ...fileChooser } }
    return {}
  }

  private waitForNextDialog(entry: TabEntry): { promise: Promise<DialogInfo>; cancel(): void } {
    const afterId = entry.dialogs.length
    let waiter: DialogWaiter | null = null
    const promise = new Promise<DialogInfo>((resolve) => {
      waiter = { afterId, resolve }
      entry.dialogWaiters.push(waiter)
    })
    return {
      promise,
      cancel() {
        if (waiter) entry.dialogWaiters = entry.dialogWaiters.filter((c) => c !== waiter)
      },
    }
  }

  private waitForNextFileChooser(entry: TabEntry): { promise: Promise<FileChooserInfo>; cancel(): void } {
    const afterId = entry.fileChoosers.length
    let waiter: FileChooserWaiter | null = null
    const promise = new Promise<FileChooserInfo>((resolve) => {
      waiter = { afterId, resolve }
      entry.fileChooserWaiters.push(waiter)
    })
    return {
      promise,
      cancel() {
        if (waiter) entry.fileChooserWaiters = entry.fileChooserWaiters.filter((c) => c !== waiter)
      },
    }
  }

  private async handlePageDialog(entry: TabEntry, dialog: Dialog): Promise<void> {
    const record: DialogInfo = {
      id: entry.dialogs.length + 1,
      tabId: entry.id,
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

  private handlePageFileChooser(entry: TabEntry, fileChooser: FileChooser): FileChooserInfo {
    for (const [id, pending] of entry.pendingFileChoosers) {
      if (pending !== fileChooser) continue
      const existing = entry.fileChoosers.find((record) => record.id === id)
      if (existing) return existing
    }
    const record: FileChooserInfo = {
      id: entry.fileChoosers.length + 1,
      tabId: entry.id,
      timestamp: Date.now(),
      multiple: fileChooser.isMultiple(),
      handled: false,
    }
    entry.fileChoosers.push(record)
    entry.pendingFileChoosers.set(record.id, fileChooser)
    notifyFileChooserWaiters(entry, record)
    return record
  }

  // ---- recorder helpers ----------------------------------------------------

  private toConsoleEntry(entry: TabEntry, message: ConsoleMessage): ConsoleMessageEntry {
    const location = message.location()
    return {
      tabId: entry.id,
      level: normalizeConsoleLevel(message.type()),
      type: message.type(),
      text: message.text(),
      timestamp: Date.now(),
      navigationIndex: entry.navigationIndex,
      location: { url: location.url, lineNumber: location.lineNumber, columnNumber: location.columnNumber },
    }
  }

  private toPageErrorEntry(entry: TabEntry, error: Error): ConsoleMessageEntry {
    return {
      tabId: entry.id,
      level: 'error',
      type: 'pageerror',
      text: error.stack ?? error.message,
      timestamp: Date.now(),
      navigationIndex: entry.navigationIndex,
      location: { url: entry.page.url(), lineNumber: 0, columnNumber: 0 },
    }
  }

  private recordRequest(entry: TabEntry, page: Page, request: PWRequest): void {
    let navigationIndex = entry.navigationIndex
    if (request.isNavigationRequest()) {
      try {
        if (request.frame() === page.mainFrame()) navigationIndex = entry.navigationIndex + 1
      } catch {
        /* keep current */
      }
    }
    const record: InternalNetworkRequest = {
      index: entry.networkRequests.length + 1,
      tabId: entry.id,
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      isNavigationRequest: request.isNavigationRequest(),
      timestamp: Date.now(),
      navigationIndex,
      request,
    }
    entry.networkRequests.push(record)
    entry.networkByRequest.set(request, record)
  }
}

// ---- module-scope helpers --------------------------------------------------

async function pollUntil(check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if (await check().catch(() => false)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new CliError('TIMEOUT', `Timed out after ${timeoutMs}ms.`)
}

function firstPendingDialog(entry: TabEntry): { record: DialogInfo; dialog: Dialog } | null {
  for (const record of entry.dialogs) {
    const dialog = entry.pendingDialogs.get(record.id)
    if (!record.handled && dialog) return { record, dialog }
  }
  return null
}

function firstPendingFileChooser(entry: TabEntry): { record: FileChooserInfo; fileChooser: FileChooser } | null {
  for (const record of entry.fileChoosers) {
    const fileChooser = entry.pendingFileChoosers.get(record.id)
    if (!record.handled && fileChooser) return { record, fileChooser }
  }
  return null
}

function latestRecordAfter<T extends { id: number }>(records: T[], afterId: number): T | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!
    if (record.id > afterId) return record
  }
  return undefined
}

async function applyDialogAction(
  dialog: Dialog,
  record: DialogInfo,
  action: { accept: boolean; promptText?: string },
): Promise<void> {
  try {
    if (action.accept) await dialog.accept(action.promptText)
    else await dialog.dismiss()
    record.handled = true
    record.accepted = action.accept
    if (action.promptText !== undefined) record.promptText = action.promptText
    record.handledTimestamp = Date.now()
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error)
    throw error
  }
}

function notifyDialogWaiters(entry: TabEntry, record: DialogInfo): void {
  const remaining: DialogWaiter[] = []
  for (const waiter of entry.dialogWaiters) {
    if (record.id > waiter.afterId) waiter.resolve({ ...record })
    else remaining.push(waiter)
  }
  entry.dialogWaiters = remaining
}

function notifyFileChooserWaiters(entry: TabEntry, record: FileChooserInfo): void {
  const remaining: FileChooserWaiter[] = []
  for (const waiter of entry.fileChooserWaiters) {
    if (record.id > waiter.afterId) waiter.resolve({ ...record })
    else remaining.push(waiter)
  }
  entry.fileChooserWaiters = remaining
}

function networkRequestMatches(
  record: InternalNetworkRequest,
  query: { filter?: string; includeStatic?: boolean; all?: boolean },
  activeNavigationIndex: number,
): boolean {
  if (!query.all && record.navigationIndex !== activeNavigationIndex) return false
  if (!query.includeStatic && isSuccessfulStaticRequest(record)) return false
  if (!query.filter) return true
  try {
    return new RegExp(query.filter).test(record.url)
  } catch {
    return record.url.includes(query.filter)
  }
}

function isSuccessfulStaticRequest(record: InternalNetworkRequest): boolean {
  if (typeof record.status !== 'number' || record.status < 200 || record.status >= 400) return false
  return STATIC_RESOURCE_TYPES.has(record.resourceType)
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

async function networkRequestPartValue(
  record: InternalNetworkRequest,
  part: NetworkRequestPart,
): Promise<string | Record<string, string> | null> {
  if (part === 'request-headers') return record.request.headers()
  if (part === 'request-body') return record.request.postData()
  if (part === 'response-headers') {
    if (!record.response) {
      throw new CliError('NETWORK_RESPONSE_NOT_FOUND', `No response is available for request ${record.index}.`, {
        index: record.index,
      })
    }
    return record.response.headers()
  }
  if (!record.response) {
    throw new CliError('NETWORK_RESPONSE_NOT_FOUND', `No response is available for request ${record.index}.`, {
      index: record.index,
    })
  }
  return responseText(record.response)
}

async function responseText(response: PWResponse): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new CliError('NETWORK_BODY_UNAVAILABLE', `Response body is unavailable: ${message}`)
  }
}
