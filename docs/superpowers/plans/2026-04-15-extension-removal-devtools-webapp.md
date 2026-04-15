# Extension Removal & DevTools Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Chrome extension, convert DevTools panel to localhost web app served by MCP server, simplify CLI to CDP-only.

**Architecture:** MCP server process gains an HTTP/WebSocket server that serves the DevTools web app and streams snapshots in real-time. ExtensionDriver, native messaging, backend daemon, and all extension-related code are removed. CLI drops `--mode` flag — CDP is the only mode.

**Tech Stack:** Node.js `node:http` + `ws` (WebSocket library), Vite (devtools bundle), existing @agrune/core types.

---

### Task 1: Remove deprecated packages

**Files:**
- Delete: `packages/extension/` (entire directory)
- Delete: `packages/build-core/` (entire directory)
- Delete: `packages/mcp-server/` (entire directory)
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root, if references exist)

- [ ] **Step 1: Delete extension package directory**

```bash
rm -rf packages/extension
```

- [ ] **Step 2: Delete build-core package directory**

```bash
rm -rf packages/build-core
```

- [ ] **Step 3: Delete mcp-server package directory**

```bash
rm -rf packages/mcp-server
```

- [ ] **Step 4: Update pnpm-workspace.yaml if needed**

Verify `pnpm-workspace.yaml` uses a glob like `packages/*`. If it lists packages explicitly, remove the three deleted entries.

- [ ] **Step 5: Run pnpm install to clean lockfile**

```bash
pnpm install
```

Expected: lockfile updates, no errors about missing packages.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated packages (extension, build-core, mcp-server)"
```

---

### Task 2: Remove ExtensionDriver and native messaging from browser package

**Files:**
- Delete: `packages/browser/src/extension-driver.ts`
- Delete: `packages/browser/src/native-messaging.ts`
- Delete: `packages/browser/tests/extension-driver.spec.ts`
- Delete: `packages/browser/tests/native-messaging.spec.ts`
- Modify: `packages/browser/src/index.ts`

- [ ] **Step 1: Delete extension-driver.ts**

```bash
rm packages/browser/src/extension-driver.ts
```

- [ ] **Step 2: Delete native-messaging.ts**

```bash
rm packages/browser/src/native-messaging.ts
```

- [ ] **Step 3: Delete related test files**

```bash
rm packages/browser/tests/extension-driver.spec.ts
rm packages/browser/tests/native-messaging.spec.ts
```

- [ ] **Step 4: Update packages/browser/src/index.ts**

Remove ExtensionDriver, native messaging exports. Keep only CDP-related exports:

```typescript
export { CdpDriver } from './cdp-driver.js'
export type { CdpDriverOptions } from './cdp-driver.js'
export { ChromeLauncher } from './chrome-launcher.js'
export { CdpConnection } from './cdp-connection.js'
export { CdpTargetManager } from './cdp-target-manager.js'
export type { TargetInfo } from './cdp-target-manager.js'
export { CdpRuntimeInjector, QUICK_MODE_RUNTIME_KEY } from './cdp-runtime-injector.js'
export { SessionManager } from './session-manager.js'
export type { Session } from '@agrune/core'
export { CommandQueue } from './command-queue.js'
export { ActivityBlockStack } from './activity-tracker.js'
export type { ActivityBlock } from './activity-tracker.js'
```

- [ ] **Step 5: Run browser package tests**

```bash
pnpm --filter @agrune/browser run test
```

Expected: remaining tests (cdp-driver, session-manager, command-queue, activity-tracker) pass. Count should drop from 57 to roughly 30-40.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(browser): remove ExtensionDriver and native messaging"
```

---

### Task 3: Simplify MCP server — remove extension mode and backend daemon

**Files:**
- Rewrite: `packages/mcp/bin/agrune-mcp.ts`
- Modify: `packages/mcp/src/index.ts`
- Delete: `packages/mcp/src/backend-client.ts`
- Delete: `packages/mcp/src/backend-protocol.ts`
- Delete: `packages/mcp/tests/backend-client.spec.ts`

- [ ] **Step 1: Delete backend-client.ts and backend-protocol.ts**

```bash
rm packages/mcp/src/backend-client.ts
rm packages/mcp/src/backend-protocol.ts
rm packages/mcp/tests/backend-client.spec.ts
```

