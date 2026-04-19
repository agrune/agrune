---
phase: 11-manifest
plan: "03"
subsystem: core+runtime
tags: [core, runtime, v3-schema, descriptor, breaking-change, manifest]
requirements: [MANIFEST-01]
one_liner: "@agrune/core v2 manifest 완전 제거 및 @agrune/manifest v3 re-export; @agrune/runtime descriptor 수집 경로(collectDescriptors/findElements/collectLiveDescriptors/buildManifest) v3 SelectorLadder+actionKinds 통일"

dependency_graph:
  requires:
    - "11-01: @agrune/manifest 패키지 + v3 schema (AgruneManifest/SelectorLadder/ActionKind)"
    - "11-02: target-resolver.ts resolveByLadder (SelectorLadder → HTMLElement[])"
  provides:
    - "@agrune/core — v3 manifest 단일 진실 소스 (via @agrune/manifest re-export)"
    - "@agrune/runtime — collectDescriptors v3(targets+repeats), findElements → resolveByLadder, collectLiveDescriptors SelectorLadder wrapping, buildManifest version:3"
    - "packages/runtime/tests/v3-descriptor.spec.ts — manifest→descriptor→resolveByLadder e2e 검증"
  affects:
    - "11-04 (manifest validate CLI — @agrune/core v3 타입 사용)"
    - "11-05 (E2E — runtime이 v3 manifest 수신)"
    - "Phase 12 (PageSnapshot v3 shape 교체 — captureTarget selector 직렬화 방식 변경 예정)"
    - "Phase 17 (inline data-agrune-* scan 전체 제거 예정)"

tech_stack:
  added: []
  patterns:
    - "@agrune/core가 @agrune/manifest를 pure re-export — 독립 타입 정의 없음"
    - "collectDescriptors v3: group.targets + group.repeats[].targets 순회, tool.action.split 완전 제거"
    - "findElements → resolveByLadder 위임 (직접 querySelector 제거)"
    - "collectLiveDescriptors: legacy data-agrune-* scan 유지 but SelectorLadder { css } wrapping (Phase 17 제거 예정)"
    - "buildManifest: version:3, ScannedTarget.selector → { css: selector } 변환"
    - "captureTarget: PageTarget.selector에 JSON.stringify(ladder) 임시 직렬화 (Phase 12에서 PageSnapshot v3로 교체)"

key_files:
  created:
    - packages/core/tests/manifest-v3.spec.ts
    - packages/runtime/tests/v3-descriptor.spec.ts
  modified:
    - packages/core/package.json
    - packages/core/src/manifest.ts
    - packages/core/src/index.ts
    - packages/runtime/src/types.ts
    - packages/runtime/src/index.ts
    - packages/runtime/src/runtime/snapshot.ts
    - packages/runtime/src/manifest-builder.ts
    - packages/runtime/src/runtime/command-handlers.ts
    - packages/runtime/tests/runtime.spec.ts
    - packages/runtime/tests/fill-cdp.spec.ts
    - pnpm-lock.yaml

decisions:
  - "ActionKind import 순서 문제: index.ts 상단에 import type { ActionKind } from './manifest.js' + export type { ActionKind }를 명시적으로 추가 — export * from './manifest.js'는 파일 끝에 있어 PageTarget 인터페이스에서 forward-reference 불가"
  - "TargetDescriptor.target 타입을 ManifestTarget & { sourceFile?, sourceLine?, sourceColumn? }로 확장 — live scan descriptor는 source 위치 정보가 없으므로 optional"
  - "captureTarget.selector: JSON.stringify(ladder) 임시 직렬화 — PageTarget.selector는 string 타입(Phase 12 대상). Plan에 명시된 transitional 결정"
  - "collectLiveDescriptors: legacy inline scan 경로 유지 (Phase 17 제거 예정) — 출력만 SelectorLadder { css } wrapping으로 v3 shape 통일"
  - "@agrune/runtime/src/index.ts: v2 re-export(AgruneExposureMode/AgruneSupportedAction/AgruneGroupEntry/AgruneToolEntry/AgruneToolStatus/AgruneTargetEntry) 제거, v3 타입(ManifestTarget/ManifestGroup 등) 추가"

