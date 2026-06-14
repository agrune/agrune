// Accuracy bench — Phase B (no browser; replays captured fixtures through a small
// LOCAL model). For each task the model is shown ONE representation of the page —
// (1) the agrune desc-rich snapshot, or (2) the raw Playwright-MCP a11y tree — and
// must return the ref of the single element to act on. We score against the
// captured ground-truth bridge.
//
// Model: gpt-oss:20b via ollama (http://localhost:11434). Sequential (one local
// instance), temperature 0. Output: output/agrune-accuracy-results.json
//
// Env: OLLAMA_HOST, OLLAMA_MODEL, TRIALS, THINK ("false"|"low"|"medium"), MAX_TASKS

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countTokens, tokenizerMode } from '../tokens.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../../..')
const FIX_DIR = resolve(__dirname, '../../fixtures/accuracy')
const OUT_DIR = resolve(REPO_ROOT, '..', 'output')

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:20b'
const TRIALS = Number(process.env.TRIALS || 1)
const THINK = process.env.THINK || 'low' // gpt-oss reasoning effort
const MAX_TASKS = process.env.MAX_TASKS ? Number(process.env.MAX_TASKS) : Infinity

const SYSTEM = [
  'You are a precise web-automation agent.',
  'You are given a snapshot of the CURRENT page and a single task.',
  'Pick the ONE element that the task asks you to act on.',
  'Answer with ONLY that element\'s ref — the exact token shown inside [ref=...] for that element.',
  'Output just the ref on a single line. No explanation, no quotes, no extra words.',
].join(' ')

