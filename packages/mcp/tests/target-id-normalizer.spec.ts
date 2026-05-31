/**
 * target-id-normalizer.spec.ts — Phase 15-03 (REPEAT-03)
 *
 * normalizeAgentTargetId: AI-facing dot-bracket → runtime delimiter 정규화
 * - Test 1-6: 정상 입력 (passthrough + 변환)
 * - Test 7-11: 잘못된 입력 (throw AgentTargetIdParseError)
 * - Test 12-13: ReDoS / 성능 (linear-time scan)
 * - Test 14-16: MCP tool handler 배선 확인
 */
import { describe, it, expect, vi } from 'vitest'
import {
  normalizeAgentTargetId,
  AgentTargetIdParseError,
  toAgentTargetRef,
} from '../src/target-id-normalizer'

const REPEATED_TARGET_KEY_DELIMITER = '__agrune_repeatKey_'

// ---------------------------------------------------------------------------
// 정상 입력 — passthrough + 변환
// ---------------------------------------------------------------------------

describe('normalizeAgentTargetId — valid inputs', () => {
  it('Test 1: 일반 targetId (bracket 없음) → passthrough', () => {
    expect(normalizeAgentTargetId('like_btn')).toBe('like_btn')
  })

  it('Test 2: dot-bracket → runtime delimiter 변환', () => {
    const result = normalizeAgentTargetId('posts[postId=abc123].like_btn')
    expect(result).toBe(`posts${REPEATED_TARGET_KEY_DELIMITER}abc123.like_btn`)
  })

  it('Test 3: 공백 포함 bracket → 값 trim 후 변환', () => {
    const result = normalizeAgentTargetId('posts[postId = abc123].like_btn')
    expect(result).toBe(`posts${REPEATED_TARGET_KEY_DELIMITER}abc123.like_btn`)
  })

  it('Test 4: key에 bracket 포함 → rightmost ] 스캔으로 nested bracket 지원', () => {
    const result = normalizeAgentTargetId('posts[postId=abc[123]].like_btn')
    expect(result).toBe(`posts${REPEATED_TARGET_KEY_DELIMITER}abc[123].like_btn`)
  })

  it('Test 5: nested base targetId (dot 다중) → 전체 base 유지', () => {
    const result = normalizeAgentTargetId('posts[postId=abc].inner.deep')
    expect(result).toBe(`posts${REPEATED_TARGET_KEY_DELIMITER}abc.inner.deep`)
  })

  it('Test 6: 이미 runtime 형식이면 passthrough', () => {
    const already = `posts${REPEATED_TARGET_KEY_DELIMITER}abc.like_btn`
    expect(normalizeAgentTargetId(already)).toBe(already)
  })

  it('Test 6b: runtime repeat targetId -> public ref -> runtime round-trip', () => {
    const runtimeTargetId = `posts${REPEATED_TARGET_KEY_DELIMITER}abc.like_btn`
    const ref = toAgentTargetRef({
      targetId: runtimeTargetId,
      repeatInstance: { repeatId: 'posts', index: 0, key: 'abc' },
    })
    expect(ref).toBe('posts[key=abc].like_btn')
    expect(normalizeAgentTargetId(ref)).toBe(runtimeTargetId)
  })
})

// ---------------------------------------------------------------------------
// 잘못된 입력 — throw AgentTargetIdParseError
// ---------------------------------------------------------------------------

describe('normalizeAgentTargetId — invalid inputs', () => {
  it('Test 7: 여닫는 bracket 불일치 → throw', () => {
    expect(() => normalizeAgentTargetId('posts[postId=abc.like_btn')).toThrow(AgentTargetIdParseError)
  })

  it('Test 8: bracket 내부에 = 없음 → throw', () => {
    expect(() => normalizeAgentTargetId('posts[abc].like_btn')).toThrow(AgentTargetIdParseError)
  })

  it('Test 9: 빈 key → throw', () => {
    expect(() => normalizeAgentTargetId('posts[postId=].like_btn')).toThrow(AgentTargetIdParseError)
  })

  it('Test 10: bracket 후 . 없음 → throw', () => {
    expect(() => normalizeAgentTargetId('posts[postId=abc]')).toThrow(AgentTargetIdParseError)
  })

  it('Test 11: ] 만 있고 [ 없음 → passthrough (일반 targetId로 간주)', () => {
    // bracket이 없으면 early-return
    const input = 'posts]xyz'
    // indexOf('[') < 0이면 passthrough
    expect(normalizeAgentTargetId(input)).toBe(input)
  })
})

