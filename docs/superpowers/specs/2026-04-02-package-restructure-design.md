# 패키지 구조 재편 설계

작성일: 2026-04-02

## 배경

현재 agrune 패키지 구조는 extension 중심으로 설계되어 있다. 브라우저 자동화 코어가 extension에 강하게 결합되어 있어서, CDP quick mode(스펙 2)를 추가하려면 먼저 구조를 분리해야 한다.

현재 문제:
- `build-core`라는 이름이 실제 역할(page runtime engine)과 맞지 않음
- dom-scanner, manifest-builder가 extension 안에 있지만 공용 코드
- mcp-server가 native messaging에 직접 결합 — 드라이버 추상화 없음
- `AgagruneManifest` 타입이 build-core에 정의되어 있으나 core에 있어야 함
- `Agagrune` 접두어 오타 — `Agrune`으로 정리 필요

## 목표

- 6개 패키지로 재편: core, runtime, browser, server, devtools, extension
- `BrowserDriver` 인터페이스 정의로 브라우저 연결 방식을 추상화
- extension mode가 새 구조에서 기존 기능 그대로 동작
- 스펙 2(CDP quick mode)에서 새 driver를 얹기만 하면 되는 깔끔한 토대
- 전체 `Agagrune` → `Agrune` 리네임

## 비목표

- CDP quick mode 구현 (스펙 2)
- 사이드패널 채팅 UI, agent hub
- human-in-the-loop 에이전트 개입 기능
- standalone devtools 앱 (패키지만 분리, 실행은 extension embed)

## 패키지 구조

```
@agrune/core          순수 타입, BrowserDriver 인터페이스, 에러 코드. 의존성 0.
    ↑
@agrune/runtime       page runtime 엔진. 브라우저에 주입되는 JS 번들.
    ↑                 dom-scanner, manifest-builder, snapshot, command-handlers,
    ↑                 cursor-animator, cdp-client 포함.
    ↑
@agrune/browser       BrowserDriver 구현. CDP로 브라우저 연결, 탭 관리, runtime 주입.
    ↑                 extension mode: chrome.debugger API + native messaging 경유.
    ↑
@agrune/mcp           MCP 서버. BrowserDriver만 의존. 도구 등록, 세션 관리.
    ↑
@agrune/devtools      스냅샷 뷰어, 타겟 인스펙터, 명령 로그.
    ↑                 @agrune/browser에 의존 (세션/스냅샷 구독).
    ↑                 지금은 extension에 embed, 나중에 standalone 앱 가능.
    ↑
@agrune/extension     Chrome 확장 UI shell. popup, devtools panel 마운트.
                      @agrune/browser + @agrune/devtools 조합.
                      자체 자동화 로직 없음.
```

의존 방향: `core ← runtime ← browser ← mcp`, `browser ← devtools ← extension`

## 코드 이동 맵

| 현재 위치 | 새 위치 |
|-----------|---------|
| `build-core/src/runtime/*` | **runtime**/src/ |
| `build-core/src/types.ts` (AgruneManifest 등) | **core**/src/ |
| `extension/src/content/dom-scanner.ts` | **runtime**/src/ |
| `extension/src/content/manifest-builder.ts` | **runtime**/src/ |
| `extension/src/background/cdp-handler.ts` | **browser**/src/ |
| `extension/src/background/message-router.ts` | **browser**/src/ |
| `extension/src/background/native-host-controller.ts` | **browser**/src/ |
| `extension/src/content/bridge.ts` | **browser**/src/ |
| `extension/src/runtime/page-runtime.ts` | **browser**/src/ |
| `mcp-server/src/session-manager.ts` | **browser**/src/ |
| `mcp-server/src/command-queue.ts` | **browser**/src/ |
| `mcp-server/src/activity-block-stack.ts` | **browser**/src/ |
| `mcp-server/src/native-messaging.ts` | **browser**/src/ |
| `mcp-server/src/mcp-tools.ts` | **mcp**/src/ |
| `mcp-server/src/public-shapes.ts` | **mcp**/src/ |
| `mcp-server/src/tools.ts` | **mcp**/src/ |
| `mcp-server/src/index.ts` | **mcp**/src/ |
| `extension/src/devtools/*` | **devtools**/src/ |
| `extension/src/popup/*` | **extension**/src/ (유지) |
| `extension/src/background/service-worker.ts` | **extension**/src/ (shell로 축소) |
| `extension/src/content/index.ts` | **extension**/src/ (shell로 축소) |

