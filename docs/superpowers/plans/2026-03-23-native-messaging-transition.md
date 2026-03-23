# webcli-dom Native Messaging 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebSocket + Companion Server 의존을 제거하고, Chrome Extension + Native Messaging + MCP 서버로 전환하여 AI Agent가 브라우저를 직접 제어할 수 있도록 한다.

**Architecture:** Chrome Extension이 content script로 DOM 스캔 + 런타임 main world 주입을 담당하고, service worker가 Native Messaging으로 MCP 서버(Native Host)와 통신한다. MCP 서버는 세션/명령 관리를 하며 AI Agent에 MCP 도구를 노출한다.

**Tech Stack:** TypeScript, Chrome Extension MV3, Chrome Native Messaging API, MCP SDK (`@modelcontextprotocol/sdk`), Vitest, pnpm workspaces

**Spec:** `docs/superpowers/specs/2026-03-23-native-messaging-transition-design.md`

---

## 파일 구조

### 신규: `packages/extension/`

```
packages/extension/
├── manifest.json                    # MV3 manifest
├── package.json
├── tsconfig.json
├── vite.config.ts                   # Extension 빌드 (crxjs 또는 vite-plugin-web-extension)
├── src/
│   ├── background/
│   │   └── service-worker.ts        # Native Messaging 연결, 탭 관리, 메시지 중계
│   ├── content/
│   │   ├── index.ts                 # content script 진입점
│   │   ├── dom-scanner.ts           # data-webcli-* DOM 스캔 + MutationObserver
│   │   ├── runtime-injector.ts      # main world 런타임 주입
│   │   └── bridge.ts               # window.postMessage ↔ chrome.runtime 브릿지
│   ├── runtime/
│   │   └── page-runtime.ts         # main world에 주입되는 런타임 (build-core에서 추출)
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.ts                # UI 옵션 (포인터 애니메이션, aurora 등)
│   └── shared/
│       ├── messages.ts             # Extension 내부 메시지 타입 정의
│       └── config.ts               # chrome.storage 설정 관리
└── tests/
    ├── dom-scanner.spec.ts
    ├── bridge.spec.ts
    └── messages.spec.ts
```

### 신규: `packages/mcp-server/`

```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── bin/
│   └── webcli-mcp.ts               # CLI 진입점 (Native Host + MCP 서버)
├── src/
│   ├── index.ts                    # MCP 서버 메인
│   ├── native-messaging.ts         # stdin/stdout Native Messaging 프로토콜
│   ├── session-manager.ts          # 탭 단위 세션 + 스냅샷 캐시
│   ├── command-queue.ts            # 명령 큐잉 + 결과 대기
│   ├── tools.ts                    # MCP 도구 정의 (snapshot, act, fill, drag, wait, guide)
│   └── install.ts                  # Native Messaging Host manifest 자동 생성
└── tests/
    ├── native-messaging.spec.ts
    ├── session-manager.spec.ts
    ├── command-queue.spec.ts
    └── tools.spec.ts
```

### 변경: `packages/core/`

```
packages/core/src/
├── index.ts                        # 기존 유지
└── native-messages.ts              # 신규: Extension ↔ Native Host 메시지 타입
```

### 변경: `packages/cli/`

MCP 서버 직접 연결로 리팩터. Companion REST API 의존 제거.

---

## Phase 1: 기본 통신 파이프라인

Extension → Native Messaging → MCP 서버 → Agent 전체 경로가 동작하는 최소 구현.

### Task 1: core에 Native Messaging 메시지 타입 추가

**Files:**
- Create: `packages/core/src/native-messages.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/native-messages.spec.ts`

- [ ] **Step 1: 메시지 타입 테스트 작성**

```typescript
// packages/core/tests/native-messages.spec.ts
import { describe, it, expect } from 'vitest'
import {
  NativeMessage,
  isSnapshotUpdate,
  isCommandRequest,
  isCommandResult,
  isSessionOpen,
  isSessionClose,
  isConfigUpdate,
} from '../src/native-messages'

describe('NativeMessage type guards', () => {
  it('identifies snapshot_update', () => {
    const msg: NativeMessage = {
      type: 'snapshot_update',
      tabId: 1,
      snapshot: { version: 1, capturedAt: Date.now(), url: '', title: '', groups: [], targets: [] },
    }
    expect(isSnapshotUpdate(msg)).toBe(true)
    expect(isCommandRequest(msg)).toBe(false)
  })

  it('identifies command_request', () => {
    const msg: NativeMessage = {
      type: 'command_request',
      tabId: 1,
      commandId: 'cmd-1',
      command: { kind: 'act', targetId: 'btn-1' },
    }
    expect(isCommandRequest(msg)).toBe(true)
  })

  it('identifies command_result', () => {
    const msg: NativeMessage = {
      type: 'command_result',
      tabId: 1,
      commandId: 'cmd-1',
      result: { commandId: 'cmd-1', ok: true },
    }
    expect(isCommandResult(msg)).toBe(true)
  })

  it('identifies session_open', () => {
    const msg: NativeMessage = { type: 'session_open', tabId: 1, url: 'http://localhost', title: 'Test' }
    expect(isSessionOpen(msg)).toBe(true)
  })

  it('identifies session_close', () => {
    const msg: NativeMessage = { type: 'session_close', tabId: 1 }
    expect(isSessionClose(msg)).toBe(true)
  })

  it('identifies config_update', () => {
    const msg: NativeMessage = {
      type: 'config_update',
      config: { pointerAnimation: true, auroraGlow: false },
    }
    expect(isConfigUpdate(msg)).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/core run test`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 메시지 타입 구현**