async function ollamaChat(messages) {
  const body = {
    model: MODEL,
    messages,
    stream: false,
    think: THINK === 'false' ? false : THINK,
    options: { temperature: 0, num_predict: 1200, seed: 7 },
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${HOST}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return { content: json.message?.content ?? '', thinking: json.message?.thinking ?? '' }
    } catch (e) {
      if (attempt === 2) throw e
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  return { content: '', thinking: '' }
}

// Extract the chosen ref from a model answer.
//  - agrune refs are arbitrary ids (board_new_task_button, task_cards[key=x].y)
//    -> find which KNOWN ref appears (prefer the last occurrence).
//  - a11y refs are eNN -> take the last eNN token.
function extractAgruneRef(answer, knownRefs) {
  let best = null, bestPos = -1
  for (const ref of knownRefs) {
    const pos = answer.lastIndexOf(ref)
    if (pos > bestPos) { bestPos = pos; best = ref }
  }
  return best
}
function extractA11yRef(answer) {
  const m = [...answer.matchAll(/\be\d+\b/g)]
  return m.length ? m[m.length - 1][0] : null
}

function clean(answer) {
  // keep last non-empty line (final answer after any stray reasoning)
  const lines = answer.split('\n').map(s => s.trim()).filter(Boolean)
  return lines.length ? lines.join(' ') : answer.trim()
}

async function main() {
  const index = JSON.parse(await readFile(resolve(FIX_DIR, 'index.json'), 'utf8'))
  const tasksDoc = JSON.parse(await readFile(resolve(FIX_DIR, 'tasks.json'), 'utf8'))
  const states = {}
  for (const s of index.states) {
    states[s.state] = JSON.parse(await readFile(resolve(FIX_DIR, `${s.state}.json`), 'utf8'))
  }

  let tasks = tasksDoc.tasks
  if (Number.isFinite(MAX_TASKS)) tasks = tasks.slice(0, MAX_TASKS)

  // Four conditions, designed to separate THREE confounds the adversarial audit
  // flagged — curation, description-leak, and raw-tree noise — instead of one
  // biased "agrune vs raw a11y" number:
  //   agruneFull      curated targets + name + desc   (set-membership scoring)
  //   agruneNameOnly  curated targets + name only     (set-membership) — isolates desc
  //   a11yInteractive raw tree filtered to actionable (strict eq) — curation a real MCP could do
  //   a11yFull        full ariaSnapshot(mode:ai)      (strict eq) — what raw MCP dumps
  const CONDITIONS = [
    { key: 'agruneFull', kind: 'agrune', text: fx => fx.agruneFullText },
    { key: 'agruneNameOnly', kind: 'agrune', text: fx => fx.agruneNameOnlyText },
    { key: 'a11yInteractive', kind: 'a11y', text: fx => fx.a11yInteractiveText },
    { key: 'a11yFull', kind: 'a11y', text: fx => fx.rawA11yText },
  ]

  const promptFor = (condText, instruction, kind) =>
    `### Page snapshot\n${condText}\n\n### Task\n${instruction}\n\nReturn ONLY the ref (${kind === 'a11y' ? 'e.g. e42, ' : ''}the token inside [ref=...]) of the single element to act on.`

  const results = []
  let i = 0
  for (const task of tasks) {
    i++
    const fx = states[task.state]
    if (!fx) { console.log(`skip ${task.id}: no fixture`); continue }
    const knownAgruneRefs = fx.elements.map(e => e.ref)

    const row = { id: task.id, state: task.state, difficulty: task.difficulty, gtA11yRef: task.gtA11yRef, gtAgruneRefs: task.gtAgruneRefs, cond: {} }
    const line = [`[${i}/${tasks.length}] ${task.id} (${task.difficulty})`]

    for (const c of CONDITIONS) {
      const prompt = promptFor(c.text(fx), task.instruction, c.kind)
      const promptTokens = countTokens(SYSTEM + prompt)
      let correct = 0; const matched = []; let firstAns = ''
      for (let t = 0; t < TRIALS; t++) {
        const out = await ollamaChat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }])
        const ans = clean(out.content)
        if (t === 0) firstAns = ans.slice(0, 120)
        let ref, ok
        if (c.kind === 'agrune') { ref = extractAgruneRef(ans, knownAgruneRefs); ok = ref !== null && task.gtAgruneRefs.includes(ref) }
        else { ref = extractA11yRef(ans); ok = ref === task.gtA11yRef }
        matched.push(ref); if (ok) correct++
      }
      const pass = correct >= Math.ceil(TRIALS / 2)
      row.cond[c.key] = { correctOfTrials: correct, pass, matched, answer: firstAns, promptTokens }
      line.push(`${c.key} ${correct}/${TRIALS}${pass ? '' : '✗'}`)
    }
    results.push(row)
    console.log(line.join(' | '))
  }

  const agg = (key) => {
    const c = results.reduce((a, r) => a + (r.cond[key]?.pass ? 1 : 0), 0)
    return { correct: c, total: results.length, pct: results.length ? Math.round((c / results.length) * 1000) / 10 : 0 }
  }
  const accuracy = {}
  for (const c of CONDITIONS) accuracy[c.key] = agg(c.key)

  const byDifficulty = {}
  for (const d of ['easy', 'medium', 'hard']) {
    const rs = results.filter(r => r.difficulty === d)
    if (!rs.length) continue
    byDifficulty[d] = { n: rs.length }
    for (const c of CONDITIONS) byDifficulty[d][c.key] = rs.filter(r => r.cond[c.key]?.pass).length
  }

  const tokens = {}
  for (const c of CONDITIONS) {
    tokens[c.key] = Math.round(results.reduce((a, r) => a + (r.cond[c.key]?.promptTokens || 0), 0) / (results.length || 1))
  }

  const out = { model: MODEL, tokenizer: tokenizerMode, trials: TRIALS, think: THINK, conditions: CONDITIONS.map(c => c.key), accuracy, byDifficulty, avgPromptTokens: tokens, results }
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(resolve(OUT_DIR, 'agrune-accuracy-results.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log('\n=== accuracy (n=' + results.length + ', trials=' + TRIALS + ') ===')
  for (const c of CONDITIONS) console.log(`  ${c.key.padEnd(16)} ${accuracy[c.key].pct}%  (${accuracy[c.key].correct}/${accuracy[c.key].total})  avgTok ${tokens[c.key]}`)
  console.log('byDifficulty', JSON.stringify(byDifficulty))
  console.log(`results → ${resolve(OUT_DIR, 'agrune-accuracy-results.json')}`)
}

main().catch(err => { console.error('eval failed:', err); process.exitCode = 1 })
