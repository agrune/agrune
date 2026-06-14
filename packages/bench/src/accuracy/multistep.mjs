// Multi-step (agentic loop) bench. For each chained scenario × representation
// condition, gpt-oss drives the live demo step by step (observe → 1 action →
// re-observe) until done/stuck/max-steps, then a predicate scores the FINAL
// localStorage state. Measures whether a small model can COMPLETE chained
// workflows, where error compounding and ref stability actually matter.
//
// Conditions: agruneFull / agruneNameOnly / a11yInteractive / a11yFull.
// Model: gpt-oss:20b via ollama, sequential, temperature 0.
//
// Env: OLLAMA_HOST, OLLAMA_MODEL, TRIALS, THINK, ONLY_SCENARIO (id substr),
//      ONLY_COND (key substr), MAX_STEPS (cap override), SETTLE_MS

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSnapshotFromManifest, createSnapshotStore, formatSnapshot, resolveLocator } from '@agrune/backend'
import { toAgentTargetRef, normalizeAgentTargetId, REPEATED_TARGET_KEY_DELIMITER } from '@agrune/core'
import { countTokens, tokenizerMode } from '../tokens.mjs'
import { SCENARIOS } from './scenarios.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../../..')
const DEMO_DIR = process.env.AGRUNE_DEMO_DIR || resolve(REPO_ROOT, '../demo')
const DIST = resolve(DEMO_DIR, 'dist')
const MANIFEST_PATH = resolve(DEMO_DIR, 'manifest.json')
const OUT_DIR = resolve(REPO_ROOT, '..', 'output')

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:20b'
const TRIALS = Number(process.env.TRIALS || 1)
const THINK = process.env.THINK || 'low'
const SETTLE_MS = Number(process.env.SETTLE_MS || 300)
const STEP_CAP = process.env.MAX_STEPS ? Number(process.env.MAX_STEPS) : null

const CONDITIONS = [
  { key: 'agruneFull', kind: 'agrune', desc: true },
  { key: 'agruneNameOnly', kind: 'agrune', desc: false },
  { key: 'a11yInteractive', kind: 'a11y', interactive: true },
  { key: 'a11yFull', kind: 'a11y', interactive: false },
]

const SYSTEM =
  'You are a web-automation agent operating a web app one step at a time. ' +
  'Each turn you see a snapshot of the CURRENT page plus the goal and your prior steps. ' +
  'Choose the SINGLE next action and reply with ONE JSON object only, no prose. ' +
  'Valid actions: click, fill (needs "value"), dblclick, hover, press (needs "value"). ' +
  'To choose a dropdown option: first click the trigger; on the NEXT turn the options appear, then click the option. ' +
  'Prefer the most SPECIFIC target whose name matches your intent (e.g. a named card, row, or option) over any generic "by index" target. ' +
  'Use the exact ref token shown inside [ref=...]. Reply {"done":true} as soon as the goal is fully complete.'

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

async function ollamaChat(messages) {
  const body = { model: MODEL, messages, stream: false, think: THINK === 'false' ? false : THINK, options: { temperature: 0, num_predict: 1200, seed: 7 } }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${HOST}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return { content: json.message?.content ?? '', thinking: json.message?.thinking ?? '' }
    } catch (e) {
      if (attempt === 2) return { content: '', thinking: '', error: String(e) }
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  return { content: '', thinking: '' }
}