```typescript
// packages/core/src/native-messages.ts
import type { PageSnapshot, CommandRequest, CommandResult, CompanionConfig } from './index'

// Extension → Native Host
export interface SnapshotUpdateMessage {
  type: 'snapshot_update'
  tabId: number
  snapshot: PageSnapshot
}

export interface CommandResultMessage {
  type: 'command_result'
  tabId: number
  commandId: string
  result: CommandResult
}

export interface SessionOpenMessage {
  type: 'session_open'
  tabId: number
  url: string
  title: string
}

export interface SessionCloseMessage {
  type: 'session_close'
  tabId: number
}

// Native Host → Extension
export interface CommandRequestMessage {
  type: 'command_request'
  tabId: number
  commandId: string
  command: CommandRequest
}

export interface ConfigUpdateMessage {
  type: 'config_update'
  config: Partial<CompanionConfig>
}

export type NativeMessage =
  | SnapshotUpdateMessage
  | CommandResultMessage
  | SessionOpenMessage
  | SessionCloseMessage
  | CommandRequestMessage
  | ConfigUpdateMessage

// Type guards
export const isSnapshotUpdate = (m: NativeMessage): m is SnapshotUpdateMessage => m.type === 'snapshot_update'
export const isCommandRequest = (m: NativeMessage): m is CommandRequestMessage => m.type === 'command_request'
export const isCommandResult = (m: NativeMessage): m is CommandResultMessage => m.type === 'command_result'
export const isSessionOpen = (m: NativeMessage): m is SessionOpenMessage => m.type === 'session_open'
export const isSessionClose = (m: NativeMessage): m is SessionCloseMessage => m.type === 'session_close'
export const isConfigUpdate = (m: NativeMessage): m is ConfigUpdateMessage => m.type === 'config_update'
```

- [ ] **Step 4: core index.ts에서 re-export**

```typescript
// packages/core/src/index.ts 끝에 추가
export * from './native-messages'
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/core run test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/core/src/native-messages.ts packages/core/src/index.ts packages/core/tests/native-messages.spec.ts
git commit -m "feat(core): add native messaging message types and type guards"
```

---

### Task 2: MCP 서버 패키지 — Native Messaging 프로토콜

