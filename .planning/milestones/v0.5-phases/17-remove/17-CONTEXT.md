---
phase: "17"
name: REMOVE
gathered: 2026-04-19
status: ready-for-planning
mode: auto-generated (discuss skipped via workflow.skip_discuss)
---

# Phase 17: REMOVE - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via `workflow.skip_discuss=true`)

<domain>
## Phase Boundary

단일 authoring 경로 원칙이 구조적으로 확정된다 — inline `data-agrune-*` 스캐너 bootstrap 경로가 runtime에서 완전히 제거되고, 모든 문서·외부 조직 프로필이 "target mapping" 용어로 재작성된다.

**Success Criteria** (from ROADMAP.md):

1. `packages/runtime/src/runtime/dom-scanner.ts` 와 `manifest-builder.ts` 의 bootstrap 경로가 완전히 삭제되고 (테스트 픽스처에서만 참조) 신규 페이지 로드에서 `data-agrune-*` 속성은 runtime이 무시한다.
2. README·AGENTS·`docs/*` 의 `data-agrune-*` 어노테이션 섹션이 전부 제거되고 manifest + `defineTarget`/`defineMacro` 중심으로 재작성된다. 예제·튜토리얼이 inline 어노테이션을 보여주지 않는다.
3. 외부 `/Users/chenjing/dev/agrune/.github/profile/README.md` 가 "annotation" → "target mapping" 용어로 sync되고, 제품 표면 설명이 manifest pivot을 반영한다.
4. `grep -r 'data-agrune-' packages/` 가 테스트 픽스처(`packages/*/test-fixtures/` 등)와 build-linter 레거시 참조 외에는 매치하지 않는다.

**Requirements**: REMOVE-01, REMOVE-02, REMOVE-03

**Depends on:** Phase 16 (recorder + CLI watcher로 authoring 대안이 완성된 뒤에만 legacy 경로 제거가 안전). Phase 16 완료 확인됨 (2026-04-19).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss=true`. Use ROADMAP phase goal, success criteria, and codebase conventions (see PROJECT.md "Key Decisions": inline `data-agrune-*` 완전 폐기 결정 2026-04-19) to guide decisions.

### Known Constraints (from PROJECT.md / MEMORY)

- **CDP-only architecture** (2026-04-15 pivot): extension/native-messaging/backend-daemon 경로 없음. Runtime은 devtools standalone 웹앱에서만 돌아감.
- **No backward compatibility adapter** (2026-04-19): PageSnapshot v2↔v3 처럼 breaking change 직행. 실 사용자 없음.
- **GitHub 조직 프로필 sync** (MEMORY): 제품 표면 변경 시 `.github/profile/README.md`도 같이 업데이트 (외부 repo `/Users/chenjing/dev/agrune/.github/` — 사용자 수동 push는 별도).
- **"target mapping" 용어 전환** (MEMORY pending todo): Phase 17이 실행 단계.
- **Cursor animation non-negotiable** (MEMORY): UX 삭제 금지. 이 phase에서는 관련 없음.

</decisions>

<code_context>
## Existing Code Insights

구체적 codebase context는 plan-phase research 단계에서 수집. 최소 starting points:

- `packages/runtime/src/runtime/dom-scanner.ts` — legacy inline-annotation scanner (제거 대상)
- `packages/runtime/src/runtime/manifest-builder.ts` — legacy `data-agrune-*` → manifest 빌더 (제거 대상)
- `packages/runtime/src/runtime/` — runtime entry가 scanner를 호출하는지 확인 필요
- `packages/runtime/tests/runtime.spec.ts` — Phase 16 SUMMARYs에서 언급된 pre-existing overlay 타이밍 flake; 이 phase에서 정리 기회
- `packages/runtime/test-fixtures/` (예상) — `data-agrune-*` 테스트 픽스처만 보존 후보 (성공 기준 4)
- `README.md`, `AGENTS.md`, `docs/*` — `data-agrune-*` 섹션 전체 리라이트 대상
- `.github/profile/README.md` (외부 repo에 위치, 현 repo 내 경로 확인 필요) — "annotation" → "target mapping" 용어 sync
- `packages/runtime/src/index.ts` — legacy export 제거 후보

</code_context>

<specifics>
## Specific Ideas

No specific implementation instructions — discuss skipped. Planning phase should decompose into:

1. **Runtime legacy 경로 제거** — dom-scanner/manifest-builder 삭제 + runtime entry에서 호출 제거 + import graph cleanup
2. **Test 정리** — 기존 `data-agrune-*` 관련 테스트를 3 그룹으로 분류: (a) 삭제 (scanner 동작 자체 테스트), (b) 유지하되 fixture-only로 재작성, (c) 새로운 "runtime ignores legacy attributes" regression test
3. **문서 리라이트** — README / AGENTS / docs/* 의 inline-annotation 섹션 전부 manifest 중심으로 리라이트 (예제는 `packages/e2e/fixtures/todomvc/manifest.ts` 참조)
4. **용어 sync** — "annotation" → "target mapping" 일관된 어휘. `/Users/chenjing/dev/agrune/.github/profile/README.md` 포함 (외부 repo, sync 수행 후 사용자 수동 push 안내)
5. **Regression guard** — `grep -r 'data-agrune-' packages/` 가 성공 기준 4의 예외만 매치하도록 CI-friendly 검증 스크립트 추가 고려

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped. Phase 18 REGISTRY는 schema stable 확인을 전제로 하므로, Phase 17이 breaking surface를 정리해야 Phase 18 공개가 안전함.

</deferred>
