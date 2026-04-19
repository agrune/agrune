---
phase: "13"
phase_name: REACT
status: Ready for planning
mode: Auto-generated (discuss skipped via workflow.skip_discuss=true)
generated: "2026-04-19"
---

# Phase 13: REACT - Context

<domain>
## Phase Boundary

`@agrune/react` 루트-임포트 한 줄로 owned React 앱의 per-element 수정 없이 component-identity selector가 활성화된다. Prod 번들에 들어가도 2단계 guard가 통과하지 않으면 로드조차 되지 않는다.

**Requirements**: REACT-01, REACT-02, REACT-03, REACT-04, REACT-05

**Success Criteria**:
1. Author가 `<AgruneDevtools manifest={manifest} mode="dev" />` 1줄 추가하면 `window.__agrune_identity__` bridge로 DOM↔fiber resolve 가능. Refactor(컴포넌트 이동, className 변경, CSS-in-JS 해시 변경)에도 selector 유지.
2. SSR(Next.js App Router, Remix streaming)에서 hydration 완료 전 bridge가 activate 안 됨. `readyState === 'complete'` + root fiber 존재 확인 후에만 identity 노출.
3. Prod 번들에서 root-import 활성화: `AGRUNE_PROD_ENABLED=true` (빌드 env) + `localStorage['agrune.prod.consent']` (런타임 token) 두 guard 모두 통과 필요. 하나라도 없으면 no-op.
4. `bippy` 기반 `FiberIdentityIndex`: path descriptor(displayName + key props + index) 저장. `React.memo(forwardRef(...))`, portal, Suspense, compound component 엣지케이스 fixture가 React 17/18/19 matrix CI pass.
5. `window.__agrune_identity__` 를 `Object.defineProperty({ configurable: false, writable: false })` lock 게시. 프로토타입 오염/덮어쓰기 불가.

**UI phase**: yes — `<AgruneDevtools />` 컴포넌트 UI 설계 포함.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택은 Claude의 재량. discuss 생략.

**Upstream from Phase 11+12 (locked):**
- `@agrune/manifest` SDK: `AgruneManifest` v3 타입 + zod validator
- PageSnapshot: `schemaVersion: 3`, `selector: SelectorLadder`
- `CdpRuntimeInjector`: `prepareSession({ preloadManifest })` + `reloadRuntime` debounce
- `BrowserDriver.injectManifest(tabId, manifest)` 활성
- `window.__agrune_runtime_state__` tamper-proof 이미 존재 — `__agrune_identity__` 도 같은 패턴으로 lock

**Key decision (from PROJECT.md 2026-04-19):**
- `bippy` = React fiber 접근 단일 신규 의존성. React 17/18/19 matrix. React 20 대비 `fiber-adapter-v20.ts` 자리만 Phase 13에서 마련.

</decisions>

<code_context>
## Existing Code Insights

- 현재 `packages/` 하위에 React 패키지 없음 — `packages/react/` 신설.
- SelectorLadder에 `fiber` 전략을 추가해야 함 (기존 role/text/testId/attr/css 외): Phase 11 `@agrune/manifest` SelectorLadder 확장.
- identity bridge 배포: `<AgruneDevtools />` 가 mount 시 `window.__agrune_identity__` 세팅.
- prod guard: bundler가 AGRUNE_PROD_ENABLED env를 dead-code-elim.

</code_context>

<specifics>
## Specific Ideas

- `<AgruneDevtools manifest={manifest} mode="dev" | "prod" />` 컴포넌트 API.
- `FiberIdentityIndex`: path descriptor = `{ componentName, keyProps: {k,v}, indexPath: number[] }`.
- SSR readiness: `document.readyState === 'complete'` + React root attach 확인.
- TargetResolver에 fiber 전략 추가 — `resolveByFiber(path: FiberIdentityPath)`.

</specifics>

<deferred>
## Deferred Ideas

None — discuss 건너뜀.

</deferred>