Chrome Native Messaging의 stdin/stdout 4바이트 길이 프리픽스 + JSON 프로토콜 구현.

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/native-messaging.ts`
- Test: `packages/mcp-server/tests/native-messaging.spec.ts`

- [ ] **Step 1: 패키지 스캐폴드**

```json
// packages/mcp-server/package.json
{
  "name": "@webcli-dom/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@webcli-dom/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "vitest": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

```json
// packages/mcp-server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Native Messaging 테스트 작성**

```typescript
// packages/mcp-server/tests/native-messaging.spec.ts
import { describe, it, expect } from 'vitest'
import { encodeMessage, decodeMessages } from '../src/native-messaging'

describe('Native Messaging protocol', () => {
  it('encodes a message with 4-byte length prefix', () => {
    const msg = { type: 'session_open', tabId: 1, url: 'http://localhost', title: 'Test' }
    const encoded = encodeMessage(msg)
    expect(encoded).toBeInstanceOf(Buffer)

    const length = encoded.readUInt32LE(0)
    const json = encoded.subarray(4, 4 + length).toString('utf-8')
    expect(JSON.parse(json)).toEqual(msg)
  })

  it('decodes a single message from buffer', () => {
    const msg = { type: 'snapshot_update', tabId: 1 }
    const json = JSON.stringify(msg)
    const buf = Buffer.alloc(4 + json.length)
    buf.writeUInt32LE(json.length, 0)
    buf.write(json, 4)

    const { messages, remaining } = decodeMessages(buf)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual(msg)
    expect(remaining.length).toBe(0)
  })

  it('handles partial messages (returns remaining buffer)', () => {
    const msg = { type: 'session_open', tabId: 1, url: '', title: '' }
    const json = JSON.stringify(msg)
    const full = Buffer.alloc(4 + json.length)
    full.writeUInt32LE(json.length, 0)
    full.write(json, 4)

    // Only send first 10 bytes
    const partial = full.subarray(0, 10)
    const { messages, remaining } = decodeMessages(partial)
    expect(messages).toHaveLength(0)
    expect(remaining.length).toBe(10)
  })

  it('decodes multiple messages from a single buffer', () => {
    const msg1 = { type: 'session_open', tabId: 1, url: '', title: '' }
    const msg2 = { type: 'session_close', tabId: 1 }
    const buf1 = encodeMessage(msg1)
    const buf2 = encodeMessage(msg2)
    const combined = Buffer.concat([buf1, buf2])

    const { messages } = decodeMessages(combined)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual(msg1)
    expect(messages[1]).toEqual(msg2)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm install && pnpm --filter @webcli-dom/mcp-server run test`
Expected: FAIL

- [ ] **Step 4: Native Messaging 프로토콜 구현**

```typescript
// packages/mcp-server/src/native-messaging.ts
import type { NativeMessage } from '@webcli-dom/core'

export function encodeMessage(msg: unknown): Buffer {
  const json = JSON.stringify(msg)
  const body = Buffer.from(json, 'utf-8')
  const header = Buffer.alloc(4)
  header.writeUInt32LE(body.length, 0)
  return Buffer.concat([header, body])
}

export function decodeMessages(buffer: Buffer): { messages: NativeMessage[]; remaining: Buffer } {
  const messages: NativeMessage[] = []
  let offset = 0

  while (offset + 4 <= buffer.length) {
    const length = buffer.readUInt32LE(offset)
    if (offset + 4 + length > buffer.length) break

    const json = buffer.subarray(offset + 4, offset + 4 + length).toString('utf-8')
    messages.push(JSON.parse(json))
    offset += 4 + length
  }

  return { messages, remaining: buffer.subarray(offset) }
}

export function createNativeMessagingTransport(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
) {
  let buffer = Buffer.alloc(0)
  const listeners: Array<(msg: NativeMessage) => void> = []

  input.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    const { messages, remaining } = decodeMessages(buffer)
    buffer = remaining
    for (const msg of messages) {
      for (const listener of listeners) listener(msg)
    }
  })

  return {
    send(msg: unknown) {
      output.write(encodeMessage(msg))
    },
    onMessage(listener: (msg: NativeMessage) => void) {
      listeners.push(listener)
    },
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/mcp-server run test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/mcp-server/
git commit -m "feat(mcp-server): add native messaging protocol encoder/decoder"
```

---

### Task 3: MCP 서버 — 세션 관리자 + 명령 큐

**Files:**
- Create: `packages/mcp-server/src/session-manager.ts`
- Create: `packages/mcp-server/src/command-queue.ts`
- Test: `packages/mcp-server/tests/session-manager.spec.ts`
- Test: `packages/mcp-server/tests/command-queue.spec.ts`

- [ ] **Step 1: 세션 관리자 테스트 작성**

```typescript
// packages/mcp-server/tests/session-manager.spec.ts
import { describe, it, expect } from 'vitest'
import { SessionManager } from '../src/session-manager'

describe('SessionManager', () => {
  it('opens a session on session_open', () => {
    const sm = new SessionManager()
    sm.openSession(1, 'http://localhost', 'Test')
    expect(sm.getSessions()).toHaveLength(1)
    expect(sm.getSession(1)).toMatchObject({ tabId: 1, url: 'http://localhost' })
  })

  it('closes a session on session_close', () => {
    const sm = new SessionManager()
    sm.openSession(1, 'http://localhost', 'Test')
    sm.closeSession(1)
    expect(sm.getSessions()).toHaveLength(0)
  })

  it('caches latest snapshot per tab', () => {
    const sm = new SessionManager()
    sm.openSession(1, 'http://localhost', 'Test')
    const snapshot = { version: 1, capturedAt: Date.now(), url: '', title: '', groups: [], targets: [] }
    sm.updateSnapshot(1, snapshot)
    expect(sm.getSnapshot(1)).toEqual(snapshot)
  })

  it('returns null for unknown tab', () => {
    const sm = new SessionManager()
    expect(sm.getSession(999)).toBeNull()
    expect(sm.getSnapshot(999)).toBeNull()
  })
})
```

- [ ] **Step 2: 명령 큐 테스트 작성**

```typescript
// packages/mcp-server/tests/command-queue.spec.ts
import { describe, it, expect } from 'vitest'
import { CommandQueue } from '../src/command-queue'

describe('CommandQueue', () => {
  it('enqueues a command and returns a promise', async () => {
    const queue = new CommandQueue()
    const sent: any[] = []
    queue.setSender((msg) => sent.push(msg))

    const promise = queue.enqueue(1, { kind: 'act', targetId: 'btn-1' })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'command_request', tabId: 1, command: { kind: 'act', targetId: 'btn-1' } })

    // Simulate result
    queue.resolve(sent[0].commandId, { commandId: sent[0].commandId, ok: true })
    const result = await promise
    expect(result.ok).toBe(true)
  })

  it('times out if no result received', async () => {
    const queue = new CommandQueue()
    queue.setSender(() => {})
    const promise = queue.enqueue(1, { kind: 'act', targetId: 'btn-1' }, { timeoutMs: 50 })
    await expect(promise).rejects.toThrow('timeout')
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/mcp-server run test`
Expected: FAIL

- [ ] **Step 4: 세션 관리자 구현**

```typescript
// packages/mcp-server/src/session-manager.ts
import type { PageSnapshot } from '@webcli-dom/core'

interface Session {
  tabId: number
  url: string
  title: string
  snapshot: PageSnapshot | null
  openedAt: number
}

export class SessionManager {
  private sessions = new Map<number, Session>()

  openSession(tabId: number, url: string, title: string) {
    this.sessions.set(tabId, { tabId, url, title, snapshot: null, openedAt: Date.now() })
  }

  closeSession(tabId: number) {
    this.sessions.delete(tabId)
  }

  getSession(tabId: number): Session | null {
    return this.sessions.get(tabId) ?? null
  }

  getSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  updateSnapshot(tabId: number, snapshot: PageSnapshot) {
    const session = this.sessions.get(tabId)
    if (session) session.snapshot = snapshot
  }

  getSnapshot(tabId: number): PageSnapshot | null {
    return this.sessions.get(tabId)?.snapshot ?? null
  }
}
```

- [ ] **Step 5: 명령 큐 구현**

```typescript
// packages/mcp-server/src/command-queue.ts
import type { CommandRequest, CommandResult, NativeMessage } from '@webcli-dom/core'

interface PendingCommand {
  commandId: string
  resolve: (result: CommandResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class CommandQueue {
  private pending = new Map<string, PendingCommand>()
  private counter = 0
  private sender: (msg: NativeMessage) => void = () => {}

  setSender(sender: (msg: NativeMessage) => void) {
    this.sender = sender
  }

  enqueue(
    tabId: number,
    command: CommandRequest,
    opts: { timeoutMs?: number } = {},
  ): Promise<CommandResult> {
    const commandId = `cmd-${++this.counter}-${Date.now()}`
    const timeoutMs = opts.timeoutMs ?? 30_000

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandId)
        reject(new Error('timeout'))
      }, timeoutMs)

      this.pending.set(commandId, { commandId, resolve, reject, timer })
      this.sender({ type: 'command_request', tabId, commandId, command })
    })
  }

  resolve(commandId: string, result: CommandResult) {
    const pending = this.pending.get(commandId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(commandId)
    pending.resolve(result)
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/mcp-server run test`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/mcp-server/src/session-manager.ts packages/mcp-server/src/command-queue.ts packages/mcp-server/tests/
git commit -m "feat(mcp-server): add session manager and command queue"
```

---

### Task 4: MCP 서버 — MCP 도구 정의 + 서버 메인

**Files:**
- Create: `packages/mcp-server/src/tools.ts`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/bin/webcli-mcp.ts`
- Test: `packages/mcp-server/tests/tools.spec.ts`

- [ ] **Step 1: MCP 도구 테스트 작성**

```typescript
// packages/mcp-server/tests/tools.spec.ts
import { describe, it, expect } from 'vitest'
import { getToolDefinitions } from '../src/tools'

describe('MCP tool definitions', () => {
  it('defines all required tools', () => {
    const tools = getToolDefinitions()
    const names = tools.map((t) => t.name)
    expect(names).toContain('webcli_snapshot')
    expect(names).toContain('webcli_act')
    expect(names).toContain('webcli_fill')
    expect(names).toContain('webcli_drag')
    expect(names).toContain('webcli_wait')
    expect(names).toContain('webcli_guide')
    expect(names).toContain('webcli_sessions')
    expect(names).toContain('webcli_config')
  })

  it('webcli_act requires targetId parameter', () => {
    const tools = getToolDefinitions()
    const act = tools.find((t) => t.name === 'webcli_act')!
    expect(act.inputSchema.properties).toHaveProperty('targetId')
    expect(act.inputSchema.required).toContain('targetId')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/mcp-server run test`
Expected: FAIL

- [ ] **Step 3: MCP 도구 정의 구현**

```typescript
// packages/mcp-server/src/tools.ts
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'webcli_sessions',
      description: 'List all active browser sessions (tabs) with webcli-dom annotations',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'webcli_snapshot',
      description: 'Get the current page snapshot including all annotated targets and their states',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'Tab ID. Omit to use the most recent active tab.' },
        },
      },
    },
    {
      name: 'webcli_act',
      description: 'Click an annotated target element',
      inputSchema: {
        type: 'object',
        properties: {
          targetId: { type: 'string', description: 'The target ID to click' },
          tabId: { type: 'number', description: 'Tab ID. Omit to use the most recent active tab.' },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'webcli_fill',
      description: 'Fill an input/textarea with a value',
      inputSchema: {
        type: 'object',
        properties: {
          targetId: { type: 'string', description: 'The target ID to fill' },
          value: { type: 'string', description: 'The value to fill' },
          tabId: { type: 'number', description: 'Tab ID. Omit to use the most recent active tab.' },
        },
        required: ['targetId', 'value'],
      },
    },
    {
      name: 'webcli_drag',
      description: 'Drag one target to another',
      inputSchema: {
        type: 'object',
        properties: {
          sourceTargetId: { type: 'string', description: 'Source target ID' },
          destinationTargetId: { type: 'string', description: 'Destination target ID' },
          placement: { type: 'string', enum: ['before', 'inside', 'after'], description: 'Drop placement' },
          tabId: { type: 'number', description: 'Tab ID. Omit to use the most recent active tab.' },
        },
        required: ['sourceTargetId', 'destinationTargetId'],
      },
    },
    {
      name: 'webcli_wait',
      description: 'Wait for a target to reach a specific state',
      inputSchema: {
        type: 'object',
        properties: {
          targetId: { type: 'string', description: 'The target ID to wait for' },
          state: { type: 'string', enum: ['visible', 'hidden', 'enabled', 'disabled'], description: 'Desired state' },
          timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default: 10000)' },
          tabId: { type: 'number', description: 'Tab ID. Omit to use the most recent active tab.' },
        },
        required: ['targetId', 'state'],
      },
    },
    {
      name: 'webcli_guide',
      description: 'Visually highlight a target element without executing an action',
      inputSchema: {
        type: 'object',
        properties: {
          targetId: { type: 'string', description: 'The target ID to highlight' },
          tabId: { type: 'number', description: 'Tab ID. Omit to use the most recent active tab.' },
        },
        required: ['targetId'],
      },
    },
    {
      name: 'webcli_config',
      description: 'Update runtime configuration (pointer animation, aurora glow, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          pointerAnimation: { type: 'boolean' },
          auroraGlow: { type: 'boolean' },
          auroraTheme: { type: 'string', enum: ['dark', 'light'] },
          clickDelayMs: { type: 'number' },
          autoScroll: { type: 'boolean' },
        },
      },
    },
  ]
}
```

- [ ] **Step 4: MCP 서버 메인 구현**

```typescript
// packages/mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { SessionManager } from './session-manager'
import { CommandQueue } from './command-queue'
import { createNativeMessagingTransport } from './native-messaging'
import { getToolDefinitions } from './tools'
import { isSnapshotUpdate, isCommandResult, isSessionOpen, isSessionClose } from '@webcli-dom/core'
import type { NativeMessage } from '@webcli-dom/core'

export function createMcpServer() {
  const sessions = new SessionManager()
  const commands = new CommandQueue()
  let nativeTransport: ReturnType<typeof createNativeMessagingTransport> | null = null

  const server = new Server({ name: 'webcli-dom', version: '0.1.0' }, {
    capabilities: { tools: {} },
  })

  // Native Messaging 연결 (Extension ↔ MCP Server)
  function connectNativeMessaging(input: NodeJS.ReadableStream, output: NodeJS.WritableStream) {
    nativeTransport = createNativeMessagingTransport(input, output)
    commands.setSender((msg) => nativeTransport!.send(msg))

    nativeTransport.onMessage((msg: NativeMessage) => {
      if (isSessionOpen(msg)) sessions.openSession(msg.tabId, msg.url, msg.title)
      else if (isSessionClose(msg)) sessions.closeSession(msg.tabId)
      else if (isSnapshotUpdate(msg)) sessions.updateSnapshot(msg.tabId, msg.snapshot)
      else if (isCommandResult(msg)) commands.resolve(msg.commandId, msg.result)
    })
  }

  // MCP 도구 목록
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getToolDefinitions(),
  }))

  // MCP 도구 실행
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const tabId = (args as any).tabId ?? sessions.getSessions()[0]?.tabId

    switch (name) {
      case 'webcli_sessions':
        return { content: [{ type: 'text', text: JSON.stringify(sessions.getSessions(), null, 2) }] }

      case 'webcli_snapshot': {
        const snapshot = sessions.getSnapshot(tabId)
        if (!snapshot) return { content: [{ type: 'text', text: 'No snapshot available for this tab' }] }
        return { content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }] }
      }

      case 'webcli_act':
      case 'webcli_fill':
      case 'webcli_drag':
      case 'webcli_wait':
      case 'webcli_guide': {
        const kind = name.replace('webcli_', '') as any
        const command = { kind, ...args }
        delete command.tabId
        const result = await commands.enqueue(tabId, command)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }

      case 'webcli_config': {
        const config = { ...args }
        delete config.tabId
        nativeTransport?.send({ type: 'config_update', config })
        return { content: [{ type: 'text', text: 'Config updated' }] }
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }
  })

  return { server, sessions, commands, connectNativeMessaging }
}
```

- [ ] **Step 5: CLI 진입점**

```typescript
// packages/mcp-server/bin/webcli-mcp.ts
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from '../src/index'

