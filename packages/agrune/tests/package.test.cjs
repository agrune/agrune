const assert = require('node:assert/strict')
const test = require('node:test')

const pkg = require('../package.json')

test('agrune package runs the MCP server directly', () => {
  assert.equal(pkg.bin, './vendor/mcp-dist/bin/agrune-mcp.js')
  assert.equal(pkg.type, 'commonjs')
})

test('agrune package does not publish installer or skill assets', () => {
  assert.deepEqual(pkg.files, [
    'vendor',
    'README.md',
  ])
  assert.equal(pkg.scripts.build.includes('bin/install.js'), false)
})
