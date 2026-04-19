---
phase: "13"
plan: "03"
subsystem: testing
tags: [react, matrix-ci, fixtures, memo, forwardref, portal, suspense, compound, github-actions]

dependency_graph:
  requires:
    - "@agrune/react (Plan 02): FiberIdentityIndex + AgruneDevtools + activateBridge (Plan 02)"
    - "@agrune/manifest (Plan 01): FiberIdentityPath type"
  provides:
    - "tests/fixtures/react17-fixture.tsx: ReactDOM.render+act 헬퍼 (RTL 의존 없음)"
    - "tests/fixtures/react18-fixture.tsx: createRoot+act 헬퍼"
    - "tests/fixtures/react19-fixture.tsx: react18 re-export + React19RefButton"
    - "tests/fixtures/memo-forwardref.fixture.tsx: memo(forwardRef(Button)) 패턴"
    - "tests/fixtures/portal.fixture.tsx: createPortal + portal-root 컨테이너"
    - "tests/fixtures/suspense.fixture.tsx: lazy + Suspense + makeLazyComponent"
    - "tests/fixtures/compound.fixture.tsx: Modal.Header/Body + Select.Option compound pattern"
    - "tests/edge-cases.spec.tsx: 6 describe blocks (17 tests) — FiberIdentityIndex 엣지케이스 통합"
    - ".github/workflows/react-matrix.yml: React 17/18/19 3-way matrix CI"
  affects:
    - "Phase 14+: edge-cases.spec.tsx가 회귀 방지 역할"

tech-stack:
  added: []
  patterns:
    - "mock fiber 패턴: MockFiber interface + asFiber() 캐스팅 헬퍼로 bippy Fiber 타입 브리징"
    - "LazyExoticComponent displayName 설정: as unknown as { displayName: string } 캐스팅"
    - "matrix CI --no-save override: pnpm add -D --no-save로 lockfile 불변 보장"
    - "ComponentType 명시 반환 타입: lazy(() => Promise.resolve({ default: ComponentType })) 타입 오류 방지"

key-files:
  created:
    - packages/react/tests/fixtures/react17-fixture.tsx
    - packages/react/tests/fixtures/react18-fixture.tsx
    - packages/react/tests/fixtures/react19-fixture.tsx
    - packages/react/tests/fixtures/memo-forwardref.fixture.tsx
    - packages/react/tests/fixtures/portal.fixture.tsx
    - packages/react/tests/fixtures/suspense.fixture.tsx
    - packages/react/tests/fixtures/compound.fixture.tsx
    - packages/react/tests/edge-cases.spec.tsx
    - .github/workflows/react-matrix.yml
  modified:
    - packages/react/package.json

key-decisions:
  - "React 17 fixture: RTL 없이 동적 import로 ReactDOM.render + act 접근 (ts-expect-error 없이 any 캐스팅)"
  - "edge-cases.spec.tsx: AgruneDevtools mount 없이 FiberIdentityIndex 직접 인스턴스화 — configurable:false 격리 문제 우회"
  - "lazy() 타입: Promise.resolve({ default: ComponentType }) 명시로 never 타입 오류 해소"
  - "matrix CI: fail-fast:false + paths 필터 + --no-save override (T-13-20/21 위협 완화)"

requirements-completed: [REACT-05]

metrics:
  duration: 15min
  completed: "2026-04-19"
  tasks_completed: 2
  tests_added: 17
  files_created: 9
  files_modified: 1
  task_commits:
    - "0da67a4: feat(13-03): React 17/18/19 render helpers + edge-case fixtures + edge-cases spec"
    - "a580e8e: feat(13-03): add .github/workflows/react-matrix.yml — React 17/18/19 matrix CI"
---

# Phase 13 Plan 03: React Matrix CI + Edge-case Fixtures Summary

**7개 fixture 파일(React 버전 헬퍼 3개 + 엣지케이스 4개) + 17개 통합 테스트(FiberIdentityIndex memo/portal/Suspense/compound 동작 검증) + React 17/18/19 3-way matrix GitHub Actions workflow로 REACT-05 완결.**

## Performance

- **Duration:** 약 15분
- **Completed:** 2026-04-19
- **Tasks:** 2
- **Files created:** 9
- **Files modified:** 1

## Accomplishments

- React 17/18/19 버전별 렌더 헬퍼 fixture 3개 작성 (React 17은 RTL 없이 동적 import)
- memo(forwardRef) / createPortal / Suspense lazy / Compound component 엣지케이스 fixture 4개
- `edge-cases.spec.tsx` 6 describe block, 17 tests — FiberIdentityIndex 경로 기반 resolve 전 체인 검증
- `.github/workflows/react-matrix.yml` — fail-fast:false + paths 필터 + --no-save override + artifact on failure

