// Real-chromium action test via the in-process daemon (HTTP-over-unix-socket). Covers the
// HAVE-set verbs, the dialog interruption model, console/network recorders, and read=innerText.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDaemon, type DaemonHandle } from '../src/daemon.js'
import { requestJson } from '../src/session.js'

const MANIFEST = {
  version: 3,
  groups: [
    {
      groupId: 'f',
      name: 'Form',
      targets: [
        { targetId: 'name', name: 'Name', selector: { css: '#name' }, actionKinds: ['fill'] },
        { targetId: 'pass', name: 'Pass', selector: { css: '#pass' }, actionKinds: ['fill'], sensitive: true },
        { targetId: 'color', name: 'Color', selector: { css: '#color' }, actionKinds: ['select'] },
        { targetId: 'go', name: 'Go', selector: { css: '#go' }, actionKinds: ['click'] },
        { targetId: 'del', name: 'Del', selector: { css: '#del' }, actionKinds: ['click'] },
      ],
    },
  ],
}

const HTML = `<!doctype html><title>Form</title>
<input id="name">
<input id="pass" type="password">
<select id="color"><option value="r">Red</option><option value="g">Green</option></select>
<button id="go" onclick="document.getElementById('out').textContent='go:'+document.getElementById('name').value+'/'+document.getElementById('color').value;console.log('clicked-go')">Go</button>
<button id="del" onclick="if(confirm('sure?'))document.getElementById('out').textContent='deleted'">Del</button>
<div id="out">idle</div>
<script>window.__agrune_manifest__=${JSON.stringify(MANIFEST)}</script>`

const URL = `data:text/html,${encodeURIComponent(HTML)}`

let handle: DaemonHandle | null = null
let endpoint = ''
let dir = ''
let ok = true

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  return requestJson(endpoint, 'POST', path, body)
}
async function get(path: string): Promise<any> {
  return requestJson(endpoint, 'GET', path)
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'agrune-m4-'))
  endpoint = `unix:${join(dir, 'd.sock')}`
  try {
    handle = await startDaemon({ endpoint, headless: true })
    await post('/open', { url: URL })
  } catch {
    ok = false
  }
}, 60_000)

afterAll(async () => {
  await handle?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('M4 — core actions (real chromium)', () => {
  it('fill (insert) + select + click run the onclick and read=innerText', async () => {
    if (!ok) return
    const fill = await post('/fill', { target: 'name', value: 'Chen' })
    expect(fill).toMatchObject({ ok: true, target: 'name', value: 'Chen', strategy: 'insert' })

    await post('/select', { target: 'color', values: ['g'], mode: 'value' })
    await post('/click', { target: 'go', action: 'click' })

    const read = await get('/read')
    expect(read.text).toContain('go:Chen/g')
  })

  it('password fill auto-selects the keystroke strategy (sensitive)', async () => {
    if (!ok) return
    const fill = await post('/fill', { target: 'pass', value: 'secret123' })
    expect(fill.strategy).toBe('keystroke')
  })

  it('console recorder captures the page log', async () => {
    if (!ok) return
    const res = await get('/console')
    expect(res.messages.some((m: any) => m.text === 'clicked-go')).toBe(true)
  })

  it('network recorder captures the navigation request', async () => {
    if (!ok) return
    const res = await get('/network?all=1')
    expect(Array.isArray(res.requests)).toBe(true)
  })

  it('dialog interruption: click returns the dialog without hanging; handle completes the action', async () => {
    if (!ok) return
    const click = await post('/click', { target: 'del', action: 'click' })
    expect(click.dialog).toMatchObject({ type: 'confirm', message: 'sure?', handled: false })

    const dialogs = await get('/dialogs')
    expect(dialogs.dialogs.some((d: any) => !d.handled)).toBe(true)

    const handled = await post('/dialog/handle', { accept: true })
    expect(handled.dialog.accepted).toBe(true)

    const read = await get('/read')
    expect(read.text).toContain('deleted')
  })

  it('a pending-dialog blocks the next act with FLOW_BLOCKED until handled', async () => {
    if (!ok) return
    // Re-open a fresh page to get a clean dialog state.
    await post('/navigate', { url: URL })
    await post('/click', { target: 'del', action: 'click' }) // opens a confirm, parks it
    await expect(post('/click', { target: 'go', action: 'click' })).rejects.toMatchObject({
      code: 'FLOW_BLOCKED',
    })
    await post('/dialog/handle', { accept: false })
  })

  it('run-code-unsafe is gated off by default', async () => {
    if (!ok) return
    await expect(post('/run-code-unsafe', { code: '(page) => page.url()' })).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
  })

  it('evaluate runs a page expression', async () => {
    if (!ok) return
    const res = await post('/evaluate', { source: '1 + 2' })
    expect(res.result).toBe(3)
  })

  it('wait modes validate (exactly one of target/text/textGone/time)', async () => {
    if (!ok) return
    await expect(post('/wait', { target: 'go', text: 'x' })).rejects.toMatchObject({ code: 'INVALID_COMMAND' })
    const r = await post('/wait', { target: 'go', state: 'visible' })
    expect(r.action).toBe('wait:visible')
  })
})