- [ ] **Step 2: Rewrite packages/mcp/src/index.ts**

Remove ExtensionDriver import, native messaging, and connectNativeMessaging. Default driver is CdpDriver:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AgruneRuntimeConfig, BrowserDriver } from '@agrune/core'
import { registerAgruneTools } from './mcp-tools.js'
import type { ToolHandlerResult } from './mcp-tools.js'
import { toPublicCommandResult, toPublicSession, toPublicSnapshot } from './public-shapes.js'
import type { PublicSnapshotOptions } from './public-shapes.js'

declare const __MCP_SERVER_VERSION__: string

export { registerAgruneTools } from './mcp-tools.js'
export { getToolDefinitions } from './tools.js'

type ActivityAwareDriver = BrowserDriver & {
  onActivity?: (() => void) | null
}

export function createMcpServer<TDriver extends ActivityAwareDriver>(
  driver: TDriver,
) {
  const mcp = new McpServer(
    { name: 'agrune', version: typeof __MCP_SERVER_VERSION__ !== 'undefined' ? __MCP_SERVER_VERSION__ : '0.0.0' },
    { capabilities: { tools: {} } },
  )

  const handleToolCall = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> => {
    driver.onActivity?.()
    if (!driver.isConnected()) {
      await driver.connect()
    }

    if (name !== 'agrune_config') {
      const readyError = await driver.ensureReady()
      if (readyError) return { text: readyError, isError: true }
    }

    const tabId = driver.resolveTabId(args.tabId as number | undefined)

    switch (name) {
      case 'agrune_sessions': {
        return { text: JSON.stringify(driver.listSessions().map(toPublicSession), null, 2) }
      }
      case 'agrune_snapshot': {
        if (tabId == null) return { text: 'No active sessions.', isError: true }
        const snapshot = driver.getSnapshot(tabId)
        if (!snapshot) return { text: `No snapshot available for tab ${tabId}.`, isError: true }
        return { text: JSON.stringify(toPublicSnapshot(snapshot, resolveSnapshotOptions(args)), null, 2) }
      }
      case 'agrune_act':
      case 'agrune_fill':
      case 'agrune_drag':
      case 'agrune_pointer':
      case 'agrune_wait':
      case 'agrune_guide':
      case 'agrune_read': {
        if (tabId == null) return { text: 'No active sessions.', isError: true }
        const command: Record<string, unknown> & { kind: string } = {
          kind: name.replace('agrune_', ''), ...args,
        }
        delete command.tabId
        const result = await driver.execute(tabId, command)
        return { text: JSON.stringify(toPublicCommandResult(result), null, 2) }
      }
      case 'agrune_config': {
        const config: Partial<AgruneRuntimeConfig> = {}
        if (typeof args.pointerAnimation === 'boolean') config.pointerAnimation = args.pointerAnimation
        if (typeof args.auroraGlow === 'boolean') config.auroraGlow = args.auroraGlow
        if (typeof args.auroraTheme === 'string') config.auroraTheme = args.auroraTheme as AgruneRuntimeConfig['auroraTheme']
        if (typeof args.clickDelayMs === 'number') config.clickDelayMs = args.clickDelayMs
        if (typeof args.pointerDurationMs === 'number') config.pointerDurationMs = args.pointerDurationMs
        if (typeof args.autoScroll === 'boolean') config.autoScroll = args.autoScroll
        if (Object.keys(config).length > 0) driver.updateConfig(config)
        return { text: 'Configuration updated.' }
      }
      default:
        return { text: `Unknown tool: ${name}`, isError: true }
    }
  }

  registerAgruneTools(mcp, handleToolCall)

  return { server: mcp, driver, handleToolCall }
}