const { server } = createMcpServer()
const transport = new StdioServerTransport()
await server.connect(transport)
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/mcp-server run test`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/mcp-server/
git commit -m "feat(mcp-server): add MCP tool definitions and server main"
```

---

### Task 5: MCP 서버 — Native Messaging Host 자동 설치

**Files:**
- Create: `packages/mcp-server/src/install.ts`
- Test: `packages/mcp-server/tests/install.spec.ts`

- [ ] **Step 1: 설치 테스트 작성**

```typescript
// packages/mcp-server/tests/install.spec.ts
import { describe, it, expect } from 'vitest'
import { getNativeHostManifest, getNativeHostPath } from '../src/install'
import { platform } from 'os'

describe('Native Host installer', () => {
  it('generates correct manifest', () => {
    const manifest = getNativeHostManifest('/usr/local/bin/webcli-mcp', 'abcdef123456')
    expect(manifest.name).toBe('com.webcli.dom')
    expect(manifest.type).toBe('stdio')
    expect(manifest.path).toBe('/usr/local/bin/webcli-mcp')
    expect(manifest.allowed_origins).toContain('chrome-extension://abcdef123456/')
  })

  it('returns correct path for current platform', () => {
    const hostPath = getNativeHostPath()
    if (platform() === 'darwin') {
      expect(hostPath).toContain('NativeMessagingHosts')
      expect(hostPath).toContain('com.webcli.dom.json')
    } else if (platform() === 'linux') {
      expect(hostPath).toContain('.config/google-chrome')
    }
  })
})
```