metrics:
  duration_minutes: 8
  completed_date: "2026-04-19"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 11
  tests_added: 12
  test_pass_rate: "115/115 @agrune/runtime + 29/29 @agrune/core (100%)"
---

# Phase 11 Plan 03: @agrune/core v3 교체 + Runtime Descriptor v3 이식 Summary

## What Was Built

### Task 1: `@agrune/core` manifest.ts v3 교체 + workspace 의존성

`packages/core/src/manifest.ts`를 v2 인터페이스(AgruneGroupEntry/AgruneToolEntry/AgruneTargetEntry/AgruneExposureMode/generatedAt/exposureMode)에서 완전 제거하고, `@agrune/manifest`의 v3 타입을 pure re-export하는 형태로 교체했다.

**핵심 변경:**
- `packages/core/package.json`: `@agrune/manifest workspace:*` 의존성 추가
- `packages/core/src/manifest.ts`: 42줄 v2 인터페이스 → 21줄 re-export (version: 3, AgruneManifest/ManifestGroup/ManifestTarget/ManifestRepeat/ManifestMacro/MacroStep/SelectorLadder/ActionKind)
- `packages/core/src/index.ts`: line 21의 `export type ActionKind = 'click' | ...` 제거 + 파일 상단에 `import type { ActionKind } from './manifest.js'` 명시 (순서 의존 문제 해결)
- `packages/core/tests/manifest-v3.spec.ts`: 7개 타입 계약 테스트 (v3 shape 확인 + @ts-expect-error 음성 테스트)

### Task 2: `@agrune/runtime` descriptor 경로 v3 이식

descriptor 수집 전체 경로를 v3 manifest shape에 맞게 수정했다.

**`src/types.ts`:** v2 타입 re-export 제거, v3 타입 re-export 추가

**`src/runtime/snapshot.ts`:**
- `TargetDescriptor.target`: `AgruneTargetEntry` → `ManifestTarget & { sourceFile?, sourceLine?, sourceColumn? }`
- `collectDescriptors`: `group.tools → group.targets + group.repeats[].targets` 전환, `tool.action.split(',')` 제거, `target.actionKinds` 직접 사용
- `findElements`: `document.querySelectorAll(selector)` → `resolveByLadder(descriptor.target.selector)`
- `collectLiveDescriptors`: `selector: string` → `selector: { css: buildLiveSelector(element) }` (Phase 17까지 legacy 경로 유지)
- `captureTarget`: `selector: JSON.stringify(ladder)` 임시 직렬화 (PageTarget.selector는 string — Phase 12에서 교체)

**`src/manifest-builder.ts`:** `version: 2/exposureMode/AgruneGroupEntry/AgruneToolEntry` 완전 제거 → `version: 3, groups: ManifestGroup[]`, `selector: { css: target.selector }`

**`src/runtime/command-handlers.ts`:** `ActionKind` import를 `./snapshot` → `../types`로 교체

**`src/index.ts`:** v2 타입 barrel 제거, v3 타입 barrel 추가

