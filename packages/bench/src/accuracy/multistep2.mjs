// Multi-step agentic bench v2 — agrune vs the REAL playwright-cli, across 3 bare
// models, measuring what actually differs in chained workflows: completion,
// snapshot ROUNDS, REASONING tokens, total tokens, and wandering.
//
// Conditions (representation the model drives through):
//   agrune  — real @agrune formatSnapshot(full): names + per-target DESCRIPTIONS
//             (rendered only where the manifest author added a desc — it's a
//             per-target field, not a global mode), stable short refs; non-default
//             verbs only ({click} omitted)
//   pwcli   — the genuine @playwright/cli binary: ariaSnapshot eN refs,
//             no descriptions, refs regenerate per snapshot (go stale)
//
// Models: gpt-oss:20b (ollama) / claude-haiku-4-5 / gpt-5.3-codex-spark
//         (the latter two as BARE models via claude-code-proxy — see drivers.mjs)
//
// Unified loop: observe → model emits an action BATCH → execute in order, stop at
// first failure → re-observe. Batching lets stable refs + good descriptions pay
// off as fewer snapshot rounds; stale eN refs force a re-snapshot after each
// surface change. A predicate over final localStorage scores completion.
//
// Env: ONLY_SCENARIO, ONLY_COND, ONLY_MODEL, TRIALS, MAX_STEPS, SETTLE_MS, OUT

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, realpathSync, readFileSync } from 'node:fs'
import { resolve, extname, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSnapshotFromManifest, createSnapshotStore, formatSnapshot, resolveLocator, resolveLocatorMulti, intentFromTarget, rankRepairCandidates } from '@agrune/backend'
import { toAgentTargetRef, normalizeAgentTargetId, REPEATED_TARGET_KEY_DELIMITER } from '@agrune/core'
import { SCENARIOS } from './scenarios.mjs'
import { makeDriver } from './drivers.mjs'
import { PwCli } from './pwcli.mjs'
import { AGRUNE_SKILL, PWCLI_SKILL } from './skills.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../../..')
const DEMO_DIR = process.env.AGRUNE_DEMO_DIR || resolve(REPO_ROOT, '../demo')
const DIST = resolve(DEMO_DIR, 'dist')
const MANIFEST_PATH = resolve(DEMO_DIR, 'manifest.json')
const OUT_DIR = resolve(REPO_ROOT, '..', 'output')

const TRIALS = Number(process.env.TRIALS || 1)
const SETTLE_MS = Number(process.env.SETTLE_MS || 300)
const STEP_CAP = process.env.MAX_STEPS ? Number(process.env.MAX_STEPS) : null
const BATCH_CAP = Number(process.env.BATCH_CAP || 4)
// Render agrune targets with short, session-STABLE handles (t1, t2, …) instead of
// the verbose targetId (e.g. messenger_conversations[key=member-5].messenger_conversation).
// The line's name+description already carry the meaning, so the long ref is mostly
// redundant tokens — and in a stateful session it is resent every turn. Stable map
// per run preserves agrune's cross-snapshot ref stability. SHORT_REFS=0 to disable.
const SHORT_REFS = process.env.SHORT_REFS !== '0'
// Manifest-authored action feedback (onSuccess/onNoEffect), gated on a real screen
// change. On by default; FEEDBACK=0 turns it OFF so an A/B (messages on vs off)
// isolates whether the authored feedback actually changes completion/wandering.
const FEEDBACK = process.env.FEEDBACK !== '0'
// a11y change-delta: a manifest-INDEPENDENT capture (Playwright aria tree) diffed
// frame-to-frame, deterministically (no AI). Used to surface app messages the
// manifest doesn't cover (validation errors, toasts) that would otherwise be a
// silent no-op. Internal full capture → the LLM sees only the DELTA, and only on
// the ack path (mapped controls unchanged) so it never duplicates a fresh snapshot
// or dumps a whole screen transition. AXDELTA=1 to enable.
const AXDELTA = process.env.AXDELTA === '1'
// Hybrid fallback: deterministically detect interactive elements the manifest does
// NOT cover (in the active region) and append them with raw refs so the agent can
// still act on un-mapped UI. HYBRID=1 to enable. The manifest stays the curated,
// stable surface; only the unmapped bits degrade to raw mode.
const HYBRID = process.env.HYBRID === '1'

