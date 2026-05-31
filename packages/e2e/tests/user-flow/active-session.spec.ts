/**
 * Scenario B — SESS-01/02/03: browser_focus_tab + implicit-active-tab routing
 * via the real MCP handler → CdpDriver → real Chrome.
 *
 * Opens two tabs (tricky-inputs and overlay-modal), then verifies:
 *   1. A tool call without tabId targets whichever tab is currently active.
 *   2. browser_focus_tab flips the active session and the response payload
 *      reports session.{wasActive, becameActive} correctly.
 *   3. A follow-up call without tabId is now routed to the newly focused tab.
 */

import { stat } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import {
  createRealHarness,
  forceReprepare,
  realE2eSkipReason,
  waitForTargetByName,
  type RealHarness,
} from './helpers'

const skipReason = realE2eSkipReason()

const URL_A = 'http://127.0.0.1:5555/tricky-inputs.html'
const URL_B = 'http://127.0.0.1:5555/overlay-modal.html'

test.describe('real user-flow: active-session + browser_focus_tab', () => {
  test.skip(!!skipReason, skipReason ?? '')

  let harness: RealHarness | null = null

  test.beforeEach(async () => {
    harness = await createRealHarness({ startUrl: URL_A })
    await harness.driver.ensureReady()
  })

  test.afterEach(async () => {
    await harness?.teardown()
    harness = null
  })

  test('browser_focus_tab flips active tab and subsequent call routes there', async () => {
    const h = harness!

    // Open a second tab through the public MCP tool. Driver auto-attaches.
    const tabBId = await openNewTab(h, URL_B)

    // Inject the runtime into ALL attached sessions. The launch-mode
    // Chrome quirk that required this on the first tab applies here too.
    await forceReprepare(h.driver)

    // Wait for the snapshot scan to settle on the second tab.
    await waitUntil(() => h.driver.listSessions().some(s => s.tabId === tabBId && s.hasSnapshot), 10_000)

    const sessionsRes = await h.call('browser_list_tabs')
    const sessions = sessionsRes.parsed as Array<{ tabId: number; active: boolean; url: string }>
    expect(sessions.length).toBeGreaterThanOrEqual(2)

    const tabAId = sessions.find(s => s.url.includes('tricky-inputs'))?.tabId
    expect(tabAId, 'tab A tabId').toBeDefined()
    expect(tabBId).not.toBe(tabAId!)

    // Step 1: focus tab A explicitly (deterministic starting state).
    const focusA = await h.call('browser_focus_tab', { tabId: tabAId })
    const focusAParsed = focusA.parsed as {
      ok?: boolean
      session?: { wasActive: boolean; becameActive: boolean }
    }
    expect(focusAParsed.ok).toBe(true)

    // Step 2: implicit-target lookup — no tabId, expect it to hit tab A.
    const implicitA = await h.call('browser_get_targets', {})
    const implicitAParsed = implicitA.parsed as { url?: string } | null
    expect(implicitAParsed?.url ?? '').toContain('tricky-inputs')

    // Step 3: flip to tab B via browser_focus_tab.
    const focusB = await h.call('browser_focus_tab', { tabId: tabBId })
    const focusBParsed = focusB.parsed as {
      ok?: boolean
      session?: { tabId: number; wasActive: boolean; becameActive: boolean }
    }
    expect(focusBParsed.ok).toBe(true)
    expect(focusBParsed.session?.tabId).toBe(tabBId)
    expect(focusBParsed.session?.wasActive).toBe(false)
    expect(focusBParsed.session?.becameActive).toBe(true)

    // Step 4: implicit-target lookup — now should hit tab B.
    const implicitB = await h.call('browser_get_targets', {})
    const implicitBParsed = implicitB.parsed as { url?: string } | null
    expect(implicitBParsed?.url ?? '').toContain('overlay-modal')

    // Step 5: re-focusing tab B reports wasActive=true.
    const focusBAgain = await h.call('browser_focus_tab', { tabId: tabBId })
    const focusBAgainParsed = focusBAgain.parsed as {
      session?: { wasActive: boolean; becameActive: boolean }
    }
    expect(focusBAgainParsed.session?.wasActive).toBe(true)
  })

  test('unknown tabId returns TAB_NOT_FOUND', async () => {
    const h = harness!
    const res = await h.call('browser_focus_tab', { tabId: 9999 })
    expect(res.isError).toBe(true)
    const parsed = res.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('TAB_NOT_FOUND')
  })

  test('browser_snapshot exposes full target refs by default', async () => {
    const h = harness!

    const snapshot = await h.call('browser_snapshot', { includeTextContent: true })
    const parsed = snapshot.parsed as {
      url?: string
      targets?: Array<{ targetId: string; name?: string }>
    } | null

    expect(parsed?.url ?? '').toContain('tricky-inputs')
    expect(parsed?.targets?.some(target => target.targetId === 'cc-number')).toBe(true)
    expect(parsed?.targets?.some(target => target.targetId === 'country')).toBe(true)
  })

  test('browser_tabs selects and closes tabs by Playwright-style index', async () => {
    const h = harness!

    const opened = await h.call('browser_tabs', { action: 'new', url: URL_B })
    const openedParsed = opened.parsed as { ok?: boolean; tabId?: number; index?: number | null }
    expect(openedParsed.ok).toBe(true)
    expect(typeof openedParsed.tabId).toBe('number')

    await forceReprepare(h.driver)
    await waitUntil(() => h.driver.listSessions().some(s => s.tabId === openedParsed.tabId && s.hasSnapshot), 10_000)

    const list = await h.call('browser_tabs', { action: 'list' })
    const tabs = list.parsed as Array<{ index: number; tabId: number; url: string }>
    const tabB = tabs.find(tab => tab.tabId === openedParsed.tabId)
    expect(tabB?.url).toContain('overlay-modal')

    const select = await h.call('browser_tabs', { action: 'select', index: tabB!.index })
    const selectParsed = select.parsed as { ok?: boolean; session?: { tabId: number } }
    expect(selectParsed.ok).toBe(true)
    expect(selectParsed.session?.tabId).toBe(openedParsed.tabId)

    const implicitB = await h.call('browser_get_targets', {})
    const implicitBParsed = implicitB.parsed as { url?: string } | null
    expect(implicitBParsed?.url ?? '').toContain('overlay-modal')

    const close = await h.call('browser_tabs', { action: 'close', index: tabB!.index })
    const closeParsed = close.parsed as { ok?: boolean; tabId?: number; remaining?: Array<{ tabId: number }> }
    expect(closeParsed.ok).toBe(true)
    expect(closeParsed.tabId).toBe(openedParsed.tabId)
    expect(closeParsed.remaining?.some(tab => tab.tabId === openedParsed.tabId)).toBe(false)
  })

  test('browser_close closes the current active tab', async () => {
    const h = harness!

    const opened = await h.call('browser_tabs', { action: 'new', url: URL_B })
    const openedParsed = opened.parsed as { ok?: boolean; tabId?: number }
    expect(openedParsed.ok).toBe(true)
    expect(typeof openedParsed.tabId).toBe('number')

    const close = await h.call('browser_close')
    const closeParsed = close.parsed as { ok?: boolean; tabId?: number; remaining?: Array<{ tabId: number }> }
    expect(closeParsed.ok).toBe(true)
    expect(closeParsed.tabId).toBe(openedParsed.tabId)
    expect(closeParsed.remaining?.some(tab => tab.tabId === openedParsed.tabId)).toBe(false)
    expect(closeParsed.remaining?.length).toBeGreaterThanOrEqual(1)
  })

  test('browser_navigate and browser_navigate_back control the active tab', async () => {
    const h = harness!

    const navigate = await h.call('browser_navigate', { url: URL_B })
    const navigateParsed = navigate.parsed as { ok?: boolean; tabId?: number; url?: string }
    expect(navigateParsed.ok).toBe(true)
    expect(navigateParsed.url ?? '').toContain('overlay-modal')

    await forceReprepare(h.driver)
    await waitUntil(() => h.driver.listSessions().some(s => s.tabId === navigateParsed.tabId && s.url.includes('overlay-modal') && s.hasSnapshot), 10_000)
    const implicitB = await h.call('browser_get_targets', {})
    const implicitBParsed = implicitB.parsed as { url?: string } | null
    expect(implicitBParsed?.url ?? '').toContain('overlay-modal')

    const back = await h.call('browser_navigate_back')
    const backParsed = back.parsed as { ok?: boolean; tabId?: number; url?: string }
    expect(backParsed.ok).toBe(true)
    expect(backParsed.url ?? '').toContain('tricky-inputs')

    await forceReprepare(h.driver)
    await waitUntil(() => h.driver.listSessions().some(s => s.tabId === backParsed.tabId && s.url.includes('tricky-inputs') && s.hasSnapshot), 10_000)
    const implicitA = await h.call('browser_get_targets', {})
    const implicitAParsed = implicitA.parsed as { url?: string } | null
    expect(implicitAParsed?.url ?? '').toContain('tricky-inputs')
  })

  test('browser_wait_for supports Playwright-style text, textGone, and time modes', async () => {
    const h = harness!

    const text = await h.call('browser_wait_for', { text: 'Card number', timeoutMs: 1_000 })
    const textParsed = text.parsed as { ok?: boolean; result?: { text?: string } }
    expect(textParsed.ok).toBe(true)
    expect(textParsed.result?.text).toBe('Card number')

    const textGone = await h.call('browser_wait_for', { textGone: 'Never rendered', timeoutMs: 1_000 })
    const textGoneParsed = textGone.parsed as { ok?: boolean; result?: { textGone?: string } }
    expect(textGoneParsed.ok).toBe(true)
    expect(textGoneParsed.result?.textGone).toBe('Never rendered')

    const time = await h.call('browser_wait_for', { time: 0.01 })
    const timeParsed = time.parsed as { ok?: boolean; result?: { timeMs?: number } }
    expect(timeParsed.ok).toBe(true)
    expect(timeParsed.result?.timeMs).toBe(10)
  })

  test('browser_resize changes the active tab viewport', async () => {
    const h = harness!

    const resize = await h.call('browser_resize', { width: 900, height: 700 })
    const resizeParsed = resize.parsed as { ok?: boolean; tabId?: number; width?: number; height?: number }
    expect(resizeParsed.ok).toBe(true)
    expect(resizeParsed.width).toBe(900)
    expect(resizeParsed.height).toBe(700)

    const viewport = await viewportSizeForTab(h.driver, resizeParsed.tabId!)
    expect(viewport).toEqual({ width: 900, height: 700 })
  })

  test('browser_take_screenshot writes a page screenshot for the active tab', async ({}, testInfo) => {
    const h = harness!
    const filename = testInfo.outputPath('active-page.png')

    const screenshot = await h.call('browser_take_screenshot', { filename, type: 'png' })
    const parsed = screenshot.parsed as {
      ok?: boolean
      path?: string
      type?: string
      fullPage?: boolean
    }

    expect(parsed.ok).toBe(true)
    expect(parsed.path).toBe(filename)
    expect(parsed.type).toBe('png')
    expect(parsed.fullPage).toBe(false)
    expect((await stat(filename)).size).toBeGreaterThan(0)
  })

  test('browser_take_screenshot accepts a CSS selector target', async ({}, testInfo) => {
    const h = harness!
    const filename = testInfo.outputPath('active-selector.png')

    const screenshot = await h.call('browser_take_screenshot', {
      filename,
      targetId: '#cc',
      type: 'png',
    })
    const parsed = screenshot.parsed as {
      ok?: boolean
      path?: string
      target?: string
      type?: string
      fullPage?: boolean
    }

    expect(parsed.ok).toBe(true)
    expect(parsed.path).toBe(filename)
    expect(parsed.target).toBe('#cc')
    expect(parsed.type).toBe('png')
    expect(parsed.fullPage).toBe(false)
    expect((await stat(filename)).size).toBeGreaterThan(0)
  })

  test('browser_evaluate evaluates page and target functions', async () => {
    const h = harness!

    const pageEval = await h.call('browser_evaluate', {
      function: '() => location.pathname',
    })
    const pageParsed = pageEval.parsed as { ok?: boolean; result?: string }
    expect(pageParsed.ok).toBe(true)
    expect(pageParsed.result).toBe('/tricky-inputs.html')

    const cc = await waitForTargetByName(h.call, t => t.targetId === 'cc-number')
    expect(cc, 'cc-number target in snapshot').not.toBeNull()

    const targetEval = await h.call('browser_evaluate', {
      targetId: cc!.targetId,
      function: '(element) => element.getAttribute("id")',
    })
    const targetParsed = targetEval.parsed as { ok?: boolean; result?: string; target?: string }
    expect(targetParsed.ok).toBe(true)
    expect(targetParsed.result).toBe('cc')
    expect(targetParsed.target).toBe('cc-number')

    const selectorEval = await h.call('browser_evaluate', {
      targetId: '#cc',
      function: '(element) => element.getAttribute("id")',
    })
    const selectorParsed = selectorEval.parsed as { ok?: boolean; result?: string; target?: string }
    expect(selectorParsed.ok).toBe(true)
    expect(selectorParsed.result).toBe('cc')
    expect(selectorParsed.target).toBe('#cc')
  })

  test('browser_run_code_unsafe runs Playwright page code over CDP', async () => {
    const h = harness!

    const run = await h.call('browser_run_code_unsafe', {
      code: `async (page) => {
        await page.locator('#cc').fill('9876');
        return {
          path: new URL(page.url()).pathname,
          value: await page.locator('#cc').inputValue()
        };
      }`,
    })
    const parsed = run.parsed as { ok?: boolean; action?: string; result?: { path?: string; value?: string } }

    expect(parsed.ok).toBe(true)
    expect(parsed.action).toBe('run_code_unsafe')
    expect(parsed.result).toEqual({
      path: '/tricky-inputs.html',
      value: '9876',
    })
  })

  test('browser_press_key sends keyboard input to the focused element', async () => {
    const h = harness!

    const focus = await h.call('browser_evaluate', {
      function: '() => { const input = document.querySelector("#cc"); input.value = ""; input.focus(); return document.activeElement === input; }',
    })
    expect((focus.parsed as { ok?: boolean; result?: boolean }).result).toBe(true)

    const press = await h.call('browser_press_key', { key: '4' })
    const pressParsed = press.parsed as { ok?: boolean; action?: string; key?: string }
    expect(pressParsed).toMatchObject({ ok: true, action: 'press', key: '4' })

    await expect
      .poll(async () => {
        const value = await h.call('browser_evaluate', {
          function: '() => document.querySelector("#cc")?.value',
        })
        return (value.parsed as { result?: string }).result
      }, { timeout: 5_000 })
      .toBe('4')

    const backspace = await h.call('browser_press_key', { key: 'Backspace' })
    expect((backspace.parsed as { ok?: boolean }).ok).toBe(true)
    await expect
      .poll(async () => {
        const value = await h.call('browser_evaluate', {
          function: '() => document.querySelector("#cc")?.value',
        })
        return (value.parsed as { result?: string }).result
      }, { timeout: 5_000 })
      .toBe('')
  })

  test('browser_type types text into editable targets', async () => {
    const h = harness!
    const cc = await waitForTargetByName(h.call, t => t.targetId === 'cc-number')
    expect(cc, 'cc-number target in snapshot').not.toBeNull()

    await h.call('browser_evaluate', {
      function: '() => { document.querySelector("#cc").value = ""; document.querySelector("#bio").textContent = ""; }',
    })

    const typed = await h.call('browser_type', {
      targetId: cc!.targetId,
      text: '1234',
      slowly: true,
    })
    const typedParsed = typed.parsed as { ok?: boolean; action?: string; target?: string; text?: string }
    expect(typedParsed).toMatchObject({
      ok: true,
      action: 'type',
      target: 'cc-number',
      text: '1234',
    })

    await expect
      .poll(async () => {
        const value = await h.call('browser_evaluate', {
          function: '() => document.querySelector("#cc")?.value',
        })
        return (value.parsed as { result?: string }).result
      }, { timeout: 5_000 })
      .toBe('1234')

    const bio = await waitForTargetByName(h.call, t => t.targetId === 'bio')
    expect(bio, 'bio target in snapshot').not.toBeNull()
    const bioType = await h.call('browser_type', {
      targetId: bio!.targetId,
      text: 'hello bio',
    })
    expect((bioType.parsed as { ok?: boolean }).ok).toBe(true)
    await expect
      .poll(async () => {
        const value = await h.call('browser_evaluate', {
          function: '() => document.querySelector("#bio")?.textContent',
        })
        return (value.parsed as { result?: string }).result
      }, { timeout: 5_000 })
      .toBe('hello bio')
  })

  test('browser_select_option selects dropdown values', async () => {
    const h = harness!
    const country = await waitForTargetByName(h.call, t => t.targetId === 'country')
    expect(country, 'country target in snapshot').not.toBeNull()

    const selected = await h.call('browser_select_option', {
      targetId: country!.targetId,
      values: ['kr'],
    })
    const parsed = selected.parsed as { ok?: boolean; action?: string; target?: string; values?: string[] }
    expect(parsed).toMatchObject({
      ok: true,
      action: 'select',
      target: 'country',
      values: ['kr'],
    })

    await expect
      .poll(async () => {
        const value = await h.call('browser_evaluate', {
          function: '() => `${document.querySelector("#country")?.value}|${document.querySelector("#country-status")?.textContent}`',
        })
        return (value.parsed as { result?: string }).result
      }, { timeout: 5_000 })
      .toBe('kr|country:kr')
  })

  test('browser_fill_form fills multiple field types', async () => {
    const h = harness!
    const email = await waitForTargetByName(h.call, t => t.targetId === 'form-email')
    const subscribe = await waitForTargetByName(h.call, t => t.targetId === 'form-subscribe')
    const contact = await waitForTargetByName(h.call, t => t.targetId === 'form-contact-email')
    const country = await waitForTargetByName(h.call, t => t.targetId === 'country')
    const volume = await waitForTargetByName(h.call, t => t.targetId === 'form-volume')
    expect(email, 'form-email target in snapshot').not.toBeNull()
    expect(subscribe, 'form-subscribe target in snapshot').not.toBeNull()
    expect(contact, 'form-contact-email target in snapshot').not.toBeNull()
    expect(country, 'country target in snapshot').not.toBeNull()
    expect(volume, 'form-volume target in snapshot').not.toBeNull()

    const filled = await h.call('browser_fill_form', {
      fields: [
        { name: 'Email', targetId: email!.targetId, type: 'textbox', value: 'ada@example.test' },
        { name: 'Subscribe', targetId: subscribe!.targetId, type: 'checkbox', value: true },
        { name: 'Contact email', targetId: contact!.targetId, type: 'radio', value: true },
        { name: 'Country', targetId: country!.targetId, type: 'combobox', value: 'kr' },
        { name: 'Volume', targetId: volume!.targetId, type: 'slider', value: 7 },
      ],
    })
    const parsed = filled.parsed as { ok?: boolean; action?: string; fields?: Array<{ target?: string; type?: string }> }
    expect(parsed.ok, filled.text).toBe(true)
    expect(parsed.action).toBe('fill-form')
    expect(parsed.fields?.map(field => `${field.target}:${field.type}`)).toEqual([
      'form-email:textbox',
      'form-subscribe:checkbox',
      'form-contact-email:radio',
      'country:combobox',
      'form-volume:slider',
    ])

    await expect
      .poll(async () => {
        const value = await h.call('browser_evaluate', {
          function: '() => document.querySelector("#form-status")?.textContent',
        })
        return (value.parsed as { result?: string }).result
      }, { timeout: 5_000 })
      .toBe('form:ada@example.test|yes|email|kr|7')
  })

  test('browser_console_messages returns filtered console output', async () => {
    const h = harness!

    await h.call('browser_evaluate', {
      function: '() => { console.info("agrune-info"); console.warn("agrune-warn"); console.error("agrune-error"); }',
    })

    await expect
      .poll(async () => {
        const res = await h.call('browser_console_messages', { level: 'warning' })
        const parsed = res.parsed as { messages?: Array<{ text?: string }> }
        return parsed.messages?.map(message => message.text ?? '') ?? []
      }, { timeout: 5_000 })
      .toEqual(expect.arrayContaining(['agrune-warn', 'agrune-error']))

    const warnings = await h.call('browser_console_messages', { level: 'warning' })
    const parsed = warnings.parsed as { ok?: boolean; messages?: Array<{ level?: string; text?: string }> }
    expect(parsed.ok).toBe(true)
    expect(parsed.messages?.some(message => message.text === 'agrune-info')).toBe(false)
    expect(parsed.messages?.every(message => message.level === 'warning' || message.level === 'error')).toBe(true)
  })

  test('browser_network_requests and browser_network_request expose fetch details', async () => {
    const h = harness!

    await h.call('browser_evaluate', {
      function: 'async () => { const res = await fetch("/tricky-inputs.html?network-e2e=1"); await res.text(); return res.status; }',
    })

    await expect
      .poll(async () => {
        const res = await h.call('browser_network_requests', { filter: 'network-e2e' })
        const parsed = res.parsed as { requests?: Array<{ status?: number; url?: string }> }
        return parsed.requests?.some(request => request.status === 200 && request.url?.includes('network-e2e')) ?? false
      }, { timeout: 5_000 })
      .toBe(true)

    const list = await h.call('browser_network_requests', { filter: 'network-e2e' })
    const parsedList = list.parsed as {
      ok?: boolean
      requests?: Array<{ index: number; status?: number; url?: string; resourceType?: string }>
    }
    expect(parsedList.ok).toBe(true)
    const hit = parsedList.requests?.find(request => request.status === 200 && request.url?.includes('network-e2e'))
    expect(hit).toBeDefined()
    expect(hit?.resourceType).toBe('fetch')

    const detail = await h.call('browser_network_request', { index: hit!.index, part: 'response-body' })
    const parsedDetail = detail.parsed as { ok?: boolean; part?: string; value?: string }
    expect(parsedDetail.ok, detail.text).toBe(true)
    expect(parsedDetail.part).toBe('response-body')
    expect(parsedDetail.value).toContain('Card number')
  })
})

