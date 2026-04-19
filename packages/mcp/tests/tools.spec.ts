import { describe, it, expect } from 'vitest'
import { getToolDefinitions } from '../src/tools'
import { registerAgruneTools } from '../src/mcp-tools'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

describe('getToolDefinitions', () => {
  const tools = getToolDefinitions()

  it('defines all 12 required tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toEqual([
      'agrune_sessions',
      'agrune_snapshot',
      'agrune_act',
      'agrune_fill',
      'agrune_drag',
      'agrune_pointer',
      'agrune_wait',
      'agrune_guide',
      'agrune_config',
      'agrune_read',
      'agrune_focus',
      'agrune_manifest_load',
    ])
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

  it('agrune_act requires targetId and has optional action enum', () => {
    const act = tools.find((t) => t.name === 'agrune_act')!
    expect(act.inputSchema.required).toContain('targetId')
    const actionProp = act.inputSchema.properties?.action as Record<string, unknown>
    expect(actionProp.enum).toEqual(['click', 'dblclick', 'contextmenu', 'hover', 'longpress'])
  })

  it('agrune_fill requires targetId and value', () => {
    const fill = tools.find((t) => t.name === 'agrune_fill')!
    expect(fill.inputSchema.required).toContain('targetId')
    expect(fill.inputSchema.required).toContain('value')
  })

  it('agrune_drag requires sourceTargetId and destinationTargetId', () => {
    const drag = tools.find((t) => t.name === 'agrune_drag')!
    expect(drag.inputSchema.required).toContain('sourceTargetId')
    expect(drag.inputSchema.required).toContain('destinationTargetId')
  })

  it('agrune_wait requires targetId and state', () => {
    const wait = tools.find((t) => t.name === 'agrune_wait')!
    expect(wait.inputSchema.required).toContain('targetId')
    expect(wait.inputSchema.required).toContain('state')
  })

  it('agrune_guide requires targetId', () => {
    const guide = tools.find((t) => t.name === 'agrune_guide')!
    expect(guide.inputSchema.required).toContain('targetId')
  })

  it('agrune_snapshot supports optional tab selection and group expansion controls', () => {
    const snapshot = tools.find((t) => t.name === 'agrune_snapshot')!
    expect(snapshot.inputSchema.properties).toHaveProperty('tabId')
    expect(snapshot.inputSchema.properties).toHaveProperty('groupId')
    expect(snapshot.inputSchema.properties).toHaveProperty('groupIds')
    expect(snapshot.inputSchema.properties).toHaveProperty('mode')
    expect(snapshot.inputSchema.properties).toHaveProperty('includeTextContent')
    expect(snapshot.inputSchema.required ?? []).not.toContain('tabId')
  })

  it('agrune_sessions has no required properties', () => {
    const sessions = tools.find((t) => t.name === 'agrune_sessions')!
    expect(sessions.inputSchema.required ?? []).toEqual([])
  })

  it('agrune_read has optional selector', () => {
    const read = tools.find((t) => t.name === 'agrune_read')!
    expect(read.inputSchema.properties).toHaveProperty('selector')
    expect(read.inputSchema.required ?? []).not.toContain('selector')
  })

  it('agrune_config has all optional config properties', () => {
    const config = tools.find((t) => t.name === 'agrune_config')!
    const props = config.inputSchema.properties ?? {}
    expect(props).toHaveProperty('pointerAnimation')
    expect(props).toHaveProperty('auroraGlow')
    expect(props).toHaveProperty('auroraTheme')
    expect(props).toHaveProperty('clickDelayMs')
    expect(props).toHaveProperty('pointerDurationMs')
    expect(props).toHaveProperty('autoScroll')
    expect(config.inputSchema.required ?? []).toEqual([])
  })

  it('agrune_focus exposes tabId and sessionId as optional properties', () => {
    const focus = tools.find((t) => t.name === 'agrune_focus')!
    expect(focus.inputSchema.properties).toHaveProperty('tabId')
    expect(focus.inputSchema.properties).toHaveProperty('sessionId')
    expect(focus.inputSchema.required ?? []).toEqual([])
  })

  it('agrune_focus description mentions switching the active session', () => {
    const focus = tools.find((t) => t.name === 'agrune_focus')!
    expect(focus.description.toLowerCase()).toContain('active')
  })

  it('agrune_manifest_load has required manifest field and optional tabId', () => {
    const tool = tools.find((t) => t.name === 'agrune_manifest_load')!
    expect(tool).toBeDefined()
    expect(tool.inputSchema.required).toContain('manifest')
    expect(tool.inputSchema.properties).toHaveProperty('manifest')
    expect(tool.inputSchema.properties).toHaveProperty('tabId')
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
})
