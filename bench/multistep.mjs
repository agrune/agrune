// Multistep agentic completion bench — gpt-5.5 (via `codex exec`) drives agrune-lean vs the REAL
// @playwright/cli on the same PM demo + scenarios, scored by a localStorage ground-truth
// predicate. Reproduces the recorded-baseline methodology (the model that produced the baseline,
// gpt-5.5, is now available through codex exec).
//
//   node demo-server (port 4178) running; @playwright/cli installed at PWCLI_BIN; then:
//   node bench/multistep.mjs [agrune|pwcli|both] [scenarioIds...]
//
// Metrics per (driver, scenario): completed (predicate), rounds (oracle calls), contextTokens
// (cl100k snapshot tokens fed), wander (failed/no-op actions). Writes bench/results/multistep.json.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { encode } from 'gpt-tokenizer'

const here = dirname(fileURLToPath(import.meta.url))
const DEMO_URL = process.env.AGRUNE_DEMO_URL ?? 'http://127.0.0.1:4178/'
const MODEL = process.env.AGRUNE_BENCH_MODEL ?? 'gpt-5.5'
const AGRUNE_BIN = resolve(here, '../dist/bin/agrune.js')
const PWCLI_BIN = process.env.PWCLI_BIN ?? '/tmp/pwcli-probe/node_modules/.bin/playwright-cli'
const tok = (s) => encode(s).length

// ---- scenarios (ground truth over localStorage {tasks, members, messages}) -------------------

const ACTIVE_DEVELOPERS = ['Bob Kim', 'Charlie Park', 'Iris Tanaka', 'Jack Morrison', 'Nathan Patel', 'Peter Nguyen', 'Uma Krishnan']
const ACTIVE_DEV_IDS = ['member-2', 'member-3', 'member-9', 'member-10', 'member-14', 'member-16', 'member-21']
const isDev = (name) => ACTIVE_DEVELOPERS.includes(name)
const hasAssignee = (n) => typeof n === 'string' && n.trim().length > 0
const hasComment = (t) => Array.isArray(t?.comments) && t.comments.some((c) => c.body && c.body.trim())

const ALL_SCENARIOS = [
  {
    id: 'S1-create-for-dev', maxSteps: 12,
    instruction: 'Create a brand-new task titled "Investigate API latency" (short description like "Latency is high"), assign it to a teammate, then finish creating the task.',
    predicate: ({ tasks }) => {
      const t = tasks.find((x) => /investigat|latenc/i.test(x.title) && hasAssignee(x.assignee))
      return { pass: !!t && tasks.length >= 9, detail: t ? `${t.title} → ${t.assignee}` : `len=${tasks.length}` }
    },
  },
  {
    id: 'S2-comment', maxSteps: 9,
    instruction: 'Open the existing task about the authentication flow and post a comment on it asking a teammate for a review.',
    predicate: ({ tasks }) => {
      const t = tasks.find((x) => x.id === 'task-2' || /authenticat/i.test(x.title))
      return { pass: hasComment(t), detail: t ? `comments=${(t.comments || []).length}` : 'task not found' }
    },
  },
  {
    id: 'S6-find-dev-then-dm', maxSteps: 14,
    instruction: 'Go to the Members tab and find an active developer. Then open the team messenger, open the conversation with that developer, and send them a direct message asking for their opinion on the authentication work.',
    predicate: ({ messages }) => {
      const hit = ACTIVE_DEV_IDS.find((id) => (messages[id] || []).some((m) => m.from === 'me' && !String(m.id).startsWith('msg-seed') && /auth|authenticat|login|로그인|인증/i.test(m.body || '')))
      return { pass: !!hit, detail: hit ? `dm→${hit}` : 'no on-topic dm to an active developer' }
    },
  },
]

// ---- drivers ---------------------------------------------------------------------------------

