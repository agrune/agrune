// Accuracy bench — Phase A (needs a live browser, run once).
//
// Serves the agrune demo (the user's own desc-rich manifest.json), drives it to
// several UI states, and for each state captures TWO representations of the same
// page:
//
//   1. agrune    — buildSnapshotFromManifest(...) → formatSnapshot (desc-rich,
//                  curated, the exact serializer the agent sees). Both the FULL
//                  (target refs + descriptions) and OUTLINE forms.
//   2. raw a11y  — page.ariaSnapshot({ mode: 'ai' }), i.e. EXACTLY what Playwright
//                  MCP's browser_snapshot hands a model ([ref=eN] annotated tree).
//
// It also bridges every visible agrune target to its a11y [ref=eN] (by on-screen
// center) so a downstream task's ground-truth element is addressable in BOTH
// representations — that bridge is what makes the accuracy scoring apples-to-apples.
//
// Output: packages/bench/fixtures/accuracy/<state>.json + index.json

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSnapshotFromManifest, createSnapshotStore, formatSnapshot } from '@agrune/backend'
import { toAgentTargetRef } from '@agrune/core'
import { countTokens, tokenizerMode } from '../tokens.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../../..')
const DEMO_DIR = process.env.AGRUNE_DEMO_DIR || resolve(REPO_ROOT, '../demo')
const DIST = resolve(DEMO_DIR, 'dist')
const MANIFEST_PATH = resolve(DEMO_DIR, 'manifest.json')
const OUT_DIR = resolve(__dirname, '../../fixtures/accuracy')

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2' }

function startServer(dist) {
  const server = createServer(async (req, res) => {
    try {
      let p = req.url.split('?')[0]
      if (p === '/') p = '/index.html'
      let file = resolve(dist, '.' + p)
      let buf
      try { buf = await readFile(file) } catch { file = resolve(dist, 'index.html'); buf = await readFile(file) }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
      res.end(buf)
    } catch (e) { res.writeHead(500); res.end(String(e)) }
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })))
}

function centerKey(c) { return `${Math.round(c.x)},${Math.round(c.y)}` }

function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy }

// Parse `- role "name" [ref=eN]` style lines from an ai aria snapshot.
function parseA11yRefs(text) {
  const re = /^(\s*)-\s+([a-zA-Z]+)(?:\s+"((?:[^"\\]|\\.)*)")?[^\n]*?\[ref=(e\d+)\]/gm
  const out = []
  let m
  while ((m = re.exec(text)) !== null) {
    out.push({ role: m[2], name: (m[3] ?? '').replace(/\\"/g, '"'), ref: m[4] })
  }
  return out
}

// Actionable a11y roles — when several refs share a screen location (e.g. an
// <input> nested in wrapper <div>s), the actionable, most-specific one is the real
// control. Bridging to a generic wrapper instead would mis-define ground truth.
const A11Y_ACTIONABLE = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'switch', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab',
  'slider', 'spinbutton', 'option',
])

async function a11yBox(page, ref) {
  try {
    const box = await page.locator(`aria-ref=${ref}`).first().boundingBox()
    if (!box) return null
    return { center: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, area: box.width * box.height }
  } catch { return null }
}

// Filter a raw ai aria snapshot down to actionable elements (keeps their [ref=eN]).
// This is the "a real MCP user could pre-filter to interactive roles" baseline,
// used to separate the value of curation from the value of the agrune format.
function a11yInteractiveOnly(text) {
  const out = ['- interactive elements (filtered from the accessibility tree):']
  for (const line of text.split('\n')) {
    if (!/\[ref=e\d+\]/.test(line)) continue
    const roleM = /^\s*-\s+([a-zA-Z]+)/.exec(line)
    const role = roleM ? roleM[1].toLowerCase() : ''
    if (A11Y_ACTIONABLE.has(role)) out.push(`  - ${line.trim()}`)
  }
  return out.join('\n')
}

function filterVisible(snapshot) {
  const targets = snapshot.targets.filter(t => t.domResolved && t.visible)
  const keep = new Set(targets.map(t => t.targetId))
  const groups = snapshot.groups
    .map(g => ({ ...g, targetIds: g.targetIds.filter(id => keep.has(id)) }))
    .filter(g => g.targetIds.length > 0)
  return { ...snapshot, groups, targets }
}

