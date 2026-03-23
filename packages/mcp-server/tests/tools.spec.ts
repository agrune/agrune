import { describe, it, expect } from 'vitest'
import { getToolDefinitions } from '../src/tools'

describe('getToolDefinitions', () => {
  const tools = getToolDefinitions()

  it('defines all 8 required tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toEqual([
      'webcli_sessions',
      'webcli_snapshot',
      'webcli_act',
      'webcli_fill',
      'webcli_drag',
      'webcli_wait',
      'webcli_guide',
      'webcli_config',
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

  it('webcli_act requires targetId', () => {
    const act = tools.find((t) => t.name === 'webcli_act')!
    expect(act.inputSchema.required).toContain('targetId')
  })

  it('webcli_fill requires targetId and value', () => {
    const fill = tools.find((t) => t.name === 'webcli_fill')!
    expect(fill.inputSchema.required).toContain('targetId')
    expect(fill.inputSchema.required).toContain('value')
  })

  it('webcli_drag requires sourceTargetId and destinationTargetId', () => {
    const drag = tools.find((t) => t.name === 'webcli_drag')!
    expect(drag.inputSchema.required).toContain('sourceTargetId')
    expect(drag.inputSchema.required).toContain('destinationTargetId')
  })

  it('webcli_wait requires targetId and state', () => {
    const wait = tools.find((t) => t.name === 'webcli_wait')!
    expect(wait.inputSchema.required).toContain('targetId')
    expect(wait.inputSchema.required).toContain('state')
  })

  it('webcli_guide requires targetId', () => {
    const guide = tools.find((t) => t.name === 'webcli_guide')!
    expect(guide.inputSchema.required).toContain('targetId')
  })

  it('webcli_snapshot has optional tabId', () => {
    const snapshot = tools.find((t) => t.name === 'webcli_snapshot')!
    expect(snapshot.inputSchema.properties).toHaveProperty('tabId')
    expect(snapshot.inputSchema.required ?? []).not.toContain('tabId')
  })

  it('webcli_sessions has no required properties', () => {
    const sessions = tools.find((t) => t.name === 'webcli_sessions')!
    expect(sessions.inputSchema.required ?? []).toEqual([])
  })

  it('webcli_config has all optional config properties', () => {
    const config = tools.find((t) => t.name === 'webcli_config')!
    const props = config.inputSchema.properties ?? {}
    expect(props).toHaveProperty('pointerAnimation')
    expect(props).toHaveProperty('auroraGlow')
    expect(props).toHaveProperty('auroraTheme')
    expect(props).toHaveProperty('clickDelayMs')
    expect(props).toHaveProperty('autoScroll')
    expect(config.inputSchema.required ?? []).toEqual([])
  })
})