function sh(bin, args, timeout = 60000) {
  try {
    return { ok: true, out: execFileSync(bin, args, { encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 }) }
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` || String(e.message) }
  }
}

const agrune = {
  name: 'agrune',
  verbs: 'click <ref> | fill <ref> <value> | type <ref> <value> | select <ref> <value> | snapshot | done',
  refHelp: 'Use the stable [ref=...] id of a target. Repeat rows use repeatId[key=K].base.',
  reset() {
    sh('node', [AGRUNE_BIN, 'evaluate', 'localStorage.clear()', '--tab', '1'], 20000)
    sh('node', [AGRUNE_BIN, 'navigate', DEMO_URL], 30000)
  },
  open() {
    sh('node', [AGRUNE_BIN, 'daemon', 'stop'], 10000)
    sh('node', [AGRUNE_BIN, 'open', DEMO_URL, '--headless'], 40000)
  },
  snapshot() {
    // Outline (groups + counts) + the full target list (name + description + ref), WITHOUT
    // per-target textContent. NOTE: this feeds the whole manifest every turn — a CONSERVATIVE
    // choice that UNDERSTATES agrune's real outline-first/expand-one-group token advantage.
    const outline = sh('node', [AGRUNE_BIN, 'targets'], 30000).out
    const full = sh('node', [AGRUNE_BIN, 'targets', '--full'], 30000).out
    const body = full.split('```yaml')[1] ?? full
    return `${outline}\n# full target list:\n${body}`
  },
  act(a) {
    if (a.verb === 'snapshot' || a.verb === 'done') return { ok: true, out: '' }
    if (a.verb === 'click') return sh('node', [AGRUNE_BIN, 'click', a.ref], 30000)
    if (a.verb === 'fill') return sh('node', [AGRUNE_BIN, 'fill', a.ref, a.value ?? ''], 30000)
    if (a.verb === 'type') return sh('node', [AGRUNE_BIN, 'type', a.ref, a.value ?? '', '--submit'], 30000)
    if (a.verb === 'select') return sh('node', [AGRUNE_BIN, 'select', a.ref, a.value ?? ''], 30000)
    return { ok: false, out: `unknown verb ${a.verb}` }
  },
  readState() {
    const r = sh('node', [AGRUNE_BIN, 'evaluate', '({tasks:JSON.parse(localStorage.getItem("pm-tasks")||"[]"),members:JSON.parse(localStorage.getItem("pm-members")||"[]"),messages:JSON.parse(localStorage.getItem("pm-messages")||"{}")})'], 20000)
    try {
      return JSON.parse(r.out).result
    } catch {
      return { tasks: [], members: [], messages: {} }
    }
  },
  stop() {
    sh('node', [AGRUNE_BIN, 'daemon', 'stop'], 10000)
  },
}

const SESS = 'agrune-bench'
const pwcli = {
  name: 'pwcli',
  verbs: 'click <ref> | fill <ref> <value> | type <ref> <value> | select <ref> <value> | snapshot | done',
  refHelp: 'Use the eN element ref from the latest snapshot (e.g. e12). Re-snapshot when refs go stale.',
  reset() {
    sh(PWCLI_BIN, [`-s=${SESS}`, 'eval', 'localStorage.clear()'], 20000)
    sh(PWCLI_BIN, [`-s=${SESS}`, 'goto', DEMO_URL], 30000)
  },
  open() {
    sh(PWCLI_BIN, [`-s=${SESS}`, 'close'], 10000)
    sh(PWCLI_BIN, [`-s=${SESS}`, 'open', DEMO_URL], 40000)
  },
  snapshot() {
    return sh(PWCLI_BIN, [`-s=${SESS}`, 'snapshot'], 30000).out
  },
  act(a) {
    if (a.verb === 'snapshot' || a.verb === 'done') return { ok: true, out: '' }
    if (a.verb === 'click') return sh(PWCLI_BIN, [`-s=${SESS}`, 'click', a.ref], 30000)
    if (a.verb === 'fill') return sh(PWCLI_BIN, [`-s=${SESS}`, 'fill', a.ref, a.value ?? ''], 30000)
    if (a.verb === 'type') return sh(PWCLI_BIN, [`-s=${SESS}`, 'type', a.value ?? ''], 30000)
    if (a.verb === 'select') return sh(PWCLI_BIN, [`-s=${SESS}`, 'select', a.ref, a.value ?? ''], 30000)
    return { ok: false, out: `unknown verb ${a.verb}` }
  },
  readState() {
    const r = sh(PWCLI_BIN, [`-s=${SESS}`, 'eval', '() => ({tasks:JSON.parse(localStorage.getItem("pm-tasks")||"[]"),members:JSON.parse(localStorage.getItem("pm-members")||"[]"),messages:JSON.parse(localStorage.getItem("pm-messages")||"{}")})'], 20000)
    try {
      const m = r.out.match(/\{[\s\S]*\}/)
      return JSON.parse(m[0])
    } catch {
      return { tasks: [], members: [], messages: {} }
    }
  },
  stop() {
    sh(PWCLI_BIN, [`-s=${SESS}`, 'close'], 10000)
  },
}

// ---- gpt-5.5 oracle via codex exec -----------------------------------------------------------

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verb', 'ref', 'value', 'reason'],
  properties: {
    verb: { type: 'string', enum: ['click', 'fill', 'type', 'select', 'snapshot', 'done'] },
    ref: { type: 'string', description: 'target/element ref; empty when N/A' },
    value: { type: 'string', description: 'value for fill/type/select; empty when N/A' },
    reason: { type: 'string' },
  },
}
const SCHEMA_PATH = '/tmp/agrune-bench-schema.json'
writeFileSync(SCHEMA_PATH, JSON.stringify(SCHEMA))

