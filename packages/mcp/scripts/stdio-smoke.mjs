#!/usr/bin/env node
// Minimal MCP stdio smoke: initialize → tools/list → navigate → get_targets → click.
// Exercises the published bin path (vendor copy uses the same dist).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bin = join(here, '..', 'dist', 'bin', 'agrune-mcp.js')

const manifest = {
  version: 3,
  groups: [{
    groupId: 'main',
    targets: [{ targetId: 'btn', name: 'Go', desc: 'main button', actionKinds: ['click'], selector: { css: '#b1' } }],
  }],
}
const html = `<!doctype html><body><button id="b1" onclick="this.textContent='clicked'">go</button><script>window.__agrune_manifest__ = ${JSON.stringify(manifest)}</script></body>`
const url = `data:text/html,${encodeURIComponent(html)}`

const child = spawn(process.execPath, [bin, '--headless', '--isolated'], {
  stdio: ['pipe', 'pipe', 'inherit'],
})

let nextId = 1
const pending = new Map()
let buffer = ''

child.stdout.on('data', chunk => {
  buffer += chunk.toString()
  let index
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (!line) continue
    const message = JSON.parse(line)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  }
})

function request(method, params) {
  const id = nextId++
  const message = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }
  child.stdin.write(`${JSON.stringify(message)}\n`)
  return new Promise((resolvePromise, reject) => {
    pending.set(id, resolvePromise)
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 30_000)
  })
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) })}\n`)
}

function fail(message) {
  console.error(`[stdio-smoke] FAIL: ${message}`)
  child.kill('SIGTERM')
  process.exit(1)
}

const init = await request('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'stdio-smoke', version: '0.0.0' },
})
if (!init.result?.serverInfo?.name) fail('initialize failed')
notify('notifications/initialized')

const tools = await request('tools/list', {})
const toolNames = tools.result?.tools?.map(tool => tool.name) ?? []
if (toolNames.length !== 34) fail(`expected 34 tools, got ${toolNames.length}`)
if (!toolNames.includes('browser_get_targets')) fail('browser_get_targets missing')

const nav = await request('tools/call', { name: 'browser_navigate', arguments: { url } })
if (nav.result?.isError) fail(`navigate errored: ${JSON.stringify(nav.result)}`)

const targets = await request('tools/call', { name: 'browser_get_targets', arguments: { mode: 'full' } })
const targetsText = targets.result?.content?.[0]?.text ?? ''
if (!targetsText.includes('btn')) fail(`target ref missing in get_targets output: ${targetsText.slice(0, 300)}`)

const click = await request('tools/call', { name: 'browser_click', arguments: { target: 'btn' } })
const clickText = click.result?.content?.[0]?.text ?? ''
if (click.result?.isError || !clickText.includes('"ok": true')) fail(`click failed: ${clickText.slice(0, 300)}`)
if (!clickText.includes('clicked')) fail(`refreshed snapshot missing clicked text: ${clickText.slice(0, 300)}`)

console.log('[stdio-smoke] OK — initialize, 34 tools, navigate, get_targets, click + snapshot refresh')
child.kill('SIGTERM')
process.exit(0)
