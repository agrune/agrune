---
phase: 11-manifest
plan: "01"
subsystem: manifest-sdk
tags: [manifest, schema, sdk, typescript, zod, builders, validator]
one_liner: "@agrune/manifest 패키지 신설 — v3 schema (AgruneManifest/SelectorLadder/ActionKind) + defineManifest/defineTarget/defineRepeat/defineMacro 타입 안전 빌더 + zod 기반 validateManifest (sensitive:false OR-only 차단, hash class/nth-child 금지)"

dependency_graph:
  requires: []
  provides:
    - "@agrune/manifest 패키지 (packages/manifest/)"
    - "v3 manifest 타입: AgruneManifest, ManifestGroup, ManifestTarget, ManifestRepeat, ManifestMacro, MacroStep, SelectorLadder, ActionKind"
    - "zod 스키마: ManifestSchema, TargetSchema, GroupSchema, RepeatSchema, MacroSchema, SelectorLadderSchema"
    - "빌더: defineManifest, defineGroup, defineTarget, defineRepeat, defineMacro"
    - "validator: validateManifest, SelectorForbiddenError, assertNoHashClass, assertNoNthChild"
  affects:
    - "11-02 (TargetResolver가 SelectorLadder 타입 사용)"
    - "11-03 (AgruneManifest v3 타입을 @agrune/core에서 참조)"
    - "11-04 (manifest validate CLI가 validateManifest 호출)"
    - "11-05 (E2E가 @agrune/manifest 빌더 사용)"

tech_stack:
  added:
    - "@agrune/manifest@0.4.1 (packages/manifest/) — pnpm workspace 신규 패키지"
    - "zod ^4.3.6 (runtime dependency for schema validation)"
    - "tsup ^8.5.1, vitest ^4.0.0, typescript ^5.9.3 (devDependencies)"
  patterns:
    - "AtLeastOne<T> helper type — SelectorLadder 최소 1필드 컴파일 타임 강제"
    - "z.literal(true).optional() — sensitive:false 런타임 차단 (OR-only contract)"
    - "SelectorLadderSchema.refine() — 빈 객체 zod 레벨 거부"
    - "@ts-expect-error 음성 테스트 — 컴파일 타임 타입 차단 증명"
    - "HASH_CLASS_PATTERN /\\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/ — Tailwind 오탐 회피 (Pitfall 2)"

key_files:
  created:
    - packages/manifest/package.json
    - packages/manifest/tsconfig.json
    - packages/manifest/tsup.config.ts
    - packages/manifest/vitest.config.ts
    - packages/manifest/src/schema.ts
    - packages/manifest/src/builders.ts
    - packages/manifest/src/validator.ts
    - packages/manifest/src/index.ts
    - packages/manifest/tests/builders.spec.ts
    - packages/manifest/tests/validator.spec.ts
  modified: []

decisions:
  - "sensitive?: true (not boolean) — false 타입 차단은 z.literal(true).optional()로 구현. z.boolean()을 쓰면 Pitfall 5(JSON manifest sensitive:false silent pass) 발생"
  - "HASH_CLASS_PATTERN에 lookahead (?![a-zA-Z0-9-]) 추가 — Tailwind utility class(.bg-blue-500 등) 오탐 방지 (Pitfall 2)"
  - "pathIndicatesSensitiveFalse에서 symbol key 필터링 — zod v4 issue.path가 PropertyKey[] 타입이므로 (string|number) 필터 적용"
  - "@ts-expect-error를 에러 발생 줄 바로 위에 배치 — 함수 호출 전체가 아닌 해당 인자 줄에 적용됨"
  - "defineGroup에서 as unknown as 이중 캐스팅 — ReadonlyArray<TTargets>가 ManifestTarget[]에 직접 할당 불가"

metrics:
  duration_minutes: 5
  completed_date: "2026-04-19"
  tasks_completed: 2
  tasks_total: 2
  files_created: 10
  files_modified: 0
  tests_added: 43
  test_pass_rate: "43/43 (100%)"
---

# Phase 11 Plan 01: @agrune/manifest SDK Summary

## What Was Built

`@agrune/manifest` 패키지를 신설하고 v3 manifest authoring SDK를 완성했다.

### Task 1: 패키지 초기화 + v3 schema
- `packages/manifest/` 디렉토리 생성, `package.json`/`tsconfig.json`/`tsup.config.ts`/`vitest.config.ts` 구성
- `src/schema.ts`: v3 타입 정의 (AgruneManifest, ManifestGroup, ManifestTarget, ManifestRepeat, ManifestMacro, MacroStep, SelectorLadder, ActionKind) + zod 스키마 병기
- `pnpm install`로 `@agrune/manifest@0.4.1` workspace 등록

