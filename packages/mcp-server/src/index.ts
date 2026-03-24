import type { Readable, Writable } from 'node:stream'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { NativeMessage } from '@runeai/core'
import { RuneBackend } from './backend.js'
import { createNativeMessagingTransport, type NativeMessagingTransport } from './native-messaging.js'
import { getToolDefinitions } from './tools.js'
import { registerRuneTools } from './mcp-tools.js'

export { RuneBackend } from './backend.js'
export { SessionManager } from './session-manager.js'
export { CommandQueue } from './command-queue.js'
export { getToolDefinitions } from './tools.js'
export {
  encodeMessage,
  decodeMessages,
  createNativeMessagingTransport,
  type NativeMessagingTransport,
} from './native-messaging.js'

export function createMcpServer() {
  const backend = new RuneBackend()
  let nativeTransport: NativeMessagingTransport | null = null

  const mcp = new McpServer(
    { name: 'rune', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  registerRuneTools(mcp, (name, args) => backend.handleToolCall(name, args))

  function connectNativeMessaging(input: Readable, output: Writable) {
    nativeTransport = createNativeMessagingTransport(input, output)

    backend.setNativeSender((msg: NativeMessage) => {
      nativeTransport!.send(msg)
    })

    nativeTransport.onMessage((msg: NativeMessage) => {
      backend.handleNativeMessage(msg)
    })

    return nativeTransport
  }

  return {
    server: mcp,
    sessions: backend.sessions,
    commands: backend.commands,
    connectNativeMessaging,
    backend,
  }
}
