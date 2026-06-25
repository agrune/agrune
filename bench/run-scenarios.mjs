// Scenario-level TOTAL-token bench. For each scenario, runs ONE continuous gpt-5.5 codex session
// per driver (via run-one.mjs) and reports the END-TO-END token cost to complete the scenario —
// agrune vs pwcli, averaged over reps. This is the "give a scenario, measure total tokens" view:
// total = (non-cached input the model had to read) + (output it generated), summed across turns.
//
//   node bench/run-scenarios.mjs [reps] [concurrency]
//   env: AGRUNE_BENCH_SCENARIOS="S1-create-for-dev,S2-comment,S6-find-dev-then-dm"
//        AGRUNE_CODEX_TIMEOUT=240
//
// Writes bench/results/scenario-tokens.json.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const RUN_ONE = resolve(here, 'run-one.mjs')
const REPS = Number(process.argv[2] ?? '2')
const CONC = Number(process.argv[3] ?? '3')
const SCENARIOS = (process.env.AGRUNE_BENCH_SCENARIOS ?? 'S1-create-for-dev,S2-comment,S6-find-dev-then-dm').split(',')
const DRIVERS = ['agrune', 'pwcli']

function runOne(driver, scenario, sid) {
  return new Promise((resolve) => {
    const ch = spawn('node', [RUN_ONE, driver, scenario, sid], { cwd: resolve_cwd(), env: process.env })
    let out = '', err = ''
    ch.stdout.on('data', (d) => (out += d))
    ch.stderr.on('data', (d) => (err += d))
    ch.on('close', () => {
      // run-one prints exactly one JSON result line on stdout
      const line = out.trim().split('\n').filter((l) => l.trim().startsWith('{')).pop()
      try { resolve(JSON.parse(line)) } catch { resolve({ driver, scenario, error: 'no result: ' + (err || out).slice(0, 200) }) }
    })
  })
}
function resolve_cwd() { return resolve(here, '..') }

// bounded-concurrency pool
async function pool(jobs, n, worker) {
  const results = []
  let i = 0
  const runners = Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (i < jobs.length) { const idx = i++; results[idx] = await worker(jobs[idx], idx) }
  })
  await Promise.all(runners)
  return results
}

async function main() {
  const jobs = []
  for (const s of SCENARIOS) for (const d of DRIVERS) for (let r = 0; r < REPS; r++) jobs.push({ driver: d, scenario: s, rep: r })

  console.error(`running ${jobs.length} jobs (${SCENARIOS.length} scenarios × ${DRIVERS.length} drivers × ${REPS} reps), concurrency ${CONC}…`)
  const t0 = Date.now()
  const raw = await pool(jobs, CONC, async (j) => {
    const sid = `tt-${j.driver}-${j.scenario}-r${j.rep}`
    const res = await runOne(j.driver, j.scenario, sid)
    console.error(`  done ${sid}: completed=${res.completed} obs=${res.observationTokens} rounds=${res.rounds}${res.error ? ' ERR:' + res.error : ''}`)
    return { ...j, ...res }
  })

  // aggregate per (scenario, driver). Only count COMPLETED reps for token means (an uncompleted run
  // read fewer tokens because it gave up, not because it was efficient — including it is misleading).
  const agg = {}
  for (const s of SCENARIOS) for (const d of DRIVERS) {
    const all = raw.filter((x) => x.scenario === s && x.driver === d && !x.error)
    const done = all.filter((x) => x.completed)
    const mean = (rows, k) => rows.length ? Math.round(rows.reduce((a, x) => a + (x[k] || 0), 0) / rows.length) : null
    agg[`${s}|${d}`] = {
      n: all.length, nDone: done.length,
      passRate: all.length ? Math.round((done.length / all.length) * 100) : null,
      observationTokens: mean(done, 'observationTokens'), commandTokens: mean(done, 'commandTokens'),
      totalTokens: mean(done, 'totalTokens'), rounds: mean(done, 'rounds'), wander: mean(done, 'wander'), elapsed: mean(done, 'elapsed'),
    }
  }

  // report — PRIMARY metric is observationTokens (driver-attributable browser-read tokens)
  const padl = (s, n) => String(s).padStart(n)
  console.log('\n  SCENARIO observation-token cost (gpt-5.5, ONE codex session/scenario, mean of COMPLETED reps)')
  console.log('  observationTokens = Σ tokens of every browser-CLI output the agent reads (NOT codex billed total)\n')
  console.log(`    ${'scenario'.padEnd(22)} ${'driver'.padEnd(8)} ${padl('pass%', 6)} ${padl('OBS tok', 9)} ${padl('rounds', 7)} ${padl('cmd tok', 8)} ${padl('codex-billed', 12)}`)
  for (const s of SCENARIOS) {
    for (const d of DRIVERS) {
      const a = agg[`${s}|${d}`]
      console.log(`    ${s.padEnd(22)} ${d.padEnd(8)} ${padl((a.passRate ?? '—') + '%', 6)} ${padl(a.observationTokens ?? '—', 9)} ${padl(a.rounds ?? '—', 7)} ${padl(a.commandTokens ?? '—', 8)} ${padl(a.totalTokens ?? '—', 12)}`)
    }
    const ag = agg[`${s}|agrune`], pw = agg[`${s}|pwcli`]
    if (ag?.observationTokens && pw?.observationTokens) {
      const diff = Math.round((1 - ag.observationTokens / pw.observationTokens) * 1000) / 10
      console.log(`    ${'  → agrune vs pwcli OBSERVATION tokens:'.padEnd(38)} ${diff >= 0 ? '−' : '+'}${Math.abs(diff)}% (${ag.observationTokens} vs ${pw.observationTokens})`)
    } else {
      console.log(`    ${'  → (need both drivers to complete ≥1 rep for a token comparison)'}`)
    }
    console.log()
  }

  const outDir = join(here, 'results'); mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'scenario-tokens.json'), JSON.stringify({ model: 'gpt-5.5', reps: REPS, raw, agg }, null, 2) + '\n')
  console.error(`wrote ${join(outDir, 'scenario-tokens.json')} (${Math.round((Date.now() - t0) / 1000)}s)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
