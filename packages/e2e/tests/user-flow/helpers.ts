/**
 * Shared harness for real user-flow E2E specs.
 *
 * These specs route through the real MCP tool layer + PlaywrightDriver +
 * a real chromium instance. The point is to exercise the exact stack that
 * Claude Code / Codex hit when they call agrune tools.
 *
 * We construct the MCP server in-process via createMcpServer() and invoke
 * handleToolCall() directly with the same arg shape the stdio transport
 * would deliver — this is effectively identical to what @modelcontextprotocol/sdk
 * routes to the registered tool handlers, minus the JSON-RPC envelope.
 */

import { PlaywrightDriver } from '@agrune/backend'
import { createMcpServer } from '@agrune/mcp'

export interface McpToolResponse {
  text: string
  isError?: boolean
  parsed: unknown
}

export interface RealHarness {
  driver: PlaywrightDriver
  call: (name: string, args?: Record<string, unknown>) => Promise<McpToolResponse>
  teardown: () => Promise<void>
}

export interface HarnessOptions {
  startUrl?: string
  headless?: boolean
}

/**
 * Decide whether real-browser E2E can run in the current environment.
 * - PLAYWRIGHT_SKIP_E2E=1 forces skip (matches existing convention).
 * - AGRUNE_E2E_REAL=0 forces skip (explicit opt-out).
 */
export function realE2eSkipReason(): string | null {
  if (process.env.PLAYWRIGHT_SKIP_E2E === '1') {
    return 'PLAYWRIGHT_SKIP_E2E=1 — run with a real browser locally to execute.'
  }
  if (process.env.AGRUNE_E2E_REAL === '0') {
    return 'AGRUNE_E2E_REAL=0 — real-browser E2E explicitly disabled.'
  }
  return null
}

export async function createRealHarness(options: HarnessOptions = {}): Promise<RealHarness> {
  // Headless by default so CI / background runs don't pop a window.
  const driver = new PlaywrightDriver({
    connection: { mode: 'launch', headless: options.headless ?? true },
  })

  const { handleToolCall } = createMcpServer(driver)

  const call = async (
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolResponse> => {
    const raw = await handleToolCall(name, args)
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw.text)
    } catch {
      parsed = name === 'browser_get_targets' || name === 'browser_snapshot'
        ? parseFormattedSnapshot(raw.text)
        : raw.text
    }
    return { text: raw.text, ...(raw.isError ? { isError: true } : {}), parsed }
  }

  await driver.connect()
  // Visual decoration (cursor flight, aurora) adds per-act latency — keep the
  // suite deterministic and fast.
  driver.updateConfig({ pointerAnimation: false, auroraGlow: false })
  const startUrl = options.startUrl ?? 'http://127.0.0.1:5555/tricky-inputs.html'
  await driver.openTab(startUrl)
  await driver.ensureReady()

  return {
    driver,
    call,
    teardown: async () => {
      await driver.disconnect().catch(() => {})
    },
  }
}

/**
 * Refresh per-tab snapshots. With the Playwright pull-model driver this is
 * just ensureReady(); kept as a named helper because specs call it after
 * opening tabs outside the tool layer.
 */
export async function forceReprepare(driver: PlaywrightDriver): Promise<void> {
  await driver.ensureReady()
}

/** Evaluate an expression in a tab's page context (replaces raw CDP Runtime.evaluate). */
export async function evaluateInTab<T>(
  driver: PlaywrightDriver,
  tabId: number | undefined,
  expression: string,
): Promise<T> {
  const page = driver.playwrightSession.page(tabId)
  return page.evaluate(expression) as Promise<T>
}

export interface SnapshotTargetLite {
  targetId: string
  groupId: string
  name: string
}

interface ParsedFormattedSnapshot {
  url?: string
  title?: string
  context?: string
  version?: number
  targets?: SnapshotTargetLite[]
}

function parseFormattedSnapshot(text: string): ParsedFormattedSnapshot {
  const result: ParsedFormattedSnapshot = {}
  const targets: SnapshotTargetLite[] = []
  let current: SnapshotTargetLite | null = null
  let currentGroupId = ''

  for (const line of text.split('\n')) {
    if (line.startsWith('- Page URL: ')) {
      result.url = line.slice('- Page URL: '.length)
      continue
    }
    if (line.startsWith('- Page Title: ')) {
      result.title = line.slice('- Page Title: '.length)
      continue
    }
    if (line.startsWith('- Agrune Context: ')) {
      result.context = line.slice('- Agrune Context: '.length)
      continue
    }
    if (line.startsWith('- Snapshot Version: ')) {
      const version = Number(line.slice('- Snapshot Version: '.length))
      if (Number.isFinite(version)) result.version = version
      continue
    }

    const groupMatch = line.match(/^\s*- group (.+) \[ref=([^\]]+)\]:$/)
    if (groupMatch) {
      currentGroupId = groupMatch[2] ?? ''
      current = null
      continue
    }

    const targetMatch = line.match(/^\s*- target (.+) \[ref=([^\]]+)\](?: .*)?:$/)
    if (targetMatch) {
      current = {
        name: unquote(targetMatch[1] ?? ''),
        targetId: targetMatch[2] ?? '',
        groupId: currentGroupId,
      }
      targets.push(current)
      continue
    }

    if (current) {
      const explicitGroupMatch = line.match(/^  - group: (.+)$/)
      if (explicitGroupMatch) {
        current.groupId = unquote(explicitGroupMatch[1] ?? '')
      }
    }
  }

  result.targets = targets
  return result
}

function unquote(value: string): string {
  try {
    return JSON.parse(value) as string
  } catch {
    return value
  }
}

/**
 * Fetch targets (`mode: 'full'`) so specs can pick a target by its
 * manifest-defined `targetId` without hand-parsing the outline. Waits briefly
 * because the manifest-driven resolve is async.
 */
export async function getFullTargets(
  call: RealHarness['call'],
  tabId?: number,
): Promise<SnapshotTargetLite[]> {
  const args: Record<string, unknown> = { mode: 'full' }
  if (typeof tabId === 'number') args.tabId = tabId
  const res = await call('browser_get_targets', args)
  const parsed = res.parsed as { targets?: SnapshotTargetLite[] } | null
  return parsed?.targets ?? []
}

export async function waitForTargetByName(
  call: RealHarness['call'],
  predicate: (t: SnapshotTargetLite) => boolean,
  {
    tabId,
    timeoutMs = 10_000,
    intervalMs = 200,
  }: { tabId?: number; timeoutMs?: number; intervalMs?: number } = {},
): Promise<SnapshotTargetLite | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const targets = await getFullTargets(call, tabId)
    const hit = targets.find(predicate)
    if (hit) return hit
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return null
}