- [ ] **Step 2: 테스트 실패 확인 → 구현**

```typescript
// packages/mcp-server/src/install.ts
import { join } from 'path'
import { homedir, platform } from 'os'
import { mkdirSync, writeFileSync } from 'fs'

const HOST_NAME = 'com.webcli.dom'

export function getNativeHostPath(): string {
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts', `${HOST_NAME}.json`)
    case 'linux':
      return join(home, '.config/google-chrome/NativeMessagingHosts', `${HOST_NAME}.json`)
    default:
      throw new Error(`Unsupported platform: ${platform()}`)
  }
}

export function getNativeHostManifest(binaryPath: string, extensionId: string) {
  return {
    name: HOST_NAME,
    description: 'webcli-dom MCP server native messaging host',
    path: binaryPath,
    type: 'stdio' as const,
    allowed_origins: [`chrome-extension://${extensionId}/`],
  }
}

export function installNativeHost(binaryPath: string, extensionId: string) {
  const hostPath = getNativeHostPath()
  const manifest = getNativeHostManifest(binaryPath, extensionId)
  mkdirSync(join(hostPath, '..'), { recursive: true })
  writeFileSync(hostPath, JSON.stringify(manifest, null, 2))
  return hostPath
}
```

- [ ] **Step 3: 테스트 통과 확인 + 커밋**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/mcp-server run test`
Expected: PASS

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/mcp-server/src/install.ts packages/mcp-server/tests/install.spec.ts
git commit -m "feat(mcp-server): add native messaging host auto-installer"
```

---

### Task 6: Extension 패키지 — 프로젝트 스캐폴드 + Manifest

**Files:**
- Create: `packages/extension/manifest.json`
- Create: `packages/extension/package.json`
- Create: `packages/extension/vite.config.ts`
- Create: `packages/extension/tsconfig.json`

- [ ] **Step 1: package.json**

```json
// packages/extension/package.json
{
  "name": "@webcli-dom/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "@webcli-dom/core": "workspace:*"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "vite": "^6.0.0",
    "vitest": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: MV3 manifest.json**

```json
// packages/extension/manifest.json
{
  "manifest_version": 3,
  "name": "webcli-dom",
  "version": "0.1.0",
  "description": "Browser automation for AI agents via annotated DOM elements",
  "permissions": [
    "nativeMessaging",
    "activeTab",
    "scripting",
    "storage"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/service-worker.ts"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html"
  }
}
```

- [ ] **Step 3: vite.config.ts**

```typescript
// packages/extension/vite.config.ts
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
  },
})
```

- [ ] **Step 4: tsconfig.json**

```json
// packages/extension/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["chrome"],
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: pnpm install + 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
pnpm install
git add packages/extension/
git commit -m "feat(extension): scaffold Chrome Extension MV3 project"
```

---

### Task 7: Extension — Content Script + DOM Scanner

**Files:**
- Create: `packages/extension/src/content/index.ts`
- Create: `packages/extension/src/content/dom-scanner.ts`
- Create: `packages/extension/src/shared/messages.ts`
- Test: `packages/extension/tests/dom-scanner.spec.ts`

- [ ] **Step 1: DOM 스캐너 테스트 작성**

```typescript
// packages/extension/tests/dom-scanner.spec.ts
import { describe, it, expect } from 'vitest'
import { scanAnnotations } from '../src/content/dom-scanner'

// jsdom 환경에서 테스트
describe('DOM Scanner', () => {
  it('finds elements with data-webcli-action', () => {
    document.body.innerHTML = `
      <button data-webcli-action="click" data-webcli-name="Login">Login</button>
      <input data-webcli-action="fill" data-webcli-name="Email" type="email" />
      <div>No annotation</div>
    `
    const targets = scanAnnotations(document)
    expect(targets).toHaveLength(2)
    expect(targets[0]).toMatchObject({ name: 'Login', actionKind: 'click' })
    expect(targets[1]).toMatchObject({ name: 'Email', actionKind: 'fill' })
  })

  it('extracts group info', () => {
    document.body.innerHTML = `
      <section data-webcli-group="nav" data-webcli-group-name="Navigation">
        <a data-webcli-action="click" data-webcli-name="Home">Home</a>
      </section>
    `
    const targets = scanAnnotations(document)
    expect(targets[0]).toMatchObject({ groupId: 'nav', name: 'Home' })
  })

  it('returns empty array when no annotations', () => {
    document.body.innerHTML = '<div>Plain page</div>'
    expect(scanAnnotations(document)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인 → 구현**

```typescript
// packages/extension/src/content/dom-scanner.ts
interface ScannedTarget {
  targetId: string
  selector: string
  name: string
  description: string
  actionKind: 'click' | 'fill'
  groupId?: string
  sensitive: boolean
}

export function scanAnnotations(doc: Document): ScannedTarget[] {
  const elements = doc.querySelectorAll('[data-webcli-action]')
  const targets: ScannedTarget[] = []

  elements.forEach((el, index) => {
    const action = el.getAttribute('data-webcli-action') as 'click' | 'fill'
    const name = el.getAttribute('data-webcli-name') ?? ''
    const desc = el.getAttribute('data-webcli-desc') ?? ''
    const key = el.getAttribute('data-webcli-key')
    const sensitive = el.getAttribute('data-webcli-sensitive') === 'true'

    // Find closest group
    const groupEl = el.closest('[data-webcli-group]')
    const groupId = groupEl?.getAttribute('data-webcli-group') ?? undefined

    const targetId = key ?? `wcli_${index}`
    const selector = generateSelector(el)

    targets.push({ targetId, selector, name, description: desc, actionKind: action, groupId, sensitive })
  })

  return targets
}

function generateSelector(el: Element): string {
  const key = el.getAttribute('data-webcli-key')
  if (key) return `[data-webcli-key="${key}"]`
  const name = el.getAttribute('data-webcli-name')
  if (name) return `[data-webcli-name="${name}"]`
  return `[data-webcli-action]`
}

export function scanGroups(doc: Document): Array<{ groupId: string; name: string; description: string }> {
  const groupEls = doc.querySelectorAll('[data-webcli-group]')
  const groups: Array<{ groupId: string; name: string; description: string }> = []
  groupEls.forEach((el) => {
    groups.push({
      groupId: el.getAttribute('data-webcli-group')!,
      name: el.getAttribute('data-webcli-group-name') ?? '',
      description: el.getAttribute('data-webcli-group-desc') ?? '',
    })
  })
  return groups
}
```

- [ ] **Step 3: 내부 메시지 타입 정의**

```typescript
// packages/extension/src/shared/messages.ts
import type { PageSnapshot, CommandRequest, CommandResult, CompanionConfig } from '@webcli-dom/core'

// content script ↔ service worker
export type ExtensionMessage =
  | { type: 'snapshot'; tabId: number; snapshot: PageSnapshot }
  | { type: 'command'; tabId: number; commandId: string; command: CommandRequest }
  | { type: 'command_result'; tabId: number; commandId: string; result: CommandResult }
  | { type: 'session_open'; tabId: number; url: string; title: string }
  | { type: 'session_close'; tabId: number }
  | { type: 'config_update'; config: Partial<CompanionConfig> }
```

- [ ] **Step 4: content script 진입점 (초기 버전)**

```typescript
// packages/extension/src/content/index.ts
import { scanAnnotations, scanGroups } from './dom-scanner'

function hasAnnotations(): boolean {
  return document.querySelector('[data-webcli-action]') !== null
}

function init() {
  if (!hasAnnotations()) return

  // 페이지에 webcli 어노테이션이 있으면 활성화
  chrome.runtime.sendMessage({
    type: 'session_open',
    url: location.href,
    title: document.title,
  })

  // MutationObserver로 DOM 변경 감시
  const observer = new MutationObserver(() => {
    // 스냅샷 갱신은 런타임 주입 후 처리 (Task 8에서 구현)
  })

  observer.observe(document.body, { childList: true, subtree: true, attributes: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
```

- [ ] **Step 5: 테스트 통과 확인 + 커밋**

vitest.config.ts에 jsdom 환경 추가:
```typescript
// packages/extension/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'jsdom',
    globals: true,
  },
})
```

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/extension run test`
Expected: PASS

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/extension/src/ packages/extension/tests/ packages/extension/vitest.config.ts
git commit -m "feat(extension): add content script with DOM scanner"
```

---

### Task 8: Extension — Runtime Injector + PostMessage Bridge

**Files:**
- Create: `packages/extension/src/content/runtime-injector.ts`
- Create: `packages/extension/src/content/bridge.ts`
- Create: `packages/extension/src/runtime/page-runtime.ts`
- Test: `packages/extension/tests/bridge.spec.ts`

- [ ] **Step 1: bridge 테스트 작성**

```typescript
// packages/extension/tests/bridge.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { BRIDGE_MESSAGE_KEY, createBridgeMessage, isBridgeMessage } from '../src/content/bridge'

describe('PostMessage bridge', () => {
  it('creates a bridge message with correct key', () => {
    const msg = createBridgeMessage('snapshot', { version: 1 })
    expect(msg).toMatchObject({
      source: BRIDGE_MESSAGE_KEY,
      payload: { type: 'snapshot', data: { version: 1 } },
    })
  })

  it('identifies bridge messages', () => {
    const valid = { source: BRIDGE_MESSAGE_KEY, payload: { type: 'test' } }
    const invalid = { source: 'other', payload: {} }
    expect(isBridgeMessage(valid)).toBe(true)
    expect(isBridgeMessage(invalid)).toBe(false)
  })
})
```

- [ ] **Step 2: bridge 구현**

```typescript
// packages/extension/src/content/bridge.ts
export const BRIDGE_MESSAGE_KEY = '__webcli_dom_bridge__'

export function createBridgeMessage(type: string, data: unknown) {
  return { source: BRIDGE_MESSAGE_KEY, payload: { type, data } }
}

export function isBridgeMessage(event: unknown): boolean {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as any).source === BRIDGE_MESSAGE_KEY
  )
}