// ---------- visual layer (for watching headed runs) ----------
// agrune's product cursor + aurora-glow overlay (window.__agrune_visual__) is
// driven by PlaywrightDriver in production (animatePointerForTarget). The bench
// executes RAW Playwright locator actions for clean token measurement and so
// never installs it — which is why a headed bench run shows no animation. This
// opt-in layer (auto-on when HEADED) injects the SAME IIFE bundle the driver
// uses and flies the cursor to each target's box-center before acting. It is
// page-side decoration ONLY: it never touches tokens, snapshots, or refs, and a
// headless measurement run (no HEADED/VISUAL) is byte-for-byte unaffected.
const VISUAL = process.env.VISUAL === '1' || !!process.env.HEADED
const VISUAL_CONFIG = {
  pointerAnimation: true, auroraGlow: true,
  cursorName: process.env.AGRUNE_CURSOR || 'default',
  pointerDurationMs: Number(process.env.POINTER_MS || 550),
  auroraTheme: process.env.AURORA_THEME || 'light',
}
let _visualSrc
function visualSource() {
  if (_visualSrc !== undefined) return _visualSrc
  _visualSrc = null
  const p = process.env.AGRUNE_VISUAL_BUNDLE || resolve(REPO_ROOT, 'packages/runtime/dist/visual-runtime.global.js')
  try { if (existsSync(p)) _visualSrc = readFileSync(p, 'utf8') } catch {}
  if (!_visualSrc) console.error(`[visual] bundle not found at ${p} — run \`pnpm build\` in packages/runtime`)
  return _visualSrc
}
// Mirrors @agrune/backend visualInstallExpression: idempotent, survives re-eval.
function installExpr(src) { return `(() => { if (window.__agrune_visual__) return; ${src}\n;try { window.__agrune_visual__ = __agrune_visual__ } catch {} })()` }
async function ensureVisual(page) {
  if (!VISUAL) return
  const src = visualSource(); if (!src) return
  await page.evaluate(installExpr(src)).catch(() => {})
  await page.evaluate(cfg => { try { window.__agrune_visual__ && window.__agrune_visual__.applyConfig(cfg) } catch {} }, VISUAL_CONFIG).catch(() => {})
}
// Fly the cursor to the locator's viewport box-center, then run the press/ripple
// (same call the driver makes). Best-effort: off-screen/no-box → skip silently.
async function animateTo(page, loc) {
  if (!VISUAL) return
  try {
    const box = await loc.boundingBox(); if (!box) return
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.evaluate(({ x, y, cfg }) => { const v = window.__agrune_visual__; if (!v) return; v.applyConfig(cfg); return v.animatePointer(x, y) }, { x, y, cfg: VISUAL_CONFIG })
  } catch {}
}

const CONDITIONS = [
  { key: 'agrune', kind: 'agrune' },
  { key: 'pwcli', kind: 'pwcli' },
]
// Drift: load a deliberately-stale manifest whose chosen singleton selectors no
// longer resolve (DOM moved / dev refactored), while name+desc intent stays — so
// self-heal can re-ground from intent. Set DRIFT=1 to exercise the recovery path.
const DRIFT = process.env.DRIFT === '1'
const SELF_HEAL = process.env.SELF_HEAL !== '0'  // on by default; the recovery under test
const MODELS_LIST = ['haiku', 'codex-spark', 'gpt-oss']  // capable models first (key signal early)

const SYSTEM =
  'You are a web-automation agent operating a web app. Each turn you see a snapshot of the CURRENT page, the goal, and your recent steps. ' +
  'Reply with ONE JSON object only, no prose: ' +
  '{"actions":[{"verb":"click|fill|dblclick|hover|press","ref":"<ref shown in [ref=...]>","value":"<only for fill/press>"}]}. ' +
  'You MAY list multiple actions when you are confident they all apply to elements in the CURRENT snapshot — they run in order and stop at the first failure, then you get a fresh snapshot. List ONE action if unsure. ' +
  'Use the exact ref token inside [ref=...]. To choose a dropdown option, click the trigger; on the NEXT snapshot the option appears, then click it. ' +
  'Prefer the most SPECIFIC element whose name/description matches your intent. Reply {"done":true} when the goal is fully complete.'

