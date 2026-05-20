const fs = require('node:fs')
const path = require('node:path')

const cliRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(cliRoot, '..', '..')
const source = path.join(repoRoot, 'packages', 'mcp', 'dist')
const dest = path.join(cliRoot, 'vendor', 'mcp-dist')

if (!fs.existsSync(source)) {
  throw new Error(`MCP dist not found at ${source}. Run pnpm --filter agrune run build from the repo root.`)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.cpSync(source, dest, { recursive: true })
fs.rmSync(path.join(dest, 'src'), { recursive: true, force: true })
removeGeneratedDeclarations(dest)
fs.writeFileSync(
  path.join(dest, 'package.json'),
  `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`,
)
process.stdout.write(`[agrune] copied MCP dist to ${dest}\n`)

function removeGeneratedDeclarations(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      removeGeneratedDeclarations(fullPath)
      continue
    }
    if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.map')) {
      fs.rmSync(fullPath, { force: true })
    }
  }
}
