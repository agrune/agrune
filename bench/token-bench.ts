// Token micro-bench (M3 EVAL gate). Measures cl100k_base tokens of the agent-facing
// serializer on a 정부24-class portal: raw a11y (full tree) vs agrune outline vs
// outline + expand-one-group. The outline-first reduction is the differentiator (§1, §4.3).
//
//   npx tsx bench/token-bench.ts
//
// Writes bench/results/token-bench.json for regression tracking. Exits non-zero if the
// outline does NOT achieve a large reduction vs raw a11y (the regression rule).

import { chromium } from 'playwright'
import { encode } from 'gpt-tokenizer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSnapshotFromManifest, createSnapshotStore, formatSnapshot } from '../src/snapshot.js'
import { loadManifestFromPage } from '../src/resolver.js'
import { portalHtml, portalManifest } from './portal-fixture.js'

const here = dirname(fileURLToPath(import.meta.url))

function tok(text: string): number {
  return encode(text).length
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
  await page.setContent(portalHtml)
  await page.evaluate((m) => {
    ;(window as unknown as { __agrune_manifest__: unknown }).__agrune_manifest__ = m
  }, portalManifest)

  // 1) raw a11y full tree (what an a11y-driven CLI dumps).
  const rawA11y = await page.locator('body').ariaSnapshot()

  // 2) agrune manifest outline (the cheap default).
  const manifest = await loadManifestFromPage(page)
  const snapshot = await buildSnapshotFromManifest(page, manifest, createSnapshotStore())
  const outline = formatSnapshot(snapshot)

  // 3) outline + expand one group (the working set after the agent drills in).
  const expanded = formatSnapshot(snapshot, { groupId: 'applicant' })
  const workingSet = `${outline}\n${expanded}`

  const rows = [
    { view: 'raw a11y (full)', tokens: tok(rawA11y) },
    { view: 'agrune outline (groups + counts)', tokens: tok(outline) },
    { view: 'outline + expand one group', tokens: tok(workingSet) },
  ]
  const rawTokens = rows[0]!.tokens
  const outlineTokens = rows[1]!.tokens
  const reductionPct = Math.round((1 - outlineTokens / rawTokens) * 1000) / 10

  console.log('\n  agrune token micro-bench (cl100k_base) — 정부24-class portal\n')
  for (const r of rows) {
    const vs = r.tokens === rawTokens ? '—' : `${Math.round((1 - r.tokens / rawTokens) * 1000) / 10}%`
    console.log(`    ${r.view.padEnd(36)} ${String(r.tokens).padStart(7)}   ${vs}`)
  }
  console.log(`\n  outline reduction vs raw a11y: ${reductionPct}%`)

  const result = {
    page: '정부24-class synthetic portal',
    tokenizer: 'cl100k_base',
    rawA11yTokens: rawTokens,
    outlineTokens,
    workingSetTokens: rows[2]!.tokens,
    reductionPct,
    groups: snapshot.groups.length,
    targets: snapshot.targets.length,
  }
  const outDir = join(here, 'results')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'token-bench.json'), `${JSON.stringify(result, null, 2)}\n`)

  await browser.close()

  // Regression rule: the outline MUST be a small fraction of raw a11y (the §1 reduction).
  if (outlineTokens >= rawTokens * 0.25) {
    console.error(
      `\n  REGRESSION: outline (${outlineTokens} tok) is not << raw a11y (${rawTokens} tok). ` +
        `Diff the serializer vs the A.7 golden.\n`,
    )
    process.exit(1)
  }
  console.log('  EVAL gate OK — outline-first disclosure achieves the expected reduction.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