async function openNewTab(harness: RealHarness, url: string): Promise<number> {
  const res = await harness.call('browser_open_tab', { url })
  const parsed = res.parsed as { ok?: boolean; tabId?: number; error?: { message?: string } }
  if (parsed.ok !== true || typeof parsed.tabId !== 'number') {
    throw new Error(`browser_open_tab failed: ${parsed.error?.message ?? res.text}`)
  }
  const tabId = parsed.tabId

  // Wait until the new target shows up as a driver session.
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const sessions = harness.driver.listSessions()
    const hit = sessions.find(s => s.tabId === tabId)
    if (hit) return hit.tabId
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`new tab ${url} did not appear as a session within 10s`)
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(r => setTimeout(r, 100))
  }
}

async function viewportSizeForTab(driver: RealHarness['driver'], tabId: number): Promise<{ width: number; height: number }> {
  const anyDriver = driver as unknown as {
    targetManager: { getTarget: (tabId: number) => { sessionId: string | null } | null }
    connection: {
      send: (
        method: string,
        params: Record<string, unknown>,
        sessionId?: string,
      ) => Promise<Record<string, unknown>>
    }
  }
  const target = anyDriver.targetManager.getTarget(tabId)
  if (!target?.sessionId) {
    throw new Error(`No attached target for tabId ${tabId}`)
  }
  const result = await anyDriver.connection.send(
    'Runtime.evaluate',
    {
      expression: '(() => ({ width: window.innerWidth, height: window.innerHeight }))()',
      returnByValue: true,
    },
    target.sessionId,
  )
  const value = (result.result as { value?: { width?: number; height?: number } } | undefined)?.value
  if (typeof value?.width !== 'number' || typeof value.height !== 'number') {
    throw new Error('Viewport evaluation did not return numeric width/height')
  }
  return { width: value.width, height: value.height }
}
