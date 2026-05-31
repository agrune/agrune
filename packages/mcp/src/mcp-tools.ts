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

function normalizeTargetIdOrSelector(targetId: string): string {
  try {
    return normalizeAgentTargetId(targetId)
  } catch (err) {
    if (err instanceof AgentTargetIdParseError) return targetId
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
  const targetRef = z.string().describe('Exact target ref copied from browser_get_targets. Do not invent this value.')
  const elementDescription = z.string().optional().describe('Human-readable element description used to describe the intended interaction')
  const clickButton = z.enum(['left', 'right', 'middle']).optional()
  const clickModifiers = z.array(z.enum(['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'])).optional()

  const registerActTool = (
    toolName: string,
    action: 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress',
    description: string,
  ) => {
    mcp.tool(
      toolName,
      description,
      {
        element: elementDescription,
        target: targetRef,
        ...(toolName === 'browser_click'
          ? {
              button: clickButton.describe('Mouse button to click. Defaults to left.'),
              doubleClick: z.boolean().optional().describe('Perform a double click instead of a single click.'),
              modifiers: clickModifiers.describe('Modifier keys to press during the click.'),
            }
          : {}),
        ...optionalTabId,
      },
      async (args) => {
        const n = tryNormalizeTargetId(args.target as string)
        if (!n.ok) return n.result
        const { target: _target, element: _element, ...rest } = args
        const effectiveAction = toolName === 'browser_click' && args.doubleClick === true ? 'dblclick' : action
        return toMcpToolResult(await handleToolCall(toolName, { ...rest, targetId: n.normalized, action: effectiveAction }))
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
    'browser_tabs',
    'List, create, close, or select a browser tab using Playwright-style index arguments.',
    {
      action: z.enum(['list', 'new', 'close', 'select']).describe('Operation to perform'),
      url: z.string().url().optional().describe('URL to navigate to in the new tab, used for new.'),
      index: z.number().int().min(0).optional().describe('Tab index, used for close/select. If omitted for close, current tab is closed.'),
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_tabs', args)),
  )

  mcp.tool(
    'browser_close',
    'Close the page',
    {},
    async (args) => toMcpToolResult(await handleToolCall('browser_close', args)),
  )

  mcp.tool(
    'browser_navigate',
    'Navigate to a URL',
    {
      url: z.string().url().describe('The URL to navigate to'),
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_navigate', args)),
  )

  mcp.tool(
    'browser_navigate_back',
    'Go back to the previous page in the history',
    {},
    async (args) => toMcpToolResult(await handleToolCall('browser_navigate_back', args)),
  )

  mcp.tool(
    'browser_resize',
    'Resize the browser window',
    {
      width: z.number().int().positive().describe('Width of the browser window'),
      height: z.number().int().positive().describe('Height of the browser window'),
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_resize', args)),
  )

  mcp.tool(
    'browser_take_screenshot',
    'Capture screenshot of current page',
    {
      filename: z.string().optional().describe('File name to save the screenshot to. Defaults to `page-{timestamp}.{png|jpeg}` if not specified.'),
      fullPage: z.boolean().optional().describe('When true, takes a screenshot of the full scrollable page, instead of the currently visible viewport. Cannot be used with element screenshots.'),
      element: elementDescription,
      target: targetRef.optional().describe('Exact target element reference from the page snapshot, or a unique element selector'),
      type: z.enum(['png', 'jpeg']).optional().describe('Image format for the screenshot. Default is png.'),
    },
    async (args) => {
      const { target, element: _element, ...rest } = args
      if (typeof target === 'string') {
        return toMcpToolResult(await handleToolCall('browser_take_screenshot', { ...rest, targetId: normalizeTargetIdOrSelector(target) }))
      }
      return toMcpToolResult(await handleToolCall('browser_take_screenshot', rest))
    },
  )

  mcp.tool(
    'browser_evaluate',
    'Evaluate JavaScript expression on page or element',
    {
      element: elementDescription,
      filename: z.string().optional().describe('Filename to save the result to. If not provided, result is returned as text.'),
      function: z.string().describe('() => { /* code */ } or (element) => { /* code */ } when element is provided'),
      target: targetRef.optional().describe('Exact target element reference from the page snapshot, or a unique element selector'),
    },
    async (args) => {
      const { target, element: _element, ...rest } = args
      if (typeof target === 'string') {
        return toMcpToolResult(await handleToolCall('browser_evaluate', { ...rest, targetId: normalizeTargetIdOrSelector(target) }))
      }
      return toMcpToolResult(await handleToolCall('browser_evaluate', rest))
    },
  )

  mcp.tool(
    'browser_run_code_unsafe',
    'Run a Playwright code snippet. Unsafe: executes arbitrary JavaScript in the MCP server process and is RCE-equivalent.',
    {
      code: z.string().optional().describe('A JavaScript function containing Playwright code to execute. It will be invoked with a single argument, page.'),
      filename: z.string().optional().describe('Load code from the specified file. If both code and filename are provided, code will be ignored.'),
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_run_code_unsafe', args)),
  )

  mcp.tool(
    'browser_console_messages',
    'Returns all console messages',
    {
      all: z.boolean().optional().describe('Return all console messages since the beginning of the session, not just since the last navigation. Defaults to false.'),
      filename: z.string().optional().describe('Filename to save the console messages to. If not provided, messages are returned as text.'),
      level: z.enum(['debug', 'info', 'warning', 'error']).optional().describe('Level of the console messages to return. Each level includes the messages of more severe levels. Defaults to "info".'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_console_messages', args)),
  )

  mcp.tool(
    'browser_network_requests',
    'Returns a numbered list of network requests since loading the page. Use browser_network_request with the number to get full details.',
    {
      filename: z.string().optional().describe('Filename to save the network requests to. If not provided, requests are returned as text.'),
      filter: z.string().optional().describe('Only return requests whose URL matches this regexp (e.g. "/api/.*user").'),
      static: z.boolean().optional().describe('Whether to include successful static resources like images, fonts, scripts, etc. Defaults to false.'),
      all: z.boolean().optional().describe('Return all requests since the beginning of the session, not just since the last navigation. Defaults to false.'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_network_requests', args)),
  )

  mcp.tool(
    'browser_network_request',
    'Returns full details (headers and body) of a single network request, or a single part if `part` is set. Use the number from browser_network_requests.',
    {
      filename: z.string().optional().describe('Filename to save the result to. If not provided, output is returned as text.'),
      index: z.number().int().positive().describe('1-based index of the request, as printed by browser_network_requests.'),
      part: z.enum(['request-headers', 'request-body', 'response-headers', 'response-body']).optional().describe('Return only this part of the request. Omit to return full details.'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_network_request', args)),
  )

  mcp.tool(
    'browser_press_key',
    'Press a key on the keyboard',
    {
      key: z.string().describe('Name of the key to press or a character to generate, such as `ArrowLeft` or `a`'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_press_key', args)),
  )

  mcp.tool(
    'browser_type',
    'Type text into editable element',
    {
      element: elementDescription,
      target: targetRef,
      text: z.string().describe('Text to type into the element'),
      slowly: z.boolean().optional().describe('Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once.'),
      submit: z.boolean().optional().describe('Whether to submit entered text (press Enter after)'),
      ...optionalTabId,
    },
    async (args) => {
      const n = tryNormalizeTargetId(args.target as string)
      if (!n.ok) return n.result
      const { target: _target, element: _element, ...rest } = args
      return toMcpToolResult(await handleToolCall('browser_type', { ...rest, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'browser_select_option',
    'Select an option in a dropdown',
    {
      element: elementDescription,
      target: targetRef,
      values: z.array(z.string()).min(1).describe('Array of values to select in the dropdown. This can be a single value or multiple values.'),
      ...optionalTabId,
    },
    async (args) => {
      const n = tryNormalizeTargetId(args.target as string)
      if (!n.ok) return n.result
      const { target: _target, element: _element, ...rest } = args
      return toMcpToolResult(await handleToolCall('browser_select_option', { ...rest, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'browser_fill_form',
    'Fill multiple form fields',
    {
      fields: z.array(z.object({
        name: z.string().describe('Human-readable field name'),
        element: elementDescription,
        target: targetRef,
        type: z.enum(['textbox', 'checkbox', 'radio', 'combobox', 'slider']).describe('Type of the field'),
        value: z.union([z.string(), z.boolean(), z.number()]).describe('Value to fill in the field'),
      })).min(1).describe('Fields to fill in'),
      ...optionalTabId,
    },
    async (args) => {
      const fields = []
      for (const field of args.fields) {
        const n = tryNormalizeTargetId(field.target)
        if (!n.ok) return n.result
        const { target: _target, element: _element, ...rest } = field
        fields.push({ ...rest, targetId: n.normalized })
      }
      const { fields: _fields, ...rest } = args
      return toMcpToolResult(await handleToolCall('browser_fill_form', { ...rest, fields }))
    },
  )

  mcp.tool(
    'browser_file_upload',
    'Upload one or multiple files',
    {
      paths: z.array(z.string()).optional().describe('The absolute paths to the files to upload. If omitted, file chooser is cancelled.'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_file_upload', args)),
  )

  mcp.tool(
    'browser_drop',
    'Drop files or MIME-typed data onto an element, as if dragged from outside the page. At least one of "paths" or "data" must be provided.',
    {
      element: elementDescription,
      target: targetRef,
      paths: z.array(z.string()).optional().describe('Absolute paths to files to drop onto the element.'),
      data: z.record(z.string(), z.string()).optional().describe('Data to drop, as a map of MIME type to string value.'),
      ...optionalTabId,
    },
    async (args) => {
      const n = tryNormalizeTargetId(args.target as string)
      if (!n.ok) return n.result
      const { target: _target, element: _element, ...rest } = args
      return toMcpToolResult(await handleToolCall('browser_drop', { ...rest, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'browser_handle_dialog',
    'Handle a dialog',
    {
      accept: z.boolean().describe('Whether to accept the dialog.'),
      promptText: z.string().optional().describe('The text of the prompt in case of a prompt dialog.'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('browser_handle_dialog', args)),
  )

  mcp.tool(
    'browser_snapshot',
    'Capture an accessibility-style snapshot of the current page with Agrune target refs.',
    {
      boxes: z.boolean().optional().describe('Include each element bounding box. Agrune snapshots include target center and size when available.'),
      depth: z.number().int().positive().optional().describe('Limit snapshot depth. Accepted for Playwright compatibility.'),
      filename: z.string().optional().describe('Filename to save snapshot to. If not provided, snapshot is returned as text.'),
      target: targetRef.optional().describe('Exact target element reference from the page snapshot.'),
      includeTextContent: z.boolean().optional().describe('Include visible text content'),
      ...optionalTabId,
    },
    async (args) => {
      const { target, ...rest } = args
      if (typeof target === 'string') {
        const n = tryNormalizeTargetId(target)
        if (!n.ok) return n.result
        return toMcpToolResult(await handleToolCall('browser_snapshot', { ...rest, targetId: n.normalized }))
      }
      return toMcpToolResult(await handleToolCall('browser_snapshot', rest))
    },
  )

  mcp.tool(
    'browser_get_targets',
    'Get a Playwright-style snapshot of manifest-defined actionable targets. Default returns group refs. Use groupId/groupIds to expand specific groups, or mode="full" to return all target refs.',
    {
      groupId: z.string().optional().describe('Expand a group to get its target refs'),
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
    'Click one actionable target. First call browser_get_targets, copy the exact ref, then call browser_click with that target.',
  )
  registerActTool(
    'browser_double_click',
    'dblclick',
    'Double-click one actionable target. Use only when the user explicitly asks for a double-click or the target semantics require it.',
  )
  registerActTool(
    'browser_right_click',
    'contextmenu',
    'Right-click one actionable target to open its context menu. Use only when the user asks for a context menu.',
  )
  registerActTool(
    'browser_hover',
    'hover',
    'Hover one actionable target. Use when hover reveals UI.',
  )
  registerActTool(
    'browser_long_press',
    'longpress',
    'Long-press one actionable target. Use for touch-style long press interactions exposed by the page manifest.',
  )

  mcp.tool(
    'browser_fill',
    'Fill an input/textarea/contenteditable with a value by target. When ok:true is returned, do not re-snapshot to verify.',
    {
      element: elementDescription,
      target: targetRef,
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
      const n = tryNormalizeTargetId(args.target as string)
      if (!n.ok) return n.result
      const { target: _target, element: _element, ...rest } = args
      return toMcpToolResult(await handleToolCall('browser_fill', { ...rest, targetId: n.normalized }))
    },
  )

  mcp.tool(
    'browser_drag',
    'Drag a source target to a destination. Use startTarget/endTarget for target-to-target drag, or destinationCoords for coordinate-based placement. For canvas groups, coords are in canvas space (auto-converted). Returns movedTarget with final position.',
    {
      startElement: elementDescription.describe('Human-readable source element description'),
      startTarget: targetRef.describe('Exact source target ref copied from browser_get_targets'),
      endElement: elementDescription.describe('Human-readable destination element description'),
      endTarget: targetRef.optional().describe('Exact destination target ref copied from browser_get_targets'),
      destinationCoords: z.union([
        z.object({
          x: z.number().describe('X coordinate (canvas space for canvas groups)'),
          y: z.number().describe('Y coordinate'),
        }),
        z.object({
          relativeTo: z.string().describe('Reference target ref'),
          dx: z.number().describe('X offset from reference target center'),
          dy: z.number().describe('Y offset from reference target center'),
        }),
      ]).optional().describe('Destination: absolute coords or relative to another target'),
      placement: z.enum(['before', 'inside', 'after']).optional().describe('Drop placement (only with endTarget)'),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize sourceTargetId + destinationTargetId (both may be dot-bracket)
      const ns = tryNormalizeTargetId(args.startTarget as string)
      if (!ns.ok) return ns.result
      const {
        startTarget: _startTarget,
        endTarget,
        startElement: _startElement,
        endElement: _endElement,
        ...rest
      } = args
      const normalizedArgs: Record<string, unknown> = { ...rest, sourceTargetId: ns.normalized }
      if (typeof endTarget === 'string') {
        const nd = tryNormalizeTargetId(endTarget)
        if (!nd.ok) return nd.result
        normalizedArgs.destinationTargetId = nd.normalized
      }
      return toMcpToolResult(await handleToolCall('browser_drag', normalizedArgs))
    },
  )

  mcp.tool(
    'browser_pointer',
    'Execute a low-level pointer/wheel event sequence. Use target from a snapshot when possible; use coords only for canvas or freeform interactions.',
    {
      target: targetRef.optional().describe('Exact target ref copied from browser_get_targets'),
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
      if (typeof args.target === 'string') {
        const n = tryNormalizeTargetId(args.target)
        if (!n.ok) return n.result
        const { target: _target, ...rest } = args
        return toMcpToolResult(await handleToolCall('browser_pointer', { ...rest, targetId: n.normalized }))
      }
      return toMcpToolResult(await handleToolCall('browser_pointer', args))
    },
  )

  mcp.tool(
    'browser_wait_for',
    'Wait for text to appear or disappear or a specified time to pass.',
    {
      target: targetRef.optional().describe('Exact target ref copied from browser_get_targets'),
      state: z.enum(['visible', 'hidden', 'enabled', 'disabled']).optional().describe('Desired target state'),
      text: z.string().optional().describe('The text to wait for'),
      textGone: z.string().optional().describe('The text to wait for to disappear'),
      time: z.number().nonnegative().optional().describe('The time to wait in seconds'),
      timeoutMs: z.number().optional().describe('Timeout ms (default: 10000)'),
      ...optionalTabId,
    },
    async (args) => {
      // Phase 15-03: normalize dot-bracket targetId → runtime delimiter
      const { target, time, ...rest } = args
      const normalizedArgs: Record<string, unknown> = { ...rest }
      if (typeof time === 'number') normalizedArgs.timeMs = time * 1000
      if (typeof target === 'string') {
        const n = tryNormalizeTargetId(target)
        if (!n.ok) return n.result
        normalizedArgs.targetId = n.normalized
      }
      return toMcpToolResult(await handleToolCall('browser_wait_for', normalizedArgs))
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