export function setupBridge(onMessage: (type: string, data: unknown) => void) {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!isBridgeMessage(event.data)) return
    const { type, data } = event.data.payload
    onMessage(type, data)
  })
}

export function sendToBridge(type: string, data: unknown) {
  window.postMessage(createBridgeMessage(type, data), '*')
}
```

- [ ] **Step 3: 런타임 인젝터 구현**

```typescript
// packages/extension/src/content/runtime-injector.ts
export function injectRuntime() {
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('src/runtime/page-runtime.js')
  script.onload = () => script.remove()
  ;(document.head || document.documentElement).appendChild(script)
}
```

- [ ] **Step 4: page-runtime.ts 초기 구현 (build-core에서 추출)**

이 파일은 기존 `build-core/src/runtime/page-agent-runtime.ts`의 코어 로직을 가져와서 Extension 번들용으로 래핑한다. 전체 19K lines를 그대로 복사하지 않고, `installPageAgentRuntime`을 import하여 사용.

```typescript
// packages/extension/src/runtime/page-runtime.ts
// 이 파일은 main world에서 실행됨

import { BRIDGE_MESSAGE_KEY } from '../content/bridge'

// build-core의 런타임 로직은 별도 빌드 단계에서 번들링
// 여기서는 bridge 통신 + window.webcliDom 연동만 담당

