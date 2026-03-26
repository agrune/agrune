# CDP(Chrome DevTools Protocol) 이벤트 디스패치 마이그레이션

## 배경

agrune 런타임은 현재 JavaScript 합성 이벤트(`new PointerEvent()` + `dispatchEvent()`)로 브라우저 인터랙션을 시뮬레이션한다. 이 방식은 `event.isTrusted = false`이며, React Flow 같은 라이브러리에서 다음 문제가 발생한다:

| 문제 | 원인 |
|------|------|
| **노드 드래그 안 됨** | React Flow 내부 드래그 핸들러가 합성 이벤트를 인식하지 못함 |
| **엣지 클릭 안 됨** | `.react-flow__pane`이 최상위에서 포인터 이벤트를 가로채고, `elementFromPoint`가 pane을 반환 |
| **이벤트 과다** | pointerdown+mousedown+pointermove+mousemove+pointerup+mouseup+click을 직접 조합 (30개+) |
| **라이브러리 호환성** | 각 라이브러리마다 이벤트 처리 방식이 달라 케이스별 대응 필요 |

## 해결: CDP `Input.dispatchMouseEvent`

Chrome DevTools Protocol의 `Input.dispatchMouseEvent`는 브라우저 입력 파이프라인을 통해 이벤트를 전달한다. `isTrusted: true`이며 실제 유저 입력과 동일하게 처리된다.

### 현재 vs CDP 비교

**클릭:**
```
현재: dispatchPointerLikeEvent('pointerdown') + dispatchMouseLikeEvent('mousedown')
      + dispatchPointerLikeEvent('pointerup') + dispatchMouseLikeEvent('mouseup')
      + dispatchMouseLikeEvent('click')
      = 5개 이벤트 수동 디스패치

CDP:  Input.dispatchMouseEvent({ type: 'mousePressed' })
      + Input.dispatchMouseEvent({ type: 'mouseReleased' })
      = 2개 명령, 브라우저가 pointer/mouse/click 전부 자동 생성
```

**드래그:**
```
현재: pointerdown+mousedown → (pointermove+mousemove+hover전환) × 12스텝 → pointerup+mouseup
      = 30개+ 이벤트, hover 전환 로직 포함

CDP:  mousePressed → mouseMoved × N → mouseReleased
      = N+2개 명령, 브라우저가 나머지 처리
```

**wheel/zoom:**
```
현재: new WheelEvent('wheel', { deltaY, ctrlKey, ... }) + dispatchEvent()

CDP:  Input.dispatchMouseEvent({ type: 'mouseWheel', deltaX, deltaY })
```

### CDP 이벤트 타입

| CDP type | 용도 |
|----------|------|
| `mousePressed` | 마우스 버튼 누름 (pointerdown+mousedown 대체) |
| `mouseReleased` | 마우스 버튼 뗌 (pointerup+mouseup+click 대체) |
| `mouseMoved` | 마우스 이동 (pointermove+mousemove 대체) |
| `mouseWheel` | 스크롤/줌 (WheelEvent 대체) |

### CDP `Input.dispatchMouseEvent` 파라미터

```typescript
{
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel',
  x: number,          // 뷰포트 X
  y: number,          // 뷰포트 Y
  button?: 'left' | 'right' | 'middle',
  clickCount?: number, // 1=click, 2=dblclick
  deltaX?: number,     // wheel용
  deltaY?: number,     // wheel용
  modifiers?: number,  // 0=없음, 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
}
```

## 아키텍처 변경

### 현재 아키텍처

```
MCP Server → Native Messaging → Extension Background → Content Script → Page Runtime
                                                                          ↓
                                                              JS 합성 이벤트 dispatchEvent()
```

### CDP 아키텍처

```
MCP Server → Native Messaging → Extension Background
                                      ↓
                              chrome.debugger API → CDP Input.dispatchMouseEvent
                                      ↓
                              브라우저 입력 파이프라인 (isTrusted: true)
```

### 핵심 변경점

1. **Extension Background에 CDP 모듈 추가**
   - `chrome.debugger.attach(tabId)` — 탭에 디버거 연결
   - `chrome.debugger.sendCommand('Input.dispatchMouseEvent', params)` — 이벤트 전송
   - `chrome.debugger.detach(tabId)` — 연결 해제

2. **Page Runtime 이벤트 디스패치 제거 또는 축소**
   - `dispatchPointerLikeEvent`, `dispatchMouseLikeEvent`, `dispatchDragLikeEvent` 등 → CDP 명령으로 대체
   - 커서 애니메이션, 스냅샷 캡처 등 비이벤트 로직은 유지

