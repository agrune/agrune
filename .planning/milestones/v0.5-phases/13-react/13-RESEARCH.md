# Phase 13: REACT - Research

**Researched:** 2026-04-19
**Domain:** React fiber instrumentation / component-identity bridge / prod guard / SSR hydration
**Confidence:** HIGH (bippy API: VERIFIED from npm registry + type defs; React matrix: VERIFIED; SelectorLadder extension: VERIFIED from codebase; prod guard pattern: ASSUMED)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `bippy` = React fiber 접근 단일 신규 의존성 (PROJECT.md 2026-04-19 결정)
- React 17/18/19 matrix CI. React 20 대비 `fiber-adapter-v20.ts` 자리만 Phase 13에서 마련.
- Prod guard 2단계: `AGRUNE_PROD_ENABLED=true` env + `localStorage['agrune.prod.consent']` token.
- SSR hydration barrier: `readyState === 'complete'` + root fiber 존재.
- `Object.defineProperty(writable:false, configurable:false)` lock — Phase 11/12에서 `__agrune_runtime_state__` 패턴 확정.
- Upstream from Phase 11+12 locked:
  - `@agrune/manifest` SDK v3 타입 + zod validator
  - PageSnapshot `schemaVersion: 3`, `selector: SelectorLadder`
  - `CdpRuntimeInjector` `prepareSession({ preloadManifest })` + `reloadRuntime` debounce
  - `BrowserDriver.injectManifest(tabId, manifest)` 활성
  - `window.__agrune_runtime_state__` tamper-proof 이미 존재

### Claude's Discretion
모든 구현 선택은 Claude의 재량. discuss 생략.

### Deferred Ideas (OUT OF SCOPE)
없음 — discuss 건너뜀.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REACT-01 | `bippy` 통합 — DOM ↔ Fiber, `FiberIdentityIndex` (path descriptor 기반, 참조 아님) 빌드 | bippy 0.5.39 API VERIFIED: `getFiberFromHostInstance`, `getDisplayName`, `getType`, `getFiberStack`, `instrument`, `secure`, `traverseRenderedFibers` |
| REACT-02 | `window.__agrune_identity__` bridge가 `Object.defineProperty` lock으로 runtime에 publish | Phase 11/12 `__agrune_runtime_state__` 패턴 직접 재사용 가능 |
| REACT-03 | SSR hydration barrier — `readyState` + root fiber 존재 확인 후 bridge activate | `document.readyState === 'complete'` + `_fiberRoots` Set 확인 패턴 VERIFIED |
| REACT-04 | 2단계 prod guard — `AGRUNE_PROD_ENABLED` 빌드 env + `localStorage['agrune.prod.consent']` 런타임 token 동시 통과해야 활성화 | bundler dead-code-elim 패턴 ASSUMED (구체적 테스트 필요) |
| REACT-05 | React 17/18/19 matrix CI fixture + memo/forwardRef/portal/Suspense 엣지케이스 전부 pass | vitest + pnpm workspace matrix 전략 VERIFIED |
</phase_requirements>

---

## Summary

Phase 13은 `packages/react/` 신규 패키지를 생성해 `@agrune/react`를 배포한다. 핵심은 세 가지다: (1) `bippy 0.5.39`를 통한 React fiber 인스트루먼테이션으로 DOM 요소에서 컴포넌트 identity path를 추출하는 `FiberIdentityIndex`, (2) `<AgruneDevtools />` React 컴포넌트가 mount 시 `window.__agrune_identity__`를 lock-publish하는 bridge, (3) prod 번들에서 dead-code-elim 친화적 2단계 guard.