function resolveSnapshotOptions(args: Record<string, unknown>): PublicSnapshotOptions {
  const groupIds = new Set<string>()
  if (typeof args.groupId === 'string' && args.groupId.trim()) groupIds.add(args.groupId.trim())
  if (Array.isArray(args.groupIds)) {
    for (const value of args.groupIds) {
      if (typeof value === 'string' && value.trim()) groupIds.add(value.trim())
    }
  }
  return {
    mode: args.mode === 'full' ? 'full' : 'outline',
    ...(groupIds.size > 0 ? { groupIds: [...groupIds] } : {}),
    ...(args.includeTextContent === true ? { includeTextContent: true } : {}),
  }
}
```

- [ ] **Step 3: Rewrite packages/mcp/bin/agrune-mcp.ts**

Replace entire file. Remove native-host mode, backend-daemon mode, MCP frontend mode. Only CDP mode remains. Drop `--mode` flag:

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CdpDriver } from '@agrune/browser'
import { createMcpServer } from '../src/index.js'

const args = process.argv.slice(2)
const attachEndpoint = getArgValue('--attach')
const headless = args.includes('--headless')
const noDevtools = args.includes('--no-devtools')

const driver = new CdpDriver({
  mode: attachEndpoint ? 'attach' : 'launch',
  ...(attachEndpoint ? { wsEndpoint: attachEndpoint } : {}),
  headless,
})

const { server } = createMcpServer(driver)
await driver.connect()

if (!noDevtools) {
  const { startDevtoolsServer } = await import('../src/devtools-server.js')
  const devtoolsPort = await startDevtoolsServer(driver)
  process.stderr.write(`[agrune] DevTools: http://localhost:${devtoolsPort}/devtools\n`)
}

const transport = new StdioServerTransport()
await server.connect(transport)

const cleanup = async () => {
  await driver.disconnect().catch(() => {})
}

process.once('SIGINT', () => {
  void cleanup().finally(() => process.exit(0))
})
process.once('SIGTERM', () => {
  void cleanup().finally(() => process.exit(0))
})

function getArgValue(flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}
```

- [ ] **Step 4: Run mcp package tests**

```bash
pnpm --filter @agrune/mcp run test
```

Expected: backend-client test removed. Remaining tests (tools, integration, public-shapes) should pass — update integration.spec.ts if it references ExtensionDriver or backend client.

- [ ] **Step 5: Run full build**

```bash
pnpm build
```

Expected: all packages build successfully.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(mcp): remove extension mode, backend daemon, simplify to CDP-only"
```

---

### Task 4: Add WebSocket dependency and create devtools-server module

**Files:**
- Create: `packages/mcp/src/devtools-server.ts`
- Modify: `packages/mcp/package.json`

- [ ] **Step 1: Add ws dependency**

```bash
pnpm --filter @agrune/mcp add ws
pnpm --filter @agrune/mcp add -D @types/ws
```

- [ ] **Step 2: Write failing test for devtools-server**

Create `packages/mcp/tests/devtools-server.spec.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import WebSocket from 'ws'
import { startDevtoolsServer, stopDevtoolsServer } from '../src/devtools-server.js'

// Minimal mock driver for testing
function createMockDriver() {
  const snapshotCbs: Array<(tabId: number, snapshot: unknown) => void> = []
  const sessionOpenCbs: Array<(session: unknown) => void> = []
  const sessionCloseCbs: Array<(tabId: number) => void> = []

  return {
    listSessions: () => [{ tabId: 1, url: 'https://example.com', title: 'Example', hasSnapshot: true, snapshotVersion: 1 }],
    getSnapshot: (tabId: number) => ({ version: 1, url: 'https://example.com', title: 'Example', capturedAt: Date.now(), groups: [], targets: [] }),
    onSnapshotUpdate: (cb: (tabId: number, snapshot: unknown) => void) => { snapshotCbs.push(cb) },
    onSessionOpen: (cb: (session: unknown) => void) => { sessionOpenCbs.push(cb) },
    onSessionClose: (cb: (tabId: number) => void) => { sessionCloseCbs.push(cb) },
    execute: async () => ({ commandId: 'test', ok: true }),
    _emitSnapshot: (tabId: number, snapshot: unknown) => snapshotCbs.forEach(cb => cb(tabId, snapshot)),
    _emitSessionOpen: (session: unknown) => sessionOpenCbs.forEach(cb => cb(session)),
    _emitSessionClose: (tabId: number) => sessionCloseCbs.forEach(cb => cb(tabId)),
  }
}

describe('devtools-server', () => {
  let driver: ReturnType<typeof createMockDriver>
  let port: number
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    driver = createMockDriver()
    port = await startDevtoolsServer(driver as any)
    cleanup = () => stopDevtoolsServer()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('serves devtools HTML at /devtools', async () => {
    const res = await fetch(`http://localhost:${port}/devtools`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('accepts WebSocket connection at /devtools/ws', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/devtools/ws`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    ws.close()
  })

  it('sends sessions_update on subscribe', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/devtools/ws`)
    await new Promise<void>((resolve) => ws.on('open', resolve))

    const messagePromise = new Promise<unknown>((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()))
      })
    })

    ws.send(JSON.stringify({ type: 'subscribe', tabId: 1 }))
    const msg = await messagePromise as { type: string }
    expect(msg.type).toBe('sessions_update')
    ws.close()
  })

  it('broadcasts snapshot_update when driver emits', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/devtools/ws`)
    await new Promise<void>((resolve) => ws.on('open', resolve))
    ws.send(JSON.stringify({ type: 'subscribe', tabId: 1 }))

    // Wait for initial sessions_update
    await new Promise<void>((resolve) => {
      ws.on('message', () => resolve())
    })

    const snapshotPromise = new Promise<unknown>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'snapshot_update') resolve(msg)
      })
    })

    const fakeSnapshot = { version: 2, url: 'https://example.com', title: 'Example', capturedAt: Date.now(), groups: [], targets: [] }
    driver._emitSnapshot(1, fakeSnapshot)

    const msg = await snapshotPromise as { type: string; data: { tabId: number } }
    expect(msg.type).toBe('snapshot_update')
    expect(msg.data.tabId).toBe(1)
    ws.close()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @agrune/mcp run test -- devtools-server
