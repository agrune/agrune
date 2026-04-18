#!/usr/bin/env node
// Thin CLI wrapper — uses the compiled dist so it works without tsx.
// Walks given paths, globs for .tsx/.jsx/.html, reports diagnostics, exits 1 on error.

import { promises as fs } from 'node:fs'
import { resolve, join, relative, extname, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = process.cwd()
const args = process.argv.slice(2)
const targets = args.length > 0 ? args : ['.']

const IGNORE = new Set(['node_modules', 'dist', '.git', '.turbo', '.next', '__fixtures__'])
const EXTENSIONS = new Set(['.tsx', '.jsx', '.html'])

async function* walk(dir) {
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) }
  catch { return }
  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && EXTENSIONS.has(extname(entry.name))) {
      yield full
    }
  }
}

async function main() {
  // Ensure dist exists
  const distUrl = pathToFileURL(resolve(__dirname, '..', 'dist', 'annotation-lint.js')).href
  let mod
  try {
    mod = await import(distUrl)
  } catch (err) {
    console.error('agrune-lint: dist/annotation-lint.js not found. Run `pnpm --filter @agrune/core build` first.')
    console.error(String(err))
    process.exit(2)
  }

  const { scanFile, formatDiagnostic } = mod

  const files = []
  for (const t of targets) {
    const abs = resolve(ROOT, t)
    const stat = await fs.stat(abs).catch(() => null)
    if (!stat) continue
    if (stat.isDirectory()) {
      for await (const f of walk(abs)) files.push(f)
    } else if (EXTENSIONS.has(extname(abs))) {
      files.push(abs)
    }
  }

  let errorCount = 0
  let warningCount = 0
  const fileCount = files.length

  for (const file of files) {
    const diags = await scanFile(file)
    for (const d of diags) {
      const rel = relative(ROOT, d.file)
      console.error(formatDiagnostic({ ...d, file: rel }))
      if (d.severity === 'error') errorCount += 1
      else warningCount += 1
    }
  }

  console.log(`\nFound ${errorCount} error${errorCount === 1 ? '' : 's'} (${warningCount} warning${warningCount === 1 ? '' : 's'}) in ${fileCount} files.`)

  process.exit(errorCount > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(2) })