const WEBCLI_DOM_KEY = '__webcli_dom_page_agent_runtime__'

function sendToContentScript(type: string, data: unknown) {
  window.postMessage({ source: BRIDGE_MESSAGE_KEY, payload: { type, data } }, '*')
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (!event.data || event.data.source !== BRIDGE_MESSAGE_KEY) return

  const { type, data } = event.data.payload

  if (type === 'command' && window.webcliDom) {
    const { kind, commandId, ...args } = data
    const runtime = window.webcliDom
    const fn = runtime[kind as keyof typeof runtime]
    if (typeof fn === 'function') {
      ;(fn as Function).call(runtime, args).then((result: unknown) => {
        sendToContentScript('command_result', { commandId, result })
      })
    }
  }

  if (type === 'request_snapshot' && window.webcliDom) {
    const snapshot = window.webcliDom.getSnapshot()
    sendToContentScript('snapshot', snapshot)
  }

  if (type === 'config_update' && window.webcliDom) {
    window.webcliDom.applyConfig(data)
  }
})

// 런타임 준비 완료 알림
sendToContentScript('runtime_ready', {})
```

- [ ] **Step 5: 테스트 통과 확인 + 커밋**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm --filter @webcli-dom/extension run test`
Expected: PASS

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/extension/src/content/bridge.ts packages/extension/src/content/runtime-injector.ts packages/extension/src/runtime/ packages/extension/tests/bridge.spec.ts
git commit -m "feat(extension): add runtime injector and postMessage bridge"
```

---

### Task 9: Extension — Service Worker (Native Messaging 중계)

**Files:**
- Create: `packages/extension/src/background/service-worker.ts`

- [ ] **Step 1: service worker 구현**

```typescript
// packages/extension/src/background/service-worker.ts
const NATIVE_HOST_NAME = 'com.webcli.dom'

let nativePort: chrome.runtime.Port | null = null

function ensureNativeConnection() {
  if (nativePort) return nativePort
  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME)

  nativePort.onMessage.addListener((msg) => {
    // Native Host → Extension: command_request 또는 config_update
    if (msg.type === 'command_request' || msg.type === 'config_update') {
      const tabId = msg.tabId
      if (tabId) {
        chrome.tabs.sendMessage(tabId, msg)
      }
    }
  })

  nativePort.onDisconnect.addListener(() => {
    nativePort = null
    console.log('Native host disconnected:', chrome.runtime.lastError?.message)
  })

  return nativePort
}

// Content script → Service worker → Native Host
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender.tab?.id) return

  const tabId = sender.tab.id

  if (msg.type === 'session_open') {
    const port = ensureNativeConnection()
    port.postMessage({ type: 'session_open', tabId, url: msg.url, title: msg.title })
  }

  if (msg.type === 'snapshot') {
    const port = ensureNativeConnection()
    port.postMessage({ type: 'snapshot_update', tabId, snapshot: msg.snapshot })
  }

  if (msg.type === 'command_result') {
    const port = ensureNativeConnection()
    port.postMessage({ type: 'command_result', tabId, commandId: msg.commandId, result: msg.result })
  }

  return false
})

// 탭 닫힘 감지
chrome.tabs.onRemoved.addListener((tabId) => {
  if (nativePort) {
    nativePort.postMessage({ type: 'session_close', tabId })
  }
})

// 탭 URL 변경 감지
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && nativePort) {
    nativePort.postMessage({ type: 'session_open', tabId, url: changeInfo.url, title: changeInfo.title ?? '' })
  }
})
```

- [ ] **Step 2: 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/extension/src/background/
git commit -m "feat(extension): add service worker with native messaging relay"
```

---

## Phase 2: 전체 명령 + UI

### Task 10: Extension — Popup UI 옵션

**Files:**
- Create: `packages/extension/src/popup/popup.html`
- Create: `packages/extension/src/popup/popup.ts`
- Create: `packages/extension/src/shared/config.ts`

- [ ] **Step 1: config 유틸 구현**

```typescript
// packages/extension/src/shared/config.ts
import type { CompanionConfig } from '@webcli-dom/core'

const DEFAULTS: CompanionConfig = {
  clickDelayMs: 0,
  pointerAnimation: true,
  autoScroll: true,
  cursorName: 'default',
  auroraGlow: true,
  auroraTheme: 'dark',
}

export async function getConfig(): Promise<CompanionConfig> {
  const stored = await chrome.storage.sync.get('webcliConfig')
  return { ...DEFAULTS, ...stored.webcliConfig }
}

export async function setConfig(partial: Partial<CompanionConfig>): Promise<CompanionConfig> {
  const current = await getConfig()
  const updated = { ...current, ...partial }
  await chrome.storage.sync.set({ webcliConfig: updated })
  return updated
}
```

- [ ] **Step 2: popup.html + popup.ts**

```html
<!-- packages/extension/src/popup/popup.html -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>webcli-dom</title>
<style>
  body { width: 280px; padding: 16px; font-family: system-ui; font-size: 13px; }
  h3 { margin: 0 0 12px; }
  label { display: flex; justify-content: space-between; align-items: center; margin: 8px 0; }
  select, input[type=number] { width: 80px; }
</style>
</head>
<body>
  <h3>webcli-dom</h3>
  <label>Pointer Animation <input type="checkbox" id="pointerAnimation"></label>
  <label>Aurora Glow <input type="checkbox" id="auroraGlow"></label>
  <label>Theme <select id="auroraTheme"><option value="dark">Dark</option><option value="light">Light</option></select></label>
  <label>Click Delay (ms) <input type="number" id="clickDelayMs" min="0" max="2000" step="50"></label>
  <label>Auto Scroll <input type="checkbox" id="autoScroll"></label>
  <script src="popup.ts" type="module"></script>
</body>
</html>
```

