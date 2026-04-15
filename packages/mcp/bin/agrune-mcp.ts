#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CdpDriver } from '@agrune/browser'
import { createMcpServer } from '../src/index.js'

const args = process.argv.slice(2)
const attachEndpoint = getArgValue('--attach')
const headless = args.includes('--headless')
const noDevtools = args.includes('--no-devtools')
const devtoolsPortArg = getArgValue('--port')
const startUrl = getArgValue('--url')

const driver = new CdpDriver({
  mode: attachEndpoint ? 'attach' : 'launch',
  ...(attachEndpoint ? { wsEndpoint: attachEndpoint } : {}),
  headless,
  startUrl,
})

const { server } = createMcpServer(driver)

// Connect MCP transport FIRST so MCP hosts don't time out during Chrome launch.
// When stdin is a TTY (user running directly from terminal), skip transport.
const isMcpHost = !process.stdin.isTTY
if (isMcpHost) {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// Always start DevTools server (it works even before Chrome connects — shows empty
// until sessions arrive). This lets users open the DevTools UI at any time to
// observe what the AI is doing, without needing to run agrune separately.
if (!noDevtools) {
  try {
    const { startDevtoolsServer } = await import('../src/devtools-server.js')
    const devtoolsPort = await startDevtoolsServer(driver, devtoolsPortArg ? Number(devtoolsPortArg) : 47654)
    const devtoolsUrl = `http://localhost:${devtoolsPort}/devtools`
    process.stderr.write(`[agrune] DevTools: ${devtoolsUrl}\n`)

    // Only auto-open the URL when running standalone (not under an MCP host)
    if (!isMcpHost) {
      const { exec } = await import('node:child_process')
      const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
      exec(`${openCmd} ${devtoolsUrl}`)
    }
  } catch (error) {
    process.stderr.write(`[agrune] devtools error: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

// Standalone mode: launch Chrome eagerly. MCP mode: Chrome launches lazily on
// first tool call via the tool handler's driver.connect() fallback.
if (!isMcpHost) {
  void driver.connect().catch((error) => {
    process.stderr.write(`[agrune] chrome launch error: ${error instanceof Error ? error.message : String(error)}\n`)
  })
  // Keep process alive
  setInterval(() => {}, 1 << 30)
}

const cleanup = async () => {
  await driver.disconnect().catch(() => {})
}

process.once('SIGINT', () => {
  void cleanup().finally(() => process.exit(0))
})
process.once('SIGTERM', () => {
  void cleanup().finally(() => process.exit(0))
})

function getArgValue(flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}
