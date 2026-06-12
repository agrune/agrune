import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlaywrightDriver } from '../src/playwright-driver'

const RUN_SMOKE = process.env.AGRUNE_BACKEND_SMOKE === '1'
const describeSmoke = RUN_SMOKE ? describe : describe.skip

function pageUrl(body: string, manifest: unknown): string {
  const html = `<!doctype html><html><body>${body}<script>window.__agrune_manifest__ = ${JSON.stringify(manifest)}</script></body></html>`
  return `data:text/html,${encodeURIComponent(html)}`
}

const BASIC_PAGE = pageUrl(
  '<button id="b1" onclick="this.textContent=\'clicked\'">go</button>',
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [{ targetId: 'btn', name: 'Go', desc: 'main button', actionKinds: ['click'], selector: { css: '#b1' } }],
    }],
  },
)

const OVERLAY_PAGE = pageUrl(
  `
  <button id="outside">outside</button>
  <div role="dialog"><button id="ok">ok</button></div>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [
        { targetId: 'outside', name: 'Outside', desc: '', actionKinds: ['click'], selector: { css: '#outside' } },
        { targetId: 'ok', name: 'Ok', desc: '', actionKinds: ['click'], selector: { css: '#ok' } },
      ],
    }],
  },
)

describeSmoke('PlaywrightDriver (headless chromium smoke)', () => {
  const driver = new PlaywrightDriver({ connection: { mode: 'launch', headless: true } })

  beforeAll(async () => {
    await driver.connect()
  }, 60_000)

  afterAll(async () => {
    await driver.disconnect()
  })

  it('builds a snapshot from the page manifest and executes act commands', async () => {
    const opened = await driver.openTab(BASIC_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const snapshot = driver.getSnapshot(opened.tabId)
    expect(snapshot).not.toBe(null)
    const target = snapshot?.targets.find(entry => entry.targetId === 'btn')
    expect(target?.actionableNow).toBe(true)
    expect(target?.reason).toBe('ready')

    const result = await driver.execute(opened.tabId, { kind: 'act', targetId: 'btn', action: 'click' })
    expect(result.ok).toBe(true)
    expect(result.snapshot?.targets.find(entry => entry.targetId === 'btn')?.textContent).toBe('clicked')
  }, 30_000)

  it('keeps background tab snapshots available after ensureReady', async () => {
    const first = driver.resolveTabId()
    expect(first).not.toBe(null)

    const second = await driver.openTab(BASIC_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    // Regression guard: explicit-tabId snapshot reads must work for non-active tabs.
    expect(driver.getSnapshot(first as number)).not.toBe(null)
    expect(driver.getSnapshot(second.tabId)).not.toBe(null)
  }, 30_000)

  it('produces an empty snapshot for pages without an Agrune manifest', async () => {
    const opened = await driver.openTab('data:text/html,<p>no manifest here</p>')
    expect(await driver.ensureReady()).toBe(null)
    const snapshot = driver.getSnapshot(opened.tabId)
    expect(snapshot?.targets).toEqual([])
  }, 30_000)

  it('blocks non-overlay targets while an overlay flow is active (FLOW_BLOCKED)', async () => {
    const opened = await driver.openTab(OVERLAY_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const blocked = await driver.execute(opened.tabId, { kind: 'act', targetId: 'outside', action: 'click' })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.code).toBe('FLOW_BLOCKED')

    const allowed = await driver.execute(opened.tabId, { kind: 'act', targetId: 'ok', action: 'click' })
    expect(allowed.ok).toBe(true)
  }, 30_000)

  it('maps unknown targets to TARGET_NOT_FOUND command errors', async () => {
    const tabId = driver.resolveTabId()
    const result = await driver.execute(tabId as number, { kind: 'act', targetId: 'nope', action: 'click' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TARGET_NOT_FOUND')
  }, 30_000)
})
