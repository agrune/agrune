import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { AgentTargetIdParseError, normalizeAgentTargetId } from './target-id-normalizer'

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

/**
 * Phase 15-03 (REPEAT-03): targetId normalize 헬퍼.
 *
 * AI-facing dot-bracket targetId를 runtime delimiter 형식으로 변환.
 * 파싱 실패 시 INVALID_TARGET error result 반환.
 *
 * @returns normalized string (성공) | ToolHandlerResult (에러)
 */
function tryNormalizeTargetId(
  targetId: string,
): { ok: true; normalized: string } | { ok: false; result: ReturnType<typeof toMcpToolResult> } {
  try {
    return { ok: true, normalized: normalizeAgentTargetId(targetId) }
  } catch (err) {
    if (err instanceof AgentTargetIdParseError) {
      return {
        ok: false,
        result: toMcpToolResult({
          ok: false,
          text: JSON.stringify({
            ok: false,
            error: {
              code: 'INVALID_TARGET',
              message: err.message,
              details: { input: err.input },
            },
          }),
          isError: true,
        } as ToolHandlerResult),
      }
    }
    throw err
  }
}

export function registerAgruneTools(
  mcp: McpServer,
  handleToolCall: ToolHandler,
): void {
  const optionalTabId = {
    tabId: z.number().optional().describe('Tab ID (omit for active tab)'),
  }

  const registerActTool = (
    toolName: string,
    action: 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress',
    description: string,
  ) => {
    mcp.tool(
      toolName,
      description,
      {
        targetId: z.string().describe('Exact targetId copied from browser_get_targets. Do not invent this value.'),
        ...optionalTabId,
      },
      async (args) => {
        const n = tryNormalizeTargetId(args.targetId as string)
        if (!n.ok) return n.result
        return toMcpToolResult(await handleToolCall(toolName, { ...args, targetId: n.normalized, action }))
      },
    )
  }

  mcp.tool('browser_list_tabs', 'List active browser tabs managed by Agrune. Only call when switching between tabs; other tools use the active tab by default.', {}, async () =>
    toMcpToolResult(await handleToolCall('browser_list_tabs', {})),
  )

  mcp.tool(
    'browser_open_tab',
    'Open a new browser tab in the attached or launched automation browser and make it the active Agrune session.',
    {
      url: z.string().url().describe('URL to open in the new tab'),
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_open_tab', args)),
  )

  mcp.tool(
    'browser_get_targets',
    'Get manifest-defined actionable targets for the active browser context. Default returns group summaries. Use groupId/groupIds to expand specific groups, or mode="full" to return all targetIds.',
    {
      groupId: z.string().optional().describe('Expand a group to get its targetIds'),
      groupIds: z.array(z.string()).optional().describe('Expand multiple groups'),
      mode: z.enum(['outline', 'full']).optional().describe('outline (default): group summary; full: all targets'),
      includeTextContent: z.boolean().optional().describe('Include text content'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_get_targets', args)),
  )

  registerActTool(
    'browser_click',
    'click',
    'Click one actionable target. First call browser_get_targets, copy the exact targetId, then call browser_click with that targetId.',
  )
  registerActTool(
    'browser_double_click',
    'dblclick',
    'Double-click one actionable target. Use only when browser_get_targets shows dblclick in actionKinds or the user explicitly asks for a double-click.',
  )
  registerActTool(
    'browser_right_click',
    'contextmenu',
    'Right-click one actionable target to open its context menu. Use only when browser_get_targets shows contextmenu in actionKinds or the user asks for a context menu.',
  )
  registerActTool(
    'browser_hover',
    'hover',
    'Hover one actionable target. Use when hover reveals UI or browser_get_targets shows hover in actionKinds.',
  )
  registerActTool(
    'browser_long_press',
    'longpress',
    'Long-press one actionable target. Use for touch-style long press interactions exposed by the page manifest.',
  )

  mcp.tool(
    'browser_fill',
    'Fill an input/textarea/contenteditable with a value by targetId. When ok:true is returned, do not re-snapshot to verify.',
    {
      targetId: z.string().describe('Target ID'),
      value: z.string().describe('Value to fill'),
      clear: z.boolean().optional().describe('If true (default), clear existing value first.'),
      strategy: z
        .enum(['insert', 'keystroke', 'auto'])
        .optional()
        .describe(
          'Input method. "insert" is fast text insertion; "keystroke" sends typed key events for masked inputs; "auto" detects. Defaults to "auto".',
        ),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize dot-bracket targetId → runtime delimiter
      const n = tryNormalizeTargetId(args.targetId as string)
      if (!n.ok) return n.result
      return toMcpToolResult(await handleToolCall('browser_fill', { ...args, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'browser_drag',
    'Drag a source target to a destination. Use destinationTargetId for target-to-target drag, or destinationCoords for coordinate-based placement. For canvas groups, coords are in canvas space (auto-converted). Use relativeTo to position relative to another target. Returns movedTarget with final position.',
    {
      sourceTargetId: z.string().describe('Source target ID'),
      destinationTargetId: z.string().optional().describe('Destination target ID'),
      destinationCoords: z.union([
        z.object({
          x: z.number().describe('X coordinate (canvas space for canvas groups)'),
          y: z.number().describe('Y coordinate'),
        }),
        z.object({
          relativeTo: z.string().describe('Reference target ID'),
          dx: z.number().describe('X offset from reference target center'),
          dy: z.number().describe('Y offset from reference target center'),
        }),
      ]).optional().describe('Destination: absolute coords or relative to another target'),
      placement: z.enum(['before', 'inside', 'after']).optional().describe('Drop placement (only with destinationTargetId)'),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize sourceTargetId + destinationTargetId (both may be dot-bracket)
      const ns = tryNormalizeTargetId(args.sourceTargetId as string)
      if (!ns.ok) return ns.result
      const normalizedArgs: Record<string, unknown> = { ...args, sourceTargetId: ns.normalized }
      if (typeof args.destinationTargetId === 'string') {
        const nd = tryNormalizeTargetId(args.destinationTargetId)
        if (!nd.ok) return nd.result
        normalizedArgs.destinationTargetId = nd.normalized
      }
      return toMcpToolResult(await handleToolCall('browser_drag', normalizedArgs))
    },
  )

  mcp.tool(
    'browser_pointer',
    'Execute a low-level pointer/wheel event sequence. Use targetId from a snapshot when possible; use coords only for canvas or freeform interactions.',
    {
      targetId: z.string().optional().describe('Target ID'),
      coords: z.object({
        x: z.number().describe('Viewport X coordinate'),
        y: z.number().describe('Viewport Y coordinate'),
      }).optional().describe('Viewport coordinates to find element via elementFromPoint'),
      actions: z.array(z.discriminatedUnion('type', [
        z.object({
          type: z.literal('pointerdown'),
          x: z.number().describe('Viewport X'),
          y: z.number().describe('Viewport Y'),
          delayMs: z.number().optional().describe('Delay in ms after this action'),
        }),
        z.object({
          type: z.literal('pointermove'),
          x: z.number().describe('Viewport X'),
          y: z.number().describe('Viewport Y'),
          delayMs: z.number().optional().describe('Delay in ms after this action'),
        }),
        z.object({
          type: z.literal('pointerup'),
          x: z.number().describe('Viewport X'),
          y: z.number().describe('Viewport Y'),
          delayMs: z.number().optional().describe('Delay in ms after this action'),
        }),
        z.object({
          type: z.literal('wheel'),
          x: z.number().describe('Viewport X'),
          y: z.number().describe('Viewport Y'),
          deltaY: z.number().describe('Scroll delta (negative = zoom in)'),
          ctrlKey: z.boolean().optional().describe('Hold Ctrl (for pinch-zoom)'),
          delayMs: z.number().optional().describe('Delay in ms after this action'),
          steps: z.number().int().min(1).optional().describe('Split deltaY into N equal steps for smooth zoom'),
          durationMs: z.number().optional().describe('Total duration across all steps in ms'),
        }),
      ])).describe('Ordered sequence of pointer/wheel events'),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize targetId (optional for pointer)
      if (typeof args.targetId === 'string') {
        const n = tryNormalizeTargetId(args.targetId)
        if (!n.ok) return n.result
        return toMcpToolResult(await handleToolCall('browser_pointer', { ...args, targetId: n.normalized }))
      }
      return toMcpToolResult(await handleToolCall('browser_pointer', args))
    },
  )

  mcp.tool(
    'browser_wait_for',
    'Wait for target state change.',
    {
      targetId: z.string().describe('Target ID'),
      state: z.enum(['visible', 'hidden', 'enabled', 'disabled']).describe('Desired state'),
      timeoutMs: z.number().optional().describe('Timeout ms (default: 10000)'),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize dot-bracket targetId → runtime delimiter
      const n = tryNormalizeTargetId(args.targetId as string)
      if (!n.ok) return n.result
      return toMcpToolResult(await handleToolCall('browser_wait_for', { ...args, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'browser_update_config',
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
    async (args) => toMcpToolResult(await handleToolCall('browser_update_config', args)),
  )

  mcp.tool(
    'browser_read',
    'Extract visible page content as structured markdown.',
    {
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_read', args)),
  )

  mcp.tool(
    'browser_focus_tab',
    'Switch the active browser tab. Subsequent tool calls without tabId target this tab. Best-effort brings the underlying browser window to the foreground. Get tabIds from browser_list_tabs.',
    {
      tabId: z.number().optional().describe('Tab ID to focus (preferred)'),
      sessionId: z.string().optional().describe('Reserved — pass numeric-string sessionId for future compatibility'),
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_focus_tab', args)),
  )
}