`bippy`의 핵심 작동 방식은 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`을 monkey-patch해 React reconciler의 commit event를 가로채는 것이다. `secure()` wrapper가 production build에서 자동 skip하지만, Phase 13의 2단계 prod guard는 그보다 더 세밀하게 제어해야 한다: `AGRUNE_PROD_ENABLED=true`인 prod 번들 + `localStorage` token을 모두 통과한 경우에만 활성화.

SelectorLadder에 `fiber` 전략을 추가하는 것은 `schema.ts`의 `AtLeastOne<T>` 타입을 확장하고, `TargetResolver`에 `resolveByFiber` 경로를 별도 레이어로 추가하는 방식이 가장 안전하다. CSS ladder와의 우선순위는 fiber > CSS ladder 순서가 맞다 (fiber path는 refactor에 안정적이므로).

**Primary recommendation:** `bippy`의 `instrument(secure({...}))` + `getFiberFromHostInstance` + `getFiberStack` + `getDisplayName` 조합으로 FiberIdentityIndex를 구성한다. SelectorLadder 확장은 optional field로 추가해 breaking change를 최소화한다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| FiberIdentityIndex 빌드 | Frontend (page runtime) | — | bippy는 브라우저 DOM context에서만 동작 |
| `window.__agrune_identity__` lock-publish | Frontend (page runtime) | — | `Object.defineProperty`는 브라우저 전용 |
| `<AgruneDevtools />` 컴포넌트 | Frontend (React component) | — | React useEffect/useSyncExternalStore는 React 런타임 필요 |
| 2단계 prod guard 빌드 env 체크 | Frontend (bundler 빌드 타임) | — | `process.env.AGRUNE_PROD_ENABLED`는 bundler가 상수로 교체 |
| 2단계 prod guard 런타임 token | Frontend (page runtime) | — | `localStorage` 접근은 브라우저에서만 가능 |
| SSR hydration barrier | Frontend (page runtime) | — | `document.readyState` + fiber root 체크는 브라우저 전용 |
| SelectorLadder fiber 전략 추가 | Schema layer (`@agrune/manifest`) + Runtime (`@agrune/runtime`) | — | schema 정의와 resolver 양쪽 모두 수정 필요 |
| React 17/18/19 matrix CI | CI (GitHub Actions) | pnpm workspace | 각 React 버전별 독립 테스트 환경 필요 |
| `window.__agrune_identity__.resolve()` | Frontend (page runtime) | — | DOM → fiber → HTMLElement 역방향 resolve는 browser only |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bippy` | `0.5.39` | React fiber instrumentation | 유일한 공식 결정 의존성; `__REACT_DEVTOOLS_GLOBAL_HOOK__` monkey-patch 방식으로 React 수정 없이 fiber 접근 가능. ~4kb gzipped [VERIFIED: npm registry] |
| `react` | `^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0` | peerDependency | 세 메이저 버전 matrix CI 대상 [VERIFIED: npm registry] |
| `tsup` | `^8.5.1` | 패키지 번들러 | 기존 `@agrune/manifest`와 동일 (이미 workspace에서 사용 중) [VERIFIED: codebase] |
| `vitest` | `^4.0.0` | 단위 테스트 | 기존 패키지들과 통일 [VERIFIED: codebase] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/react` | `17.0.x / 18.x / 19.x` | TypeScript 타입 | 각 matrix 분기별 devDependency |
| `@testing-library/react` | `^16.x` (React 18/19) / `^13.x` (React 17) | 컴포넌트 테스트 | `<AgruneDevtools />` 마운트 테스트. React 17은 v16 미지원: v13.4.0 사용 [VERIFIED: npm registry] |
| `react-dom` | 각 matrix 버전 | ReactDOM.render / createRoot | 테스트 픽스처의 React 마운트 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bippy` | 직접 `__REACT_DEVTOOLS_GLOBAL_HOOK__` patch | 유지보수 비용 높고 React 버전별 내부 API 변화 대응 불가. bippy가 이미 추상화 제공 |
| `useSyncExternalStore` | `useState` + `useEffect` | `useSyncExternalStore`는 SSR에서 hydration tearing 방지 가능하나 bridge activate 로직이 복잡해짐. `useEffect`가 더 단순하고 SSR 배리어는 별도로 구현 |
| ESM only | ESM + CJS dual | 기존 `@agrune/manifest`는 ESM only지만 `@agrune/react`는 CJS도 필요 (CRA, Jest 환경 등). tsup `format: ['esm', 'cjs']` 설정 추가 |

**Installation (Phase 13 신규 패키지):**
```bash
# packages/react/ 패키지 자체의 devDependency
pnpm --filter @agrune/react add -D bippy react@18 react-dom@18 @types/react@18 @types/react-dom@18 @testing-library/react

# matrix 테스트 시 pnpm override 또는 별도 workspace 사용
```

