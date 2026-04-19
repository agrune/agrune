---
phase: "13"
plan: "02"
subsystem: react
tags: [react, bippy, fiber, identity-bridge, prod-guard, ssr-barrier, tamper-proof]
completed: "2026-04-19T09:06:01Z"
duration_minutes: 70

dependency_graph:
  requires:
    - "@agrune/manifest: FiberIdentityPath / FiberPathSegment type (Plan 01)"
  provides:
    - "@agrune/react 0.4.1 — FiberIdentityIndex + activateBridge + isProdEnabled + waitForHydration + AgruneDevtools"
    - "window.__agrune_identity__ bridge (configurable:false, writable:false lock)"
  affects:
    - "@agrune/runtime: window.__agrune_identity__.resolve() bridge가 게시되면 fiber-first branch 활성화"
    - "Plan 03: React 17/18/19 matrix fixture가 이 패키지를 import"

tech_stack:
  added:
    - "bippy 0.5.39 — React fiber instrumentation (instrument/secure/traverseRenderedFibers)"
    - "@testing-library/react ^16.3.2 — AgruneDevtools 컴포넌트 테스트"
  patterns:
    - "WeakMap<HTMLElement,FiberIdentityPath> + Map<string,WeakRef<HTMLElement>> — 값 타입 저장, fiber 참조 보관 없음"
    - "Object.defineProperty({ writable:false, configurable:false }) — tamper-proof lock (Phase 11/12보다 엄격)"
    - "process.env.AGRUNE_PROD_ENABLED 점 표기법 — bundler dead-code-elim 친화"
    - "vi.mock('bippy') factory mock — jsdom에서 fiber instrumentation 격리 테스트"

key_files:
  created:
    - packages/react/package.json
    - packages/react/tsconfig.json
    - packages/react/tsup.config.ts
    - packages/react/vitest.config.ts
    - packages/react/src/index.ts
    - packages/react/src/fiber/identity-index.ts
    - packages/react/src/fiber/fiber-adapter-v20.ts
    - packages/react/src/bridge/identity-bridge.ts
    - packages/react/src/guard/prod-guard.ts
    - packages/react/src/guard/ssr-barrier.ts
    - packages/react/src/components/AgruneDevtools.tsx
    - packages/react/tests/identity-index.spec.ts
    - packages/react/tests/identity-bridge.spec.ts
    - packages/react/tests/prod-guard.spec.ts
    - packages/react/tests/ssr-barrier.spec.ts
    - packages/react/tests/AgruneDevtools.spec.tsx
  modified: []

decisions:
  - "FiberIdentityIndex mock: vi.fn().mockImplementation()이 constructor로 동작 안 함 — 플레인 객체를 FiberIdentityIndex 타입으로 캐스팅하는 방식 채택"
  - "identity-bridge.spec.ts: configurable:false로 인해 테스트 간 window 상태 공유 — 순서 의존적 describe 설계로 해결"
  - "vitest 함수 이름 mangling: function Button(){}의 이름이 'Button2'로 변환됨 — displayName을 명시적으로 설정하는 makeComponentType() 헬퍼로 해결"
  - "AgruneDevtools의 manifest prop: 현재 bridge 경로에서 미사용 — void manifest로 lint 방지, Phase 14 MacroRunner가 소비 예정"
  - "waitForHydration을 AgruneDevtools 테스트에서 vi.mock으로 즉시 resolve — 실제 readyState/_fiberRoots 조건 없이 컴포넌트 동작 테스트 가능"

metrics:
  tasks_completed: 2
  tests_added: 26
  files_created: 16
  files_modified: 0
  task_commits:
    - "1cac7ba: feat(13-02): bootstrap @agrune/react package + FiberIdentityIndex + guards + SSR barrier"
    - "df1c7c7: feat(13-02): add identity-bridge lock + AgruneDevtools component + integration tests"
---

# Phase 13 Plan 02: @agrune/react 패키지 Summary

**One-liner:** `bippy 0.5.39` 기반 `FiberIdentityIndex`(WeakMap+WeakRef 값 타입 저장)와 `Object.defineProperty(configurable:false)` tamper-proof `window.__agrune_identity__` bridge를 갖춘 `@agrune/react 0.4.1` 패키지를 신설, 2단계 prod guard + SSR hydration barrier + StrictMode 이중 mount 방어 전부 26개 unit test로 입증.

## Tasks Completed

