#!/usr/bin/env node
// registry-seed/.github/scripts/pr-bot.mjs
//
// Analyzes a PR that touches manifests/** and attaches appropriate labels:
//
//   requires-human-review:sensitive   — any sensitive:true field removed or
//                                       flipped to false (Pitfall 8)
//   tier-escalation                   — community → verified change
//   schema-fail                       — community + prod env, seedUrl private,
//                                       seedUrl non-https
//   velocity:holddown                 — new author (< 3 merged PRs) with a
//                                       recent PR within 30 days, not on the
//                                       maintainer allow-list
//
// The bot only attaches labels. Merge blocking is handled by repo branch
// protection rules — keeping this script label-only makes `pull_request_target`
// usage safe even with fork PRs (T-18-26 mitigation: issues/pull-requests:write
// scope is sufficient, and there is no file write back to the repo).
//
// Environment variables:
//   GITHUB_TOKEN          required — repo-scoped GITHUB_TOKEN provided by Actions
//   GITHUB_REPOSITORY     "owner/repo" (auto-populated by Actions)
//   PR_NUMBER             PR number (github.event.pull_request.number)
//   PR_AUTHOR             PR author login (github.event.pull_request.user.login)

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import * as core from '@actions/core'
import { Octokit } from '@octokit/rest'

const token = process.env.GITHUB_TOKEN
const slug = process.env.GITHUB_REPOSITORY
const prNumber = Number(process.env.PR_NUMBER || 0)
const prAuthor = process.env.PR_AUTHOR || ''

if (!token || !slug || !prNumber || !prAuthor) {
  core.setFailed('Missing required env: GITHUB_TOKEN / GITHUB_REPOSITORY / PR_NUMBER / PR_AUTHOR')
  process.exit(1)
}

const [owner, repo] = slug.split('/')
const octokit = new Octokit({ auth: token })
const labels = new Set()

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a Map<targetId, true> of all sensitive:true target ids, traversing
 * both `manifest.groups[].targets` and `manifest.groups[].repeats[].targets`.
 * macroSteps with sensitive:true are also accumulated under a synthetic
 * "macro:<macroId>:<stepIdx>" key so that removal of a macro sensitive step
 * still triggers the review label.
 */
function collectSensitiveMap(entry) {
  const map = new Map()
  if (!entry) return map
  for (const g of entry?.manifest?.groups ?? []) {
    for (const t of g.targets ?? []) {
      if (t.sensitive === true) map.set(`${g.groupId}:${t.targetId}`, true)
    }
    for (const r of g.repeats ?? []) {
      for (const t of r.targets ?? []) {
        if (t.sensitive === true) {
          map.set(`${g.groupId}:${r.repeatId}:${t.targetId}`, true)
        }
      }
    }
  }
  for (const [idx, step] of (entry?.manifest?.macros ?? []).flatMap((m) =>
    (m.steps ?? []).map((s, i) => [i, { ...s, macroId: m.macroId }]),
  )) {
    if (step.sensitive === true) {
      map.set(`macro:${step.macroId}:${idx}`, true)
    }
  }
  return map
}

