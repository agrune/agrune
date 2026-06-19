// Dump the EXACT context the agent receives at each step, for all three
// representations (agrune_desc / agrune_nodesc / raw-aria=pwcli), across a few
// app states, into one HTML file for human inspection.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { buildSnapshotFromManifest, createSnapshotStore } from '@agrune/backend'
import { toAgentTargetRef } from '@agrune/core'
import { countTokens } from '../tokens.mjs'

const DIST = '/Users/chenjing/dev/agrune/demo/dist'
const OUT = '/Users/chenjing/dev/agrune/output/agrune-context-view.html'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

function filterVisible(s) {
  const targets = s.targets.filter(t => t.domResolved && t.visible)
  const keep = new Set(targets.map(t => t.targetId))
  const groups = s.groups.map(g => ({ ...g, targetIds: g.targetIds.filter(id => keep.has(id)) })).filter(g => g.targetIds.length)
  return { ...s, groups, targets }
}
function formatAgrune(s, withDesc) {
  const L = ['### Page', `- Page URL: ${s.url}`, `- Page Title: ${s.title}`, '### Targets']
  const order = []; const buckets = new Map()
  for (const t of s.targets) { if (!buckets.has(t.groupId)) { buckets.set(t.groupId, []); order.push(t.groupId) } buckets.get(t.groupId).push(t) }
  for (const gid of order) {
    L.push(`## ${gid}`)
    for (const t of buckets.get(gid)) {
      let line = `- [ref=${toAgentTargetRef(t)}] {${(t.actionKinds || []).join(',')}} ${t.name}`
      if (withDesc && t.description) line += ` — ${t.description}`
      if (t.valuePreview) line += ` = ${JSON.stringify(t.valuePreview)}`
      L.push(line)
    }
    L.push('')
  }
  return L.join('\n')
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function capture(page, manifest) {
  const snap = filterVisible(await buildSnapshotFromManifest(page, manifest, createSnapshotStore()))
  const desc = formatAgrune(snap, true)
  const nodesc = formatAgrune(snap, false)
  const aria = await page.ariaSnapshot({ mode: 'ai' })
  return {
    agrune_desc: { text: desc, tok: countTokens(desc) },
    agrune_nodesc: { text: nodesc, tok: countTokens(nodesc) },
    raw_aria: { text: aria, tok: countTokens(aria) },
  }
}

const srv = createServer(async (req, res) => { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html'; let f = resolve(DIST, '.' + p); let b; try { b = await readFile(f) } catch { f = resolve(DIST, 'index.html'); b = await readFile(f) } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(b) })
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port
const base = `http://127.0.0.1:${port}/`
const manifest = JSON.parse(await readFile('/Users/chenjing/dev/agrune/demo/manifest.json', 'utf8'))
const b = await chromium.launch({ headless: true }); const page = await b.newPage({ viewport: { width: 1280, height: 900 } })

const states = []
// 1) Board (initial)
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-agrune-demo="task-card"]', { timeout: 10000 })
states.push({ name: 'Board (initial) — where the agent must find a specific task card', caps: await capture(page, manifest) })
// 2) Task detail dialog (double-click task-2 "Implement authentication flow")
await page.locator('[data-agrune-demo="task-card"][data-task-id="task-2"]').dblclick()
await page.waitForTimeout(600)
states.push({ name: 'Task detail dialog open (after double-clicking task-2) — the comment UI', caps: await capture(page, manifest) })
// 3) New Task wizard
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-agrune-demo="task-card"]', { timeout: 10000 })
await page.getByTestId('board-new-task-button').click().catch(() => page.getByRole('button', { name: /new task/i }).click())
await page.waitForTimeout(600)
states.push({ name: 'New Task wizard (step 1) open', caps: await capture(page, manifest) })

await b.close(); srv.close()

const order = [['agrune_desc', 'agrune (with descriptions)'], ['agrune_nodesc', 'agrune (no descriptions)'], ['raw_aria', 'raw a11y (= playwright-cli / pwcli)']]
let html = `<!doctype html><html><head><meta charset="utf-8"><title>Agent context view</title>
<style>
body{font:13px -apple-system,system-ui,sans-serif;margin:0;background:#0d1117;color:#e6edf3}
h1{font-size:18px;padding:16px 20px;margin:0;background:#161b22;border-bottom:1px solid #30363d}
.state{padding:16px 20px;border-bottom:2px solid #30363d}
.state>h2{font-size:15px;color:#58a6ff;margin:0 0 12px}
.cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.col{background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
.col h3{font-size:13px;margin:0;padding:8px 10px;background:#21262d;border-bottom:1px solid #30363d}
.col .tok{color:#7ee787;font-weight:600}
pre{margin:0;padding:10px;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:520px;font:11px ui-monospace,Menlo,monospace;color:#c9d1d9}
@media(max-width:1100px){.cols{grid-template-columns:1fr}}
</style></head><body>
<h1>에이전트가 받는 실제 컨텍스트 (agrune_desc / agrune_nodesc / raw-aria) — 데모 상태별</h1>`
for (const st of states) {
  html += `<div class="state"><h2>${esc(st.name)}</h2><div class="cols">`
  for (const [k, label] of order) {
    const c = st.caps[k]
    html += `<div class="col"><h3>${esc(label)} · <span class="tok">${c.tok} tok</span></h3><pre>${esc(c.text)}</pre></div>`
  }
  html += `</div></div>`
}
html += `</body></html>`
await writeFile(OUT, html, 'utf8')
console.log('wrote', OUT)
