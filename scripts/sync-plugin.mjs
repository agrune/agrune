import { execSync } from 'node:child_process'
import { cpSync, rmSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const mcpDist = resolve(repoRoot, 'packages/mcp-server/dist')
const pluginMcp = resolve(repoRoot, '../skills/mcp-server')

// 1. Build MCP server
console.log('Building MCP server...')
execSync('pnpm --filter @agrune/mcp-server run build', {
  cwd: repoRoot,
  stdio: 'inherit',
})

// 2. Clean and copy
if (existsSync(pluginMcp)) {
  rmSync(pluginMcp, { recursive: true })
}
cpSync(mcpDist, pluginMcp, { recursive: true })

console.log(`Synced MCP server to ${pluginMcp}`)
