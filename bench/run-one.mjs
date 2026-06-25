// Run ONE isolated (driver, scenario) agentic session: gpt-5.5 (a SINGLE `codex exec` session —
// continuous context, NOT a per-step oracle) drives the browser CLI itself to accomplish the
// goal; scored by a localStorage ground-truth predicate. Prints one JSON result line.
//
//   node bench/run-one.mjs <agrune|pwcli> <scenarioId> <sid>
//
// Isolation: agrune → its own daemon on a per-run socket; pwcli → its own -s=<sid> session.

import { execFileSync, spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { encode } from 'gpt-tokenizer'

const here = dirname(fileURLToPath(import.meta.url))
const AG = resolve(here, '../dist/bin/agrune.js')
const PWCLI = process.env.PWCLI_BIN ?? '/tmp/pwcli-probe/node_modules/.bin/playwright-cli'
const DEMO_URL = process.env.AGRUNE_DEMO_URL ?? 'http://127.0.0.1:4178/'
const MODEL = process.env.AGRUNE_BENCH_MODEL ?? 'gpt-5.5'
const CODEX_TIMEOUT = Number(process.env.AGRUNE_CODEX_TIMEOUT ?? '300') * 1000

const [driverName, scenarioId, sidArg] = process.argv.slice(2)
const sid = sidArg ?? `${driverName}-${scenarioId}`
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\n') }

// ---- scenarios (localStorage ground-truth predicates) ----------------------
const ACTIVE_DEVELOPERS = ['Bob Kim', 'Charlie Park', 'Iris Tanaka', 'Jack Morrison', 'Nathan Patel', 'Peter Nguyen', 'Uma Krishnan']
const ACTIVE_DEV_IDS = ['member-2', 'member-3', 'member-9', 'member-10', 'member-14', 'member-16', 'member-21']
const isDev = (n) => ACTIVE_DEVELOPERS.includes(n)
const hasAssignee = (n) => typeof n === 'string' && n.trim().length > 0
const hasComment = (t) => Array.isArray(t?.comments) && t.comments.some((c) => c.body && c.body.trim())

const SCENARIOS = {
  'S1-create-for-dev': {
    maxSteps: 12,
    instruction: 'Create a brand-new task titled "Investigate API latency" (give it a short description like "Latency is high"), assign it to a teammate, then finish creating the task.',
    predicate: ({ tasks }) => {
      const t = tasks.find((x) => /investigat|latenc/i.test(x.title) && hasAssignee(x.assignee))
      return { pass: !!t && tasks.length >= 9, detail: t ? `${t.title} -> ${t.assignee}` : `len=${tasks.length}` }
    },
  },
  'S2-comment': {
    maxSteps: 9,
    instruction: 'Open the existing task about the authentication flow and post a comment on it asking a teammate for a review.',
    predicate: ({ tasks }) => {
      const t = tasks.find((x) => x.id === 'task-2' || /authenticat/i.test(x.title))
      return { pass: hasComment(t), detail: t ? `comments=${(t.comments || []).length}` : 'task not found' }
    },
  },
  'S6-find-dev-then-dm': {
    maxSteps: 14,
    instruction: 'Go to the Members tab and find an active developer. Then open the team messenger, open the conversation with that developer, and send them a direct message asking for their opinion on the authentication work.',
    predicate: ({ messages }) => {
      const hit = ACTIVE_DEV_IDS.find((id) => (messages[id] || []).some((m) => m.from === 'me' && !String(m.id).startsWith('msg-seed') && /auth|authenticat|login|로그인|인증/i.test(m.body || '')))
      return { pass: !!hit, detail: hit ? `dm->${hit}` : 'no on-topic dm to an active dev' }
    },
  },

  // ---- complex cross-view flows (dependent multi-step) ----------------------
  'C1-assign-move-notify': {
    maxSteps: 24,
    instruction:
      'Complete this multi-step workflow. (1) Create a brand-new task titled "Fix authentication flow" and give it a short description. (2) Assign the task to an active developer of your choice. (3) Finish creating the task, then move it from To Do to the "In Progress" column on the board. (4) Open the team messenger, open the conversation with that SAME developer you assigned, and send them a direct message telling them you assigned them the authentication task and asking for an ETA.',
    predicate: ({ tasks, messages }) => {
      const t = tasks.find((x) => /authenticat|auth/i.test(x.title) && ACTIVE_DEVELOPERS.includes(x.assignee) && /in-progress/i.test(x.status || ''))
      if (!t) {
        const any = tasks.find((x) => /authenticat|auth/i.test(x.title))
        return { pass: false, detail: any ? `auth task: assignee=${any.assignee || '∅'} status=${any.status}` : `no auth task (len=${tasks.length})` }
      }
      const devId = ACTIVE_DEV_IDS[ACTIVE_DEVELOPERS.indexOf(t.assignee)]
      const dm = (messages[devId] || []).some((m) => m.from === 'me' && !String(m.id).startsWith('msg-seed') && /auth|task|assign|eta|로그인|인증/i.test(m.body || ''))
      return { pass: dm, detail: dm ? `task->${t.assignee}(in-progress) + DM->${devId}` : `task ok (${t.assignee}/in-progress) but no on-topic DM to ${devId}` }
    },
  },
  'C2-triage-three': {
    maxSteps: 26,
    instruction:
      'Create THREE separate new tasks and assign each to a DIFFERENT active developer: (1) "Write unit tests", (2) "Update API documentation", (3) "Refactor login module". After all three are created, move the "Write unit tests" task to the "Done" column.',
    predicate: ({ tasks }) => {
      const res = [/unit test/i, /api doc|documentation/i, /refactor.*login|login.*refactor/i].map((re) => tasks.find((x) => re.test(x.title) && ACTIVE_DEVELOPERS.includes(x.assignee)))
      const n = res.filter(Boolean).length
      const distinct = n === 3 && new Set(res.map((t) => t.assignee)).size === 3
      const testsDone = res[0] && /done/i.test(res[0].status || '')
      return { pass: Boolean(distinct && testsDone), detail: `found=${n}/3 distinctAssignees=${distinct} unitTestsDone=${!!testsDone}` }
    },
  },
}
const scenario = SCENARIOS[scenarioId]
if (!scenario) { out({ driver: driverName, scenario: scenarioId, error: 'unknown scenario' }); process.exit(1) }

const STATE_EXPR = "(()=>{return{tasks:JSON.parse(localStorage.getItem('pm-tasks')||'[]'),members:JSON.parse(localStorage.getItem('pm-members')||'[]'),messages:JSON.parse(localStorage.getItem('pm-messages')||'{}')}})()"

function sh(bin, args, env = {}, timeout = 40000) {
  try {
    return { ok: true, out: execFileSync(bin, args, { encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...env } }) }
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` || String(e.message) }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function startAgruneDaemon(socket, env) {
  const child = spawn('node', [AG, 'daemon', 'run', '--headless'], { env: { ...process.env, ...env }, detached: true, stdio: 'ignore' })
  child.unref()
  for (let i = 0; i < 80; i++) {
    const r = sh('node', [AG, 'daemon', 'status'], env, 5000)
    if (r.ok && /agrune-daemon/.test(r.out)) return true
    await sleep(250)
  }
  return false
}

const workDir = `/tmp/abench-${sid}`
mkdirSync(workDir, { recursive: true })
const wrapper = join(workDir, 'cli')

async function main() {
  let env = {}
  let readState
  let cmdRef
  let teardown = () => {}

  if (driverName === 'agrune') {
    const socket = `${workDir}/daemon.sock`
    env = { AGRUNE_DAEMON_SOCKET: socket }
    sh('node', [AG, 'daemon', 'stop'], env, 10000)
    await startAgruneDaemon(socket, env)
    sh('node', [AG, 'open', DEMO_URL, '--headless'], env, 40000)
    sh('node', [AG, 'evaluate', 'localStorage.clear()'], env, 20000)
    sh('node', [AG, 'navigate', DEMO_URL], env, 30000)
    writeFileSync(wrapper, `#!/bin/sh\nexport AGRUNE_DAEMON_SOCKET="${socket}"\nexec node "${AG}" "$@"\n`)
    chmodSync(wrapper, 0o755)
    readState = () => { const r = sh('node', [AG, 'evaluate', STATE_EXPR], env, 20000); try { return JSON.parse(r.out).result } catch { return { tasks: [], members: [], messages: {} } } }
    teardown = () => sh('node', [AG, 'daemon', 'stop'], env, 10000)
    cmdRef = `Run every browser command as:  ${wrapper} <args>
- ${wrapper} targets                      list actionable groups (compact outline)
- ${wrapper} targets --group <groupId>    expand a group to reveal its [ref=...] targets
- ${wrapper} targets --full               all targets with descriptions
- ${wrapper} click <ref>                  click a target by its [ref=...] id
- ${wrapper} fill <ref> <value>           fill an input target
- ${wrapper} type <ref> <value> --submit  type then submit
- ${wrapper} select <ref> <value>         choose a dropdown option
- ${wrapper} read                         visible page text
Targets are STABLE manifest ids. Re-run targets after the UI changes.`
  } else if (driverName === 'pwcli') {
    sh(PWCLI, [`-s=${sid}`, 'close'], {}, 10000)
    sh(PWCLI, [`-s=${sid}`, 'open', DEMO_URL], {}, 40000)
    sh(PWCLI, [`-s=${sid}`, 'eval', 'localStorage.clear()'], {}, 20000)
    sh(PWCLI, [`-s=${sid}`, 'goto', DEMO_URL], {}, 30000)
    writeFileSync(wrapper, `#!/bin/sh\nexec "${PWCLI}" -s=${sid} "$@"\n`)
    chmodSync(wrapper, 0o755)
    readState = () => {
      const r = sh(PWCLI, [`-s=${sid}`, 'eval', `() => ${STATE_EXPR}`], {}, 20000)
      try {
        // pwcli prints: "### Result\n<JSON>\n### Ran Playwright code\n```js ...". Extract ONLY
        // the block between those markers (a greedy {...} match leaks into the code echo).
        const block = (r.out.split('### Result')[1] ?? '').split('### Ran Playwright code')[0] ?? ''
        return JSON.parse(block.trim())
      } catch {
        return { tasks: [], members: [], messages: {} }
      }
    }
    teardown = () => sh(PWCLI, [`-s=${sid}`, 'close'], {}, 10000)
    cmdRef = `Run every browser command as:  ${wrapper} <args>
- ${wrapper} snapshot                     capture the page; returns elements with [ref=eN] ids
- ${wrapper} click <ref>                  click element by its [ref=eN] id
- ${wrapper} fill <ref> <value>           fill an input element
- ${wrapper} type <value>                 type into the focused editable element
- ${wrapper} select <ref> <value>         choose a dropdown option
- ${wrapper} press <key>                  press a key (e.g. Enter)
The [ref=eN] ids are EPHEMERAL — re-run snapshot after the UI changes to get fresh refs.`
  } else { out({ error: 'unknown driver' }); process.exit(1) }

  const prompt = `You are an autonomous agent driving a headless browser to complete ONE task on a project-management web app that is already open. You control the browser ONLY through the CLI below.

${cmdRef}

Work step by step: inspect the page, decide, act, re-inspect after changes, until the goal is DONE. Aim to finish within about ${scenario.maxSteps} actions.

GOAL: ${scenario.instruction}

Rules: Use ONLY the browser commands above. Do NOT modify localStorage or app state directly (no eval/run-code that writes state). Stop when the goal is fully accomplished.`

  const started = Date.now()
  let events = ''
  let timedOut = false
  try {
    events = execFileSync('codex', ['exec', '-m', MODEL, '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--ignore-user-config', '-C', here, '--json', prompt], { encoding: 'utf8', timeout: CODEX_TIMEOUT, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) {
    timedOut = /ETIMEDOUT|timed out/i.test(String(e.message))
    events = e.stdout ? String(e.stdout) : ''
  }
  const elapsed = Math.round((Date.now() - started) / 1000)
  if (process.env.AGRUNE_BENCH_DUMP) writeFileSync(process.env.AGRUNE_BENCH_DUMP, events)

  // parse metrics from JSONL events.
  // PRIMARY METRIC — observationTokens: Σ tokens of every browser-CLI output the agent READS
  //   (each command_execution's aggregated_output). This is the DRIVER-ATTRIBUTABLE token cost —
  //   agrune's compact manifest looks vs pwcli's a11y snapshots — with NONE of codex's own system
  //   prompt / reasoning / per-round context-resend (all driver-independent) diluting it. This is
  //   what the recorded baseline measured; codex's billed total (below) is NOT comparable to it.
  // SECONDARY — totalTokens: codex's end-to-end billed cost (non-cached input + output). Dominated
  //   by reasoning × round count; kept for reference only.
  let rounds = 0, wander = 0, observationTokens = 0, commandTokens = 0
  let sumInput = 0, sumOutput = 0, sumCached = 0
  for (const line of events.split('\n')) {
    if (!line.trim()) continue
    let ev; try { ev = JSON.parse(line) } catch { continue }
    if (ev.type === 'item.completed' && ev.item?.type === 'command_execution') {
      rounds++
      const o = ev.item.aggregated_output || ''
      const cmd = Array.isArray(ev.item.command) ? ev.item.command.join(' ') : (ev.item.command || '')
      observationTokens += encode(o).length
      commandTokens += encode(cmd).length
      if ((ev.item.exit_code && ev.item.exit_code !== 0) || /TARGET_NOT_FOUND|SESSION_NOT_ACTIVE|not found|INVALID|error:/i.test(o)) wander++
    }
    if (ev.type === 'turn.completed' && ev.usage) {
      sumInput += ev.usage.input_tokens ?? 0
      sumOutput += ev.usage.output_tokens ?? 0
      sumCached += ev.usage.cached_input_tokens ?? 0
    }
  }
  const totalTokens = (sumInput - sumCached) + sumOutput // codex billed (secondary, not driver-attributable)

  let completed = false, detail = ''
  try { const r = scenario.predicate(readState()); completed = r.pass; detail = r.detail } catch (e) { detail = 'predicate error: ' + e.message }

  teardown()
  out({ driver: driverName, scenario: scenarioId, completed, detail, rounds, wander, observationTokens, commandTokens, totalTokens, sumInput, sumOutput, sumCached, elapsed, timedOut })
}

main().catch((e) => { out({ driver: driverName, scenario: scenarioId, error: String(e.message) }); process.exit(1) })
