export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'browser_list_tabs',
      description: 'List active browser tabs managed by Agrune. Other tools use the active tab by default.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'browser_open_tab',
      description: 'Open a new browser tab in the attached or launched automation browser and make it the active Agrune session.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to open in the new tab.' },
        },
        required: ['url'],
      },
    },
    {
      name: 'browser_get_targets',
      description:
        'Get manifest-defined actionable targets for the active browser context. By default returns group summaries only; use groupId/groupIds or mode="full" to expand targetIds.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          groupId: { type: 'string', description: 'Expand a single group by its groupId.' },
          groupIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Expand multiple groups by groupId.',
          },
          mode: {
            type: 'string',
            enum: ['outline', 'full'],
            description: 'outline returns groups only; full returns all actionable targets in the active context.',
          },
          includeTextContent: {
            type: 'boolean',
            description: 'Include visible text content of each target element. Default: false.',
          },
        },
      },
    },
    {
      name: 'browser_click',
      description: 'Click one actionable target. First call browser_get_targets and copy the exact targetId.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'Exact targetId copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'browser_double_click',
      description: 'Double-click one actionable target. Use only when actionKinds includes dblclick or the user explicitly asks for a double-click.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'Exact targetId copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'browser_right_click',
      description: 'Right-click one actionable target to open its context menu. Use only when actionKinds includes contextmenu or the user asks for a context menu.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'Exact targetId copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'browser_hover',
      description: 'Hover one actionable target. Use when hover reveals UI or actionKinds includes hover.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'Exact targetId copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'browser_long_press',
      description: 'Long-press one actionable target for touch-style long press interactions.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'Exact targetId copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'browser_fill',
      description: 'Fill an input element with a value. The element is identified by its targetId from the page snapshot.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'The target input element ID from the page snapshot.' },
          value: { type: 'string', description: 'The value to fill into the input element.' },
          clear: {
            type: 'boolean',
            description: 'If true (default), clears existing value before filling. Set to false to append.',
          },
          strategy: {
            type: 'string',
            enum: ['insert', 'keystroke', 'auto'],
            description:
              'Input method. "insert" is fastest. "keystroke" sends typed key events for masked inputs. "auto" detects masked inputs and selects automatically. Defaults to "auto".',
          },
        },
        required: ['targetId', 'value'],
      },
    },
    {
      name: 'browser_drag',
      description: 'Drag a source target to a destination target or destination coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          sourceTargetId: { type: 'string', description: 'The source element ID to drag.' },
          destinationTargetId: { type: 'string', description: 'The destination element ID to drop onto.' },
          destinationCoords: {
            type: 'object',
            description: 'Destination coordinates, either absolute canvas coordinates or offsets relative to another target.',
          },
          placement: {
            type: 'string',
            enum: ['before', 'after', 'inside'],
            description: 'Drop placement relative to the destination element.',
          },
        },
        required: ['sourceTargetId'],
      },
    },
    {
      name: 'browser_pointer',
      description: 'Execute a low-level pointer/wheel event sequence. Use targetId from a snapshot when possible; use coords only for canvas or freeform interactions.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'Target ID.' },
          coords: {
            type: 'object',
            description: 'Viewport coordinates to find element via elementFromPoint.',
            properties: {
              x: { type: 'number', description: 'Viewport X coordinate' },
              y: { type: 'number', description: 'Viewport Y coordinate' },
            },
          },
          actions: {
            type: 'array',
            description: 'Ordered sequence of pointer/wheel events.',
            items: { type: 'object' },
          },
        },
        required: ['actions'],
      },
    },
    {
      name: 'browser_wait_for',
      description: 'Wait for a target element to reach a specific state (e.g., visible, hidden, enabled, disabled).',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'The target element ID from the page snapshot.' },
          state: {
            type: 'string',
            enum: ['visible', 'hidden', 'enabled', 'disabled'],
            description: 'The state to wait for.',
          },
          timeoutMs: { type: 'number', description: 'Timeout in milliseconds. Defaults to 30000.' },
        },
        required: ['targetId', 'state'],
      },
    },
    {
      name: 'browser_update_config',
      description: 'Update the page runtime configuration (pointer animation, aurora glow, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          pointerAnimation: { type: 'boolean', description: 'Enable or disable pointer animation.' },
          auroraGlow: { type: 'boolean', description: 'Enable or disable aurora glow effect.' },
          auroraTheme: { type: 'string', description: 'Aurora glow theme name.' },
          clickDelayMs: { type: 'number', description: 'Delay in milliseconds before click execution.' },
          pointerDurationMs: { type: 'number', description: 'Pointer animation duration in milliseconds.' },
          autoScroll: { type: 'boolean', description: 'Enable or disable automatic scrolling to target.' },
        },
      },
    },
    {
      name: 'browser_read',
      description: 'Extract visible page content as structured markdown.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
        },
      },
    },
    {
      name: 'browser_focus_tab',
      description:
        'Switch the active browser tab and best-effort bring the underlying tab to the front. Use before a series of tool calls to ensure subsequent calls target a specific tab. Requires tabId from browser_list_tabs.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID to focus.' },
          sessionId: {
            type: 'string',
            description: 'Reserved for future string session IDs. If present and parseable as a number, treated as tabId.',
          },
        },
      },
    },
  ]
}
