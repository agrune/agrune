const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')

const pkg = require('../package.json')

test('agrune package runs the MCP server directly', () => {
  assert.equal(pkg.bin, './vendor/mcp-dist/bin/agrune-mcp.js')
  assert.equal(pkg.type, 'commonjs')
})

test('agrune package bin prints MCP server help', () => {
  const packageRoot = path.resolve(__dirname, '..')
  const binPath = path.resolve(packageRoot, pkg.bin)
  const output = execFileSync(binPath, ['--help'], {
    cwd: packageRoot,
    encoding: 'utf8',
    timeout: 15_000,
  })

  assert.match(output, /Usage:\n  agrune \[options\]/)
  assert.match(output, /--headless/)
  assert.match(output, /--attach <endpoint>/)
})

test('agrune package does not publish installer or skill assets', () => {
  assert.deepEqual(pkg.files, [
    'vendor',
    'README.md',
  ])
  assert.equal(pkg.scripts.build.includes('bin/install.js'), false)
})