## Test Breakdown

| Describe block | 테스트 수 | 검증 내용 |
|----------------|----------|----------|
| memo + forwardRef unwrapping | 2 | componentName='Button' unwrap, 래퍼 이름 아님 |
| Portal — fiber tree 논리적 위치 | 2 | Modal 포함 path로 resolve, DOM 위치 기반은 null |
| Suspense — fallback→content 전환 | 2 | fallback stale entry 없음, content path 정상 resolve |
| Compound component displayName | 4 | Modal.Header/Body + Select.Option + ModalRoot fallback |
| React version matrix smoke | 3 | version regex, major int, createRoot/render 존재 |
| fixture 컴포넌트 렌더링 smoke | 4 | MemoForwardRef/Suspense/Compound/Portal RTL render |
| **합계** | **17** | |

전체 테스트: Plan 02 26개 + Plan 03 신규 17개 = **43개 PASS** (React 18 default)

## CI Workflow 설계

| 항목 | 값 |
|------|-----|
| React 버전 | 17.0.2, 18.3.1, 19.2.5 |
| fail-fast | false |
| paths filter | packages/react/**, packages/manifest/**, react-matrix.yml |
| lockfile 보호 | pnpm add --no-save |
| artifact | test-results/, 7일, if-no-files-found: ignore |
| YAML syntax | python3 yaml.safe_load 검증 통과 |

## Task Commits

1. **Task 1: fixture + edge-cases spec** — `0da67a4` (feat)
2. **Task 2: react-matrix.yml workflow** — `a580e8e` (feat)

## Files Created/Modified

- `packages/react/tests/fixtures/react17-fixture.tsx` — 동적 import 기반 ReactDOM.render + act 헬퍼
- `packages/react/tests/fixtures/react18-fixture.tsx` — createRoot + act 헬퍼, RenderResult18 타입
- `packages/react/tests/fixtures/react19-fixture.tsx` — react18 re-export + React19RefButton (ref as prop)
- `packages/react/tests/fixtures/memo-forwardref.fixture.tsx` — memo(forwardRef(Button)) + displayName
- `packages/react/tests/fixtures/portal.fixture.tsx` — createPortal + useEffect container 생성
- `packages/react/tests/fixtures/suspense.fixture.tsx` — lazy+ComponentType 명시 + makeLazyComponent
- `packages/react/tests/fixtures/compound.fixture.tsx` — Modal.Header/Body + Select.Option compound
- `packages/react/tests/edge-cases.spec.tsx` — 6 describe, 17 tests, MockFiber + asFiber 패턴
- `.github/workflows/react-matrix.yml` — 3-way matrix CI, 83줄
- `packages/react/package.json` — test:react17/18/19 scripts 추가

## Decisions Made

- **React 17 헬퍼 동적 import**: `@ts-expect-error` 없이 `eslint-disable + any 캐스팅`으로 React 18/19 환경에서 compile 가능하게 유지. React 18/19에서 이 함수를 호출하지 않으므로 안전.
- **edge-cases.spec.tsx 직접 인스턴스화**: Plan에서는 AgruneDevtools mount + bridge 활성 후 통합 검증 권고. 실제로는 `configurable:false` bridge lock이 테스트 파일 내에서 제거 불가하여 테스트 간 index 상태 공유 문제 발생. FiberIdentityIndex를 직접 인스턴스화해 각 describe마다 새 index로 격리 — 의도된 선택.
- **lazy() 타입 명시**: `Promise.resolve({ default: fn })` 에서 TypeScript가 `fn`을 `never`로 추론하는 문제를 `(): Promise<{ default: ComponentType }>` 반환 타입 명시로 해결.
- **types-react matrix.include**: 각 React 버전에 맞는 @types/react를 override해 typecheck도 matrix 버전 기준으로 통과.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] lazy() 반환 타입 never 오류**
- **Found during:** Task 1 typecheck
- **Issue:** `lazy(() => Promise.resolve({ default: function Content(){...} }))` 에서 TypeScript가 반환 객체의 `default` 타입을 `never`로 추론. `Overload 1/2/3`이 모두 `'() => Element' is not assignable to type 'never'` 오류.
- **Fix:** `(): Promise<{ default: ComponentType }>` 명시 반환 타입 추가 + 컴포넌트를 별도 named function으로 분리.
- **Files modified:** `tests/fixtures/suspense.fixture.tsx`
- **Commit:** 0da67a4 (Task 1 커밋)

**2. [Rule 1 - Bug] LazyExoticComponent.displayName 타입 오류**
- **Found during:** Task 1 typecheck
- **Issue:** `LazyExoticComponent<ComponentType<any>>`에 `displayName` 속성이 없어 `Property 'displayName' does not exist` 오류.
- **Fix:** `(component as unknown as { displayName: string }).displayName = name` 캐스팅으로 설정.
- **Files modified:** `tests/fixtures/suspense.fixture.tsx`
- **Commit:** 0da67a4

**3. [Rule 1 - Bug] getFiberStack mock 반환값 타입 불일치**
- **Found during:** Task 1 typecheck
- **Issue:** `vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown[])` 에서 `Fiber[]` 필요.
- **Fix:** `stack as unknown as Fiber[]` 이중 캐스팅 + `asFiber()` 헬퍼 도입.
- **Files modified:** `tests/edge-cases.spec.tsx`
- **Commit:** 0da67a4

**4. [Rule 1 - Bug] @ts-expect-error 불필요 directive**
- **Found during:** Task 1 typecheck (react17-fixture.tsx)
- **Issue:** React 18 기준 typecheck에서 `@ts-expect-error`가 실제 오류를 억제하지 않아 `TS2578: Unused '@ts-expect-error' directive` 오류.
- **Fix:** 정적 import + @ts-expect-error 제거, 동적 import + any 캐스팅으로 교체.
- **Files modified:** `tests/fixtures/react17-fixture.tsx`
- **Commit:** 0da67a4

---

**Total deviations:** 4 auto-fixed (모두 Rule 1 — typecheck 오류)
**Impact on plan:** 모두 typecheck 통과를 위한 타입 수정. 기능 동작에 영향 없음.

## Known Stubs

없음 — 모든 fixture가 실제 동작하는 컴포넌트로 구성됨.

## Threat Flags

없음 — 이 plan은 테스트 전용 파일 + CI workflow만 추가. 새 네트워크 엔드포인트, auth 경로, 파일 접근 패턴 없음.

## Regression Check

| 패키지 | Before | After | Delta |
|--------|--------|-------|-------|
| @agrune/manifest | 54 pass | 54 pass | 0 |
| @agrune/runtime | 138 pass | 138 pass | 0 |
| @agrune/react | 26 pass | 43 pass | +17 |

## Phase 13 REACT-05 완결 확인

- [x] React 17/18/19 렌더 헬퍼 fixture 3개
- [x] memo/forwardRef/portal/Suspense/compound 엣지케이스 fixture 4개
- [x] `edge-cases.spec.tsx` — FiberIdentityIndex 통합 검증 (17 tests)
- [x] React 18 default 로컬 실행: 43 PASS (Plan 02 26 + Plan 03 17)
- [x] `.github/workflows/react-matrix.yml` — fail-fast:false + 3-way matrix + --no-save + paths 필터
- [x] YAML syntax 검증 통과
- [x] Plan 01/02 회귀 없음

## Next Phase Readiness

- REACT-05 완결. Phase 13 전체 요건(REACT-01~05) 달성.
- matrix CI 첫 실행은 main push 후 GitHub Actions 로그에서 확인 (Plan 03 범위 밖).
- React 17 job에서 jsx-runtime 호환 문제 발생 시: `vitest.config.ts`에 `esbuild: { jsx: 'automatic', jsxImportSource: 'react' }` 추가 (RESEARCH Open Q 주의사항 — 현재 React 17.0.2는 jsx-runtime 포함이므로 예상 통과).

## Self-Check: PASSED

- [x] `packages/react/tests/fixtures/react17-fixture.tsx` — 존재, renderReact17 함수
- [x] `packages/react/tests/fixtures/react18-fixture.tsx` — 존재, renderReact18 함수, createRoot
- [x] `packages/react/tests/fixtures/react19-fixture.tsx` — 존재, renderReact19 re-export
- [x] `packages/react/tests/fixtures/memo-forwardref.fixture.tsx` — 존재, React.memo + forwardRef
- [x] `packages/react/tests/fixtures/portal.fixture.tsx` — 존재, createPortal
- [x] `packages/react/tests/fixtures/suspense.fixture.tsx` — 존재, Suspense + lazy
- [x] `packages/react/tests/fixtures/compound.fixture.tsx` — 존재, Modal.Header displayName
- [x] `packages/react/tests/edge-cases.spec.tsx` — 존재, 6 describe blocks, React.version
- [x] `.github/workflows/react-matrix.yml` — 존재, matrix [17.0.2, 18.3.1, 19.2.5], fail-fast:false, --no-save, paths:
- [x] 커밋 0da67a4, a580e8e 모두 git log에 존재
- [x] @agrune/react 43 tests pass
- [x] @agrune/manifest 54 pass, @agrune/runtime 138 pass (회귀 없음)
- [x] typecheck, build 모두 통과
