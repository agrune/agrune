#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(scriptDir, '..')
const repoRoot = resolve(packageDir, '..', '..')
const mcpServerDistDir = join(repoRoot, 'packages', 'mcp-server', 'dist')
const cliAssetsDir = join(packageDir, 'assets')
const cliMcpAssetsDir = join(cliAssetsDir, 'mcp-server')

runPnpm(repoRoot, [
  '--filter', '@agrune/core',
  '--filter', '@agrune/build-core',
  '--filter', '@agrune/mcp-server',
  'run',
  'build',
])

if (!existsSync(mcpServerDistDir)) {
  throw new Error(`mcp-server dist not found: ${mcpServerDistDir}`)
}

rmSync(cliMcpAssetsDir, { recursive: true, force: true })
cpSync(mcpServerDistDir, cliMcpAssetsDir, { recursive: true })

runPnpm(packageDir, ['run', 'build'])

function runPnpm(cwd, args) {
  execFileSync('pnpm', args, {
    cwd,
    stdio: 'inherit',
  })
}
