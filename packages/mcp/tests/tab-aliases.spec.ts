import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  AgruneRuntimeConfig,
  BrowserDriver,
  CloseTabResult,
  CommandResult,
  ConsoleLevel,
  ConsoleMessageEntry,
  ConsoleMessagesQuery,
  DialogHandleOptions,
  DialogHandleResult,
  DropData,
  DropResult,
  EvaluateResult,
  FileUploadResult,
  FillFormField,
  FillFormResult,
  FocusResult,
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
  ScreenshotResult,
  SelectOptionResult,
  Session,
  TypeTextOptions,
  TypeTextResult,
} from '@agrune/core'
import { createMcpServer } from '../src/index'

describe('Playwright-style tab MCP aliases', () => {
  it('browser_tabs list exposes stable zero-based indexes without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A'),
      session(22, 'https://b.test', 'B', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_tabs', { action: 'list' })

    expect(driver.ensureReadyCount).toBe(0)
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.text)).toEqual([
      expect.objectContaining({ index: 0, tabId: 11, active: false }),
      expect.objectContaining({ index: 1, tabId: 22, active: true }),
    ])
  })

  it('browser_tabs select maps index to tabId', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
      session(22, 'https://b.test', 'B'),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_tabs', { action: 'select', index: 1 })
    const parsed = JSON.parse(result.text)

    expect(result.isError).toBeUndefined()
    expect(driver.focusedTabIds).toEqual([22])
    expect(parsed).toMatchObject({
      ok: true,
      index: 1,
      session: { tabId: 22, wasActive: false, becameActive: true },
    })
  })

  it('browser_tabs new delegates to openTab and returns the new index', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_tabs', {
      action: 'new',
      url: 'https://new.test',
    })
    const parsed = JSON.parse(result.text)

    expect(result.isError).toBeUndefined()
    expect(driver.openedUrls).toEqual(['https://new.test'])
    expect(parsed).toMatchObject({
      ok: true,
      index: 1,
      tabId: 23,
      url: 'https://new.test',
    })
  })

  it('browser_tabs close maps explicit index to tabId', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
      session(22, 'https://b.test', 'B'),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_tabs', { action: 'close', index: 1 })
    const parsed = JSON.parse(result.text)

    expect(result.isError).toBeUndefined()
    expect(driver.closedTabIds).toEqual([22])
    expect(parsed).toMatchObject({
      ok: true,
      index: 1,
      tabId: 22,
      closed: true,
      remaining: [expect.objectContaining({ tabId: 11 })],
    })
  })

  it('browser_close closes the active tab', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A'),
      session(22, 'https://b.test', 'B', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_close', {})
    const parsed = JSON.parse(result.text)

    expect(result.isError).toBeUndefined()
    expect(driver.closedTabIds).toEqual([22])
    expect(parsed).toMatchObject({
      ok: true,
      tabId: 22,
      closed: true,
      remaining: [expect.objectContaining({ tabId: 11 })],
    })
  })

  it('browser_tabs invalid index returns TAB_NOT_FOUND', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_tabs', { action: 'select', index: 2 })
    const parsed = JSON.parse(result.text)

    expect(result.isError).toBe(true)
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: 'TAB_NOT_FOUND' },
    })
  })

  it('browser_navigate delegates to the active tab without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_navigate', { url: 'https://next.test' })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.navigatedUrls).toEqual(['https://next.test'])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'navigate',
      tabId: 11,
      url: 'https://next.test',
    })
  })

  it('browser_navigate_back delegates to the active tab without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://next.test', 'Next', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_navigate_back', {})
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.backNavigationCount).toBe(1)
    expect(parsed).toMatchObject({
      ok: true,
      action: 'navigateBack',
      tabId: 11,
      url: 'https://previous.test',
    })
  })

  it('browser_resize delegates to the active tab without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_resize', { width: 900, height: 700 })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.resizedTo).toEqual([{ tabId: 11, width: 900, height: 700 }])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'resize',
      tabId: 11,
      width: 900,
      height: 700,
    })
  })

  it('browser_take_screenshot captures the active tab without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_take_screenshot', {
      filename: 'out.jpg',
      type: 'jpeg',
      fullPage: true,
    })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.screenshots).toEqual([
      { tabId: 11, path: 'out.jpg', options: { fullPage: true, type: 'jpeg' } },
    ])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'screenshot',
      tabId: 11,
      path: 'out.jpg',
      type: 'jpeg',
      fullPage: true,
    })
  })

  it('browser_take_screenshot rejects fullPage target screenshots', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_take_screenshot', {
      filename: 'out.png',
      targetId: 'save_button',
      fullPage: true,
    })
    const parsed = JSON.parse(result.text)

    expect(result.isError).toBe(true)
    expect(driver.screenshots).toEqual([])
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: 'INVALID_COMMAND' },
    })
  })

  it('browser_evaluate evaluates the active tab without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_evaluate', {
      function: '() => "ok"',
    })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.evaluations).toEqual([
      { tabId: 11, source: '() => "ok"', options: {} },
    ])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'evaluate',
      tabId: 11,
      result: 'evaluated',
    })
  })

  it('browser_evaluate can write the result to a file', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-mcp-'))
    try {
      const driver = createMockDriver([
        session(11, 'https://a.test', 'A', true),
      ])
      const { handleToolCall } = createMcpServer(driver)
      const filename = join(tempDir, 'eval-result.json')

      const result = await handleToolCall('browser_evaluate', {
        function: '() => ({ ok: true })',
        filename,
      })
      const parsed = JSON.parse(result.text)

      expect(parsed).toMatchObject({
        ok: true,
        action: 'evaluate',
        path: filename,
      })
      expect(await readFile(filename, 'utf8')).toBe('evaluated')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('browser_run_code_unsafe runs code on the active tab without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_run_code_unsafe', {
      code: 'async (page) => page.url()',
    })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.unsafeRuns).toEqual([
      { tabId: 11, source: 'async (page) => page.url()' },
    ])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'run_code_unsafe',
      tabId: 11,
      result: 'unsafe result',
    })
  })

  it('browser_run_code_unsafe loads filename code before inline code', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-mcp-'))
    try {
      const filename = join(tempDir, 'run-code.js')
      await writeFile(filename, 'async (page) => page.title()')
      const driver = createMockDriver([
        session(11, 'https://a.test', 'A', true),
      ])
      const { handleToolCall } = createMcpServer(driver)

      const result = await handleToolCall('browser_run_code_unsafe', {
        code: 'async () => "inline"',
        filename,
      })
      const parsed = JSON.parse(result.text)

      expect(driver.unsafeRuns).toEqual([
        { tabId: 11, source: 'async (page) => page.title()' },
      ])
      expect(parsed).toMatchObject({
        ok: true,
        action: 'run_code_unsafe',
        filename,
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('browser_run_code_unsafe rejects missing code and filename', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_run_code_unsafe', {})
    const parsed = JSON.parse(result.text)

    expect(result.isError).toBe(true)
    expect(driver.unsafeRuns).toEqual([])
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: 'INVALID_COMMAND' },
    })
  })

  it('browser_console_messages reads active-tab messages without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_console_messages', { level: 'warning' })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(parsed).toMatchObject({
      ok: true,
      action: 'console.messages',
      messages: [
        expect.objectContaining({ level: 'warning', text: 'warned' }),
        expect.objectContaining({ level: 'error', text: 'failed' }),
      ],
    })
    expect(parsed.messages.some((message: { level: string }) => message.level === 'info')).toBe(false)
  })

  it('browser_console_messages can write messages to a file', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-mcp-'))
    try {
      const driver = createMockDriver([
        session(11, 'https://a.test', 'A', true),
      ])
      const { handleToolCall } = createMcpServer(driver)
      const filename = join(tempDir, 'console.json')

      const result = await handleToolCall('browser_console_messages', { filename, level: 'info' })
      const parsed = JSON.parse(result.text)

      expect(parsed).toMatchObject({
        ok: true,
        action: 'console.messages',
        path: filename,
      })
      expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual(parsed.messages)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('browser_network_requests reads active-tab requests without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_network_requests', { filter: '/api' })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.networkQueryCount).toBe(1)
    expect(parsed).toMatchObject({
      ok: true,
      action: 'network.requests',
      requests: [
        expect.objectContaining({ index: 1, url: 'https://a.test/api/data', resourceType: 'fetch' }),
      ],
    })
  })

  it('browser_network_request reads request parts and can save output', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-mcp-'))
    try {
      const driver = createMockDriver([
        session(11, 'https://a.test', 'A', true),
      ])
      const { handleToolCall } = createMcpServer(driver)
      const filename = join(tempDir, 'network.json')

      const result = await handleToolCall('browser_network_request', {
        index: 1,
        part: 'response-body',
        filename,
      })
      const parsed = JSON.parse(result.text)

      expect(parsed).toMatchObject({
        ok: true,
        action: 'network.request',
        part: 'response-body',
        value: '{"ok":true}',
        path: filename,
      })
      expect(JSON.parse(await readFile(filename, 'utf8'))).toMatchObject({
        part: 'response-body',
        value: '{"ok":true}',
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('browser_press_key presses a key on the active tab without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_press_key', { key: 'Enter' })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.pressedKeys).toEqual([{ tabId: 11, key: 'Enter' }])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'press',
      tabId: 11,
      key: 'Enter',
    })
  })

  it('browser_type types text into a target after the ready gate passes', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    driver.readyError = null
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_type', {
      targetId: 'cc-number',
      text: 'Ada',
      slowly: true,
      submit: true,
    })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(1)
    expect(driver.typedText).toEqual([{
      tabId: 11,
      targetId: 'cc-number',
      text: 'Ada',
      options: { slowly: true, submit: true },
    }])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'type',
      tabId: 11,
      target: 'cc-number',
      text: 'Ada',
      submitted: true,
    })
  })

  it('browser_select_option selects values after the ready gate passes', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    driver.readyError = null
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_select_option', {
      targetId: 'country',
      values: ['kr'],
    })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(1)
    expect(driver.selectedOptions).toEqual([{
      tabId: 11,
      targetId: 'country',
      values: ['kr'],
    }])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'select',
      tabId: 11,
      target: 'country',
      values: ['kr'],
    })
  })

  it('browser_fill_form fills multiple fields after the ready gate passes', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    driver.readyError = null
    const { handleToolCall } = createMcpServer(driver)

    const fields: FillFormField[] = [
      { name: 'Email', targetId: 'email', type: 'textbox', value: 'ada@example.test' },
      { name: 'Subscribe', targetId: 'subscribe', type: 'checkbox', value: true },
    ]
    const result = await handleToolCall('browser_fill_form', { fields })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(1)
    expect(driver.filledForms).toEqual([{ tabId: 11, fields }])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'fill-form',
      tabId: 11,
      fields: [
        { name: 'Email', target: 'email', type: 'textbox' },
        { name: 'Subscribe', target: 'subscribe', type: 'checkbox' },
      ],
    })
  })

  it('browser_file_upload uploads to a pending file chooser after the ready gate passes', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    driver.readyError = null
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_file_upload', {
      paths: ['/tmp/profile.txt'],
    })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(1)
    expect(driver.uploadedFiles).toEqual([{ tabId: 11, paths: ['/tmp/profile.txt'] }])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'file-upload',
      tabId: 11,
      paths: ['/tmp/profile.txt'],
      cancelled: false,
      fileChooser: {
        handled: true,
        cancelled: false,
      },
    })
  })

  it('browser_drop drops MIME data and files after the ready gate passes', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    driver.readyError = null
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_drop', {
      targetId: 'drop-zone',
      data: { 'text/plain': 'plain text' },
      paths: ['/tmp/drop.txt'],
    })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(1)
    expect(driver.droppedPayloads).toEqual([{
      tabId: 11,
      targetId: 'drop-zone',
      data: { 'text/plain': 'plain text' },
      paths: ['/tmp/drop.txt'],
    }])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'drop',
      tabId: 11,
      target: 'drop-zone',
      paths: ['/tmp/drop.txt'],
      dataTypes: ['text/plain'],
    })
  })

  it('browser_snapshot returns a full Playwright-style snapshot after the ready gate passes', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    driver.readyError = null
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_snapshot', {
      includeTextContent: true,
      boxes: true,
    })

    expect(driver.ensureReadyCount).toBe(1)
    expect(result.isError).toBeUndefined()
    expect(result.text).toContain('### Page')
    expect(result.text).toContain('- target "Save" [ref=save_button]')
    expect(result.text).toContain('- target "Cancel" [ref=cancel_button]')
    expect(result.text).toContain('text: "Save changes"')
  })

  it('browser_snapshot can scope to one target and write the snapshot to a file', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-mcp-'))
    try {
      const driver = createMockDriver([
        session(11, 'https://a.test', 'A', true),
      ])
      driver.readyError = null
      const { handleToolCall } = createMcpServer(driver)
      const filename = join(tempDir, 'snapshot.md')

      const result = await handleToolCall('browser_snapshot', {
        target: 'save_button',
        filename,
      })
      const parsed = JSON.parse(result.text)
      const fileText = await readFile(filename, 'utf8')

      expect(parsed).toMatchObject({
        ok: true,
        action: 'snapshot',
        tabId: 11,
        path: filename,
      })
      expect(fileText).toContain('- target "Save" [ref=save_button]')
      expect(fileText).not.toContain('- target "Cancel" [ref=cancel_button]')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('browser_handle_dialog handles a pending dialog without requiring a ready snapshot', async () => {
    const driver = createMockDriver([
      session(11, 'https://a.test', 'A', true),
    ])
    const { handleToolCall } = createMcpServer(driver)

    const result = await handleToolCall('browser_handle_dialog', {
      accept: true,
      promptText: 'Ada',
    })
    const parsed = JSON.parse(result.text)

    expect(driver.ensureReadyCount).toBe(0)
    expect(driver.handledDialogs).toEqual([{
      tabId: 11,
      options: { accept: true, promptText: 'Ada' },
    }])
    expect(parsed).toMatchObject({
      ok: true,
      action: 'dialog.handle',
      tabId: 11,
      armed: false,
      dialog: {
        tabId: 11,
        type: 'prompt',
        handled: true,
        accepted: true,
        promptText: 'Ada',
      },
    })
  })
})

