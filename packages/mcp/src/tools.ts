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
      name: 'agrune_sessions',
      description: 'List active browser sessions (tabs) being managed by agrune.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'agrune_snapshot',
      description:
        'Get the current active-context snapshot for a browser tab. By default returns a group outline only; use groupId/groupIds or mode="full" to expand actionable targets. Targets only include actionable elements. Omitted fields use defaults: visible=true, enabled=true.',
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
      name: 'agrune_act',
      description: 'Perform an interaction (click, dblclick, contextmenu, hover, longpress) on a target element. Defaults to click. A target may support multiple actions — check actionKinds in the snapshot.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'The target element ID from the page snapshot.' },
          action: {
            type: 'string',
            enum: ['click', 'dblclick', 'contextmenu', 'hover', 'longpress'],
            description: 'Interaction type to perform on the target. Defaults to click.',
          },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'agrune_fill',
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
              'Input method. "insert" uses CDP Input.insertText (fastest). "keystroke" uses per-character keydown/keyup (required for masked inputs). "auto" detects masked inputs and selects automatically. Defaults to "auto".',
          },
        },
        required: ['targetId', 'value'],
      },
    },
    {
      name: 'agrune_drag',
      description: 'Drag an element and drop it onto another element.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          sourceTargetId: { type: 'string', description: 'The source element ID to drag.' },
          destinationTargetId: { type: 'string', description: 'The destination element ID to drop onto.' },
          placement: {
            type: 'string',
            enum: ['before', 'after', 'inside'],
            description: 'Drop placement relative to the destination element.',
          },
        },
        required: ['sourceTargetId', 'destinationTargetId'],
      },
    },
    {
      name: 'agrune_pointer',
      description: 'Execute a low-level pointer/wheel event sequence on an element. Use for canvas pan, zoom, freeform drawing, or any interaction requiring raw coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'Annotated target ID.' },
          selector: { type: 'string', description: 'CSS selector for target element.' },
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
      name: 'agrune_wait',
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
      name: 'agrune_guide',
      description: 'Visually highlight a target element on the page to guide the user.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          targetId: { type: 'string', description: 'The target element ID to highlight.' },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'agrune_config',
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
      name: 'agrune_read',
      description: 'Extract visible page content as structured markdown.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          selector: { type: 'string', description: 'CSS selector to scope extraction. Defaults to document.body.' },
        },
      },
    },
    {
      name: 'agrune_focus',
      description:
        'Switch the active browser session and best-effort bring the underlying tab to the front. Use before a series of tool calls to ensure subsequent calls target a specific tab. Requires tabId from agrune_sessions.',
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
    {
      name: 'agrune_manifest_load',
      description:
        'Load an AgruneManifest v3 into the active browser session. After loading, agrune_snapshot and agrune_act resolve targets defined in the manifest. Call this before using other tools on external sites (e.g. youtube.com) where the page does not ship its own window.__agrune_manifest__.',
      inputSchema: {
        type: 'object',
        properties: {
          manifest: { type: 'object', description: 'AgruneManifest v3 object. Must pass validateManifest schema (see @agrune/manifest).' },
          tabId: { type: 'number', description: 'Tab ID (omit for active tab)' },
        },
        required: ['manifest'],
      },
    },
    {
      name: 'agrune_macro_run',
      description:
        'Run a macro defined in the loaded manifest by macroId. Executes the entire step loop in-page via a single Runtime.evaluate — step-level CDP round-trips do not occur. Returns MacroResult-shaped response. Call agrune_manifest_load first if the page does not ship its own manifest.',
      inputSchema: {
        type: 'object',
        properties: {
          macroId: { type: 'string', description: 'Macro ID as defined in the manifest.' },
          params: { type: 'object', description: 'Params matching macro.params schema — interpolated into step.value as {{key}}.' },
          tabId: { type: 'number', description: 'Tab ID (omit for active tab).' },
        },
        required: ['macroId'],
      },
    },
  ]
}