function oracle(driver, instruction, history, snapshot) {
  const sys = `You are an autonomous web agent driving a project-manager app through the "${driver.name}" CLI.
Available actions: ${driver.verbs}.
${driver.refHelp}
Pick the SINGLE next action that makes progress toward the goal. Use "snapshot" only if you truly need a fresh view. Use "done" when the goal is fully accomplished. Output ONLY the JSON action.`
  const transcript = history.length ? `\nActions so far:\n${history.map((h, i) => `${i + 1}. ${h}`).join('\n')}` : ''
  const prompt = `GOAL: ${instruction}\n${transcript}\n\nCurrent page (${driver.name} view):\n${snapshot}\n\nNext action:`
  const outPath = '/tmp/agrune-bench-action.json'
  try {
    execFileSync('codex', ['exec', '-m', MODEL, '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--output-schema', SCHEMA_PATH, '-o', outPath, `${sys}\n\n${prompt}`], { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'ignore', 'ignore'] })
    return { action: JSON.parse(readFileSync(outPath, 'utf8')), promptTokens: tok(sys) + tok(prompt) }
  } catch (e) {
    return { action: { verb: 'snapshot', ref: '', value: '', reason: 'oracle error: ' + String(e.message).slice(0, 80) }, promptTokens: tok(sys) + tok(prompt) }
  }
}

// ---- run loop --------------------------------------------------------------------------------

function runScenario(driver, scenario) {
  driver.reset()
  const history = []
  let rounds = 0
  let contextTokens = 0
  let wander = 0
  let actions = 0
  for (let step = 0; step < scenario.maxSteps; step++) {
    const snapshot = driver.snapshot()
    const { action, promptTokens } = oracle(driver, scenario.instruction, history, snapshot)
    rounds++
    contextTokens += promptTokens
    if (action.verb === 'done') break
    const res = driver.act(action)
    actions++
    const failed = !res.ok || /error|not found|invalid|unknown/i.test(res.out)
    if (failed) wander++
    history.push(`${action.verb} ${action.ref || ''} ${action.value || ''}`.trim() + (failed ? ' [FAILED]' : ''))
    process.stdout.write(failed ? 'x' : '.')
  }
  const state = driver.readState()
  let result
  try {
    result = scenario.predicate(state)
  } catch (e) {
    result = { pass: false, detail: 'predicate error: ' + e.message }
  }
  return { scenario: scenario.id, driver: driver.name, completed: result.pass, detail: result.detail, rounds, contextTokens, wander, actions }
}

function main() {
  const args = process.argv.slice(2)
  const which = args[0] === 'agrune' || args[0] === 'pwcli' || args[0] === 'both' ? args.shift() : 'both'
  const ids = args.length ? args : ALL_SCENARIOS.map((s) => s.id)
  const scenarios = ALL_SCENARIOS.filter((s) => ids.includes(s.id))
  const drivers = which === 'agrune' ? [agrune] : which === 'pwcli' ? [pwcli] : [agrune, pwcli]

  const rows = []
  for (const driver of drivers) {
    console.log(`\n=== driver: ${driver.name} ===`)
    driver.open()
    for (const scenario of scenarios) {
      process.stdout.write(`  ${scenario.id}: `)
      const r = runScenario(driver, scenario)
      rows.push(r)
      console.log(` ${r.completed ? 'PASS' : 'FAIL'} (rounds=${r.rounds} tok=${r.contextTokens} wander=${r.wander}) ${r.detail}`)
    }
    driver.stop()
  }

  // summary
  console.log('\n  driver   completion   avg_rounds   avg_tokens   avg_wander')
  for (const driver of drivers) {
    const dr = rows.filter((r) => r.driver === driver.name)
    const comp = dr.filter((r) => r.completed).length
    const avg = (f) => (dr.reduce((s, r) => s + f(r), 0) / dr.length).toFixed(1)
    console.log(`  ${driver.name.padEnd(8)} ${comp}/${dr.length}        ${avg((r) => r.rounds).padStart(8)}   ${avg((r) => r.contextTokens).padStart(9)}   ${avg((r) => r.wander).padStart(8)}`)
  }

  mkdirSync(join(here, 'results'), { recursive: true })
  writeFileSync(join(here, 'results', 'multistep.json'), JSON.stringify({ model: MODEL, scenarios: ids, rows }, null, 2) + '\n')
}

main()