type MockDriver = BrowserDriver & {
  readyError: string | null
  snapshot: PageSnapshot | null
  ensureReadyCount: number
  focusedTabIds: number[]
  openedUrls: string[]
  closedTabIds: number[]
  navigatedUrls: string[]
  backNavigationCount: number
  resizedTo: Array<{ tabId: number; width: number; height: number }>
  screenshots: Array<{
    tabId: number
    path: string
    options: { fullPage?: boolean; targetId?: string; type?: 'png' | 'jpeg' }
  }>
  evaluations: Array<{
    tabId: number
    source: string
    options: { targetId?: string }
  }>
  unsafeRuns: Array<{ tabId: number; source: string }>
  consoleQueryCount: number
  networkQueryCount: number
  pressedKeys: Array<{ tabId: number; key: string }>
  typedText: Array<{ tabId: number; targetId: string; text: string; options: TypeTextOptions }>
  selectedOptions: Array<{ tabId: number; targetId: string; values: string[] }>
  filledForms: Array<{ tabId: number; fields: FillFormField[] }>
  uploadedFiles: Array<{ tabId: number; paths: string[] }>
  droppedPayloads: Array<{ tabId: number; targetId: string; data: DropData; paths: string[] }>
  handledDialogs: Array<{ tabId: number; options: DialogHandleOptions }>
}

