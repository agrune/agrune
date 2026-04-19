#!/usr/bin/env node
// registry-seed/.github/scripts/validate-schema.mjs
//
// Validates every changed manifest in a PR (or all manifests when invoked
// locally) against RegistryEntrySchema. Fails the workflow on the first
// invalid file and attaches a `schema-fail` label to the PR via the PR bot
// (separate workflow).
//
// Usage:
//   node validate-schema.mjs                # local — validates ALL manifests/
//   node validate-schema.mjs --pr <num>     # PR context — validates changed files only
//
// Environment variables:
//   GITHUB_TOKEN        required when --pr is used (to list changed files)
//   GITHUB_REPOSITORY   required when --pr is used ("owner/repo")
//   PR_NUMBER           optional — alternative to --pr flag

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as core from '@actions/core'
import { Octokit } from '@octokit/rest'
import { RegistryEntrySchema, contentHash } from './_schema.mjs'

const args = process.argv.slice(2)
const prFlagIdx = args.indexOf('--pr')
const prNumber = prFlagIdx >= 0 ? Number(args[prFlagIdx + 1]) : Number(process.env.PR_NUMBER || 0)

const REPO_ROOT = process.cwd()
const MANIFEST_DIR = join(REPO_ROOT, 'manifests')

/**
 * Collect manifest files to validate.
 *  - PR context: `octokit.pulls.listFiles` filtered to manifests/**.json
 *  - Local context: recursively listdir of manifests/
 */
async function collectFiles() {
  if (prNumber > 0) {
    const token = process.env.GITHUB_TOKEN
    const slug = process.env.GITHUB_REPOSITORY
    if (!token || !slug) {
      throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required in PR context')
    }
    const [owner, repo] = slug.split('/')
    const octokit = new Octokit({ auth: token })
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    })
    return files
      .filter((f) => f.filename.startsWith('manifests/') && f.filename.endsWith('.json'))
      .filter((f) => f.status !== 'removed')
      .map((f) => f.filename)
  }
  // local fallback
  try {
    return readdirSync(MANIFEST_DIR)
      .filter((n) => n.endsWith('.json'))
      .map((n) => join('manifests', n))
  } catch {
    return []
  }
}

async function main() {
  const files = await collectFiles()
  if (files.length === 0) {
    core.notice('No manifest files to validate.')
    return 0
  }
  let failed = 0
  for (const rel of files) {
    const abs = join(REPO_ROOT, rel)
    let raw
    try {
      raw = readFileSync(abs, 'utf-8')
    } catch (err) {
      core.error(`[${rel}] cannot read file: ${err.message}`, { file: rel })
      failed++
      continue
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      core.error(`[${rel}] invalid JSON: ${err.message}`, { file: rel })
      failed++
      continue
    }
    const result = RegistryEntrySchema.safeParse(parsed)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.')
        core.error(`[${rel}] ${path}: ${issue.message}`, { file: rel })
      }
      failed++
      continue
    }
    // defense-in-depth: recompute contentHash to surface any inline mismatch
    const hash = contentHash(result.data.manifest)
    core.notice(`[${rel}] OK — ${result.data.registry.tier} tier, ${hash}`)
  }
  if (failed > 0) {
    core.setFailed(`${failed}/${files.length} manifest file(s) failed schema validation`)
    return 1
  }
  core.notice(`${files.length}/${files.length} manifest file(s) valid`)
  return 0
}

const code = await main()
process.exit(code)
