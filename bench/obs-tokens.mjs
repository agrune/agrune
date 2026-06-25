// Model-free OBSERVATION-token bench on the REAL demo. Measures, deterministically (no model,
// no round-count / prompt-cache confound), how many tokens each driver feeds the agent per "look".
//
//   pwcli  : the agent's ONLY view is the current-view a11y `snapshot`; to perceive affordances on
//            another tab it must navigate there and snapshot AGAIN (refs are ephemeral).
//   agrune : the manifest is APP-SCOPED — ONE `targets`/`snapshot` exposes every view's actionable
//            targets at once (verified: 9 groups spanning board/members/messenger/docs/workflow).
//            `targets` = outline (groups+counts+desc), `targets --group X` = working set,
//            `snapshot` = all targets with stable refs.
//
// State setup uses each driver's NATIVE click (real Playwright pointer events) — DOM .click() does
// NOT trigger Radix tab switches, so eval-clicks were silently no-ops in an earlier version.
//
//   node bench/obs-tokens.mjs   → prints table, writes bench/results/obs-tokens.json

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { encode } from 'gpt-tokenizer'

const here = dirname(fileURLToPath(import.meta.url))
const AG = resolve(here, '../dist/bin/agrune.js')
const PWCLI = process.env.PWCLI_BIN ?? '/tmp/pwcli-probe/node_modules/.bin/playwright-cli'
const DEMO_URL = process.env.AGRUNE_DEMO_URL ?? 'http://127.0.0.1:4178/'
const SOCK = '/tmp/abench-obs/daemon.sock'
const SID = 'obs-pwcli'

const tok = (s) => encode(s || '').length
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function sh(bin, args, env = {}, timeout = 40000) {
  try { return execFileSync(bin, args, { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } }) }
  catch (e) { return `${e.stdout || ''}${e.stderr || ''}` || String(e.message) }
}

async function startDaemon(env) {
  sh('node', [AG, 'daemon', 'stop'], env, 10000)
  const child = spawn('node', [AG, 'daemon', 'run', '--headless'], { env: { ...process.env, ...env }, detached: true, stdio: 'ignore' })
  child.unref()
  for (let i = 0; i < 80; i++) { if (/agrune-daemon/.test(sh('node', [AG, 'daemon', 'status'], env, 5000))) return true; await sleep(250) }
  return false
}

const PW_TABS = ['Board', 'Members', 'Messenger', 'Docs', 'Workflow']
const refOf = (snap, label) => { const m = snap.match(new RegExp(`tab "${label}"[^\\n]*\\[ref=(e\\d+)\\]`)); return m ? m[1] : null }

async function main() {
  const env = { AGRUNE_DAEMON_SOCKET: SOCK }
  mkdirSync('/tmp/abench-obs', { recursive: true })

  await startDaemon(env)
  sh('node', [AG, 'open', DEMO_URL, '--headless'], env, 40000)
  sh(PWCLI, [`-s=${SID}`, 'close'], {}, 10000)
  sh(PWCLI, [`-s=${SID}`, 'open', DEMO_URL], {}, 40000)
  await sleep(800)

  // ---- agrune: app-scoped, ONE look reveals everything (view-independent) ----
  const agOutline = sh('node', [AG, 'targets'], env, 30000)
  const agFull = sh('node', [AG, 'targets', '--full'], env, 30000)
  const agSnap = sh('node', [AG, 'snapshot'], env, 30000)
  // working set = outline + expand the one group you act in (per real agent usage)
  const agGroupBoard = sh('node', [AG, 'targets', '--group', 'board'], env, 30000)
  const agGroupMembers = sh('node', [AG, 'targets', '--group', 'members'], env, 30000)
  const agrune = {
    outline: tok(agOutline),
    full: tok(agFull),
    snapshot: tok(agSnap),
    workingSet_board: tok(agOutline) + tok(agGroupBoard),
    workingSet_members: tok(agOutline) + tok(agGroupMembers),
  }

  // ---- pwcli: per-view a11y snapshot (must navigate + re-snapshot per tab) ----
  const perView = {}
  for (const tab of PW_TABS) {
    const board = sh(PWCLI, [`-s=${SID}`, 'snapshot'], {}, 30000) // fresh snapshot for fresh refs
    const ref = refOf(board, tab)
    if (tab !== 'Board') { if (!ref) { perView[tab] = null; continue } sh(PWCLI, [`-s=${SID}`, 'click', ref], {}, 20000); await sleep(400) }
    const snap = sh(PWCLI, [`-s=${SID}`, 'snapshot'], {}, 30000)
    perView[tab] = tok(snap)
    // return to Board for the next iteration's fresh refs
    const back = refOf(sh(PWCLI, [`-s=${SID}`, 'snapshot'], {}, 30000), 'Board')
    if (back) { sh(PWCLI, [`-s=${SID}`, 'click', back], {}, 20000); await sleep(400) }
  }
  const tourTotal = Object.values(perView).filter((v) => v != null).reduce((a, b) => a + b, 0)

  sh('node', [AG, 'daemon', 'stop'], env, 10000)
  sh(PWCLI, [`-s=${SID}`, 'close'], {}, 10000)

  // ---- report ----
  const padl = (s, n) => String(s).padStart(n)
  console.log('\n  agrune OBSERVATION-token bench (cl100k_base) — REAL PM demo\n')
  console.log('  pwcli a11y `snapshot`, PER VIEW (must navigate + re-snapshot each; refs ephemeral):')
  for (const t of PW_TABS) console.log(`    ${t.padEnd(12)} ${padl(perView[t] ?? 'n/a', 6)} tok`)
  console.log(`    ${'TOUR ALL 5'.padEnd(12)} ${padl(tourTotal, 6)} tok  (to perceive every view's affordances)\n`)
  console.log('  agrune, ONE app-scoped look (view-independent — all 9 groups / all views at once):')
  console.log(`    outline (targets)            ${padl(agrune.outline, 6)} tok   vs board a11y: ${Math.round((1 - agrune.outline / perView.Board) * 1000) / 10}%   vs tour-all: ${Math.round((1 - agrune.outline / tourTotal) * 1000) / 10}%`)
  console.log(`    working set (outline+1 group) ${padl(agrune.workingSet_board, 6)} tok   (board group)`)
  console.log(`    snapshot (all targets+refs)  ${padl(agrune.snapshot, 6)} tok   vs board a11y: ${Math.round((1 - agrune.snapshot / perView.Board) * 1000) / 10}%   vs tour-all: ${Math.round((1 - agrune.snapshot / tourTotal) * 1000) / 10}%`)
  console.log(`    full targets (every target)  ${padl(agrune.full, 6)} tok   vs tour-all: ${Math.round((1 - agrune.full / tourTotal) * 1000) / 10}%\n`)

  const result = { tokenizer: 'cl100k_base', demo: DEMO_URL, pwcli_per_view: perView, pwcli_tour_total: tourTotal, agrune }
  const outDir = join(here, 'results'); mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'obs-tokens.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(`  wrote ${join(outDir, 'obs-tokens.json')}\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
