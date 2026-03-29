# 1-4. agrune_draw 설계

작성일: 2026-03-29

## 배경

AI가 캔버스 위에 그림을 그릴 수 있는지 실험 + 그림판 데모(홍보용 퍼포먼스). 기존 `agrune_pointer`는 모든 중간 좌표를 AI가 직접 지정해야 해서 드로잉에 부적합.

## 목표

- AI가 고수준 드로잉 의도만 전달하면 agrune이 좌표 보간 + pointer 이벤트 변환
- AI의 드로잉 능력을 순수하게 측정할 수 있는 최소한의 도구

## 설계

### API

```typescript
agrune_draw({
  path?: string,                        // SVG path: "M 100 100 C 150 50, 200 50, 250 100"
  points?: { x: number, y: number }[],  // 키포인트 배열
  smooth?: boolean,                     // points 스무딩 여부 (기본 true)
  targetId?: string,                    // 드로잉 대상 요소 (좌표 기준점)
  tabId?: number,
})
```

- `path`와 `points` 중 하나만 지정. 둘 다 지정 시 `path` 우선.
- 좌표는 viewport 기준. `targetId` 지정 시 해당 요소의 좌상단을 원점(0,0)으로 사용.
- `path`: SVG path 문법. LLM이 SVG에 익숙하므로 표현력 높음.
- `points`: 키포인트만 지정, agrune이 보간. `smooth: true`면 Catmull-Rom 등으로 스무딩.

### 내부 동작

1. path 또는 points를 파싱
2. 경로를 일정 간격으로 샘플링 → 중간 좌표 배열 생성
3. pointer 이벤트 시퀀스로 변환:
   - `pointerdown` (시작점)
   - `pointermove` x N (보간된 중간점들)
   - `pointerup` (끝점)
4. CDP `Input.dispatchMouseEvent`로 실행

### path 파싱

SVG path 명령어 지원 범위:
- `M` (moveto), `L` (lineto), `C` (cubic bezier), `Q` (quadratic bezier), `Z` (close)
- 소문자(상대 좌표) 포함
- `A` (arc)는 초기 구현에서 제외, 필요 시 추가

### points 보간

- `smooth: false` → 점 사이를 직선 보간
- `smooth: true` → Catmull-Rom spline으로 곡선 보간
- 보간 간격: ~5px (자연스러운 필기감)

### agrune_pointer와의 관계

- `agrune_draw`는 `agrune_pointer`의 고수준 래퍼
- 내부적으로 pointer 이벤트 시퀀스를 생성하여 동일한 CDP 경로로 실행
- 별도 도구로 분리하여 AI가 "그리기" 의도일 때 명확하게 선택

## 변경 파일

| 파일 | 변경 |
|------|------|
| `mcp-server/src/mcp-tools.ts` | `agrune_draw` 도구 등록 + Zod 스키마 |
| `build-core/src/runtime/command-handlers.ts` | draw 핸들러 (path 파싱 + 보간 + pointer 이벤트 생성) |
| `build-core/src/runtime/path-interpolator.ts` | 신규. SVG path 파싱 + 샘플링 + Catmull-Rom 보간 |
| `core/src/index.ts` | CommandType에 'draw' 추가 |

## 범위 밖

- shape (circle, rect 등 기본 도형) — path로 표현 가능
- 필압 시뮬레이션
- SVG arc 명령어 (`A`)
