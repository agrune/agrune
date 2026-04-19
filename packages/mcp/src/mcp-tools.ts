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

  mcp.tool('agrune_sessions', 'List active browser sessions (tabs). Only call this when switching between multiple tabs. agrune_snapshot automatically uses the active tab.', {}, async () =>
    toMcpToolResult(await handleToolCall('agrune_sessions', {})),
  )

  mcp.tool(
    'agrune_snapshot',
    'Get page snapshot with actionable targets. Calling with outline mode (default) returns a group summary. To get targetIds for a specific group, specify groupId to expand it. To get all targets at once, use mode=full. Do not re-snapshot after actions — one snapshot per task is enough. Defaults: reason=ready, sensitive=false.',
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
    'Perform an interaction (click, dblclick, contextmenu, hover, longpress) on a target element by targetId. Defaults to click. When ok:true is returned, do not re-snapshot to verify.',
    {
      targetId: z.string().describe('Target ID'),
      action: z.enum(['click', 'dblclick', 'contextmenu', 'hover', 'longpress']).optional().describe('Interaction type (default: click)'),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize dot-bracket targetId → runtime delimiter
      const n = tryNormalizeTargetId(args.targetId as string)
      if (!n.ok) return n.result
      return toMcpToolResult(await handleToolCall('agrune_act', { ...args, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'agrune_fill',
    'Fill an input/textarea/contenteditable with a value by targetId. When ok:true is returned, do not re-snapshot to verify.',
    {
      targetId: z.string().describe('Target ID'),
      value: z.string().describe('Value to fill'),
      clear: z.boolean().optional().describe('If true (default), clear existing value first.'),
      strategy: z
        .enum(['insert', 'keystroke', 'auto'])
        .optional()
        .describe(
          'Input method. "insert" = CDP Input.insertText; "keystroke" = per-character dispatchKeyEvent (for masked inputs); "auto" detects. Defaults to "auto".',
        ),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize dot-bracket targetId → runtime delimiter
      const n = tryNormalizeTargetId(args.targetId as string)
      if (!n.ok) return n.result
      return toMcpToolResult(await handleToolCall('agrune_fill', { ...args, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'agrune_drag',
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
      return toMcpToolResult(await handleToolCall('agrune_drag', normalizedArgs))
    },
  )

  mcp.tool(
    'agrune_pointer',
    'Execute a low-level pointer/wheel event sequence on an element. Use for canvas pan, zoom, freeform drawing, or any interaction requiring raw coordinates. Specify target element via targetId, selector, or coords (priority: targetId > selector > coords).',
    {
      targetId: z.string().optional().describe('Annotated target ID'),
      selector: z.string().optional().describe('CSS selector for target element'),
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
        return toMcpToolResult(await handleToolCall('agrune_pointer', { ...args, targetId: n.normalized }))
      }
      return toMcpToolResult(await handleToolCall('agrune_pointer', args))
    },
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
    async (args) => {
      // Phase 15-03: normalize dot-bracket targetId → runtime delimiter
      const n = tryNormalizeTargetId(args.targetId as string)
      if (!n.ok) return n.result
      return toMcpToolResult(await handleToolCall('agrune_wait', { ...args, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'agrune_guide',
    'Highlight a target visually.',
    {
      targetId: z.string().describe('Target ID'),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize dot-bracket targetId → runtime delimiter
      const n = tryNormalizeTargetId(args.targetId as string)
      if (!n.ok) return n.result
      return toMcpToolResult(await handleToolCall('agrune_guide', { ...args, targetId: n.normalized }))
    },
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

  mcp.tool(
    'agrune_read',
    'Extract visible page content as structured markdown. Use selector to scope extraction to a specific area.',
    {
      selector: z.string().optional().describe('CSS selector to scope extraction (default: full page)'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_read', args)),
  )

  mcp.tool(
    'agrune_focus',
    'Switch the active browser session (tab). Subsequent tool calls without tabId target this tab. Best-effort brings the underlying browser window to the foreground. Get tabIds from agrune_sessions.',
    {
      tabId: z.number().optional().describe('Tab ID to focus (preferred)'),
      sessionId: z.string().optional().describe('Reserved — pass numeric-string sessionId for future compatibility'),
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_focus', args)),
  )

  mcp.tool(
    'agrune_manifest_load',
    'Load an AgruneManifest v3 into the active browser session. After loading, agrune_snapshot and agrune_act resolve targets defined in the manifest. Call this before using other tools on external sites (e.g. youtube.com) where the page does not ship its own window.__agrune_manifest__.',
    {
      manifest: z.object({
        version: z.literal(3),
        groups: z.array(z.any()),
        macros: z.array(z.any()).optional(),
      }).describe('AgruneManifest v3 object. Must pass validateManifest schema (see @agrune/manifest).'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_manifest_load', args)),
  )

  mcp.tool(
    'agrune_macro_run',
    'Run a macro defined in the loaded manifest by macroId. Executes the entire step loop in-page via a single Runtime.evaluate — step-level CDP round-trips do not occur. Returns MacroResult-shaped response. Call agrune_manifest_load first if the page does not ship its own manifest.',
    {
      macroId: z.string().describe('Macro ID as defined in the manifest'),
      params: z.record(z.string(), z.unknown()).optional().describe('Params matching macro.params schema — interpolated into step.value as {{key}}'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_macro_run', args)),
  )
}
