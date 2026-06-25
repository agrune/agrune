// In-process daemon integration test — launches a REAL headless chromium and exercises the
// HTTP-over-unix-socket protocol end to end (A.1). Skipped automatically if chromium is not
// installed (so CI without browsers still passes the rest of the suite).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDaemon, type DaemonHandle } from '../src/daemon.js'
import { requestJson } from '../src/session.js'
import type { DaemonHealth, PublicTab } from '../src/types.js'

let chromiumAvailable = true
let handle: DaemonHandle | null = null
let endpoint = ''
let dir = ''

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'agrune-m1-'))
  endpoint = `unix:${join(dir, 'daemon.sock')}`
  try {
    handle = await startDaemon({ endpoint, headless: true })
  } catch {
    chromiumAvailable = false
  }
}, 60_000)

afterAll(async () => {
  await handle?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('M1 — daemon wire protocol (A.1)', () => {
  it('GET /health returns the agrune-daemon envelope', async () => {
    if (!chromiumAvailable) return
    const health = await requestJson<DaemonHealth>(endpoint, 'GET', '/health')
    expect(health.ok).toBe(true)
    expect(health.name).toBe('agrune-daemon')
    expect(health.browser).toBe('playwright')
  })

  it('open → navigate → tabs → close roundtrip; one persistent context', async () => {
    if (!chromiumAvailable) return
    const open1 = await requestJson<{ ok: true; index: number; tab: PublicTab }>(
      endpoint,
      'POST',
      '/open',
      { url: 'data:text/html,<title>One</title>' },
    )
    expect(open1.ok).toBe(true)
    expect(open1.tab.title).toBe('One')
    expect(open1.tab.tabId).toBe(1)

    const open2 = await requestJson<{ ok: true; tab: PublicTab }>(endpoint, 'POST', '/open', {
      url: 'data:text/html,<title>Two</title>',
    })
    expect(open2.tab.tabId).toBe(2)

    const tabs = await requestJson<{ ok: true; tabs: PublicTab[] }>(endpoint, 'GET', '/tabs')
    expect(tabs.tabs.map((t) => t.tabId)).toEqual([1, 2])

    const nav = await requestJson<{ ok: true; action: string; tab: PublicTab }>(
      endpoint,
      'POST',
      '/navigate',
      { url: 'data:text/html,<title>Navved</title>', tabId: 1 },
    )
    expect(nav.action).toBe('navigate')
    expect(nav.tab.title).toBe('Navved')

    const closed = await requestJson<{ ok: true; closedTabId: number; tabs: PublicTab[] }>(
      endpoint,
      'POST',
      '/close',
      { tabId: 2 },
    )
    expect(closed.closedTabId).toBe(2)
    expect(closed.tabs.map((t) => t.tabId)).toEqual([1])
  })

  it('errors come back as a 400 ok:false envelope with code + message', async () => {
    if (!chromiumAvailable) return
    await expect(
      requestJson(endpoint, 'POST', '/navigate', { url: 'data:text/html,x', tabId: 99 }),
    ).rejects.toMatchObject({ code: 'TAB_NOT_FOUND' })

    await expect(requestJson(endpoint, 'POST', '/open', {})).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })

    await expect(requestJson(endpoint, 'GET', '/nonexistent')).rejects.toMatchObject({
      code: 'INVALID_COMMAND',
    })
  })
})