function createMockDriver(initialSessions: Session[]): MockDriver {
  let connected = false
  let sessions = initialSessions.map(s => ({ ...s }))
  let nextTabId = 23
  let activeTabId = sessions.find(s => s.active)?.tabId ?? null

  const driver: MockDriver = {
    ensureReadyCount: 0,
    readyError: 'ready gate should not run',
    snapshot: mockSnapshot(),
    focusedTabIds: [],
    openedUrls: [],
    closedTabIds: [],
    navigatedUrls: [],
    backNavigationCount: 0,
    resizedTo: [],
    screenshots: [],
    evaluations: [],
    unsafeRuns: [],
    consoleQueryCount: 0,
    networkQueryCount: 0,
    pressedKeys: [],
    typedText: [],
    selectedOptions: [],
    filledForms: [],
    uploadedFiles: [],
    droppedPayloads: [],
    handledDialogs: [],
    async connect() {
      connected = true
    },
    async disconnect() {
      connected = false
    },
    isConnected() {
      return connected
    },
    listSessions() {
      return sessions.map(s => ({
        ...s,
        active: s.tabId === activeTabId,
      }))
    },
    getSnapshot(_tabId: number): PageSnapshot | null {
      return driver.snapshot
    },
    onSessionOpen(_cb: (session: Session) => void) {},
    onSessionClose(_cb: (tabId: number) => void) {},
    onSnapshotUpdate(_cb: (tabId: number, snapshot: PageSnapshot) => void) {},
    async execute(_tabId: number, _command: Record<string, unknown> & { kind: string }): Promise<CommandResult> {
      throw new Error('execute should not be called')
    },
    updateConfig(_config: Partial<AgruneRuntimeConfig>) {},
    async ensureReady() {
      driver.ensureReadyCount += 1
      return driver.readyError
    },
    resolveTabId(tabId?: number) {
      if (typeof tabId === 'number') return tabId
      if (activeTabId !== null && sessions.some(s => s.tabId === activeTabId)) return activeTabId
      return sessions[0]?.tabId ?? null
    },
    async focusSession(tabId: number): Promise<FocusResult> {
      const found = sessions.find(s => s.tabId === tabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${tabId}.` }
      const wasActive = activeTabId === tabId
      activeTabId = tabId
      driver.focusedTabIds.push(tabId)
      return { tabId, wasActive, becameActive: true }
    },
    async openTab(url: string): Promise<OpenTabResult> {
      driver.openedUrls.push(url)
      const tabId = nextTabId++
      sessions.push(session(tabId, url, '', true))
      activeTabId = tabId
      return { tabId, url, title: '' }
    },
    async closeTab(tabId?: number): Promise<CloseTabResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available to close.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      sessions = sessions.filter(s => s.tabId !== resolvedTabId)
      if (activeTabId === resolvedTabId) activeTabId = null
      driver.closedTabIds.push(resolvedTabId)
      return { tabId: resolvedTabId, closed: true }
    },
    async navigateTab(tabId: number | undefined, url: string): Promise<NavigationResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available to navigate.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.navigatedUrls.push(url)
      found.url = url
      found.title = 'Next'
      activeTabId = resolvedTabId
      return { tabId: resolvedTabId, url, title: found.title }
    },
    async navigateBack(tabId?: number): Promise<NavigationResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available to navigate back.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.backNavigationCount += 1
      found.url = 'https://previous.test'
      found.title = 'Previous'
      activeTabId = resolvedTabId
      return { tabId: resolvedTabId, url: found.url, title: found.title }
    },
    async resizeTab(tabId: number | undefined, width: number, height: number): Promise<ResizeResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available to resize.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.resizedTo.push({ tabId: resolvedTabId, width, height })
      activeTabId = resolvedTabId
      return { tabId: resolvedTabId, width, height }
    },
    async screenshotTab(
      tabId: number | undefined,
      path: string,
      options: { fullPage?: boolean; targetId?: string; type?: 'png' | 'jpeg' } = {},
    ): Promise<ScreenshotResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available to screenshot.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.screenshots.push({ tabId: resolvedTabId, path, options })
      activeTabId = resolvedTabId
      return {
        tabId: resolvedTabId,
        path,
        type: options.type ?? 'png',
        fullPage: options.fullPage === true,
        ...(options.targetId ? { targetId: options.targetId } : {}),
      }
    },
    async evaluateTab(
      tabId: number | undefined,
      source: string,
      options: { targetId?: string } = {},
    ): Promise<EvaluateResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available to evaluate.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.evaluations.push({ tabId: resolvedTabId, source, options })
      activeTabId = resolvedTabId
      return {
        tabId: resolvedTabId,
        result: 'evaluated',
        ...(options.targetId ? { targetId: options.targetId } : {}),
      }
    },
    async runCodeUnsafe(tabId: number | undefined, source: string): Promise<RunCodeUnsafeResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available to run code.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.unsafeRuns.push({ tabId: resolvedTabId, source })
      activeTabId = resolvedTabId
      return {
        tabId: resolvedTabId,
        result: 'unsafe result',
      }
    },
    consoleMessages(tabId: number | undefined, query: ConsoleMessagesQuery = {}): ConsoleMessageEntry[] {
      driver.consoleQueryCount += 1
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) return []
      const messages: ConsoleMessageEntry[] = [
        consoleMessage(resolvedTabId, 'info', 'info', 'hello'),
        consoleMessage(resolvedTabId, 'warning', 'warning', 'warned'),
        consoleMessage(resolvedTabId, 'error', 'error', 'failed'),
      ]
      const minSeverity = severityForLevel(query.level ?? 'info')
      return messages.filter(message => severityForLevel(message.level) >= minSeverity)
    },
    networkRequests(tabId: number | undefined, query: NetworkRequestsQuery = {}): NetworkRequestSummary[] {
      driver.networkQueryCount += 1
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) return []
      return networkRequestSummaries(resolvedTabId).filter(request => {
        if (!query.includeStatic && request.resourceType === 'script') return false
        if (!query.filter) return true
        return request.url.includes(query.filter)
      })
    },
    async networkRequestDetail(
      tabId: number | undefined,
      index: number,
      part?: NetworkRequestPart,
    ): Promise<NetworkRequestDetail> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available for network request lookup.' }
      const request = networkRequestSummaries(resolvedTabId).find(candidate => candidate.index === index)
      if (!request) throw { code: 'NETWORK_REQUEST_NOT_FOUND', message: `Network request not found: ${index}` }
      if (part) {
        return {
          request,
          part,
          value: part.includes('headers') ? { 'content-type': 'application/json' } : '{"ok":true}',
        }
      }
      return {
        request,
        requestHeaders: { accept: '*/*' },
        requestBody: null,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: '{"ok":true}',
      }
    },
    async pressKey(tabId: number | undefined, key: string): Promise<PressKeyResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available for key press.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.pressedKeys.push({ tabId: resolvedTabId, key })
      activeTabId = resolvedTabId
      return { tabId: resolvedTabId, key }
    },
    async typeText(
      tabId: number | undefined,
      targetId: string,
      text: string,
      options: TypeTextOptions = {},
    ): Promise<TypeTextResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available for typing.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.typedText.push({ tabId: resolvedTabId, targetId, text, options })
      activeTabId = resolvedTabId
      return { tabId: resolvedTabId, targetId, text, submitted: options.submit === true }
    },
    async selectOptions(tabId: number | undefined, targetId: string, values: string[]): Promise<SelectOptionResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available for option selection.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.selectedOptions.push({ tabId: resolvedTabId, targetId, values })
      activeTabId = resolvedTabId
      return { tabId: resolvedTabId, targetId, values }
    },
    async fillForm(tabId: number | undefined, fields: FillFormField[]): Promise<FillFormResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available for form filling.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.filledForms.push({ tabId: resolvedTabId, fields })
      activeTabId = resolvedTabId
      return {
        tabId: resolvedTabId,
        fields: fields.map(field => ({
          ...(field.name ? { name: field.name } : {}),
          targetId: field.targetId,
          type: field.type,
        })),
      }
    },
    async fileUpload(tabId: number | undefined, paths: string[]): Promise<FileUploadResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available for file upload.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.uploadedFiles.push({ tabId: resolvedTabId, paths })
      activeTabId = resolvedTabId
      return {
        tabId: resolvedTabId,
        paths,
        cancelled: paths.length === 0,
        fileChooser: {
          id: 1,
          tabId: resolvedTabId,
          timestamp: 123,
          multiple: true,
          handled: true,
          paths,
          cancelled: paths.length === 0,
        },
      }
    },
    async drop(
      tabId: number | undefined,
      targetId: string,
      data: DropData,
      paths: string[],
    ): Promise<DropResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available for drop.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.droppedPayloads.push({ tabId: resolvedTabId, targetId, data: { ...data }, paths })
      activeTabId = resolvedTabId
      return {
        tabId: resolvedTabId,
        targetId,
        paths,
        dataTypes: Object.keys(data),
      }
    },
    async handleDialog(
      tabId: number | undefined,
      options: DialogHandleOptions,
    ): Promise<DialogHandleResult> {
      const resolvedTabId = driver.resolveTabId(tabId)
      if (resolvedTabId == null) throw { code: 'TAB_NOT_FOUND', message: 'No browser tab is available for dialog handling.' }
      const found = sessions.find(s => s.tabId === resolvedTabId)
      if (!found) throw { code: 'TAB_NOT_FOUND', message: `No session exists for tabId ${resolvedTabId}.` }
      driver.handledDialogs.push({ tabId: resolvedTabId, options: { ...options } })
      activeTabId = resolvedTabId
      return {
        tabId: resolvedTabId,
        armed: false,
        dialog: {
          id: 1,
          tabId: resolvedTabId,
          type: 'prompt',
          message: 'Name?',
          defaultValue: 'Anon',
          timestamp: 123,
          handled: true,
          accepted: options.accept,
          ...(typeof options.promptText === 'string' ? { promptText: options.promptText } : {}),
        },
      }
    },
  }

  return driver
}

function session(tabId: number, url: string, title: string, active = false): Session {
  return {
    tabId,
    url,
    title,
    hasSnapshot: false,
    snapshotVersion: null,
    active,
  }
}

function mockSnapshot(): PageSnapshot {
  return {
    schemaVersion: 3,
    version: 1,
    capturedAt: Date.now(),
    url: 'https://a.test',
    title: 'A',
    groups: [
      {
        groupId: 'actions',
        groupName: 'Actions',
        targetIds: ['save_button', 'cancel_button'],
      },
    ],
    targets: [
      {
        targetId: 'save_button',
        groupId: 'actions',
        name: 'Save',
        description: 'Save changes',
        actionKinds: ['click'],
        selector: { css: '#save' },
        visible: true,
        inViewport: true,
        enabled: true,
        covered: false,
        actionableNow: true,
        reason: 'ready',
        overlay: false,
        sensitive: false,
        textContent: 'Save changes',
        center: { x: 10, y: 20 },
        size: { w: 80, h: 30 },
        sourceFile: 'mock',
        sourceLine: 1,
        sourceColumn: 1,
      },
      {
        targetId: 'cancel_button',
        groupId: 'actions',
        name: 'Cancel',
        description: 'Cancel changes',
        actionKinds: ['click'],
        selector: { css: '#cancel' },
        visible: true,
        inViewport: true,
        enabled: true,
        covered: false,
        actionableNow: true,
        reason: 'ready',
        overlay: false,
        sensitive: false,
        center: { x: 100, y: 20 },
        size: { w: 80, h: 30 },
        sourceFile: 'mock',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ],
  }
}

function consoleMessage(tabId: number, level: ConsoleLevel, type: string, text: string): ConsoleMessageEntry {
  return {
    tabId,
    level,
    type,
    text,
    timestamp: Date.now(),
    navigationIndex: 0,
    location: {
      url: 'https://a.test',
      lineNumber: 0,
      columnNumber: 0,
    },
  }
}

function networkRequestSummaries(tabId: number): NetworkRequestSummary[] {
  return [
    {
      index: 1,
      tabId,
      method: 'GET',
      url: 'https://a.test/api/data',
      resourceType: 'fetch',
      isNavigationRequest: false,
      timestamp: Date.now(),
      navigationIndex: 0,
      status: 200,
      statusText: 'OK',
    },
    {
      index: 2,
      tabId,
      method: 'GET',
      url: 'https://a.test/static/app.js',
      resourceType: 'script',
      isNavigationRequest: false,
      timestamp: Date.now(),
      navigationIndex: 0,
      status: 200,
      statusText: 'OK',
    },
  ]
}

function severityForLevel(level: ConsoleLevel): number {
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
