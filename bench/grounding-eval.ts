// Live-model GROUNDING eval on the REAL PM demo (../demo), driven by a local ollama model
// (default gpt-oss:20b). Measures the north-star claim directly: can a small/cheap model pick
// the correct affordance, and at what token cost — agrune manifest vs raw a11y.
//
//   node demo-server (port 4178) must be running; then:  npx tsx bench/grounding-eval.ts
//
// This is NOT the recorded gpt-5.5 multi-round completion/wander baseline (that model is
// unavailable here). It is a single-shot grounding + token-cost measurement with the model
// that IS available. Results are written to bench/results/grounding-eval.json.

import { chromium } from 'playwright'
import { encode } from 'gpt-tokenizer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSnapshotFromManifest, createSnapshotStore, formatSnapshot } from '../src/snapshot.js'
import { loadManifestFromPage } from '../src/resolver.js'

const here = dirname(fileURLToPath(import.meta.url))
const DEMO_URL = process.env.AGRUNE_DEMO_URL ?? 'http://127.0.0.1:4178/'
const MODEL = process.env.AGRUNE_BENCH_MODEL ?? 'gpt-oss:20b'
const OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434/v1/chat/completions'

const tok = (text: string): number => encode(text).length

interface Task {
  goal: string
  expectedRef: string
  /** Distinctive accessible-name token the a11y answer should contain (visible tabs only). */
  a11yName?: string
}

// Navigation tabs are always visible (a11y + manifest both see them); members affordances are
// declared by the manifest even while hidden (a11y can't surface them) — the differentiator.
const TASKS: Task[] = [
  { goal: 'Open the kanban board', expectedRef: 'nav_board_tab', a11yName: 'Board' },
  { goal: 'Switch to the team members view', expectedRef: 'nav_members_tab', a11yName: 'Members' },
  { goal: 'Open the document viewer', expectedRef: 'nav_docs_tab', a11yName: 'Docs' },
  { goal: 'Go to the workflow editor', expectedRef: 'nav_workflow_tab', a11yName: 'Workflow' },
  { goal: 'Open the messenger to DM a teammate', expectedRef: 'nav_messenger_tab', a11yName: 'Messenger' },
  { goal: 'Search for a member by name', expectedRef: 'member_search_input' },
  { goal: 'Go to the next page of members', expectedRef: 'member_pagination_next' },
  { goal: 'Filter members by their role', expectedRef: 'member_role_filter_select' },
]

async function ask(system: string, user: string): Promise<{ text: string; promptTokens: number }> {
  const res = await fetch(OLLAMA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: false,
      temperature: 0,
      options: { num_predict: 64, temperature: 0 },
    }),
  })
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
  return { text: data.choices[0]?.message.content ?? '', promptTokens: tok(system) + tok(user) }
}

function extractRef(text: string): string {
  const m = text.match(/\[?ref=([a-zA-Z0-9_.[\]=-]+)\]?/) ?? text.match(/\b([a-z_]+(?:_[a-z]+)+)\b/)
  return (m?.[1] ?? text.trim()).replace(/[\].]+$/, '')
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
  await page.goto(DEMO_URL, { waitUntil: 'networkidle' })

  const manifest = await loadManifestFromPage(page)
  const snapshot = await buildSnapshotFromManifest(page, manifest, createSnapshotStore())
  const outline = formatSnapshot(snapshot)
  const fullManifest = `${outline}\n${formatSnapshot(snapshot, { full: true })}`
  const rawA11y = await page.locator('body').ariaSnapshot()

  const tokensManifest = tok(fullManifest)
  const tokensA11y = tok(rawA11y)

  const manifestSystem =
    'You drive a browser via agrune. You are given a list of actionable targets, each with a ' +
    '[ref=...] id. Reply with ONLY the single [ref=...] id of the target that accomplishes the goal. ' +
    'No prose.'
  const a11ySystem =
    'You drive a browser via an accessibility tree. Reply with ONLY the accessible NAME (the quoted ' +
    'label) of the single control that accomplishes the goal. No prose.'

  let manifestCorrect = 0
  let a11yCorrect = 0
  let a11yApplicable = 0
  const details: Array<Record<string, unknown>> = []

  for (const task of TASKS) {
    const m = await ask(manifestSystem, `Targets:\n${fullManifest}\n\nGoal: ${task.goal}\nAnswer:`)
    const gotRef = extractRef(m.text)
    const manifestHit = gotRef === task.expectedRef
    if (manifestHit) manifestCorrect++

    let a11yHit: boolean | null = null
    if (task.a11yName) {
      a11yApplicable++
      const a = await ask(a11ySystem, `Accessibility tree:\n${rawA11y}\n\nGoal: ${task.goal}\nAnswer:`)
      a11yHit = a.text.toLowerCase().includes(task.a11yName.toLowerCase())
      if (a11yHit) a11yCorrect++
    }

    details.push({ goal: task.goal, expectedRef: task.expectedRef, gotRef, manifestHit, a11yHit })
    console.log(
      `  ${manifestHit ? '✓' : '✗'} manifest  ${task.a11yName ? (a11yHit ? '✓' : '✗') + ' a11y' : '— a11y(hidden)'}  ${task.goal}`,
    )
  }

  await browser.close()

  const result = {
    model: MODEL,
    page: 'PM demo (../demo) @ ' + DEMO_URL,
    note:
      'Single-shot grounding + token cost with a LOCAL model. NOT the recorded gpt-5.5 ' +
      'multi-round completion/wander baseline (that model is unavailable in this environment).',
    tasks: TASKS.length,
    manifest: { correct: manifestCorrect, total: TASKS.length, contextTokens: tokensManifest },
    a11y: { correct: a11yCorrect, total: a11yApplicable, contextTokens: tokensA11y, note: 'hidden affordances not in a11y tree' },
    tokenReductionPct: Math.round((1 - tok(outline) / tokensA11y) * 1000) / 10,
    outlineTokens: tok(outline),
    details,
  }

  console.log(`\n  model: ${MODEL}`)
  console.log(`  manifest grounding: ${manifestCorrect}/${TASKS.length}   (context ${tokensManifest} tok)`)
  console.log(`  a11y grounding:     ${a11yCorrect}/${a11yApplicable} (visible only)   (context ${tokensA11y} tok)`)
  console.log(`  outline ${result.outlineTokens} tok vs raw a11y ${tokensA11y} tok → ${result.tokenReductionPct}% reduction\n`)

  const outDir = join(here, 'results')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'grounding-eval.json'), `${JSON.stringify(result, null, 2)}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
