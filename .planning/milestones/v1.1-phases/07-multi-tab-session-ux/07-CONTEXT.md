# Phase 7: Multi-Tab Session UX - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

사용자가 여러 탭을 열어도 의도한 탭이 조작되고 탭 간 포커스를 명시적으로 전환할 수 있다. `SessionManager`에 **active session** 개념을 도입하고, `tabId` 미지정 호출이 active session을 우선 사용하도록 `resolveTabId`를 개편한다. `agrune_focus` 도구로 세션 active 전환을 수행한다.

**Depends on**: Phase 6 (resync 경로가 준비되어야 active session 전환 시 런타임 상태가 깨지지 않음).

Requirements: SESS-01, SESS-02, SESS-03. (SESS-04는 Phase 8 DevTools UI에서 처리.)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택 Claude 재량. 공유 규칙:

- **Active session state**: `SessionManager`가 단일 `activeSessionId` 필드를 유지. 마지막으로 도구 호출의 대상이 된 세션이 기본 active.
- **최근 상호작용 추적**: 도구 호출 successful return 시마다 해당 세션을 active로 marking (`Date.now()`로 `lastInteractionAt` 업데이트 포함).
- **`resolveTabId` 규칙**: (1) 요청에 `tabId` 명시되면 그 값 사용, (2) 없으면 active session, (3) active도 없으면 유일한 세션 / 첫 세션 fallback + warn.
- **`agrune_focus` 도구**: 입력 `{ tabId?: string, sessionId?: string }`. sessionId 우선, 없으면 tabId로 세션을 역조회. 성공 시 `activeSessionId` 업데이트하고 MCP 응답에 새 active 상태 포함. 해당 세션이 존재하지 않으면 구조화된 에러.
- **MCP 응답 메타**: 모든 도구 응답에 `session: { id, tabId, wasActive: bool, becameActive: bool }` 등을 실어 호출자가 어느 세션이 선택됐는지 추적 가능하게 한다.
- **Spec 참조**: `docs/superpowers/specs/2026-03-*-focus-*.md`가 있으면 researcher가 그것을 canonical ref로 채택.

</decisions>

<canonical_refs>
## Canonical References

### Project docs
- `.planning/REQUIREMENTS.md` §"Multi-Tab / Session UX" — SESS-01~03
- `.planning/ROADMAP.md` §"Phase 7" — Success Criteria
- `.planning/PROJECT.md` — SessionManager 위치

### Code surfaces
- `packages/browser/src/session-manager.ts`
- `packages/browser/src/cdp-driver.ts` — `resolveTabId` 경로
- `packages/mcp/src/tools.ts` / `packages/mcp/src/mcp-tools.ts` — MCP 도구 정의
- `packages/core/src/index.ts` — 도구 요청/응답 타입

### 외부 스펙
- `docs/superpowers/specs/2026-03-*focus*.md` — 존재 시 반드시 반영 (research 단계에서 확인)

</canonical_refs>

<code_context>
## Existing Code Insights

Will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss skipped. REQUIREMENTS §Multi-Tab/Session UX + ROADMAP success criteria.

</specifics>

<deferred>
## Deferred Ideas

- SESS-04 (devtools 웹앱에서 active session 확인·전환 UI)는 Phase 8에서 처리. 본 phase는 backend 개념·MCP 도구까지만.

</deferred>

---

*Phase: 07-multi-tab-session-ux*
*Context gathered: 2026-04-18*