**테스트 업데이트:**
- `tests/runtime.spec.ts`: makeManifest/makeRepeatedTargetManifest/makeOverlayFlowManifest + 인라인 4개 v2 fixture를 v3 shape으로 전환
- `tests/fill-cdp.spec.ts`: makeFillManifest v3 shape으로 전환
- `tests/v3-descriptor.spec.ts`: 신규 — manifest→descriptor→resolveByLadder e2e 체인 검증 (5 tests)

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter @agrune/core run typecheck` | PASS |
| `pnpm --filter @agrune/core run test` | 29/29 PASS |
| `pnpm --filter @agrune/core run build` | PASS |
| `pnpm --filter @agrune/runtime run typecheck` | PASS |
| `pnpm --filter @agrune/runtime run test` | 115/115 PASS |
| `pnpm --filter @agrune/runtime run build` | PASS (dist/index.js + page-runtime.global.js) |
| `pnpm --filter @agrune/browser run typecheck` | PASS (downstream 영향 없음) |
| `grep -rn "version: 2" packages/core/src packages/runtime/src` | 0건 (주석 제외) |
| `grep -q "AgruneToolEntry" packages/core/dist/index.d.ts` | FAIL = PASS (v2 타입 제거 확인) |

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-11-12 | `buildManifest()` → version: 3 반환, `grep version: 2` 잔재 0건 확인 | DONE |
| T-11-13 | typecheck strict + 기존 115개 runtime 테스트 회귀 통과로 `tool.action` 접근 잔재 없음 증명 | DONE |
| T-11-14 | `collectDescriptors`에 `group.repeats ?? []` 순회 추가 — v3-descriptor.spec.ts에서 검증 | DONE |
| T-11-15 | `@agrune/core`는 `@agrune/manifest` 순수 re-export만 수행, 독립 정의 없음 | DONE |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ActionKind forward-reference 해결**
- **발견 시점:** Task 1 typecheck
- **문제:** `export * from './manifest.js'`가 파일 끝에 있어서, 파일 중반의 `PageTarget.actionKinds: ActionKind[]`에서 `ActionKind`를 찾지 못함 (TS2304)
- **수정:** index.ts 상단에 `import type { ActionKind } from './manifest.js'` + `export type { ActionKind } from './manifest.js'`를 명시적으로 추가
- **파일:** `packages/core/src/index.ts`
- **커밋:** 29f3ec4 포함

**2. [Rule 2 - Missing Critical] `@agrune/runtime/src/index.ts` barrel 업데이트**
- **발견 시점:** Task 2 typecheck
- **문제:** index.ts가 더 이상 존재하지 않는 v2 타입들(AgruneExposureMode 등)을 re-export하려 함
- **수정:** v2 타입 제거, v3 타입(ManifestTarget/ManifestGroup 등) 추가
- **파일:** `packages/runtime/src/index.ts`
- **커밋:** 91d2d9a 포함

**3. [Rule 1 - Bug] `fill-cdp.spec.ts`의 v2 fixture 업데이트**
- **발견 시점:** Task 2 테스트 실행
- **문제:** plan에 `runtime.spec.ts` 업데이트만 명시됐으나 `fill-cdp.spec.ts`에도 v2 fixture 존재
- **수정:** `makeFillManifest()`를 v3 shape으로 전환
- **파일:** `packages/runtime/tests/fill-cdp.spec.ts`
- **커밋:** 91d2d9a 포함

## Known Stubs

**임시 직렬화 (Phase 12 대상):**
- `packages/runtime/src/runtime/snapshot.ts` — `captureTarget`의 `selector: JSON.stringify(descriptor.target.selector)`
  - `PageTarget.selector: string` 타입이 Phase 12에서 v3 shape으로 교체될 때까지 임시 유지
  - 이 플랜의 목표(v3 통일)는 달성됨 — 출력 wire shape만 Phase 12에서 교체 예정

**Legacy scan 경로 (Phase 17 대상):**
- `collectLiveDescriptors`: `data-agrune-*` inline scan 유지 (Phase 17에서 전체 제거)
- `buildManifest`: ScannedTarget → ManifestTarget 변환 경로 유지 (Phase 17에서 전체 제거)

## Threat Flags

없음 — 새 네트워크 엔드포인트/auth 경로/파일 접근 패턴 없음. 순수 타입 시스템 + DOM 쿼리 변경.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `29f3ec4` | feat(11-03): @agrune/core v2→v3 manifest replace + @agrune/manifest re-export |
| Task 2 | `91d2d9a` | feat(11-03): @agrune/runtime descriptor path v3 migration |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `packages/core/tests/manifest-v3.spec.ts` EXISTS | PASS |
| `packages/runtime/tests/v3-descriptor.spec.ts` EXISTS | PASS |
| `.planning/phases/11-manifest/11-03-SUMMARY.md` EXISTS | PASS |
| commit `29f3ec4` EXISTS | PASS |
| commit `91d2d9a` EXISTS | PASS |
