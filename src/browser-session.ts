// The daemon's browser owner: one chromium Browser + BrowserContext + a tab registry.
// Public Playwright API only (SPEC §2.4). Chromium-only for v1 (DECISIONS / §11 #29).
//
// M1: launch, tab registry (with popup auto-registration), navigation, resize, tab lifecycle.
// M4 extends this with console/network/dialog recorders, the snapshot store, and the action
// dispatch table.

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import { CliError } from './errors.js'
import type { PublicTab } from './types.js'
import {
  createSnapshotStore,
  refreshSnapshot,
  ariaSnapshot as ariaSnapshotImpl,
  type PageSnapshot,
  type SnapshotStore,
  type AriaSnapshotOptions,
} from './snapshot.js'
import { resolveTargetOrSelectorLocator } from './resolver.js'

interface TabEntry {
  id: number
  page: Page
  store: SnapshotStore
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
    // App-opened pages (window.open / target=_blank) become first-class tabs.
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

  /** Public context accessor for action handlers (M4+). */
  get browserContext(): BrowserContext {
    return this.context
  }

  private registerPage(page: Page): TabEntry {
    for (const existing of this.tabs.values()) {
      if (existing.page === page) return existing
    }
    const id = ++this.counter
    const entry: TabEntry = { id, page, store: createSnapshotStore() }
    this.tabs.set(id, entry)
    // Reset the snapshot version store on main-frame navigation (§4.4).
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) entry.store = createSnapshotStore()
    })
    this.order.push(id)
    if (this.activeId === null) this.activeId = id
    page.on('close', () => this.unregister(id))
    return entry
  }

  private unregister(id: number): void {
    this.tabs.delete(id)
    const idx = this.order.indexOf(id)
    if (idx !== -1) this.order.splice(idx, 1)
    if (this.activeId === id) {
      this.activeId = this.order.length > 0 ? this.order[this.order.length - 1]! : null
    }
  }

  /** Resolve a tab entry by id (or the active tab when id is undefined). */
  private entry(tabId?: number): TabEntry {
    const id = tabId ?? this.activeId
    if (id === null || id === undefined) {
      throw new CliError('SESSION_NOT_ACTIVE', 'No active tab. Open a page first with "agrune open <url>".')
    }
    const entry = this.tabs.get(id)
    if (!entry) {
      throw new CliError('TAB_NOT_FOUND', `Tab not found: ${id}`, { tabId: id })
    }
    return entry
  }

  /** Resolve a Page for action handlers (M4+). */
  page(tabId?: number): Page {
    return this.entry(tabId).page
  }

  // ---- perception (M3) -----------------------------------------------------

  /** Build the manifest-derived snapshot for a tab (empty snapshot when no manifest). */
  async snapshot(tabId?: number): Promise<PageSnapshot> {
    const entry = this.entry(tabId)
    return refreshSnapshot(entry.page, entry.store)
  }

  /** a11y escape hatch — pass-through to Playwright's ariaSnapshot. */
  async ariaSnapshot(
    tabId: number | undefined,
    opts: AriaSnapshotOptions,
  ): Promise<{ text: string; mode: 'ai' | 'default'; target?: string; depth?: number }> {
    const entry = this.entry(tabId)
    const resolveTarget = (ref: string): Promise<Locator> =>
      resolveTargetOrSelectorLocator(entry.page, ref)
    return ariaSnapshotImpl(entry.page, resolveTarget, opts)
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

  /** Resolve a tabId from a server-side `--index`, via current order (A.2.2). */
  tabIdByIndex(index: number): number {
    const id = this.order[index]
    if (id === undefined) {
      throw new CliError('TAB_NOT_FOUND', `No tab at index ${index}`, { index })
    }
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
}
