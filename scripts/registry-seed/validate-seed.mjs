#!/usr/bin/env node
/**
 * registry-seed schema validator + index.json regenerator.
 *
 * Phase 18 Plan 03 — Task 3.
 *
 * Usage:
 *   node scripts/registry-seed/validate-seed.mjs              # validate only
 *   node scripts/registry-seed/validate-seed.mjs --fix-index  # + rewrite index.json
 *
 * Contract:
 *   - Globs registry-seed/manifests/*.json
 *   - Parses each with RegistryEntrySchema.parse (imported from @agrune/registry)
 *   - Exit 1 on any failure; prints path + zod issues to stderr
 *   - Exit 0 on all-pass; prints "N/N seed manifests valid" to stdout
 *   - With --fix-index: overwrites registry-seed/index.json with
 *     { version, generatedAt, generatedBy, entries[] } where each entry has
 *     host/versions/tier/path/contentHash (sha256:...)
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RegistryEntrySchema, contentHash } from '@agrune/registry'

const SEED_DIR = 'registry-seed/manifests'
const INDEX_PATH = 'registry-seed/index.json'
const fixIndex = process.argv.includes('--fix-index')

const files = readdirSync(SEED_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

const results = []
let failed = 0

for (const name of files) {
  const full = join(SEED_DIR, name)
  try {
    const raw = JSON.parse(readFileSync(full, 'utf8'))
    const entry = RegistryEntrySchema.parse(raw)
    const hash = contentHash(entry.manifest)
    results.push({
      host: entry.registry.host,
      versions: [entry.registry.version],
      tier: entry.registry.tier,
      path: `manifests/${name}`,
      contentHash: hash,
    })
    process.stdout.write(`  ok  ${name}\n`)
  } catch (err) {
    failed++
    process.stderr.write(`  FAIL ${name}: ${err?.message ?? err}\n`)
    if (err && Array.isArray(err.issues)) {
      for (const issue of err.issues) {
        const path = Array.isArray(issue.path) ? issue.path.join('.') : ''
        process.stderr.write(`       ${path}: ${issue.message}\n`)
      }
    }
  }
}

if (failed > 0) {
  process.stderr.write(`\n${failed}/${files.length} failed\n`)
  process.exit(1)
}

process.stdout.write(`\n${results.length}/${files.length} seed manifests valid\n`)

if (fixIndex) {
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/registry-seed/validate-seed.mjs',
    entries: results.sort((a, b) => a.host.localeCompare(b.host)),
  }
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')
  process.stdout.write(`wrote ${INDEX_PATH}\n`)
}