| Task | Name | Commit | Tests added |
|------|------|--------|-------------|
| 1 | @agrune/react 패키지 초기화 + FiberIdentityIndex + guards + SSR barrier | 1cac7ba | 15 |
| 2 | identity-bridge lock + AgruneDevtools 컴포넌트 + 통합 테스트 | df1c7c7 | 11 |

## Package Initialization

pnpm workspace에 `packages/react/` 신규 패키지 추가. `packages/*` glob이 이미 존재하므로 `pnpm-workspace.yaml` 수정 불필요. `pnpm install --filter @agrune/react...` 실행 후 lockfile 갱신됨.

```
@agrune/react@0.4.1
  peerDependencies: react ^17.0.0 || ^18.0.0 || ^19.0.0
                    react-dom ^17.0.0 || ^18.0.0 || ^19.0.0
  dependencies:     @agrune/manifest workspace:*
                    bippy 0.5.39
  devDependencies:  react@18.3.1 (default), @testing-library/react@16.3.2, vitest@4.0.0
```

## Test Breakdown

| 파일 | 테스트 수 | 검증 내용 |
|------|----------|----------|
| identity-index.spec.ts | 6 | buildPath composite filter, slice(0,8) depth cap, indexFiber/getByPath/deindexFiber, WeakRef GC, memo displayName |
| prod-guard.spec.ts | 6 | mode='dev' bypass, env 미설정/설정, localStorage 미설정/false/true, localStorage throw |
| ssr-barrier.spec.ts | 3 | 즉시 resolve, load event 후 resolve, _fiberRoots=0 pending |
| identity-bridge.spec.ts | 6 | 최초 lock+descriptor, 이중 mount early return, 덮어쓰기 방어, TypeError(configurable:false), resolve delegate, version='1' |
| AgruneDevtools.spec.tsx | 5 | 렌더 no-throw, hydration 후 bridge 게시, prod guard 차단, instrument 호출 확인, unmount cleanup |
| **합계** | **26** | |

## Bundle Size Metrics

| 파일 | 크기 |
|------|------|
| dist/index.js (ESM) | 4,508 bytes (~4.4 KB) |
| dist/index.cjs (CJS) | 4,567 bytes (~4.5 KB) |
| dist/index.d.ts | 2,594 bytes |

목표 50KB 이하 달성 (bippy는 external로 번들에서 제외됨).

## Security Confirmations

| 항목 | 결과 |
|------|------|
| bippy override* API (`overrideProps`, `overrideHookState`) import 여부 | 없음 (T-13-15) |
| `process.env['AGRUNE_PROD_ENABLED']` bracket notation 사용 여부 | 없음 (A1 / T-13-11) |
| `window.__agrune_identity__` lock descriptor | `{ writable:false, configurable:false, enumerable:false }` (T-13-10) |
| StrictMode 이중 mount 방어 | `configurable:false` 기존 감지 + `activatedRef` 이중 가드 (Pitfall 2) |
| localStorage try/catch 래핑 | 있음 (SSR / privacy mode ReferenceError 방어) |

## Threat Mitigations Applied

| Threat ID | 구현 |
|-----------|------|
| T-13-10 | `Object.defineProperty({ writable:false, configurable:false })` + 이중 lock 감지 |
| T-13-11 | `process.env.AGRUNE_PROD_ENABLED` 점 표기법 (dead-code-elim) + localStorage token |
| T-13-14 | `buildPath` `slice(0, 8)` depth cap + `isHostFiber` filter로 합성 fiber 제외 |
| T-13-15 | bippy override* API 전혀 import 안 함 |
| T-13-16 | `waitForHydration`: `readyState === 'complete'` AND `_fiberRoots.size > 0` 동시 체크 |
| T-13-18 | `dangerouslyRunInProduction: true`는 `mode === 'prod'`일 때만 전달 |

## Known Stubs

| 파일 | 내용 | 이유 |
|------|------|------|
| `packages/react/src/fiber/fiber-adapter-v20.ts` | React 20 adapter TODO stub | React 20 미출시 (2026-04-19 결정). 현재는 bippy getter re-export만 포함. Plan 03 이후 React 20 출시 시 이 파일만 교체하면 identity-index.ts 수정 불필요 |
| `AgruneDevtools.tsx` manifest prop | bridge 경로에서 현재 미사용 | Phase 14 MacroRunner가 manifest를 소비할 예정. `void manifest`로 lint 방지 처리 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vitest 함수 이름 mangling**
- **Found during:** Task 1 identity-index.spec.ts 디버깅
- **Issue:** `function Button() { return null }`을 vitest spec 파일에서 정의하면 bundle scope isolation으로 이름이 `Button2`로 변환됨. `getDisplayName` mock이 `'Button2'`를 반환하여 `getByPath('Button' path)`가 null 반환
- **Fix:** `displayName`을 명시적으로 설정하는 `makeComponentType(name)` 헬퍼 함수 도입. 함수 타입 대신 `{ displayName: string }` 객체를 fiber.type으로 사용
- **Files modified:** `tests/identity-index.spec.ts`
- **Commit:** 1cac7ba

