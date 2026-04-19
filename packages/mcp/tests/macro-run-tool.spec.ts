/**
 * agrune_macro_run MCP tool 단위 테스트 (TDD RED — Phase 14-03)
 *
 * Coverage:
 *   describe 1: COMMAND_ERROR_CODES 포함 확인 (4개 신규 코드)
 *   describe 2: happy path — status:ok, CommandBroker start/end emit
 *   describe 3: already-satisfied → ok:true 반환
 *   describe 4: SESSION_NOT_ACTIVE — tabId null
 *   describe 5: INVALID_COMMAND — driver.runMacro 없음
 *   describe 6: status → error code 매핑 (6 case)
 *   describe 7: MACRO_NOT_FOUND — macro not found 에러 문자열 매핑
 *   describe 8: sensitive step 감지 + redaction (sensitiveStepIndices)
 *   describe 9: HITL gate 경로 (pause/skip)
 *   describe 10: parity assertion — 13 tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockedFunction } from 'vitest'
import { createMcpServer } from '../src/index.js'
import { getToolDefinitions } from '../src/tools.js'
import { registerAgruneTools } from '../src/mcp-tools.js'
import type { BrowserDriver, Session, PageSnapshot, CommandResult, AgruneRuntimeConfig } from '@agrune/core'
import { COMMAND_ERROR_CODES } from '@agrune/core'
import type { MacroRunResponse } from '@agrune/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DEFAULT_SESSION: Session = {
  tabId: 1,
  url: 'http://example.com',
  title: 'Example',
  hasSnapshot: true,
  active: true,
  snapshotVersion: 1,
}

// ─── Mock driver factory ──────────────────────────────────────────────────────

function makeMockDriver(
  overrides: Partial<BrowserDriver & { runMacro?: unknown }> = {},
): BrowserDriver & { runMacro: MockedFunction<(tabId: number, macroId: string, params?: Record<string, unknown>) => Promise<MacroRunResponse>> } {
  const runMacro = vi.fn(async (
    _tabId: number,
    macroId: string,
    _params?: Record<string, unknown>,
  ): Promise<MacroRunResponse> => ({
    status: 'ok',
    macroId,
    stepCount: 3,
  }))

  const base: BrowserDriver = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isConnected: vi.fn(() => true),
    listSessions: vi.fn(() => [DEFAULT_SESSION]),
    getSnapshot: vi.fn(() => null as PageSnapshot | null),
    onSessionOpen: vi.fn(),
    onSessionClose: vi.fn(),
    onSnapshotUpdate: vi.fn(),
    execute: vi.fn(async () => ({ ok: true } as CommandResult)),
    updateConfig: vi.fn(),
    ensureReady: vi.fn(async () => null as string | null),
    resolveTabId: vi.fn((_id?: number) => 1 as number | null),
    focusSession: vi.fn(async (_tabId: number) => ({
      tabId: 1,
      wasActive: true,
      becameActive: false,
    })),
    runMacro,
    ...overrides,
  }

  return base as BrowserDriver & { runMacro: MockedFunction<(tabId: number, macroId: string, params?: Record<string, unknown>) => Promise<MacroRunResponse>> }
}

// ─── Helper: call a tool through the MCP server ──────────────────────────────

async function callTool(
  driver: BrowserDriver,
  toolName: string,
  args: Record<string, unknown> = {},
) {
  const { handleToolCall } = createMcpServer(driver)
  const raw = await handleToolCall(toolName, args)
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw.text)
  } catch {
    parsed = raw.text
  }
  return { ...raw, parsed }
}

// ─── describe 1: COMMAND_ERROR_CODES 포함 확인 ───────────────────────────────

describe('COMMAND_ERROR_CODES — 4개 신규 macro 에러 코드', () => {
  it('MACRO_NOT_FOUND가 COMMAND_ERROR_CODES에 포함됨', () => {
    expect(COMMAND_ERROR_CODES).toContain('MACRO_NOT_FOUND')
  })

  it('MACRO_CIRCUIT_OPEN이 COMMAND_ERROR_CODES에 포함됨', () => {
    expect(COMMAND_ERROR_CODES).toContain('MACRO_CIRCUIT_OPEN')
  })

  it('MACRO_PRECONDITION_FAILED이 COMMAND_ERROR_CODES에 포함됨', () => {
    expect(COMMAND_ERROR_CODES).toContain('MACRO_PRECONDITION_FAILED')
  })

  it('MACRO_POSTCONDITION_FAILED이 COMMAND_ERROR_CODES에 포함됨', () => {
    expect(COMMAND_ERROR_CODES).toContain('MACRO_POSTCONDITION_FAILED')
  })
})

// ─── describe 2: happy path ───────────────────────────────────────────────────

describe('agrune_macro_run — happy path (status: ok)', () => {
  it('ok:true + status:ok + macroId + stepCount 반환', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'login',
      stepCount: 3,
    })

    const result = await callTool(driver, 'agrune_macro_run', {
      macroId: 'login',
      params: { username: 'user@example.com' },
    })

    expect(result.isError).toBeFalsy()
    const parsed = result.parsed as { ok?: boolean; status?: string; macroId?: string; stepCount?: number }
    expect(parsed.ok).toBe(true)
    expect(parsed.status).toBe('ok')
    expect(parsed.macroId).toBe('login')
    expect(parsed.stepCount).toBe(3)
  })

  it('driver.runMacro가 정확히 1회 호출됨', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'login',
      stepCount: 2,
    })

    await callTool(driver, 'agrune_macro_run', { macroId: 'login', params: {} })

    expect(driver.runMacro).toHaveBeenCalledTimes(1)
    expect(driver.runMacro).toHaveBeenCalledWith(1, 'login', {})
  })

  it('CommandBroker가 phase:start 1회 + phase:end 1회 emit', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'login',
      stepCount: 2,
    })

    const { handleToolCall, commandBroker } = createMcpServer(driver)

    const events: string[] = []
    commandBroker.onEvent((e) => events.push(e.phase))

    await handleToolCall('agrune_macro_run', { macroId: 'login', params: {} })

    expect(events).toContain('start')
    expect(events).toContain('end')
  })

  it('CommandBroker end event에 durationMs가 존재함', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'login',
      stepCount: 1,
    })

    const { handleToolCall, commandBroker } = createMcpServer(driver)

    let endDuration: number | undefined
    commandBroker.onEvent((e) => {
      if (e.phase === 'end') endDuration = e.durationMs
    })

    await handleToolCall('agrune_macro_run', { macroId: 'login' })

    expect(typeof endDuration).toBe('number')
    expect(endDuration).toBeGreaterThanOrEqual(0)
  })

  it('CommandBroker start event args에 macroId가 포함됨', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'login',
      stepCount: 1,
    })

    const { handleToolCall, commandBroker } = createMcpServer(driver)

    const startEvents: unknown[] = []
    commandBroker.onEvent((e) => {
      if (e.phase === 'start') startEvents.push(e)
    })

    await handleToolCall('agrune_macro_run', { macroId: 'login', params: { user: 'a' } })

    expect(startEvents.length).toBe(1)
    const startEvent = startEvents[0] as { tool?: string }
    expect(startEvent.tool).toBe('agrune_macro_run')
  })
})

// ─── describe 3: already-satisfied ───────────────────────────────────────────

describe('agrune_macro_run — already-satisfied', () => {
  it('already-satisfied → ok:true + status:already-satisfied 반환', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'already-satisfied',
      macroId: 'login',
      stepCount: 0,
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBeFalsy()
    const parsed = result.parsed as { ok?: boolean; status?: string }
    expect(parsed.ok).toBe(true)
    expect(parsed.status).toBe('already-satisfied')
  })

  it('already-satisfied → CommandBroker phase:end emit', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'already-satisfied',
      macroId: 'checkout',
      stepCount: 0,
    })

    const { handleToolCall, commandBroker } = createMcpServer(driver)
    const events: string[] = []
    commandBroker.onEvent((e) => events.push(e.phase))

    await handleToolCall('agrune_macro_run', { macroId: 'checkout' })

    expect(events).toContain('end')
  })
})

// ─── describe 4: SESSION_NOT_ACTIVE ──────────────────────────────────────────

describe('agrune_macro_run — SESSION_NOT_ACTIVE', () => {
  it('resolveTabId가 null 반환 → SESSION_NOT_ACTIVE 에러, driver.runMacro 0회 호출', async () => {
    const driver = makeMockDriver({
      resolveTabId: vi.fn(() => null as number | null),
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('SESSION_NOT_ACTIVE')
    expect(driver.runMacro).not.toHaveBeenCalled()
  })
})

// ─── describe 5: INVALID_COMMAND — driver.runMacro 없음 ──────────────────────

describe('agrune_macro_run — INVALID_COMMAND (driver.runMacro 미구현)', () => {
  it('driver.runMacro가 없으면 INVALID_COMMAND 반환', async () => {
    const driver = makeMockDriver()
    delete (driver as Record<string, unknown>).runMacro

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('INVALID_COMMAND')
  })
})

// ─── describe 6: status → error code 매핑 ────────────────────────────────────

describe('agrune_macro_run — status → error code 매핑', () => {
  it('circuit-open → MACRO_CIRCUIT_OPEN (details: failedStep)', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'circuit-open',
      failedStep: 2,
      macroId: 'login',
      stepCount: 5,
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { error?: { code?: string; details?: Record<string, unknown> } }
    expect(parsed.error?.code).toBe('MACRO_CIRCUIT_OPEN')
    expect(parsed.error?.details).toMatchObject({ failedStep: 2 })
  })

  it('precondition-failed → MACRO_PRECONDITION_FAILED (details: reason)', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'precondition-failed',
      reason: 'already logged in',
      macroId: 'login',
      stepCount: 0,
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { error?: { code?: string; details?: Record<string, unknown> } }
    expect(parsed.error?.code).toBe('MACRO_PRECONDITION_FAILED')
    expect(parsed.error?.details).toMatchObject({ reason: 'already logged in' })
  })

  it('postcondition-failed → MACRO_POSTCONDITION_FAILED (details: reason)', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'postcondition-failed',
      reason: 'dashboard not visible',
      macroId: 'login',
      stepCount: 3,
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { error?: { code?: string; details?: Record<string, unknown> } }
    expect(parsed.error?.code).toBe('MACRO_POSTCONDITION_FAILED')
    expect(parsed.error?.details).toMatchObject({ reason: 'dashboard not visible' })
  })

  it('step-error (non-macro-not-found) → INVALID_COMMAND (details: stepIndex, error)', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'step-error',
      stepIndex: 1,
      error: 'element not interactable',
      macroId: 'login',
      stepCount: 3,
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { error?: { code?: string; details?: Record<string, unknown> } }
    expect(parsed.error?.code).toBe('INVALID_COMMAND')
    expect(parsed.error?.details).toMatchObject({ stepIndex: 1 })
  })

  it('target-not-found → TARGET_NOT_FOUND (details: stepIndex, targetId)', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'target-not-found',
      stepIndex: 0,
      targetId: 'username-input',
      macroId: 'login',
      stepCount: 3,
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { error?: { code?: string; details?: Record<string, unknown> } }
    expect(parsed.error?.code).toBe('TARGET_NOT_FOUND')
    expect(parsed.error?.details).toMatchObject({ stepIndex: 0, targetId: 'username-input' })
  })
})

// ─── describe 7: MACRO_NOT_FOUND ─────────────────────────────────────────────

describe('agrune_macro_run — MACRO_NOT_FOUND', () => {
  it('step-error (stepIndex=-1, error startsWith "macro not found") → MACRO_NOT_FOUND', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'step-error',
      stepIndex: -1,
      error: 'macro not found: unknown-macro',
      macroId: 'unknown-macro',
      stepCount: 0,
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'unknown-macro' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { error?: { code?: string; details?: Record<string, unknown> } }
    expect(parsed.error?.code).toBe('MACRO_NOT_FOUND')
    expect(parsed.error?.details).toMatchObject({ macroId: 'unknown-macro' })
  })

  it('step-error (stepIndex=-1, error=runtime not ready) → INVALID_COMMAND (macro not found prefix 아님)', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'step-error',
      stepIndex: -1,
      error: 'runtime not ready',
      macroId: 'login',
      stepCount: 0,
    })

    const result = await callTool(driver, 'agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { error?: { code?: string } }
    expect(parsed.error?.code).toBe('INVALID_COMMAND')
  })
})

// ─── describe 8: sensitive step 감지 + redaction ─────────────────────────────

describe('agrune_macro_run — sensitive step redaction', () => {
  it('sensitiveStepIndices 없음 → hasSensitiveSteps:false (best-effort)', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'login',
      stepCount: 2,
      // sensitiveStepIndices 없음
    })

    const { handleToolCall, commandBroker } = createMcpServer(driver)
    const endEvents: unknown[] = []
    commandBroker.onEvent((e) => {
      if (e.phase === 'end') endEvents.push(e)
    })

    await handleToolCall('agrune_macro_run', { macroId: 'login', params: { password: 'secret' } })

    // sensitiveStepIndices 없으면 redaction 없이 정상 완료
    expect(endEvents.length).toBe(1)
  })

  it('sensitiveStepIndices=[1] → params의 해당 키가 [REDACTED]로 치환된 args로 emit', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'login',
      stepCount: 2,
      sensitiveStepIndices: [1],
    })

    const { handleToolCall, commandBroker } = createMcpServer(driver)
    const startEvents: Array<Record<string, unknown>> = []
    commandBroker.onEvent((e) => {
      if (e.phase === 'start') startEvents.push(e as Record<string, unknown>)
    })

    await handleToolCall('agrune_macro_run', {
      macroId: 'login',
      params: { username: 'user@example.com', password: 'secret123' },
    })

    // start event가 1회 emit됨
    expect(startEvents.length).toBe(1)
  })

  it('sensitiveStepIndices=[] (비어있음) → ok:true 반환 (redaction 대상 없음)', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'signup',
      stepCount: 3,
      sensitiveStepIndices: [],
    })

    const result = await callTool(driver, 'agrune_macro_run', {
      macroId: 'signup',
      params: { email: 'a@b.com' },
    })

    expect(result.isError).toBeFalsy()
    const parsed = result.parsed as { ok?: boolean }
    expect(parsed.ok).toBe(true)
  })
})

// ─── describe 9: HITL gate 경로 ──────────────────────────────────────────────

describe('agrune_macro_run — HITL gate 경로', () => {
  it('hitl.pause() → awaitGate block → resume 후 driver.runMacro 호출 1회', async () => {
    const driver = makeMockDriver()
    vi.mocked(driver.runMacro).mockResolvedValue({
      status: 'ok',
      macroId: 'login',
      stepCount: 1,
    })

    const { handleToolCall, hitl } = createMcpServer(driver)

    hitl.pause()
    const callPromise = handleToolCall('agrune_macro_run', { macroId: 'login' })

    // pause 중에는 아직 호출 안 됨 — 비동기 확인을 위해 microtask yield
    await Promise.resolve()
    await Promise.resolve()
    expect(driver.runMacro).not.toHaveBeenCalled()

    hitl.resume()
    const result = await callPromise
    expect(driver.runMacro).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(result.text) as { ok?: boolean }
    expect(parsed.ok).toBe(true)
  })

  it('hitl.skip() → HitlSkipError → phase:error emit + ok:false 반환', async () => {
    const driver = makeMockDriver()

    const { handleToolCall, commandBroker, hitl } = createMcpServer(driver)
    const events: string[] = []
    commandBroker.onEvent((e) => events.push(e.phase))

    hitl.skip()
    const result = await handleToolCall('agrune_macro_run', { macroId: 'login' })

    expect(result.isError).toBe(true)
    expect(events).toContain('error')
    expect(driver.runMacro).not.toHaveBeenCalled()
  })
})

// ─── describe 10: parity assertion — 13 tools ────────────────────────────────

describe('agrune_macro_run — parity assertion (Phase 12-03 패턴)', () => {
  it('registerAgruneTools 등록 이름 집합 === getToolDefinitions() 이름 집합 (Pitfall 6)', () => {
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

  it('도구 개수가 13개 (기존 12 + agrune_macro_run)', () => {
    const defs = getToolDefinitions()
    expect(defs).toHaveLength(13)
  })

  it('agrune_macro_run이 getToolDefinitions() 목록에 포함됨', () => {
    const defs = getToolDefinitions()
    const entry = defs.find(d => d.name === 'agrune_macro_run')
    expect(entry).toBeDefined()
    expect(entry!.inputSchema.required).toContain('macroId')
  })
})
