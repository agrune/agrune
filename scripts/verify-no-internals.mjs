#!/usr/bin/env node
// verify:no-internals — HARD invariant gate (SPEC §2.4).
//
// agrune MUST use ONLY the published `playwright` API. Importing anything under
// `playwright-core/lib/**` or `playwright/lib/**` is forbidden (those paths are unversioned
// and reshuffle between minors). This script greps src/ + bin/ and fails on any match.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const SCAN_DIRS = ['src', 'bin']
const SCAN_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'])

// Forbidden: deep imports into Playwright internals. We match the `lib/` path segment of
// either package, in a string literal (import / require / dynamic import).
const FORBIDDEN = [
  /playwright-core\/lib\//,
  /\bplaywright\/lib\//,
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (SCAN_EXT.has(extname(name))) out.push(full)
  }
  return out
}

const violations = []
for (const d of SCAN_DIRS) {
  let files
  try {
    files = walk(join(root, d))
  } catch {
    continue // dir may not exist yet
  }
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      for (const re of FORBIDDEN) {
        if (re.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      }
    })
  }
}

if (violations.length > 0) {
  console.error('verify:no-internals FAILED — Playwright internal imports are forbidden:')
  for (const v of violations) console.error(`  ${v}`)
  console.error('\nUse only the published `playwright` API (SPEC §2.4).')
  process.exit(1)
}

console.log('verify:no-internals OK — no Playwright internal imports found.')