// ---------- static server ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2' }
// The messenger NPC brain is shared with the standalone demo server. Lazily
// imported from the demo package so a teammate replies the same way in the bench
// as in the real app. Its proxy tokens are the NPC's, NOT counted in agent usage.
let _npcReply = null
async function loadNpcReply() {
  if (_npcReply) return _npcReply
  const mod = await import(pathToFileURL(resolve(DEMO_DIR, 'npc-reply.mjs')).href)
  _npcReply = mod.npcReply
  return _npcReply
}
function startServer(dist) {
  const server = createServer(async (req, res) => {
    try {
      const p0 = req.url.split('?')[0]
      if (req.method === 'POST' && p0 === '/api/npc-reply') {
        let body = ''
        req.setEncoding('utf8')
        for await (const chunk of req) body += chunk
        let payload = {}
        try { payload = body ? JSON.parse(body) : {} } catch {}
        const npc = await loadNpcReply()
        const out = await npc(payload)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(out))
        return
      }
      let p = p0
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

// ---------- JSON / action parsing (model-agnostic) ----------
function lastJsonObject(s) {
  const cands = []
  let depth = 0, start = -1, inStr = false, esc = false, q = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) inStr = false; continue }
    if (c === '"' || c === "'") { inStr = true; q = c; continue }
    if (c === '{') { if (depth === 0) start = i; depth++ }
    else if (c === '}') { if (depth > 0) { depth--; if (depth === 0 && start >= 0) { cands.push(s.slice(start, i + 1)); start = -1 } } }
  }
  for (let i = cands.length - 1; i >= 0; i--) {
    const norm = cands[i].replace(/[“”]/g, '"')
    try { return JSON.parse(norm) } catch {}
    try { return JSON.parse(norm.replace(/'/g, '"')) } catch {}
    try { return JSON.parse(norm.replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g, '$1"$2"$3')) } catch {}
  }
  return null
}
function normVerb(v) {
  v = String(v || '').toLowerCase()
  if (v === 'double-click' || v === 'doubleclick') return 'dblclick'
  if (v === 'type' || v === 'input' || v === 'enter') return 'fill'
  if (v === 'choose' || v === 'option' || v === 'selectoption' || v === 'select') return 'click'
  return v
}
function pickRef(a, text, knownRefs, kind) {
  if (kind === 'pwcli') {
    if (a && typeof a.ref === 'string' && knownRefs.includes(a.ref)) return a.ref
    const cands = ((a && a.ref ? String(a.ref) + ' ' : '') + text).match(/\be\d+\b/g) || []
    const known = cands.filter(r => knownRefs.includes(r))
    return known.length ? known[known.length - 1] : null
  }
  if (a && typeof a.ref === 'string' && knownRefs.includes(a.ref)) return a.ref
  // agrune: accept any known targetId that appears as a substring of the answer
  let best = null, bestPos = -1
  const hay = (a && a.ref ? String(a.ref) + ' ' : '') + text
  for (const ref of knownRefs) { const p = hay.lastIndexOf(ref); if (p > bestPos) { bestPos = p; best = ref } }
  return best
}
function parseDecision(text, thinking, knownRefs, kind) {
  const search = text && text.includes('{') ? text : `${text || ''}\n${thinking || ''}`
  const obj = lastJsonObject(search)
  if (!obj) return { error: 'no_json', raw: (text || '').slice(0, 160) }
  if (obj.done === true || obj.finished === true || obj.action === 'done') return { done: true }
  if (obj.look === true || obj.action === 'look' || obj.verb === 'look') return { look: true }
  let acts = Array.isArray(obj.actions) ? obj.actions : (obj.verb || obj.action || obj.ref ? [obj] : [])
  const out = []
  for (const a of acts.slice(0, BATCH_CAP)) {
    const verb = normVerb(a.verb || a.action)
    const ref = pickRef(a, search, knownRefs, kind)
    if (!verb || !ref) continue
    out.push({ verb, ref, value: a.value })
  }
  if (!out.length) return { error: 'no_valid_action', raw: JSON.stringify(obj).slice(0, 160) }
  return { actions: out }
}

// ---------- agrune representation + resolution (real library code) ----------
function filterVisible(snapshot) {
  const targets = snapshot.targets.filter(t => t.domResolved && t.visible)
  const keep = new Set(targets.map(t => t.targetId))
  const groups = snapshot.groups.map(g => ({ ...g, targetIds: g.targetIds.filter(id => keep.has(id)) })).filter(g => g.targetIds.length > 0)
  return { ...snapshot, groups, targets }
}
// Mirrors @agrune formatSnapshot(full) — name + description + group — and ALSO
// surfaces valuePreview (the captured input value, el.value), which agrune does
// collect but the default formatter omits. Showing it keeps parity with the
// playwright-cli ariaSnapshot (which prints textbox values), so the model can
// tell a field is already filled instead of blindly re-filling.
// Compact one-line-per-target format: groups as `## groupId` headers, then
// `- [ref=REF] {KIND} NAME — DESCRIPTION = "VALUE"`.
// actionKinds are shown ONLY for non-default verbs (dblclick/hover/fill/press) —
// the verb pwcli's raw tree can't signal per element (e.g. "this card needs a
// double-click"). The default `click` is omitted: it is the overwhelming majority
// of targets and the inferable default, so printing `{click}` on every line was
// pure token overhead. Absence of a marker therefore means "click".
// The static page header (URL/Title) is dropped too: in this SPA the URL never
// changes and the visible targets already reveal which tab you're on, so resending
// it every turn carried no information.
// Stable short-handle registry: long targetId -> t1/t2/… (and back), per run.
function shortRefFor(reg, fullRef) {
  let s = reg.full2short.get(fullRef)
  if (!s) { s = 't' + (++reg.seq); reg.full2short.set(fullRef, s); reg.short2full.set(s, fullRef) }
  return s
}
function formatAgruneSnapshot(snapshot, refOf = toAgentTargetRef) {
  const lines = ['### Targets']
  const order = []
  const buckets = new Map()
  for (const t of snapshot.targets) {
    if (!buckets.has(t.groupId)) { buckets.set(t.groupId, []); order.push(t.groupId) }
    buckets.get(t.groupId).push(t)
  }
  let any = false
  for (const gid of order) {
    lines.push(`## ${gid}`)
    for (const t of buckets.get(gid)) {
      // Drop the default `click`; surface only verbs the model couldn't infer.
      const kinds = (t.actionKinds || []).filter(k => k !== 'click')
      let line = `- [ref=${refOf(t)}] ${kinds.length ? `{${kinds.join(',')}} ` : ''}${t.name}`
      // The per-target desc field IS the control: render it whenever the manifest
      // author put a desc on this target (no global on/off — it's just the field).
      if (t.description) line += ` — ${t.description}`
      if (t.valuePreview) line += ` = ${JSON.stringify(t.valuePreview)}`
      lines.push(line)
      any = true
    }
    lines.push('')
  }
  if (!any) lines.push('(no actionable targets)')
  return lines.join('\n')
}
async function agruneRepresentation(page, manifest, store, reg) {
  const snapshot = await buildSnapshotFromManifest(page, manifest, store)
  const visible = filterVisible(snapshot)
  const refOf = reg ? (t) => shortRefFor(reg, toAgentTargetRef(t)) : (t) => toAgentTargetRef(t)
  return { text: formatAgruneSnapshot(visible, refOf), knownRefs: visible.targets.map(refOf) }
}
function findTargetById(manifest, id) {
  for (const g of manifest.groups) for (const t of g.targets) if (t.targetId === id) return t
  return null
}
// Manifest-authored per-action feedback. A target MAY declare `onSuccess` /
// `onNoEffect` — short, semantic sentences shown to the model AFTER it acts,
// gated on whether the action actually changed the screen (see the run loops).
// `onSuccess` explains what the new screen is / what to do next; `onNoEffect`
// explains why a mechanically-successful click produced no change (e.g. a Next
// blocked by an empty required field). Authoring rule: keep them at the manifest's
// abstraction level — describe the semantic role, never bake in dynamic facts
// (step counts, item counts) that drift even when selectors don't. Repeat-instance
// refs (`repeatId[key=K].baseId`) inherit the base target's messages.
function feedbackFor(manifest, ref) {
  let norm
  try { norm = normalizeAgentTargetId(ref) } catch { norm = ref }
  const delim = REPEATED_TARGET_KEY_DELIMITER
  let t = null
  if (norm.includes(delim)) {
    const di = norm.indexOf(delim)
    const repeatId = norm.slice(0, di)
    const rest = norm.slice(di + delim.length)
    const dot = rest.indexOf('.')
    const baseId = dot >= 0 ? rest.slice(dot + 1) : ''
    for (const g of manifest.groups) for (const r of (g.repeats || [])) if (r.repeatId === repeatId) t = (r.targets || []).find(x => x.targetId === baseId) || t
  } else {
    t = findTargetById(manifest, norm)
  }
  if (t && (t.onSuccess || t.onNoEffect)) return { onSuccess: t.onSuccess || '', onNoEffect: t.onNoEffect || '' }
  return null
}
async function locatorForAgruneRef(page, manifest, ref, healSink) {
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
    const resolved = await resolveLocatorMulti(page, base.selector)  // multi-match: enumerate every row, not just .first()
    if (!resolved) return null
    const n = await resolved.locator.count().catch(() => 0)
    for (let i = 0; i < n; i++) {
      const cand = resolved.locator.nth(i)
      const k = await cand.evaluate((el, expr) => { try { return String(new Function('el', 'return (' + expr + ')')(el)).trim() } catch { return '' } }, repeat.keyFrom).catch(() => '')
      if (k === key) return cand
    }
    return null
  }
  const t = findTargetById(manifest, norm)
  if (!t) return null
  const resolved = await resolveLocator(page, t.selector)
  if (resolved) return resolved.locator.first()
  // Drift: declared target whose selector ladder no longer resolves. Re-ground
  // from the author's intent (role + name + desc) using the SAME pure self-heal
  // core the production PlaywrightSession uses. Mirrors attemptSelfHeal().
  if (SELF_HEAL && healSink) {
    const healed = await attemptSelfHeal(page, t)
    if (healed.locator) { healSink.push({ target: t.targetId, decision: healed.outcome.decision, reason: healed.outcome.reason }); return healed.locator }
    healSink.push({ target: t.targetId, decision: healed.outcome.decision, reason: healed.outcome.reason, failed: true })
  }
  return null
}
// Page-scan + rank, faithful to PlaywrightSession.attemptSelfHeal: scan by the
// declared role (or generic interactive elements), distill ObservedElement[], and
// let the pure self-heal core decide auto vs propose. Only an `auto` decision
// returns a locator (we never silently click a low-confidence guess).
async function attemptSelfHeal(page, target) {
  const intent = intentFromTarget(target)
  const roleName = intent.role
  const scan = roleName ? page.getByRole(roleName) : page.locator('a, button, input, select, textarea, summary, [role], [tabindex]')
  const total = await scan.count().catch(() => 0)
  const cap = Math.min(total, 40)
  const observed = []
  for (let i = 0; i < cap; i++) {
    const info = await scan.nth(i).evaluate((node) => {
      const el = node
      const attr = (n) => (el.getAttribute ? el.getAttribute(n) ?? '' : '')
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      const name = (attr('aria-label') || attr('title') || attr('placeholder') || attr('alt') || text).replace(/\s+/g, ' ').trim()
      const role = attr('role') || el.tagName.toLowerCase()
      return { role, accessibleName: name.slice(0, 160), text: text.slice(0, 160) }
    }).catch(() => null)
    if (info) observed.push({ index: i, ...info })
  }
  const outcome = rankRepairCandidates(target, observed)
  if (outcome.decision === 'auto' && outcome.best) return { outcome, locator: scan.nth(outcome.best.index) }
  return { outcome, locator: null }
}
async function execAgrune(page, manifest, verb, ref, value, healSink) {
  const loc = await locatorForAgruneRef(page, manifest, ref, healSink)
  if (!loc) throw new Error('no_locator')
  await animateTo(page, loc)  // decorative cursor flight (headed/VISUAL only; no-op otherwise)
  const opts = { timeout: 4000 }
  switch (verb) {
    case 'click': await loc.click(opts); break
    case 'dblclick': await loc.dblclick(opts); break
    case 'hover': await loc.hover(opts); break
    case 'press': await loc.press(value || 'Enter', opts); break
    case 'fill': await loc.fill('', opts).catch(() => {}); await loc.fill(value ?? '', opts); break
    default: throw new Error('bad_verb ' + verb)
  }
}

// ---------- drift detection + hybrid fallback (deterministic, no AI) ----------
// Compare manifest COVERAGE against the live page: interactive elements in the
// active region that NO manifest target resolves to are "unmapped" (= the manifest
// is stale/incomplete here). We surface them with raw refs so the agent isn't
// blind — graceful degradation toward raw mode for ONLY the unmapped bits. The
// detection is pure (resolve targets, set-difference); the agent never decides it.
async function execBySelector(page, selector, verb, value) {
  const r = await resolveLocator(page, { css: selector })
  if (!r) throw new Error('no_locator')
  const loc = r.locator.first()
  const opts = { timeout: 4000 }
  switch (verb) {
    case 'click': await loc.click(opts); break
    case 'dblclick': await loc.dblclick(opts); break
    case 'hover': await loc.hover(opts); break
    case 'press': await loc.press(value || 'Enter', opts); break
    case 'fill': await loc.fill('', opts).catch(() => {}); await loc.fill(value ?? '', opts); break
    default: throw new Error('bad_verb ' + verb)
  }
}
async function detectUnmapped(page, manifest) {
  // 1. mark every element a manifest target resolves to (covered set)
  for (const g of manifest.groups) {
    for (const t of g.targets || []) {
      try { const r = await resolveLocator(page, t.selector); if (r) { const n = Math.min(await r.locator.count(), 20); for (let i = 0; i < n; i++) await r.locator.nth(i).evaluate(el => el.setAttribute('data-agrune-cov', '1')).catch(() => {}) } } catch {}
    }
    for (const rep of g.repeats || []) {
      for (const t of rep.targets || []) {
        try { const r = await resolveLocatorMulti(page, t.selector); if (r) { const n = Math.min(await r.locator.count(), 40); for (let i = 0; i < n; i++) await r.locator.nth(i).evaluate(el => el.setAttribute('data-agrune-cov', '1')).catch(() => {}) } } catch {}
      }
    }
  }
  // 2. active region: the open dialog if any, else the whole page
  const dlg = page.locator('[role="dialog"]')
  const region = (await dlg.count().catch(() => 0)) ? dlg.last() : page.locator('body')
  // 3. enumerate interactive elements; keep visible ones NOT covered
  const sel = 'button, a[href], input, select, textarea, [role="button"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [contenteditable=""], [contenteditable="true"]'
  const found = await region.locator(sel).evaluateAll(nodes => nodes.slice(0, 80).map(node => {
    if (node.getAttribute('data-agrune-cov') === '1' || node.closest('[data-agrune-cov="1"]')) return null
    const cs = getComputedStyle(node); if (cs.display === 'none' || cs.visibility === 'hidden') return null
    const rect = node.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) return null
    const tag = node.tagName.toLowerCase(); const role = node.getAttribute('role') || ''
    const type = (node.getAttribute('type') || 'text').toLowerCase()
    const isFill = (tag === 'input' && !['button', 'submit', 'checkbox', 'radio', 'file', 'range'].includes(type)) || tag === 'textarea' || role === 'textbox' || node.isContentEditable
    const lbl = node.labels && node.labels[0] ? node.labels[0].textContent : ''
    const name = (node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.getAttribute('title') || lbl || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    let selector = ''
    if (node.id) selector = '#' + CSS.escape(node.id)
    else if (node.getAttribute('data-testid')) selector = `[data-testid="${node.getAttribute('data-testid')}"]`
    else if (node.getAttribute('name')) selector = `${tag}[name="${node.getAttribute('name')}"]`
    return selector ? { verb: isFill ? 'fill' : 'click', name, selector } : null
  }).filter(Boolean)).catch(() => [])
  // 4. cleanup markers
  await page.evaluate(() => document.querySelectorAll('[data-agrune-cov]').forEach(e => e.removeAttribute('data-agrune-cov'))).catch(() => {})
  // 5. assign raw refs (x1, x2, …)
  const map = new Map(), lines = [], refs = []
  found.slice(0, 8).forEach((info, i) => {
    const ref = 'x' + (i + 1)
    map.set(ref, { selector: info.selector, verb: info.verb })
    refs.push(ref)
    lines.push(`- [ref=${ref}] ${info.verb === 'fill' ? '{fill} ' : ''}${info.name || '(unnamed)'}`)
  })
  return { lines, map, refs }
}

const DRIFT_TARGETS = (process.env.DRIFT_TARGETS ||
  'board_new_task_button,messenger_send_button'
).split(',').map(s => s.trim()).filter(Boolean)
function driftManifest(manifest) {
  const set = new Set(DRIFT_TARGETS)
  const drifted = []
  const groups = manifest.groups.map(g => ({
    ...g,
    targets: (g.targets || []).map(t => {
      if (!set.has(t.targetId)) return t
      drifted.push(t.targetId)
      return { ...t, selector: { css: `#agrune-drift-${t.targetId}` }, _driftedFrom: t.selector }
    }),
  }))
  return { manifest: { ...manifest, groups }, drifted }
}

// ---------- pwcli representation ----------
function pwcliRefs(text) {
  return [...new Set((text.match(/\[ref=(e\d+)\]/g) || []).map(m => m.slice(5, -1)))]
}

// ---------- prompt / util ----------
// The per-turn prompt is now built INLINE in runOne as a growing conversation:
// the goal is stated once on turn 1, then each turn appends (results + fresh
// snapshot). Full memory, NO recent-N truncation — a real single-goal session.
function djb2(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h }

// ---------- a11y change-delta (manifest-independent, deterministic) ----------
// Capture the live accessibility tree (Playwright aria YAML). This is the "full
// screen capture" oracle — NOT shown to the LLM; only its frame-to-frame delta is.
async function captureAx(page) {
  try { return (await page.locator('body').ariaSnapshot()).split('\n') }
  catch { return [] }
}
// Lines that carry an on-screen MESSAGE (informational), not an interactive control
// (controls are the manifest's job). The demo's validation error surfaces as
// `- text: Description is required` under a `- paragraph:` node (verified).
const AX_MSG_LINE = /^-\s+(text|alert|status|heading|note|caption|tooltip):/i
// Added informational lines in `cur` not present in `prev`, cleaned to bare text.
function axMessageDelta(prevLines, curLines) {
  const prev = new Set(prevLines)
  const out = []
  for (const l of curLines) {
    if (prev.has(l)) continue
    const t = l.trim()
    if (!AX_MSG_LINE.test(t)) continue
    const msg = t.replace(/^-\s+\w+:\s*/, '').trim()
    if (msg && !out.includes(msg)) out.push(msg)
  }
  return out.slice(0, 6)
}

// ---------- one run ----------
async function runOne({ page, pw, base, manifest }, scenario, cond, decide) {
  const isAgrune = cond.kind === 'agrune'
  const system = isAgrune ? AGRUNE_SKILL : PWCLI_SKILL  // control skill teaches each method
  // reset
  if (isAgrune) {
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="nav-board-tab"]', { timeout: 10000 })
    await page.waitForSelector('[data-agrune-demo="task-card"]', { timeout: 10000 })
    await page.waitForTimeout(300)
    await ensureVisual(page)
  } else {
    await pw.reset(base)
  }

  const store = isAgrune ? createSnapshotStore() : null
  const refReg = (isAgrune && SHORT_REFS) ? { full2short: new Map(), short2full: new Map(), seq: 0 } : null
  const cap = STEP_CAP ?? scenario.maxSteps
  const convo = []          // full stateful conversation, accumulated (no recent-N truncation)
  let lastResults = ''      // result lines of the last executed batch, fed into the next user turn
  const transcript = []
  const seenSig = new Map()
  const actCount = new Map()
  const heals = []          // self-heal recoveries when a drifted selector failed
  let pendingFb = []        // manifest onSuccess/onNoEffect candidates from last round's ok actions
  let sigBeforeAction = null // page signature when those actions were issued (change-gate baseline)
  let rounds = 0, steps = 0, wander = 0, noJson = 0
  let inTok = 0, outTok = 0, reasonTok = 0
  let outcome = null

  while (rounds < cap && steps < cap) {
    rounds++
    if (isAgrune) await page.waitForTimeout(SETTLE_MS)
    // observe
    let snap
    try {
      snap = isAgrune ? await agruneRepresentation(page, manifest, store, refReg) : (() => { const t = pw.snapshot(); return { text: t, knownRefs: pwcliRefs(t) } })()
    } catch (e) { transcript.push({ round: rounds, error: 'observe:' + String(e.message || e).slice(0, 80) }); outcome = 'observe_error'; break }
    const sig = djb2(snap.text)
    seenSig.set(sig, (seenSig.get(sig) || 0) + 1)

    // manifest-authored feedback for the PRIOR round's actions, gated on a real
    // screen change (sig delta) — NOT merely "the click didn't throw". This is how
    // a blocked Next (mechanically ok, page unchanged) surfaces onNoEffect ("a
    // required field is empty") instead of a silent no-op the model can't diagnose.
    let feedback = ''
    if (pendingFb.length) {
      const changed = sig !== sigBeforeAction
      for (const fb of pendingFb) { const msg = changed ? fb.onSuccess : fb.onNoEffect; if (msg) feedback += (feedback ? '\n' : '') + msg }
      pendingFb = []
    }

    // decide — append the next user turn, then send the WHOLE conversation (goal
    // stated once on turn 1; full memory thereafter). The growing context resent
    // every turn IS the realistic single-session cost we want to measure.
    const userContent = convo.length === 0
      ? `### Goal\n${scenario.instruction}\n\n### Current page snapshot\n${snap.text}\n\n### Next action(s)\nReply with ONE JSON object: {"actions":[{"verb":...,"ref":...,"value":...}]} or {"done":true}. JSON only.`
      : `### Results of your last action(s)\n${lastResults || '(none)'}${feedback ? `\n${feedback}` : ''}\n\n### Current page snapshot\n${snap.text}\n\n### Next action(s)\nReply with ONE JSON object only.`
    convo.push({ role: 'user', content: userContent })
    const d = await decide(system, convo)
    if (d.error) { outcome = 'model_error'; transcript.push({ round: rounds, modelError: d.error }); break }
    inTok += d.usage.input || 0; outTok += d.usage.output || 0; reasonTok += d.usage.reasoning || 0
    convo.push({ role: 'assistant', content: d.text || '(no output)' })

    const parsed = parseDecision(d.text, d.thinking, snap.knownRefs, cond.kind)
    if (parsed.done) { outcome = 'model_done'; transcript.push({ round: rounds, done: true }); break }
    if (parsed.error) {
      noJson++; wander++
      lastResults = `<${parsed.error}> — reply with exactly one JSON object.`
      transcript.push({ round: rounds, parseError: parsed.error, raw: parsed.raw })
      if (noJson >= 3) { outcome = 'stuck'; break }
      continue
    }
    noJson = 0

    // execute batch, stop at first failure → re-observe
    let progressed = false
    const resultLines = []
    const roundFb = []        // onSuccess/onNoEffect of this round's ok actions (gated next round)
    for (const a of parsed.actions) {
      if (steps >= cap) break
      steps++
      const asig = `${a.verb}|${a.ref}|${a.value ?? ''}`
      // Key the repeat-guard by action + CURRENT snapshot signature: the same action
      // on an unchanged page = a real loop, but legitimately reusing e.g. "Next" on
      // each of a wizard's steps (different snapshots) must NOT trip it.
      const akey = `${asig}@${sig}`
      actCount.set(akey, (actCount.get(akey) || 0) + 1)
      if (actCount.get(akey) >= 3) { resultLines.push(`${asig} -> repeated×3 (no page change)`); transcript.push({ round: rounds, asig, result: 'repeated' }); wander++; outcome = 'stuck'; break }
      const fullRef = refReg ? (refReg.short2full.get(a.ref) || a.ref) : a.ref
      let result = 'ok'
      try {
        if (isAgrune) await execAgrune(page, manifest, a.verb, fullRef, a.value, heals)
        else pw.act(a.verb, a.ref, a.value)
        progressed = true
        if (isAgrune && FEEDBACK) { const fb = feedbackFor(manifest, fullRef); if (fb) roundFb.push(fb) }
      } catch (e) { result = 'err:' + String(e.message || e).slice(0, 50); wander++ }
      resultLines.push(`${asig} -> ${result}`)
      transcript.push({ round: rounds, asig, result })
      console.error(`  · ${scenario.id}/${cond.key}/${decide.modelKey} r${rounds}: ${asig} -> ${result}`)
      if (result !== 'ok') break // re-observe after a failure
    }
    lastResults = resultLines.join('\n')
    pendingFb = roundFb; sigBeforeAction = sig  // gate these against next round's snapshot
    if (outcome === 'stuck') break
    // stuck: same snapshot seen many times with no progress this round
    if (!progressed && seenSig.get(sig) >= 3) { outcome = 'stuck'; break }
  }
  outcome = outcome ?? 'max_steps'

  // score
  let state
  try { state = isAgrune ? await page.evaluate(() => ({ tasks: JSON.parse(localStorage.getItem('pm-tasks') || '[]'), members: JSON.parse(localStorage.getItem('pm-members') || '[]'), messages: JSON.parse(localStorage.getItem('pm-messages') || '{}') })) : pw.readState() }
  catch (e) { state = { tasks: [], members: [], messages: {} } }
  let score
  try { score = scenario.predicate(state) } catch (e) { score = { pass: false, detail: 'predicate_error:' + String(e).slice(0, 80) } }

  return { outcome, rounds, steps, wander, looks: rounds, heals: heals.filter(h => !h.failed).length, healAttempts: heals.length, healLog: heals, tokens: { input: inTok, output: outTok, reasoning: reasonTok, total: inTok + outTok }, score, transcript }
}

