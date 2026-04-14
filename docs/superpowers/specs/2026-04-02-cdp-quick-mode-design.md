# CDP Quick Mode 설계

작성일: 2026-04-02

## 배경

패키지 구조 재편(스펙 1)으로 `BrowserDriver` 인터페이스와 `ExtensionDriver` 구현이 완성되었다. 이제 확장프로그램 없이 CDP로 직접 브라우저를 launch/attach하는 두 번째 드라이버 `CdpDriver`를 추가한다.

## 목표

- 확장프로그램 설치 없이 agrune MCP 도구를 바로 사용할 수 있게 한다.
- 기존 extension mode는 그대로 유지한다.
- headless 브라우저 실행을 지원한다.
- 기존 MCP 도구 인터페이스를 변경하지 않는다.

## 비목표

- 프로필 관리 (복제/import)
- Chrome for Testing
- headless 전용 최적화 (`--headless=new` 플래그만 지원)
- 디버깅 앱 / human-in-the-loop
- 사이드패널 채팅 UI

## CdpDriver 개요

```
launch 모드:
  chrome --remote-debugging-port=0 --user-data-dir=<temp>
  → CDP WebSocket 연결 (ws://127.0.0.1:<port>/devtools/browser/...)

attach 모드:
  기존 브라우저의 debugging port에 연결
  → ws://127.0.0.1:<port>/devtools/browser/...
```

Chrome 탐색 순서:
1. `AGRUNE_CHROME_PATH` 환경변수
2. OS별 기본 경로 순회
   - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
   - Linux: `/usr/bin/google-chrome`, `/usr/bin/chromium-browser`
   - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`

## 파일 구조

```
packages/browser/src/
├── cdp-driver.ts           — CdpDriver implements BrowserDriver
├── cdp-connection.ts       — WebSocket CDP 연결 관리
├── cdp-target-manager.ts   — Target.setDiscoverTargets 기반 탭 추적
├── cdp-runtime-injector.ts — page-runtime.js 주입 + binding 설정
├── chrome-launcher.ts      — Chrome 프로세스 launch + 경로 탐색
├── extension-driver.ts     — (기존) ExtensionDriver
└── ...
```

## CdpConnection

저수준 WebSocket CDP 프로토콜 핸들러.

```typescript
class CdpConnection {
  connect(wsEndpoint: string): Promise<void>
  disconnect(): Promise<void>
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>
  on(event: string, callback: (params: Record<string, unknown>) => void): void
  off(event: string, callback: (params: Record<string, unknown>) => void): void
}
```

- 메시지 ID 기반 요청/응답 매칭
- CDP 이벤트를 콜백으로 디스패치
- 연결 끊김 감지

## CdpTargetManager

`Target.setDiscoverTargets(true)` 기반 탭 lifecycle 관리.

```typescript
class CdpTargetManager {
  start(connection: CdpConnection): Promise<void>
  stop(): void
  getTargets(): TargetInfo[]
  onTargetCreated(cb: (target: TargetInfo) => void): void
  onTargetDestroyed(cb: (targetId: string) => void): void
  onTargetInfoChanged(cb: (target: TargetInfo) => void): void
}
```

이벤트:
- `targetCreated` → 새 세션 등록 + runtime 주입 트리거
- `targetDestroyed` → 세션 제거
- `targetInfoChanged` → URL/title 갱신

page 타입 타겟만 추적한다 (`targetInfo.type === 'page'`).

## CdpRuntimeInjector

page-runtime.js를 탭에 주입하고 양방향 통신 채널을 설정한다.

```typescript
class CdpRuntimeInjector {
  injectOnNewDocuments(connection: CdpConnection): Promise<void>
  injectIntoExistingTarget(connection: CdpConnection, sessionId: string): Promise<void>
}
```

주입 방식:
- `Page.addScriptToEvaluateOnNewDocument(pageRuntimeCode)` — 새로 열리는 페이지에 자동 주입
- `Runtime.evaluate(pageRuntimeCode)` — 이미 열린 탭에 수동 주입

통신 채널:
- 페이지→서버: `Runtime.addBinding({ name: 'agrune_send' })` 등록. 페이지에서 `window.agrune_send(json)` 호출 시 `Runtime.bindingCalled` 이벤트로 수신.
- 서버→페이지: `Runtime.evaluate({ expression: 'window.__agrune__.handleCommand(...)' })` 호출.

주입되는 코드는 `@agrune/runtime`의 `dist/page-runtime.js` 번들. extension mode와 동일한 runtime이 동작한다.

## ChromeLauncher

Chrome 프로세스 launch 및 경로 탐색.

```typescript
class ChromeLauncher {
  static findChromePath(): string | null
  launch(options?: LaunchOptions): Promise<{ wsEndpoint: string; process: ChildProcess }>
  kill(): void
}

interface LaunchOptions {
  headless?: boolean        // default: false
  userDataDir?: string      // default: temp dir
  args?: string[]           // 추가 Chrome 플래그
}
```

launch 시:
1. `AGRUNE_CHROME_PATH` 또는 자동 탐색으로 Chrome 경로 확보
2. `--remote-debugging-port=0` (OS가 빈 포트 할당)
3. stderr에서 `DevTools listening on ws://...` 파싱하여 WebSocket endpoint 획득
4. `ChildProcess` 참조 보관 → `disconnect()` 시 kill

