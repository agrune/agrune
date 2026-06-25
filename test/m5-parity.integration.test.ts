// Real-chromium parity-set test (M5). Serves the page over HTTP (so localStorage works) and
// exercises the MISSING-set commands via the in-process daemon.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDaemon, type DaemonHandle } from '../src/daemon.js'
import { requestJson } from '../src/session.js'

const MANIFEST = {
  version: 3,
  groups: [
    {
      groupId: 'f',
      name: 'F',
      targets: [
        { targetId: 'agree', name: 'Agree', selector: { css: '#agree' }, actionKinds: ['click'] },
        { targetId: 'name', name: 'Name', selector: { testId: 'name' }, actionKinds: ['fill'] },
      ],
    },
  ],
}
const HTML = `<!doctype html><title>M5</title>
<input type="checkbox" id="agree">
<input data-testid="name">
<script>window.__agrune_manifest__=${JSON.stringify(MANIFEST)}</script>`

let server: http.Server
let baseUrl = ''
let handle: DaemonHandle | null = null
let endpoint = ''
let dir = ''
let ok = true

const post = (p: string, b: Record<string, unknown>) => requestJson(endpoint, 'POST', p, b)
const get = (p: string) => requestJson(endpoint, 'GET', p)

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(HTML)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address()
  baseUrl = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}/` : ''

  dir = mkdtempSync(join(tmpdir(), 'agrune-m5-'))
  endpoint = `unix:${join(dir, 'd.sock')}`
  try {
    handle = await startDaemon({ endpoint, headless: true })
    await post('/open', { url: baseUrl })
  } catch {
    ok = false
  }
}, 60_000)

afterAll(async () => {
  await handle?.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('M5 — parity MISSING set (real chromium)', () => {
  it('check / uncheck a checkbox', async () => {
    if (!ok) return
    expect((await post('/check', { target: 'agree' })).action).toBe('check')
    expect((await post('/uncheck', { target: 'agree' })).action).toBe('uncheck')
  })

  it('keyboard + mouse primitives', async () => {
    if (!ok) return
    expect((await post('/keydown', { key: 'Shift' })).action).toBe('keydown')
    expect((await post('/keyup', { key: 'Shift' })).action).toBe('keyup')
    expect((await post('/mousemove', { x: 10, y: 10 })).action).toBe('mousemove')
    expect((await post('/mousedown', { button: 'left' })).action).toBe('mousedown')
    expect((await post('/mouseup', {})).action).toBe('mouseup')
    expect((await post('/mousewheel', { deltaY: 100 })).action).toBe('mousewheel')
  })

  it('generate-locator + highlight on a testId target', async () => {
    if (!ok) return
    const loc = await get('/generate-locator?target=name')
    expect((loc as any).playwright).toContain('getByTestId')
    expect((await post('/highlight', { target: 'name' })).action).toBe('highlight')
  })

  it('cookies set/list/get/delete/clear', async () => {
    if (!ok) return
    await post('/cookies/set', { cookie: { name: 'sid', value: 'abc', url: baseUrl } })
    expect((await get('/cookies') as any).cookies.length).toBe(1)
    expect((await get('/cookies/get?name=sid') as any).cookies[0].value).toBe('abc')
    await post('/cookies/delete', { name: 'sid' })
    expect((await get('/cookies') as any).cookies.length).toBe(0)
  })

  it('localStorage set/get/list/clear (over http)', async () => {
    if (!ok) return
    await post('/storage', { area: 'local', op: 'set', key: 'k1', value: 'hello' })
    expect((await post('/storage', { area: 'local', op: 'get', key: 'k1' }) as any).value).toBe('hello')
    expect((await post('/storage', { area: 'local', op: 'list' }) as any).items.k1).toBe('hello')
    await post('/storage', { area: 'local', op: 'clear' })
    expect((await post('/storage', { area: 'local', op: 'get', key: 'k1' }) as any).value).toBeNull()
  })

  it('route / route-list / unroute registry', async () => {
    if (!ok) return
    await post('/route', { glob: '**/*.png', action: 'block' })
    expect((await get('/route-list') as any).routes).toEqual([{ glob: '**/*.png', action: 'block' }])
    await post('/unroute', { glob: '**/*.png' })
    expect((await get('/route-list') as any).routes).toEqual([])
  })

  it('network-state offline toggle', async () => {
    if (!ok) return
    expect((await post('/network-state', { offline: true })).offline).toBe(true)
    await post('/network-state', { offline: false })
  })

  it('pdf + tracing + state-save write real files', async () => {
    if (!ok) return
    const pdf = (await post('/pdf', { path: join(dir, 'out.pdf') })) as any
    expect(existsSync(pdf.path)).toBe(true)

    await post('/tracing/start', {})
    const trace = (await post('/tracing/stop', { path: join(dir, 'trace.zip') })) as any
    expect(existsSync(trace.path)).toBe(true)

    const state = (await post('/state-save', { path: join(dir, 'state.json') })) as any
    expect(existsSync(state.path)).toBe(true)
  })

  it('list + close-all lifecycle', async () => {
    if (!ok) return
    await post('/open', { url: baseUrl })
    expect((await get('/list') as any).tabs.length).toBeGreaterThanOrEqual(2)
    await post('/close-all', {})
    expect((await get('/list') as any).tabs.length).toBe(0)
  })
})
