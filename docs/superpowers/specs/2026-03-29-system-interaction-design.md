# 1-3. 시스템 인터랙션 설계

작성일: 2026-03-29

## 배경

파일 업로드/다운로드, JS 다이얼로그, 브라우저 권한 팝업 등 시스템 레벨 인터랙션은 일반 DOM 이벤트로 처리 불가. CDP API로 직접 제어 필요.

## 목표

- 파일 업로드, 다운로드, 다이얼로그 응답, 권한 허용을 각각 독립 도구로 제공
- 유저 프로젝트에 설치할 것 없음 — 전부 agrune MCP 서버 + 확장에서 처리

## 설계

### 1. agrune_upload

파일 입력 요소에 다이얼로그 없이 파일 주입.

```typescript
agrune_upload({
  targetId: string,    // file input 타깃 ID
  filePath: string,    // 로컬 파일 경로
  tabId?: number,
})
```

동작:
1. targetId로 요소 resolve → `<input type="file">` 확인
2. 런타임에서 요소의 CSS selector 전달 → extension이 CDP `DOM.querySelector`로 nodeId 획득
3. CDP `DOM.setFileInputFiles({ files: [filePath], nodeId })` 호출
4. 성공/실패 반환

에러:
- 요소가 file input이 아님 → `INVALID_TARGET` 에러
- 파일 경로 없음 → `FILE_NOT_FOUND` 에러

### 2. agrune_download

다운로드 자동 수락 + 저장 경로 지정.

```typescript
agrune_download({
  savePath: string,    // 저장 디렉토리 경로
  tabId?: number,
})
```

동작:
1. CDP `Browser.setDownloadBehavior({ behavior: 'allow', downloadPath: savePath })` 호출
2. 이후 발생하는 다운로드가 자동으로 해당 경로에 저장됨
3. 성공 반환

참고: 이 도구는 다운로드를 트리거하지 않음. 다운로드 경로를 설정할 뿐, 실제 다운로드는 AI가 별도로 클릭 등으로 트리거.

### 3. agrune_dialog

JavaScript alert/confirm/prompt 자동 응답.

```typescript
agrune_dialog({
  accept: boolean,     // true: 확인, false: 취소
  text?: string,       // prompt인 경우 입력할 텍스트
  tabId?: number,
})
```

동작:
1. CDP `Page.javascriptDialogOpening` 이벤트 리스닝 (상시)
2. 다이얼로그 감지 시 이벤트를 MCP 서버에 전달
3. `agrune_dialog` 호출 시 CDP `Page.handleJavaScriptDialog({ accept, promptText })` 실행
4. 결과 반환 (다이얼로그 type, message 포함)

다이얼로그 감지 (스코프 내):
- 다이얼로그가 열리면 `agrune_snapshot`이나 다른 명령이 블로킹됨
- CDP `Page.javascriptDialogOpening` 이벤트 상시 리스닝
- 다이얼로그 감지 시 스냅샷 결과에 `pendingDialog: { type, message }` 포함 → AI가 인지하고 `agrune_dialog`로 응답

### 4. agrune_permission

브라우저 권한 자동 허용 (카메라, 마이크, 위치 등).

```typescript
agrune_permission({
  permissions: string[],  // ['camera', 'microphone', 'geolocation', ...]
  tabId?: number,
})
```

동작:
1. tab의 origin 조회
2. CDP `Browser.grantPermissions({ permissions, origin })` 호출
3. 성공/실패 반환

## 변경 파일

| 파일 | 변경 |
|------|------|
| `mcp-server/src/mcp-tools.ts` | 4개 도구 등록 + Zod 스키마 |
| `build-core/src/runtime/command-handlers.ts` | upload, dialog 핸들러 (DOM 접근 필요한 부분) |
| extension 백그라운드 / CDP 클라이언트 | download, permission, dialog 이벤트 리스닝 |
| `core/src/index.ts` | CommandType 추가 |

## 범위 밖

- 다운로드 완료 대기/확인
- 다이얼로그 자동 응답 모드 (수동 응답만)
- 권한 거부 시뮬레이션
