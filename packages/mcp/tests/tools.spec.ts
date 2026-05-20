import { describe, it, expect } from 'vitest'
import { getToolDefinitions } from '../src/tools'
import { registerAgruneTools } from '../src/mcp-tools'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

describe('getToolDefinitions', () => {
  const tools = getToolDefinitions()

  it('defines all 15 required tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toEqual([
      'browser_list_tabs',
      'browser_open_tab',
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

  it('has exactly 15 tools', () => {
    expect(tools).toHaveLength(15)
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

  it('browser action tools require targetId without an action enum', () => {
    for (const name of ['browser_click', 'browser_double_click', 'browser_right_click', 'browser_hover', 'browser_long_press']) {
      const tool = tools.find((t) => t.name === name)!
      expect(tool.inputSchema.required).toContain('targetId')
      expect(tool.inputSchema.properties).not.toHaveProperty('action')
    }
  })

  it('browser_fill requires targetId and value', () => {
    const fill = tools.find((t) => t.name === 'browser_fill')!
    expect(fill.inputSchema.required).toContain('targetId')
    expect(fill.inputSchema.required).toContain('value')
  })

  it('browser_open_tab requires url', () => {
    const openTab = tools.find((t) => t.name === 'browser_open_tab')!
    expect(openTab.inputSchema.required).toContain('url')
  })

  it('browser_drag requires sourceTargetId and supports target or coordinate destinations', () => {
    const drag = tools.find((t) => t.name === 'browser_drag')!
    expect(drag.inputSchema.required).toContain('sourceTargetId')
    expect(drag.inputSchema.required ?? []).not.toContain('destinationTargetId')
    expect(drag.inputSchema.properties).toHaveProperty('destinationTargetId')
    expect(drag.inputSchema.properties).toHaveProperty('destinationCoords')
  })

  it('browser_wait_for requires targetId and state', () => {
    const wait = tools.find((t) => t.name === 'browser_wait_for')!
    expect(wait.inputSchema.required).toContain('targetId')
    expect(wait.inputSchema.required).toContain('state')
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
    expect(names).not.toContain('agrune_manifest_load')
    expect(names).not.toContain('agrune_macro_run')
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

  it('total registered tool count is 15', () => {
    const registeredNames: string[] = []
    const mockMcp = {
      tool: (name: string) => {
        registeredNames.push(name)
        return mockMcp
      },
    } as unknown as McpServer

    const noopHandler = async () => ({ text: '' })
    registerAgruneTools(mockMcp, noopHandler)

    expect(registeredNames).toHaveLength(15)
  })
})
