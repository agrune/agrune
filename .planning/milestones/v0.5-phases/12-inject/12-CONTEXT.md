---
phase: "12"
phase_name: INJECT
status: Ready for planning
mode: Auto-generated (discuss skipped via workflow.skip_discuss=true)
generated: "2026-04-19"
---

# Phase 12: INJECT - Context

<domain>
## Phase Boundary

Phase 11의 manifest가 CDP 경로와 MCP tool로 연결되어 외부 사이트(예: YouTube)에서 수동 manifest 로드로 엔드투엔드 동작이 성립한다. PageSnapshot v3 breaking bump가 다른 phase에 침투하기 전에 닫힌다.

**Requirements**: INJECT-01, INJECT-02, RESOLVE-01, RESOLVE-03

**Success Criteria**:
1. AI 에이전트가 `agrune_manifest_load({ manifest })` 를 호출하면 CLI에서 로드한 manifest가 활성 세션에 주입되고 이후 `agrune_snapshot`/`agrune_act` 가 해당 manifest 기반으로 동작한다.
2. `CdpRuntimeInjector.prepareSession({ preloadManifest })` 가 외부 사이트용 `__agrune_preload_manifest__` JSON을 `addScriptToEvaluateOnNewDocument` source에 직접 embed해 첫 페이지 로드에서 zero-RTT로 resolver가 준비된다.
3. `ManifestLoader` 가 owned 앱의 `window.__agrune_manifest__` 또는 CDP preload JSON 둘 중 어느 소스에서도 manifest를 로드하고, 둘 다 제공되면 `window.__agrune_manifest__` 가 우선한다.
4. `PageSnapshot.version` 이 2→3으로 breaking bump되고, 기존 v2 adapter 없이 MCP 도구 출력 shape 자체가 변경된다.
5. E2E 시나리오: `agrune_manifest_load` → YouTube 페이지 열기 → `agrune_snapshot` → target 1개 이상 resolve → `agrune_act` 가 성공 응답을 반환한다.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택은 Claude의 재량에 맡김 — discuss 단계 생략.

**Upstream from Phase 11 (locked):**
- v3 타입 소유: `@agrune/core` (re-export from `@agrune/manifest`)
- `captureTarget.selector`에 JSON.stringify(SelectorLadder)로 임시 직렬화 → Phase 12에서 PageSnapshot v3로 교체 예정 (이 phase의 주요 작업)
- `cdp-runtime-injector.ts`에 `resolveManifest()` + `buildEmptyManifest()` + `reloadRuntime` 훅이 이미 존재 (Phase 11-04에서 도입)
- `window.__agrune_runtime_state__` 이미 tamper-proof 세팅됨

</decisions>

<code_context>
## Existing Code Insights

- `packages/browser/src/cdp-runtime-injector.ts`: `prepareSession`/`resolveManifest` 경로 존재. `preloadManifest` 옵션 신설 필요.
- `packages/runtime/src/runtime/snapshot.ts`: 현재 v2 shape 유지 (PageSnapshot.version 필드). captureTarget.selector는 string으로 직렬화된 SelectorLadder.
- `packages/mcp/src/`: 기존 MCP tools (agrune_snapshot, agrune_act). agrune_manifest_load 신규 추가.
- `packages/e2e/`: Playwright fixture 서버. YouTube 같은 외부 사이트 E2E는 CI에서 optional (PLAYWRIGHT_SKIP_E2E=1).

</code_context>

<specifics>
## Specific Ideas

- `ManifestLoader` 우선순위: `window.__agrune_manifest__` > `window.__agrune_preload_manifest__` > empty.
- PageSnapshot v3: `version: 3`, `descriptors[]` shape 에 SelectorLadder 원본 유지 (JSON.stringify 제거).
- YouTube E2E: CI default skip, 로컬에서만 실행.

</specifics>

<deferred>
## Deferred Ideas

None — discuss 건너뜀.

</deferred>