// ---------------------------------------------------------------------------
// ReDoS / 성능 (linear-time scan, no backtracking regex)
// ---------------------------------------------------------------------------

describe('normalizeAgentTargetId — ReDoS / 성능', () => {
  it('Test 12: 10,000자 입력을 100ms 이내 처리', () => {
    const longInput = 'a'.repeat(9990) + '.btn'
    const start = performance.now()
    // bracket 없으면 early-return
    const result = normalizeAgentTargetId(longInput)
    const elapsed = performance.now() - start
    expect(result).toBe(longInput)
    expect(elapsed).toBeLessThan(100)
  })

  it('Test 13: ] 반복 edge case에서 조기 종료 (bracket 없으면 early-return)', () => {
    const input = ']'.repeat(1000)
    const start = performance.now()
    const result = normalizeAgentTargetId(input)
    const elapsed = performance.now() - start
    // ] 만 있고 [ 없으면 passthrough
    expect(result).toBe(input)
    expect(elapsed).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// MCP tool handler 배선 확인
// ---------------------------------------------------------------------------

describe('MCP tool handler 배선 — normalizeAgentTargetId 통과', () => {
  it('Test 14: browser_click tool 호출 시 target ref normalize 통과 후 handleToolCall 전달', async () => {
    const { registerAgruneTools } = await import('../src/mcp-tools')

    const calledWithArgs: Array<{ name: string; args: Record<string, unknown> }> = []
    const mockHandler = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calledWithArgs.push({ name, args })
      return { text: '{"ok":true}' }
    })

    const handlers: Array<{
      name: string
      handler: (args: Record<string, unknown>) => Promise<unknown>
    }> = []
    const mockMcp = {
      tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
        handlers.push({ name, handler })
        return mockMcp
      },
    } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer

    registerAgruneTools(mockMcp, mockHandler)

    const actHandler = handlers.find(h => h.name === 'browser_click')!
    expect(actHandler).toBeDefined()

    // dot-bracket target ref 전달
    await actHandler.handler({
      target: 'posts[postId=abc123].like_btn',
      button: 'middle',
      doubleClick: true,
      modifiers: ['Alt', 'Shift'],
    })

    expect(mockHandler).toHaveBeenCalledOnce()
    const callArgs = calledWithArgs[0]!
    expect(callArgs.name).toBe('browser_click')
    // normalize 후 runtime delimiter 형식으로 전달돼야 함
    expect(callArgs.args.targetId).toBe(`posts${REPEATED_TARGET_KEY_DELIMITER}abc123.like_btn`)
    expect(callArgs.args.action).toBe('dblclick')
    expect(callArgs.args.button).toBe('middle')
    expect(callArgs.args.modifiers).toEqual(['Alt', 'Shift'])
  })

  it('Test 15: browser_fill, browser_wait_for, browser_pointer 모두 normalize 적용', async () => {
    const { registerAgruneTools } = await import('../src/mcp-tools')

    const calledArgs: Record<string, Record<string, unknown>> = {}
    const mockHandler = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calledArgs[name] = args
      return { text: '{"ok":true}' }
    })

    const handlers: Array<{
      name: string
      handler: (args: Record<string, unknown>) => Promise<unknown>
    }> = []
    const mockMcp = {
      tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
        handlers.push({ name, handler })
        return mockMcp
      },
    } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer

    registerAgruneTools(mockMcp, mockHandler)

    const toolsToTest = ['browser_fill', 'browser_type', 'browser_select_option', 'browser_fill_form', 'browser_wait_for', 'browser_take_screenshot', 'browser_evaluate', 'browser_snapshot']
    for (const toolName of toolsToTest) {
      const h = handlers.find(hh => hh.name === toolName)!
      expect(h).toBeDefined()
      const extraArgs = toolName === 'browser_fill' ? { value: 'hello' }
        : toolName === 'browser_type' ? { text: 'hello' }
        : toolName === 'browser_select_option' ? { values: ['kr'] }
        : toolName === 'browser_fill_form' ? { fields: [{ name: 'Like', target: 'posts[postId=abc].like_btn', type: 'textbox', value: 'hello' }] }
        : toolName === 'browser_wait_for' ? { state: 'visible' }
        : toolName === 'browser_take_screenshot' ? { filename: 'out.png' }
        : toolName === 'browser_evaluate' ? { function: '(element) => element.textContent' }
        : {}
      const baseArgs = toolName === 'browser_fill_form'
        ? extraArgs
        : { target: 'posts[postId=abc].like_btn', ...extraArgs }
      await h.handler(baseArgs)
    }

    for (const toolName of toolsToTest) {
      if (toolName === 'browser_fill_form') {
        const fields = calledArgs[toolName]?.fields as Array<{ targetId?: string }>
        expect(fields[0]?.targetId).toBe(`posts${REPEATED_TARGET_KEY_DELIMITER}abc.like_btn`)
      } else {
        expect(calledArgs[toolName]?.targetId).toBe(`posts${REPEATED_TARGET_KEY_DELIMITER}abc.like_btn`)
      }
    }

    // browser_pointer: targetId optional
    const pointerH = handlers.find(hh => hh.name === 'browser_pointer')!
    await pointerH.handler({ target: 'posts[postId=abc].like_btn', actions: [] })
    expect(calledArgs['browser_pointer']?.targetId).toBe(`posts${REPEATED_TARGET_KEY_DELIMITER}abc.like_btn`)
  })

  it('browser_wait_for text/time modes bypass target normalization', async () => {
    const { registerAgruneTools } = await import('../src/mcp-tools')

    const calledArgs: Array<Record<string, unknown>> = []
    const mockHandler = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      calledArgs.push(args)
      return { text: '{"ok":true}' }
    })

    const handlers: Array<{
      name: string
      handler: (args: Record<string, unknown>) => Promise<unknown>
    }> = []
    const mockMcp = {
      tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
        handlers.push({ name, handler })
        return mockMcp
      },
    } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer

    registerAgruneTools(mockMcp, mockHandler)
    const wait = handlers.find(h => h.name === 'browser_wait_for')!

    await wait.handler({ text: 'Ready' })
    await wait.handler({ textGone: 'Loading' })
    await wait.handler({ time: 0.25 })

    expect(calledArgs).toEqual([
      { text: 'Ready' },
      { textGone: 'Loading' },
      { timeMs: 250 },
    ])
  })

  it('browser_evaluate and browser_take_screenshot allow selector targets', async () => {
    const { registerAgruneTools } = await import('../src/mcp-tools')

    const calledArgs: Record<string, Record<string, unknown>> = {}
    const mockHandler = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calledArgs[name] = args
      return { text: '{"ok":true}' }
    })

    const handlers: Array<{
      name: string
      handler: (args: Record<string, unknown>) => Promise<unknown>
    }> = []
    const mockMcp = {
      tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
        handlers.push({ name, handler })
        return mockMcp
      },
    } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer

    registerAgruneTools(mockMcp, mockHandler)

    await handlers.find(h => h.name === 'browser_evaluate')!.handler({
      target: '[data-testid="save-button"]',
      function: '(element) => element.textContent',
    })
    await handlers.find(h => h.name === 'browser_take_screenshot')!.handler({
      target: '[data-testid="save-button"]',
      filename: 'out.png',
    })

    expect(calledArgs['browser_evaluate']?.targetId).toBe('[data-testid="save-button"]')
    expect(calledArgs['browser_take_screenshot']?.targetId).toBe('[data-testid="save-button"]')
  })

  it('Test 16: normalize 에러 발생 시 INVALID_TARGET 반환 (handleToolCall 호출되지 않음)', async () => {
    const { registerAgruneTools } = await import('../src/mcp-tools')

    const mockHandler = vi.fn(async () => ({ text: '{"ok":true}' }))

    const handlers: Array<{
      name: string
      handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>, isError?: boolean }>
    }> = []
    const mockMcp = {
      tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
        handlers.push({ name, handler: handler as never })
        return mockMcp
      },
    } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer

    registerAgruneTools(mockMcp, mockHandler)

    const actHandler = handlers.find(h => h.name === 'browser_click')!
    // 잘못된 bracket — = 없음
    const result = await actHandler.handler({ target: 'posts[abc].like_btn' })

    expect(mockHandler).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    const text = result.content[0]?.text ?? ''
    expect(text).toContain('INVALID_TARGET')
  })
})