function buildOut(results, models, conditions, scenarios) {
  const agg = {}
  for (const modelKey of models) {
    for (const c of conditions) {
      const rs = results.filter(r => r.model === modelKey && r.cond === c.key)
      const allRuns = rs.flatMap(r => r.runs)
      const n = allRuns.length
      const passes = allRuns.filter(run => run.score.pass).length
      const avg = (sel) => n ? Math.round(allRuns.reduce((a, run) => a + sel(run), 0) / n) : 0
      const outcomes = {}
      for (const run of allRuns) outcomes[run.outcome] = (outcomes[run.outcome] || 0) + 1
      agg[`${modelKey}|${c.key}`] = {
        model: modelKey, cond: c.key, scenarios: rs.length, runs: n, passes,
        passRate: n ? Math.round((passes / n) * 1000) / 10 : 0,
        avgRounds: avg(r => r.rounds), avgSteps: avg(r => r.steps),
        avgLooks: avg(r => r.looks ?? r.rounds), avgHeals: avg(r => r.heals ?? 0),
        avgTotalTok: avg(r => r.tokens.total), avgInTok: avg(r => r.tokens.input),
        avgOutTok: avg(r => r.tokens.output), avgReasonTok: avg(r => r.tokens.reasoning),
        avgWander: avg(r => r.wander), outcomes,
      }
    }
  }
  return { models, conditions: conditions.map(c => c.key), scenarios: scenarios.map(s => ({ id: s.id, difficulty: s.difficulty })), aggregate: agg, results }
}