const A11Y_ACTIONABLE = new Set(['button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'switch', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'slider', 'spinbutton', 'option'])
function parseA11yRefs(text) {
  const re = /^(\s*)-\s+([a-zA-Z]+)(?:\s+"((?:[^"\\]|\\.)*)")?[^\n]*?\[ref=(e\d+)\]/gm
  const out = []
  let m
  while ((m = re.exec(text)) !== null) out.push({ role: m[2], name: (m[3] ?? '').replace(/\\"/g, '"'), ref: m[4] })
  return out
}
function a11yInteractiveOnly(text) {
  const out = ['- interactive elements (filtered from the accessibility tree):']
  for (const line of text.split('\n')) {
    if (!/\[ref=e\d+\]/.test(line)) continue
    const roleM = /^\s*-\s+([a-zA-Z]+)/.exec(line)
    if (A11Y_ACTIONABLE.has(roleM ? roleM[1].toLowerCase() : '')) out.push(`  - ${line.trim()}`)
  }
  return out.join('\n')
}
function filterVisible(snapshot) {
  const targets = snapshot.targets.filter(t => t.domResolved && t.visible)
  const keep = new Set(targets.map(t => t.targetId))
  const groups = snapshot.groups.map(g => ({ ...g, targetIds: g.targetIds.filter(id => keep.has(id)) })).filter(g => g.targetIds.length > 0)
  return { ...snapshot, groups, targets }
}
function extractAgruneRef(answer, knownRefs) {
  let best = null, bestPos = -1
  for (const ref of knownRefs) { const pos = answer.lastIndexOf(ref); if (pos > bestPos) { bestPos = pos; best = ref } }
  return best
}

// Agrune representation — mirrors @agrune/backend formatSnapshot (full mode) but
// also surfaces each target's declared actionKinds, since the manifest encodes
// HOW to operate an element (e.g. a card opens on dblclick). This is a genuine
// representation feature the raw a11y tree does not carry.
function formatAgrune(snapshot, withDesc) {
  const lines = ['### Page', `- Page URL: ${snapshot.url}`, `- Page Title: ${snapshot.title}`, '### Snapshot', '```yaml']
  for (const t of snapshot.targets) {
    lines.push(`- target ${JSON.stringify(t.name)} [ref=${toAgentTargetRef(t)}]:`)
    if (withDesc && t.description) lines.push(`  - description: ${JSON.stringify(t.description)}`)
    lines.push(`  - actions: ${(t.actionKinds || []).join(', ')}`)
    lines.push(`  - group: ${JSON.stringify(t.groupId)}`)
  }
  if (lines[lines.length - 1] === '```yaml') lines.push('- none')
  lines.push('```')
  return lines.join('\n')
}

async function buildRepresentation(page, manifest, store, cond) {
  if (cond.kind === 'agrune') {
    const snapshot = await buildSnapshotFromManifest(page, manifest, store)
    const visible = filterVisible(snapshot)
    // Drop the manifest's `*_indexed` convenience targets: they are positional
    // duplicates of the keyed repeat instances (which carry the element's real
    // name/identity), and only add ambiguity. Keep the identity-keyed instances.
    const targets = visible.targets.filter(t => !t.targetId.endsWith('_indexed'))
    const src = { ...visible, targets }
    return { text: formatAgrune(src, cond.desc), knownRefs: targets.map(toAgentTargetRef) }
  }
  const raw = await page.ariaSnapshot({ mode: 'ai' })
  const text = cond.interactive ? a11yInteractiveOnly(raw) : raw
  return { text, knownRefs: parseA11yRefs(text).map(r => r.ref) }
}

function findTargetById(manifest, id) {
  for (const g of manifest.groups) for (const t of g.targets) if (t.targetId === id) return { target: t }
  return null
}
async function locatorForAgruneRef(page, manifest, ref) {
  let norm
  try { norm = normalizeAgentTargetId(ref) } catch { norm = ref }
  const delim = REPEATED_TARGET_KEY_DELIMITER
  if (norm.includes(delim)) {
    const di = norm.indexOf(delim)
    const repeatId = norm.slice(0, di)
    const rest = norm.slice(di + delim.length)
    const dot = rest.indexOf('.')
    if (dot < 0) return null
    const key = rest.slice(0, dot)
    const baseId = rest.slice(dot + 1)
    let repeat = null, base = null
    for (const g of manifest.groups) for (const r of (g.repeats || [])) if (r.repeatId === repeatId) { repeat = r; base = r.targets.find(t => t.targetId === baseId) || null }
    if (!repeat || !base) return null
    const resolved = await resolveLocator(page, base.selector)
    if (!resolved) return null
    const n = await resolved.locator.count().catch(() => 0)
    for (let i = 0; i < n; i++) {
      const cand = resolved.locator.nth(i)
      const k = await cand.evaluate((el, expr) => { try { return String(new Function('el', 'return (' + expr + ')')(el)).trim() } catch { return '' } }, repeat.keyFrom).catch(() => '')
      if (k === key) return cand
    }
    return null
  }
  const found = findTargetById(manifest, norm)
  if (!found) return null
  const resolved = await resolveLocator(page, found.target.selector)
  return resolved ? resolved.locator.first() : null
}

async function executeAction(page, locator, action, value) {
  const opts = { timeout: 4000 }
  switch (action) {
    case 'click': case 'select': await locator.click(opts); break
    case 'dblclick': await locator.dblclick(opts); break
    case 'hover': await locator.hover(opts); break
    case 'press': await locator.press(value || 'Enter', opts); break
    case 'fill': await locator.fill('', opts).catch(() => {}); await locator.fill(value ?? '', opts); break
    default: throw new Error('unsupported action ' + action)
  }
}

function extractJson(s) {
  const matches = s.match(/\{[^{}]*\}/g)
  if (!matches) return null
  for (let i = matches.length - 1; i >= 0; i--) {
    const cand = matches[i].replace(/[“”]/g, '"').replace(/'/g, '"')
    try { return JSON.parse(cand) } catch {}
    try { return JSON.parse(cand.replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g, '$1"$2"$3')) } catch {}
  }
  return null
}
function parseAction(content, thinking, knownRefs, kind) {
  const search = content && content.includes('{') ? content : `${content || ''}\n${thinking || ''}`
  const obj = extractJson(search)
  if (!obj) return { error: 'no_json', raw: (content || '').slice(0, 160) }
  if (obj.done === true || obj.action === 'done' || obj.finished === true) return { done: true }
  let action = String(obj.action || '').toLowerCase()
  if (action === 'double-click' || action === 'doubleclick') action = 'dblclick'
  if (action === 'type' || action === 'input') action = 'fill'
  if (action === 'choose' || action === 'option' || action === 'selectoption') action = 'select'
  let ref = null
  if (kind === 'a11y') {
    const cands = (String(obj.ref || '') + ' ' + search).match(/\be\d+\b/g) || []
    const known = cands.filter(r => knownRefs.includes(r))
    ref = known.length ? known[known.length - 1] : null
  } else {
    ref = obj.ref && knownRefs.includes(obj.ref) ? obj.ref : extractAgruneRef(search, knownRefs)
  }
  if (!action) return { error: 'no_action', raw: JSON.stringify(obj).slice(0, 160) }
  if (!ref) return { error: 'unknown_ref', raw: JSON.stringify(obj).slice(0, 160) }
  return { action, ref, value: obj.value }
}

function renderPrompt(goal, snapshot, history, kind) {
  const hist = history.length ? `\n\n### Steps so far\n${history.slice(-8).join('\n')}` : ''
  const hint = kind === 'a11y' ? 'e12' : 'board_new_task_button'
  return `### Goal\n${goal}\n\n### Current page snapshot\n${snapshot}${hist}\n\n### Next action\nReply with ONE JSON object for the single next action:\n{"action":"click|fill|dblclick|hover|press","ref":"${hint}","value":"<only for fill/press>"}\nUse the exact ref inside [ref=...]. {"done":true} when the goal is complete. JSON only.`
}

async function resetApp(page, base) {
  // useLocalStorage seeds in memory and only persists on the first mutation, so
  // after a clean reload localStorage is empty (the seed lives in React state).
  // Clear → reload gives a fresh seed; we wait for the board to render the seed
  // cards as the readiness signal (don't read localStorage, which is still empty).
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="nav-board-tab"]', { timeout: 10000 })
  await page.waitForSelector('[data-agrune-demo="task-card"]', { timeout: 10000 })
  await page.waitForTimeout(400)
}

async function readState(page) {
  return page.evaluate(() => ({
    tasks: JSON.parse(localStorage.getItem('pm-tasks') || '[]'),
    members: JSON.parse(localStorage.getItem('pm-members') || '[]'),
    messages: JSON.parse(localStorage.getItem('pm-messages') || '{}'),
  }))
}

async function runScenarioCondition(page, base, manifest, scenario, cond) {
  await resetApp(page, base)
  const store = createSnapshotStore()
  const maxSteps = STEP_CAP ?? scenario.maxSteps
  const history = []
  const transcript = []
  const seen = new Map()
  let outcome = null
  let promptTokens = 0
  let noJson = 0
  let steps = 0

  for (let step = 1; step <= maxSteps; step++) {
    steps = step
    await page.waitForTimeout(SETTLE_MS)
    let text, knownRefs
    try {
      ({ text, knownRefs } = await buildRepresentation(page, manifest, store, cond))
    } catch (e) {
      transcript.push({ step, error: 'observe_failed:' + String(e).slice(0, 80) })
      outcome = 'observe_error'; break
    }
    const prompt = renderPrompt(scenario.instruction, text, history, cond.kind)
    promptTokens += countTokens(SYSTEM + prompt)
    const out = await ollamaChat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }])
    if (out.error) { outcome = 'model_error'; transcript.push({ step, error: out.error }); break }
    const act = parseAction(out.content, out.thinking, knownRefs, cond.kind)
    if (act.done) { outcome = 'model_done'; transcript.push({ step, done: true }); console.error(`  · ${scenario.id}/${cond.key} step${step}: DONE`); break }
    if (act.error) {
      noJson++
      history.push(`${step}. <${act.error}>`)
      transcript.push({ step, parseError: act.error, raw: act.raw })
      if (noJson >= 3) { outcome = 'stuck'; break }
      continue
    }
    noJson = 0
    const sig = `${act.action}|${act.ref}|${act.value ?? ''}`
    seen.set(sig, (seen.get(sig) || 0) + 1)
    if (seen.get(sig) >= 3) { history.push(`${step}. ${sig} -> repeated×3`); transcript.push({ step, sig, result: 'repeated' }); outcome = 'stuck'; break }
    let loc = null
    try { loc = cond.kind === 'agrune' ? await locatorForAgruneRef(page, manifest, act.ref) : page.locator('aria-ref=' + act.ref).first() } catch {}
    if (!loc) { history.push(`${step}. ${sig} -> no_locator`); transcript.push({ step, sig, result: 'no_locator' }); continue }
    let result = 'ok'
    try { await executeAction(page, loc, act.action, act.value) } catch (e) { result = 'error:' + String(e.message || e).slice(0, 50) }
    history.push(`${step}. ${sig} -> ${result}`)
    transcript.push({ step, sig, result })
    console.error(`  · ${scenario.id}/${cond.key} step${step}: ${sig} -> ${result}`)
  }
  outcome = outcome ?? 'max_steps'
  const state = await readState(page)
  let score
  try { score = scenario.predicate(state) } catch (e) { score = { pass: false, detail: 'predicate_error:' + String(e).slice(0, 80) } }
  return { outcome, steps, promptTokens, score, transcript }
}