3. **커맨드 흐름 변경**
   - 기존: MCP → Background → Content Script → Page Runtime (이벤트 디스패치)
   - 변경: MCP → Background → CDP (이벤트) + Content Script (스냅샷/UI만)

### manifest.json 변경

```json
{
  "permissions": [
    "nativeMessaging",
    "debugger"  // 추가
  ]
}
```

### 제한사항

- `chrome.debugger` 연결 시 Chrome 상단에 **"디버거가 연결됨"** 인포바 표시
  - 사용자 경험에 영향. 감출 수는 없음 (Chrome 보안 정책)
  - `--silent-debugger-extension-api` 플래그로 숨길 수 있으나 일반 사용자에게 요구하기 어려움
- 한 탭에 하나의 디버거만 연결 가능 (DevTools 열려있으면 충돌 가능)

## 영향 범위

### 대체되는 함수들 (page-agent-runtime.ts)

| 함수 | 역할 | CDP 대체 |
|------|------|----------|
| `dispatchPointerLikeEvent()` | PointerEvent 디스패치 | `Input.dispatchMouseEvent` |
| `dispatchMouseLikeEvent()` | MouseEvent 디스패치 | `Input.dispatchMouseEvent` |
| `dispatchDragLikeEvent()` | DragEvent 디스패치 | `Input.dispatchMouseEvent` 시퀀스 |
| `dispatchHoverTransition()` | hover 상태 전환 | CDP mouseMoved가 자동 처리 |
| `dispatchWheelEvent()` | WheelEvent 디스패치 | `Input.dispatchMouseEvent` (mouseWheel) |
| `performPointerClickSequence()` | 클릭 시퀀스 | mousePressed + mouseReleased |
| `performPointerDragSequence()` | 드래그 시퀀스 | mousePressed + mouseMoved × N + mouseReleased |
| `performPointerDragToCoords()` | 좌표 드래그 | mousePressed + mouseMoved × N + mouseReleased |
| `performHtmlDragSequence()` | HTML drag 시퀀스 | CDP로 통합 (브라우저가 drag 이벤트 자동 생성) |

### 유지되는 로직

| 로직 | 이유 |
|------|------|
| 커서 애니메이션 (`animateWithRAF`, cursor element) | 시각적 피드백은 DOM 조작이라 CDP와 무관 |
| 스냅샷 캡처 (`captureTarget`, `makeSnapshot`) | DOM 읽기 전용 |
| 요소 해석 (`resolveRuntimeTarget`, `findElements`) | 셀렉터 기반 DOM 조회 |
| 스크롤 (`smoothScrollIntoView`) | `scrollIntoView` API 사용 |
| 오버레이 감지 | DOM 속성 읽기 |
| `agrune_read` (DOM→마크다운) | DOM 읽기 전용 |
| `agrune_fill` | `element.value` 설정 + input/change 이벤트 (CDP `Input.insertText`로 대체 가능하나 우선순위 낮음) |

## 해결되는 문제들

| 이전 문제 | CDP 적용 후 |
|-----------|------------|
| React Flow 노드 드래그 안 됨 | 진짜 유저 입력으로 동작 |
| React Flow 엣지 클릭 안 됨 | elementFromPoint 문제 없음 — 브라우저가 정확한 타겟에 이벤트 전달 |
| `agrune_pointer` 좌표 클릭 안 됨 | CDP로 좌표 기반 클릭 정상 동작 |
| 라이브러리별 이벤트 호환성 | isTrusted=true로 모든 라이브러리 호환 |
| 이벤트 조합 복잡성 | 브라우저가 알아서 생성 |

## 구현 순서 (제안)

1. **Extension Background에 CDP 헬퍼 추가** — `chrome.debugger` attach/detach/sendCommand 래퍼
2. **커맨드 흐름 분기** — 이벤트 디스패치 커맨드는 Background에서 CDP로 처리, 스냅샷/UI 커맨드는 기존 Content Script 경로 유지
3. **act/drag/pointer 커맨드 CDP 전환** — page-agent-runtime에서 좌표 계산만 하고, 실제 이벤트는 Background로 위임
4. **합성 이벤트 코드 정리** — 기존 dispatch 함수들 제거 또는 폴백으로 유지
5. **테스트** — React Flow 노드 이동, 엣지 클릭, 캔버스 팬/줌, 핸들 연결 전부 검증