삭제: `packages/build-core/` (runtime으로 흡수), `packages/mcp-server/` (mcp로 리네임)

## BrowserDriver 인터페이스

`@agrune/core`에 정의:

```typescript
interface BrowserDriver {
  // 연결
  connect(options: ConnectOptions): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  // 탭/세션
  listSessions(): Session[]
  getSnapshot(tabId: number): PageSnapshot | null
  onSessionOpen(cb: (session: Session) => void): void
  onSessionClose(cb: (tabId: number) => void): void
  onSnapshotUpdate(cb: (tabId: number, snapshot: PageSnapshot) => void): void

  // 명령 실행
  execute(tabId: number, command: CommandRequest): Promise<CommandResult>
}

interface ConnectOptions {
  mode: 'extension' | 'cdp'
  // extension mode
  nativeSender?: (msg: NativeMessage) => void
  // cdp mode (스펙 2)
  wsEndpoint?: string
  launchOptions?: { headless?: boolean; userDataDir?: string }
}

interface Session {
  tabId: number
  url: string
  title: string
  hasSnapshot: boolean
}
```

이 스펙에서 구현: `ExtensionDriver implements BrowserDriver`
스펙 2에서 추가: `CdpDriver implements BrowserDriver`

## mcp 패키지

현재 `AgagruneBackend`의 역할 분리:

| 역할 | 새 위치 |
|------|---------|
| native messaging 송수신 | **browser** (ExtensionDriver) |
| 세션/스냅샷 관리 | **browser** (driver 내부) |
| 명령 큐 + 실행 | **browser** (driver.execute) |
| MCP 도구 등록 + 응답 포맷팅 | **mcp** |
| agent activity 추적 | **browser** (driver 관리) |

mcp에 남는 것:
- `mcp-tools.ts` — 도구 스키마 + 등록 (Zod, MCP SDK)
- `public-shapes.ts` — 스냅샷/결과 포맷팅
- `index.ts` — McpServer 클래스 (driver 주입)

```typescript
// 현재
const backend = new AgagruneBackend()
backend.setNativeSender(sender)

// 변경 후
const driver = new ExtensionDriver(nativeMessaging)
const server = new McpServer(driver)
```

## browser 패키지

```
packages/browser/src/
├── driver.ts              — BrowserDriver 공용 유틸
├── extension-driver.ts    — ExtensionDriver 구현 (native messaging 경유)
├── session-manager.ts     — 세션/스냅샷 관리 (현 mcp-server에서 이동)
├── command-queue.ts       — 명령 큐 (현 mcp-server에서 이동)
├── activity-tracker.ts    — agent activity 추적 (현 mcp-server에서 이동)
├── native-messaging.ts    — 인코딩/디코딩 (현 mcp-server에서 이동)
├── cdp-handler.ts         — CDP attach/detach (현 extension에서 이동)
├── bridge.ts              — postMessage 브릿지 (현 extension에서 이동)
└── runtime-injector.ts    — page runtime 주입 (현 extension에서 이동)
```

ExtensionDriver 흐름 (기존 경로 유지):
```
McpServer → ExtensionDriver.execute(tabId, command)
  → CommandQueue.enqueue()
  → NativeMessaging.send(command_request)
  → extension service-worker(shell) → content script(shell) → bridge → page runtime
  → 결과 역방향
  → CommandQueue.resolve()
```

## runtime 패키지

현재 build-core에서 가져오는 것:
- page-agent-runtime.ts, command-handlers.ts, snapshot.ts, action-queue.ts
- cdp-client.ts, cursor-animator.ts, dom-utils.ts, event-sequences.ts, cursors/

extension에서 가져오는 것:
- dom-scanner.ts, manifest-builder.ts