```

Expected: FAIL — `devtools-server.ts` doesn't exist yet.

- [ ] **Step 4: Implement devtools-server.ts**

Create `packages/mcp/src/devtools-server.ts`:

```typescript
import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import type { BrowserDriver, PageSnapshot, Session } from '@agrune/core'

interface DevtoolsDriver {
  listSessions(): Session[]
  getSnapshot(tabId: number): PageSnapshot | null
  onSnapshotUpdate(cb: (tabId: number, snapshot: PageSnapshot) => void): void
  onSessionOpen(cb: (session: Session) => void): void
  onSessionClose(cb: (tabId: number) => void): void
  execute(tabId: number, command: Record<string, unknown> & { kind: string }): Promise<unknown>
}

interface ClientState {
  ws: WebSocket
  subscribedTabId: number | null
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
}

let httpServer: Server | null = null
let wss: WebSocketServer | null = null
const clients = new Set<ClientState>()

export async function startDevtoolsServer(driver: DevtoolsDriver): Promise<number> {
  const distDir = resolveDevtoolsDist()

  httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    let pathname = url.pathname

    if (pathname === '/devtools' || pathname === '/devtools/') {
      pathname = '/devtools/index.html'
    }

    if (!pathname.startsWith('/devtools/')) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const relativePath = pathname.slice('/devtools/'.length)
    const filePath = join(distDir, relativePath)

    if (!existsSync(filePath)) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const ext = extname(filePath)
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    res.writeHead(200, { 'Content-Type': contentType })
    res.end(readFileSync(filePath))
  })

  wss = new WebSocketServer({ server: httpServer, path: '/devtools/ws' })

  wss.on('connection', (ws) => {
    const client: ClientState = { ws, subscribedTabId: null }
    clients.add(client)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; tabId?: number; targetId?: string }

        switch (msg.type) {
          case 'subscribe': {
            client.subscribedTabId = msg.tabId ?? null
            const sessions = driver.listSessions()
            ws.send(JSON.stringify({ type: 'sessions_update', data: sessions }))
            if (client.subscribedTabId != null) {
              const snapshot = driver.getSnapshot(client.subscribedTabId)
              if (snapshot) {
                ws.send(JSON.stringify({ type: 'snapshot_update', data: { tabId: client.subscribedTabId, snapshot } }))
              }
            }
            break
          }
          case 'highlight': {
            if (client.subscribedTabId != null && msg.targetId) {
              void driver.execute(client.subscribedTabId, {
                kind: 'highlight',
                targetId: msg.targetId,
              }).catch(() => {})
            }
            break
          }
          case 'clear_highlight': {
            if (client.subscribedTabId != null) {
              void driver.execute(client.subscribedTabId, {
                kind: 'clear_highlight',
              }).catch(() => {})
            }
            break
          }
        }
      } catch {}
    })

    ws.on('close', () => {
      clients.delete(client)
    })
  })

  driver.onSnapshotUpdate((tabId, snapshot) => {
    const msg = JSON.stringify({ type: 'snapshot_update', data: { tabId, snapshot } })
    for (const client of clients) {
      if (client.subscribedTabId === tabId && client.ws.readyState === 1) {
        client.ws.send(msg)
      }
    }
  })

  driver.onSessionOpen((session) => {
    broadcastSessionsUpdate(driver)
  })

  driver.onSessionClose((tabId) => {
    broadcastSessionsUpdate(driver)
  })

  return new Promise<number>((resolve, reject) => {
    httpServer!.once('error', reject)
    httpServer!.listen(0, '127.0.0.1', () => {
      const addr = httpServer!.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve(port)
    })
  })
}

