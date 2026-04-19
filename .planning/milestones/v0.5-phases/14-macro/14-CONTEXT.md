---
phase: "14"
phase_name: MACRO
status: Ready for planning
mode: Auto-generated (discuss skipped via workflow.skip_discuss=true)
generated: "2026-04-19"
---

# Phase 14: MACRO - Context

<domain>
## Phase Boundary

복합 플로우(로그인 등)가 페이지 런타임 내부에서 실행 → CDP round-trip 없이 4x 토큰 절감. 민감 필드는 manifest `sensitive:false` 로도 override 불가 (runtime DOM heuristic OR-combine).

**Requirements**: MACRO-01, MACRO-02, MACRO-03, MACRO-04

**Success Criteria**:
1. `agrune_macro_run({ macroId, params })` 호출 시 MacroRunner가 페이지 런타임 내부에서 전체 step 실행. MCP는 시작/종료만 orchestrate — step별 CDP round-trip 없음.
2. Runtime DOM heuristic(`type=password`, `autocomplete=current-password|new-password|cc-*|one-time-code`, 단어 경계 regex `/\b(password|pwd|cvv|ssn)\b/i`, 한/영/일 ARIA label) 이 manifest `sensitive` 플래그와 OR 결합. 악성 manifest `sensitive:false`도 runtime override → `valuePreview`/로그/스냅샷 자동 마스킹.
3. Macro precondition 실패 시 step 실행 전 중단 + "already-in-target-state" 반환. Postcondition 실패 또는 연속 실패 시 circuit breaker → partial execution account-lockout 방지.
4. MacroRunner가 기존 `CommandBroker`/`HitlController`/`action-queue` 재사용 → devtools 웹앱 command log에 step별 progress 스트리밍. `sensitive:true` step은 HITL gate 강제.

**UI hint**: no (devtools command log만 확장, 신규 UI 없음)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택은 Claude 재량.

**Upstream from Phase 11-13 (locked):**
- `@agrune/manifest` defineMacro schema: `id/params/steps/precondition/postcondition` — Phase 11 완료
- `isSensitive(el, manifestFlag?: true)` OR chain — Phase 11-02 완료
- `BrowserDriver.injectManifest` — Phase 12 완료
- `@agrune/react` FiberIdentityIndex — Phase 13 완료 (macro step에서 fiber resolve 활용 가능)

**Key decision (2026-04-19):** Cross-cutting Pitfall 4 (sensitive 우회) primary owner = Phase 14 MACRO (runtime heuristic OR-override).

</decisions>

<code_context>
## Existing Code Insights

- `packages/runtime/src/runtime/` — 기존 `CommandBroker`, `HitlController`, `action-queue`, `fill-cdp` 재사용.
- `packages/mcp/src/` — `agrune_macro_run` 신규 tool (mcp-tools.ts + index.ts + core/src/tools.ts 3파일 동기화).
- `packages/runtime/src/runtime/snapshot.ts` — `valuePreview` 필드에 sensitive 마스킹 적용 지점.
- `packages/runtime/src/runtime/dom-utils.ts` — `isSensitive` 확장 (단어 경계 regex + 다국어 ARIA label).

</code_context>

<specifics>
## Specific Ideas

- `MacroRunner` 클래스: `run(macroId, params)` → step loop (precondition check → action → postcondition check → circuit breaker 평가).
- Circuit breaker: 연속 실패 2회 → abort + state preserve.
- "already-in-target-state" signal: precondition이 `already-satisfied` 반환 시 macro skip.
- HITL gate: `sensitive: true` step 진입 전 user confirmation (기존 HitlController 재사용).
- 단어 경계 regex: `/\b(password|pwd|cvv|ssn)\b/i` — word boundary로 오탐 방지.
- 다국어 ARIA label: 한국어 "비밀번호", 일본어 "パスワード", 중국어 등 매핑 테이블.

</specifics>

<deferred>
## Deferred Ideas

None — discuss 건너뜀.

</deferred>
