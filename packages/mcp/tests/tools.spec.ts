import { describe, it, expect } from 'vitest'
import { getToolDefinitions } from '../src/tools'
import { registerAgruneTools } from '../src/mcp-tools'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

describe('getToolDefinitions', () => {
  const tools = getToolDefinitions()

  it('defines all 34 required tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toEqual([
      'browser_list_tabs',
      'browser_open_tab',
      'browser_tabs',
      'browser_close',
      'browser_navigate',
      'browser_navigate_back',
      'browser_resize',
      'browser_take_screenshot',
      'browser_evaluate',
      'browser_run_code_unsafe',
      'browser_console_messages',
      'browser_network_requests',
      'browser_network_request',
      'browser_press_key',
      'browser_type',
      'browser_select_option',
      'browser_fill_form',
      'browser_file_upload',
      'browser_drop',
      'browser_handle_dialog',
      'browser_snapshot',
      'browser_get_targets',
      'browser_click',
      'browser_double_click',
      'browser_right_click',
      'browser_hover',
      'browser_long_press',
      'browser_fill',
      'browser_drag',
      'browser_pointer',
      'browser_wait_for',
      'browser_update_config',
      'browser_read',
      'browser_focus_tab',
    ])
  })

  it('has exactly 34 tools', () => {
    expect(tools).toHaveLength(34)
  })

  it('every tool has name, description, and inputSchema', () => {
    for (const tool of tools) {
      expect(tool.name).toBeTypeOf('string')
      expect(tool.description).toBeTypeOf('string')
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema.type).toBe('object')
    }
  })

  it('tool descriptions do not expose internal actionKinds guidance', () => {
    for (const tool of tools) {
      expect(tool.description).not.toContain('actionKinds')
    }
  })

  it('browser action tools require Playwright-style target refs without an action enum', () => {
    for (const name of ['browser_click', 'browser_double_click', 'browser_right_click', 'browser_hover', 'browser_long_press']) {
      const tool = tools.find((t) => t.name === name)!
      expect(tool.inputSchema.required).toContain('target')
      expect(tool.inputSchema.properties).toHaveProperty('target')
      expect(tool.inputSchema.properties).toHaveProperty('element')
      expect(tool.inputSchema.properties).not.toHaveProperty('targetId')
      expect(tool.inputSchema.properties).not.toHaveProperty('action')
    }
  })

  it('browser_click supports Playwright-style click options', () => {
    const click = tools.find((t) => t.name === 'browser_click')!
    expect(click.inputSchema.properties).toHaveProperty('button')
    expect(click.inputSchema.properties).toHaveProperty('doubleClick')
    expect(click.inputSchema.properties).toHaveProperty('modifiers')
  })

  it('browser_fill requires target and value', () => {
    const fill = tools.find((t) => t.name === 'browser_fill')!
    expect(fill.inputSchema.required).toContain('target')
    expect(fill.inputSchema.required).toContain('value')
    expect(fill.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_open_tab requires url', () => {
    const openTab = tools.find((t) => t.name === 'browser_open_tab')!
    expect(openTab.inputSchema.required).toContain('url')
  })

  it('browser_tabs uses Playwright-style action plus optional url/index', () => {
    const tabs = tools.find((t) => t.name === 'browser_tabs')!
    expect(tabs.inputSchema.required).toContain('action')
    expect(tabs.inputSchema.properties).toHaveProperty('action')
    expect(tabs.inputSchema.properties).toHaveProperty('url')
    expect(tabs.inputSchema.properties).toHaveProperty('index')
  })

  it('browser_close has no required properties', () => {
    const close = tools.find((t) => t.name === 'browser_close')!
    expect(close.inputSchema.required ?? []).toEqual([])
  })

  it('browser_navigate requires url and browser_navigate_back has no required properties', () => {
    const navigate = tools.find((t) => t.name === 'browser_navigate')!
    const back = tools.find((t) => t.name === 'browser_navigate_back')!
    expect(navigate.inputSchema.required).toContain('url')
    expect(navigate.inputSchema.properties).toHaveProperty('url')
    expect(back.inputSchema.required ?? []).toEqual([])
  })

  it('browser_resize requires width and height', () => {
    const resize = tools.find((t) => t.name === 'browser_resize')!
    expect(resize.inputSchema.required).toEqual(['width', 'height'])
    expect(resize.inputSchema.properties).toHaveProperty('width')
    expect(resize.inputSchema.properties).toHaveProperty('height')
  })

  it('browser_take_screenshot supports Playwright-style filename, fullPage, target, and type', () => {
    const screenshot = tools.find((t) => t.name === 'browser_take_screenshot')!
    expect(screenshot.inputSchema.required ?? []).toEqual([])
    expect(screenshot.inputSchema.properties).toHaveProperty('filename')
    expect(screenshot.inputSchema.properties).toHaveProperty('fullPage')
    expect(screenshot.inputSchema.properties).toHaveProperty('element')
    expect(screenshot.inputSchema.properties).toHaveProperty('target')
    expect(screenshot.inputSchema.properties).toHaveProperty('type')
    expect(screenshot.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_evaluate requires function and supports optional target and filename', () => {
    const evaluate = tools.find((t) => t.name === 'browser_evaluate')!
    expect(evaluate.inputSchema.required).toEqual(['function'])
    expect(evaluate.inputSchema.properties).toHaveProperty('function')
    expect(evaluate.inputSchema.properties).toHaveProperty('target')
    expect(evaluate.inputSchema.properties).toHaveProperty('element')
    expect(evaluate.inputSchema.properties).toHaveProperty('filename')
    expect(evaluate.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_run_code_unsafe accepts code or filename without target args', () => {
    const runCode = tools.find((t) => t.name === 'browser_run_code_unsafe')!
    expect(runCode.inputSchema.required ?? []).toEqual([])
    expect(runCode.inputSchema.properties).toHaveProperty('code')
    expect(runCode.inputSchema.properties).toHaveProperty('filename')
    expect(runCode.inputSchema.properties).not.toHaveProperty('target')
    expect(runCode.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_console_messages supports level, all, and filename', () => {
    const consoleMessages = tools.find((t) => t.name === 'browser_console_messages')!
    expect(consoleMessages.inputSchema.required ?? []).toEqual([])
    expect(consoleMessages.inputSchema.properties).toHaveProperty('level')
    expect(consoleMessages.inputSchema.properties).toHaveProperty('all')
    expect(consoleMessages.inputSchema.properties).toHaveProperty('filename')
    expect(consoleMessages.inputSchema.properties).toHaveProperty('tabId')
  })

  it('browser_network tools support Playwright-style list and detail args', () => {
    const requests = tools.find((t) => t.name === 'browser_network_requests')!
    expect(requests.inputSchema.required ?? []).toEqual([])
    expect(requests.inputSchema.properties).toHaveProperty('filter')
    expect(requests.inputSchema.properties).toHaveProperty('static')
    expect(requests.inputSchema.properties).toHaveProperty('filename')
    expect(requests.inputSchema.properties).toHaveProperty('tabId')

    const request = tools.find((t) => t.name === 'browser_network_request')!
    expect(request.inputSchema.required).toEqual(['index'])
    expect(request.inputSchema.properties).toHaveProperty('index')
    expect(request.inputSchema.properties).toHaveProperty('part')
    expect(request.inputSchema.properties).toHaveProperty('filename')
    expect(request.inputSchema.properties).toHaveProperty('tabId')
  })

  it('browser_press_key requires a key', () => {
    const press = tools.find((t) => t.name === 'browser_press_key')!
    expect(press.inputSchema.required).toEqual(['key'])
    expect(press.inputSchema.properties).toHaveProperty('key')
    expect(press.inputSchema.properties).toHaveProperty('tabId')
  })

  it('browser_type requires target and text', () => {
    const type = tools.find((t) => t.name === 'browser_type')!
    expect(type.inputSchema.required).toEqual(['target', 'text'])
    expect(type.inputSchema.properties).toHaveProperty('target')
    expect(type.inputSchema.properties).toHaveProperty('element')
    expect(type.inputSchema.properties).toHaveProperty('text')
    expect(type.inputSchema.properties).toHaveProperty('slowly')
    expect(type.inputSchema.properties).toHaveProperty('submit')
    expect(type.inputSchema.properties).toHaveProperty('tabId')
    expect(type.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_select_option requires target and values', () => {
    const select = tools.find((t) => t.name === 'browser_select_option')!
    expect(select.inputSchema.required).toEqual(['target', 'values'])
    expect(select.inputSchema.properties).toHaveProperty('target')
    expect(select.inputSchema.properties).toHaveProperty('element')
    expect(select.inputSchema.properties).toHaveProperty('values')
    expect(select.inputSchema.properties).toHaveProperty('tabId')
    expect(select.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_fill_form requires fields with Playwright-style targets', () => {
    const fillForm = tools.find((t) => t.name === 'browser_fill_form')!
    expect(fillForm.inputSchema.required).toEqual(['fields'])
    expect(fillForm.inputSchema.properties).toHaveProperty('fields')
    expect(fillForm.inputSchema.properties).toHaveProperty('tabId')
    const fields = fillForm.inputSchema.properties?.fields as { items?: { properties?: Record<string, unknown>; required?: string[] } }
    expect(fields.items?.required).toEqual(['name', 'target', 'type', 'value'])
    expect(fields.items?.properties).toHaveProperty('target')
    expect(fields.items?.properties).toHaveProperty('element')
    expect(fields.items?.properties).not.toHaveProperty('targetId')
  })

  it('browser_file_upload accepts optional paths without a target', () => {
    const upload = tools.find((t) => t.name === 'browser_file_upload')!
    expect(upload.inputSchema.required ?? []).toEqual([])
    expect(upload.inputSchema.properties).toHaveProperty('paths')
    expect(upload.inputSchema.properties).toHaveProperty('tabId')
    expect(upload.inputSchema.properties).not.toHaveProperty('target')
    expect(upload.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_drop requires target and accepts data or paths', () => {
    const drop = tools.find((t) => t.name === 'browser_drop')!
    expect(drop.inputSchema.required).toEqual(['target'])
    expect(drop.inputSchema.properties).toHaveProperty('target')
    expect(drop.inputSchema.properties).toHaveProperty('element')
    expect(drop.inputSchema.properties).toHaveProperty('data')
    expect(drop.inputSchema.properties).toHaveProperty('paths')
    expect(drop.inputSchema.properties).toHaveProperty('tabId')
    expect(drop.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_handle_dialog requires accept and supports promptText', () => {
    const dialog = tools.find((t) => t.name === 'browser_handle_dialog')!
    expect(dialog.inputSchema.required).toEqual(['accept'])
    expect(dialog.inputSchema.properties).toHaveProperty('accept')
    expect(dialog.inputSchema.properties).toHaveProperty('promptText')
    expect(dialog.inputSchema.properties).toHaveProperty('tabId')
    expect(dialog.inputSchema.properties).not.toHaveProperty('target')
    expect(dialog.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_snapshot supports Playwright-style snapshot args', () => {
    const snapshot = tools.find((t) => t.name === 'browser_snapshot')!
    expect(snapshot.inputSchema.required ?? []).toEqual([])
    expect(snapshot.inputSchema.properties).toHaveProperty('boxes')
    expect(snapshot.inputSchema.properties).toHaveProperty('depth')
    expect(snapshot.inputSchema.properties).toHaveProperty('filename')
    expect(snapshot.inputSchema.properties).toHaveProperty('target')
    expect(snapshot.inputSchema.properties).toHaveProperty('tabId')
    expect(snapshot.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_drag requires startTarget and supports target or coordinate destinations', () => {
    const drag = tools.find((t) => t.name === 'browser_drag')!
    expect(drag.inputSchema.required).toContain('startTarget')
    expect(drag.inputSchema.required ?? []).not.toContain('endTarget')
    expect(drag.inputSchema.properties).toHaveProperty('endTarget')
    expect(drag.inputSchema.properties).toHaveProperty('destinationCoords')
    expect(drag.inputSchema.properties).not.toHaveProperty('sourceTargetId')
    expect(drag.inputSchema.properties).not.toHaveProperty('destinationTargetId')
  })

  it('browser_wait_for supports target, text, textGone, and time modes', () => {
    const wait = tools.find((t) => t.name === 'browser_wait_for')!
    expect(wait.inputSchema.required ?? []).toEqual([])
    expect(wait.inputSchema.properties).toHaveProperty('target')
    expect(wait.inputSchema.properties).toHaveProperty('state')
    expect(wait.inputSchema.properties).toHaveProperty('text')
    expect(wait.inputSchema.properties).toHaveProperty('textGone')
    expect(wait.inputSchema.properties).toHaveProperty('time')
    expect(wait.inputSchema.properties).not.toHaveProperty('targetId')
  })

  it('browser_get_targets supports optional tab selection and group expansion controls', () => {
    const snapshot = tools.find((t) => t.name === 'browser_get_targets')!
    expect(snapshot.inputSchema.properties).toHaveProperty('tabId')
    expect(snapshot.inputSchema.properties).toHaveProperty('groupId')
    expect(snapshot.inputSchema.properties).toHaveProperty('groupIds')
    expect(snapshot.inputSchema.properties).toHaveProperty('mode')
    expect(snapshot.inputSchema.properties).toHaveProperty('includeTextContent')
    expect(snapshot.inputSchema.required ?? []).not.toContain('tabId')
  })

  it('browser_list_tabs has no required properties', () => {
    const sessions = tools.find((t) => t.name === 'browser_list_tabs')!
    expect(sessions.inputSchema.required ?? []).toEqual([])
  })

  it('browser_read only needs optional tab selection', () => {
    const read = tools.find((t) => t.name === 'browser_read')!
    expect(read.inputSchema.properties).toHaveProperty('tabId')
    expect(read.inputSchema.properties).not.toHaveProperty('selector')
  })

  it('browser_update_config has all optional config properties', () => {
    const config = tools.find((t) => t.name === 'browser_update_config')!
    const props = config.inputSchema.properties ?? {}
    expect(props).toHaveProperty('pointerAnimation')
    expect(props).toHaveProperty('auroraGlow')
    expect(props).toHaveProperty('auroraTheme')
    expect(props).toHaveProperty('clickDelayMs')
    expect(props).toHaveProperty('pointerDurationMs')
    expect(props).toHaveProperty('autoScroll')
    expect(config.inputSchema.required ?? []).toEqual([])
  })

  it('browser_focus_tab exposes tabId and sessionId as optional properties', () => {
    const focus = tools.find((t) => t.name === 'browser_focus_tab')!
    expect(focus.inputSchema.properties).toHaveProperty('tabId')
    expect(focus.inputSchema.properties).toHaveProperty('sessionId')
    expect(focus.inputSchema.required ?? []).toEqual([])
  })

  it('browser_focus_tab description mentions switching the active tab', () => {
    const focus = tools.find((t) => t.name === 'browser_focus_tab')!
    expect(focus.description.toLowerCase()).toContain('active')
  })

  it('does not expose manifest authoring or macro tools to regular agents', () => {
    const names = tools.map((t) => t.name)
    expect(names.some((name) => name.includes('manifest') || name.includes('macro'))).toBe(false)
  })
})

describe('tool registration parity — mcp-tools.ts vs tools.ts', () => {
  it('registered tool names exactly match getToolDefinitions() names (Pitfall 6)', () => {
    const registeredNames: string[] = []
    const mockMcp = {
      tool: (name: string) => {
        registeredNames.push(name)
        return mockMcp
      },
    } as unknown as McpServer

    const noopHandler = async () => ({ text: '' })
    registerAgruneTools(mockMcp, noopHandler)

    const definitionNames = getToolDefinitions().map(d => d.name).sort()
    expect([...registeredNames].sort()).toEqual(definitionNames)
  })

  it('total registered tool count is 34', () => {
    const registeredNames: string[] = []
    const mockMcp = {
      tool: (name: string) => {
        registeredNames.push(name)
        return mockMcp
      },
    } as unknown as McpServer

    const noopHandler = async () => ({ text: '' })
    registerAgruneTools(mockMcp, noopHandler)

    expect(registeredNames).toHaveLength(34)
  })

  it('registered tool descriptions do not expose internal actionKinds guidance', () => {
    const registeredDescriptions: string[] = []
    const mockMcp = {
      tool: (_name: string, description: string) => {
        registeredDescriptions.push(description)
        return mockMcp
      },
    } as unknown as McpServer

    const noopHandler = async () => ({ text: '' })
    registerAgruneTools(mockMcp, noopHandler)

    for (const description of registeredDescriptions) {
      expect(description).not.toContain('actionKinds')
    }
  })
})