export async function stopDevtoolsServer(): Promise<void> {
  for (const client of clients) {
    client.ws.close()
  }
  clients.clear()
  wss?.close()
  wss = null
  await new Promise<void>((resolve) => {
    if (httpServer) {
      httpServer.close(() => resolve())
      httpServer = null
    } else {
      resolve()
    }
  })
}

function broadcastSessionsUpdate(driver: DevtoolsDriver): void {
  const sessions = driver.listSessions()
  const msg = JSON.stringify({ type: 'sessions_update', data: sessions })
  for (const client of clients) {
    if (client.ws.readyState === 1) {
      client.ws.send(msg)
    }
  }
}

function resolveDevtoolsDist(): string {
  const selfDir = fileURLToPath(new URL('.', import.meta.url))
  const candidate = join(selfDir, '..', '..', 'devtools', 'dist')
  if (existsSync(candidate)) return candidate
  return join(selfDir, '..', 'devtools-dist')
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @agrune/mcp run test -- devtools-server
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(mcp): add devtools HTTP/WebSocket server"
```

---

### Task 5: Convert devtools package to standalone web app

**Files:**
- Rewrite: `packages/devtools/src/panel.ts`
- Rewrite: `packages/devtools/src/panel.html`
- Delete: `packages/devtools/src/devtools.ts`
- Delete: `packages/devtools/src/devtools.html`
- Create: `packages/devtools/src/index.html` (new entry point)
- Modify: `packages/devtools/package.json`
- Modify: `packages/devtools/tsconfig.json` (if needed)

- [ ] **Step 1: Delete chrome-specific files**

```bash
rm packages/devtools/src/devtools.ts
rm packages/devtools/src/devtools.html
```

- [ ] **Step 2: Remove @types/chrome from devDependencies**

In `packages/devtools/package.json`, remove `"@types/chrome"` from devDependencies.

- [ ] **Step 3: Rewrite panel.html as standalone index.html**

Create `packages/devtools/src/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agrune DevTools</title>
  <link rel="stylesheet" href="./panel.css" />
</head>
<body>
  <div id="toolbar">
    <span id="connectionStatus" class="status-dot disconnected" title="Disconnected">●</span>
    <select id="tabSelect"><option value="">No sessions</option></select>
    <button id="pauseBtn" type="button" title="Pause/Resume">⏸ Pause</button>
    <span id="snapshotInfo">No snapshot</span>
    <div class="toolbar-spacer"></div>
    <select id="reasonFilter"><option value="">All reasons</option></select>
    <select id="actionFilter"><option value="">All actions</option></select>
    <input id="searchInput" type="text" placeholder="Search targets..." />
  </div>
  <div id="main">
    <div id="targetList"></div>
    <div id="detailPane">
      <p class="empty-detail">Select a target</p>
    </div>
  </div>
  <script type="module" src="./panel.ts"></script>
</body>
</html>
```

- [ ] **Step 4: Rewrite panel.ts — replace chrome.* APIs with WebSocket**

Replace `packages/devtools/src/panel.ts` entirely:

```typescript
import type { PageSnapshot, PageSnapshotGroup, PageTarget, Session } from '@agrune/core'

// --- State ---
let snapshot: PageSnapshot | null = null
let selectedTargetId: string | null = null
let paused = false
let sessions: Session[] = []
let subscribedTabId: number | null = null
const collapsedGroups = new Set<string>()

// --- DOM refs ---
const connectionStatus = document.getElementById('connectionStatus') as HTMLSpanElement
const tabSelect = document.getElementById('tabSelect') as HTMLSelectElement
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
const snapshotInfo = document.getElementById('snapshotInfo') as HTMLSpanElement
const reasonFilter = document.getElementById('reasonFilter') as HTMLSelectElement
const actionFilter = document.getElementById('actionFilter') as HTMLSelectElement
const searchInput = document.getElementById('searchInput') as HTMLInputElement
const targetList = document.getElementById('targetList') as HTMLDivElement
const detailPane = document.getElementById('detailPane') as HTMLDivElement

// --- WebSocket connection ---
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const RECONNECT_INTERVAL_MS = 2000

function connectWebSocket() {
  const wsUrl = `ws://${location.host}/devtools/ws`
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    connectionStatus.className = 'status-dot connected'
    connectionStatus.title = 'Connected'
    if (subscribedTabId != null) {
      ws!.send(JSON.stringify({ type: 'subscribe', tabId: subscribedTabId }))
    }
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as { type: string; data: unknown }

    switch (msg.type) {
      case 'sessions_update': {
        sessions = msg.data as Session[]
        renderTabSelect()
        break
      }
      case 'snapshot_update': {
        const update = msg.data as { tabId: number; snapshot: PageSnapshot }
        if (!paused && update.tabId === subscribedTabId) {
          snapshot = update.snapshot
          render()
        }
        break
      }
    }
  }

  ws.onclose = () => {
    connectionStatus.className = 'status-dot disconnected'
    connectionStatus.title = 'Disconnected'
    ws = null
    scheduleReconnect()
  }

  ws.onerror = () => {
    ws?.close()
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, RECONNECT_INTERVAL_MS)
}

