# Target Inspector — DevTools Panel Design

Date: 2026-03-25

## Purpose

Chrome DevTools에 "Agrune" 패널을 추가하여, 현재 페이지에서 수집된 타깃(group/target)을 실시간으로 조회하고 진단할 수 있게 한다. 어노테이션 개발 시 의도대로 타깃이 잡히는지 확인하고, 에이전트 운영 시 타깃이 왜 조작 불가인지 즉시 파악하는 것이 목표다.

## Use Cases

1. **개발자 디버깅** — `data-agrune-*` 어노테이션을 작성하면서, 인식되는 타깃 목록/상태를 실시간 확인
2. **에이전트 운영 모니터링** — MCP로 에이전트가 조작 중일 때, 특정 타깃이 `disabled`/`hidden`/`covered`인 이유 진단

## Architecture

### UI Surface: DevTools Panel

`chrome.devtools.panels.create()`로 DevTools에 "Agrune" 탭을 등록한다. 패널 내부는 별도 HTML로 렌더링되며, 검사 대상은 `chrome.devtools.inspectedWindow.tabId`로 결정된다.

### File Structure

```
src/
  devtools/
    devtools.html   ← DevTools 진입점 (panels.create 호출)
    devtools.ts
    panel.html      ← 인스펙터 UI
    panel.ts
    panel.css
```

manifest.json 추가:
```json
{
  "devtools_page": "src/devtools/devtools.html"
}
```

### Data Flow

기존 흐름은 변경하지 않는다.

**기존** (변경 없음):
```
page runtime → content script → background → native host
```

**추가** (devtools panel 구독):
```
content script → background → devtools panel
```

- DevTools panel이 열리면 background에 `subscribe_snapshot` 메시지 전송 (tabId 포함)
- background는 해당 탭의 스냅샷이 올 때마다 devtools panel에도 포워딩
- panel이 닫히면 `unsubscribe_snapshot` → background가 구독 해제
- Pause 상태에서는 panel이 메시지를 수신하되 UI 갱신을 건너뜀

### Message Types (추가)

```typescript
// devtools panel → background
| { type: 'subscribe_snapshot'; tabId: number }
| { type: 'unsubscribe_snapshot'; tabId: number }

// background → devtools panel
| { type: 'snapshot_update'; snapshot: PageSnapshot }

// devtools panel → background → content script
| { type: 'highlight_target'; tabId: number; targetId: string }
| { type: 'clear_highlight'; tabId: number }
```

## Panel Layout

### Toolbar (상단)

- **Pause/Resume 버튼** — 스냅샷 자동 갱신 일시정지/재개
- **스냅샷 정보** — 버전 번호, 경과 시간, 총 타깃 수
- **Reason 필터** — 드롭다운: All / ready / hidden / offscreen / covered / disabled / sensitive
- **ActionKind 필터** — 드롭다운: All / click / fill / dblclick / contextmenu / hover / longpress
- **텍스트 검색** — 타깃 이름, groupName, textContent 대상 필터

### Left Pane: Target List

- 그룹별로 묶어 표시. 각 그룹 헤더에 `groupName`, description, 타깃 수 노출
- 그룹 클릭으로 접기/펼치기
- 각 타깃 행: reason 색상 인디케이터(●), 타깃 이름, actionKind, reason 배지
- 선택된 타깃은 좌측 보더 하이라이트

**Reason 색상 매핑**:
- `ready` → 초록 (#a6e3a1)
- `covered` → 빨강 (#f38ba8)
- `hidden` → 주황 (#fab387)
- `offscreen` → 주황 (#fab387)
- `disabled` → 회색 (#6c7086)
- `sensitive` → 노랑 (#f9e2af)

### Right Pane: Detail Panel

선택한 타깃의 전체 필드를 key-value 테이블로 표시:

- targetId, groupId, groupName
- actionKind (배지)
- visible, enabled, inViewport, covered, actionableNow (boolean 색상 표시)
- reason (배지)
- sensitive (🔒 아이콘)
- selector
- textContent, valuePreview
- sourceFile, sourceLine, sourceColumn (클릭 시 Sources 패널로 이동 가능)

하단에 "Highlight in Page" 버튼.

## Highlight Mechanism

### Flow

```
devtools panel → background → content script → DOM overlay
```

### Implementation

- content script가 대상 요소를 `selector`로 찾고 `getBoundingClientRect()`로 위치 계산
- 페이지 위에 절대 위치 `<div>` overlay 표시: 반투명 배경 + 테두리
- 요소 상단에 라벨 표시: `targetName · reason`
- 3초 후 자동 페이드아웃
- 다른 타깃 클릭 시 기존 하이라이트 교체
- `inspectedWindow.eval()` 사용하지 않음 — 메시지 패싱으로만 처리

## Update Behavior

- **자동 모드** (기본): 스냅샷 갱신마다 (800ms 주기) UI 자동 반영
- **Pause 모드**: 수신은 계속하되 UI 갱신 중단. 현재 상태를 고정해서 분석 가능
- 스냅샷 버전, 마지막 갱신 시각을 툴바에 표시

## Existing Code Changes

### background/message-router.ts

- devtools panel 구독자 맵 추가: `Map<number, chrome.runtime.Port>` (tabId → panel port)
- 스냅샷 수신 시 해당 탭의 구독자에게 포워딩
- `highlight_target`, `clear_highlight` 메시지를 content script로 라우팅

### content/index.ts

- `highlight_target` 메시지 핸들러 추가
- highlight overlay DOM 요소 생성/제거 로직

### shared/messages.ts

- 위에 정의한 메시지 타입 6개 추가

### manifest.json

- `devtools_page` 필드 추가
