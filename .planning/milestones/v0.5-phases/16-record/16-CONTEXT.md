---
phase: "16"
phase_name: RECORD
status: Ready for planning
mode: Auto-generated (discuss skipped via workflow.skip_discuss=true)
generated: "2026-04-19"
---

# Phase 16: RECORD - Context

<domain>
## Phase Boundary

피봇의 authoring UX 완결 — DevTools 오버레이 recorder + CLI watcher가 pending 디렉토리를 통해 소스 파일을 안전하게 머지. AI authoring skill이 manifest 버전으로 재작성 → sensitive auto-detect 정확도 precision≥90%/recall≥95%.

**Requirements**: RECORD-01, RECORD-02, RECORD-03, RECORD-04, RECORD-05

**Success Criteria**:
1. DevTools 웹앱 `RecorderView`에서 `idle → picking → recording-action` mode를 keyboard shortcut 토글. Picking 모드: element hover→클릭으로 candidate selector 3개(fiber path, role+name, CSS fallback) 캡처.
2. `recorder_toggle` / `recorder_captured` / `recorder_commit` WS 프로토콜 확정. MCP 서버가 캡처 결과를 `~/.agrune/authoring/pending/<session>/<ts>.json`에만 기록 — **사용자 소스 파일 직접 쓰지 않음**.
3. `agrune manifest dev` watcher가 pending 디렉토리 변경 감지 → ts-morph로 `manifest.ts`의 `defineManifest` 오브젝트에 새 target 머지 (주석·포매팅 보존, diff preview + 사용자 confirm 후 적용).
4. Recorder capture 시점 sensitive heuristic 자동 적용 → 적절한 target에 `sensitive:true` flag 부여. AI authoring skill (manifest 버전)이 100+ 실제 로그인/결제 폼 corpus에서 precision≥90%, recall≥95% CI 회귀 테스트.
5. 소스 접근 가능한 React 프로젝트에서 AI authoring skill이 ~80-90% target 자동 생성 (demo 페이지 시연 검증).

**UI hint**: yes — `RecorderView` 컴포넌트 UI.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택은 Claude 재량.

**Upstream from Phase 11-15 (locked):**
- Phase 11: `defineManifest` SDK + `AgruneManifest` v3 types
- Phase 13: `FiberIdentityIndex` (bippy) — fiber path capture
- Phase 14: sensitive heuristic (Phase 14-01에서 다국어 ARIA 확장)
- Phase 15: `defineRepeat` runtime — recorder가 repeat 캡처 가능해야 함

**Key constraints:**
- **NO direct source-file writes** — pending 디렉토리만 사용. `agrune manifest dev` watcher가 사용자 confirm 후 ts-morph로 머지.
- ts-morph — AST 편집으로 주석/포매팅 보존.

</decisions>

<code_context>
## Existing Code Insights

- `packages/devtools/` — 기존 devtools webapp. RecorderView 신규 컴포넌트 추가.
- `packages/mcp/src/` — `recorder_*` WS 프로토콜 신설.
- `packages/cli/` 또는 `packages/mcp/bin/` — `agrune manifest dev` watcher 신설.
- AI authoring skill — `.claude/skills/` 또는 `.agents/skills/` 기존 annotation authoring skill을 manifest로 재작성.

</code_context>

<specifics>
## Specific Ideas

- RecorderView keyboard shortcuts: `Ctrl+Shift+R` (toggle), `Esc` (cancel), `Enter` (commit).
- Candidate selector priority: fiber path (from `__agrune_identity__`) > role+name > CSS fallback.
- Pending file shape: `{ ts, sessionId, url, targets: [{ targetId, selector: SelectorLadder, sensitive?: true }] }`
- AI skill corpus: synthetic 100+ login/payment forms (다국어 포함) — CI 회귀 테스트.
- Demo 페이지: React TodoMVC 같은 fixture — AI skill로 80%+ 자동 생성 시연.

</specifics>

<deferred>
## Deferred Ideas

- Multi-file manifest 지원 (현재 단일 `manifest.ts` 가정) → v0.6+
- AI skill이 macro/repeat 자동 생성 → v0.6+ (Phase 16은 target 중심)

</deferred>