```typescript
// packages/extension/src/popup/popup.ts
import { getConfig, setConfig } from '../shared/config'

async function init() {
  const config = await getConfig()

  const els = {
    pointerAnimation: document.getElementById('pointerAnimation') as HTMLInputElement,
    auroraGlow: document.getElementById('auroraGlow') as HTMLInputElement,
    auroraTheme: document.getElementById('auroraTheme') as HTMLSelectElement,
    clickDelayMs: document.getElementById('clickDelayMs') as HTMLInputElement,
    autoScroll: document.getElementById('autoScroll') as HTMLInputElement,
  }

  // Load current values
  els.pointerAnimation.checked = config.pointerAnimation
  els.auroraGlow.checked = config.auroraGlow
  els.auroraTheme.value = config.auroraTheme
  els.clickDelayMs.value = String(config.clickDelayMs)
  els.autoScroll.checked = config.autoScroll

  // Save on change
  const save = async () => {
    const updated = await setConfig({
      pointerAnimation: els.pointerAnimation.checked,
      auroraGlow: els.auroraGlow.checked,
      auroraTheme: els.auroraTheme.value as 'dark' | 'light',
      clickDelayMs: Number(els.clickDelayMs.value),
      autoScroll: els.autoScroll.checked,
    })
    // Broadcast config to all tabs
    chrome.runtime.sendMessage({ type: 'config_broadcast', config: updated })
  }

  Object.values(els).forEach((el) => el.addEventListener('change', save))
}

init()
```

- [ ] **Step 3: 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/extension/src/popup/ packages/extension/src/shared/config.ts
git commit -m "feat(extension): add popup UI with runtime config options"
```

---

### Task 11: CLI — MCP 서버 직접 연결로 리팩터

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: CLI가 MCP 서버와 직접 통신하도록 리팩터**

기존 Companion REST API 호출을 MCP 클라이언트로 교체. `@modelcontextprotocol/sdk/client`를 사용하여 MCP 서버의 stdio에 연결.

```typescript
// packages/cli/src/index.ts (핵심 변경 부분)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

async function createClient() {
  const transport = new StdioClientTransport({
    command: 'webcli-mcp',
    args: [],
  })
  const client = new Client({ name: 'webcli-cli', version: '0.1.0' })
  await client.connect(transport)
  return client
}

// 각 명령을 client.callTool()로 교체
// 예: webcli act --target btn-1
// → client.callTool({ name: 'webcli_act', arguments: { targetId: 'btn-1' } })
```

- [ ] **Step 2: package.json 의존성 업데이트**

Companion 의존 제거, MCP SDK 추가.

- [ ] **Step 3: 기존 테스트 업데이트 + 통과 확인**

- [ ] **Step 4: 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/cli/
git commit -m "refactor(cli): replace companion REST API with MCP client"
```

---

## Phase 3: 통합 테스트 + AI Agent 연동

### Task 12: 통합 테스트 — Extension ↔ MCP 서버 ↔ CLI 전체 경로

**Files:**
- Create: `packages/mcp-server/tests/integration.spec.ts`

- [ ] **Step 1: MCP 서버를 프로그래밍 방식으로 시작하고, 가짜 Extension 메시지를 stdin으로 보내 전체 파이프라인 검증**

```typescript
// packages/mcp-server/tests/integration.spec.ts
import { describe, it, expect } from 'vitest'
import { createMcpServer } from '../src/index'
import { Readable, Writable } from 'stream'
import { encodeMessage, decodeMessages } from '../src/native-messaging'

describe('Integration: MCP server end-to-end', () => {
  it('receives session_open + snapshot, returns snapshot via MCP tool', async () => {
    const { server, sessions, connectNativeMessaging } = createMcpServer()

    // Simulate Native Messaging stdin/stdout
    const fakeInput = new Readable({ read() {} })
    const outputChunks: Buffer[] = []
    const fakeOutput = new Writable({
      write(chunk, _enc, cb) { outputChunks.push(chunk); cb() },
    })

    connectNativeMessaging(fakeInput, fakeOutput)

    // Simulate Extension sending session_open
    fakeInput.push(encodeMessage({ type: 'session_open', tabId: 42, url: 'http://test.com', title: 'Test' }))

    await new Promise((r) => setTimeout(r, 50))
    expect(sessions.getSessions()).toHaveLength(1)

    // Simulate Extension sending snapshot
    const snapshot = { version: 1, capturedAt: Date.now(), url: 'http://test.com', title: 'Test', groups: [], targets: [] }
    fakeInput.push(encodeMessage({ type: 'snapshot_update', tabId: 42, snapshot }))

    await new Promise((r) => setTimeout(r, 50))
    expect(sessions.getSnapshot(42)).toEqual(snapshot)
  })
})
```

- [ ] **Step 2: 테스트 통과 확인 + 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add packages/mcp-server/tests/integration.spec.ts
git commit -m "test(mcp-server): add integration test for full pipeline"
```

---

### Task 13: AI Agent 연동 설정 문서

**Files:**
- Create: `docs/agent-setup.md`

- [ ] **Step 1: Claude Code / Codex / Gemini CLI 설정 가이드 작성**

각 AI Agent에서 MCP 서버를 등록하는 방법 문서화:

```markdown
# AI Agent 연동 가이드

## Claude Code
~/.claude/settings.json:
{ "mcpServers": { "webcli": { "command": "webcli-mcp" } } }

## Codex
~/.codex/config.json 또는 codex mcp add webcli --command "webcli-mcp"

## Gemini CLI
gemini mcp add webcli --command "webcli-mcp"
```

- [ ] **Step 2: 커밋**

```bash
cd /Users/laonpeople/Desktop/dev/web-cli
git add docs/agent-setup.md
git commit -m "docs: add AI agent MCP server setup guide"
```

---

## Phase 4: 정리

### Task 14: build-core, browser-client deprecated 처리

- [ ] **Step 1: 두 패키지의 package.json에 `"deprecated"` 필드 추가**
- [ ] **Step 2: README에 마이그레이션 안내 추가**
- [ ] **Step 3: 커밋**

```bash
git commit -m "chore: deprecate build-core and browser-client packages"
```

---

### Task 15: 최종 검증

- [ ] **Step 1: 데모앱(`apps/cli-test-page`)에서 Extension 로드 후 MCP 서버 연결 테스트**
- [ ] **Step 2: Claude Code에서 `webcli_snapshot` → `webcli_act` 실행 테스트**
- [ ] **Step 3: 전체 테스트 스위트 통과 확인**

Run: `cd /Users/laonpeople/Desktop/dev/web-cli && pnpm -r run test`
Expected: ALL PASS