function subscribe(tabId: number) {
  subscribedTabId = tabId
  snapshot = null
  selectedTargetId = null
  render()
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', tabId }))
  }
}

// --- Tab selector ---
function renderTabSelect() {
  const current = tabSelect.value
  tabSelect.innerHTML = sessions.length === 0
    ? '<option value="">No sessions</option>'
    : sessions.map(s => `<option value="${s.tabId}"${s.tabId === subscribedTabId ? ' selected' : ''}>${s.title || s.url} (${s.tabId})</option>`).join('')

  if (subscribedTabId == null && sessions.length > 0) {
    subscribe(sessions[0].tabId)
  }
}

tabSelect.addEventListener('change', () => {
  const tabId = parseInt(tabSelect.value, 10)
  if (!isNaN(tabId)) subscribe(tabId)
})

// --- Pause/Resume ---
pauseBtn.addEventListener('click', () => {
  paused = !paused
  pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause'
  pauseBtn.classList.toggle('paused', paused)
})

// --- Filters ---
reasonFilter.addEventListener('change', render)
actionFilter.addEventListener('change', render)
searchInput.addEventListener('input', render)

// --- Render ---
function reasonClass(reason: string): string {
  if (reason === 'hidden') return 'hidden-reason'
  return reason
}

function render() {
  if (!snapshot) {
    snapshotInfo.textContent = 'Waiting for snapshot...'
    targetList.innerHTML = ''
    detailPane.innerHTML = '<p class="empty-detail">No snapshot yet</p>'
    return
  }

  const elapsed = ((Date.now() - snapshot.capturedAt) / 1000).toFixed(1)
  snapshotInfo.textContent = `v${snapshot.version} · ${elapsed}s ago · ${snapshot.targets.length} targets`

  const reasons = [...new Set(snapshot.targets.map(t => t.reason))]
  const currentReason = reasonFilter.value
  reasonFilter.innerHTML = '<option value="">All reasons</option>' +
    reasons.map(r => `<option value="${r}"${r === currentReason ? ' selected' : ''}>${r}</option>`).join('')

  const actionKinds = [...new Set(snapshot.targets.flatMap(t => t.actionKinds))]
  const currentAction = actionFilter.value
  actionFilter.innerHTML = '<option value="">All actions</option>' +
    actionKinds.map(k => `<option value="${k}"${k === currentAction ? ' selected' : ''}>${k}</option>`).join('')

  const rFilter = reasonFilter.value
  const aFilter = actionFilter.value
  const search = searchInput.value.toLowerCase()

  targetList.innerHTML = ''
  for (const group of snapshot.groups) {
    const groupTargets = group.targetIds
      .map(id => snapshot!.targets.find(t => t.targetId === id))
      .filter((t): t is PageTarget => !!t)
      .filter(t => !rFilter || t.reason === rFilter)
      .filter(t => !aFilter || t.actionKinds.includes(aFilter as any))
      .filter(t => !search || t.name.toLowerCase().includes(search) || (t.groupName ?? '').toLowerCase().includes(search) || (t.textContent ?? '').toLowerCase().includes(search))

    if (groupTargets.length === 0) continue

    const collapsed = collapsedGroups.has(group.groupId)

    const header = document.createElement('div')
    header.className = 'group-header'
    header.innerHTML = `<span>${collapsed ? '▸' : '▾'} ${group.groupName ?? group.groupId} <span class="group-desc">${group.groupDesc ? '— ' + group.groupDesc : ''}</span></span><span class="group-count">${groupTargets.length}</span>`
    header.addEventListener('click', () => {
      if (collapsedGroups.has(group.groupId)) collapsedGroups.delete(group.groupId)
      else collapsedGroups.add(group.groupId)
      render()
    })
    targetList.appendChild(header)

    if (collapsed) continue

    for (const target of groupTargets) {
      const row = document.createElement('div')
      row.className = 'target-row' + (target.targetId === selectedTargetId ? ' selected' : '')
      row.innerHTML = `<span class="reason-dot ${reasonClass(target.reason)}">●</span><span class="target-name${target.reason !== 'ready' ? ' not-ready' : ''}">${target.name}</span><span class="target-action">${target.actionKinds.join(', ')}</span><span class="reason-badge ${reasonClass(target.reason)}">${target.reason}</span>`
      row.addEventListener('click', () => {
        selectedTargetId = target.targetId
        render()
        highlightInPage(target)
      })
      targetList.appendChild(row)
    }
  }

  renderDetail()
}

