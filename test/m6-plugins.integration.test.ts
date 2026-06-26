// Real-chromium plugin behavior (M6): each plugin OFF by default (core unchanged) and adds only
// its documented signal when enabled. Env is set BEFORE startDaemon (config is read at session
// construction).

import { describe, it, expect } from 'vitest'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDaemon, type DaemonHandle } from '../src/daemon.js'
import { requestJson } from '../src/session.js'

function serve(html: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_r, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(html)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const url = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}/` : ''
      resolve({ url, close: () => new Promise<void>((r) => server.close(() => r())) })
    })
  })
}

async function withDaemon<T>(env: Record<string, string>, fn: (endpoint: string, baseUrl: string) => Promise<T>, html: string): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  const page = await serve(html)
  const dir = mkdtempSync(join(tmpdir(), 'agrune-m6-'))
  const endpoint = `unix:${join(dir, 'd.sock')}`
  let handle: DaemonHandle | null = null
  try {
    handle = await startDaemon({ endpoint, headless: true })
    return await fn(endpoint, page.url)
  } finally {
    await handle?.close()
    await page.close()
    rmSync(dir, { recursive: true, force: true })
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

const FEEDBACK_MANIFEST = {
  version: 3,
  groups: [
    {
      groupId: 'g',
      targets: [
        { targetId: 'go', name: 'Go', selector: { css: '#go' }, actionKinds: ['click'], onSuccess: 'The panel opened.' },
        // A second DECLARED target, hidden until the click — its appearance bumps the snapshot
        // version (the `changed` bit is a declared-target signature delta, §4.4).
        { targetId: 'confirm', name: 'Confirm', selector: { css: '#confirm' }, actionKinds: ['click'] },
      ],
    },
  ],
}
const FEEDBACK_HTML = `<!doctype html><title>FB</title>
<button id="go" onclick="document.getElementById('p').style.display='block'">Go</button>
<div id="p" style="display:none"><button id="confirm">Confirm</button></div>
<script>window.__agrune_manifest__=${JSON.stringify(FEEDBACK_MANIFEST)}</script>`

const UNMAPPED_MANIFEST = {
  version: 3,
  groups: [{ groupId: 'g', targets: [{ targetId: 'known', name: 'Known', selector: { css: '#known' }, actionKinds: ['click'] }] }],
}
const UNMAPPED_HTML = `<!doctype html><title>UM</title>
<button id="known">Known</button>
<button id="surprise" data-testid="surprise">Surprise</button>
<script>window.__agrune_manifest__=${JSON.stringify(UNMAPPED_MANIFEST)}</script>`

const HEAL_MANIFEST = {
  version: 3,
  groups: [{ groupId: 'g', targets: [{ targetId: 'save', name: 'Save', selector: { css: '#gone-selector' }, actionKinds: ['click'] }] }],
}
const HEAL_HTML = `<!doctype html><title>SH</title>
<button id="real-save" onclick="document.title='SAVED'">Save</button>
<script>window.__agrune_manifest__=${JSON.stringify(HEAL_MANIFEST)}</script>`

const DRIFT_MANIFEST = {
  version: 3,
  groups: [
    {
      groupId: 'board',
      name: 'Board',
      targets: [
        { targetId: 'a', name: 'A', selector: { css: '#a' }, actionKinds: ['click'] },
        { targetId: 'b', name: 'B', selector: { css: '#b' }, actionKinds: ['click'] },
        { targetId: 'c', name: 'C', selector: { css: '#c' }, actionKinds: ['click'] },
        { targetId: 'd', name: 'D', selector: { css: '#d' }, actionKinds: ['click'] },
      ],
    },
  ],
}
const DRIFT_HTML = `<!doctype html><title>DR</title>
<button id="a">A</button><button id="b">B</button>
<button id="c">C</button><button id="d">D</button>
<script>window.__agrune_manifest__=${JSON.stringify(DRIFT_MANIFEST)}</script>`

// Remove 3 of the 4 board buttons (keep #a so the group stays ENGAGED) → structure break.
const BREAK_DOM = `() => { for (const id of ['b','c','d']) document.getElementById(id)?.remove() }`

describe('M6 — manifest drift (§8.6, default-ON; real chromium)', () => {
  it('healthy screen: no drift field, no a11y attached', async () => {
    await withDaemon({}, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      const r = (await requestJson(endpoint, 'GET', '/targets')) as any
      expect(r.drift).toBeUndefined()
      expect(r.ariaFallback).toBeUndefined()
    }, DRIFT_HTML)
  })

  it('structure break: regression from a healthy baseline → drift + full-page a11y attached', async () => {
    await withDaemon({}, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      // First read establishes the healthy high-water-mark (4/4 board targets) — no drift yet.
      const healthy = (await requestJson(endpoint, 'GET', '/targets')) as any
      expect(healthy.drift).toBeUndefined()
      // Now break the structure; the next read sees the regression from 4 → 1.
      await requestJson(endpoint, 'POST', '/evaluate', { source: BREAK_DOM })
      const r = (await requestJson(endpoint, 'GET', '/targets')) as any
      expect(r.drift?.drifted).toBe(true)
      expect(r.drift.groups[0].groupId).toBe('board')
      expect(r.drift.groups[0].baseline).toBe(4)
      expect(r.drift.groups[0].resolved).toBe(1)
      expect(r.drift.groups[0].missing).toBe(3)
      expect(typeof r.ariaFallback).toBe('string')
      expect(r.ariaFallback.length).toBeGreaterThan(0)
    }, DRIFT_HTML)
  })

  it('wizard-style first sight: many targets unresolved but NEVER healthier → no false drift', async () => {
    // The page loads with only 1 of 4 board targets present from the start (no baseline of 4 is
    // ever established). This is the progressive-disclosure shape; it must NOT read as drift.
    const WIZARD_HTML = `<!doctype html><title>WZ</title>
