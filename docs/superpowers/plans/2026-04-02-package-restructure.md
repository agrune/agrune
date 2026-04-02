# Package Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** agrune 모노레포를 6개 패키지(core, runtime, browser, server, devtools, extension)로 재편하고, BrowserDriver 추상화를 도입하여 CDP quick mode(스펙 2)의 토대를 만든다.

**Architecture:** Big Bang 마이그레이션. 새 패키지 디렉토리를 만들고 코드를 한 번에 이동한 뒤, BrowserDriver 인터페이스로 server와 browser를 분리한다. ExtensionDriver가 기존 native messaging 경로를 그대로 감싼다. 전체 Agagrune → Agrune 리네임 포함.

**Tech Stack:** TypeScript, tsup, Vite, Vitest, Zod, @modelcontextprotocol/sdk, pnpm workspace

**Spec:** `docs/superpowers/specs/2026-04-02-package-restructure-design.md`

---

### Task 1: Agagrune → Agrune 전역 리네임

기존 코드에서 먼저 리네임을 끝낸다. 이후 이동 시 혼란을 방지.

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/build-core/src/types.ts`
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts`
- Modify: 모든 `Agagrune` 참조가 있는 파일

- [ ] **Step 1: 전역 리네임 실행**

```bash
cd /Users/chenjing/dev/agrune/agrune
# 타입/클래스/인터페이스명 리네임
grep -rl 'Agagrune' packages/ --include='*.ts' --include='*.tsx' | head -50
```

대상 패턴:
- `AgagruneBackend` → `AgruneBackend`
- `AgagruneRuntimeConfig` → `AgruneRuntimeConfig`
- `AgagruneManifest` → `AgruneManifest`
- `AgagruneTargetEntry` → `AgruneTargetEntry`
- `AgagruneToolEntry` → `AgruneToolEntry`
- `AgagruneGroupEntry` → `AgruneGroupEntry`
- `AgagruneExposureMode` → `AgruneExposureMode`
- `AgagruneRuntimeOptions` → `AgruneRuntimeOptions`
- `AgagruneSupportedAction` → `AgruneSupportedAction`
- `AgagruneToolStatus` → `AgruneToolStatus`
- `registerAgagruneTools` → `registerAgruneTools`
- `__agrune_bridge__`는 이미 agrune이므로 변경 없음

```bash
find packages/ -name '*.ts' -o -name '*.tsx' | xargs sed -i '' 's/Agagrune/Agrune/g'
```

- [ ] **Step 2: 빌드 확인**

```bash
pnpm build
```
Expected: 성공 (이름만 바뀜, 로직 동일)

- [ ] **Step 3: 테스트 확인**

```bash
pnpm test
```
Expected: 전체 통과

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "refactor: rename Agagrune → Agrune across all packages"
```

---

### Task 2: 새 패키지 스캐폴딩

6개 패키지 디렉토리와 설정 파일을 한 번에 생성한다. 아직 코드는 옮기지 않음.

**Files:**
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/runtime/tsup.config.ts`
- Create: `packages/browser/package.json`
- Create: `packages/browser/tsconfig.json`
- Create: `packages/browser/tsup.config.ts`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/tsup.config.ts`
- Create: `packages/devtools/package.json`
- Create: `packages/devtools/tsconfig.json`

- [ ] **Step 1: runtime 패키지 설정**

`packages/runtime/package.json`:
```json
{
  "name": "@agrune/runtime",
  "version": "0.4.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./page-runtime": {
      "import": "./dist/page-runtime.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@agrune/core": "workspace:*",
    "ai-motion": "0.4.8"
  },
  "devDependencies": {
    "jsdom": "^27.2.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^4.0.0"
  }
}
```

`packages/runtime/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["dist", "tests"]
}
```

`packages/runtime/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    clean: true,
    sourcemap: true,
    target: 'es2022',
    dts: true,
  },
  {
    entry: { 'page-runtime': 'src/runtime/index.ts' },
    format: ['iife'],
    clean: false,
    sourcemap: true,
    target: 'es2022',
    noExternal: [/.*/],
    globalName: '__agrune_runtime__',
  },
])
```

- [ ] **Step 2: browser 패키지 설정**

`packages/browser/package.json`:
```json
{
  "name": "@agrune/browser",
  "version": "0.4.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@agrune/core": "workspace:*",
    "@agrune/runtime": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^4.0.0"
  }
}
```

`packages/browser/tsconfig.json`: (runtime과 동일 구조)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["dist", "tests"]
}
```

`packages/browser/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'es2022',
  dts: true,
})
```

- [ ] **Step 3: server 패키지 설정**

`packages/server/package.json`:
```json
{
  "name": "@agrune/server",
  "version": "0.4.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "postbuild": "./scripts/postbuild.sh",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@agrune/core": "workspace:*",
    "@agrune/browser": "workspace:*",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^4.0.0"
  }
}
```

`packages/server/tsconfig.json`: (runtime과 동일 구조)

