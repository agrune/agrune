# 1-0. 캔버스 좌표 정밀화 설계

작성일: 2026-03-29

## 배경

AI가 캔버스(ReactFlow 등) 노드를 조작할 때 정밀 배치가 불가능한 문제.
viewport 좌표만 존재하고, pan/zoom 시 오차가 누적되며, AI가 "감으로 드래그"하는 상황.

## 목표

- AI가 항상 canvas 좌표 공간에서 작업하도록 전환
- 스냅샷 좌표 형식을 center+size로 변경 (AI 정렬/간격 추론에 최적)
- 캔버스 그룹의 covered 노드도 조작 가능하게 변경
- 드래그 결과에 최종 위치 자동 반환
- `data-agrune-meta`로 앱이 메타데이터(엣지, 그리드 등)를 범용적으로 노출

## 설계 원칙

- **라이브러리 무관**: CSS/SVG transform의 역행렬로 좌표 변환. ReactFlow, D3, Konva 등 모든 DOM 기반 캔버스에 동일하게 동작.
- **어노테이션 기반 유지**: 라이브러리 API 직접 호출 없음. 앱 개발자가 어노테이션으로 노출 범위 결정.
- **AI는 좌표 계산 안 함**: 런타임이 canvas↔viewport 변환을 전담.

## 아키텍처

```
[AI] ←canvas coords→ [MCP Server] ←passthrough→ [Runtime] ←viewport coords→ [CDP]
                                                     ↕
                                              inverse(transform)
```

스냅샷 출력 시: viewport → canvas 변환 (역행렬)
명령 입력 시: canvas → viewport 변환 (정행렬)

## 변경사항

### 1. 스냅샷 좌표 형식: rect → center+size

기존:
```json
{
  "targetId": "agrune_4",
  "rect": { "x": 249, "y": 392, "width": 78, "height": 38 }
}
```

변경:
```json
{
  "targetId": "agrune_4",
  "groupId": "workflow-nodes",
  "name": "기획",
  "center": { "x": 288, "y": 411 },
  "size": { "w": 78, "h": 38 },
  "coordSpace": "viewport",
  "visible": true,
  "actionableNow": true
}
```

- `rect` 필드 제거 (clean break, deprecated 기간 없음)
- `center`: 타깃 중심점 좌표
- `size`: 너비/높이
- `coordSpace`: `"viewport"` (기본) 또는 `"canvas"` (transform 있는 그룹)

center 계산: `{ x: round(domRect.left + domRect.width/2), y: round(domRect.top + domRect.height/2) }`

### 2. canvas 좌표 변환

`data-agrune-canvas` 가 있는 그룹의 타깃에 적용.

변환 로직:
```typescript
function viewportToCanvas(
  viewportX: number, viewportY: number,
  transform: ViewportTransform
): { x: number; y: number } {
  // viewport_coord = transform * canvas_coord
  // canvas_coord = inverse(transform) * viewport_coord
  return {
    x: Math.round((viewportX - transform.translateX) / transform.scale),
    y: Math.round((viewportY - transform.translateY) / transform.scale),
  }
}

function canvasToViewport(
  canvasX: number, canvasY: number,
  transform: ViewportTransform
): { x: number; y: number } {
  return {
    x: Math.round(canvasX * transform.scale + transform.translateX),
    y: Math.round(canvasY * transform.scale + transform.translateY),
  }
}
```

스냅샷 생성 시:
- transform이 있는 그룹의 타깃 → `viewportToCanvas()` 적용 → `coordSpace: "canvas"`
- transform이 없는 타깃 → 기존대로 viewport 좌표 → `coordSpace: "viewport"`

size도 scale 반영:
```typescript
canvasSize = { w: round(domRect.width / scale), h: round(domRect.height / scale) }
```

### 3. 캔버스 그룹 covered 노드 정책

현재: `covered: true` → `actionableNow: false` → 좌표 미포함 → AI가 무시

변경: `data-agrune-canvas`가 있는 그룹의 타깃은:
- `covered: true`여도 `actionableNow: true` 유지
- `center` + `size` 포함
- 이유: 캔버스 노드는 겹쳐도 드래그 가능. 첫 스냅샷에 전체 노드가 나와야 재스냅샷 낭비 없음

구현: `captureTargetState()`에서 해당 그룹 소속 여부 확인 후 actionableNow 판정 분기.

### 4. 드래그 개선

