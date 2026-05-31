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
      name: 'browser_tabs',
      description: 'List, create, close, or select a browser tab with Playwright-compatible index-based arguments.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'new', 'close', 'select'],
            description: 'Tab action to perform.',
          },
          url: { type: 'string', description: 'URL to open when action is "new".' },
          index: { type: 'number', description: 'Zero-based tab index from browser_tabs list output.' },
        },
        required: ['action'],
      },
    },
    {
      name: 'browser_close',
      description: 'Close the current active browser page.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'browser_navigate',
      description: 'Navigate the current active browser page to a URL.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to.' },
        },
        required: ['url'],
      },
    },
    {
      name: 'browser_navigate_back',
      description: 'Go back to the previous page in the current active browser page history.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'browser_resize',
      description: 'Resize the browser viewport.',
      inputSchema: {
        type: 'object',
        properties: {
          width: { type: 'number', description: 'Viewport width in CSS pixels.' },
          height: { type: 'number', description: 'Viewport height in CSS pixels.' },
        },
        required: ['width', 'height'],
      },
    },
    {
      name: 'browser_take_screenshot',
      description: 'Capture a screenshot of the current page or a target element.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'File name to save the screenshot to. Defaults to a timestamped file.' },
          fullPage: { type: 'boolean', description: 'Capture the full scrollable page instead of the visible viewport.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended screenshot target.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets.' },
          type: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format for the screenshot. Default is png.' },
        },
      },
    },
    {
      name: 'browser_evaluate',
      description: 'Evaluate JavaScript in the current page or on a target element.',
      inputSchema: {
        type: 'object',
        properties: {
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          filename: { type: 'string', description: 'File name to save the evaluation result to.' },
          function: {
            type: 'string',
            description: 'JavaScript function or expression to evaluate. Use (element) => ... when target is provided.',
          },
          target: { type: 'string', description: 'Exact target element reference from the page snapshot.' },
        },
        required: ['function'],
      },
    },
    {
      name: 'browser_run_code_unsafe',
      description: 'Run arbitrary Playwright code against the current page in the MCP server process.',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'JavaScript function to invoke with the Playwright page, e.g. async (page) => { ... }.',
          },
          filename: {
            type: 'string',
            description: 'File containing the JavaScript function to run. When provided, code is ignored.',
          },
        },
      },
    },
    {
      name: 'browser_console_messages',
      description: 'Return console and page error messages from the active page.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          all: { type: 'boolean', description: 'Return all messages since page creation instead of just current navigation.' },
          filename: { type: 'string', description: 'File name to save the console messages to.' },
          level: {
            type: 'string',
            enum: ['debug', 'info', 'warning', 'error'],
            description: 'Minimum console message level. Default: info.',
          },
        },
      },
    },
    {
      name: 'browser_network_requests',
      description: 'Return network requests from the active page.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          all: { type: 'boolean', description: 'Return all requests since page creation instead of just current navigation.' },
          filename: { type: 'string', description: 'File name to save the network requests to.' },
          filter: { type: 'string', description: 'Only return requests whose URL matches this regexp or substring.' },
          static: { type: 'boolean', description: 'Include successful static resources such as images, fonts, and scripts.' },
        },
      },
    },
    {
      name: 'browser_network_request',
      description: 'Return details or a single part for one network request.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          filename: { type: 'string', description: 'File name to save the network request detail to.' },
          index: { type: 'number', description: '1-based request index from browser_network_requests.' },
          part: {
            type: 'string',
            enum: ['request-headers', 'request-body', 'response-headers', 'response-body'],
            description: 'Return only this part of the request.',
          },
        },
        required: ['index'],
      },
    },
    {
      name: 'browser_press_key',
      description: 'Press a keyboard key in the active page.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          key: { type: 'string', description: 'Name of the key to press or a character to generate.' },
        },
        required: ['key'],
      },
    },
    {
      name: 'browser_type',
      description: 'Type text into an editable target.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets.' },
          text: { type: 'string', description: 'Text to type into the target.' },
          slowly: { type: 'boolean', description: 'Type one character at a time.' },
          submit: { type: 'boolean', description: 'Press Enter after typing.' },
        },
        required: ['target', 'text'],
      },
    },
    {
      name: 'browser_select_option',
      description: 'Select one or more options in a dropdown.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets.' },
          values: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of option values to select.',
          },
        },
        required: ['target', 'values'],
      },
    },
    {
      name: 'browser_fill_form',
      description: 'Fill multiple form fields.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          fields: {
            type: 'array',
            description: 'Fields to fill in.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Human-readable field name.' },
                element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
                target: { type: 'string', description: 'Exact target ref copied from browser_get_targets.' },
                type: { type: 'string', enum: ['textbox', 'checkbox', 'radio', 'combobox', 'slider'], description: 'Type of the field.' },
                value: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'boolean' },
                    { type: 'number' },
                  ],
                  description: 'Value to fill in the field.',
                },
              },
              required: ['name', 'target', 'type', 'value'],
            },
          },
        },
        required: ['fields'],
      },
    },
    {
      name: 'browser_file_upload',
      description: 'Upload one or multiple files to the pending file chooser.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Absolute paths to files to upload. If omitted, the file chooser is cancelled.',
          },
        },
      },
    },
    {
      name: 'browser_drop',
      description: 'Drop files or MIME data onto a target element.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets.' },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Absolute paths to files to drop onto the element.',
          },
          data: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'MIME type to string value map to include in the drop payload.',
          },
        },
        required: ['target'],
      },
    },
    {
      name: 'browser_handle_dialog',
      description: 'Handle a JavaScript dialog opened by a prior action.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          accept: { type: 'boolean', description: 'Whether to accept the dialog.' },
          promptText: { type: 'string', description: 'Text to enter for prompt dialogs.' },
        },
        required: ['accept'],
      },
    },
    {
      name: 'browser_snapshot',
      description: 'Capture an accessibility-style snapshot of the current page with Agrune target refs.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the active session.' },
          boxes: { type: 'boolean', description: 'Include target bounds when available.' },
          depth: { type: 'number', description: 'Accepted for Playwright compatibility.' },
          filename: { type: 'string', description: 'File name to save the snapshot to.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets.' },
          includeTextContent: { type: 'boolean', description: 'Include visible text content of each target element.' },
        },
      },
    },
    {
      name: 'browser_get_targets',
      description:
        'Get a Playwright-style snapshot of manifest-defined actionable targets. By default returns group refs; use groupId/groupIds or mode="full" to expand target refs.',
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
      description: 'Click one actionable target. First call browser_get_targets and copy the exact target ref.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets. Do not invent this value.' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button to click. Defaults to left.' },
          doubleClick: { type: 'boolean', description: 'Perform a double click instead of a single click.' },
          modifiers: {
            type: 'array',
            description: 'Modifier keys to press during the click.',
            items: { type: 'string', enum: ['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'] },
          },
        },
        required: ['target'],
      },
    },
    {
      name: 'browser_double_click',
      description: 'Double-click one actionable target. Use only when the user explicitly asks for a double-click or the target semantics require it.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['target'],
      },
    },
    {
      name: 'browser_right_click',
      description: 'Right-click one actionable target to open its context menu. Use only when the user asks for a context menu.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['target'],
      },
    },
    {
      name: 'browser_hover',
      description: 'Hover one actionable target. Use when hover reveals UI.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['target'],
      },
    },
    {
      name: 'browser_long_press',
      description: 'Long-press one actionable target for touch-style long press interactions.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets. Do not invent this value.' },
        },
        required: ['target'],
      },
    },
    {
      name: 'browser_fill',
      description: 'Fill an input element with a value. The element is identified by its target ref from the page snapshot.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          element: { type: 'string', description: 'Human-readable element description used to describe the intended interaction.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets. Do not invent this value.' },
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
        required: ['target', 'value'],
      },
    },
    {
      name: 'browser_drag',
      description: 'Drag a source target to a destination target or destination coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          startElement: { type: 'string', description: 'Human-readable source element description.' },
          startTarget: { type: 'string', description: 'Exact source target ref copied from browser_get_targets.' },
          endElement: { type: 'string', description: 'Human-readable destination element description.' },
          endTarget: { type: 'string', description: 'Exact destination target ref copied from browser_get_targets.' },
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
        required: ['startTarget'],
      },
    },
    {
      name: 'browser_pointer',
      description: 'Execute a low-level pointer/wheel event sequence. Use target from a snapshot when possible; use coords only for canvas or freeform interactions.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets.' },
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
      description: 'Wait for a target state, text to appear/disappear, or a duration.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
          target: { type: 'string', description: 'Exact target ref copied from browser_get_targets.' },
          state: {
            type: 'string',
            enum: ['visible', 'hidden', 'enabled', 'disabled'],
            description: 'The state to wait for.',
          },
          text: { type: 'string', description: 'Text to wait for.' },
          textGone: { type: 'string', description: 'Text to wait for to disappear.' },
          time: { type: 'number', description: 'Time to wait in seconds.' },
          timeoutMs: { type: 'number', description: 'Timeout in milliseconds. Defaults to 30000.' },
        },
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
