---
phase: "17-remove"
plan: "01"
subsystem: runtime + browser
tags:
  - runtime
  - legacy-removal
  - breaking-change
  - manifest-only
requirements:
  - REMOVE-01
dependency_graph:
  requires:
    - "@agrune/runtime v0.4.x legacy inline-annotation path (pre-phase-17 baseline)"
    - "Phase 16 완료 — manifest authoring 대안 스킬 완성"
  provides:
    - "manifest-only runtime bootstrap (data-agrune-* DOM 무시)"
    - "CdpRuntimeInjector.source union = 'window' | 'preload' | 'idle'"
    - "regression specs public-surface + runtime-ignores-legacy"
  affects:
    - "packages/e2e/fixtures/legacy-annotated.html — inline script 실패 예상 (Wave 2)"
    - "packages/e2e/fixtures/idle-boot.html — 동일 (Wave 2)"
    - "packages/e2e/tests/user-flow/helpers.ts — 동일 (Wave 2)"
    - "packages/e2e/tests/bootstrap-idle.spec.ts — source=inline 기대 (Wave 2 의미 반전)"
tech-stack:
  added: []
  patterns:
    - "pnpm --filter @agrune/e2e run copy-runtime — runtime dist → e2e fixture 복제 (기존 스크립트 사용)"
key-files:
  created:
    - "packages/runtime/tests/public-surface.spec.ts"
    - "packages/runtime/tests/runtime-ignores-legacy.spec.ts"
  modified:
    - "packages/runtime/src/index.ts"
    - "packages/runtime/src/page-runtime.ts"
    - "packages/runtime/src/runtime/snapshot.ts"
    - "packages/runtime/src/runtime/page-agent-runtime.ts"
    - "packages/runtime/src/runtime/dom-utils.ts"
    - "packages/runtime/src/runtime/command-handlers.ts"
    - "packages/browser/src/cdp-runtime-injector.ts"
    - "packages/runtime/tests/runtime.spec.ts"
    - "packages/runtime/tests/sensitive-or-only.spec.ts"
    - "packages/e2e/fixtures/runtime.bundle.js"
  deleted:
    - "packages/runtime/src/dom-scanner.ts"
    - "packages/runtime/src/manifest-builder.ts"
decisions:
  - "captureTarget 의 viewportTransform 파라미터 제거 — canvas coord-space 자체가 사라졌으므로 모든 target 은 viewport 좌표"
  - "isInCanvasGroup 호출지 5곳을 !isTopmostInteractable 로 단순화 — canvas group 은 더 이상 존재하지 않음"
  - "CANVAS_PAN_FAILED error-code enum 유지 — throw 호출지는 제거했지만 core error-code 스키마 변경은 out-of-scope (v0.6+ 로 연기)"
  - "escapeAttributeValue / buildDomPathSelector / getVisibleCenter / parseTransform / canvasToViewport / viewportToCanvas / autoPanToCanvasPoint 전부 삭제 — buildLiveSelector 제거 후 전부 dead code"
  - "sensitive heuristic numbering 4→8 을 4→7 으로 재번호화 (legacy fallback 삭제로 한 칸 당김)"
metrics:
  duration: "24 minutes"
  completed: "2026-04-19T14:04:49Z"
---

# Phase 17 Plan 01: Runtime + Browser src 에서 legacy `data-agrune-*` bootstrap 경로 물리 삭제 Summary

**One-liner:** RESEARCH.md §3 Runtime Inventory 9 개 call-site 그룹을 전부 제거해 runtime/browser src 에서 `data-agrune-*` 을 구조적으로 0 으로 만들고 (`aurora`/`pointer` 마커만 유지), export surface 를 축소하고, regression spec 2 개를 추가했다. E2E runtime bundle 이 새 소스로 재생성돼 `scanAnnotations` / `LIVE_SCAN_*` / `collectLiveDescriptors` / `buildLiveSelector` 기호가 bundle 안에서도 0 개다.

## Tasks Completed

| # | Task | Commits |
| --- | --- | --- |
| 1 | Wave 0 regression spec 작성 (public-surface + runtime-ignores-legacy) | `1a979f2` |
| 2a | dom-scanner.ts / manifest-builder.ts 삭제 + runtime re-exports 정리 | `91753cd` |
| 2b | CdpRuntimeInjector.resolveManifest legacy inline-scan branch 삭제 | `47445b5` |
| 3a | snapshot.ts — LIVE_SCAN_* / collectLiveDescriptors / mergeDescriptors / callMetaFunction / parseViewportTransform 삭제 + captureTarget 의 viewportTransform 제거 + SNAPSHOT_RELEVANT_ATTRIBUTES 정리 | `4252491` |
| 3b | page-agent-runtime.ts — getDescriptors 를 `() => manifestDescriptors` 로 축소 | `3638e1a` |
| 3c | dom-utils.ts — isSensitive legacy fallback 삭제 + buildLiveSelector/escapeAttributeValue/buildDomPathSelector 삭제 + 영향 받는 runtime/sensitive-or-only spec 업데이트 | `af2e302` |
| 4a | command-handlers.ts — canvas helper 3 개 + drag auto-pan branch + detectMaskedInput legacy check + canvas 관련 dom-utils helper 5 개 삭제 | `10faf3b` |
| 4b | runtime dist 재빌드 + e2e runtime.bundle.js 재생성 | `2b69647` |

