import type {
  AgruneRuntimeConfig,
  BrowserDriver,
  CloseTabResult,
  CommandErrorCode,
  CommandResult,
  ConsoleLevel,
  ConsoleMessagesQuery,
  DialogHandleOptions,
  DialogHandleResult,
  DropData,
  DropResult,
  EvaluateOptions,
  EvaluateResult,
  FillFormField,
  FillFormResult,
  FillStrategy,
  FileUploadResult,
  FocusResult,
  NavigationResult,
  NetworkRequestDetail,
  NetworkRequestPart,
  NetworkRequestsQuery,
  OpenTabResult,
  PageSnapshot,
  PointerAction,
  PressKeyResult,
  ResizeResult,
  RunCodeUnsafeResult,
  ScreenshotOptions,
  ScreenshotResult,
  SelectOptionResult,
  Session,
  TypeTextOptions,
  TypeTextResult,
} from '@agrune/core'
import { createCommandError, mergeRuntimeConfig, normalizeRuntimeConfig } from '@agrune/core'
import { AgruneBackendError } from './errors.js'
import { PlaywrightSession, type PlaywrightConnection } from './playwright-session.js'
import { axMessageDelta } from './screen-delta.js'
import { pendingRequiredFields } from './required-nudge.js'
import { loadVisualRuntimeSource, visualInstallExpression } from './visual-effects.js'

export interface PlaywrightDriverOptions {
  connection: PlaywrightConnection
  /** Opened automatically right after connect(). */
  startUrl?: string
}

/**
 * `BrowserDriver` adapter over `PlaywrightSession` — the Playwright-based
 * replacement for the CDP-injection driver. Snapshots follow a pull model:
 * `ensureReady()` / `execute()` recompute and cache per-tab snapshots so the
 * synchronous `getSnapshot()` contract stays intact for the MCP tool layer.
 */
export class PlaywrightDriver implements BrowserDriver {
  private readonly session: PlaywrightSession
  private connected = false
  private commandCounter = 0
  private readonly snapshots = new Map<number, PageSnapshot>()
  /** Last-captured accessibility-tree lines per tab (for the screen-message delta). */
  private readonly axLines = new Map<number, string[]>()
  private config: AgruneRuntimeConfig = normalizeRuntimeConfig(undefined)
  private visualsInstalled = false

  constructor(private readonly options: PlaywrightDriverOptions) {
    this.session = new PlaywrightSession({ connection: options.connection })
  }

  async connect(): Promise<void> {
    if (this.connected) return
    await this.session.start()
    this.connected = true

    const visualSource = loadVisualRuntimeSource()
    if (visualSource) {
      await this.session.installVisualRuntime(visualInstallExpression(visualSource))
      this.visualsInstalled = true
    }

    if (this.options.startUrl) {
      await this.session.open(this.options.startUrl).catch(() => undefined)
    }
  }

