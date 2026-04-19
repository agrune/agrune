/**
 * agrune_manifest_load MCP tool 단위 테스트 (TDD RED)
 *
 * Coverage:
 *   Test 1: COMMAND_ERROR_CODES에 'INVALID_MANIFEST' 포함
 *   Test 2: 유효 manifest + 활성 세션 → ok:true + injectManifest 1회 호출
 *   Test 3: resolveTabId null → SESSION_NOT_ACTIVE 에러
 *   Test 4: driver.injectManifest 없음 (mock) → INVALID_COMMAND 에러
 *   Test 5: schema 위반 manifest → INVALID_MANIFEST 에러 + details.errors
 *   Test 6: driver.injectManifest가 TAB_NOT_FOUND throw → TAB_NOT_FOUND 유지
 *   Test 7: tools.ts getToolDefinitions()에 agrune_manifest_load 엔트리 존재
 *   Test 8: mcp-tools.ts 등록 이름 집합 === tools.ts 목록 이름 집합 (Pitfall 6 방지)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockedFunction } from 'vitest'
import { createMcpServer } from '../src/index.js'
import { getToolDefinitions } from '../src/tools.js'
import { registerAgruneTools } from '../src/mcp-tools.js'
import type { BrowserDriver, Session, PageSnapshot, CommandResult, AgruneRuntimeConfig } from '@agrune/core'
import { COMMAND_ERROR_CODES } from '@agrune/core'
import type { AgruneManifest } from '@agrune/manifest'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_MANIFEST: AgruneManifest = {
  version: 3,
  groups: [
    {
      groupId: 'auth',
      name: 'Auth',
      targets: [
        {
          targetId: 'signin-button',
          name: 'Sign in',
          actionKinds: ['click'],
          selector: { role: { name: 'Sign in' } },
        },
      ],
    },
  ],
}

const INVALID_MANIFEST_VERSION_2 = {
  version: 2,
  groups: [],
}

const INVALID_MANIFEST_SENSITIVE_FALSE = {
  version: 3,
  groups: [
    {
      groupId: 'g1',
      name: 'G1',
      targets: [
        {
          targetId: 'btn',
          name: 'Button',
          actionKinds: ['click'],
          selector: { role: { name: 'Button' } },
          sensitive: false,
        },
      ],
    },
  ],
}

// ─── Mock driver factory ──────────────────────────────────────────────────────

function makeMockDriver(overrides: Partial<BrowserDriver & { injectManifest?: unknown }> = {}): BrowserDriver & { injectManifest: MockedFunction<(tabId: number, manifest: AgruneManifest) => Promise<void>> } {
  const defaultSession: Session = {
    tabId: 1,
    url: 'http://example.com',
    title: 'Example',
    hasSnapshot: true,
    active: true,
    snapshotVersion: 1,
  }

  const injectManifest = vi.fn(async (_tabId: number, _manifest: AgruneManifest): Promise<void> => {})

  const base: BrowserDriver = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isConnected: vi.fn(() => true),
    listSessions: vi.fn(() => [defaultSession]),
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
    injectManifest,
    ...overrides,
  }

  return base as BrowserDriver & { injectManifest: MockedFunction<(tabId: number, manifest: AgruneManifest) => Promise<void>> }
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('COMMAND_ERROR_CODES', () => {
  it('Test 1: INVALID_MANIFEST 코드가 배열에 포함되어 있음', () => {
    // @ts-expect-error — 아직 추가 전, RED 단계에서 타입 에러 및 런타임 실패 예상
    expect(COMMAND_ERROR_CODES).toContain('INVALID_MANIFEST')
  })

  it('Test 1b: CommandErrorCode 타입으로 INVALID_MANIFEST 사용 가능', () => {
    // 타입 수준 검사 — 컴파일 에러 없으면 GREEN
    const codes: readonly string[] = COMMAND_ERROR_CODES
    expect(codes).toContain('INVALID_MANIFEST')
  })
})

describe('agrune_manifest_load — happy path', () => {
  it('Test 2: 유효 manifest + 활성 세션 → ok:true + manifestSource:window + injectManifest 1회 호출', async () => {
    const driver = makeMockDriver()
    const result = await callTool(driver, 'agrune_manifest_load', { manifest: VALID_MANIFEST })

    expect(result.isError).toBeFalsy()
    const parsed = result.parsed as { ok?: boolean; manifestSource?: string; session?: unknown }
    expect(parsed.ok).toBe(true)
    expect(parsed.manifestSource).toBe('window')

    expect(driver.injectManifest).toHaveBeenCalledTimes(1)
    expect(driver.injectManifest).toHaveBeenCalledWith(1, expect.objectContaining({ version: 3 }))
  })

  it('Test 2b: session 메타가 응답에 포함됨', async () => {
    const driver = makeMockDriver()
    const result = await callTool(driver, 'agrune_manifest_load', { manifest: VALID_MANIFEST })
    const parsed = result.parsed as { session?: unknown }
    // session이 null이거나 객체
    expect('session' in (parsed as object)).toBe(true)
  })
})

describe('agrune_manifest_load — SESSION_NOT_ACTIVE', () => {
  it('Test 3: resolveTabId가 null 반환 → SESSION_NOT_ACTIVE 에러', async () => {
    const driver = makeMockDriver({
      resolveTabId: vi.fn(() => null as number | null),
    })
    const result = await callTool(driver, 'agrune_manifest_load', { manifest: VALID_MANIFEST })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('SESSION_NOT_ACTIVE')
  })
})

describe('agrune_manifest_load — INVALID_COMMAND (driver 미지원)', () => {
  it('Test 4: driver.injectManifest 없음 → INVALID_COMMAND', async () => {
    const driver = makeMockDriver({
      injectManifest: undefined,
    } as unknown as Partial<BrowserDriver>)
    // injectManifest를 명시적으로 제거
    delete (driver as Record<string, unknown>).injectManifest

    const result = await callTool(driver, 'agrune_manifest_load', { manifest: VALID_MANIFEST })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('INVALID_COMMAND')
  })
})

describe('agrune_manifest_load — INVALID_MANIFEST', () => {
  it('Test 5a: version 2 manifest → INVALID_MANIFEST + details.errors 배열', async () => {
    const driver = makeMockDriver()
    const result = await callTool(driver, 'agrune_manifest_load', { manifest: INVALID_MANIFEST_VERSION_2 })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { ok?: boolean; error?: { code?: string; details?: { errors?: unknown[] } } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('INVALID_MANIFEST')
    expect(Array.isArray(parsed.error?.details?.errors)).toBe(true)
    expect((parsed.error?.details?.errors as unknown[]).length).toBeGreaterThan(0)
  })

  it('Test 5b: sensitive:false manifest → INVALID_MANIFEST', async () => {
    const driver = makeMockDriver()
    const result = await callTool(driver, 'agrune_manifest_load', { manifest: INVALID_MANIFEST_SENSITIVE_FALSE })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { ok?: boolean; error?: { code?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('INVALID_MANIFEST')
  })

  it('Test 5c: validateManifest 실패 시 injectManifest를 호출하지 않음', async () => {
    const driver = makeMockDriver()
    await callTool(driver, 'agrune_manifest_load', { manifest: INVALID_MANIFEST_VERSION_2 })
    expect(driver.injectManifest).not.toHaveBeenCalled()
  })
})

describe('agrune_manifest_load — TAB_NOT_FOUND throw propagation', () => {
  it('Test 6: driver.injectManifest가 TAB_NOT_FOUND throw → MCP에 TAB_NOT_FOUND 유지', async () => {
    const tabNotFoundError = { code: 'TAB_NOT_FOUND', message: 'Tab was closed.' }
    const driver = makeMockDriver({
      injectManifest: vi.fn(async () => {
        throw tabNotFoundError
      }),
    } as unknown as Partial<BrowserDriver>)

    const result = await callTool(driver, 'agrune_manifest_load', { manifest: VALID_MANIFEST })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { ok?: boolean; error?: { code?: string; message?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('TAB_NOT_FOUND')
  })
})

describe('tools.ts — agrune_manifest_load 엔트리', () => {
  it('Test 7: getToolDefinitions()에 agrune_manifest_load 엔트리 포함', () => {
    const defs = getToolDefinitions()
    const entry = defs.find(d => d.name === 'agrune_manifest_load')
    expect(entry).toBeDefined()
    expect(entry!.inputSchema.required).toContain('manifest')
    expect(entry!.description.length).toBeGreaterThan(0)
  })

  it('Test 7b: agrune_manifest_load 스키마에 manifest 프로퍼티 존재', () => {
    const defs = getToolDefinitions()
    const entry = defs.find(d => d.name === 'agrune_manifest_load')!
    const props = entry.inputSchema.properties ?? {}
    expect(props).toHaveProperty('manifest')
    expect(props).toHaveProperty('tabId')
  })
})

describe('tool registration parity (Pitfall 6)', () => {
  it('Test 8: mcp-tools.ts 등록 이름 집합 === tools.ts 목록 이름 집합', () => {
    const registeredNames: string[] = []
    const mockMcp = {
      tool: (name: string) => {
        registeredNames.push(name)
        return mockMcp
      },
    } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer

    const noopHandler = async () => ({ text: '' })
    registerAgruneTools(mockMcp, noopHandler)

    const definitionNames = getToolDefinitions()
      .map(d => d.name)
      .sort()
    const sortedRegistered = [...registeredNames].sort()

    expect(sortedRegistered).toEqual(definitionNames)
  })
})

describe('agrune_manifest_load — tabId 전달', () => {
  it('explicit tabId가 resolveTabId와 injectManifest에 전달됨', async () => {
    const resolveTabIdMock = vi.fn((_id?: number) => 42 as number | null)
    const defaultSession2: Session = {
      tabId: 42,
      url: 'http://example.com',
      title: 'Tab 42',
      hasSnapshot: true,
      active: true,
      snapshotVersion: 1,
    }
    const driver = makeMockDriver({
      resolveTabId: resolveTabIdMock,
      listSessions: vi.fn(() => [defaultSession2]),
    })

    await callTool(driver, 'agrune_manifest_load', { manifest: VALID_MANIFEST, tabId: 42 })

    expect(resolveTabIdMock).toHaveBeenCalledWith(42)
    expect(driver.injectManifest).toHaveBeenCalledWith(42, expect.objectContaining({ version: 3 }))
  })
})

describe('agrune_manifest_load — injectManifest 일반 에러', () => {
  it('injectManifest가 일반 Error를 throw → INVALID_COMMAND 반환', async () => {
    const driver = makeMockDriver({
      injectManifest: vi.fn(async () => {
        throw new Error('CDP connection lost')
      }),
    } as unknown as Partial<BrowserDriver>)

    const result = await callTool(driver, 'agrune_manifest_load', { manifest: VALID_MANIFEST })

    expect(result.isError).toBe(true)
    const parsed = result.parsed as { ok?: boolean; error?: { code?: string; message?: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('INVALID_COMMAND')
    expect(parsed.error?.message).toContain('CDP connection lost')
  })
})