`packages/server/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  entry: ['src/index.ts', 'bin/agrune-mcp.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'es2022',
  noExternal: [/.*/],
  define: {
    __MCP_SERVER_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
})
```

- [ ] **Step 4: devtools 패키지 설정**

`packages/devtools/package.json`:
```json
{
  "name": "@agrune/devtools",
  "version": "0.4.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@agrune/core": "workspace:*"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.287",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^4.0.0"
  }
}
```

`packages/devtools/tsconfig.json`: (runtime과 동일 구조)

- [ ] **Step 5: 빈 src/index.ts 생성**

각 패키지에 빈 엔트리 포인트 생성:

```bash
mkdir -p packages/runtime/src packages/browser/src packages/server/src packages/devtools/src
echo "export {}" > packages/runtime/src/index.ts
echo "export {}" > packages/browser/src/index.ts
echo "export {}" > packages/server/src/index.ts
echo "export {}" > packages/devtools/src/index.ts
```

- [ ] **Step 6: pnpm install**

```bash
pnpm install
```
Expected: 새 패키지 workspace 링크 설정

- [ ] **Step 7: 커밋**

```bash
git add packages/runtime packages/browser packages/server packages/devtools
git commit -m "chore: scaffold new packages (runtime, browser, server, devtools)"
```

---

### Task 3: core 확장 — BrowserDriver 인터페이스 + 매니페스트 타입 이동

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/driver.ts`
- Create: `packages/core/src/manifest.ts`
- Delete from: `packages/build-core/src/types.ts` (매니페스트 타입 제거)

- [ ] **Step 1: BrowserDriver 인터페이스 작성**

`packages/core/src/driver.ts`:

```typescript
import type { PageSnapshot, CommandRequest, CommandResult, NativeMessage } from './index.js'

export interface Session {
  tabId: number
  url: string
  title: string
  hasSnapshot: boolean
}

export interface BrowserDriver {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  listSessions(): Session[]
  getSnapshot(tabId: number): PageSnapshot | null
  onSessionOpen(cb: (session: Session) => void): void
  onSessionClose(cb: (tabId: number) => void): void
  onSnapshotUpdate(cb: (tabId: number, snapshot: PageSnapshot) => void): void

  execute(tabId: number, command: Record<string, unknown> & { kind: string }): Promise<CommandResult>

  sendRaw(msg: NativeMessage): void
}
```

- [ ] **Step 2: 매니페스트 타입을 core로 이동**

`packages/core/src/manifest.ts`:

```typescript
export type AgruneExposureMode = 'grouped' | 'per-element'

export type AgruneSupportedAction =
  | 'click'
  | 'fill'
  | 'dblclick'
  | 'contextmenu'
  | 'hover'
  | 'longpress'

export type AgruneToolStatus = 'active' | 'skipped_unsupported_action'

export interface AgruneTargetEntry {
  targetId: string
  name: string | null
  desc: string | null
  selector: string
  sourceFile: string
  sourceLine: number
  sourceColumn: number
}

export interface AgruneToolEntry {
  toolName: string
  toolDesc: string
  action: AgruneSupportedAction
  status: AgruneToolStatus
  targets: AgruneTargetEntry[]
}

export interface AgruneGroupEntry {
  groupId: string
  groupName: string | null
  groupDesc: string | null
  tools: AgruneToolEntry[]
}

export interface AgruneManifest {
  version: 2
  generatedAt: string
  exposureMode: AgruneExposureMode
  groups: AgruneGroupEntry[]
}
```

- [ ] **Step 3: core index.ts에 export 추가**

`packages/core/src/index.ts` 끝에 추가:

```typescript
export * from './driver.js'
export * from './manifest.js'
```

- [ ] **Step 4: build-core/src/types.ts에서 매니페스트 타입을 core import로 교체**

`packages/build-core/src/types.ts`를 수정:

```typescript
// 기존 타입 정의 삭제, core에서 re-export
export type {
  AgruneExposureMode,
  AgruneSupportedAction,
  AgruneToolStatus,
  AgruneTargetEntry,
  AgruneToolEntry,
  AgruneGroupEntry,
  AgruneManifest,
} from '@agrune/core'