## Deleted Files

- `packages/runtime/src/dom-scanner.ts` (82L)
- `packages/runtime/src/manifest-builder.ts` (69L)

## Removed Symbols Inventory

**runtime/src (exports):**
- `scanAnnotations`, `scanGroups`, `buildManifest` (value)
- `ScannedTarget`, `ScannedGroup` (type)

**runtime/src/runtime/snapshot.ts:**
- `LIVE_SCAN_ACTION_SELECTOR`, `LIVE_SCAN_GROUP_SELECTOR`, `LIVE_SCAN_DEFAULT_GROUP_ID`, `LIVE_SCAN_DEFAULT_GROUP_NAME`
- `collectLiveDescriptors()`, `mergeDescriptors()`
- `callMetaFunction()`, `parseViewportTransform()` (file-local)
- `data-agrune-action|canvas|desc|group|group-desc|group-name|key|meta|name` 항목 전부 `SNAPSHOT_RELEVANT_ATTRIBUTES` 에서 제거
- `captureTarget` 의 `viewportTransform` 파라미터

**runtime/src/runtime/page-agent-runtime.ts:**
- `collectLiveDescriptors`, `mergeDescriptors` import
- `getDescriptors = () => mergeDescriptors(...)` → `() => manifestDescriptors`

**runtime/src/runtime/dom-utils.ts:**
- `isSensitive` 의 4번째 path (`data-agrune-sensitive === 'true'`)
- `buildLiveSelector()`, `escapeAttributeValue()`, `buildDomPathSelector()`
- `viewportToCanvas()`, `canvasToViewport()`, `parseTransform()`, `autoPanToCanvasPoint()`, `getVisibleCenter()`

**runtime/src/runtime/command-handlers.ts:**
- `detectMaskedInput` 의 `data-agrune-masked === 'true'` 단락
- `isInCanvasGroup()`, `getCanvasGroupTransform()`, `findCanvasGroupEl()` (file-local) — 5 개 call-site 가 `!isTopmostInteractable(el)` 단독 체크로 단순화
- coord-based drag 의 canvas auto-pan + stack-detection + canvas-coord 변환 블록 전체

**browser/src/cdp-runtime-injector.ts:**
- `resolveManifest` 의 inline-scan branch (source `'inline'` 포함)
- `source` TypeScript union: `'window' | 'preload' | 'inline' | 'idle'` → `'window' | 'preload' | 'idle'`
- "Legacy inline-scan path" / "annotation-specific" / "annotation presence" 주석 neutralize

## Preserved (non-negotiable)

- `packages/runtime/src/runtime/dom-utils.ts` 의 `AGRUNE_INTERNAL_SELECTOR` 상수와 `isAgruneInternalNode` 헬퍼 — `data-agrune-aurora` / `data-agrune-pointer` 내부 마커 감지용
- `packages/runtime/src/runtime/cursor-animator.ts` 의 `el.setAttribute('data-agrune-aurora'|'data-agrune-pointer', ...)` — cursor 애니메이션 본체 (PROJECT.md, MEMORY "Cursor animation non-negotiable")

## New Spec Evidence

**`packages/runtime/tests/public-surface.spec.ts`** — 4 tests, all PASS:
- `scanAnnotations` / `scanGroups` / `buildManifest` 가 `@agrune/runtime` export 에 부재
- `installPageAgentRuntime` / `createPageAgentRuntime` 는 여전히 export (과잉 삭제 방지 positive sentinel)

**`packages/runtime/tests/runtime-ignores-legacy.spec.ts`** — 2 tests, all PASS:
- empty manifest + DOM 에 `data-agrune-action` / `data-agrune-key` / `data-agrune-group` 있을 때 snapshot targets.length === 0
- DOM 에 있는 legacy key (`phantom`) 가 snapshot target 의 `targetId` / `selector` 어디에도 안 나타남

Wave 0 RED → Task 1 commit 시점 두 spec 모두 FAIL (`AssertionError: expected Function buildManifest to be undefined`, `expected [ …(2) ] to have a length of +0 but got 2`) → Task 3 commit 이후 둘 다 GREEN.

## E2E Bundle Regeneration Evidence

