# CDP 마이그레이션 후 발견된 이슈

## 해결 완료 (2026-03-27)

### ✅ #5. CDP 실제 연결

`page-agent-runtime.ts`에서 `cdpPostMessage` 콜백을 주입하여 `createCdpClient()` → `createEventSequences()` 체인 활성화. `content/index.ts`의 cdp_request 릴레이에서 `type` 필드 누락 버그도 수정.

### ✅ #8. 합성 이벤트 fallback 코드 제거

`synthetic-dispatch.ts` (556줄) 삭제, `SyntheticDispatchFallback` 인터페이스 및 `command-handlers.ts` 5곳의 분기 제거. `eventSequences`를 non-null 필수 의존성으로 변경.

### ✅ #1. 카드 드래그 애니메이션 — CDP로 자동 해결

### ✅ #2. 칸반 카드 이동 — CDP로 자동 해결

### ✅ #4. 캔버스 줌 — CDP로 자동 해결

### ✅ #7. 워크플로우 노드 드래그 — CDP로 자동 해결

---

## 미해결 이슈

### #3. 스냅샷에 엣지(연결선) 정보 누락

**현상:** agrune 스냅샷에 기존 엣지 정보가 포함되지 않음. AI가 어떤 노드가 이미 연결되어 있는지 알 수 없어서 중복 연결을 시도함.

**해결 방향:** 스냅샷에 기존 엣지 정보를 포함하거나, 연결 상태를 description에 반영.

### #6. MCP 서버 배포 프로세스 누락

**현상:** `pnpm build`만으로는 MCP 서버 변경사항이 `~/.agrune/mcp-server/`에 반영되지 않음.

**해결 방향:** `pnpm build` 후 자동 복사 스크립트 추가. 또는 개발 중에는 모노레포 dist를 직접 참조하도록 변경.

---

## 추가 개선사항

### #9. pointer 액션 간 딜레이 지원

**현상:** wheel 줌 등 여러 단계를 부드럽게 표현하려면 액션을 여러 번 수동으로 나열해야 함.

**해결 방향:** pointer 액션에 `delayMs` 필드 추가하거나, `smooth: true` 모드로 시작/끝 좌표만 지정하면 중간 스텝 + 딜레이 자동 생성.

### #10. 캔버스 노드 좌표 계산 정확도

**현상:** React Flow 캔버스에서 뷰포트 좌표와 캔버스 내부 좌표가 1:1 매핑되지 않아 노드 정렬이 부정확함.

**해결 방향:** 캔버스 transform(scale, translateX/Y)을 읽어서 뷰포트 → 캔버스 좌표 변환 로직 추가. 또는 스냅샷에 캔버스 transform 정보를 포함.

### #11. CDP 디버거 자동 해제

**현상:** 작업 완료 후에도 Chrome 상단 "디버깅 중" info bar가 사라지지 않음.

**해결 방향:** 일정 시간(예: 30초) 이벤트 커맨드가 없으면 `chrome.debugger.detach()` 자동 호출. 다음 커맨드 시 lazy re-attach.

---

## 우선순위 (남은 작업)

1. **엣지 정보 스냅샷 (#3)** — AI가 기존 연결 상태를 알 수 있도록
2. **MCP 서버 배포 자동화 (#6)** — 개발 편의성
3. **디버거 자동 해제 (#11)** — UX 개선
4. **pointer 딜레이 (#9)** — 부드러운 애니메이션 UX
5. **캔버스 좌표 변환 (#10)** — 노드 정렬 정확도