### Task 2: 빌더 + validator + barrel + 테스트
- `src/builders.ts`: `defineTarget<TId>` (targetId literal 보존), `defineGroup`, `defineRepeat`, `defineMacro`, `defineManifest`
- `src/validator.ts`: `validateManifest` (zod + hash class/nth-child 추가 검사), `SelectorForbiddenError`, `assertNoHashClass`, `assertNoNthChild`
- `src/index.ts`: public barrel export (모든 빌더 + validator + schema + 타입)
- `tests/builders.spec.ts`: 16개 테스트 (4개 `@ts-expect-error` 음성 테스트 포함)
- `tests/validator.spec.ts`: 27개 테스트 (zod 거부, Tailwind 오탐 방지, 해시 class, nth-child)

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter @agrune/manifest run typecheck` | PASS |
| `pnpm --filter @agrune/manifest run test` | 43/43 PASS |
| `pnpm --filter @agrune/manifest run build` | PASS (dist/index.js + dist/index.d.ts) |
| `pnpm -w list @agrune/manifest` | @agrune/manifest@0.4.1 등록됨 |
| `sensitive: z.literal(true).optional()` | false 차단 확인 |
| `SelectorLadder` 최소 1필드 강제 | TypeScript + zod 양쪽에서 확인 |
| Tailwind class 오탐 없음 | `.flex.items-center.bg-blue-500` 통과 확인 |

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-11-01 | `z.literal(true).optional()` + OR-only 에러 메시지 | DONE |
| T-11-02 | `assertNoHashClass/NthChild` + `HASH_CLASS_PATTERN` Tailwind 오탐 회피 | DONE |
| T-11-03 | `SelectorLadderSchema.refine()` 최소 1필드 요구 | DONE |
| T-11-04 | `z.literal(3)` — v2/v4 manifest 거부 | DONE |
| T-11-05 | zod literal(true) 차단 — JSON manifest에서도 sensitive:false 런타임 거부 | DONE |

## Requirements Coverage

| Req ID | Status |
|--------|--------|
| MANIFEST-01 | DONE — `defineTarget` actionKinds/SelectorLadder 컴파일 타임 검증 |
| MANIFEST-02 | DONE — `defineRepeat` template/keyFrom/nameFrom/strategy 타입 안전 |
| MANIFEST-03 | DONE — `defineMacro` params/steps/circuitBreaker 필드 |
| MANIFEST-04 (schema layer) | DONE — `sensitive?: true` TypeScript 타입 + zod literal(true) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `@ts-expect-error` 위치 재배치**
- **발견 시점:** Task 2 typecheck
- **문제:** `@ts-expect-error`를 함수 호출 블록 시작 줄 위에 두면 TS2578(Unused) 에러 발생 — 지시어는 바로 다음 줄에만 적용됨
- **수정:** 각 에러 발생 인자(`sensitive: false`, `actionKinds: ['submit']`, `selector: {}`, `strategy: 'fiber'`) 바로 위 줄로 이동
- **파일:** `packages/manifest/tests/builders.spec.ts`

**2. [Rule 1 - Bug] `pathIndicatesSensitiveFalse` symbol key 필터링**
- **발견 시점:** Task 2 typecheck
- **문제:** zod v4 `issue.path`는 `(string | number | symbol)[]` (PropertyKey[]) — `symbol`이 포함되어 `readonly (string | number)[]` 파라미터에 할당 불가
- **수정:** `.filter((k): k is string | number => typeof k === 'string' || typeof k === 'number')` 추가
- **파일:** `packages/manifest/src/validator.ts`

**3. [Rule 1 - Bug] `defineGroup` `as unknown as` 이중 캐스팅**
- **발견 시점:** Task 2 typecheck
- **문제:** `ReadonlyArray<TTargets>`가 `mutable ManifestTarget[]`에 직접 캐스팅 불가 (TS2352)
- **수정:** `as unknown as ManifestGroup & { ... }` 이중 캐스팅 적용
- **파일:** `packages/manifest/src/builders.ts`

## Known Stubs

없음 — 모든 export가 완전히 구현됨.

## Threat Flags

없음 — 새로운 네트워크 엔드포인트/파일 접근 경로 없음. 순수 TypeScript 라이브러리.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `2da6960` | feat(11-01): init @agrune/manifest package + v3 schema |
| Task 2 | `0a1e974` | feat(11-01): add builders, validator, barrel + tests |

## Self-Check: PASS
