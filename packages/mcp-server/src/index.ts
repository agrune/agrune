import type { Readable, Writable } from 'node:stream'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { NativeMessage, CompanionConfig } from '@webcli-dom/core'
import { SessionManager } from './session-manager.js'
import { CommandQueue } from './command-queue.js'
import { createNativeMessagingTransport, type NativeMessagingTransport } from './native-messaging.js'
import { getToolDefinitions } from './tools.js'

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
  const sessions = new SessionManager()
  const commands = new CommandQueue()

  let nativeTransport: NativeMessagingTransport | null = null

  const mcp = new McpServer(
    { name: 'webcli-dom', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  // Register tools with Zod schemas
  const optionalTabId = { tabId: z.number().optional().describe('Tab ID. Omit to use the most recent active tab.') }

  mcp.tool('webcli_sessions', 'List active browser sessions (tabs) with webcli-dom annotations', {}, async () => {
    return handleToolCall('webcli_sessions', {})
  })

  mcp.tool('webcli_snapshot', 'Get the current page snapshot including all annotated targets and their states', optionalTabId, async (args) => {
    return handleToolCall('webcli_snapshot', args)
  })

  mcp.tool('webcli_act', 'Click an annotated target element', {
    targetId: z.string().describe('The target ID to click'),
    ...optionalTabId,
  }, async (args) => {
    return handleToolCall('webcli_act', args)
  })

  mcp.tool('webcli_fill', 'Fill an input/textarea with a value', {
    targetId: z.string().describe('The target ID to fill'),
    value: z.string().describe('The value to fill'),
    ...optionalTabId,
  }, async (args) => {
    return handleToolCall('webcli_fill', args)
  })

  mcp.tool('webcli_drag', 'Drag one target to another', {
    sourceTargetId: z.string().describe('Source target ID'),
    destinationTargetId: z.string().describe('Destination target ID'),
    placement: z.enum(['before', 'inside', 'after']).optional().describe('Drop placement'),
    ...optionalTabId,
  }, async (args) => {
    return handleToolCall('webcli_drag', args)
  })

  mcp.tool('webcli_wait', 'Wait for a target to reach a specific state', {
    targetId: z.string().describe('The target ID to wait for'),
    state: z.enum(['visible', 'hidden', 'enabled', 'disabled']).describe('Desired state'),
    timeoutMs: z.number().optional().describe('Timeout in milliseconds (default: 10000)'),
    ...optionalTabId,
  }, async (args) => {
    return handleToolCall('webcli_wait', args)
  })

  mcp.tool('webcli_guide', 'Visually highlight a target element without executing an action', {
    targetId: z.string().describe('The target ID to highlight'),
    ...optionalTabId,
  }, async (args) => {
    return handleToolCall('webcli_guide', args)
  })

  mcp.tool('webcli_config', 'Update runtime configuration (pointer animation, aurora glow, etc.)', {
    pointerAnimation: z.boolean().optional(),
    auroraGlow: z.boolean().optional(),
    auroraTheme: z.enum(['dark', 'light']).optional(),
    clickDelayMs: z.number().optional(),
    autoScroll: z.boolean().optional(),
  }, async (args) => {
    return handleToolCall('webcli_config', args)
  })

  function resolveTabId(args: Record<string, unknown>): number | null {
    if (typeof args.tabId === 'number') return args.tabId
    const all = sessions.getSessions()
    return all.length > 0 ? all[0].tabId : null
  }

  async function handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    switch (name) {
      case 'webcli_sessions': {
        const list = sessions.getSessions()
        return textResult(JSON.stringify(list, null, 2))
      }

      case 'webcli_snapshot': {
        const tabId = resolveTabId(args)
        if (tabId == null) {
          return textResult('No active sessions.', true)
        }
        const snapshot = sessions.getSnapshot(tabId)
        if (!snapshot) {
          return textResult(`No snapshot available for tab ${tabId}.`, true)
        }
        return textResult(JSON.stringify(snapshot, null, 2))
      }

      case 'webcli_act':
      case 'webcli_fill':
      case 'webcli_drag':
      case 'webcli_wait':
      case 'webcli_guide': {
        const tabId = resolveTabId(args)
        if (tabId == null) {
          return textResult('No active sessions.', true)
        }
        const kind = name.replace('webcli_', '')
        const command = { kind, ...args }
        delete command.tabId
        const result = await commands.enqueue(tabId, command as Record<string, unknown> & { kind: string })
        return textResult(JSON.stringify(result, null, 2))
      }

      case 'webcli_config': {
        const config: Partial<CompanionConfig> = {}
        if (typeof args.pointerAnimation === 'boolean') config.pointerAnimation = args.pointerAnimation
        if (typeof args.auroraGlow === 'boolean') config.auroraGlow = args.auroraGlow
        if (typeof args.auroraTheme === 'string') config.auroraTheme = args.auroraTheme as CompanionConfig['auroraTheme']
        if (typeof args.clickDelayMs === 'number') config.clickDelayMs = args.clickDelayMs
        if (typeof args.autoScroll === 'boolean') config.autoScroll = args.autoScroll

        // Send via commands sender (TCP socket) or native transport
        const msg = { type: 'config_update', config } as NativeMessage
        if (nativeTransport) {
          nativeTransport.send(msg)
        } else {
          // Use the sender that's set up by the TCP socket connection
          commands.sendRaw(msg)
        }
        return textResult('Configuration updated.')
      }

      default:
        return textResult(`Unknown tool: ${name}`, true)
    }
  }

  function textResult(text: string, isError = false) {
    return {
      content: [{ type: 'text' as const, text }],
      ...(isError ? { isError: true } : {}),
    }
  }

  function connectNativeMessaging(input: Readable, output: Writable) {
    nativeTransport = createNativeMessagingTransport(input, output)

    commands.setSender((msg: NativeMessage) => {
      nativeTransport!.send(msg)
    })

    nativeTransport.onMessage((msg: NativeMessage) => {
      switch (msg.type) {
        case 'session_open':
          sessions.openSession(msg.tabId, msg.url, msg.title)
          break
        case 'session_close':
          sessions.closeSession(msg.tabId)
          break
        case 'snapshot_update':
          sessions.updateSnapshot(msg.tabId, msg.snapshot)
          break
        case 'command_result':
          commands.resolve(msg.commandId, msg.result)
          break
      }
    })

    return nativeTransport
  }

  return {
    server: mcp,
    sessions,
    commands,
    connectNativeMessaging,
  }
}