- `pnpm --filter @agrune/runtime build` 성공 (131.93 KB IIFE + 103.76 KB ESM)
- `pnpm --filter @agrune/e2e run copy-runtime` 으로 `packages/e2e/fixtures/runtime.bundle.js` 갱신
- `grep -c 'scanAnnotations\|LIVE_SCAN_\|collectLiveDescriptors\|buildLiveSelector' packages/e2e/fixtures/runtime.bundle.js` → `0`
- `git diff packages/e2e/fixtures/runtime.bundle.js` stat: 554 insertions / 548 deletions (net increase because build output formatting differs; 실질적인 bundle 크기는 줄었다)

## Gate Check Results

| # | Gate | Status |
| --- | --- | --- |
| 1 | `find packages/runtime/src -name 'dom-scanner.ts' -o -name 'manifest-builder.ts' \| wc -l` = 0 | ✅ |
| 2 | `pnpm --filter @agrune/runtime typecheck` exit 0 | ✅ |
| 3 | `pnpm --filter @agrune/browser typecheck` exit 0 | ✅ |
| 4 | `pnpm --filter @agrune/runtime test --run` (262/262) | ✅ |
| 5 | `pnpm -r build` exit 0 | ✅ |
| 6 | `grep -rn 'data-agrune-' packages/runtime/src packages/browser/src` → aurora/pointer 마커만 | ✅ |
| 7 | `grep -rn 'scanAnnotations\|scanGroups\|buildManifest\|LIVE_SCAN_\|collectLiveDescriptors\|buildLiveSelector' packages/runtime/src packages/browser/src` → 0 lines | ✅ |
| 8 | 신규 spec `public-surface` / `runtime-ignores-legacy` 존재하고 PASS | ✅ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] runtime.spec.ts 의 기존 테스트 3 개가 legacy `data-agrune-sensitive` / live-descriptor 경로에 의존**
- **Found during:** Task 3 (after collectLiveDescriptors 제거)
- **Issue:** 3 개 테스트가 legacy path 를 전제로 작성되어 있어 Task 3 이후 실패:
  - `getSnapshot은 visible/enabled/actionKind를 포함한다` — email input 에 `data-agrune-sensitive` 만 설정하고 sensitive:true 기대
  - `민감한 fill target은 sensitive reason으로 표시된다` — 동일 패턴
  - `동일 targetId가 step 전환으로 다른 selector를 가리켜도 live descriptor를 우선 반영한다` — 이름 자체가 제거된 경로 검증
- **Fix:**
  - 처음 두 개는 `type="password"` 로 전환해 heuristic 경로로 sensitive 신호 유지
  - 세 번째는 테스트 이름을 "manifest selector 는 재해석된다" 로 교체하고 `.wizard-primary` / `.wizard-back` / `.wizard-close` 처럼 step 전환에 survive 하는 class-based selector 로 재작성. textContent 기반 snapshot.name 반영은 그대로 유지.
- **Files modified:** `packages/runtime/tests/runtime.spec.ts`
- **Commit:** `af2e302`

**2. [Rule 1 - Bug] sensitive-or-only.spec.ts 가 명시적으로 legacy 경로를 검증**
- **Found during:** Task 3
- **Issue:** 두 테스트 케이스가 `data-agrune-sensitive='true'` 만으로 `isSensitive(el) === true` 를 기대 — 이는 Phase 17 이후 반전되어야 할 계약
- **Fix:** 주석을 "Phase 17 REMOVE-01" 문구로 업데이트하고 `expect(...).toBe(true)` → `expect(...).toBe(false)` 로 의미 반전. 규제는 유지 (legacy 단독으로는 sensitive 가 아님; heuristic 2-7 중 하나에 매칭되거나 manifest `sensitive:true` 가 필요)
- **Files modified:** `packages/runtime/tests/sensitive-or-only.spec.ts`
- **Commit:** `af2e302`

**3. [Rule 1 - Bug] "act는 동적으로 추가된 overlay target" / "act는 step 전환 뒤 다음 frame에서 주입된 overlay target"**
- **Found during:** Task 3 (Task 2 commits 이후 이미 실패 상태)
- **Issue:** 두 테스트가 DOM 에 `data-agrune-action` / `data-agrune-key` 속성을 동적으로 추가해 live-scan 경유로 snapshot 에 target 이 나타나기를 기대. manifest 에는 `confirm` / `create` 가 없음.
- **Fix:**
  - 첫 번째는 `makeManifest()` → `makeOverlayFlowManifest()` (이미 `confirm` target 포함) 로 전환
  - 두 번째는 기존 `makeManifest()` 에 `create` group+target 을 local manifest variant 로 추가
- **Files modified:** `packages/runtime/tests/runtime.spec.ts`
- **Commit:** `af2e302`

### Known Out-of-scope Flaky Test (pre-existing)