변경 사항:
- 패키지명 `build-core` → `runtime`
- dom-scanner, manifest-builder에서 chrome API 의존 제거 (순수 DOM 로직만)
- `AgruneManifest`, `AgruneTargetEntry` 등 타입 → core로 이동

빌드 산출물:
- `dist/index.js` — 패키지 export (타입 참조용)
- `dist/page-runtime.js` — 브라우저 주입 번들 (self-contained)

browser 패키지가 이 `page-runtime.js`를 CDP든 extension이든 페이지에 주입하면 runtime이 부팅된다.

## devtools 패키지

```
packages/devtools/src/
├── panel.ts           — 메인 패널 UI
├── devtools.ts        — devtools page 진입점
└── snapshot-viewer.ts — 스냅샷/타겟 표시 로직
```

- `@agrune/browser`에 의존 (세션/스냅샷 이벤트 구독)
- 기존 기능 수준: 스냅샷 뷰어, 타겟 인스펙터, 명령 로그
- 지금은 extension devtools panel로 embed
- standalone 앱은 이 패키지를 그대로 사용 (나중에)

## extension 축소

코드를 빼낸 후 남는 것:

```
packages/extension/
├── manifest.json
├── icon-128.png
├── src/
│   ├── background/
│   │   └── service-worker.ts   — native messaging 연결만 하고 browser에 위임
│   ├── content/
│   │   └── index.ts            — data-agrune-* 감지 → service worker에 알림
│   ├── popup/
│   │   └── popup.ts            — 기존 UI 유지
│   └── devtools/
│       ├── devtools.html
│       └── panel.html          — @agrune/devtools 패널 마운트
└── vite.config.ts
```

content script의 역할 축소:
- ~~DOM 스캔~~ → runtime
- ~~manifest 빌드~~ → runtime
- ~~bridge 관리~~ → browser
- ~~명령 릴레이~~ → browser
- **남는 일:** `data-agrune-*` 존재 감지 → service worker에 알림

## Agagrune → Agrune 리네임

전체 코드베이스에서 `Agagrune` 접두어를 `Agrune`으로 변경:

- `AgagruneBackend` → 삭제 (BrowserDriver + McpServer로 분리)
- `AgagruneRuntimeConfig` → `AgruneRuntimeConfig`
- `AgagruneManifest` → `AgruneManifest`
- `AgagruneTargetEntry` → `AgruneTargetEntry`
- `registerAgagruneTools` → `registerAgruneTools`
- 기타 모든 `Agagrune` 참조

## 마이그레이션 전략

Big Bang 방식:
1. 새 패키지 디렉토리 6개 생성
2. 코드 이동 + import 경로 수정
3. Agagrune → Agrune 일괄 리네임
4. 기존 패키지(build-core, mcp-server) 삭제
5. 전체 빌드 + 전체 테스트로 검증

## 검증 기준

- 기존 MCP 도구 9종 모두 정상 동작 (extension mode)
- 기존 테스트 전체 통과 (새 패키지 경로에서)
- devtools 패널 정상 동작 (스냅샷 뷰어, 타겟 인스펙터)
- `pnpm build` + `pnpm typecheck` + `pnpm test` 성공

## 산출물

| 패키지 | 신규/변경 | 빌드 |
|--------|-----------|------|
| `@agrune/core` | 변경 (타입 추가) | tsup → ESM |
| `@agrune/runtime` | 신규 (build-core 대체) | tsup → ESM + page-runtime 번들 |
| `@agrune/browser` | 신규 | tsup → ESM |
| `@agrune/mcp` | 신규 (mcp-server 대체) | tsup → ESM + bin |
| `@agrune/devtools` | 신규 | vite → ESM |
| `@agrune/extension` | 변경 (축소) | vite → dist |

## 후속: 스펙 2 (CDP Quick Mode)

이 재구성이 완료되면 스펙 2에서:
- `CdpDriver implements BrowserDriver` 추가 (WebSocket CDP)
- 브라우저 launch/attach 기능
- `Runtime.addBinding` 양방향 채널
- `Page.addScriptToEvaluateOnNewDocument` + `Runtime.evaluate` runtime 주입
- headless 지원
