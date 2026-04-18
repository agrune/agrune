# Phase 8: DevTools Webapp - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

사용자가 `@agrune/devtools` 웹앱만 열어두고도 자동화 세션의 상태를 관찰하고 HITL(human-in-the-loop) 개입할 수 있도록 devtools를 완성한다. 구체적으로: MCP 명령 로그 뷰, HITL 일시정지/재개/스킵 제어, 명령 실패 진단 UI, 세션 목록·active 전환 UI (SESS-04).

**Depends on**: Phase 7 — active session 개념이 먼저 존재해야 devtools UI가 그 상태를 표출·전환할 수 있음.

Requirements: SESS-04, DEVT-01, DEVT-02, DEVT-03, DEVT-04.

**UI hint**: yes (frontend phase).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택 Claude 재량. 공유 규칙:

- **Stack**: 기존 `@agrune/devtools` Vite 빌드 단일 웹앱. 새 프레임워크·라우터 도입 금지. 기존 스냅샷 뷰어/pause-resume와 통합.
- **데이터 경로**: MCP 서버가 이미 HTTP/WebSocket 서버를 띄움. 새 이벤트(명령 시작/끝/실패, HITL 상태)는 기존 WebSocket 채널에 추가 이벤트 타입으로 실어 보낸다.
- **명령 로그 뷰 (DEVT-01)**: 시간순 리스트 + 세션 필터, 도구 이름 필터, 상태(성공/실패) 필터. client-side에 최근 N개(예: 500)만 보관.
- **HITL 제어 (DEVT-02)**: MCP 서버에 이미 있는 pause 개념을 확장해 step 단위 pause/resume/skip 액션을 WebSocket command로 받음. 도구 실행 직전 pause gate 체크.
- **실패 진단 (DEVT-03)**: 실패 이벤트 payload에 에러 코드, 대상 노드 selector/path, 현재 manifest 버전/해시, 어노테이션 상태 포함. UI는 접힌 카드로 펼쳐 보여줌.
- **세션 목록 + active 전환 (SESS-04/DEVT-04)**: Phase 7에서 MCP 응답/세션 API가 `active` 플래그를 노출함. devtools가 폴링 또는 WebSocket 이벤트로 목록을 받아 렌더링, active 배지 표시, 클릭 시 `agrune_focus` 호출 경로로 active 전환.
- **UI-SPEC**: 본 phase가 frontend이므로 planner 단계에서 `gsd-ui-phase` 를 호출해 UI-SPEC.md 먼저 생성. 검토는 `gsd-ui-review`를 phase 말미에 수행.
- **Known pre-existing build issues (`ws`, `vite`)**: Phase 8 범위 내에서 devtools 웹앱이 dev 서버+빌드가 실제로 돌도록 **최소 복구**는 허용하되, 본격적 정리는 Phase 9에서 한다. 빌드가 막혀 본 phase가 진행 불가할 경우에만 touch.

</decisions>

<canonical_refs>
## Canonical References

### Project docs
- `.planning/REQUIREMENTS.md` §"DevTools Webapp" — DEVT-01~04 + SESS-04
- `.planning/ROADMAP.md` §"Phase 8" — 4개 success criteria
- `.planning/PROJECT.md` — `@agrune/devtools` 패키지 역할

### Code surfaces
- `packages/devtools/` — Vite 빌드 standalone 웹앱
- `packages/mcp/src/devtools-server.ts` — HTTP/WebSocket 서버 (ws 모듈 pre-existing 이슈)
- `packages/mcp/src/index.ts` — MCP 서버 엔트리, HITL pause 로직
- Phase 7에서 추가된 `agrune_focus`·`PublicSessionMeta`

### 외부 스펙
- `docs/superpowers/specs/2026-03-*devtools*.md` 또는 `*hitl*.md` 스펙 존재 시 반영 (research 단계에서 확인)

</canonical_refs>

<code_context>
## Existing Code Insights

Will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss skipped.

</specifics>

<deferred>
## Deferred Ideas

- E2E 브라우저 테스트(Playwright)로 devtools UI 검증은 Phase 9 QUAL-01에서 처리.
- 대규모 로그 persistent storage(파일/IndexedDB)는 범위 밖. 세션 종료 시 휘발 허용.

</deferred>

---

*Phase: 08-devtools-webapp*
*Context gathered: 2026-04-18*
