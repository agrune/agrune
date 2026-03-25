import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export interface ToolHandlerResult {
  text: string
  isError?: boolean
}

export type ToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolHandlerResult>

export function toMcpToolResult(result: ToolHandlerResult) {
  return {
    content: [{ type: 'text' as const, text: result.text }],
    ...(result.isError ? { isError: true } : {}),
  }
}

export function registerAgagruneTools(
  mcp: McpServer,
  handleToolCall: ToolHandler,
): void {
  const optionalTabId = {
    tabId: z.number().optional().describe('Tab ID (omit for active tab)'),
  }

  mcp.tool('agrune_sessions', 'List browser tabs. Only needed to switch between multiple tabs.', {}, async () =>
    toMcpToolResult(await handleToolCall('agrune_sessions', {})),
  )

  mcp.tool(
    'agrune_snapshot',
    'Get page snapshot. Returns outline by default — expand specific groups by groupId to get targetIds. Do not re-snapshot after actions. Defaults: reason=ready, sensitive=false.',
    {
      groupId: z.string().optional().describe('Expand a group to get its targetIds'),
      groupIds: z.array(z.string()).optional().describe('Expand multiple groups'),
      mode: z.enum(['outline', 'full']).optional().describe('outline (default): group summary; full: all targets'),
      includeTextContent: z.boolean().optional().describe('Include text content'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_snapshot', args)),
  )

  mcp.tool(
    'agrune_act',
    'Click a target. Do not re-snapshot after.',
    {
      targetId: z.string().describe('Target ID'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_act', args)),
  )

  mcp.tool(
    'agrune_fill',
    'Fill input/textarea. Do not re-snapshot after.',
    {
      targetId: z.string().describe('Target ID'),
      value: z.string().describe('Value to fill'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_fill', args)),
  )

  mcp.tool(
    'agrune_drag',
    'Drag target to another. Do not re-snapshot after.',
    {
      sourceTargetId: z.string().describe('Source target ID'),
      destinationTargetId: z.string().describe('Destination target ID'),
      placement: z.enum(['before', 'inside', 'after']).optional().describe('Drop placement'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_drag', args)),
  )

  mcp.tool(
    'agrune_wait',
    'Wait for target state change.',
    {
      targetId: z.string().describe('Target ID'),
      state: z.enum(['visible', 'hidden', 'enabled', 'disabled']).describe('Desired state'),
      timeoutMs: z.number().optional().describe('Timeout ms (default: 10000)'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_wait', args)),
  )

  mcp.tool(
    'agrune_guide',
    'Highlight a target visually.',
    {
      targetId: z.string().describe('Target ID'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_guide', args)),
  )

  mcp.tool(
    'agrune_config',
    'Update visual config. Only call when user explicitly requests.',
    {
      pointerAnimation: z.boolean().optional(),
      auroraGlow: z.boolean().optional(),
      auroraTheme: z.enum(['dark', 'light']).optional(),
      clickDelayMs: z.number().optional(),
      pointerDurationMs: z.number().optional(),
      autoScroll: z.boolean().optional(),
      agentActive: z.boolean().optional().describe('Toggle agent visual presence'),
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_config', args)),
  )
}