**Version verification (2026-04-19 기준):**
- `bippy`: `0.5.39` [VERIFIED: npm registry]
- React 17 latest: `17.0.2`, React 18 latest: `18.3.1`, React 19 latest: `19.2.5` [VERIFIED: npm registry]
- `@testing-library/react`: `16.3.2` (React 18/19 지원), `13.4.0` (React 17 지원) [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
Author 코드
  │
  └─ import '@agrune/react'
       │
       ├─ [빌드 타임] bundler가 AGRUNE_PROD_ENABLED 체크
       │    ├─ false → 전체 bridge 코드 dead-code-elim
       │    └─ true  → bridge 코드 포함
       │
  <AgruneDevtools manifest={m} mode="dev|prod" />
       │
       └─ useEffect (mount)
            │
            ├─ [Guard 1] mode==='prod': AGRUNE_PROD_ENABLED + localStorage token 체크
            │    └─ 실패 → no-op 리턴
            │
            ├─ [Guard 2] SSR barrier: readyState === 'complete' + _fiberRoots 존재
            │    └─ 실패 → DOMContentLoaded / load 이벤트 대기
            │
            ├─ bippy instrument(secure({ onCommitFiberRoot }))
            │    │
            │    └─ React reconciler commit 마다 호출
            │         │
            │         └─ traverseRenderedFibers(root, fiber =>
            │              │   getDisplayName + getType 추출
            │              │   getFiberStack → path descriptor 생성
            │              └─  FiberIdentityIndex.set(stateNode, descriptor)
            │
            └─ Object.defineProperty(window, '__agrune_identity__', {
                 value: { resolve(path) → HTMLElement | null },
                 writable: false, configurable: false
               })

DOM 요소 → fiber 역방향:
  window.__agrune_identity__.resolve(path: FiberIdentityPath)
       │
       └─ FiberIdentityIndex.getByPath(path) → HTMLElement | null
            (displayName + key props + indexPath 일치 검색)

TargetResolver (packages/runtime):
  resolveByLadder(ladder)
    └─ ladder.fiber 있으면
         └─ window.__agrune_identity__.resolve(ladder.fiber.path)
              (fiber 전략 우선, CSS ladder 폴백)
```

### Recommended Project Structure

```
packages/react/
├── package.json          # peerDependencies: react ^17||^18||^19
├── tsconfig.json         # lib: ['ES2022', 'DOM']
├── tsup.config.ts        # format: ['esm', 'cjs'], dts: true
├── vitest.config.ts
├── src/
│   ├── index.ts          # public barrel (AgruneDevtools, FiberIdentityIndex 타입만)
│   ├── components/
│   │   └── AgruneDevtools.tsx   # <AgruneDevtools manifest mode />
│   ├── fiber/
│   │   ├── identity-index.ts    # FiberIdentityIndex class
│   │   ├── path-descriptor.ts   # FiberIdentityPath 타입 + buildPath()
│   │   └── fiber-adapter-v20.ts # React 20 대비 stub (빈 파일 + TODO comment)
│   ├── bridge/
│   │   └── identity-bridge.ts   # activateBridge() + Object.defineProperty lock
│   └── guard/
│       └── prod-guard.ts        # isProdEnabled() 체크 로직
└── tests/
    ├── fixtures/
    │   ├── react17-fixture.tsx  # React 17 렌더 헬퍼
    │   ├── react18-fixture.tsx  # React 18 createRoot 헬퍼
    │   ├── react19-fixture.tsx  # React 19 (동일 createRoot)
    │   ├── memo-forwardref.fixture.tsx
    │   ├── portal.fixture.tsx
    │   ├── suspense.fixture.tsx
    │   └── compound.fixture.tsx
    ├── identity-index.spec.ts
    ├── prod-guard.spec.ts
    ├── ssr-barrier.spec.ts
    └── AgruneDevtools.spec.tsx
```

### Pattern 1: bippy instrument + FiberIdentityIndex 빌드

**What:** `onCommitFiberRoot` 훅에서 렌더된 fiber를 순회해 DOM 노드 → path descriptor 매핑을 유지.
**When to use:** `<AgruneDevtools />` 마운트 시 1회 호출, 이후 React 리렌더마다 자동 업데이트.

```typescript
// Source: bippy 0.5.39 type defs (VERIFIED), README (VERIFIED)
import {
  instrument,
  secure,
  traverseRenderedFibers,
  getFiberFromHostInstance,
  getDisplayName,
  getType,
  getFiberStack,
  getLatestFiber,
  isHostFiber,
  isCompositeFiber,
} from 'bippy'

instrument(
  secure({
    onCommitFiberRoot(_rendererID, root) {
      traverseRenderedFibers(root, (fiber, phase) => {
        if (phase === 'unmount') {
          // stateNode가 DOM이면 인덱스에서 제거
          if (isHostFiber(fiber) && fiber.stateNode instanceof HTMLElement) {
            index.delete(fiber.stateNode)
          }
          return
        }
        if (!isHostFiber(fiber)) return
        const domNode = fiber.stateNode
        if (!(domNode instanceof HTMLElement)) return

        // 최신 fiber 참조 (double-buffering 대응)
        const latest = getLatestFiber(fiber)
        const stack = getFiberStack(latest)
        const path = buildFiberPath(stack) // path descriptor 생성
        index.set(domNode, path)
      })
    },
  })
)
```

### Pattern 2: FiberIdentityPath descriptor 구조

**What:** DOM 노드를 식별하는 직렬화 가능한 경로 배열. 참조(fiber object)가 아닌 값(displayName + key + index)으로 저장.
**When to use:** `FiberIdentityIndex`가 path를 저장하고, `TargetResolver.resolveByFiber`가 path로 HTMLElement를 찾을 때.

```typescript
// Source: CONTEXT.md specifics + bippy API (VERIFIED)
export interface FiberPathSegment {
  /** getDisplayName(fiber.type) — null이면 '' */
  componentName: string
  /** fiber.key (React key prop) — null이면 null */
  key: string | null
  /** fiber.index (sibling 순서) */
  index: number
}

/** DOM 노드에서 React root 방향으로의 경로 (index 0 = 해당 컴포넌트, 마지막 = root 근처) */
export type FiberIdentityPath = FiberPathSegment[]

function buildFiberPath(stack: Fiber[]): FiberIdentityPath {
  return stack
    .filter(isCompositeFiber)       // host fiber, text fiber 제외
    .map(f => ({
      componentName: getDisplayName(f.type) ?? '',
      key: f.key,
      index: f.index,
    }))
    .slice(0, 8)                    // 최대 8 레벨 (deep tree 방어)
}
```

**직렬화:** `JSON.stringify(path)` 가능 — string, null, number만 포함.

### Pattern 3: memo(forwardRef(...)) displayName 처리

**What:** `React.memo`와 `React.forwardRef`는 fiber type을 래핑한다. `getType(fiber.type)`이 내부 컴포넌트를 unwrap한다.
**When to use:** FiberIdentityIndex 빌드 시 componentName 추출.

```typescript
// Source: bippy getDisplayName 구현 (VERIFIED from README)
// bippy의 getDisplayName은 이미 memo/forwardRef 래핑을 투과적으로 처리함.
// MemoComponentTag(14), SimpleMemoComponentTag(15), ForwardRefTag(11) 모두 커버.
const name = getDisplayName(fiber.type) // memo(forwardRef(Button)) → 'Button'

// 주의: React 19에서는 forwardRef 불필요 (ref를 prop으로 직접 받음)
// 그러나 기존 React 17/18 코드와 호환을 위해 getDisplayName이 모든 버전 처리
```

**fiber tag 상수 (VERIFIED from core.d.ts):**
```typescript
import {
  MemoComponentTag,       // 14
  SimpleMemoComponentTag, // 15
  ForwardRefTag,          // 11
  SuspenseComponentTag,   // 13
  HostRootTag,            // 3
  HostComponentTag,       // 5 (DOM 요소)
  FragmentTag,            // 7
} from 'bippy'
```

### Pattern 4: `window.__agrune_identity__` lock-publish

**What:** Phase 11/12의 `__agrune_runtime_state__` 패턴과 동일하게 `Object.defineProperty`로 tamper-proof 게시.
**When to use:** `<AgruneDevtools />` mount useEffect 내, 모든 guard 통과 후 1회 실행.

```typescript
// Source: Phase 11/12 패턴 (VERIFIED from codebase)
function publishIdentityBridge(index: FiberIdentityIndex): void {
  if (Object.getOwnPropertyDescriptor(window, '__agrune_identity__')?.configurable === false) {
    return // 이미 게시됨 (StrictMode 이중 호출 방어)
  }
  Object.defineProperty(window, '__agrune_identity__', {
    value: {
      resolve(path: FiberIdentityPath): HTMLElement | null {
        return index.getByPath(path)
      },
      version: '1' as const,
    },
    writable: false,
    configurable: false,
    enumerable: false,
  })
}
```

### Pattern 5: 2단계 prod guard (dead-code-elim 친화)

**What:** bundler가 `process.env.AGRUNE_PROD_ENABLED !== 'true'`를 상수로 교체해 전체 블록을 제거 가능하도록 구성.
**When to use:** `@agrune/react` entry 최상단 early return.

```typescript
// Source: [ASSUMED] bundler dead-code-elim 패턴 (webpack/rollup/vite/esbuild 공통)
// process.env.AGRUNE_PROD_ENABLED 는 정확히 이 문자열이어야 bundler가 상수로 교체함.
// process.env['AGRUNE_PROD_ENABLED'] 형태는 일부 bundler에서 정적 분석 불가.

function isProdEnabled(): boolean {
  // Guard 1: 빌드 env (bundler가 이 블록 전체를 dead-code-elim)
  if (process.env.AGRUNE_PROD_ENABLED !== 'true') return false
  // Guard 2: 런타임 localStorage token
  try {
    return localStorage.getItem('agrune.prod.consent') === 'true'
  } catch {
    return false // SSR / localStorage 접근 불가 환경
  }
}
```

**모드별 동작 요약:**
| 상황 | Guard 1 | Guard 2 | 결과 |
|------|---------|---------|------|
| mode="dev", AGRUNE_PROD_ENABLED 없음 | dev는 guard 적용 안 함 | — | 항상 활성 |
| mode="prod", env 없음 | false → no-op | 미도달 | no-op |
| mode="prod", env=true, token 없음 | true | false | no-op |
| mode="prod", env=true, token=true | true | true | 활성 |

### Pattern 6: SSR hydration barrier

**What:** `document.readyState` 체크 + bippy `_fiberRoots` Set이 비어있지 않은 경우에만 bridge 활성화.
**When to use:** useEffect 내에서 bridge 활성화 전 체크.

```typescript
// Source: bippy 0.5.39 type defs (_fiberRoots VERIFIED), readyState pattern [ASSUMED]
import { _fiberRoots } from 'bippy'

function waitForHydration(): Promise<void> {
  return new Promise(resolve => {
    function check() {
      if (document.readyState === 'complete' && _fiberRoots.size > 0) {
        resolve()
        return
      }
      // 아직 미완: load 이벤트 대기
      window.addEventListener('load', function handler() {
        window.removeEventListener('load', handler)
        // load 이후 한 번 더 tick 기다려 React hydration 완료 보장
        setTimeout(resolve, 0)
      }, { once: true })
    }
    check()
  })
}
```

**주의:** `_fiberRoots`는 bippy 내부 Set (exported). `_renderers` Map과 함께 사용 가능.

### Pattern 7: portal과 Suspense fiber 처리

**What:** `createPortal`은 별도 DOM container에 렌더하지만 fiber tree는 원래 위치에 유지됨. Suspense fallback fiber는 별도 처리 필요.
**When to use:** FiberIdentityIndex 빌드 시 edge case 처리.

```typescript
// Source: [ASSUMED] React fiber 내부 구조 지식
// Portal: fiber.tag === HostRootTag가 아닌 다른 위치에 stateNode가 연결됨.
// FiberStack 추적 시 PortalTag를 건너뛰면 자연스럽게 logical tree 위치가 유지됨.

// Suspense: SuspenseComponentTag(13) fiber는 fallback/content 두 분기가 있음.
// dehydrated Suspense: DehydratedSuspenseComponentTag(18)
// 일반적으로 suspended 상태의 fallback fiber는 componentName='Suspense'로 표시되며
// content가 렌더되면 실제 컴포넌트 fiber가 나타남.

// compound component (예: Modal.Header, Select.Option):
// fiber type이 함수이면 getDisplayName이 함수명 반환.
// 명시적 displayName 설정한 경우 우선.
```

### Anti-Patterns to Avoid

- **fiber 참조 직접 저장:** `FiberIdentityIndex`에 `Fiber` 객체를 저장하면 GC 방해 + alternate 버전 혼선. 항상 path descriptor(값 타입)로 저장.
- **`new WeakMap<Fiber, ...>()`로 fiber identity 추적:** React가 alternate fiber를 생성할 때 WeakMap key가 바뀜. `stateNode(HTMLElement) → path` 방향으로 저장해야 함.
- **`instrument()` 중복 호출:** StrictMode에서 컴포넌트가 두 번 마운트됨. `configurable: false` 체크로 이중 게시 방지.
- **`process.env['AGRUNE_PROD_ENABLED']` 동적 키 접근:** 일부 bundler(특히 esbuild)가 정적 분석을 못해 dead-code-elim 실패. 항상 `process.env.AGRUNE_PROD_ENABLED` 점 표기법 사용.
- **SSR에서 `localStorage` 직접 접근:** try/catch 없이 접근하면 Next.js SSR에서 ReferenceError. 항상 try/catch 래핑.
- **`getType(fiber)` 없이 `fiber.type` 직접 사용:** memo/forwardRef 래핑된 경우 inner component를 못 얻음. `getType(fiber.type)` 또는 `getDisplayName(fiber.type)` 사용.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| React fiber 접근 | 직접 `__REACT_DEVTOOLS_GLOBAL_HOOK__` patch | `bippy instrument()` | React 버전별 hook signature 변화, renderers Map 처리, production vs development build 감지가 복잡 |
| fiber double-buffering | `fiber.alternate` 직접 추적 | `bippy getLatestFiber()` | commit 중에 alternate가 교체됨. bippy가 이미 처리 |
| memo/forwardRef unwrap | `fiber.type.$$typeof` 직접 검사 | `bippy getDisplayName()` / `getType()` | React 버전별 $$typeof 심볼이 다름 |
| host fiber 탐색 | `fiber.child` 수동 순회 | `bippy getNearestHostFiber()` | stateNode가 null인 중간 fiber 건너뛰기가 복잡 |
| bundle tree shaking | 직접 구현 | `process.env.AGRUNE_PROD_ENABLED` 정점 표기법 | bundler(webpack/rollup/vite/esbuild)가 해당 패턴을 상수로 교체 |
| React 컴포넌트 테스트 마운트 | 직접 ReactDOM.render | `@testing-library/react render()` | React 17/18/19 API 차이 추상화 + act() 래핑 자동화 |

**Key insight:** bippy는 React DevTools가 쓰는 동일한 내부 API를 사용해 매우 안정적임. 단, `secure()` wrapper 없이 `instrument()`를 쓰면 production build crash 위험.

---

## Common Pitfalls

### Pitfall 1: bippy를 React 임포트보다 늦게 로드

**What goes wrong:** `instrument()`가 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`을 patch하기 전에 React가 hook을 읽으면 인스트루먼테이션이 동작 안 함.
**Why it happens:** React는 bundle load 최초 실행 시 `__REACT_DEVTOOLS_GLOBAL_HOOK__`을 읽음. bippy import가 늦으면 이미 React가 native hook을 참조한 후.
**How to avoid:** `@agrune/react`의 entry point에서 `import 'bippy'`를 (또는 `import { instrument } from 'bippy'`) React import보다 먼저 배치. 단, `<AgruneDevtools />`는 React 컴포넌트이므로 실제로는 app entry(main.tsx)에서 `import '@agrune/react'`가 React import보다 앞에 와야 함.
**Warning signs:** `onCommitFiberRoot`가 한 번도 호출되지 않음. `isInstrumentationActive()` returns false.

### Pitfall 2: StrictMode 이중 mount

**What goes wrong:** React 18 StrictMode는 개발 모드에서 컴포넌트를 두 번 mount/unmount. `useEffect`가 두 번 실행되어 `Object.defineProperty`가 두 번 호출됨.
**Why it happens:** StrictMode의 concurrent mode 시뮬레이션.
**How to avoid:** `publishIdentityBridge` 시작 시 `Object.getOwnPropertyDescriptor(window, '__agrune_identity__')?.configurable === false` 체크로 이중 게시 방지 (이미 Pattern 4에 포함).

### Pitfall 3: portal DOM 노드의 fiber path

**What goes wrong:** `createPortal(children, container)` 렌더 시 stateNode(DOM)는 `container` 안에 있지만 fiber tree는 portal을 호출한 컴포넌트 아래에 있음. `getFiberStack`은 fiber tree 기준이므로 DOM 위치와 불일치.
**Why it happens:** React portal은 의도적으로 DOM 위치와 fiber tree 위치를 분리함.
**How to avoid:** FiberIdentityPath는 DOM 위치가 아닌 fiber tree 위치 기반이므로 portal은 별도 처리 없이 자연스럽게 논리적 위치로 resolve됨. 이를 fixture 테스트로 검증해야 함.

### Pitfall 4: SSR에서 bridge 조기 활성화

**What goes wrong:** Next.js App Router에서 Server Component가 HTML을 스트리밍하는 동안 Client Component가 hydrate되기 전 bridge가 활성화됨. `_fiberRoots`가 partial tree를 가리킴.
**Why it happens:** `useEffect`는 hydration 완료 후 실행되지만, SSR 환경에서 readyState가 이미 'complete'인 경우 fiber tree가 완전하지 않을 수 있음.
**How to avoid:** `document.readyState === 'complete'` + `_fiberRoots.size > 0` 두 조건 모두 확인. Next.js App Router fixture에서 실제 hydration 완료 순서 테스트.

### Pitfall 5: CJS/ESM 혼용 환경에서 peerDependency 충돌

**What goes wrong:** CRA(CJS 기반) 환경에서 ESM only `@agrune/react`를 import하면 실패.
**Why it happens:** `@agrune/manifest`는 ESM only로 설계됐지만, `@agrune/react`는 더 광범위한 사용자 환경 지원 필요.
**How to avoid:** tsup `format: ['esm', 'cjs']` 설정. package.json `exports` 필드에 `require`/`import` 조건 분기.

### Pitfall 6: React 17/18 peerDependency 선언의 npm 경고

**What goes wrong:** `peerDependencies: { react: ">=17.0.1" }` 선언 시 npm이 React 20에서도 허용해 fiber API 변경으로 런타임 실패 가능.
**Why it happens:** semver range가 너무 넓음.
**How to avoid:** `"react": "^17.0.0 || ^18.0.0 || ^19.0.0"` (상한선 포함). `fiber-adapter-v20.ts` stub에 TODO 주석으로 React 20 대비 명시.

### Pitfall 7: `secure()` 기본 production guard vs. Phase 13 prod guard 혼동

**What goes wrong:** bippy의 `secure()` wrapper는 production React build (`bundleType: 1`)를 감지해 자동 skip함. Phase 13의 2단계 prod guard는 별개임.
**Why it happens:** `secure()` 기본 동작은 production React에서 bippy 전체를 비활성화함. 그러나 Phase 13은 AGRUNE_PROD_ENABLED + localStorage token으로 production React에서도 선택적으로 활성화 가능해야 함.
**How to avoid:** `secure({ dangerouslyRunInProduction: true })` 옵션을 AGRUNE_PROD_ENABLED=true일 때 사용. 또는 production guard를 bippy 외부에서 처리하고 guard 통과 후에만 `instrument` 호출.

---

## Code Examples

### FiberIdentityIndex 전체 구조

```typescript
// Source: bippy 0.5.39 API (VERIFIED) + Phase 13 설계 패턴
import {
  isHostFiber,
  isCompositeFiber,
  getDisplayName,
  getFiberStack,
  getLatestFiber,
  type Fiber,
  type FiberIdentityPath,   // 직접 정의할 타입
} from 'bippy'

export interface FiberPathSegment {
  componentName: string
  key: string | null
  index: number
}
export type FiberIdentityPath = FiberPathSegment[]

export class FiberIdentityIndex {
  // HTMLElement → path descriptor (참조 아님)
  private readonly domToPath = new WeakMap<HTMLElement, FiberIdentityPath>()
  // path JSON string → HTMLElement 역방향 (WeakRef 사용으로 GC 허용)
  private readonly pathToRef = new Map<string, WeakRef<HTMLElement>>()

  indexFiber(fiber: Fiber): void {
    if (!isHostFiber(fiber)) return
    const dom = fiber.stateNode
    if (!(dom instanceof HTMLElement)) return
    const latest = getLatestFiber(fiber)
    const stack = getFiberStack(latest)
    const path = this.buildPath(stack)
    const key = JSON.stringify(path)
    this.domToPath.set(dom, path)
    this.pathToRef.set(key, new WeakRef(dom))
  }

  deindexFiber(fiber: Fiber): void {
    if (!isHostFiber(fiber)) return
    const dom = fiber.stateNode
    if (!(dom instanceof HTMLElement)) return
    const path = this.domToPath.get(dom)
    if (path) {
      this.pathToRef.delete(JSON.stringify(path))
      this.domToPath.delete(dom)
    }
  }

  getByPath(path: FiberIdentityPath): HTMLElement | null {
    const ref = this.pathToRef.get(JSON.stringify(path))
    return ref?.deref() ?? null
  }

  private buildPath(stack: Fiber[]): FiberIdentityPath {
    return stack
      .filter(isCompositeFiber)
      .slice(0, 8)
      .map(f => ({
        componentName: getDisplayName(f.type) ?? '',
        key: f.key,
        index: f.index,
      }))
  }
}
```

### SelectorLadder에 fiber 전략 추가

```typescript
// Source: packages/manifest/src/schema.ts (VERIFIED) + Phase 13 설계
// 기존 AtLeastOne<T>에 fiber 필드 추가 → optional이므로 breaking change 없음

// schema.ts 변경:
export type SelectorLadder = AtLeastOne<{
  role: { name: string; level?: string }
  text: string
  testId: string
  attr: string
  css: string
  fiber: { path: FiberIdentityPath }  // ← 신규 optional 필드
}>

// zod schema 변경:
export const SelectorLadderSchema = z
  .object({
    role: ...,
    text: ...,
    testId: ...,
    attr: ...,
    css: ...,
    fiber: z.object({
      path: z.array(z.object({
        componentName: z.string(),
        key: z.string().nullable(),
        index: z.number().int().nonneg(),
      })).min(1).max(8),
    }).optional(),  // ← optional이므로 기존 manifest 전부 유효
  })
  .refine(
    v => Boolean(v.role || v.text || v.testId || v.attr || v.css || v.fiber),
    { message: 'SelectorLadder must define at least one of: role, text, testId, attr, css, fiber' }
  )
```

### TargetResolver.resolveByFiber 추가

```typescript
// Source: packages/runtime/src/runtime/target-resolver.ts (VERIFIED) + Phase 13 설계
// 기존 resolveByLadder에 fiber 전략을 최우선으로 추가

export function resolveByLadder(
  ladder: SelectorLadder,
  doc: Document = document,
): HTMLElement[] {
  // fiber 전략 최우선 (CSS 불변성보다 fiber path가 refactor에 안정적)
  if (ladder.fiber) {
    const identity = (window as any).__agrune_identity__
    if (identity && typeof identity.resolve === 'function') {
      const el = identity.resolve(ladder.fiber.path) as HTMLElement | null
      if (el) return [el]
    }
    // fiber resolve 실패 시 CSS ladder 폴백 (fiber 없는 환경 대비)
  }
  // 기존 CSS ladder 경로 (role > text > testId > attr > css)
  if (ladder.role) { ... }
  ...
}
```

### React 17/18/19 matrix CI 설계

```yaml
# Source: [ASSUMED] GitHub Actions matrix 패턴 + 기존 ci.yml 구조 (VERIFIED)
# .github/workflows/react-matrix.yml

jobs:
  react-matrix:
    name: react matrix (React ${{ matrix.react }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        react: ['17.0.2', '18.3.1', '19.2.5']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Override React version
        run: |
          pnpm --filter @agrune/react add -D \
            react@${{ matrix.react }} \
            react-dom@${{ matrix.react }} \
            @types/react@$(echo ${{ matrix.react }} | cut -d. -f1) \
            --no-frozen-lockfile
      - name: Build
        run: pnpm --filter @agrune/react run build
      - name: Test with React ${{ matrix.react }}
        run: pnpm --filter @agrune/react run test
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React DevTools 직접 monkey-patch | `bippy instrument()` 추상화 | 2023~ | React 버전별 호환성 자동 처리 |
| `React.forwardRef` 필수 (ref prop) | React 19에서 ref를 일반 prop으로 전달 가능 | React 19 (2024) | forwardRef wrapper 불필요해지지만 기존 코드 호환 필요 |
| `ReactDOM.render()` | `ReactDOM.createRoot()` | React 18 (2022) | React 17 fixture와 18/19 fixture를 분리해야 함 |
| `fiber._debugSource` (React 18) | React 19 compiler metadata | React 19 (2024) | source mapping 방식 변화. bippy/source가 추상화 |

**Deprecated/outdated:**
- `ReactDOM.render()`: React 18에서 deprecated, React 19에서 제거됨. fixture에서 버전별 분기 필요.
- `forwardRef` wrapper: React 19에서 불필요. 그러나 17/18 호환을 위해 테스트 fixture에 포함해야 함.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `process.env.AGRUNE_PROD_ENABLED` 점 표기법이 webpack/rollup/vite/esbuild 모두에서 dead-code-elim 동작 | Pattern 5 (prod guard) | 일부 bundler에서 guard가 제거되지 않아 bundle size 증가. 기능은 영향 없음 |
| A2 | `document.readyState === 'complete'` + `_fiberRoots.size > 0` 조합이 SSR hydration 완료를 신뢰성 있게 감지 | Pattern 6 (SSR barrier) | Remix streaming 같은 partial hydration 시나리오에서 조기 활성화 가능 |
| A3 | `bippy _fiberRoots` Set이 public API로 안정적으로 export됨 | Pattern 6 (SSR barrier) | bippy 내부 변경 시 SSR barrier 구현 수정 필요. bippy 0.5.39에서 VERIFIED이나 이후 버전에서 제거 가능 |
| A4 | pnpm matrix 테스트 시 `--no-frozen-lockfile`로 React 버전 override가 다른 패키지에 영향 없음 | CI matrix 설계 | workspace 의존성 오염 가능. 별도 workspace 패키지 (`packages/react-compat-tests/`) 방식이 더 안전할 수 있음 |
| A5 | `@testing-library/react@13.x`가 React 17 + vitest 환경에서 동작 | Standard Stack | RTL 13은 공식적으로 React 17을 지원하나 vitest와의 호환성은 검증 필요 |

---

## Open Questions

1. **React 17 matrix 테스트 환경 구성**
   - What we know: `@testing-library/react` 16.x는 React 17 미지원. 13.4.0이 React 17 지원.
   - What's unclear: vitest + RTL 13.x 조합이 pnpm workspace에서 안정적인지.
   - Recommendation: Wave 0에서 React 17 fixture를 직접 `ReactDOM.render()` + `act()` 조합으로 작성해 RTL 의존 없이 테스트. RTL은 React 18/19만 사용.

2. **Suspense streaming (Remix) SSR barrier**
   - What we know: `readyState === 'complete'` + `_fiberRoots.size > 0` 조합 계획.
   - What's unclear: Remix streaming에서 partial HTML이 먼저 도착하고 일부 컴포넌트만 hydrate된 상태에서 이 조건이 too-early-true가 되는지.
   - Recommendation: Remix fixture를 직접 만들어 검증. 불안하면 추가 tick (`setTimeout(check, 100)`) 대기 전략.

3. **`fiber-adapter-v20.ts` stub 수준**
   - What we know: React 20은 현재 미출시. Phase 13에서 "자리만 마련".
   - What's unclear: stub이 얼마나 구체적이어야 하는지 (빈 파일 vs. 인터페이스 정의).
   - Recommendation: 최소한 인터페이스 contract 정의 + TODO 주석. 빈 파일은 컴파일 에러 위험.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | Build/Test | ✓ | 22 (CI) | — |
| `pnpm` | Workspace | ✓ | 10.23.0 | — |
| `bippy` | fiber instrumentation | ✓ (npm 등록됨) | 0.5.39 | 없음 — 단일 결정 의존성 |
| React 17 / 18 / 19 | matrix test | ✓ (npm 등록됨) | 17.0.2 / 18.3.1 / 19.2.5 | — |
| GitHub Actions | CI matrix | ✓ (기존 ci.yml 확인) | — | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.0 |
| Config file | `packages/react/vitest.config.ts` (Wave 0에서 생성) |
| Quick run command | `pnpm --filter @agrune/react run test` |
| Full suite command | `pnpm --filter @agrune/react run test && pnpm --filter @agrune/manifest run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REACT-01 | FiberIdentityIndex: DOM → fiber path 매핑 + rebuild | unit | `pnpm --filter @agrune/react run test -- identity-index` | ❌ Wave 0 |
| REACT-01 | FiberIdentityIndex: memo/forwardRef/portal/Suspense 엣지케이스 | unit | `pnpm --filter @agrune/react run test -- edge-cases` | ❌ Wave 0 |
| REACT-02 | `window.__agrune_identity__` lock publish + 덮어쓰기 방지 | unit | `pnpm --filter @agrune/react run test -- identity-bridge` | ❌ Wave 0 |
| REACT-03 | SSR barrier: readyState + fiber root 확인 후에만 bridge 활성 | unit | `pnpm --filter @agrune/react run test -- ssr-barrier` | ❌ Wave 0 |
| REACT-04 | prod guard: env없음→no-op, token없음→no-op, 둘다→활성 | unit | `pnpm --filter @agrune/react run test -- prod-guard` | ❌ Wave 0 |
| REACT-05 | React 17 matrix CI pass | integration | react-matrix CI job | ❌ Wave 0 |
| REACT-05 | React 18 matrix CI pass | integration | react-matrix CI job | ❌ Wave 0 |
| REACT-05 | React 19 matrix CI pass | integration | react-matrix CI job | ❌ Wave 0 |
| SelectorLadder 확장 | fiber 필드 추가 후 기존 manifest 전부 유효 | unit | `pnpm --filter @agrune/manifest run test` | ✅ (기존 테스트에 regression 확인) |
| TargetResolver | resolveByFiber fiber > CSS 우선순위 | unit | `pnpm --filter @agrune/runtime run test -- target-resolver` | ✅ (기존 파일에 케이스 추가) |

### Wave 0 Gaps

- [ ] `packages/react/` 디렉토리 전체 신설 (package.json, tsconfig.json, tsup.config.ts, vitest.config.ts)
- [ ] `packages/react/tests/identity-index.spec.ts` — REACT-01
- [ ] `packages/react/tests/identity-bridge.spec.ts` — REACT-02
- [ ] `packages/react/tests/ssr-barrier.spec.ts` — REACT-03
- [ ] `packages/react/tests/prod-guard.spec.ts` — REACT-04
- [ ] `packages/react/tests/fixtures/` — 엣지케이스 fixture 파일들 (React 17/18/19 분기)
- [ ] `.github/workflows/react-matrix.yml` — REACT-05 React 버전 matrix

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | `Object.defineProperty(configurable:false, writable:false)` — 프로토타입 오염/덮어쓰기 불가 |
| V5 Input Validation | yes | `FiberIdentityPath` zod schema 검증 (SelectorLadder fiber 필드) |
| V6 Cryptography | no | — |

### Known Threat Patterns for React fiber instrumentation

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `window.__agrune_identity__` 덮어쓰기 | Tampering | `Object.defineProperty({ writable:false, configurable:false })` Phase 11/12 패턴 재사용 |
| prod 번들에 debug 코드 노출 | Info Disclosure | 2단계 guard: AGRUNE_PROD_ENABLED 빌드 env + localStorage token. guard 미통과 시 bridge 완전 no-op |
| malicious localStorage 'agrune.prod.consent' 설정 | EoP | prod guard는 추가 보안 레이어가 아님 — "의도치 않은 prod 활성화"를 막는 것이 목적. 악의적 사용자가 token 직접 설정 가능하지만 agrune의 위협 모델에서 acceptable (사용자가 자신의 브라우저에서 자신의 데이터에 접근) |
| fiber path inject를 통한 임의 DOM 접근 | Tampering | `FiberIdentityPath` zod 검증 + path가 실제 fiber tree와 일치하는지 런타임 확인 |
| bippy `overrideProps/overrideHookState` 악용 | EoP | `@agrune/react`에서 override API 미사용 — `instrument/secure/traverseRenderedFibers/getFiberFromHostInstance/getDisplayName` 읽기 전용 API만 사용 |

---

## Sources

### Primary (HIGH confidence)
- `npm view bippy@0.5.39 --json` — 패키지 메타데이터, peerDependencies, exports
- `/tmp/package/dist/core.d.ts` — bippy 0.5.39 전체 타입 정의 (직접 추출)
- `/tmp/package/dist/index.d.ts` — bippy 0.5.39 전체 export 목록
- `https://github.com/aidenybai/bippy/blob/main/README.md` — API 사용 예제
- `packages/manifest/src/schema.ts` — SelectorLadder AtLeastOne 타입 구조 (직접 읽음)
- `packages/runtime/src/runtime/target-resolver.ts` — resolveByLadder 기존 구현 (직접 읽음)
- `packages/core/src/index.ts` — PageSnapshot/PageTarget 타입 구조 (직접 읽음)
- `.github/workflows/ci.yml` — 기존 CI 구조 (직접 읽음)
- `npm view react versions --json` — React 17.0.2 / 18.3.1 / 19.2.5 최신 버전 VERIFIED
- `npm view @testing-library/react peerDependencies` — React 17 미지원(v16.x), 13.4.0이 17 지원 VERIFIED

### Secondary (MEDIUM confidence)
- bippy README (GitHub raw) — instrument/secure API 패턴, ~4kb gzipped 크기
- Phase 11/12 SUMMARY.md — `__agrune_runtime_state__` tamper-proof 패턴 (직접 구현됨)

### Tertiary (LOW confidence)
- WebSearch: bundler dead-code-elim process.env 패턴 — `process.env.PROP` 점 표기법이 정적 분석 유리하다는 일반적 지식 (A1)
- WebSearch: GitHub Actions matrix strategy — 기존 ci.yml 구조로 검증 가능

---

## Metadata

**Confidence breakdown:**
- bippy API: HIGH — 패키지에서 직접 타입 정의 추출, README 확인
- SelectorLadder 확장: HIGH — 기존 schema.ts 직접 읽음, optional 필드 추가는 non-breaking
- FiberIdentityIndex 설계: HIGH — bippy API 기반, Phase 11/12 패턴 재사용
- prod guard: MEDIUM — bundler 정적 분석 동작은 ASSUMED (A1)
- SSR barrier: MEDIUM — readyState 패턴은 표준이나 streaming SSR 엣지케이스는 ASSUMED (A2)
- CI matrix: HIGH — 기존 ci.yml 구조 + GitHub Actions 문서

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (bippy는 minor 버전 변경이 잦으나 0.5.x 패치는 API 안정)

---

## RESEARCH COMPLETE
