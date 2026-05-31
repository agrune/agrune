import { afterEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WebSocket } from 'ws'
import type { RunningDaemon } from '../src/daemon'
import { startDaemon } from '../src/daemon'
import { requestJson } from '../src/http-client'
import type { ActionResponse, AriaSnapshotResponse, ConsoleMessagesResponse, DialogHandleResponse, DialogsResponse, EvaluateResponse, EventsResponse, FileChoosersResponse, FileUploadResponse, FillResponse, NetworkRequestPartResponse, NetworkRequestsResponse, OpenTabResponse, ReadResponse, RunCodeUnsafeResponse, ScreenshotResponse, SnapshotResponse, TabsResponse } from '../src/types'
import type { DaemonEvent } from '../src/events'

const runSmoke = process.env.AGRUNE_CLI_SMOKE === '1' ? describe : describe.skip

let daemon: RunningDaemon | null = null
let tempDir: string | null = null
let eventSocket: WebSocket | null = null
let fixtureServer: http.Server | null = null

afterEach(async () => {
  eventSocket?.close()
  eventSocket = null
  await daemon?.close()
  daemon = null
  if (fixtureServer) {
    await new Promise<void>(resolve => fixtureServer?.close(() => resolve()))
    fixtureServer = null
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

runSmoke('Playwright daemon smoke', () => {
  it('opens a manifest page and executes fill/click through Playwright', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    const url = buildDataUrl()

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url }),
    })

    const targets = await requestJson<SnapshotResponse>(daemon.url, '/targets')
    expect(targets.snapshot.targets.map(target => target.targetId)).toEqual(
      expect.arrayContaining(['save_button', 'email_input']),
    )

    const scopedTargets = await requestJson<SnapshotResponse>(daemon.url, '/targets?target=save_button')
    expect(scopedTargets.snapshot.targets.map(target => target.targetId)).toEqual(['save_button'])
    expect(scopedTargets.snapshot.groups[0]?.targetIds).toEqual(['save_button'])

    const missingGroupTargets = await requestJson<SnapshotResponse>(daemon.url, '/targets?groupIds=missing')
    expect(missingGroupTargets.snapshot.targets).toHaveLength(0)
    expect(missingGroupTargets.snapshot.groups).toHaveLength(0)

    const ariaSnapshot = await requestJson<AriaSnapshotResponse>(daemon.url, '/snapshot?depth=3')
    expect(ariaSnapshot).toMatchObject({ ok: true, mode: 'ai', depth: 3 })
    expect(ariaSnapshot.text).toContain('Save')

    const playwrightCompatibleSnapshot = await requestJson<AriaSnapshotResponse>(daemon.url, '/snapshot?boxes=true&includeTextContent=true')
    expect(playwrightCompatibleSnapshot).toMatchObject({ ok: true, mode: 'ai', boxes: true, includeTextContent: true })
    expect(playwrightCompatibleSnapshot.text).toContain('Save')

    const targetAriaSnapshot = await requestJson<AriaSnapshotResponse>(daemon.url, '/snapshot?target=save_button')
    expect(targetAriaSnapshot).toMatchObject({ ok: true, mode: 'ai', target: 'save_button' })
    expect(targetAriaSnapshot.text).toContain('Save')

    await expect(
      requestJson(daemon.url, '/snapshot?target=missing_target'),
    ).rejects.toThrow(/Target not found/)

    await expect(
      requestJson(daemon.url, '/snapshot?mode=verbose'),
    ).rejects.toThrow(/snapshot mode/)

    await requestJson(daemon.url, '/fill', {
      method: 'POST',
      body: JSON.stringify({ target: 'email_input', value: 'agent@example.test' }),
    })
    const autoFill = await requestJson<FillResponse>(daemon.url, '/fill', {
      method: 'POST',
      body: JSON.stringify({ target: 'strategy_input', value: '1234', strategy: 'auto' }),
    })
    expect(autoFill).toMatchObject({ ok: true, target: 'strategy_input', value: '1234', strategy: 'keystroke' })
    const strategyState = await requestJson<EvaluateResponse>(daemon.url, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({
        source: '() => ({ value: document.querySelector("[data-testid=\\"strategy-input\\"]").value, keys: window.strategyKeys || 0 })',
      }),
    }) as { ok: true; result: { value: string; keys: number } }
    expect(strategyState.result).toEqual({ value: '1234', keys: 4 })
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ target: 'save_button', state: 'visible' }),
    })
    await requestJson(daemon.url, '/click', {
      method: 'POST',
      body: JSON.stringify({ target: 'save_button' }),
    })

    const read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('clicked')

    const middleClick = await requestJson<ActionResponse>(daemon.url, '/click', {
      method: 'POST',
      body: JSON.stringify({ target: 'click_options_button', button: 'middle', modifiers: ['Alt', 'Shift'] }),
    })
    expect(middleClick).toMatchObject({
      ok: true,
      target: 'click_options_button',
      action: 'click',
      button: 'middle',
      modifiers: ['Alt', 'Shift'],
    })
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'mouse:1:true:true', timeoutMs: 1_000 }),
    })

    await requestJson(daemon.url, '/click', {
      method: 'POST',
      body: JSON.stringify({ target: 'click_options_button', doubleClick: true, modifiers: ['Shift'] }),
    })
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'dbl:0:true:false:2', timeoutMs: 1_000 }),
    })

    await expect(
      requestJson(daemon.url, '/click', {
        method: 'POST',
        body: JSON.stringify({ target: 'click_options_button', button: 'primary' }),
      }),
    ).rejects.toThrow(/click button/)

    tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))
    const snapshotPath = join(tempDir, 'snapshot.md')
    const savedSnapshot = await requestJson<AriaSnapshotResponse>(
      daemon.url,
      `/snapshot?filename=${encodeURIComponent(snapshotPath)}`,
    )
    expect(savedSnapshot).toMatchObject({ ok: true, mode: 'ai', path: snapshotPath })
    expect(await readFile(snapshotPath, 'utf8')).toContain('Save')

    const screenshotPath = join(tempDir, 'after.png')
    const screenshot = await requestJson<ScreenshotResponse>(daemon.url, '/screenshot', {
      method: 'POST',
      body: JSON.stringify({ path: screenshotPath }),
    })
    await expect(stat(screenshot.path)).resolves.toMatchObject({ size: expect.any(Number) })

    const elementScreenshotPath = join(tempDir, 'save-button.jpg')
    const elementScreenshot = await requestJson<ScreenshotResponse>(daemon.url, '/screenshot', {
      method: 'POST',
      body: JSON.stringify({ path: elementScreenshotPath, target: 'save_button', type: 'jpeg' }),
    })
    expect(elementScreenshot).toMatchObject({
      path: elementScreenshotPath,
      target: 'save_button',
      type: 'jpeg',
      fullPage: false,
    })
    const jpeg = await readFile(elementScreenshot.path)
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])

    const selectorScreenshotPath = join(tempDir, 'save-button-selector.png')
    const selectorScreenshot = await requestJson<ScreenshotResponse>(daemon.url, '/screenshot', {
      method: 'POST',
      body: JSON.stringify({ path: selectorScreenshotPath, target: '[data-testid="save-button"]' }),
    })
    expect(selectorScreenshot).toMatchObject({
      path: selectorScreenshotPath,
      target: '[data-testid="save-button"]',
      type: 'png',
      fullPage: false,
    })
    expect((await stat(selectorScreenshot.path)).size).toBeGreaterThan(0)

    await expect(
      requestJson(daemon.url, '/screenshot', {
        method: 'POST',
        body: JSON.stringify({ path: join(tempDir, 'invalid.png'), target: 'save_button', fullPage: true }),
      }),
    ).rejects.toThrow(/Element screenshots cannot use fullPage/)
  })

  it('focuses/closes tabs and streams command events', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    const events = await collectEvents(daemon.url)

    const first = await requestJson<OpenTabResponse>(daemon.url, '/tabs/new', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('First') }),
    })
    const second = await requestJson<OpenTabResponse>(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('Second') }),
    })

    await requestJson(daemon.url, '/tabs/select', {
      method: 'POST',
      body: JSON.stringify({ tabId: first.tab.tabId }),
    })
    let tabs = await requestJson<TabsResponse>(daemon.url, '/tabs')
    expect(tabs.tabs.find(tab => tab.tabId === first.tab.tabId)?.active).toBe(true)
    expect(tabs.tabs.map(tab => tab.index)).toEqual([0, 1])

    await requestJson(daemon.url, '/tabs/select', {
      method: 'POST',
      body: JSON.stringify({ index: 1 }),
    })
    tabs = await requestJson<TabsResponse>(daemon.url, '/tabs')
    expect(tabs.tabs.find(tab => tab.tabId === second.tab.tabId)?.active).toBe(true)

    await expect(
      requestJson(daemon.url, '/tabs/select', {
        method: 'POST',
        body: JSON.stringify({ index: 99 }),
      }),
    ).rejects.toThrow(/No tab exists at index 99/)

    const closed = await requestJson(daemon.url, '/close', {
      method: 'POST',
      body: JSON.stringify({ index: 1 }),
    }) as { ok: true; closedTabId: number }
    expect(closed.closedTabId).toBe(second.tab.tabId)

    tabs = await requestJson<TabsResponse>(daemon.url, '/tabs')
    expect(tabs.tabs.map(tab => tab.tabId)).not.toContain(second.tab.tabId)

    await waitForEvent(events, event => event.tool === 'close' && event.phase === 'end')
    const history = await requestJson<EventsResponse>(daemon.url, '/events/history')
    expect(history.events.some(event => event.tool === 'tabs.new' && event.phase === 'end')).toBe(true)
    expect(history.events.some(event => event.tool === 'tabs.select' && event.phase === 'end')).toBe(true)
  })

  it('navigates current tabs, uses history, reloads, and resizes the viewport', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    const first = await requestJson<OpenTabResponse>(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildNavigationDataUrl('First page', 'first_button') }),
    })
    expect((await requestJson<SnapshotResponse>(daemon.url, '/targets')).snapshot.targets.map(target => target.targetId)).toContain('first_button')

    const navigated = await requestJson<OpenTabResponse>(daemon.url, '/navigate', {
      method: 'POST',
      body: JSON.stringify({ url: buildNavigationDataUrl('Second page', 'second_button') }),
    })
    expect(navigated.tab.tabId).toBe(first.tab.tabId)
    let read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('Second page')
    let tabs = await requestJson<TabsResponse>(daemon.url, '/tabs')
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.tabs[0]?.tabId).toBe(first.tab.tabId)
    const targetsAfterNavigate = await requestJson<SnapshotResponse>(daemon.url, '/targets')
    expect(targetsAfterNavigate.snapshot.targets.map(target => target.targetId)).toContain('second_button')
    expect(targetsAfterNavigate.snapshot.targets.map(target => target.targetId)).not.toContain('first_button')

    await requestJson(daemon.url, '/back', {
      method: 'POST',
      body: JSON.stringify({ tabId: first.tab.tabId }),
    })
    read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('First page')

    await requestJson(daemon.url, '/forward', {
      method: 'POST',
      body: JSON.stringify({ tabId: first.tab.tabId }),
    })
    read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('Second page')

    const resized = await requestJson(daemon.url, '/resize', {
      method: 'POST',
      body: JSON.stringify({ width: 900, height: 700 }),
    }) as { ok: true; width: number; height: number; tabId: number }
    expect(resized).toMatchObject({ ok: true, width: 900, height: 700, tabId: first.tab.tabId })
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'viewport:900x700', timeoutMs: 1_000 }),
    })

    await requestJson(daemon.url, '/reload', {
      method: 'POST',
      body: JSON.stringify({ tabId: first.tab.tabId }),
    })
    read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('Second page')
  })

  it('evaluates page and target JavaScript with optional JSON args', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('Evaluate actions') }),
    })

    const pageExpression = await requestJson<EvaluateResponse>(daemon.url, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({ source: 'document.title' }),
    })
    expect(pageExpression.result).toBe('Evaluate actions')

    const pageFunction = await requestJson<EvaluateResponse>(daemon.url, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({ source: '(arg) => arg.prefix + document.querySelector("#status").textContent', arg: { prefix: 'status:' } }),
    })
    expect(pageFunction.result).toBe('status:idle')

    const targetExpression = await requestJson<EvaluateResponse>(daemon.url, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({ target: 'save_button', source: 'el.textContent.trim()' }),
    })
    expect(targetExpression).toMatchObject({ action: 'evaluate', target: 'save_button', result: 'Save' })

    const targetFunction = await requestJson<EvaluateResponse>(daemon.url, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({ target: 'save_button', source: '(el, arg) => `${arg.prefix}:${el.dataset.testid}`', arg: { prefix: 'target' } }),
    })
    expect(targetFunction.result).toBe('target:save-button')

    const selectorTargetFunction = await requestJson<EvaluateResponse>(daemon.url, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({ target: '[data-testid="save-button"]', source: '(el) => el.textContent.trim()' }),
    })
    expect(selectorTargetFunction).toMatchObject({
      action: 'evaluate',
      target: '[data-testid="save-button"]',
      result: 'Save',
    })

    const undefinedResult = await requestJson<EvaluateResponse>(daemon.url, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({ source: 'undefined' }),
    })
    expect(undefinedResult).toMatchObject({ result: null, undefinedResult: true })

    const filename = join(tempDir, 'evaluate.json')
    const savedResult = await requestJson<EvaluateResponse>(daemon.url, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({ source: '({ ok: true, title: document.title })', filename }),
    })
    expect(savedResult).toMatchObject({ result: { ok: true, title: 'Evaluate actions' }, path: filename })
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual({ ok: true, title: 'Evaluate actions' })

    await expect(
      requestJson(daemon.url, '/evaluate', {
        method: 'POST',
        body: JSON.stringify({ target: 'missing_target', source: 'el.textContent' }),
      }),
    ).rejects.toThrow(/Target not found/)

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildBrokenManifestTargetDataUrl() }),
    })
    await expect(
      requestJson(daemon.url, '/evaluate', {
        method: 'POST',
        body: JSON.stringify({ target: 'button', source: 'el.textContent.trim()' }),
      }),
    ).rejects.toThrow(/Target not found/)
  })

  it('runs unsafe Playwright page code from inline code or filename', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('Run code unsafe') }),
    })

    const inline = await requestJson<RunCodeUnsafeResponse>(daemon.url, '/run-code-unsafe', {
      method: 'POST',
      body: JSON.stringify({
        code: `async (page) => {
          await page.locator('[data-testid="name-input"]').fill('Ada')
          return {
            title: await page.title(),
            value: await page.locator('[data-testid="name-input"]').inputValue(),
          }
        }`,
      }),
    })
    expect(inline).toMatchObject({
      ok: true,
      action: 'run-code-unsafe',
      result: {
        title: 'Run code unsafe',
        value: 'Ada',
      },
    })

    const codePath = join(tempDir, 'snippet.js')
    await writeFile(codePath, 'async (page) => page.url()', 'utf-8')
    const fromFile = await requestJson<RunCodeUnsafeResponse>(daemon.url, '/run-code-unsafe', {
      method: 'POST',
      body: JSON.stringify({
        filename: codePath,
        code: 'async () => "ignored"',
      }),
    })
    expect(fromFile).toMatchObject({
      ok: true,
      action: 'run-code-unsafe',
      filename: codePath,
    })
    expect(fromFile.result).toEqual(expect.stringContaining('data:text/html'))

    const alias = await requestJson<RunCodeUnsafeResponse>(daemon.url, '/run-code', {
      method: 'POST',
      body: JSON.stringify({ code: 'async () => undefined' }),
    })
    expect(alias).toMatchObject({ result: null, undefinedResult: true })

    await expect(
      requestJson(daemon.url, '/run-code-unsafe', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ).rejects.toThrow(/requires code or filename/)
  })

  it('collects console messages and page errors with level and navigation filters', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildConsoleDataUrl('first', true) }),
    })
    await waitForConsoleMessage(daemon.url, { all: true, level: 'debug' }, messages => {
      const texts = messages.map(message => message.text)
      return texts.some(text => text.includes('first-info')) && texts.some(text => text.includes('first-boom'))
    })

    await requestJson(daemon.url, '/navigate', {
      method: 'POST',
      body: JSON.stringify({ url: buildConsoleDataUrl('second') }),
    })
    await waitForConsoleMessage(daemon.url, { level: 'warning' }, messages => {
      const texts = messages.map(message => message.text)
      return texts.includes('second-warn') && texts.includes('second-error')
    })

    const currentWarnings = await getConsoleMessages(daemon.url, { level: 'warning' })
    const warningTexts = currentWarnings.messages.map(message => message.text)
    expect(warningTexts).toContain('second-warn')
    expect(warningTexts).toContain('second-error')
    expect(warningTexts).not.toContain('second-info')
    expect(warningTexts.some(text => text.includes('first-'))).toBe(false)

    const allInfo = await getConsoleMessages(daemon.url, { all: true, level: 'info' })
    const allInfoTexts = allInfo.messages.map(message => message.text)
    expect(allInfoTexts).toContain('first-info')
    expect(allInfoTexts).toContain('second-info')
    expect(allInfoTexts.some(text => text.includes('first-boom'))).toBe(true)

    const currentErrors = await getConsoleMessages(daemon.url, { level: 'error' })
    const errorTexts = currentErrors.messages.map(message => message.text)
    expect(errorTexts).toContain('second-error')
    expect(errorTexts).not.toContain('second-warn')

    const consolePath = join(tempDir, 'console.json')
    const savedConsole = await getConsoleMessages(daemon.url, { level: 'info', filename: consolePath })
    expect(savedConsole.path).toBe(consolePath)
    expect(JSON.parse(await readFile(consolePath, 'utf8'))).toEqual(savedConsole.messages)
  })

  it('records network requests and returns request/response details lazily', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))
    const fixtureUrl = await startNetworkFixture()

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: fixtureUrl }),
    })
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'network:world', timeoutMs: 2_000 }),
    })

    const defaultList = await waitForNetworkRequest(daemon.url, request => request.url.includes('/api/post'))
    const defaultUrls = defaultList.requests.map(request => request.url)
    expect(defaultUrls.some(url => url.includes('/api/data'))).toBe(true)
    expect(defaultUrls.some(url => url.includes('/api/post'))).toBe(true)
    expect(defaultUrls.some(url => url.includes('/api/missing'))).toBe(true)
    expect(defaultUrls.some(url => url.includes('/static/app.js'))).toBe(false)
    expect(defaultUrls.some(url => url.includes('/static/pixel.png'))).toBe(false)

    const withStatic = await getNetworkRequests(daemon.url, { static: true })
    const staticUrls = withStatic.requests.map(request => request.url)
    expect(staticUrls.some(url => url.includes('/static/app.js'))).toBe(true)
    expect(staticUrls.some(url => url.includes('/static/pixel.png'))).toBe(true)

    const filtered = await getNetworkRequests(daemon.url, { filter: '/api/post' })
    expect(filtered.requests.map(request => request.url)).toEqual([
      expect.stringContaining('/api/post'),
    ])
    const post = filtered.requests[0]
    expect(post).toMatchObject({ method: 'POST', resourceType: 'fetch', status: 200 })

    const requestHeaders = await getNetworkRequestPart(daemon.url, post.index, 'request-headers')
    expect(requestHeaders.value).toMatchObject({ 'x-agrune': 'network-smoke' })

    const requestBody = await getNetworkRequestPart(daemon.url, post.index, 'request-body')
    expect(requestBody.value).toContain('"hello":"world"')

    const networkListPath = join(tempDir, 'network-list.json')
    const savedNetworkList = await getNetworkRequests(daemon.url, { filter: '/api/post', filename: networkListPath })
    expect(savedNetworkList.path).toBe(networkListPath)
    expect(JSON.parse(await readFile(networkListPath, 'utf8'))).toEqual(savedNetworkList.requests)

    const networkPartPath = join(tempDir, 'network-part.json')
    const savedRequestBody = await getNetworkRequestPart(daemon.url, post.index, 'response-body', networkPartPath)
    expect(savedRequestBody.path).toBe(networkPartPath)
    expect(JSON.parse(await readFile(networkPartPath, 'utf8'))).toMatchObject({
      part: 'response-body',
      value: expect.any(String),
    })

    const responseHeaders = await getNetworkRequestPart(daemon.url, post.index, 'response-headers')
    expect(responseHeaders.value).toMatchObject({ 'content-type': expect.stringContaining('application/json') })

    const responseBody = await getNetworkRequestPart(daemon.url, post.index, 'response-body')
    expect(responseBody.value).toContain('"hello":"world"')

    await expect(
      requestJson(daemon.url, '/network/request?index=9999'),
    ).rejects.toThrow(/Network request not found/)
  })

  it('reports dialogs from click without hanging and handles them explicitly', async () => {
    daemon = await startDaemon({ port: 0, headless: true })

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('Dialog actions') }),
    })

    const confirmClick = await withTimeout(
      requestJson<ActionResponse>(daemon.url, '/click', {
        method: 'POST',
        body: JSON.stringify({ target: 'confirm_button' }),
      }),
      1_000,
      'click did not return after confirm dialog opened',
    )
    expect(confirmClick.dialog).toMatchObject({
      type: 'confirm',
      message: 'Delete item?',
      handled: false,
    })

    let dialogs = await getDialogs(daemon.url)
    expect(dialogs.dialogs).toEqual([
      expect.objectContaining({ message: 'Delete item?', handled: false }),
    ])

    const dismissed = await requestJson<DialogHandleResponse>(daemon.url, '/dialog/handle', {
      method: 'POST',
      body: JSON.stringify({ accept: false }),
    })
    expect(dismissed).toMatchObject({
      action: 'dialog.handle',
      armed: false,
      dialog: expect.objectContaining({ handled: true, accepted: false }),
    })

    let read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('confirm:dismissed')

    const promptClick = await withTimeout(
      requestJson<ActionResponse>(daemon.url, '/click', {
        method: 'POST',
        body: JSON.stringify({ target: 'prompt_button' }),
      }),
      1_000,
      'click did not return after prompt dialog opened',
    )
    expect(promptClick.dialog).toMatchObject({
      type: 'prompt',
      message: 'Name?',
      defaultValue: 'Anon',
      handled: false,
    })

    const accepted = await requestJson<DialogHandleResponse>(daemon.url, '/dialog/handle', {
      method: 'POST',
      body: JSON.stringify({ accept: true, promptText: 'Ada' }),
    })
    expect(accepted.dialog).toMatchObject({ handled: true, accepted: true, promptText: 'Ada' })

    read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('prompt:Ada')

    dialogs = await getDialogs(daemon.url)
    expect(dialogs.dialogs.map(dialog => dialog.handled)).toEqual([true, true])

    await expect(
      requestJson(daemon.url, '/dialog/handle', {
        method: 'POST',
        body: JSON.stringify({ accept: true }),
      }),
    ).rejects.toThrow(/No pending dialog/)
  })

  it('executes type/press/select/upload through Playwright locators', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))
    const uploadPath = join(tempDir, 'profile.txt')
    await writeFile(uploadPath, 'hello from agrune')

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('Input actions') }),
    })

    await requestJson(daemon.url, '/type', {
      method: 'POST',
      body: JSON.stringify({ target: 'name_input', text: 'Ada Lovelace' }),
    })
    await requestJson(daemon.url, '/press', {
      method: 'POST',
      body: JSON.stringify({ target: 'name_input', key: 'Enter' }),
    })
    let read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('submitted:Ada Lovelace')

    await requestJson(daemon.url, '/select', {
      method: 'POST',
      body: JSON.stringify({ target: 'country_select', values: ['kr'] }),
    })
    read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('country:kr')

    await requestJson(daemon.url, '/upload', {
      method: 'POST',
      body: JSON.stringify({ target: 'profile_upload', paths: [uploadPath] }),
    })
    read = await requestJson<ReadResponse>(daemon.url, '/read')
    expect(read.text).toContain('files:profile.txt')
  })

  it('uploads files to a pending file chooser opened by click', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))
    const chooserPath = join(tempDir, 'chooser.txt')
    const chooserTwoPath = join(tempDir, 'chooser-two.txt')
    await writeFile(chooserPath, 'hello from file chooser')
    await writeFile(chooserTwoPath, 'second file from file chooser')

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('File chooser actions') }),
    })

    const clicked = await requestJson<ActionResponse>(daemon.url, '/click', {
      method: 'POST',
      body: JSON.stringify({ target: 'profile_upload' }),
    })
    expect(clicked.fileChooser).toMatchObject({ handled: false, multiple: false })

    let choosers = await requestJson<FileChoosersResponse>(daemon.url, '/file-choosers')
    expect(choosers.fileChoosers).toHaveLength(1)
    expect(choosers.fileChoosers[0]).toMatchObject({ handled: false, multiple: false })

    const uploaded = await requestJson<FileUploadResponse>(daemon.url, '/file-upload', {
      method: 'POST',
      body: JSON.stringify({ paths: [chooserPath] }),
    })
    expect(uploaded).toMatchObject({
      ok: true,
      action: 'file-upload',
      cancelled: false,
      fileChooser: { handled: true, cancelled: false },
    })
    expect(uploaded.paths[0]).toContain('chooser.txt')

    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'files:chooser.txt', timeoutMs: 1_000 }),
    })

    choosers = await requestJson<FileChoosersResponse>(daemon.url, '/file-choosers')
    expect(choosers.fileChoosers[0]).toMatchObject({ handled: true, cancelled: false })

    const multipleClicked = await requestJson<ActionResponse>(daemon.url, '/click', {
      method: 'POST',
      body: JSON.stringify({ target: 'multi_upload' }),
    })
    expect(multipleClicked.fileChooser).toMatchObject({ handled: false, multiple: true })

    const multipleUploaded = await requestJson<FileUploadResponse>(daemon.url, '/file-upload', {
      method: 'POST',
      body: JSON.stringify({ paths: [chooserPath, chooserTwoPath] }),
    })
    expect(multipleUploaded).toMatchObject({
      ok: true,
      action: 'file-upload',
      cancelled: false,
      fileChooser: { handled: true, multiple: true },
    })
    expect(multipleUploaded.paths).toHaveLength(2)

    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'multi:chooser.txt,chooser-two.txt', timeoutMs: 1_000 }),
    })

    await requestJson(daemon.url, '/click', {
      method: 'POST',
      body: JSON.stringify({ target: 'profile_upload' }),
    })
    const cancelled = await requestJson<FileUploadResponse>(daemon.url, '/file-upload', {
      method: 'POST',
      body: JSON.stringify({ paths: [] }),
    })
    expect(cancelled).toMatchObject({
      ok: true,
      action: 'file-upload',
      paths: [],
      cancelled: true,
      fileChooser: { handled: true, cancelled: true },
    })

    await expect(
      requestJson(daemon.url, '/file-upload', {
        method: 'POST',
        body: JSON.stringify({ paths: [chooserPath] }),
      }),
    ).rejects.toThrow(/No pending file chooser/)
  })

  it('drops MIME data and files onto a manifest target', async () => {
    daemon = await startDaemon({ port: 0, headless: true })
    tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))
    const dropPath = join(tempDir, 'drop.txt')
    await writeFile(dropPath, 'file from drop')

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('Drop actions') }),
    })

    const dropped = await requestJson(daemon.url, '/drop', {
      method: 'POST',
      body: JSON.stringify({
        target: 'drop_zone',
        data: { 'text/plain': 'plain drop text', 'text/uri-list': 'https://example.test/item' },
        paths: [dropPath],
      }),
    }) as { ok: true; action: 'drop'; target: string; dataTypes: string[]; paths: string[] }
    expect(dropped).toMatchObject({
      ok: true,
      action: 'drop',
      target: 'drop_zone',
      dataTypes: ['text/plain', 'text/uri-list'],
    })
    expect(dropped.paths[0]).toContain('drop.txt')

    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'drop:plain drop text|https://example.test/item|drop.txt|file from drop', timeoutMs: 1_000 }),
    })

    await expect(
      requestJson(daemon.url, '/drop', {
        method: 'POST',
        body: JSON.stringify({ target: 'drop_zone' }),
      }),
    ).rejects.toThrow(/drop requires/)
  })

  it('fills a mixed form in one request and reports field failures', async () => {
    daemon = await startDaemon({ port: 0, headless: true })

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('Fill form actions') }),
    })

    const filled = await requestJson(daemon.url, '/fill-form', {
      method: 'POST',
      body: JSON.stringify({
        fields: [
          { name: 'Email', target: 'form_email', type: 'textbox', value: 'ada@example.test' },
          { name: 'Subscribe', target: 'form_subscribe', type: 'checkbox', value: true },
          { name: 'Contact email', target: 'form_contact_email', type: 'radio', value: true },
          { name: 'Country', target: 'form_country', type: 'combobox', value: 'kr' },
          { name: 'Volume', target: 'form_volume', type: 'slider', value: 7 },
        ],
      }),
    }) as { ok: true; action: 'fill-form'; fields: Array<{ name?: string; target: string; type: string }> }
    expect(filled).toMatchObject({
      ok: true,
      action: 'fill-form',
      fields: [
        { name: 'Email', target: 'form_email', type: 'textbox' },
        { name: 'Subscribe', target: 'form_subscribe', type: 'checkbox' },
        { name: 'Contact email', target: 'form_contact_email', type: 'radio' },
        { name: 'Country', target: 'form_country', type: 'combobox' },
        { name: 'Volume', target: 'form_volume', type: 'slider' },
      ],
    })

    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'form:ada@example.test|yes|email|kr|7', timeoutMs: 1_000 }),
    })

    await expect(
      requestJson(daemon.url, '/fill-form', {
        method: 'POST',
        body: JSON.stringify({
          fields: [{ name: 'Broken', target: 'missing_form_target', type: 'textbox', value: 'x' }],
        }),
      }),
    ).rejects.toThrow(/Failed to fill form field Broken/)

    await expect(
      requestJson(daemon.url, '/fill-form', {
        method: 'POST',
        body: JSON.stringify({ fields: [] }),
      }),
    ).rejects.toThrow(/non-empty fields array/)
  })

  it('waits for target state, text, text disappearance, and elapsed time', async () => {
    daemon = await startDaemon({ port: 0, headless: true })

    await requestJson(daemon.url, '/open', {
      method: 'POST',
      body: JSON.stringify({ url: buildDataUrl('Wait actions') }),
    })

    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ target: 'save_button', state: 'visible' }),
    })
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ text: 'Ready', timeoutMs: 1_000 }),
    })
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ textGone: 'Loading', timeoutMs: 1_000 }),
    })
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ textGone: 'Never rendered', timeoutMs: 1_000 }),
    })

    const started = Date.now()
    await requestJson(daemon.url, '/wait', {
      method: 'POST',
      body: JSON.stringify({ timeMs: 25 }),
    })
    expect(Date.now() - started).toBeGreaterThanOrEqual(20)

    await expect(
      requestJson(daemon.url, '/wait', {
        method: 'POST',
        body: JSON.stringify({ target: 'save_button', text: 'Ready' }),
      }),
    ).rejects.toThrow(/exactly one/)
  })
})