function renderDetail() {
  if (!snapshot || !selectedTargetId) {
    detailPane.innerHTML = '<p class="empty-detail">Select a target</p>'
    return
  }

  const target = snapshot.targets.find(t => t.targetId === selectedTargetId)
  if (!target) {
    detailPane.innerHTML = '<p class="empty-detail">Target not found in current snapshot</p>'
    return
  }

  const boolCell = (v: boolean) => `<span class="${v ? 'detail-bool-true' : 'detail-bool-false'}">${v}</span>`

  detailPane.innerHTML = `
    <div class="detail-name">${target.name}</div>
    <div class="detail-group">${target.groupName ?? target.groupId} group</div>
    <table class="detail-table">
      <tr><td>targetId</td><td>${target.targetId}</td></tr>
      <tr><td>actionKinds</td><td>${target.actionKinds.map(k => `<span class="action-badge">${k}</span>`).join(' ')}</td></tr>
      <tr><td>visible</td><td>${boolCell(target.visible)}</td></tr>
      <tr><td>enabled</td><td>${boolCell(target.enabled)}</td></tr>
      <tr><td>inViewport</td><td>${boolCell(target.inViewport)}</td></tr>
      <tr><td>covered</td><td>${boolCell(target.covered)}</td></tr>
      <tr><td>actionableNow</td><td>${boolCell(target.actionableNow)}</td></tr>
      <tr><td>reason</td><td><span class="reason-badge ${reasonClass(target.reason)}">${target.reason}</span></td></tr>
      <tr><td>sensitive</td><td>${target.sensitive ? '<span class="detail-bool-false">true</span>' : boolCell(false)}</td></tr>
      <tr><td>selector</td><td style="color:#89dceb;font-size:9px;">${target.selector}</td></tr>
      <tr><td>textContent</td><td>${target.textContent ? target.textContent : '<span style="color:#585b70;font-style:italic;">—</span>'}</td></tr>
      <tr><td>valuePreview</td><td>${target.valuePreview ?? '<span style="color:#585b70;font-style:italic;">—</span>'}</td></tr>
    </table>
    <button class="highlight-btn" id="highlightBtn">Highlight in Page</button>
  `

  document.getElementById('highlightBtn')?.addEventListener('click', () => {
    highlightInPage(target)
  })
}

function highlightInPage(target: PageTarget) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'highlight',
      targetId: target.targetId,
    }))
  }
}

// --- CSS addition for connection status ---
const style = document.createElement('style')
style.textContent = `
  .status-dot { font-size: 14px; }
  .status-dot.connected { color: #a6e3a1; }
  .status-dot.disconnected { color: #f38ba8; }
  #tabSelect {
    background: #313244;
    border: 1px solid #45475a;
    color: #cdd6f4;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
  }
`
document.head.appendChild(style)

