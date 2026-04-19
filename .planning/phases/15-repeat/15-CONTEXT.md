---
phase: "15"
phase_name: REPEAT
status: Ready for planning
mode: Auto-generated (discuss skipped via workflow.skip_discuss=true)
generated: "2026-04-19"
---

# Phase 15: REPEAT - Context

<domain>
## Phase Boundary

동적 리스트(YouTube 피드, Notion 리스트) 의 N 인스턴스를 manifest-level declarative하게 표현. Viewport-only virtualized strategy로 v0.5 범위에서 안정.

**Requirements**: REPEAT-01, REPEAT-02, REPEAT-03

**Success Criteria**:
1. `defineRepeat({ template, keyFrom, strategy: 'dom' })` → runtime이 DOM enumerate + textContent anchor로 N 인스턴스 snapshot + 안정된 stable key 식별.
2. `strategy: 'virtualized'` → viewport 내 row만 enumerate. `aria-rowcount`/`aria-setsize` → logical-size hint → PageSnapshot 반영. AI가 N보다 큰 index 요청 시 명시적 에러 (fiber data-state 접근은 v0.6+).
3. Snapshot group에 `repeatInstance: { index, key }` 필드 — AI 에이전트가 `login.items[postId=abc123]` 경로로 개별 인스턴스 타겟.
4. Validation CLI — `defineRepeat` stable key 누락 시 빌드 실패 (index-only key는 reorder 취약 → 금지).

**UI hint**: no

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택은 Claude 재량.

**Upstream from Phase 11-14 (locked):**
- Phase 11: `defineRepeat` schema (template, keyFrom string, nameFrom, strategy: 'dom'|'virtualized')
- Phase 11-05: `agrune manifest validate` CLI
- Phase 12: PageSnapshot v3 (descriptors → repeatInstance 필드 추가)
- Phase 13: FiberIdentityIndex — Phase 15 scope에서는 사용 안 함 (fiber data-state는 v0.6+로 연기)
- Phase 14: MacroRunner — macro step이 repeat instance target을 참조 가능

**Key constraint (2026-04-19 memo):**
- Phase 11에서 `keyFrom`은 string만 (JS expression string, validate CLI에서 `new Function('el', expr)` 호출) — Phase 15 scope에서는 이 계약 유지
- viewport-only virtualized: 스크롤 아웃된 row 접근 시 명시적 에러. AI는 `aria-rowcount`/`aria-setsize` hint로 logical size 파악

</decisions>

<code_context>
## Existing Code Insights

- `packages/manifest/src/schema.ts` — defineRepeat schema 확정. 현재 keyFrom는 string.
- `packages/runtime/src/runtime/snapshot.ts` — descriptor + captureTarget 경로. repeatInstance 필드 추가 대상.
- `packages/runtime/src/runtime/target-resolver.ts` — resolveByLadder. repeat instance 타겟팅 확장.
- `packages/mcp/src/manifest-validate-cli.ts` — Phase 11-05 완료. stable key 누락 검출 강화.

</code_context>

<specifics>
## Specific Ideas

- RepeatExpander 클래스 (`packages/runtime/src/runtime/repeat-expander.ts` 신규) — `expand(repeat, container) → { instances: Array<{ el, key, index }> }`.
- DOM strategy: `document.querySelectorAll(repeat.template)` 내 각 element에 keyFrom string eval.
- Virtualized strategy: `container.querySelectorAll(repeat.template)` 만 + `aria-rowcount` hint inject.
- Stable key: undefined → validate CLI 빌드 실패 (Phase 11-05 기반 확장).
- Snapshot group에 `repeats: Array<{ repeatId, instances: [...] }>` + `repeatInstance: { index, key }` 필드 per target.

</specifics>

<deferred>
## Deferred Ideas

- Fiber data-state based virtualization (React Virtual, TanStack Virtual) → v0.6+
- `keyFrom` 함수 지원 → v0.6+ (currently string only)

</deferred>
