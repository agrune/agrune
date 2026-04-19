#!/usr/bin/env node
// registry-seed/.github/scripts/health-check.mjs
//
// Weekly selector health check. Runs on Monday 06:00 UTC via
// `.github/workflows/health-check.yml`. For each manifest in manifests/*.json
// this script:
//
//   1. Loads a headless Chromium page at `registry.seedUrl`.
//   2. For up to 3 sample targets per manifest (to minimise load on external
//      sites — see RESEARCH T-18-27), probes whether the first selector in
//      the ladder resolves any element. Probe = SNAPSHOT ONLY. No click, no
//      fill, no type, no press — guaranteed by grep assertion in Task 5 gate.
//   3. Updates `.github/health-state.json` with consecutiveFails counter.
//   4. Opens a single `stale manifests` issue (2-strike rule) if any manifest
//      has failed 2+ consecutive weeks. PR opening to insert
//      `registry.staleSince` is deferred to v0.6+.
//
// Environment variables:
//   GITHUB_TOKEN         required for issue creation
//   GITHUB_REPOSITORY    "owner/repo"

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as core from '@actions/core'
import { Octokit } from '@octokit/rest'
import { chromium } from 'playwright'

const STATE_FILE = '.github/health-state.json'
const MANIFEST_DIR = 'manifests'
const SAMPLE_SIZE = 3
const NAV_TIMEOUT_MS = 15_000
const USER_AGENT = 'agrune-health-check/0.5 (+https://github.com/agrune/agrune)'

function loadState() {
  if (!existsSync(STATE_FILE)) return {}
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch (err) {
    core.warning(`health-state.json malformed, starting fresh: ${err.message}`)
    return {}
  }
}

function collectSampleTargets(entry) {
  const targets = []
  for (const g of entry?.manifest?.groups ?? []) {
    for (const t of g.targets ?? []) {
      targets.push({ groupId: g.groupId, targetId: t.targetId, selector: t.selector })
      if (targets.length >= SAMPLE_SIZE) return targets
    }
    for (const r of g.repeats ?? []) {
      for (const t of r.targets ?? []) {
        targets.push({
          groupId: g.groupId,
          repeatId: r.repeatId,
          targetId: t.targetId,
          selector: t.selector,
        })
        if (targets.length >= SAMPLE_SIZE) return targets
      }
    }
  }
  return targets
}

/**
 * Probe a single selector ladder entry for presence. Snapshot-only —
 * never clicks or fills. Walks the ladder in the published priority order
 * (role > text > testId > attr > css) and returns the first hit.
 */
async function probeSelector(page, selector) {
  if (selector?.role) {
    const loc = page.getByRole(selector.role.name, {})
    const count = await loc.count().catch(() => 0)
    if (count > 0) return { kind: 'role', name: selector.role.name, count }
  }
  if (selector?.text) {
    const loc = page.getByText(selector.text, { exact: false })
    const count = await loc.count().catch(() => 0)
    if (count > 0) return { kind: 'text', text: selector.text, count }
  }
  if (selector?.testId) {
    const loc = page.getByTestId(selector.testId)
    const count = await loc.count().catch(() => 0)
    if (count > 0) return { kind: 'testId', testId: selector.testId, count }
  }
  if (selector?.attr) {
    const loc = page.locator(`[${selector.attr}]`)
    const count = await loc.count().catch(() => 0)
    if (count > 0) return { kind: 'attr', attr: selector.attr, count }
  }
  if (selector?.css) {
    const loc = page.locator(selector.css)
    const count = await loc.count().catch(() => 0)
    if (count > 0) return { kind: 'css', css: selector.css, count }
  }
  return null
}

async function main() {
  const state = loadState()
  const files = readdirSync(MANIFEST_DIR)
    .filter((n) => n.endsWith('.json'))
    .sort()

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: USER_AGENT })
  const page = await context.newPage()

  const fails = []
  const timestamp = new Date().toISOString()

  for (const name of files) {
    const rel = join(MANIFEST_DIR, name)
    let entry
    try {
      entry = JSON.parse(readFileSync(rel, 'utf-8'))
    } catch (err) {
      core.warning(`[${name}] cannot parse manifest: ${err.message}`)
      continue
    }
    const seedUrl = entry?.registry?.seedUrl
    if (!seedUrl) {
      core.notice(`[${name}] no seedUrl, skipping health check`)
      continue
    }

    let resolved = 0
    let attempted = 0
    try {
      await page.goto(seedUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
      const sample = collectSampleTargets(entry)
      for (const t of sample) {
        attempted++
        const hit = await probeSelector(page, t.selector)
        if (hit) resolved++
      }
    } catch (err) {
      core.notice(`[${name}] navigation failed: ${err.message}`)
    }

    const key = name
    state[key] ??= { consecutiveFails: 0, lastCheckedAt: null, lastResolved: null, lastAttempted: null }
    state[key].lastCheckedAt = timestamp
    state[key].lastResolved = resolved
    state[key].lastAttempted = attempted
    const ok = attempted > 0 && resolved > 0
    if (ok) {
      state[key].consecutiveFails = 0
      core.notice(`[${name}] OK — ${resolved}/${attempted} selector(s) resolved`)
    } else {
      state[key].consecutiveFails = (state[key].consecutiveFails ?? 0) + 1
      fails.push({ name, consecutive: state[key].consecutiveFails, attempted })
      core.notice(`[${name}] FAIL — ${resolved}/${attempted} (consecutive=${state[key].consecutiveFails})`)
    }
  }

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
  await browser.close()

  // Two-strike rule — only escalate at consecutive=2+
  const twoWeekFails = fails.filter((f) => f.consecutive >= 2)
  if (twoWeekFails.length > 0) {
    const token = process.env.GITHUB_TOKEN
    const slug = process.env.GITHUB_REPOSITORY
    if (!token || !slug) {
      core.warning(
        `${twoWeekFails.length} manifest(s) hit 2+ consecutive weeks but GITHUB_TOKEN/GITHUB_REPOSITORY missing — skipping issue creation`,
      )
    } else {
      const [owner, repo] = slug.split('/')
      const octokit = new Octokit({ auth: token })
      const body =
        `Weekly health check (${timestamp}) detected ${twoWeekFails.length} stale manifest(s):\n\n` +
        twoWeekFails
          .map((f) => `- \`${f.name}\` — ${f.consecutive} consecutive weeks`)
          .join('\n') +
        '\n\nNext step (maintainer): open a PR adding `registry.staleSince` to each entry, or investigate selector drift.'
      try {
        await octokit.issues.create({
          owner,
          repo,
          title: `[health-check] ${twoWeekFails.length} stale manifest(s) — ${timestamp.slice(0, 10)}`,
          body,
          labels: ['stale'],
        })
        core.notice(`opened stale-manifests issue (${twoWeekFails.length} entries)`)
      } catch (err) {
        core.warning(`failed to open stale issue: ${err.message}`)
      }
    }
  }

  core.setOutput('failed_count', String(fails.length))
  core.setOutput('stale_count', String(twoWeekFails.length))
  return 0
}

const code = await main()
process.exit(code)
