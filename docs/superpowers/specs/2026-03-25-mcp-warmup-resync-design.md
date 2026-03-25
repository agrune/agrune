# MCP Warm-up / Resync Design

작성일: 2026-03-25

## 문제

Backend daemon 재기동 후 in-memory session/snapshot이 비어있어 첫 `rune_snapshot` 호출이 빈 결과 또는 에러를 반환한다. Content script는 초기 진입 시에만 `session_open`을 보내고, 이후에는 주기적 snapshot만 전송하므로 cold start 직후 복구 경로가 없다.

## 설계 원칙

- **Lazy on-demand**: tool 호출 시점에만 연결/resync 수행. 불필요한 백그라운드 모니터링 없음.
- **Backend 중심 오케스트레이션**: 준비 로직을 `RuneBackend.ensureReady()`에 집중.
- **리소스 효율**: 10분 유휴 시 자동 종료, 다음 호출 시 재기동.

## 접근 방식: Backend 중심 `ensureReady`

모든 준비 로직을 backend의 `ensureReady()`에 집중시킨다. Extension은 `resync_request` 핸들러만 추가.

## 상세 설계

### 1. 메시지 프로토콜 확장

`ResyncRequestMessage` 타입 1개를 `@runeai/core`의 `NativeMessage` union에 추가한다.

```typescript
// native-messages.ts
interface ResyncRequestMessage {
  type: 'resync_request'
}
```

별도의 `resync_response`는 만들지 않는다. Backend는 기존 `session_open` + `snapshot_update` 도착으로 준비 완료를 판단한다.

### 2. `ensureReady()` — Backend 준비 게이트

`RuneBackend`에 `ensureReady(timeoutMs)` 메서드를 추가한다. 모든 tool 호출 진입점에서 실행.

**로직:**

1. 이미 session + snapshot이 있으면 즉시 통과
2. 없으면 `resync_request` 전송
3. `session_open` + `snapshot_update` 도착을 최대 3초 대기
4. 3초 내 도착하면 통과
5. 3초 초과 시 에러 반환: `"No browser sessions available. Ensure a page with rune annotations is open."`

**적용 범위:**

- 적용: `rune_sessions`, `rune_snapshot`, `rune_act`, `rune_fill`, `rune_drag`, `rune_wait`, `rune_guide`
- 제외: `rune_config` (세션 없이도 설정 가능)

**구현:**

- `SessionManager`에 `waitForSnapshot(timeoutMs): Promise<boolean>` 추가
- `updateSnapshot()` 호출 시 대기 중인 Promise를 resolve
- 이미 resync 대기 중이면 새 `resync_request`를 보내지 않고 기존 Promise에 합류 (중복 방지)

### 3. Content Script 변경

**즉시 스냅샷 요청:**

`runtime_ready` 시점에 `request_snapshot`을 즉시 1회 발사하여 첫 snapshot 지연(~800ms)을 제거한다.

```typescript
// content/index.ts — runtime_ready 핸들러
if (type === 'runtime_ready') {
  sendToBridge('request_snapshot', {})  // 즉시 1회
  startSnapshotLoop()
  void syncStoredConfigToRuntime(sendToBridge)
}
```

**Resync 핸들러:**

Background로부터 `resync` 메시지를 받으면:

- `session_open` 재전송 (현재 URL/title)
- `request_snapshot` 즉시 1회 발사

```typescript
// content/index.ts — onMessage 리스너에 추가
if (msg.type === 'resync') {
  safeSendMessage({
    type: 'session_open',
    url: location.href,
    title: document.title,
  })
  sendToBridge('request_snapshot', {})
}
```

Runtime 재주입이나 bridge 재설정은 불필요. 이미 돌고 있는 상태에서 session/snapshot만 다시 보내면 됨.

### 4. Background 메시지 라우팅

`message-router.ts`의 `handleNativeHostMessage`에 case 1개 추가:

```typescript
case 'resync_request':
  broadcaster.broadcastToAllTabs({ type: 'resync' })
  break
```

`TabBroadcaster` 변경 없음. 기존 `broadcastToAllTabs()` 활용.

### 5. Idle Shutdown

Backend 프로세스가 10분 유휴 시 `process.exit(0)`으로 자가 종료.

- `handleToolCall()` 호출 시마다 idle 타이머 리셋
- 최초 backend 생성 시에도 타이머 시작
- 종료 전 별도 cleanup 없음 (모든 상태가 in-memory, 다음 기동 시 resync로 복구)
- 다음 MCP tool 호출 시 MCP host가 프로세스를 다시 기동 → `ensureReady()` → resync

```typescript
// backend.ts
private idleTimer: ReturnType<typeof setTimeout> | null = null
private readonly IDLE_TIMEOUT_MS = 10 * 60 * 1000  // 10분

private resetIdleTimer(): void {
  if (this.idleTimer) clearTimeout(this.idleTimer)
  this.idleTimer = setTimeout(() => {
    process.exit(0)
  }, this.IDLE_TIMEOUT_MS)
}
```

## 메시지 흐름 요약

```
MCP tool 호출
  → backend.ensureReady(3s)
    → session+snapshot 있음? → 즉시 통과
    → 없음?
      → resync_request 전송 (native host → background)
      → background: broadcastToAllTabs({ type: 'resync' })
      → content script: session_open 재전송 + request_snapshot 즉시 발사
      → page runtime: snapshot 생성 → content → background → native host → backend
      → SessionManager.updateSnapshot() → 대기 중인 Promise resolve
      → ensureReady 통과
  → tool 로직 실행
  → idle 타이머 리셋 (10분)
```

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/native-messages.ts` | `ResyncRequestMessage` 타입 추가, `NativeMessage` union 확장 |
| `packages/mcp-server/src/backend.ts` | `ensureReady()`, idle 타이머, tool 진입점 수정 |
| `packages/mcp-server/src/session-manager.ts` | `waitForSnapshot()`, `hasReadySession()` 추가 |
| `packages/extension/src/background/message-router.ts` | `resync_request` → `broadcastToAllTabs` 라우팅 |
| `packages/extension/src/content/index.ts` | 즉시 snapshot 요청, `resync` 핸들러 |

## 완료 기준

- Backend를 내린 뒤 다시 띄워도 첫 `rune_snapshot`이 빈 응답 없이 정상 결과를 돌려준다.
- 준비 중에는 무한 대기하지 않고, 3초 timeout 시 원인이 드러나는 에러를 반환한다.
- Agent 프롬프트나 수동 재시도 없이 시스템 내부 로직만으로 cold start를 흡수한다.
- 10분 유휴 후 backend가 자동 종료되고, 다음 tool 호출 시 자연스럽게 복구된다.
- 모든 tool(`rune_sessions`, `rune_snapshot`, `rune_act`, `rune_fill`, `rune_drag`, `rune_wait`, `rune_guide`)이 동일한 준비 게이트를 거친다.