- `act는 동적으로 추가된 overlay target을 즉시 snapshot에 반영하고 실행할 수 있다` — 간헐적 timeout.
  **원인:** module-level `mockCdpPostMessage = vi.fn(...)` 의 default implementation 이 beforeEach 의 `mockReset()` 으로 지워지며, 이 테스트가 `mockImplementation(...)` 을 설정했을 때 실제로는 설정 전 CDP 호출이 발생하면 `cdp_response` 이벤트가 안 옴 → 5 초 timeout. 테스트 격리 실행 시엔 항상 PASS, full-suite 실행 시 order-dependent.
  **baseline 확인:** pristine `e50005a` (Phase 17 전) 시점에도 full-suite 에서 같은 테스트가 실패 — **Phase 17 이 만든 회귀가 아님**.
  **결정:** 본 plan scope 밖 (Rule 4 구분 — 사전 존재 + 테스트 인프라 수정 필요). SUMMARY 에 기록만 하고 수정 없음.

## Handoff to Next Waves

### Wave 2 (17-02) — fixture 의미 반전

아래 파일들은 여전히 deleted symbol (`scanAnnotations` / `scanGroups` / `buildManifest`) 을 호출하므로 재작성 필요 (RuntimeApi 전역이 이제 이 3 함수를 제공하지 않으므로 `typeof runtimeApi.scanAnnotations === 'function'` 은 항상 false, try 블록의 throw 은 catch 로 빠져 idle 진입). 이는 Wave 2 가 **의미 반전**으로 처리할 대상이다:

| 파일 | 현재 상태 | Wave 2 목표 |
| --- | --- | --- |
| `packages/e2e/fixtures/legacy-annotated.html` | `runtimeApi.buildManifest(runtimeApi.scanAnnotations(...), runtimeApi.scanGroups(...))` 호출 (실패 → idle fallback) | runtime 이 legacy attribute 를 **무시**하는지 검증하는 fixture 로 재작성 (`source=idle`, `hasManifest=false` 확인) |
| `packages/e2e/fixtures/idle-boot.html` | 동일 패턴 | 동일 패턴으로 재작성 |
| `packages/e2e/tests/user-flow/helpers.ts` L320-380 | bootstrap inline script 에서 동일 호출 | manifest-only 로 단순화 (`runtimeApi.buildEmptyManifest()` 만) |
| `packages/e2e/tests/bootstrap-idle.spec.ts` L28-35 | `legacy-annotated.html: runtime boots active via inline scan`, `source=inline` 기대 | `legacy-annotated.html: runtime ignores legacy data-agrune-* attributes`, `source=idle` 기대 (의미 반전) |

**Known acceptable regression (to be fixed in 17-02):** `packages/e2e/tests/bootstrap-idle.spec.ts` / `packages/e2e/tests/annotation-scan.spec.ts` 가 fixture 미반전 상태에서 실패할 수 있음 — 17-02 가 처리.

### Wave 3 (17-03) — 문서 재작성

- README / AGENTS / PRIVACY / docs/* 의 `data-agrune-*` 어노테이션 섹션 제거 + manifest 중심 재작성
- `packages/mcp/README.md` 의 "extension mode backend/native-host entrypoints" 라인 (CDP-only 피봇 drift) 정정
- `workflows/annotate/WORKFLOW.md` — manifest 기반으로 재작성 or `.agents/skills/manifest/SKILL.md` 로 인계 (authoritative source 선언)

### Wave 4 (17-04) — External repo sync + regression guard + `lint:annotations` 결정

- `/Users/chenjing/dev/agrune/.github/profile/README.md` sync (external repo, 사용자 수동 push)
- `/Users/chenjing/dev/agrune/skills/skills/annotate/` 폐기 지침 작성 (external repo)
- `scripts/regression-guard/no-legacy-data-agrune.sh` + `scripts/regression-guard/data-agrune-allowlist.txt` 신설 — CI 에서 grep 기반 회귀 방지
- 루트 `package.json` 의 `lint:annotations` script 운명 결정 (권고: 삭제)
- `@agrune/core/annotation-lint` 패키지 자체는 Success Criteria 4 명시 예외로 존속

## Self-Check: PASSED

- **Created files:**
  - `packages/runtime/tests/public-surface.spec.ts` — FOUND
  - `packages/runtime/tests/runtime-ignores-legacy.spec.ts` — FOUND
- **Deleted files:**
  - `packages/runtime/src/dom-scanner.ts` — MISSING (as expected)
  - `packages/runtime/src/manifest-builder.ts` — MISSING (as expected)
- **Commits verified:** `1a979f2`, `91753cd`, `47445b5`, `4252491`, `3638e1a`, `af2e302`, `10faf3b`, `2b69647` — all present in `git log`