function buildDataUrl(title = 'Agrune CLI Smoke'): string {
  const manifest = {
    version: 3,
    groups: [{
      groupId: 'main',
      name: 'Main',
      targets: [
        {
          targetId: 'save_button',
          name: 'Save',
          selector: { testId: 'save-button' },
          actionKinds: ['click'],
        },
        {
          targetId: 'click_options_button',
          name: 'Click options',
          selector: { testId: 'click-options-button' },
          actionKinds: ['click'],
        },
        {
          targetId: 'email_input',
          name: 'Email',
          selector: { testId: 'email-input' },
          actionKinds: ['fill'],
        },
        {
          targetId: 'strategy_input',
          name: 'Strategy input',
          selector: { testId: 'strategy-input' },
          actionKinds: ['fill'],
        },
        {
          targetId: 'name_input',
          name: 'Name',
          selector: { testId: 'name-input' },
          actionKinds: ['type', 'press'],
        },
        {
          targetId: 'country_select',
          name: 'Country',
          selector: { testId: 'country-select' },
          actionKinds: ['select'],
        },
        {
          targetId: 'profile_upload',
          name: 'Profile upload',
          selector: { testId: 'profile-upload' },
          actionKinds: ['upload'],
        },
        {
          targetId: 'multi_upload',
          name: 'Multiple upload',
          selector: { testId: 'multi-upload' },
          actionKinds: ['upload'],
        },
        {
          targetId: 'drop_zone',
          name: 'Drop zone',
          selector: { testId: 'drop-zone' },
          actionKinds: ['drop'],
        },
        {
          targetId: 'form_email',
          name: 'Form email',
          selector: { testId: 'form-email' },
          actionKinds: ['fill'],
        },
        {
          targetId: 'form_subscribe',
          name: 'Form subscribe',
          selector: { testId: 'form-subscribe' },
          actionKinds: ['fill'],
        },
        {
          targetId: 'form_contact_email',
          name: 'Form contact email',
          selector: { testId: 'form-contact-email' },
          actionKinds: ['fill'],
        },
        {
          targetId: 'form_country',
          name: 'Form country',
          selector: { testId: 'form-country' },
          actionKinds: ['select'],
        },
        {
          targetId: 'form_volume',
          name: 'Form volume',
          selector: { testId: 'form-volume' },
          actionKinds: ['fill'],
        },
        {
          targetId: 'confirm_button',
          name: 'Confirm',
          selector: { testId: 'confirm-button' },
          actionKinds: ['click'],
        },
        {
          targetId: 'prompt_button',
          name: 'Prompt',
          selector: { testId: 'prompt-button' },
          actionKinds: ['click'],
        },
      ],
    }],
  }

  const html = [
    '<!doctype html>',
    '<html>',
    `<head><title>${title}</title></head>`,
    '<body>',
    `<script>window.__agrune_manifest__=${JSON.stringify(JSON.stringify(manifest))};window.__agrune_manifest__=JSON.parse(window.__agrune_manifest__);</script>`,
    `<h1>${title}</h1>`,
    '<button data-testid="save-button" onclick="document.querySelector(\'#status\').textContent=\'clicked\'">Save</button>',
    '<button data-testid="click-options-button" oncontextmenu="event.preventDefault()" onmousedown="document.querySelector(\'#status\').textContent=\'mouse:\'+event.button+\':\'+event.shiftKey+\':\'+event.altKey" ondblclick="document.querySelector(\'#status\').textContent=\'dbl:\'+event.button+\':\'+event.shiftKey+\':\'+event.altKey+\':\'+event.detail">Click options</button>',
    '<input data-testid="email-input" value="">',
    '<input data-testid="strategy-input" inputmode="numeric" value="" onkeydown="if(event.key.length===1&&!event.metaKey&&!event.ctrlKey&&!event.altKey) window.strategyKeys=(window.strategyKeys||0)+1" oninput="document.querySelector(\'#status\').textContent=\'strategy:\'+this.value+\':\'+(window.strategyKeys||0)">',
    '<input data-testid="name-input" value="" onkeydown="if(event.key===\'Enter\') document.querySelector(\'#status\').textContent=\'submitted:\'+this.value">',
    '<select data-testid="country-select" onchange="document.querySelector(\'#status\').textContent=\'country:\'+this.value"><option value="">Choose</option><option value="kr">Korea</option><option value="us">United States</option></select>',
    '<input data-testid="profile-upload" type="file" onchange="document.querySelector(\'#status\').textContent=\'files:\'+Array.from(this.files).map(file=>file.name).join(\',\')">',
    '<input data-testid="multi-upload" type="file" multiple onchange="document.querySelector(\'#status\').textContent=\'multi:\'+Array.from(this.files).map(file=>file.name).join(\',\')">',
    '<div data-testid="drop-zone" ondragover="event.preventDefault()" ondrop="event.preventDefault(); Promise.all(Array.from(event.dataTransfer.files).map(file=>file.text())).then(texts=>{document.querySelector(\'#status\').textContent=\'drop:\'+event.dataTransfer.getData(\'text/plain\')+\'|\'+event.dataTransfer.getData(\'text/uri-list\')+\'|\'+Array.from(event.dataTransfer.files).map(file=>file.name).join(\',\')+\'|\'+texts.join(\',\')})">Drop zone</div>',
    '<input data-testid="form-email" value="" oninput="updateFormStatus()">',
    '<input data-testid="form-subscribe" type="checkbox" onchange="updateFormStatus()">',
    '<input data-testid="form-contact-email" type="radio" name="contact" value="email" onchange="updateFormStatus()">',
    '<input data-testid="form-contact-phone" type="radio" name="contact" value="phone" onchange="updateFormStatus()">',
    '<select data-testid="form-country" onchange="updateFormStatus()"><option value="">Choose</option><option value="kr">Korea</option><option value="us">United States</option></select>',
    '<input data-testid="form-volume" type="range" min="0" max="10" value="0" oninput="updateFormStatus()" onchange="updateFormStatus()">',
    '<button data-testid="confirm-button" onclick="document.querySelector(\'#status\').textContent=confirm(\'Delete item?\')?\'confirm:accepted\':\'confirm:dismissed\'">Confirm</button>',
    '<button data-testid="prompt-button" onclick="document.querySelector(\'#status\').textContent=\'prompt:\'+prompt(\'Name?\', \'Anon\')">Prompt</button>',
    '<p id="async-status">Loading</p>',
    '<script>setTimeout(()=>{document.querySelector(\'#async-status\').textContent=\'Ready\'},50)</script>',
    '<script>function updateFormStatus(){const contact=document.querySelector(\'input[name="contact"]:checked\')?.value||\'none\';document.querySelector(\'#status\').textContent=\'form:\'+document.querySelector(\'[data-testid="form-email"]\').value+\'|\'+(document.querySelector(\'[data-testid="form-subscribe"]\').checked?\'yes\':\'no\')+\'|\'+contact+\'|\'+document.querySelector(\'[data-testid="form-country"]\').value+\'|\'+document.querySelector(\'[data-testid="form-volume"]\').value}</script>',
    '<p id="status">idle</p>',
    '</body>',
    '</html>',
  ].join('')

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function buildBrokenManifestTargetDataUrl(): string {
  const manifest = {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [{
        targetId: 'button',
        name: 'Broken manifest button',
        selector: { testId: 'missing-button' },
        actionKinds: ['click'],
      }],
    }],
  }
  const html = [
    '<!doctype html>',
    '<html>',
    '<head><title>Broken manifest target</title></head>',
    '<body>',
    `<script>window.__agrune_manifest__=${JSON.stringify(JSON.stringify(manifest))};window.__agrune_manifest__=JSON.parse(window.__agrune_manifest__);</script>`,
    '<button>Fallback CSS button</button>',
    '</body>',
    '</html>',
  ].join('')

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function buildConsoleDataUrl(label: string, throwPageError = false): string {
  const html = [
    '<!doctype html>',
    '<html>',
    `<head><title>${label}</title></head>`,
    '<body>',
    `<h1>${label}</h1>`,
    '<script>',
    `setTimeout(() => console.log('${label}-info'), 0);`,
    `setTimeout(() => console.warn('${label}-warn'), 5);`,
    `setTimeout(() => console.error('${label}-error'), 10);`,
    throwPageError ? `setTimeout(() => { throw new Error('${label}-boom') }, 15);` : '',
    '</script>',
    '</body>',
    '</html>',
  ].join('')

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

async function startNetworkFixture(): Promise<string> {
  const server = http.createServer((req, res) => {
    void handleNetworkFixtureRequest(req, res)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  fixtureServer = server
  const address = server.address()
  if (!address || typeof address !== 'object') {
    throw new Error('fixture server did not expose an address')
  }
  return `http://127.0.0.1:${address.port}`
}

async function handleNetworkFixtureRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end([
      '<!doctype html>',
      '<html>',
      '<head><title>Network fixture</title><script src="/static/app.js"></script></head>',
      '<body>',
      '<h1>Network fixture</h1>',
      '<img src="/static/pixel.png" alt="">',
      '<p id="status">loading</p>',
      '<script>',
      'async function run(){',
      '  await fetch("/api/data?name=ada");',
      '  const response = await fetch("/api/post", { method: "POST", headers: { "content-type": "application/json", "x-agrune": "network-smoke" }, body: JSON.stringify({ hello: "world" }) });',
      '  const data = await response.json();',
      '  await fetch("/api/missing");',
      '  document.querySelector("#status").textContent = "network:" + data.echo.hello;',
      '}',
      'run();',
      '</script>',
      '</body>',
      '</html>',
    ].join(''))
    return
  }

  if (url.pathname === '/static/app.js') {
    res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' })
    res.end('window.__agruneNetworkStatic = true;')
    return
  }

  if (url.pathname === '/static/pixel.png') {
    res.writeHead(200, { 'content-type': 'image/png' })
    res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'))
    return
  }

  if (url.pathname === '/api/data') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, name: url.searchParams.get('name') }))
    return
  }

  if (url.pathname === '/api/post') {
    const body = await readRequestBody(req)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, echo: JSON.parse(body) as unknown }))
    return
  }

  if (url.pathname === '/api/missing') {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: 'missing' }))
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function buildNavigationDataUrl(title: string, targetId: string): string {
  const manifest = {
    version: 3,
    groups: [{
      groupId: 'main',
      name: 'Main',
      targets: [
        {
          targetId,
          name: title,
          selector: { testId: targetId },
          actionKinds: ['click'],
        },
      ],
    }],
  }

  const html = [
    '<!doctype html>',
    '<html>',
    `<head><title>${title}</title></head>`,
    '<body>',
    `<script>window.__agrune_manifest__=${JSON.stringify(JSON.stringify(manifest))};window.__agrune_manifest__=JSON.parse(window.__agrune_manifest__);</script>`,
    `<h1>${title}</h1>`,
    `<button data-testid="${targetId}">${title}</button>`,
    '<p id="viewport"></p>',
    '<script>function updateViewport(){document.querySelector(\'#viewport\').textContent=\'viewport:\'+innerWidth+\'x\'+innerHeight} addEventListener(\'resize\', updateViewport); updateViewport()</script>',
    '</body>',
    '</html>',
  ].join('')

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

async function collectEvents(baseUrl: string): Promise<DaemonEvent[]> {
  const received: DaemonEvent[] = []
  const wsUrl = `${baseUrl.replace(/^http:/, 'ws:')}/events`
  const ws = new WebSocket(wsUrl)
  eventSocket = ws
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  ws.on('message', data => {
    received.push(JSON.parse(data.toString()) as DaemonEvent)
  })
  return received
}

async function waitForEvent(
  events: DaemonEvent[],
  predicate: (event: DaemonEvent) => boolean,
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (events.some(predicate)) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for daemon event. Received: ${JSON.stringify(events)}`)
}

async function getConsoleMessages(
  baseUrl: string,
  options: { all?: boolean; level?: 'debug' | 'info' | 'warning' | 'error'; filename?: string } = {},
): Promise<ConsoleMessagesResponse> {
  const params = new URLSearchParams()
  if (options.all) params.set('all', 'true')
  if (options.level) params.set('level', options.level)
  if (options.filename) params.set('filename', options.filename)
  return requestJson<ConsoleMessagesResponse>(
    baseUrl,
    `/console${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
}

async function waitForConsoleMessage(
  baseUrl: string,
  options: { all?: boolean; level?: 'debug' | 'info' | 'warning' | 'error' },
  predicate: (messages: ConsoleMessagesResponse['messages']) => boolean,
): Promise<void> {
  const deadline = Date.now() + 5_000
  let last: ConsoleMessagesResponse['messages'] = []
  while (Date.now() < deadline) {
    const response = await getConsoleMessages(baseUrl, options)
    last = response.messages
    if (predicate(response.messages)) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for console message. Received: ${JSON.stringify(last)}`)
}

async function getNetworkRequests(
  baseUrl: string,
  options: { all?: boolean; static?: boolean; filter?: string; filename?: string } = {},
): Promise<NetworkRequestsResponse> {
  const params = new URLSearchParams()
  if (options.all) params.set('all', 'true')
  if (options.static) params.set('static', 'true')
  if (options.filter) params.set('filter', options.filter)
  if (options.filename) params.set('filename', options.filename)
  return requestJson<NetworkRequestsResponse>(
    baseUrl,
    `/network${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
}

async function getNetworkRequestPart(
  baseUrl: string,
  index: number,
  part: 'request-headers' | 'request-body' | 'response-headers' | 'response-body',
  filename?: string,
): Promise<NetworkRequestPartResponse> {
  const params = new URLSearchParams({ index: String(index), part })
  if (filename) params.set('filename', filename)
  return requestJson<NetworkRequestPartResponse>(baseUrl, `/network/request?${params.toString()}`)
}

async function getDialogs(baseUrl: string): Promise<DialogsResponse> {
  return requestJson<DialogsResponse>(baseUrl, '/dialogs')
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ])
}

async function waitForNetworkRequest(
  baseUrl: string,
  predicate: (request: NetworkRequestsResponse['requests'][number]) => boolean,
): Promise<NetworkRequestsResponse> {
  const deadline = Date.now() + 5_000
  let last: NetworkRequestsResponse | null = null
  while (Date.now() < deadline) {
    const response = await getNetworkRequests(baseUrl)
    last = response
    if (response.requests.some(predicate)) return response
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for network request. Received: ${JSON.stringify(last)}`)
}
