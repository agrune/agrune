#!/usr/bin/env node
import { createServer as createNetServer, connect as netConnect } from 'node:net'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const WEBCLI_HOME = join(homedir(), '.webcli-dom')
const PORT_FILE = join(WEBCLI_HOME, 'port')

if (args[0] === 'install') {
  const { runInstall } = await import('../src/install.js')
  const extensionIdArg = args.find(a => a.startsWith('--extension-id='))
  const extensionId = extensionIdArg?.split('=')[1]
  await runInstall({ extensionId })
  process.exit(0)
}

if (args[0] === '--native-host') {
  // ============================================================
  // Mode: Native Messaging Host (launched by Chrome)
  // Reads Native Messaging from stdin, forwards to MCP server via TCP
  // ============================================================
  const { createNativeMessagingTransport } = await import('../src/native-messaging.js')
  const nativeTransport = createNativeMessagingTransport(process.stdin, process.stdout)

  // Read port from file
  if (!existsSync(PORT_FILE)) {
    process.stderr.write(`[webcli native-host] port file not found: ${PORT_FILE}\n`)
    process.stderr.write(`[webcli native-host] Is the MCP server running?\n`)
    process.exit(1)
  }
  const port = parseInt(readFileSync(PORT_FILE, 'utf-8').trim(), 10)

  const sock = netConnect(port, '127.0.0.1')

  let sockBuffer = ''
  sock.on('data', (chunk) => {
    sockBuffer += chunk.toString()
    const lines = sockBuffer.split('\n')
    sockBuffer = lines.pop()!
    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line)
          nativeTransport.send(parsed)
        } catch {}
      }
    }
  })

  sock.on('error', (err) => {
    process.stderr.write(`[webcli native-host] connection error: ${err.message}\n`)
  })

  sock.on('connect', () => {
    process.stderr.write(`[webcli native-host] connected to MCP server on port ${port}\n`)
  })

  nativeTransport.onMessage((msg) => {
    sock.write(JSON.stringify(msg) + '\n')
  })

  process.stdin.resume()

} else {
  // ============================================================
  // Mode: MCP Server (launched by Claude Code / AI Agent)
  // Serves MCP protocol on stdin/stdout, listens for Native Host on TCP
  // ============================================================
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { createMcpServer } = await import('../src/index.js')
  const { server, sessions, commands } = createMcpServer()

  // 1. Start TCP server for Native Host connections
  const tcpServer = createNetServer((client) => {
    process.stderr.write(`[webcli-mcp] native host connected\n`)

    let buffer = ''
    client.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.type === 'session_open') sessions.openSession(msg.tabId, msg.url, msg.title)
          else if (msg.type === 'session_close') sessions.closeSession(msg.tabId)
          else if (msg.type === 'snapshot_update') sessions.updateSnapshot(msg.tabId, msg.snapshot)
          else if (msg.type === 'command_result') commands.resolve(msg.commandId, msg.result)
        } catch {}
      }
    })

    commands.setSender((msg) => {
      client.write(JSON.stringify(msg) + '\n')
    })

    client.on('close', () => {
      process.stderr.write(`[webcli-mcp] native host disconnected\n`)
    })
  })

  // Listen on random available port, write to port file
  tcpServer.listen(0, '127.0.0.1', () => {
    const addr = tcpServer.address()
    if (addr && typeof addr === 'object') {
      mkdirSync(WEBCLI_HOME, { recursive: true })
      writeFileSync(PORT_FILE, String(addr.port))
      process.stderr.write(`[webcli-mcp] listening on port ${addr.port}\n`)
    }
  })

  // 2. Start MCP transport for AI Agent communication
  const transport = new StdioServerTransport()
  await server.server.connect(transport)
}