export interface AgruneRuntimeOptions {
  clickAutoScroll: boolean
  clickRetryCount: number
  clickRetryDelayMs: number
  postMessage: (type: string, data: unknown) => void
  cdpPostMessage?: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>
}
```

- [ ] **Step 5: 빌드 + 테스트 확인**

```bash
pnpm build && pnpm test
```
Expected: 전체 통과 (타입 소스만 변경, 런타임 동작 동일)

- [ ] **Step 6: 커밋**

```bash
git add packages/core packages/build-core
git commit -m "feat(core): add BrowserDriver interface and move manifest types to core"
```

---

### Task 4: runtime 패키지 — build-core 이동 + dom-scanner/manifest-builder 이동

**Files:**
- Move: `packages/build-core/src/*` → `packages/runtime/src/`
- Move: `packages/build-core/tests/*` → `packages/runtime/tests/`
- Move: `packages/extension/src/content/dom-scanner.ts` → `packages/runtime/src/dom-scanner.ts`
- Move: `packages/extension/src/content/manifest-builder.ts` → `packages/runtime/src/manifest-builder.ts`

- [ ] **Step 1: build-core 소스 이동**

```bash
# src 이동
cp -r packages/build-core/src/* packages/runtime/src/

# tests 이동
mkdir -p packages/runtime/tests
cp -r packages/build-core/tests/* packages/runtime/tests/
```

- [ ] **Step 2: dom-scanner, manifest-builder 이동**

```bash
cp packages/extension/src/content/dom-scanner.ts packages/runtime/src/dom-scanner.ts
cp packages/extension/src/content/manifest-builder.ts packages/runtime/src/manifest-builder.ts
```

- [ ] **Step 3: manifest-builder import 경로 수정**

`packages/runtime/src/manifest-builder.ts`에서:

```typescript
// 변경 전
import type { ScannedTarget, ScannedGroup } from './dom-scanner'
import type {
  AgruneGroupEntry,
  AgruneManifest,
  AgruneTargetEntry,
  AgruneToolEntry,
} from '@agrune/build-core'

// 변경 후
import type { ScannedTarget, ScannedGroup } from './dom-scanner.js'
import type {
  AgruneGroupEntry,
  AgruneManifest,
  AgruneTargetEntry,
  AgruneToolEntry,
} from '@agrune/core'
```

- [ ] **Step 4: runtime index.ts 업데이트**

`packages/runtime/src/index.ts`:

```typescript
export type {
  AgruneExposureMode,
  AgruneSupportedAction,
  AgruneToolStatus,
  AgruneTargetEntry,
  AgruneToolEntry,
  AgruneGroupEntry,
  AgruneManifest,
} from '@agrune/core'

export { AgruneRuntimeOptions } from './types.js'

export {
  createPageAgentRuntime,
  getInstalledPageAgentRuntime,
  installPageAgentRuntime,
} from './runtime/page-agent-runtime.js'
export type { PageAgentRuntime, PageAgentRuntimeHandle } from './runtime/page-agent-runtime.js'

export { scanAnnotations, scanGroups } from './dom-scanner.js'
export type { ScannedTarget, ScannedGroup } from './dom-scanner.js'
export { buildManifest } from './manifest-builder.js'
```

- [ ] **Step 5: runtime types.ts에서 매니페스트 타입 제거, AgruneRuntimeOptions만 유지**

`packages/runtime/src/types.ts`:

```typescript
export type {
  AgruneExposureMode,
  AgruneSupportedAction,
  AgruneToolStatus,
  AgruneTargetEntry,
  AgruneToolEntry,
  AgruneGroupEntry,
  AgruneManifest,
} from '@agrune/core'

export interface AgruneRuntimeOptions {
  clickAutoScroll: boolean
  clickRetryCount: number
  clickRetryDelayMs: number
  postMessage: (type: string, data: unknown) => void
  cdpPostMessage?: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>
}
```

- [ ] **Step 6: 내부 import에서 `@agrune/build-core` → 상대 경로로 일괄 수정**

runtime 패키지 내부 파일들이 `@agrune/build-core`를 참조하는 곳 없는지 확인. 이미 내부 상대경로를 쓰고 있을 것이나 확인 필요:

```bash
grep -r '@agrune/build-core' packages/runtime/src/
```

있으면 `@agrune/core` 또는 상대 경로로 교체.

- [ ] **Step 7: 빌드 확인**

```bash
cd packages/runtime && pnpm build
```
Expected: index.js + page-runtime.js 두 번들 생성

- [ ] **Step 8: 테스트 확인**

```bash
cd packages/runtime && pnpm test
```
Expected: 기존 build-core 테스트 전체 통과

- [ ] **Step 9: 커밋**

```bash
git add packages/runtime
git commit -m "feat(runtime): create @agrune/runtime from build-core + dom-scanner + manifest-builder"
```

---

### Task 5: browser 패키지 — ExtensionDriver + mcp-server 인프라 이동

**Files:**
- Move: `packages/mcp-server/src/session-manager.ts` → `packages/browser/src/session-manager.ts`
- Move: `packages/mcp-server/src/command-queue.ts` → `packages/browser/src/command-queue.ts`
- Move: `packages/mcp-server/src/activity-block-stack.ts` → `packages/browser/src/activity-tracker.ts`
- Move: `packages/mcp-server/src/native-messaging.ts` → `packages/browser/src/native-messaging.ts`
- Move: `packages/extension/src/content/bridge.ts` → `packages/browser/src/bridge.ts`
- Move: `packages/extension/src/background/cdp-handler.ts` → `packages/browser/src/cdp-handler.ts`
- Move: `packages/extension/src/background/message-router.ts` → `packages/browser/src/message-router.ts`
- Move: `packages/extension/src/background/native-host-controller.ts` → `packages/browser/src/native-host-controller.ts`
- Move: `packages/extension/src/runtime/page-runtime.ts` → `packages/browser/src/runtime-injector.ts`
- Create: `packages/browser/src/extension-driver.ts`

- [ ] **Step 1: mcp-server에서 인프라 코드 복사**

```bash
cp packages/mcp-server/src/session-manager.ts packages/browser/src/session-manager.ts
cp packages/mcp-server/src/command-queue.ts packages/browser/src/command-queue.ts
cp packages/mcp-server/src/activity-block-stack.ts packages/browser/src/activity-tracker.ts
cp packages/mcp-server/src/native-messaging.ts packages/browser/src/native-messaging.ts
```

- [ ] **Step 2: extension에서 브라우저 인프라 코드 복사**

```bash
cp packages/extension/src/content/bridge.ts packages/browser/src/bridge.ts
cp packages/extension/src/background/cdp-handler.ts packages/browser/src/cdp-handler.ts
cp packages/extension/src/background/message-router.ts packages/browser/src/message-router.ts
cp packages/extension/src/background/native-host-controller.ts packages/browser/src/native-host-controller.ts
cp packages/extension/src/runtime/page-runtime.ts packages/browser/src/runtime-injector.ts
```

- [ ] **Step 3: import 경로 수정**

이동된 파일들에서 `@agrune/core` import는 유지. 패키지 내부 참조는 상대 경로로 수정:

```bash
# session-manager.ts, command-queue.ts 등에서 core import 확인
grep -n "from '" packages/browser/src/*.ts
```

`@agrune/build-core` → `@agrune/runtime`, 상대 경로 수정.

- [ ] **Step 4: ExtensionDriver 구현**

`packages/browser/src/extension-driver.ts`:

```typescript
import type {
  BrowserDriver,
  Session,
  PageSnapshot,
  CommandResult,
  NativeMessage,
} from '@agrune/core'
import { SessionManager } from './session-manager.js'
import { CommandQueue } from './command-queue.js'
import { ActivityBlockStack } from './activity-tracker.js'

const ACTIVITY_TAIL_BLOCK_MS = 5_000
const ENSURE_READY_TIMEOUT_MS = 10_000

export class ExtensionDriver implements BrowserDriver {
  readonly sessions = new SessionManager()
  readonly commands = new CommandQueue()
  private readonly activityBlocks = new ActivityBlockStack((active) => {
    this.commands.sendRaw({ type: 'agent_activity', active } as NativeMessage)
  })
  private sessionOpenCallbacks: ((session: Session) => void)[] = []
  private sessionCloseCallbacks: ((tabId: number) => void)[] = []
  private snapshotUpdateCallbacks: ((tabId: number, snapshot: PageSnapshot) => void)[] = []

  async connect(): Promise<void> {
    // Extension mode: native sender가 외부에서 설정됨
  }

  async disconnect(): Promise<void> {
    this.commands.setSender(null)
  }

  isConnected(): boolean {
    return this.commands.hasSender()
  }

  setNativeSender(sender: ((msg: NativeMessage) => void) | null): void {
    this.commands.setSender(sender)
  }

  handleNativeMessage(msg: NativeMessage): void {
    switch ((msg as { type: string }).type) {
      case 'session_open': {
        const m = msg as { tabId: number; url: string; title: string }
        this.sessions.openSession(m.tabId, m.url, m.title)
        const session: Session = {
          tabId: m.tabId,
          url: m.url,
          title: m.title,
          hasSnapshot: false,
        }
        this.sessionOpenCallbacks.forEach((cb) => cb(session))
        break
      }
      case 'session_close': {
        const m = msg as { tabId: number }
        this.sessions.closeSession(m.tabId)
        this.sessionCloseCallbacks.forEach((cb) => cb(m.tabId))
        break
      }
      case 'snapshot_update': {
        const m = msg as { tabId: number; snapshot: PageSnapshot }
        this.sessions.updateSnapshot(m.tabId, m.snapshot)
        this.snapshotUpdateCallbacks.forEach((cb) => cb(m.tabId, m.snapshot))
        break
      }
      case 'command_result': {
        const m = msg as { tabId: number; commandId: string; result: CommandResult }
        if ((m.result as { snapshot?: PageSnapshot }).snapshot) {
          this.sessions.updateSnapshot(m.tabId, (m.result as { snapshot: PageSnapshot }).snapshot)
        }
        this.commands.resolve(m.commandId, m.result)
        break
      }
      case 'ping':
        this.commands.sendRaw({ type: 'pong' } as NativeMessage)
        break
      case 'get_status':
        this.commands.sendRaw(this.createStatusResponse())
        break
    }
  }

  listSessions(): Session[] {
    return this.sessions.getSessions().map((s) => ({
      tabId: s.tabId,
      url: s.url,
      title: s.title,
      hasSnapshot: s.snapshot != null,
    }))
  }

  getSnapshot(tabId: number): PageSnapshot | null {
    return this.sessions.getSnapshot(tabId)
  }

  onSessionOpen(cb: (session: Session) => void): void {
    this.sessionOpenCallbacks.push(cb)
  }

  onSessionClose(cb: (tabId: number) => void): void {
    this.sessionCloseCallbacks.push(cb)
  }

  onSnapshotUpdate(cb: (tabId: number, snapshot: PageSnapshot) => void): void {
    this.snapshotUpdateCallbacks.push(cb)
  }

  async execute(
    tabId: number,
    command: Record<string, unknown> & { kind: string },
  ): Promise<CommandResult> {
    return this.withActivityBlocks(command.kind, async () => {
      return this.commands.enqueue(tabId, command)
    })
  }

  sendRaw(msg: NativeMessage): void {
    this.commands.sendRaw(msg)
  }

  async ensureReady(): Promise<string | null> {
    const deadline = Date.now() + ENSURE_READY_TIMEOUT_MS

    if (!this.commands.hasSender()) {
      const connected = await this.commands.waitForSender(ENSURE_READY_TIMEOUT_MS)
      if (!connected) {
        return 'Native host not connected. Ensure the browser extension is installed and running.'
      }
    }

    if (this.sessions.hasReadySession()) return null

    const remaining = Math.max(0, deadline - Date.now())
    if (remaining === 0) {
      return 'No browser sessions available. Ensure a page with agrune annotations is open.'
    }

    this.commands.sendRaw({ type: 'resync_request' } as NativeMessage)
    const ready = await this.sessions.waitForSnapshot(remaining)
    if (!ready) {
      return 'No browser sessions available. Ensure a page with agrune annotations is open.'
    }

    return null
  }

  resolveTabId(tabId?: number): number | null {
    if (typeof tabId === 'number') return tabId
    const all = this.sessions.getSessions()
    return all.length > 0 ? all[0].tabId : null
  }

  private async withActivityBlocks<T>(kind: string, effect: () => Promise<T>): Promise<T> {
    const guardId = this.activityBlocks.pushGuard(`${kind}:guard`)
    try {
      return await effect()
    } finally {
      this.activityBlocks.pushTimed(`${kind}:tail`, ACTIVITY_TAIL_BLOCK_MS)
      this.activityBlocks.release(guardId)
    }
  }

  private createStatusResponse(): NativeMessage {
    return {
      type: 'status_response',
      status: {
        hostName: 'com.agrune.agrune',
        phase: 'connected',
        connected: true,
        lastError: null,
        sessionCount: this.sessions.getSessions().length,
        mcpConnected: this.activityBlocks.hasActiveBlocks(),
      },
    } as NativeMessage
  }
}
```

- [ ] **Step 5: browser index.ts 작성**

`packages/browser/src/index.ts`:

```typescript
export { ExtensionDriver } from './extension-driver.js'
export { SessionManager } from './session-manager.js'
export { CommandQueue } from './command-queue.js'
export { ActivityBlockStack } from './activity-tracker.js'
export {
  encodeMessage,
  decodeMessages,
  createNativeMessagingTransport,
} from './native-messaging.js'
export type { NativeMessagingTransport } from './native-messaging.js'
```

- [ ] **Step 6: 빌드 확인**

```bash
cd packages/browser && pnpm build
```
Expected: 성공

- [ ] **Step 7: 커밋**

```bash
git add packages/browser
git commit -m "feat(browser): create @agrune/browser with ExtensionDriver"
```

---

### Task 6: server 패키지 — mcp-server를 BrowserDriver 기반으로 리팩토링

**Files:**
- Move: `packages/mcp-server/src/mcp-tools.ts` → `packages/server/src/mcp-tools.ts`
- Move: `packages/mcp-server/src/tools.ts` → `packages/server/src/tools.ts`
- Move: `packages/mcp-server/src/public-shapes.ts` → `packages/server/src/public-shapes.ts`
- Move: `packages/mcp-server/bin/agrune-mcp.ts` → `packages/server/bin/agrune-mcp.ts`
- Move: `packages/mcp-server/scripts/postbuild.sh` → `packages/server/scripts/postbuild.sh`
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: 파일 복사**

```bash
cp packages/mcp-server/src/mcp-tools.ts packages/server/src/mcp-tools.ts
cp packages/mcp-server/src/tools.ts packages/server/src/tools.ts
cp packages/mcp-server/src/public-shapes.ts packages/server/src/public-shapes.ts
cp packages/mcp-server/src/backend-protocol.ts packages/server/src/backend-protocol.ts
cp packages/mcp-server/src/backend-client.ts packages/server/src/backend-client.ts
cp packages/mcp-server/src/version.ts packages/server/src/version.ts
mkdir -p packages/server/bin packages/server/scripts
cp packages/mcp-server/bin/agrune-mcp.ts packages/server/bin/agrune-mcp.ts
cp packages/mcp-server/scripts/postbuild.sh packages/server/scripts/postbuild.sh
```

- [ ] **Step 2: server index.ts 작성 — McpServer를 driver 주입 구조로**

`packages/server/src/index.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { BrowserDriver, AgruneRuntimeConfig, NativeMessage } from '@agrune/core'
import { ExtensionDriver, createNativeMessagingTransport } from '@agrune/browser'
import type { NativeMessagingTransport } from '@agrune/browser'
import { registerAgruneTools } from './mcp-tools.js'
import { toPublicCommandResult, toPublicSession, toPublicSnapshot } from './public-shapes.js'
import type { PublicSnapshotOptions, ToolHandlerResult } from './public-shapes.js'

export { getToolDefinitions } from './tools.js'
export { registerAgruneTools } from './mcp-tools.js'
export { encodeMessage, decodeMessages, createNativeMessagingTransport } from '@agrune/browser'
export type { NativeMessagingTransport } from '@agrune/browser'
export { ExtensionDriver } from '@agrune/browser'

export function createMcpServer() {
  const driver = new ExtensionDriver()

  const mcp = new McpServer(
    { name: 'agrune', version: __MCP_SERVER_VERSION__ ?? '0.0.0' },
    { capabilities: { tools: {} } },
  )

  const handleToolCall = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolHandlerResult> => {
    driver.onActivity?.()

    if (name !== 'agrune_config') {
      const readyError = await driver.ensureReady()
      if (readyError) return { text: readyError, isError: true }
    }

    const tabId = driver.resolveTabId(args.tabId as number | undefined)

    switch (name) {
      case 'agrune_sessions': {
        const list = driver.listSessions()
        return { text: JSON.stringify(list, null, 2) }
      }

      case 'agrune_snapshot': {
        if (tabId == null) return { text: 'No active sessions.', isError: true }
        const snapshot = driver.getSnapshot(tabId)
        if (!snapshot) return { text: `No snapshot available for tab ${tabId}.`, isError: true }
        const options = resolveSnapshotOptions(args)
        return { text: JSON.stringify(toPublicSnapshot(snapshot, options), null, 2) }
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
          kind: name.replace('agrune_', ''),
          ...args,
        }
        delete command.tabId
        const result = await driver.execute(tabId, command)
        return { text: JSON.stringify(toPublicCommandResult(result), null, 2) }
      }

      case 'agrune_config': {
        const config: Partial<AgruneRuntimeConfig> = {}
        if (typeof args.pointerAnimation === 'boolean') config.pointerAnimation = args.pointerAnimation
        if (typeof args.auroraGlow === 'boolean') config.auroraGlow = args.auroraGlow
        if (typeof args.auroraTheme === 'string') {
          config.auroraTheme = args.auroraTheme as AgruneRuntimeConfig['auroraTheme']
        }
        if (typeof args.clickDelayMs === 'number') config.clickDelayMs = args.clickDelayMs
        if (typeof args.pointerDurationMs === 'number') config.pointerDurationMs = args.pointerDurationMs
        if (typeof args.autoScroll === 'boolean') config.autoScroll = args.autoScroll

        if (Object.keys(config).length > 0) {
          driver.sendRaw({ type: 'config_update', config } as NativeMessage)
        }

        if (typeof args.agentActive === 'boolean') {
          // manual agent activity handled by driver
        }

        return { text: 'Configuration updated.' }
      }

      default:
        return { text: `Unknown tool: ${name}`, isError: true }
    }
  }

  registerAgruneTools(mcp, handleToolCall)

  function connectNativeMessaging(
    input: NodeJS.ReadableStream,
    output: NodeJS.WritableStream,
  ): NativeMessagingTransport {
    const transport = createNativeMessagingTransport(input, output)
    driver.setNativeSender(transport.send)
    transport.onMessage((msg) => driver.handleNativeMessage(msg))
    return transport
  }

  return { server: mcp, driver, connectNativeMessaging }
}

function resolveSnapshotOptions(args: Record<string, unknown>): PublicSnapshotOptions {
  const groupIds = new Set<string>()
  if (typeof args.groupId === 'string' && args.groupId.trim()) {
    groupIds.add(args.groupId.trim())
  }
  if (Array.isArray(args.groupIds)) {
    for (const value of args.groupIds) {
      if (typeof value === 'string' && value.trim()) {
        groupIds.add(value.trim())
      }
    }
  }
  return {
    mode: args.mode === 'full' ? 'full' : 'outline',
    ...(groupIds.size > 0 ? { groupIds: [...groupIds] } : {}),
    ...(args.includeTextContent === true ? { includeTextContent: true } : {}),
  }
}

declare const __MCP_SERVER_VERSION__: string | undefined
```

- [ ] **Step 3: mcp-tools.ts import 수정**

`packages/server/src/mcp-tools.ts`에서 import 경로 수정:

```typescript
// 변경 전
import type { ToolHandlerResult } from './mcp-tools.js'
// → 내부 참조는 그대로

// public-shapes import 확인
// 변경 전: from './public-shapes.js' → 그대로 (같은 패키지)
```

- [ ] **Step 4: agrune-mcp.ts import 수정**

`packages/server/bin/agrune-mcp.ts`에서:

```typescript
// 변경 전
import { createMcpServer, encodeMessage, decodeMessages } from '../src/index.js'

// → 그대로 유지 (같은 패키지 내부 참조)
```

backend-client, backend-protocol 등의 import 경로도 확인.

- [ ] **Step 5: 테스트 복사 + import 수정**

```bash
mkdir -p packages/server/tests
cp packages/mcp-server/tests/*.spec.ts packages/server/tests/
```

테스트에서 `../src/backend.js` import를 새 구조로 수정. backend.ts는 삭제되고 역할이 분리되었으므로, 테스트도 driver 기반으로 수정:

- `backend.spec.ts` → ExtensionDriver 테스트로 전환 (browser 패키지로 이동)
- `tools.spec.ts`, `public-shapes.spec.ts` → server에 유지
- `session-manager.spec.ts`, `command-queue.spec.ts` → browser 패키지로 이동

```bash
cp packages/mcp-server/tests/session-manager.spec.ts packages/browser/tests/session-manager.spec.ts
cp packages/mcp-server/tests/command-queue.spec.ts packages/browser/tests/command-queue.spec.ts
cp packages/mcp-server/tests/activity-block-stack.spec.ts packages/browser/tests/activity-tracker.spec.ts
cp packages/mcp-server/tests/backend.spec.ts packages/browser/tests/extension-driver.spec.ts
cp packages/mcp-server/tests/native-messaging.spec.ts packages/browser/tests/native-messaging.spec.ts
```

각 테스트 파일에서 import 경로 수정 (`../src/backend.js` → `../src/extension-driver.js` 등).

- [ ] **Step 6: 빌드 확인**

```bash
cd packages/server && pnpm build
cd packages/browser && pnpm build
```
Expected: 둘 다 성공

- [ ] **Step 7: 커밋**

```bash
git add packages/server packages/browser
git commit -m "feat(server): create @agrune/server with BrowserDriver injection"
```

---

### Task 7: devtools 패키지 추출

**Files:**
- Move: `packages/extension/src/devtools/panel.ts` → `packages/devtools/src/panel.ts`
- Move: `packages/extension/src/devtools/devtools.ts` → `packages/devtools/src/devtools.ts`
- Copy: `packages/extension/src/devtools/panel.html` → `packages/devtools/src/panel.html`
- Copy: `packages/extension/src/devtools/panel.css` → `packages/devtools/src/panel.css`

- [ ] **Step 1: 파일 복사**

```bash
cp packages/extension/src/devtools/panel.ts packages/devtools/src/panel.ts
cp packages/extension/src/devtools/devtools.ts packages/devtools/src/devtools.ts
cp packages/extension/src/devtools/panel.html packages/devtools/src/panel.html
cp packages/extension/src/devtools/panel.css packages/devtools/src/panel.css 2>/dev/null || true
```

- [ ] **Step 2: devtools index.ts 작성**

`packages/devtools/src/index.ts`:

```typescript
export { renderPanel } from './panel.js'
```

- [ ] **Step 3: panel.ts에서 chrome.devtools 직접 참조를 추상화**

현재 panel.ts가 `chrome.devtools.inspectedWindow.tabId`와 `chrome.runtime.connect()`를 직접 사용. devtools 패키지는 chrome API에 의존하되, 나중에 standalone으로 뺄 때 이 부분만 교체하면 됨. 지금은 `@types/chrome` 의존으로 그대로 유지.

- [ ] **Step 4: 커밋**

```bash
git add packages/devtools
git commit -m "feat(devtools): extract devtools panel into @agrune/devtools"
```

---

### Task 8: extension 축소 — shell로 변환

**Files:**
- Modify: `packages/extension/package.json` — 의존성 변경
- Modify: `packages/extension/src/content/index.ts` — shell로 축소
- Modify: `packages/extension/src/background/service-worker.ts` — shell로 축소
- Modify: `packages/extension/vite.config.ts` — 빌드 엔트리 수정
- Delete: `packages/extension/src/content/dom-scanner.ts` (runtime으로 이동됨)
- Delete: `packages/extension/src/content/manifest-builder.ts` (runtime으로 이동됨)
- Delete: `packages/extension/src/content/bridge.ts` (browser로 이동됨)
- Delete: `packages/extension/src/runtime/page-runtime.ts` (browser로 이동됨)
- Delete: `packages/extension/src/background/cdp-handler.ts` (browser로 이동됨)
- Delete: `packages/extension/src/background/message-router.ts` (browser로 이동됨)
- Delete: `packages/extension/src/background/native-host-controller.ts` (browser로 이동됨)

- [ ] **Step 1: extension package.json 의존성 변경**

```json
{
  "dependencies": {
    "@agrune/core": "workspace:*",
    "@agrune/runtime": "workspace:*",
    "@agrune/browser": "workspace:*",
    "@agrune/devtools": "workspace:*"
  }
}
```

`@agrune/build-core` 의존성 제거.

- [ ] **Step 2: 이동 완료된 파일 삭제**

```bash
rm packages/extension/src/content/dom-scanner.ts
rm packages/extension/src/content/manifest-builder.ts
rm packages/extension/src/content/bridge.ts
rm packages/extension/src/content/highlight-overlay.ts
rm packages/extension/src/content/runtime-config.ts
rm packages/extension/src/content/runtime-injector.ts
rm packages/extension/src/runtime/page-runtime.ts
rm packages/extension/src/background/cdp-handler.ts
rm packages/extension/src/background/message-router.ts
rm packages/extension/src/background/native-host-controller.ts
rm packages/extension/src/background/tab-broadcast.ts
rm packages/extension/src/background/messages.ts
```

- [ ] **Step 3: content/index.ts — shell로 재작성**

`packages/extension/src/content/index.ts`:

```typescript
/**
 * Extension content script — thin shell.
 * data-agrune-* 어노테이션 감지 시 service worker에 알림.
 * 실제 runtime 주입과 명령 처리는 @agrune/browser가 담당.
 */