#### 입력: canvas 좌표 수용
`agrune_drag`의 `destinationCoords`가 canvas 좌표일 때:
- 해당 그룹의 transform을 조회
- `canvasToViewport()` 적용 후 CDP에 전달

판별: sourceTargetId의 그룹에 `data-agrune-canvas`가 있으면 canvas 좌표로 간주.

#### 출력: 최종 위치 반환
드래그 완료 후 결과에 포함:
```json
{
  "success": true,
  "movedTarget": {
    "targetId": "agrune_4",
    "center": { "x": 350, "y": 200 },
    "size": { "w": 78, "h": 38 },
    "coordSpace": "canvas"
  }
}
```

이동된 타깃만 re-read하여 최소한의 정보 반환. 전체 re-snapshot 아님.

#### offscreen 노드 보호
canvas 좌표로 모든 노드가 스냅샷에 포함되지만, viewport 밖 노드는 CDP로 조작 불가.
offscreen 노드에 드래그 시도 시 에러로 안내:
```json
{
  "success": false,
  "error": "Target is outside viewport. Use wheel to pan/zoom first.",
  "target": { "center": { "x": 800, "y": 1200 }, "coordSpace": "canvas" }
}
```
AI가 자기 판단으로 wheel 패닝 후 재시도하도록 유도.

### 5. 휠 액션 결과 반환

`agrune_pointer`의 wheel 액션 후, 해당 그룹의 변경된 viewportTransform을 반환:
```json
{
  "success": true,
  "updatedTransform": {
    "groupId": "workflow",
    "viewportTransform": { "translateX": -200, "translateY": -100, "scale": 1.2 }
  }
}
```
canvas 좌표는 wheel로 변하지 않으므로 노드 위치 재전송 불필요. transform만으로 AI가 현재 뷰 상태 파악 가능.

### 6. `data-agrune-meta` (신규 어노테이션)

앱 개발자가 그룹에 메타데이터 제공 함수를 지정:

```html
<div data-agrune-group="workflow"
     data-agrune-canvas=".react-flow__viewport"
     data-agrune-meta="getFlowMeta">
```

앱 코드:
```typescript
useEffect(() => {
  window.getFlowMeta = () => ({
    edges: instance.getEdges().map(e => ({
      source: e.source,
      target: e.target,
    })),
    viewport: instance.getViewport(),
  })
  return () => { delete window.getFlowMeta }
}, [instance])
```

런타임 동작:
- 스냅샷 생성 시 `data-agrune-meta` 값을 읽음
- `window[fnName]`이 함수이면 호출, 결과를 직렬화
- 그룹의 `meta` 필드에 포함

```json
{
  "groupId": "workflow",
  "viewportTransform": { "translateX": -100, "translateY": -50, "scale": 0.8 },
  "meta": {
    "edges": [
      { "source": "node-1", "target": "node-2" },
      { "source": "node-2", "target": "node-3" }
    ],
    "viewport": { "x": -100, "y": -50, "zoom": 0.8 }
  }
}
```

오류 처리:
- 함수 없음: `meta: null`, 경고 로그
- 함수 예외: `meta: null`, 에러 로그
- 반환값 직렬화 불가: `meta: null`, 에러 로그

## 변경 파일

| 파일 | 변경 |
|------|------|
| `core/src/index.ts` | `PageTarget` 타입: rect → center+size, coordSpace 추가. `PageSnapshotGroup` 타입: meta 필드 추가 |
| `build-core/src/runtime/dom-utils.ts` | `viewportToCanvas()`, `canvasToViewport()` 유틸 함수 추가 |
| `build-core/src/runtime/snapshot.ts` | center+size 출력, canvas 좌표 변환, covered 정책 변경, meta 함수 호출 |
| `build-core/src/runtime/command-handlers.ts` | drag에서 canvas→viewport 변환, 결과에 최종 위치 포함 |
| `build-core/src/runtime/public-shapes.ts` | 공개 스냅샷 형식 업데이트 |
| `mcp-server/src/mcp-tools.ts` | 도구 스키마 업데이트 (center+size 등) |
| AI 가이드/프롬프트 | rect→center+size 참조 업데이트 |

## 범위 밖

- 순수 HTML5 Canvas / WebGL 지원 (노트 13번 리서치 영역)
- 라이브러리 API 직접 호출 (`reactFlowInstance.setNodes()` 등)
- `agrune_move` 직접 배치 API
