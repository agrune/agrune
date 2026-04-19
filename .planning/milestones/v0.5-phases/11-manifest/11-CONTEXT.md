---
phase: "11"
phase_name: MANIFEST
status: Ready for planning
mode: Auto-generated (discuss skipped via workflow.skip_discuss=true)
generated: "2026-04-19"
---

# Phase 11: MANIFEST - Context

<domain>
## Phase Boundary

manifest가 모든 것의 뿌리가 된다 — 타입 안전 authoring SDK (`@agrune/manifest`) + v3 스키마 + CSS-only runtime resolver까지 닫아 수동 manifest 전달만으로 외부 사이트 자동화가 엔드투엔드 가능한 상태를 구축한다.

**Requirements**: MANIFEST-01, MANIFEST-02, MANIFEST-03, MANIFEST-04, MANIFEST-05, RESOLVE-02, RESOLVE-04

**Success Criteria**:
1. Author가 `defineManifest({ targets: [defineTarget({...})], repeats: [defineRepeat({...})], macros: [defineMacro({...})] })` 를 작성하면 TS가 `targetId` union·`actionKinds`·selector ladder를 컴파일 타임에 검증한다.
2. `agrune manifest validate <manifest.ts> --url https://site` 가 live DOM에 대해 selector 1:1 매칭을 확인하고 실패한 target을 보고한다.
3. Runtime이 수동 주입한 manifest로 부팅하면, CSS fallback selector(priority: role > text > testId > stable attr > CSS; 해시 class/`:nth-child` 금지)로 외부 사이트 target을 resolve한다.
4. Runtime은 더 이상 `data-agrune-*` 부트스트랩 게이트를 요구하지 않는다 — manifest 유무와 무관하게 항상 부팅하고 manifest 없으면 idle 상태에 머문다.
5. Schema level에서 `sensitive:true` flag가 존재하며, `sensitive:false` 로 runtime heuristic을 override할 수 없다는 계약(OR-only)이 스키마·타입·validate CLI 에러 메시지로 확정돼 있다.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택은 Claude의 재량에 맡김 — discuss 단계는 `workflow.skip_discuss=true` 설정으로 건너뜀.
ROADMAP phase goal, success criteria, 기존 codebase conventions를 근거로 판단.

</decisions>

<code_context>
## Existing Code Insights

Codebase context는 plan-phase의 research 단계에서 수집됩니다. v1.1에서 완성된 CDP runtime, snapshot, resolver가 출발점입니다 — manifest SDK는 이 위에 새 authoring layer로 추가되어야 합니다.

</code_context>

<specifics>
## Specific Ideas

discuss 건너뜀 — ROADMAP phase description과 success criteria를 spec으로 사용.

</specifics>

<deferred>
## Deferred Ideas

None — discuss 단계 생략.

</deferred>