// ---------- main ----------
async function main() {
  if (!existsSync(DIST)) throw new Error(`demo dist not found: ${DIST} (run pnpm build in demo)`)
  const rawManifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  let manifest = rawManifest, driftedIds = []
  if (DRIFT) { const d = driftManifest(rawManifest); manifest = d.manifest; driftedIds = d.drifted; console.log(`DRIFT on — stale selectors for: ${driftedIds.join(', ')} (self-heal ${SELF_HEAL ? 'ON' : 'OFF'})`) }
  // DROP_TARGET=id1,id2 — remove targets from the manifest to simulate an
  // incomplete/stale manifest (exercises the hybrid unmapped-element fallback).
  if (process.env.DROP_TARGET) {
    const drop = new Set(process.env.DROP_TARGET.split(',').map(s => s.trim()))
    manifest = { ...manifest, groups: manifest.groups.map(g => ({ ...g, targets: (g.targets || []).filter(t => !drop.has(t.targetId)) })) }
    console.log(`DROP_TARGET — removed from manifest: ${[...drop].join(', ')}`)
  }
  // ONLY_SCENARIO=substr1,substr2,... — a scenario is kept if its id matches ANY listed substring.
  const onlyScen = process.env.ONLY_SCENARIO ? process.env.ONLY_SCENARIO.split(',').map(s => s.trim()).filter(Boolean) : null
  const scenarios = SCENARIOS.filter(s => !onlyScen || onlyScen.some(sub => s.id.includes(sub)))
  // COND=exact,comma,list (precise) takes precedence over ONLY_COND (substring).
  const condKeys = process.env.COND ? new Set(process.env.COND.split(',').map(s => s.trim())) : null
  const conditions = CONDITIONS.filter(c => condKeys ? condKeys.has(c.key) : (!process.env.ONLY_COND || c.key.includes(process.env.ONLY_COND)))
  const modelSet = process.env.MODELS ? process.env.MODELS.split(',').map(s => s.trim()).filter(Boolean) : MODELS_LIST
  const models = modelSet.filter(m => !process.env.ONLY_MODEL || m.includes(process.env.ONLY_MODEL))
  // Per-model trial counts via TRIALS_<model> (e.g. TRIALS_gpt_oss=1, TRIALS_codex_spark=3); falls back to TRIALS.
  const trialsFor = (m) => Number(process.env['TRIALS_' + m.replace(/[^a-z0-9]/gi, '_')] || TRIALS)

  const { server, port } = await startServer(DIST)
  const base = `http://127.0.0.1:${port}/`
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? Number(process.env.SLOWMO || 400) : 0 })
  // Viewport height 1200 (not 900): the task-detail dialog is tall enough that
  // its footer "Save Changes" button sits at y~911 in a 900px viewport — below
  // the fold, with no internal dialog scroll and body-scroll locked by Radix, so
  // the button is physically unreachable. That floored S3 (reassign+save) for
  // ALL conditions and broke S4's pwcli save. 1200 puts the footer on-screen.
  // Shared by every condition and changes neither aria nor agrune snapshot
  // content (both are scroll-independent), so the comparison stays fair.
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
  // Unique session per process so we never reconnect to a stale daemon left by a
  // killed prior run (that reconnect can block for the close timeout). Opened
  // lazily on the first pwcli reset().
  const pw = new PwCli('agrune-bench-' + process.pid)

  await mkdir(OUT_DIR, { recursive: true })
  const outPath = resolve(OUT_DIR, process.env.OUT || 'agrune-multistep2-results.json')
  const results = []
  // Write after every (model,scenario,cond) so a kill never loses progress.
  const flush = async () => { await writeFile(outPath, JSON.stringify(buildOut(results, models, conditions, scenarios), null, 2), 'utf8') }

  for (const modelKey of models) {
    const decide = makeDriver(modelKey); decide.modelKey = modelKey
    const nTrials = trialsFor(modelKey)
    for (const scenario of scenarios) {
      for (const cond of conditions) {
        const runs = []
        let pass = 0
        for (let t = 0; t < nTrials; t++) {
          let r
          try { r = await runOne({ page, pw, base, manifest }, scenario, cond, decide) }
          catch (e) { r = { outcome: 'crash', rounds: 0, steps: 0, wander: 0, looks: 0, heals: 0, tokens: { input: 0, output: 0, reasoning: 0, total: 0 }, score: { pass: false, detail: 'crash:' + String(e.message || e).slice(0, 80) }, transcript: [] } }
          if (r.score.pass) pass++
          runs.push(r)
          console.log(`${modelKey} | ${scenario.id} | ${cond.key} t${t + 1}: ${r.score.pass ? 'PASS' : 'fail'} (${r.outcome}, ${r.rounds}r/${r.steps}s, look ${r.looks ?? r.rounds}, heal ${r.heals ?? 0}, tok ${r.tokens.total}, wander ${r.wander}) ${r.score.detail ?? ''}`)
        }
        results.push({ model: modelKey, scenario: scenario.id, difficulty: scenario.difficulty, cond: cond.key, pass, trials: nTrials, runs })
        await flush()
      }
    }
  }

  const out = buildOut(results, models, conditions, scenarios)
  await flush()

  console.log('\n=== completion / cost (per model × condition) ===')
  for (const modelKey of models) {
    console.log(`\n[${modelKey}]`)
    for (const c of conditions) {
      const b = out.aggregate[`${modelKey}|${c.key}`]
      console.log(`  ${c.key.padEnd(14)} ${String(b.passRate).padStart(5)}%  (${b.passes}/${b.runs})  rounds ${b.avgRounds}  looks ${b.avgLooks}  heals ${b.avgHeals}  tok ${b.avgTotalTok} (in ${b.avgInTok}/out ${b.avgOutTok})  wander ${b.avgWander}  ${JSON.stringify(b.outcomes)}`)
    }
  }
  console.log(`\nresults → ${outPath}`)

  try { pw.close() } catch {}
  await browser.close()
  server.close()
}

// Run main() only when this file is the entrypoint, so this module can be
// imported without launching a full bench run.
const __isMain = (() => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) } catch { return false } })()
if (__isMain) main().catch(err => { console.error('multistep2 failed:', err); process.exitCode = 1 })
