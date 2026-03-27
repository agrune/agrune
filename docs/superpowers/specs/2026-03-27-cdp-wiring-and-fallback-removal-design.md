# CDP 와이어링 + 합성 Fallback 제거

이슈 문서: `docs/notes/11-cdp-migration-issues.md` (#5, #8)

## 배경

CDP 마이그레이션 아키텍처(메시지 타입, 브릿지 라우팅, cdp-client, event-sequences, background handler)는 모두 구현되어 있으나, `page-agent-runtime.ts`에서 `eventSequences: null`로 설정되어 실제 CDP가 활성화되지 않음. 모든 이벤트가 `syntheticFallback`으로 실행되어 `isTrusted: false` 이벤트만 발생하고, React Flow 등 라이브러리가 이를 무시함.

## 스코프

1. **Step 1 — CDP 와이어링 (#5):** CDP client를 생성하고 event sequences를 연결하여 실제 `chrome.debugger` 경유 이벤트 활성화
2. **Step 2 — 검증:** 빌드 후 드래그, 클릭, 줌 동작 수동 확인. #1, #2, #4, #7 자동 해결 여부 판단
3. **Step 3 — 합성 fallback 제거 (#8):** synthetic-dispatch.ts 삭제 및 관련 코드 정리

## Step 1: CDP 와이어링

### 변경 파일

#### `packages/build-core/src/types.ts` — AgagruneRuntimeOptions 확장

```typescript
export interface AgagruneRuntimeOptions {
  clickAutoScroll: boolean
  clickRetryCount: number
  clickRetryDelayMs: number
  /** Bridge callback for CDP request relay. When provided, CDP event sequences are activated. */
  cdpPostMessage?: (type: string, data: unknown) => void
}
```

#### `packages/build-core/src/runtime/page-agent-runtime.ts` — CDP 활성화

```typescript
import { createCdpClient } from './cdp-client'
import { createEventSequences } from './event-sequences'

// createPageAgentRuntime() 내부, deps 생성 부분:
let cdpClient: CdpClient | null = null
let eventSequences: EventSequences | null = null

if (runtimeOptions.cdpPostMessage) {
  cdpClient = createCdpClient(runtimeOptions.cdpPostMessage)
  eventSequences = createEventSequences(cdpClient)
}

const deps: CommandHandlerDeps = {
  // ...
  eventSequences,
  syntheticFallback: eventSequences ? null : createSyntheticDispatchFallback(),
}
```

dispose 시:
```typescript
runtimeDisposers.set(runtime, () => {
  clearActivityIdleTimer()
  mutationObserver?.disconnect()
  queue.dispose()
  cdpClient?.dispose()
})
```

#### `packages/extension/src/runtime/page-runtime.ts` — postMessage 콜백 전달

```typescript
function installRuntime(payload: InitRuntimePayload): void {
  installPageAgentRuntime(payload.manifest as any, {
    ...(payload.options ?? {}),
    cdpPostMessage: sendToContentScript,
  } as any)
  sendToContentScript('runtime_ready', {})
}
```

### 설계 근거

- build-core가 extension의 브릿지 프로토콜(`__agrune_bridge__`)을 알 필요 없음. 콜백 주입으로 분리.
- CDP가 없는 환경(테스트, 로컬 개발)에서는 `cdpPostMessage`를 생략하면 기존대로 동작.
- cdp-client가 이미 `agrune:cdp` CustomEvent를 listen하고 있으므로, response/event 경로는 이미 완성됨.

## Step 2: 검증 체크포인트

빌드 후 수동 확인 항목:
- [ ] 칸반 카드 드래그 시 카드가 커서를 따라 이동하는지 (#1)
- [ ] 칸반 카드가 다른 컬럼으로 실제 이동하는지 (#2)
- [ ] 캔버스 줌 시 커서가 캔버스 위에 위치하는지 (#4)
- [ ] 워크플로우 노드 드래그가 동작하는지 (#7)
- [ ] 기본 클릭, 더블클릭, 우클릭 정상 동작
- [ ] Chrome 디버거 info bar 표시 확인

## Step 3: 합성 Fallback 제거

### 삭제

| 파일 | 변경 |
|------|------|
| `synthetic-dispatch.ts` (556줄) | 파일 삭제 |
| `command-handlers.ts:318-333` | `SyntheticDispatchFallback` 인터페이스 삭제 |
| `command-handlers.ts:343` | `syntheticFallback` 필드 삭제 |
| `command-handlers.ts` 5곳 | `else if (deps.syntheticFallback)` 분기 제거 |
| `page-agent-runtime.ts:51` | `import { createSyntheticDispatchFallback }` 제거 |
| `page-agent-runtime.ts:277` | `syntheticFallback: createSyntheticDispatchFallback()` 제거 |

### 타입 변경

- `CommandHandlerDeps.eventSequences`: `EventSequences | null` → `EventSequences` (non-null 필수)
- `CommandHandlerDeps.syntheticFallback` 필드 삭제

### 핸들러 분기 정리

현재:
```typescript
const eventSeq = deps.eventSequences
if (eventSeq) {
  // CDP path
} else if (deps.syntheticFallback) {
  // synthetic path
}
```

변경:
```typescript
// eventSequences is now guaranteed non-null
await deps.eventSequences.click(coords)
```

### 테스트 정리

- `event-sequences.spec.ts` (mock CDP) — 유지
- synthetic dispatch 관련 테스트 — 제거
- `page-agent-runtime` 테스트에서 `eventSequences: null` 전제 — mock CDP로 교체

## 스코프 외

- #3 엣지 정보 스냅샷 — 별도 트랙
- #6 MCP 서버 배포 프로세스 — 별도 트랙
- CDP 연결 후에도 해결되지 않는 #4 줌 커서 문제 — Step 2 검증 결과에 따라 후속 작업