async function main() {
  if (!existsSync(DIST)) throw new Error(`demo dist not found: ${DIST} (run "pnpm build" in the demo)`)
  if (!existsSync(MANIFEST_PATH)) throw new Error(`manifest not found: ${MANIFEST_PATH}`)
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))

  const { server, port } = await startServer(DIST)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const base = `http://127.0.0.1:${port}/`
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="nav-board-tab"]', { timeout: 10000 })
  await page.waitForTimeout(600)

  const clickTab = async (testId) => {
    await page.locator(`[data-testid="${testId}"]`).click()
    await page.waitForTimeout(450)
  }

  const STATES = [
    { key: 'board', label: '칸반 보드', setup: async () => { await clickTab('nav-board-tab') } },
    { key: 'members', label: '멤버 테이블', setup: async () => { await clickTab('nav-members-tab') } },
    { key: 'documents', label: '문서 뷰어', setup: async () => { await clickTab('nav-docs-tab') } },
    { key: 'workflow', label: '워크플로우 편집기', setup: async () => { await clickTab('nav-workflow-tab') } },
    {
      key: 'task_wizard', label: '작업 생성 마법사', setup: async () => {
        await clickTab('nav-board-tab')
        await page.getByRole('button', { name: 'New Task' }).first().click()
        await page.waitForTimeout(600)
      },
    },
  ]

  await mkdir(OUT_DIR, { recursive: true })
  const index = []

  for (const state of STATES) {
    await state.setup()

    const snapshot = await buildSnapshotFromManifest(page, manifest, createSnapshotStore())
    const visible = filterVisible(snapshot)
    const visibleNoDesc = { ...visible, targets: visible.targets.map(t => ({ ...t, description: '' })) }

    // Four conditions — to separate "curation" and "desc-leak" from "format":
    //   agruneFull      = curated targets + name + description (the rich rep)
    //   agruneNameOnly  = curated targets + name, NO description (isolates desc effect)
    //   rawA11y         = full ariaSnapshot(mode:'ai') tree (what MCP gives raw)
    //   a11yInteractive = that tree filtered to actionable roles (curation a real
    //                     MCP user could trivially do — isolates curation from format)
    const agruneFullText = formatSnapshot(visible, { full: true })
    const agruneNameOnlyText = formatSnapshot(visibleNoDesc, { full: true })
    const agruneOutlineText = formatSnapshot(visible, {})
    const rawA11yText = await page.ariaSnapshot({ mode: 'ai' })
    const a11yInteractiveText = a11yInteractiveOnly(rawA11yText)

    // a11y refs → center+area, for bridging
    const refs = parseA11yRefs(rawA11yText)
    const a11yCands = []
    for (const r of refs) {
      const b = await a11yBox(page, r.ref)
      if (b) a11yCands.push({ ...r, center: b.center, area: b.area })
    }

    // Bridge each visible agrune target to its a11y ref. Among candidates within
    // tolerance, prefer the actionable, most-specific (smallest) element — so a
    // target nested in wrapper <div>s bridges to the real control, not the wrapper.
    const TOL2 = 20 * 20
    const elements = visible.targets.map(t => {
      const ref = toAgentTargetRef(t)
      const center = t.center ?? null
      let a11yRef = null, a11yName = null, a11yRole = null, bridgeDist = null
      if (center) {
        const inTol = a11yCands.filter(a => dist2(center, a.center) <= TOL2)
        const actionable = inTol.filter(a => A11Y_ACTIONABLE.has((a.role || '').toLowerCase()))
        let pool
        if (actionable.length) {
          // a control nested in wrappers: the actionable, most-specific (smallest) one
          pool = actionable.slice().sort((x, y) => (x.area - y.area) || (dist2(center, x.center) - dist2(center, y.center)))
        } else {
          // non-actionable region (e.g. a kanban column): the NAMED, nearest container
          const named = inTol.filter(a => a.name && a.name.trim())
          pool = (named.length ? named : inTol).slice().sort((x, y) => (dist2(center, x.center) - dist2(center, y.center)) || (y.area - x.area))
        }
        const best = pool[0]
        if (best) {
          a11yRef = best.ref; a11yName = best.name; a11yRole = best.role
          bridgeDist = Math.round(Math.sqrt(dist2(center, best.center)))
        }
      }
      return {
        targetId: t.targetId,
        ref,
        name: t.name,
        desc: t.description || '',
        role: t.selector?.role?.name ?? null,
        actionKinds: t.actionKinds,
        center: center ? centerKey(center) : null,
        a11yRef, a11yRole, a11yName, bridgeDist,
      }
    })

    const bridged = elements.filter(e => e.a11yRef).length
    const fixture = {
      state: state.key,
      label: state.label,
      url: base,
      capturedWith: { tokenizer: tokenizerMode, viewport: '1280x900' },
      tokens: {
        agruneFull: countTokens(agruneFullText),
        agruneNameOnly: countTokens(agruneNameOnlyText),
        agruneOutline: countTokens(agruneOutlineText),
        rawA11y: countTokens(rawA11yText),
        a11yInteractive: countTokens(a11yInteractiveText),
      },
      counts: {
        agruneVisibleTargets: visible.targets.length,
        a11yRefs: refs.length,
        a11yInteractiveRefs: parseA11yRefs(a11yInteractiveText).length,
        bridged,
      },
      agruneFullText,
      agruneNameOnlyText,
      agruneOutlineText,
      rawA11yText,
      a11yInteractiveText,
      elements,
    }
    const outPath = resolve(OUT_DIR, `${state.key}.json`)
    await writeFile(outPath, JSON.stringify(fixture, null, 2), 'utf8')

    index.push({
      state: state.key, label: state.label,
      tokens: fixture.tokens, counts: fixture.counts, file: `${state.key}.json`,
    })
    console.log(
      `[${state.key}] agrune targets=${visible.targets.length} a11yRefs=${refs.length} bridged=${bridged} | tok agruneFull=${fixture.tokens.agruneFull} outline=${fixture.tokens.agruneOutline} rawA11y=${fixture.tokens.rawA11y}`,
    )
  }

  await writeFile(resolve(OUT_DIR, 'index.json'), JSON.stringify({ tokenizer: tokenizerMode, states: index }, null, 2), 'utf8')
  console.log(`\nfixtures → ${OUT_DIR}`)

  await browser.close()
  server.close()
}

main().catch(err => { console.error('capture failed:', err); process.exitCode = 1 })