**2. [Rule 1 - Bug] FiberIdentityIndex mock constructor 오류**
- **Found during:** Task 2 identity-bridge.spec.ts 실행
- **Issue:** `vi.fn().mockImplementation(() => ({ ... }))` 패턴은 `new` 키워드와 함께 사용 시 "is not a constructor" TypeError 발생
- **Fix:** `vi.fn().mockImplementation` 대신 플레인 객체를 `as unknown as FiberIdentityIndex`로 캐스팅하는 `makeMockIndex()` 헬퍼로 교체
- **Files modified:** `tests/identity-bridge.spec.ts`
- **Commit:** df1c7c7

### Plan과의 차이 (의도적)

- **identity-bridge.spec.ts 테스트 순서 의존성:** `configurable:false` lock이 한 번 설정되면 jsdom window에서 제거 불가. 테스트들은 test 1에서 lock을 설정하고 이후 테스트들은 이를 전제로 설계함. Plan에서 "각 테스트 간 격리" 권고가 있었으나 `configurable:false` jsdom 제약으로 인해 순서 의존 설계 채택.
- **AgruneDevtools.spec.tsx의 waitForHydration mock:** Plan에서 `_fiberRoots` mock + `readyState` mock을 통해 waitForHydration을 간접 테스트 권고. 실제로는 `waitForHydration` 모듈 자체를 `vi.mock`으로 즉시 resolve되도록 교체. AgruneDevtools 컴포넌트의 waitForHydration 통합 동작은 ssr-barrier.spec.ts에서 독립 검증.

## Regression Check

| 패키지 | Before | After | Delta |
|--------|--------|-------|-------|
| @agrune/manifest | 54 pass | 54 pass | 0 |
| @agrune/runtime | 138 pass | 138 pass | 0 |
| @agrune/react | 0 | 26 pass | +26 |

## Plan 03 Handoff Notes

- `import { AgruneDevtools } from '@agrune/react'` + `<AgruneDevtools manifest={m} mode="dev" />` 1줄로 fiber bridge 활성화 가능.
- Plan 03 React 17/18/19 matrix fixture는 이 패키지를 직접 import. React 17에서는 `@testing-library/react@13.4.0`(devDep에 없음 — Plan 03이 matrix override 담당).
- `fiber-adapter-v20.ts`의 re-export: identity-index.ts가 `bippy`를 직접 import하므로 현재 adapter 교체 불필요. React 20 출시 시 identity-index.ts의 import를 fiber-adapter-v20.ts로 교체하면 됨.

## Self-Check: PASSED

- [x] `packages/react/package.json` — 존재, bippy 0.5.39, peerDeps react ^17||^18||^19
- [x] `packages/react/src/fiber/identity-index.ts` — class FiberIdentityIndex, WeakMap, slice(0,8) 확인
- [x] `packages/react/src/fiber/fiber-adapter-v20.ts` — TODO stub, getDisplayName/getLatestFiber re-export
- [x] `packages/react/src/bridge/identity-bridge.ts` — Object.defineProperty, configurable:false, writable:false
- [x] `packages/react/src/guard/prod-guard.ts` — process.env.AGRUNE_PROD_ENABLED 점 표기법
- [x] `packages/react/src/guard/ssr-barrier.ts` — _fiberRoots, readyState 동시 체크
- [x] `packages/react/src/components/AgruneDevtools.tsx` — isProdEnabled, waitForHydration, FiberIdentityIndex, activateBridge, dangerouslyRunInProduction
- [x] `packages/react/src/index.ts` — AgruneDevtools, FiberIdentityPath, AgruneIdentityBridge export
- [x] `dist/index.js` 4,508 bytes, `dist/index.cjs` 4,567 bytes, `dist/index.d.ts` 2,594 bytes
- [x] `dist/index.d.ts`에 FiberIdentityPath, AgruneDevtools, AgruneIdentityBridge 포함
- [x] 커밋 1cac7ba, df1c7c7 모두 git log에 존재
- [x] @agrune/react 26 tests pass
- [x] @agrune/manifest 54 pass, @agrune/runtime 138 pass (회귀 없음)
- [x] typecheck, build 모두 통과