function readBeforeJson(relPath) {
  try {
    const raw = execSync(`git show origin/main:${relPath}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readAfterJson(relPath) {
  try {
    return JSON.parse(readFileSync(relPath, 'utf-8'))
  } catch (err) {
    core.warning(`[${relPath}] failed to parse after-state: ${err.message}`)
    return null
  }
}

function isPrivateHost(hostname) {
  if (!hostname) return true
  if (hostname === 'localhost') return true
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return true
  if (/^10\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
  if (/^127\./.test(hostname)) return true
  return false
}

function readMaintainers() {
  try {
    const raw = readFileSync('maintainers.json', 'utf-8')
    const parsed = JSON.parse(raw)
    return new Set(parsed.maintainers ?? [])
  } catch {
    return new Set()
  }
}

// ─── Main analysis ──────────────────────────────────────────────────────────

async function main() {
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  })
  const manifestFiles = files.filter(
    (f) => f.filename.startsWith('manifests/') && f.filename.endsWith('.json'),
  )
  if (manifestFiles.length === 0) {
    core.notice('PR does not touch manifests/** — nothing to analyze')
    return 0
  }

  // 1. Sensitive-diff + tier + env + seedUrl checks per manifest file
  for (const f of manifestFiles) {
    if (f.status === 'removed') {
      // Removal of an entire manifest is itself a maintainer decision
      labels.add('requires-human-review:sensitive')
      core.notice(`[${f.filename}] entry removed — flagged for maintainer review`)
      continue
    }
    const before = readBeforeJson(f.filename)
    const after = readAfterJson(f.filename)
    if (!after) {
      labels.add('schema-fail')
      continue
    }

    const beforeSensitive = collectSensitiveMap(before)
    const afterSensitive = collectSensitiveMap(after)

    // Pitfall 8 — sensitive:true removed or flipped to false
    for (const [key] of beforeSensitive) {
      if (!afterSensitive.has(key)) {
        labels.add('requires-human-review:sensitive')
        core.notice(`[${f.filename}] sensitive:true removed/downgraded on ${key}`, {
          file: f.filename,
        })
      }
    }

    // Pitfall 7 — community tier + prod env → schema-fail (defense-in-depth)
    const tier = after?.registry?.tier
    const envs = after?.registry?.allowedEnvironments ?? []
    if (tier && tier !== 'verified' && envs.includes('prod')) {
      labels.add('schema-fail')
      core.notice(`[${f.filename}] tier='${tier}' cannot allow 'prod' env`)
    }

    // Tier escalation
    if (
      before?.registry?.tier === 'community' &&
      after?.registry?.tier === 'verified'
    ) {
      labels.add('tier-escalation')
      core.notice(`[${f.filename}] tier escalated community → verified`)
    }

    // Pitfall 4 — seedUrl privacy / non-https
    const seedUrl = after?.registry?.seedUrl
    if (seedUrl) {
      try {
        const parsed = new URL(seedUrl)
        if (parsed.protocol !== 'https:') {
          labels.add('schema-fail')
          core.notice(`[${f.filename}] seedUrl is non-HTTPS: ${seedUrl}`)
        } else if (isPrivateHost(parsed.hostname)) {
          labels.add('schema-fail')
          core.notice(`[${f.filename}] seedUrl resolves to private/local host: ${seedUrl}`)
        }
      } catch {
        labels.add('schema-fail')
        core.notice(`[${f.filename}] seedUrl is not a valid URL: ${seedUrl}`)
      }
    }
  }

  // 2. Velocity check — new author, recent PR, not maintainer
  const maintainers = readMaintainers()
  if (!maintainers.has(prAuthor)) {
    try {
      const { data: authorPrs } = await octokit.search.issuesAndPullRequests({
        q: `repo:${owner}/${repo} author:${prAuthor} is:pr`,
        per_page: 20,
      })
      const merged = authorPrs.items.filter((p) => p.pull_request?.merged_at)
      if (merged.length < 3) {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
        const recentlyMergedOrOpen = authorPrs.items.filter((p) => {
          const ts = new Date(p.updated_at ?? p.created_at).getTime()
          return ts > cutoff && p.number !== prNumber
        })
        if (recentlyMergedOrOpen.length > 0) {
          labels.add('velocity:holddown')
          core.notice(
            `author ${prAuthor} has ${merged.length} merged PR(s) (< 3) and ${recentlyMergedOrOpen.length} recent activity within 30d — velocity holddown`,
          )
        }
      }
    } catch (err) {
      core.warning(`velocity check skipped: ${err.message}`)
    }
  }

  // 3. Apply labels
  if (labels.size > 0) {
    const labelArr = [...labels]
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: labelArr,
    })
    core.setOutput('labels', labelArr.join(','))
    core.notice(`labels applied: ${labelArr.join(', ')}`)
  } else {
    core.setOutput('labels', '')
    core.notice('no labels to apply')
  }
  return 0
}

const code = await main()
process.exit(code)