  async disconnect(): Promise<void> {
    await this.session.stop()
    this.snapshots.clear()
    this.axLines.clear()
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  listSessions(): Session[] {
    return this.session.listTabs().map(tab => ({
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      hasSnapshot: this.snapshots.has(tab.tabId),
      snapshotVersion: tab.snapshotVersion,
      active: tab.active,
    }))
  }

  getSnapshot(tabId: number): PageSnapshot | null {
    return this.snapshots.get(tabId) ?? null
  }

  async ensureReady(): Promise<string | null> {
    await this.connect()
    const tabs = this.session.listTabs()
    if (tabs.length === 0) {
      return 'No browser pages are open. Use browser_open_tab or browser_navigate to open a page.'
    }
    await Promise.all(tabs.map(tab => this.refreshSnapshot(tab.tabId).catch(() => undefined)))
    return null
  }

  resolveTabId(tabId?: number): number | null {
    if (typeof tabId === 'number') return tabId
    const tabs = this.session.listTabs()
    return tabs.find(tab => tab.active)?.tabId ?? tabs[0]?.tabId ?? null
  }

  async focusSession(tabId: number): Promise<FocusResult> {
    const wasActive = this.session.listTabs().find(tab => tab.tabId === tabId)?.active === true
    await this.session.focus(tabId)
    return { tabId, wasActive, becameActive: !wasActive }
  }

  async execute(
    tabId: number,
    command: Record<string, unknown> & { kind: string },
  ): Promise<CommandResult> {
    const commandId =
      typeof command.commandId === 'string'
        ? command.commandId
        : `cmd-${++this.commandCounter}-${Date.now()}`

    // A pending JS dialog freezes page script: any action would stall until
    // Playwright's timeout. Fail fast with guidance instead.
    if (this.hasPendingDialog(tabId)) {
      return {
        commandId,
        ok: false,
        error: createCommandError(
          'FLOW_BLOCKED',
          'Page is blocked by a pending dialog. Handle it with browser_handle_dialog first.',
          { tabId },
        ),
      }
    }

    // The snapshot the agent is currently acting from (set by the previous
    // command's refresh). Captured BEFORE any intermediate refresh so its version
    // is the true pre-action baseline for the screen-change gate below.
    const before = this.snapshots.get(tabId) ?? null
    // Accessibility-tree lines as of the pre-action screen (set by the previous
    // refresh). refreshSnapshot below overwrites this.axLines with the post-action
    // frame, so read the baseline now.
    const beforeAx = this.axLines.get(tabId) ?? null

    try {
      const blocked = await this.flowBlockGate(tabId, command)
      if (blocked) return { ...blocked, commandId }

      const result = await this.dispatchCommand(tabId, command)
      const snapshot = await this.settle(tabId).catch(() => null)
      const changed = this.actionChanged(command, before, snapshot)
      const feedback = this.actionFeedback(before, result, changed)
      const screenMessages = this.screenMessageDelta(beforeAx, this.axLines.get(tabId) ?? null, snapshot)
      const pendingRequired = this.pendingRequired(command, snapshot)
      return {
        commandId,
        ok: true,
        result: this.withActionInsights(result, feedback, screenMessages, changed, pendingRequired),
        ...snapshotEnvelope(snapshot),
      }
    } catch (error) {
      const snapshot = await this.refreshSnapshot(tabId).catch(() => null)
      const { code, message, details } = toCommandErrorParts(error)
      return {
        commandId,
        ok: false,
        error: createCommandError(code, message, {
          ...(details ?? {}),
          ...(typeof command.targetId === 'string' ? { targetId: command.targetId } : {}),
          ...(snapshot ? { snapshotVersion: snapshot.version } : {}),
        }),
        ...snapshotEnvelope(snapshot),
      }
    }
  }

  updateConfig(config: Partial<AgruneRuntimeConfig>): void {
    this.config = mergeRuntimeConfig(this.config, config)
    if (this.visualsInstalled) {
      this.session.broadcastEvaluate(
        `window.__agrune_visual__ && window.__agrune_visual__.applyConfig(${JSON.stringify(this.config)})`,
      )
    }
  }

  getConfig(): AgruneRuntimeConfig {
    return { ...this.config }
  }

  async openTab(url: string): Promise<OpenTabResult> {
    const tab = await this.session.open(url)
    await this.refreshSnapshot(tab.tabId).catch(() => undefined)
    return { tabId: tab.tabId, url: tab.url, title: tab.title }
  }

  async closeTab(tabId?: number): Promise<CloseTabResult> {
    const { closedTabId } = await this.session.close(tabId)
    this.snapshots.delete(closedTabId)
    return { tabId: closedTabId, closed: true }
  }

  async navigateTab(tabId: number | undefined, url: string): Promise<NavigationResult> {
    const tab = await this.session.navigate(tabId, url)
    await this.refreshSnapshot(tab.tabId).catch(() => undefined)
    return { tabId: tab.tabId, url: tab.url, title: tab.title }
  }

  async navigateBack(tabId?: number): Promise<NavigationResult> {
    const tab = await this.session.back(tabId)
    await this.refreshSnapshot(tab.tabId).catch(() => undefined)
    return { tabId: tab.tabId, url: tab.url, title: tab.title }
  }

  async resizeTab(tabId: number | undefined, width: number, height: number): Promise<ResizeResult> {
    return this.session.resize(tabId, width, height)
  }

  async screenshotTab(
    tabId: number | undefined,
    path: string,
    options: ScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    const resolvedTabId = this.requireTabId(tabId)
    const savedPath = await this.session.screenshot(resolvedTabId, path, {
      fullPage: options.fullPage,
      targetRef: options.targetId,
      type: options.type,
    })
    return {
      tabId: resolvedTabId,
      path: savedPath,
      type: options.type ?? 'png',
      fullPage: options.fullPage === true,
      ...(options.targetId ? { targetId: options.targetId } : {}),
    }
  }

  async evaluateTab(
    tabId: number | undefined,
    source: string,
    options: EvaluateOptions = {},
  ): Promise<EvaluateResult> {
    const resolvedTabId = this.requireTabId(tabId)
    const result = await this.session.evaluate(resolvedTabId, source, options.arg, options.targetId)
    return {
      tabId: resolvedTabId,
      result: result === undefined ? null : result,
      ...(result === undefined ? { undefinedResult: true as const } : {}),
      ...(options.targetId ? { targetId: options.targetId } : {}),
    }
  }

  async runCodeUnsafe(tabId: number | undefined, source: string): Promise<RunCodeUnsafeResult> {
    const resolvedTabId = this.requireTabId(tabId)
    const result = await this.session.runCodeUnsafe(resolvedTabId, source)
    return {
      tabId: resolvedTabId,
      result: result === undefined ? null : result,
      ...(result === undefined ? { undefinedResult: true as const } : {}),
    }
  }

  async pressKey(tabId: number | undefined, key: string): Promise<PressKeyResult> {
    const resolvedTabId = this.requireTabId(tabId)
    await this.session.press(resolvedTabId, key)
    return { tabId: resolvedTabId, key }
  }

  async typeText(
    tabId: number | undefined,
    targetId: string,
    text: string,
    options: TypeTextOptions = {},
  ): Promise<TypeTextResult> {
    const resolvedTabId = this.requireTabId(tabId)
    await this.session.type(
      resolvedTabId,
      targetId,
      text,
      options.slowly ? 75 : undefined,
      options.submit === true,
    )
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return { tabId: resolvedTabId, targetId, text, submitted: options.submit === true }
  }

  async selectOptions(
    tabId: number | undefined,
    targetId: string,
    values: string[],
  ): Promise<SelectOptionResult> {
    const resolvedTabId = this.requireTabId(tabId)
    const selected = await this.session.select(resolvedTabId, targetId, values.map(value => ({ value })))
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return { tabId: resolvedTabId, targetId, values: selected }
  }

  async fillForm(tabId: number | undefined, fields: FillFormField[]): Promise<FillFormResult> {
    const resolvedTabId = this.requireTabId(tabId)
    await this.session.fillForm(
      resolvedTabId,
      fields.map(field => ({
        name: field.name,
        target: field.targetId,
        type: field.type,
        value: field.value,
      })),
    )
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

  async fileUpload(tabId: number | undefined, paths: string[]): Promise<FileUploadResult> {
    const resolvedTabId = this.requireTabId(tabId)
    const result = await this.session.uploadToFileChooser(resolvedTabId, paths)
    return { tabId: resolvedTabId, ...result }
  }

  async drop(
    tabId: number | undefined,
    targetId: string,
    data: DropData,
    paths: string[],
  ): Promise<DropResult> {
    const resolvedTabId = this.requireTabId(tabId)
    const result = await this.session.drop(resolvedTabId, targetId, data, paths)
    await this.refreshSnapshot(resolvedTabId).catch(() => undefined)
    return { tabId: resolvedTabId, targetId, ...result }
  }

  async handleDialog(
    tabId: number | undefined,
    options: DialogHandleOptions,
  ): Promise<DialogHandleResult> {
    const resolvedTabId = this.requireTabId(tabId)
    const result = await this.session.handleDialog(resolvedTabId, {
      accept: options.accept,
      promptText: options.promptText,
    })
    if (!result.dialog) {
      throw new AgruneBackendError('DIALOG_NOT_FOUND', 'No pending dialog is available to handle.')
    }
    return { tabId: resolvedTabId, armed: result.armed, dialog: result.dialog }
  }

  consoleMessages(tabId: number | undefined, query: ConsoleMessagesQuery = {}) {
    return this.session.consoleMessages(this.requireTabId(tabId), {
      level: query.level as ConsoleLevel | undefined,
      all: query.all,
    })
  }

  networkRequests(tabId: number | undefined, query: NetworkRequestsQuery = {}) {
    return this.session.networkRequests(this.requireTabId(tabId), {
      filter: query.filter,
      includeStatic: query.includeStatic,
      all: query.all,
    })
  }

  async networkRequestDetail(
    tabId: number | undefined,
    index: number,
    part?: NetworkRequestPart,
  ): Promise<NetworkRequestDetail> {
    return this.session.networkRequestDetail(this.requireTabId(tabId), index, part)
  }

  /** Direct session access for harnesses (e2e) that need the underlying Playwright objects. */
  get playwrightSession(): PlaywrightSession {
    return this.session
  }

  private requireTabId(tabId?: number): number {
    const resolved = this.resolveTabId(tabId)
    if (resolved === null) {
      throw new AgruneBackendError('SESSION_NOT_ACTIVE', 'No active browser tabs.')
    }
    return resolved
  }

  private async refreshSnapshot(tabId: number): Promise<PageSnapshot> {
    // A pending JS dialog freezes page script execution — snapshot evaluation
    // would deadlock until the dialog is handled. Serve the cached snapshot.
    if (this.hasPendingDialog(tabId)) {
      const cached = this.snapshots.get(tabId)
      if (cached) return cached
      throw new AgruneBackendError(
        'SESSION_NOT_ACTIVE',
        'Page is blocked by a pending dialog. Handle it with browser_handle_dialog first.',
      )
    }
    const snapshot = await this.session.snapshot(tabId, {
      allowMissingManifest: true,
      detectUnmapped: this.config.detectUnmapped,
    })
    this.snapshots.set(tabId, snapshot)
    if (this.config.surfaceScreenMessages) {
      this.axLines.set(tabId, await this.captureAxLines(tabId))
    }
    return snapshot
  }

  /**
   * Refresh the snapshot, then (when settleAfterActionMs > 0) keep re-capturing
   * until the snapshot signature stops changing or the budget is spent — so an
   * async effect (debounced validation, a button enabled after a fetch, a
   * next-tick re-render) is reflected rather than missed by an immediate capture.
   * Quiescence is judged on the snapshot VERSION, which excludes volatile targets,
   * so a ticking clock cannot keep the page "busy" forever. Returns the settled
   * snapshot.
   */
  private async settle(tabId: number): Promise<PageSnapshot> {
    let snapshot = await this.refreshSnapshot(tabId)
    const budget = this.config.settleAfterActionMs
    if (budget <= 0) return snapshot
    const deadline = Date.now() + budget
    const step = Math.min(50, budget)
    // A delayed effect (e.g. enable after a 300ms debounce) appears only AFTER a
    // quiet period, so we cannot early-exit on the first stable poll — that would
    // return the pre-effect state. Instead: once we have OBSERVED a change, return
    // as soon as it stabilizes; if nothing ever changes, wait out the full budget.
    let sawChange = false
    while (Date.now() < deadline) {
      await this.session.page(tabId).waitForTimeout(step).catch(() => {})
      const next = await this.refreshSnapshot(tabId)
      if (next.version !== snapshot.version) {
        sawChange = true
        snapshot = next
        continue
      }
      if (sawChange) return next // changed earlier, now stable → settled
      snapshot = next // still quiet; keep waiting for a possible delayed effect
    }
    return snapshot
  }

  /**
   * Live accessibility-tree lines for the screen-message delta. The full tree is
   * never shown to the agent — only the frame-to-frame delta of informational
   * lines (see screen-delta.ts). Returns [] on any failure so the delta degrades
   * to "no new messages" rather than throwing.
   */
  private async captureAxLines(tabId: number): Promise<string[]> {
    try {
      const yaml = await this.session.page(tabId).locator('body').ariaSnapshot()
      return yaml.split('\n')
    } catch {
      return []
    }
  }

  /**
   * App-authored on-screen messages (validation errors, toasts) that appeared
   * after the action — the informational delta of the accessibility tree. Empty
   * when disabled, when there is no baseline, or when nothing new surfaced.
   */
  private screenMessageDelta(
    beforeAx: string[] | null,
    afterAx: string[] | null,
    after: PageSnapshot | null,
  ): string[] {
    if (!this.config.surfaceScreenMessages || !beforeAx || !afterAx) return []
    // Exclude the live text of volatile targets (clocks, counters) so their churn
    // does not leak into the delta as a fake message. Robust for event-driven and
    // second-granularity updates; sub-refresh self-ticking can still skew a value.
    const volatileTexts = (after?.targets ?? [])
      .filter(target => target.volatile && target.textContent)
      .map(target => target.textContent as string)
    return axMessageDelta(beforeAx, afterAx, volatileTexts)
  }

  /**
   * Fold the optional authored feedback line, the screen-message delta, and the
   * deterministic `changed` bit into the dispatch result, leaving the result
   * untouched when none apply (keeps the legacy result shape for non-action
   * commands that surface no insights).
   */
  private withActionInsights(
    result: Record<string, unknown>,
    feedback: string | null,
    screenMessages: string[],
    changed: boolean | null,
    pendingRequired: string[],
  ): Record<string, unknown> {
    const hasChanged = typeof changed === 'boolean'
    if (!feedback && screenMessages.length === 0 && !hasChanged && pendingRequired.length === 0) {
      return result
    }
    return {
      ...result,
      ...(feedback ? { feedback } : {}),
      ...(screenMessages.length > 0 ? { screenMessages } : {}),
      ...(hasChanged ? { changed } : {}),
      ...(pendingRequired.length > 0 ? { pendingRequired } : {}),
    }
  }

  /**
   * Deterministic "still-needed fields" nudge (Problem 3): after an act/fill, the
   * names of visible required fillable fields that are still empty. Lets the agent
   * see WHICH inputs gate a Create/Next/Submit instead of inferring it from a
   * disabled button. Pure filter over the captured snapshot — no extra cost; gated
   * to action commands and off when surfaceRequiredFields is disabled.
   */
  private pendingRequired(command: { kind: string }, after: PageSnapshot | null): string[] {
    if (!this.config.surfaceRequiredFields) return []
    if (command.kind !== 'act' && command.kind !== 'fill') return []
    if (!after) return []
    return pendingRequiredFields(after.targets)
  }

  /**
   * Whether an act/fill actually changed the screen (snapshot version delta).
   * Surfaced to the agent as an explicit `changed` bit so an "ok but nothing
   * happened" outcome is unambiguous rather than something it must infer from the
   * snapshot. null for non-action commands or when there is no pre-action baseline.
   */
  private actionChanged(
    command: { kind: string },
    before: PageSnapshot | null,
    after: PageSnapshot | null,
  ): boolean | null {
    if (command.kind !== 'act' && command.kind !== 'fill') return null
    if (!before) return null
    return after == null || after.version !== before.version
  }

  /**
   * Manifest-authored post-action feedback, gated on the REAL screen-change bit
   * rather than "the action didn't throw". A change emits the acted target's
   * `onSuccess`; no change emits `onNoEffect` (e.g. a Next blocked by an empty
   * required field). The message is read from the PRE-action snapshot, where the
   * acted target is guaranteed present (it may be gone from the post-action
   * screen). Returns null when the outcome is N/A or no message was authored.
   */
  private actionFeedback(
    before: PageSnapshot | null,
    result: Record<string, unknown>,
    changed: boolean | null,
  ): string | null {
    if (changed === null || !before) return null
    const actedId = typeof result?.targetId === 'string' ? result.targetId : null
    if (!actedId) return null
    const entry = before.targets.find(target => target.targetId === actedId)
    if (!entry) return null
    const message = changed ? entry.onSuccess : entry.onNoEffect
    return message && message.length > 0 ? message : null
  }

  private hasPendingDialog(tabId: number): boolean {
    try {
      return this.session.dialogs(tabId).some(dialog => !dialog.handled)
    } catch {
      return false
    }
  }

  /**
   * Runtime FLOW_BLOCKED parity: while an overlay target is actionable, only
   * overlay targets may receive act/fill/drag commands.
   */
  private async flowBlockGate(
    tabId: number,
    command: Record<string, unknown> & { kind: string },
  ): Promise<{
    ok: false
    error: ReturnType<typeof createCommandError>
    snapshotVersion: number
    snapshot: PageSnapshot
  } | null> {
    if (command.kind !== 'act' && command.kind !== 'fill' && command.kind !== 'drag') return null
    const referencedIds = [command.targetId, command.sourceTargetId, command.destinationTargetId]
      .filter((value): value is string => typeof value === 'string')
    if (referencedIds.length === 0) return null

    const snapshot = await this.refreshSnapshot(tabId).catch(() => null)
    if (!snapshot) return null
    const flowLocked = snapshot.targets.some(entry => entry.overlay && entry.actionableNow)
    if (!flowLocked) return null

    // While an overlay flow is active, every referenced target must belong to
    // the overlay — a drag may not smuggle a non-overlay source/destination.
    const blockedId = referencedIds.find(id => {
      const target = snapshot.targets.find(entry => entry.targetId === id)
      return target !== undefined && !target.overlay
    })
    if (!blockedId) return null

    return {
      ok: false,
      error: createCommandError('FLOW_BLOCKED', `target is blocked by active overlay flow: ${blockedId}`, {
        snapshotVersion: snapshot.version,
        targetId: blockedId,
      }),
      snapshotVersion: snapshot.version,
      snapshot,
    }
  }

  private async dispatchCommand(
    tabId: number,
    command: Record<string, unknown> & { kind: string },
  ): Promise<Record<string, unknown>> {
    switch (command.kind) {
      case 'act': {
        const targetId = requireString(command, 'targetId')
        const action = typeof command.action === 'string' ? command.action : 'click'
        await this.animatePointerForTarget(tabId, targetId)
        const interruption = await this.session.click(tabId, targetId, action, {
          button: command.button as never,
          modifiers: command.modifiers as never,
          doubleClick: command.doubleClick === true,
        })
        return {
          actionKind: action,
          targetId,
          ...(interruption.dialog ? { dialog: interruption.dialog } : {}),
          ...(interruption.fileChooser ? { fileChooser: interruption.fileChooser } : {}),
        }
      }
      case 'fill': {
        const targetId = requireString(command, 'targetId')
        const value = requireString(command, 'value')
        const strategy = await this.session.fill(
          tabId,
          targetId,
          value,
          command.clear !== false,
          (command.strategy as FillStrategy | undefined) ?? 'auto',
        )
        return { targetId, strategy }
      }
      case 'drag':
        return this.dispatchDrag(tabId, command)
      case 'wait':
        return this.dispatchWait(tabId, command)
      case 'read': {
        const text = await this.session.read(tabId)
        return { text }
      }
      case 'pointer':
        return this.dispatchPointer(tabId, command)
      default:
        throw new AgruneBackendError('INVALID_COMMAND', `Unsupported command kind: ${command.kind}`, {
          kind: command.kind,
        })
    }
  }

  private async dispatchDrag(
    tabId: number,
    command: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sourceTargetId = requireString(command, 'sourceTargetId')

    if (typeof command.destinationTargetId === 'string') {
      await this.session.drag(tabId, sourceTargetId, command.destinationTargetId)
      return { sourceTargetId, destinationTargetId: command.destinationTargetId }
    }

    const coords = command.destinationCoords as
      | { x: number; y: number }
      | { relativeTo: string; dx: number; dy: number }
      | undefined
    if (!coords) {
      throw new AgruneBackendError(
        'INVALID_COMMAND',
        'drag requires destinationTargetId or destinationCoords.',
      )
    }

    const destination = 'relativeTo' in coords
      ? offsetFromTarget(await this.targetCenter(tabId, coords.relativeTo), coords.dx, coords.dy)
      : { x: coords.x, y: coords.y }

    const source = await this.targetCenter(tabId, sourceTargetId)
    const page = this.session.page(tabId)
    await page.mouse.move(source.x, source.y)
    await page.mouse.down()
    await page.mouse.move(destination.x, destination.y, { steps: 12 })
    await page.mouse.up()
    return { sourceTargetId, destinationCoords: destination }
  }

  private async dispatchWait(
    tabId: number,
    command: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const timeoutMs = typeof command.timeoutMs === 'number' ? command.timeoutMs : undefined

    if (typeof command.targetId === 'string') {
      const state = typeof command.state === 'string' ? command.state : 'visible'
      await this.session.waitForTarget(
        tabId,
        command.targetId,
        state as 'visible' | 'hidden' | 'enabled' | 'disabled',
        timeoutMs,
      )
      return { targetId: command.targetId, state }
    }
    if (typeof command.text === 'string') {
      await this.session.waitForText(tabId, command.text, 'visible', timeoutMs)
      return { text: command.text }
    }
    if (typeof command.textGone === 'string') {
      await this.session.waitForText(tabId, command.textGone, 'hidden', timeoutMs)
      return { textGone: command.textGone }
    }
    if (typeof command.timeMs === 'number') {
      await this.session.waitForTime(tabId, command.timeMs)
      return { timeMs: command.timeMs }
    }
    throw new AgruneBackendError('INVALID_COMMAND', 'wait requires targetId, text, textGone, or time.')
  }

  private async dispatchPointer(
    tabId: number,
    command: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const actions = command.actions as PointerAction[] | undefined
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new AgruneBackendError('INVALID_COMMAND', 'pointer requires a non-empty actions array.')
    }

    const page = this.session.page(tabId)
    for (const action of actions) {
      switch (action.type) {
        case 'pointerdown':
          await page.mouse.move(action.x, action.y)
          await page.mouse.down()
          break
        case 'pointermove':
          await page.mouse.move(action.x, action.y, { steps: 4 })
          break
        case 'pointerup':
          await page.mouse.move(action.x, action.y)
          await page.mouse.up()
          break
        case 'wheel': {
          await page.mouse.move(action.x, action.y)
          if (action.ctrlKey) await page.keyboard.down('Control')
          const steps = Math.max(1, Math.floor(action.steps ?? 1))
          const stepDelayMs = typeof action.durationMs === 'number' && steps > 0
            ? action.durationMs / steps
            : 0
          for (let step = 0; step < steps; step += 1) {
            await page.mouse.wheel(0, action.deltaY / steps)
            if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs)
          }
          if (action.ctrlKey) await page.keyboard.up('Control')
          break
        }
      }
      if (typeof action.delayMs === 'number' && action.delayMs > 0) {
        await page.waitForTimeout(action.delayMs)
      }
    }
    return { actions: actions.length }
  }

