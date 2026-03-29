# 1-1. agrune_capture 설계

작성일: 2026-03-29

## 배경

AI가 페이지의 시각적 상태를 파악할 수 없음. 어노테이션 누락 요소 발견, QA 버그 증거, 캔버스 UI 상태 확인 등에 스크린샷 필요.

## 목표

- CDP `Page.captureScreenshot` 기반 스크린샷 캡처 도구
- base64 이미지를 MCP 응답으로 직접 반환 (파일 저장 없음)
- 전체 페이지, targetId, selector 기준 영역 캡처 지원

## 설계

### API

```typescript
agrune_capture({
  targetId?: string,   // agrune 타깃 ID → 해당 요소 영역만 clip
  selector?: string,   // CSS 셀렉터 → 해당 요소 영역만 clip
  tabId?: number,      // 대상 탭 (기본: 현재 활성 탭)
})
```

- 파라미터 없음: 전체 페이지 캡처
- targetId와 selector 동시 지정 시: targetId 우선
- 반환: base64 PNG 이미지 (MCP image content type)

### 동작 흐름

1. targetId/selector로 요소 resolve → `getBoundingClientRect()`로 clip 영역 산출 (런타임, command-handler)
2. clip 영역을 extension에 전달 → CDP `Page.captureScreenshot({ format: 'png', clip })` 호출 (extension/CDP 클라이언트)
3. base64 데이터를 MCP image content로 반환

### clip 영역 계산

- targetId: `resolveRuntimeTarget()` → element → `getBoundingClientRect()`
- selector: `document.querySelector()` → element → `getBoundingClientRect()`
- 요소를 못 찾으면 에러 반환
- clip은 viewport 좌표 기준 (CDP가 viewport 좌표를 사용)

### 에러 처리

- targetId/selector에 해당하는 요소 없음 → `TARGET_NOT_FOUND` 에러
- CDP 호출 실패 → `CAPTURE_FAILED` 에러

## 변경 파일

| 파일 | 변경 |
|------|------|
| `mcp-server/src/mcp-tools.ts` | `agrune_capture` 도구 등록 + Zod 스키마 |
| `build-core/src/runtime/command-handlers.ts` | capture 핸들러 추가 (clip 계산 + CDP 호출) |
| `core/src/index.ts` | CommandType에 'capture' 추가 (필요 시) |

## 범위 밖

- region 좌표 기반 캡처 (필요 시 추후 추가)
- 파일 저장 옵션
- fullPage 스크롤 캡처