function hasAnnotations(): boolean {
  return document.querySelector('[data-agrune-action],[data-agrune-group]') !== null
}

function notifyServiceWorker(): void {
  chrome.runtime.sendMessage({ type: 'annotations_detected' })
}

function init(): void {
  if (hasAnnotations()) {
    notifyServiceWorker()
    return
  }

  const observer = new MutationObserver(() => {
    if (hasAnnotations()) {
      observer.disconnect()
      notifyServiceWorker()
    }
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
```

- [ ] **Step 4: service-worker.ts — shell로 재작성**

`packages/extension/src/background/service-worker.ts`:

```typescript
/**
 * Extension service worker — thin shell.
 * Native messaging 연결을 @agrune/browser에 위임.
 */

// content script에서 annotations 감지 알림 수신
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'annotations_detected' && sender.tab?.id) {
    // browser 패키지가 runtime 주입을 처리
    // 여기서는 native host에 session_open 알림
    console.log(`[agrune] Annotations detected in tab ${sender.tab.id}`)
  }
})
```

주의: 실제 구현은 현재 service-worker.ts의 native host 연결 로직을 유지하되, 내부 코드를 `@agrune/browser`에서 import하는 형태가 됨. extension의 vite 빌드에서 browser 패키지를 번들링해야 함.

- [ ] **Step 5: vite.config.ts 빌드 엔트리 수정**

이동/삭제된 파일 참조 제거. devtools 엔트리는 `@agrune/devtools`에서 가져옴:

```typescript
// 기존 page-runtime.ts 엔트리 제거 (runtime 패키지가 빌드)
// devtools 엔트리는 devtools 패키지 참조로 변경
```

- [ ] **Step 6: 빌드 확인**

```bash
cd packages/extension && pnpm build
```

- [ ] **Step 7: 커밋**

```bash
git add packages/extension
git commit -m "refactor(extension): slim down to UI shell, delegate to browser/runtime/devtools"
```

---

### Task 9: 구 패키지 삭제 + workspace 정리

**Files:**
- Delete: `packages/build-core/`
- Delete: `packages/mcp-server/`
- Modify: `packages/extension/package.json` — `@agrune/build-core` 참조 제거
- Modify: root `package.json` — 스크립트 정리

- [ ] **Step 1: 구 패키지 삭제**

```bash
rm -rf packages/build-core
rm -rf packages/mcp-server
```

- [ ] **Step 2: 잔존 참조 확인**

```bash
grep -r '@agrune/build-core' packages/ --include='*.ts' --include='*.json'
grep -r '@agrune/mcp-server' packages/ --include='*.ts' --include='*.json'
```

남아있는 참조가 있으면 모두 수정:
- `@agrune/build-core` → `@agrune/runtime`
- `@agrune/mcp-server` → `@agrune/server`

- [ ] **Step 3: pnpm install 갱신**

```bash
pnpm install
```

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "chore: remove deprecated build-core and mcp-server packages"
```

---

### Task 10: 전체 통합 검증

- [ ] **Step 1: 전체 타입체크**

```bash
pnpm typecheck
```
Expected: 에러 없음

- [ ] **Step 2: 전체 빌드**

```bash
pnpm build
```
Expected: core, runtime, browser, server, devtools, extension 모두 빌드 성공

- [ ] **Step 3: 전체 테스트**

```bash
pnpm test
```
Expected: 모든 패키지 테스트 통과

- [ ] **Step 4: extension 기능 수동 검증**

Chrome에 확장 프로그램 로드 → 어노테이션이 있는 페이지에서:
- `agrune_snapshot` 동작 확인
- `agrune_act` (클릭) 동작 확인
- devtools 패널에서 스냅샷 뷰어 동작 확인

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "feat: complete package restructure — core/runtime/browser/server/devtools/extension

6-package architecture with BrowserDriver abstraction.
Ready for CDP quick mode (spec 2) addition."
```
