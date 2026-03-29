# 1-2. agrune_focus 설계

작성일: 2026-03-29

## 배경

현재 agrune은 `tabId`로 백그라운드 탭에 명령을 보낼 수 있지만, 실제 탭/윈도우 포커스 전환은 불가. OAuth 팝업, 새 탭 링크, 멀티탭/멀티윈도우 플로우에서 필요.

## 목표

- 지정한 탭을 활성화하고 해당 윈도우를 앞으로 가져오기
- AI가 하나의 API로 탭+윈도우 포커스를 모두 처리

## 설계

### API

```typescript
agrune_focus({
  tabId: number,  // 포커스할 탭 ID
})
```

### 동작 흐름

1. `chrome.tabs.get(tabId)` → 탭 정보 조회
2. `chrome.windows.update(tab.windowId, { focused: true })` → 윈도우 포커스
3. `chrome.tabs.update(tabId, { active: true })` → 탭 활성화
4. 성공/실패 반환

### 에러 처리

- tabId에 해당하는 탭 없음 → `TAB_NOT_FOUND` 에러

## 변경 파일

| 파일 | 변경 |
|------|------|
| `mcp-server/src/mcp-tools.ts` | `agrune_focus` 도구 등록 + Zod 스키마 |
| extension 백그라운드 스크립트 | focus 핸들러 추가 (chrome.tabs/windows API 호출) |

## 범위 밖

- 윈도우 ID 직접 지정 (tabId로부터 자동 해석)