  /**
   * Decorative cursor flight to the target before an act command. The cached
   * snapshot is fresh here (flowBlockGate just refreshed it). Best-effort —
   * any failure falls through to the real action.
   */
  private async animatePointerForTarget(tabId: number, targetId: string): Promise<void> {
    if (!this.visualsInstalled || !this.config.pointerAnimation) return
    const center = this.snapshots.get(tabId)?.targets.find(t => t.targetId === targetId)?.center
    if (!center) return
    const page = this.session.page(tabId)
    await page.evaluate(
      ({ x, y, config }) => {
        const visual = (window as unknown as {
          __agrune_visual__?: {
            applyConfig(config: unknown): void
            animatePointer(x: number, y: number): Promise<void>
          }
        }).__agrune_visual__
        if (!visual) return
        visual.applyConfig(config)
        return visual.animatePointer(x, y)
      },
      { x: center.x, y: center.y, config: this.config as unknown },
    ).catch(() => undefined)
  }

  private async targetCenter(tabId: number, targetRef: string): Promise<{ x: number; y: number }> {
    const locator = await this.session.locatorForTarget(tabId, targetRef)
    const box = await locator.boundingBox()
    if (!box) {
      throw new AgruneBackendError('NOT_VISIBLE', `Target has no visible bounding box: ${targetRef}`, {
        target: targetRef,
      })
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
}

function snapshotEnvelope(
  snapshot: PageSnapshot | null,
): { snapshotVersion: number; snapshot: PageSnapshot } | Record<string, never> {
  return snapshot ? { snapshotVersion: snapshot.version, snapshot } : {}
}

function requireString(command: Record<string, unknown>, key: string): string {
  const value = command[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new AgruneBackendError('INVALID_COMMAND', `Command requires ${key} (string).`, { key })
  }
  return value
}

function offsetFromTarget(center: { x: number; y: number }, dx: number, dy: number): { x: number; y: number } {
  return { x: center.x + dx, y: center.y + dy }
}

function toCommandErrorParts(error: unknown): {
  code: CommandErrorCode
  message: string
  details?: Record<string, unknown>
} {
  if (error instanceof AgruneBackendError) {
    return {
      code: toCommandErrorCode(error.code),
      message: error.message,
      details: error.details,
    }
  }
  if (error instanceof Error) {
    return {
      code: error.name === 'TimeoutError' ? 'TIMEOUT' : 'INVALID_COMMAND',
      message: error.message,
    }
  }
  return { code: 'INVALID_COMMAND', message: String(error) }
}

function toCommandErrorCode(code: string): CommandErrorCode {
  switch (code) {
    case 'TARGET_NOT_FOUND':
      return 'TARGET_NOT_FOUND'
    case 'INVALID_TARGET':
      return 'INVALID_TARGET'
    case 'NOT_VISIBLE':
      return 'NOT_VISIBLE'
    case 'FLOW_BLOCKED':
      return 'FLOW_BLOCKED'
    case 'TIMEOUT':
      return 'TIMEOUT'
    case 'SESSION_NOT_ACTIVE':
    case 'TAB_NOT_FOUND':
      return 'SESSION_NOT_ACTIVE'
    case 'MANIFEST_NOT_FOUND':
    case 'INVALID_MANIFEST':
      return 'INVALID_MANIFEST'
    default:
      return 'INVALID_COMMAND'
  }
}