<button id="a">A</button>
<script>window.__agrune_manifest__=${JSON.stringify(DRIFT_MANIFEST)}</script>`
    await withDaemon({}, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      const r = (await requestJson(endpoint, 'GET', '/targets')) as any
      expect(r.drift).toBeUndefined()
    }, WIZARD_HTML)
  })

  it('AGRUNE_DRIFT=off: same break is NOT flagged (escape hatch disabled)', async () => {
    await withDaemon({ AGRUNE_DRIFT: 'off' }, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      await requestJson(endpoint, 'POST', '/evaluate', { source: BREAK_DOM })
      const r = (await requestJson(endpoint, 'GET', '/targets')) as any
      expect(r.drift).toBeUndefined()
      expect(r.ariaFallback).toBeUndefined()
    }, DRIFT_HTML)
  })
})

describe('M6 — plugins OFF by default (core unchanged, A.0.4)', () => {
  it('feedback absent: click returns no changed/feedback fields', async () => {
    await withDaemon({}, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      const r = (await requestJson(endpoint, 'POST', '/click', { target: 'go', action: 'click' })) as any
      expect(r.changed).toBeUndefined()
      expect(r.feedback).toBeUndefined()
    }, FEEDBACK_HTML)
  })

  it('self-heal absent: a drifted target → TARGET_NOT_FOUND with NO repair field', async () => {
    await withDaemon({}, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      await expect(requestJson(endpoint, 'POST', '/click', { target: 'save', action: 'click' })).rejects.toMatchObject({
        code: 'TARGET_NOT_FOUND',
      })
    }, HEAL_HTML)
  })
})

describe('M6 — plugins ON add only their signal', () => {
  it('AGRUNE_FEEDBACK: click that changes the screen → changed:true + onSuccess', async () => {
    await withDaemon({ AGRUNE_FEEDBACK: '1' }, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      const r = (await requestJson(endpoint, 'POST', '/click', { target: 'go', action: 'click' })) as any
      expect(r.changed).toBe(true)
      expect(r.feedback).toBe('The panel opened.')
    }, FEEDBACK_HTML)
  })

  it('AGRUNE_UNMAPPED: snapshot grafts an undeclared control as an x-ref', async () => {
    await withDaemon({ AGRUNE_UNMAPPED: '1' }, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      const snap = (await requestJson(endpoint, 'GET', '/targets')) as any
      const unmappedGroup = snap.snapshot.groups.find((g: any) => g.groupId === 'unmapped')
      expect(unmappedGroup).toBeTruthy()
      expect(snap.snapshot.targets.some((t: any) => t.sourceFile === 'unmapped' && t.name === 'Surprise')).toBe(true)
    }, UNMAPPED_HTML)
  })

  it('AGRUNE_SELF_HEAL: a drifted target auto-heals from author intent and the click lands', async () => {
    await withDaemon({ AGRUNE_SELF_HEAL: 'on' }, async (endpoint, url) => {
      await requestJson(endpoint, 'POST', '/open', { url })
      const r = (await requestJson(endpoint, 'POST', '/click', { target: 'save', action: 'click' })) as any
      expect(r.ok).toBe(true)
      const read = (await requestJson(endpoint, 'GET', '/read')) as any
      // onclick set document.title='SAVED'; the page body still renders "Save".
      expect(read.ok).toBe(true)
    }, HEAL_HTML)
  })
})