async function main() {
  if (!existsSync(DIST)) throw new Error(`demo dist not found: ${DIST}`)
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  const scenarios = SCENARIOS.filter(s => !process.env.ONLY_SCENARIO || s.id.includes(process.env.ONLY_SCENARIO))
  const conditions = CONDITIONS.filter(c => !process.env.ONLY_COND || c.key.includes(process.env.ONLY_COND))

  const { server, port } = await startServer(DIST)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const base = `http://127.0.0.1:${port}/`

  const results = []
  for (const scenario of scenarios) {
    for (const cond of conditions) {
      let pass = 0
      const runs = []
      for (let t = 0; t < TRIALS; t++) {
        const r = await runScenarioCondition(page, base, manifest, scenario, cond)
        if (r.score.pass) pass++
        runs.push(r)
        console.log(`${scenario.id} [${cond.key}] trial${t + 1}: ${r.score.pass ? 'PASS' : 'fail'} (${r.outcome}, ${r.steps} steps, ${r.promptTokens} tok) ${r.score.detail ?? ''}`)
      }
      results.push({ scenario: scenario.id, difficulty: scenario.difficulty, cond: cond.key, pass, trials: TRIALS, runs })
    }
  }

  // aggregate
  const byCond = {}
  for (const c of conditions) {
    const rs = results.filter(r => r.cond === c.key)
    const passed = rs.filter(r => r.pass >= Math.ceil(TRIALS / 2)).length
    const avgSteps = rs.length ? Math.round(rs.reduce((a, r) => a + (r.runs[0]?.steps || 0), 0) / rs.length) : 0
    const avgTok = rs.length ? Math.round(rs.reduce((a, r) => a + (r.runs[0]?.promptTokens || 0), 0) / rs.length) : 0
    const outcomes = {}
    for (const r of rs) for (const run of r.runs) outcomes[run.outcome] = (outcomes[run.outcome] || 0) + 1
    byCond[c.key] = { passed, total: rs.length, pct: rs.length ? Math.round((passed / rs.length) * 1000) / 10 : 0, avgSteps, avgPromptTokens: avgTok, outcomes }
  }

  const out = { model: MODEL, tokenizer: tokenizerMode, trials: TRIALS, think: THINK, scenarios: scenarios.map(s => ({ id: s.id, difficulty: s.difficulty })), byCondition: byCond, results }
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(resolve(OUT_DIR, 'agrune-multistep-results.json'), JSON.stringify(out, null, 2), 'utf8')

  console.log('\n=== multi-step completion (n=' + scenarios.length + ' scenarios, trials=' + TRIALS + ') ===')
  for (const c of conditions) {
    const b = byCond[c.key]
    console.log(`  ${c.key.padEnd(16)} ${b.pct}%  (${b.passed}/${b.total})  avgSteps ${b.avgSteps}  avgTok ${b.avgPromptTokens}  ${JSON.stringify(b.outcomes)}`)
  }
  console.log(`results → ${resolve(OUT_DIR, 'agrune-multistep-results.json')}`)

  await browser.close()
  server.close()
}

main().catch(err => { console.error('multistep failed:', err); process.exitCode = 1 })