// --- Init ---
connectWebSocket()
render()
```

- [ ] **Step 5: Update devtools package build config**

Update `packages/devtools/package.json` build script to output a static web app to `dist/`. The Vite config should use `src/index.html` as entry point and output to `dist/`.

- [ ] **Step 6: Delete old panel.html**

```bash
rm packages/devtools/src/panel.html
```

- [ ] **Step 7: Build devtools package**

```bash
pnpm --filter @agrune/devtools run build
```

Expected: `packages/devtools/dist/` contains `index.html`, `panel.js`, `panel.css`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(devtools): convert to standalone web app with WebSocket"
```

---

### Task 6: Update release.yml — remove CWS job and extension references

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Remove publish-cws job entirely (lines 57-93)**

Delete the entire `publish-cws` job block.

- [ ] **Step 2: Remove extension from version validation**

In the `Validate versions` step, remove `packages/extension` from the `for pkg in ...` loop and remove the manifest.json version check:

```yaml
      - name: Validate versions
        run: |
          TAG_VERSION="${GITHUB_REF#refs/tags/v}"
          for pkg in . packages/core packages/runtime packages/browser packages/mcp; do
            PKG_VERSION=$(node -p "require('./$pkg/package.json').version")
            if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
              echo "::error::$pkg version ($PKG_VERSION) does not match tag ($TAG_VERSION)"
              exit 1
            fi
          done
          echo "All versions match: $TAG_VERSION"
```

- [ ] **Step 3: Remove manifest sync step**

Delete the `Sync extension manifest version` step.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: remove CWS deploy job and extension references from release"
```

---

### Task 7: Update CLAUDE.md and documentation

**Files:**
- Modify: `/Users/laonpeople/dev/agrune/CLAUDE.md`
- Modify: `/Users/laonpeople/dev/agrune/agrune/README.md` (if exists)

- [ ] **Step 1: Update CLAUDE.md**

Remove references to extension manifest sync, CWS, and extension-specific workflows. Update to reflect CDP-only architecture:

Remove these lines from CLAUDE.md:
- `For `agrune` extension versioning, treat `packages/extension/package.json` as the source of truth.`
- `Keep `packages/extension/manifest.json` version automatically synced to that package version.`
- `Extension build/dev/test/typecheck flows should sync manifest version first.`
- `CI/release should fail if tag, package versions, and extension manifest version do not match.`

Replace with:
- `agrune uses CDP-only mode. No Chrome extension required.`
- `DevTools web app is served at http://localhost:PORT/devtools when MCP server runs.`

- [ ] **Step 2: Update README.md if it exists**

Update usage instructions to reflect new CLI:

```bash
# Launch with DevTools
agrune

# Headless
agrune --headless

# Attach to existing Chrome
agrune --attach ws://127.0.0.1:9222/devtools/browser/<UUID>
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: update for CDP-only architecture, remove extension references"
```

---

### Task 8: Integration test and full verification

**Files:**
- No new files — verification only

- [ ] **Step 1: Full build**

```bash
pnpm install && pnpm build
```

Expected: all remaining packages build without errors.

- [ ] **Step 2: Full test suite**

```bash
pnpm -r test
```

Expected: all tests pass. Total count will be lower than 240 (extension tests removed).

- [ ] **Step 3: Smoke test — launch CDP mode**

```bash
node packages/mcp/dist/bin/agrune-mcp.js
```

Expected: Chrome launches, DevTools URL printed to stderr, MCP server waits on stdio.

- [ ] **Step 4: Smoke test — headless mode**

```bash
node packages/mcp/dist/bin/agrune-mcp.js --headless
```

Expected: no Chrome window, server starts.

- [ ] **Step 5: Smoke test — DevTools web app**

Open the DevTools URL printed in step 3. Verify:
- Page loads with toolbar, target list, detail pane
- Connection status shows green dot
- Tab selector populates
- If a page with annotations is open, snapshots stream in

- [ ] **Step 6: Smoke test — --no-devtools flag**

```bash
node packages/mcp/dist/bin/agrune-mcp.js --no-devtools
```

Expected: no DevTools URL printed, MCP server still works.

- [ ] **Step 7: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: extension removal complete — CDP-only with DevTools web app"
```
