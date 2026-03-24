import { describe, it, expect } from 'vitest'
import { getToolDefinitions } from '../src/tools'

describe('getToolDefinitions', () => {
  const tools = getToolDefinitions()

  it('defines all 8 required tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toEqual([
      'rune_sessions',
      'rune_snapshot',
      'rune_act',
      'rune_fill',
      'rune_drag',
      'rune_wait',
      'rune_guide',
      'rune_config',
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

  it('rune_act requires targetId', () => {
    const act = tools.find((t) => t.name === 'rune_act')!
    expect(act.inputSchema.required).toContain('targetId')
  })

  it('rune_fill requires targetId and value', () => {
    const fill = tools.find((t) => t.name === 'rune_fill')!
    expect(fill.inputSchema.required).toContain('targetId')
    expect(fill.inputSchema.required).toContain('value')
  })

  it('rune_drag requires sourceTargetId and destinationTargetId', () => {
    const drag = tools.find((t) => t.name === 'rune_drag')!
    expect(drag.inputSchema.required).toContain('sourceTargetId')
    expect(drag.inputSchema.required).toContain('destinationTargetId')
  })

  it('rune_wait requires targetId and state', () => {
    const wait = tools.find((t) => t.name === 'rune_wait')!
    expect(wait.inputSchema.required).toContain('targetId')
    expect(wait.inputSchema.required).toContain('state')
  })

  it('rune_guide requires targetId', () => {
    const guide = tools.find((t) => t.name === 'rune_guide')!
    expect(guide.inputSchema.required).toContain('targetId')
  })

  it('rune_snapshot supports optional tab selection and group expansion controls', () => {
    const snapshot = tools.find((t) => t.name === 'rune_snapshot')!
    expect(snapshot.inputSchema.properties).toHaveProperty('tabId')
    expect(snapshot.inputSchema.properties).toHaveProperty('groupId')
    expect(snapshot.inputSchema.properties).toHaveProperty('groupIds')
    expect(snapshot.inputSchema.properties).toHaveProperty('mode')
    expect(snapshot.inputSchema.required ?? []).not.toContain('tabId')
  })

  it('rune_sessions has no required properties', () => {
    const sessions = tools.find((t) => t.name === 'rune_sessions')!
    expect(sessions.inputSchema.required ?? []).toEqual([])
  })

  it('rune_config has all optional config properties', () => {
    const config = tools.find((t) => t.name === 'rune_config')!
    const props = config.inputSchema.properties ?? {}
    expect(props).toHaveProperty('pointerAnimation')
    expect(props).toHaveProperty('auroraGlow')
    expect(props).toHaveProperty('auroraTheme')
    expect(props).toHaveProperty('clickDelayMs')
    expect(props).toHaveProperty('autoScroll')
    expect(config.inputSchema.required ?? []).toEqual([])
  })
})