## CdpDriver

```typescript
class CdpDriver implements BrowserDriver {
  // BrowserDriver 구현
  connect(): Promise<void>       // launch 또는 attach
  disconnect(): Promise<void>    // connection 닫기 + process kill (launch 모드)
  isConnected(): boolean
  listSessions(): Session[]
  getSnapshot(tabId: number): PageSnapshot | null
  onSessionOpen(cb): void
  onSessionClose(cb): void
  onSnapshotUpdate(cb): void
  execute(tabId, command): Promise<CommandResult>
  updateConfig(config): void

  // CdpDriver 전용
  constructor(options: CdpDriverOptions)
}

interface CdpDriverOptions {
  mode: 'launch' | 'attach'
  wsEndpoint?: string          // attach 모드 시 필수
  headless?: boolean           // launch 모드, default: false
  userDataDir?: string         // launch 모드
  chromePath?: string          // 직접 지정
}
```

명령 실행 흐름:
```
McpServer → CdpDriver.execute(tabId, command)
  → Runtime.evaluate('window.__agrune__.handleCommand(commandJson)')
  → page runtime이 처리
  → window.agrune_send(resultJson) 호출
  → Runtime.bindingCalled 이벤트 수신
  → CdpDriver가 CommandResult로 변환하여 반환
```

## BrowserDriver 인터페이스 변경

`sendRaw(msg: NativeMessage)`를 BrowserDriver에서 제거. extension 전용 메서드로 내림.

`updateConfig(config: Partial<AgruneRuntimeConfig>)` 추가:
- ExtensionDriver: native messaging으로 config_update 전송
- CdpDriver: `Runtime.evaluate`로 runtime에 config 적용

변경 후 인터페이스:
```typescript
interface BrowserDriver {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  listSessions(): Session[]
  getSnapshot(tabId: number): PageSnapshot | null
  onSessionOpen(cb: (session: Session) => void): void
  onSessionClose(cb: (tabId: number) => void): void
  onSnapshotUpdate(cb: (tabId: number, snapshot: PageSnapshot) => void): void

  execute(tabId: number, command: Record<string, unknown> & { kind: string }): Promise<CommandResult>
  updateConfig(config: Partial<AgruneRuntimeConfig>): void
}
```

## server 변경

driver 선택을 지원하도록 `agrune-mcp.ts` 진입점 수정:

```
agrune-mcp                          → 기존 extension mode (기본)
agrune-mcp --mode cdp               → CDP quick mode (launch)
agrune-mcp --mode cdp --headless    → CDP headless mode
agrune-mcp --mode cdp --attach ws://... → CDP attach mode
```

`createMcpServer()`가 driver를 외부에서 주입받는 구조는 이미 완성되어 있으므로, 진입점에서 driver를 선택하여 넘기면 된다.

## page-runtime 양방향 통신 프로토콜

현재 extension mode의 bridge(postMessage)를 CDP binding으로 대체하는 것이므로, page runtime 내부에서 통신 레이어를 추상화해야 한다.

```typescript
// page runtime 내부
interface RuntimeTransport {
  send(type: string, data: unknown): void
  onMessage(cb: (type: string, data: unknown) => void): void
}

// extension mode: postMessage bridge
// cdp mode: window.agrune_send + window.__agrune__.handleCommand
```

page-runtime.js가 부팅 시 어떤 transport를 사용할지 자동 감지:
- `window.agrune_send` 함수가 존재하면 → CDP mode
- 아니면 → postMessage bridge (extension mode)

이를 통해 동일한 page-runtime.js 번들이 양쪽 모드에서 동작한다.

## 검증 기준

- `agrune-mcp --mode cdp` 실행 → Chrome 자동 launch → `agrune_snapshot` 동작
- `agrune-mcp --mode cdp --headless` 실행 → headless Chrome → `agrune_snapshot` 동작
- `agrune-mcp --mode cdp --attach ws://...` → 기존 브라우저에 연결 → 동작
- 기존 extension mode(`agrune-mcp` 기본) 정상 동작 유지
- MCP 도구 9종 모두 CDP mode에서 동작
- 새 탭 / `window.open()` 팝업 자동 감지 및 runtime 주입

## 산출물

| 파일 | 신규/변경 |
|------|-----------|
| `packages/browser/src/cdp-driver.ts` | 신규 |
| `packages/browser/src/cdp-connection.ts` | 신규 |
| `packages/browser/src/cdp-target-manager.ts` | 신규 |
| `packages/browser/src/cdp-runtime-injector.ts` | 신규 |
| `packages/browser/src/chrome-launcher.ts` | 신규 |
| `packages/core/src/driver.ts` | 변경 (sendRaw 제거, updateConfig 추가) |
| `packages/browser/src/extension-driver.ts` | 변경 (sendRaw → 내부 메서드, updateConfig 추가) |
| `packages/runtime/src/runtime/page-agent-runtime.ts` | 변경 (transport 추상화) |
| `packages/mcp/src/index.ts` | 변경 (updateConfig 사용) |
| `packages/mcp/bin/agrune-mcp.ts` | 변경 (--mode cdp 옵션) |
