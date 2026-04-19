# Stack Research — v0.5 Manifest Pivot

**Domain:** Browser automation platform / type-safe manifest SDK / root-import framework integration
**Researched:** 2026-04-19
**Confidence:** HIGH (React fiber, Zod/Valibot, tsup — Context7/공식 확인) · MEDIUM (GitHub-as-registry, Playwright recorder 내부 — WebSearch 기반)

## 스코프 정리

기존 v1.1 스택(`@agrune/core`·`@agrune/runtime`·`@agrune/browser`·`@agrune/mcp`·`@agrune/devtools` + pnpm workspace + tsup + vitest + Playwright + MCP SDK + `ai-motion`)은 **그대로 유지**한다. 이 문서는 v0.5에서 **새로 들어가는 부분**과 **기존 의존성에 추가로 필요해지는 부분**만 다룬다.

요지: 신규 라이브러리 의존성은 `bippy` 1개만 강하게 추천한다. 나머지는 **"prior art로 학습"** 혹은 **"이미 깔린 것 재활용"** 범주다.

## Recommended Stack (신규/추가분)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `bippy` | `^0.3.x` (최신 안정) | React fiber 트리 traversal + DOM element ↔ fiber lookup + persistent fiber ID | React internals 접근은 공식 public API가 없음. `__REACT_DEVTOOLS_GLOBAL_HOOK__` 직접 패치는 React 17→18→19에서 수차례 구조 변경됐음 (alternate·FiberRootNode·Hot Reload 등). `bippy`가 React DevTools 방식을 라이브러리화해서 React 17–19를 단일 API로 덮어줌 (`getFiberFromHostInstance`, `traverseFiber`, `setFiberId`/`getFiberId`, `getDisplayName`, `secure()` wrapper). ~4KB gzip, MIT, Million.dev(`react-scan` 등과 동일 저자). |
| `react` (peer) | `>=18.0.0 <20.0.0` | `@agrune/react`의 peer dep — `<AgruneDevtools />` 컴포넌트 작성 | React 18 fiber 구조 기준으로 `bippy`가 덮어주지만, 우리가 실제로 mount하는 컴포넌트는 React 자체를 peer로 요구. React 19까지 수용하되 20 major는 재검증 필요. **절대 dependency가 아니라 peerDependency로 선언**할 것 (이중 React 인스턴스 방지). |
| `react-dom` (peer) | `>=18.0.0 <20.0.0` | `<AgruneDevtools />` 렌더링 | 동 위 peer 규칙 적용. |
| `zod` | `^3.23` (기존 `@agrune/mcp`에 이미 존재) | `@agrune/manifest` 스키마 런타임 검증 + `defineManifest()` 내부 parse | 이미 MCP 도구 스키마에 사용 중이라 추가 bundle cost 0. `z.infer<typeof …>`로 TS 타입과 런타임 스키마를 단일 소스로 관리. `defineManifest`는 사실상 identity 함수 + Zod parse 래퍼라서 별도 스키마 라이브러리 도입 불필요. (v0.6에서 `@agrune/manifest`가 외부 publish 대상이 되면 `valibot`/`arktype`으로 재평가 — 현재는 불필요.) |
| `tsup` (기존) | `^8.x` | `@agrune/manifest`·`@agrune/react` 빌드 — ESM + CJS + `.d.ts` 번들 | 이미 모노레포 전역에서 사용 중. 2026 기준 TS 라이브러리 번들러 사실상 표준. `--dts`로 declaration 번들 자동 생성, dual package(ESM/CJS) · source map · external resolution · `sideEffects: false` 트리셰이크 전부 기본값으로 커버. API Extractor/rollup-plugin-dts 도입 불필요 — 두 패키지 모두 public API surface가 작고(≤ 10 exports) 복잡한 multi-entrypoint도 아님. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@octokit/rest` | `^21.x` | `agrune manifest submit` 시 GitHub API (PR 생성, repo dispatch) — optional | CLI가 manifest를 `github.com/agrune/maps`에 제출할 때만. 사용자는 본인 GitHub token 제공. `agrune maps add`는 **읽기만 할 땐 불필요** (아래 "Raw-only 전략" 참조). |
| `semver` | `^7.x` | registry에서 버전 해석 (`^1.2.0`, `~1.2.x` 등) | `agrune maps add youtube.com@^1.0` 같은 구문 처리. CLI 전용. Node 표준 라이브러리에 없으므로 npm 의존성 필요. |
| `tar` / `undici` | Node 표준 fetch | GitHub raw로부터 manifest.js 번들 다운로드 | Node 20+ 내장 `fetch`면 충분. 별도 HTTP 클라이언트 불필요. |
| (prior-art only) `react-devtools-core` | n/a | **의존하지 않음** — 코드 참고용 | `bippy`가 `react-devtools-core`의 hook 설치 로직을 대체. 번들 부풀림 방지 위해 직접 의존 금지. |
| (prior-art only) Playwright `InjectedScript` | n/a | **의존하지 않음** — recorder 구현 참고용 | `packages/playwright-core/src/server/injected/injectedScript.ts`의 `generateSelector` + `InspectTool` 패턴이 click-to-capture overlay의 reference implementation. 라이선스(Apache 2.0)로 발췌 가능. |
| (prior-art only) `@tanstack/react-query-devtools` | n/a | **의존하지 않음** — floating/embedded 모드 UX 참고 | `<AgruneDevtools />`의 floating 토글 + embedded panel UX를 그대로 따라갈 수 있음. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@types/react` | React JSX 타입 | `@agrune/react`의 devDependency. peer와 major 맞출 것. |
| `jsdom` (기존) | `@agrune/react` fiber 테스트용 DOM | `packages/runtime`에 이미 있음. 재사용. |
| `@testing-library/react` | `<AgruneDevtools />` 유닛 테스트 | React 18+ concurrent 렌더링 지원. `createRoot` API 이미 안정화. |
| Playwright (기존 `packages/e2e`) | Recorder overlay E2E | 실제 사용자 플로우(클릭→selector 캡처→manifest append)는 v1.1에서 깔아둔 Playwright harness로 확장. 신규 의존성 없음. |

## Installation

```bash
# packages/manifest (신규)
pnpm --filter @agrune/manifest add zod
pnpm --filter @agrune/manifest add -D tsup typescript vitest

# packages/react (신규)
pnpm --filter @agrune/react add bippy
pnpm --filter @agrune/react add -D \
  react react-dom @types/react @types/react-dom \
  @testing-library/react tsup typescript vitest jsdom
# React / react-dom / @types 는 peerDependencies에도 같이 선언

# packages/mcp (기존, CLI 확장용)
pnpm --filter @agrune/mcp add @octokit/rest semver

# packages/devtools (기존, recorder overlay 확장용)
# 신규 의존성 없음 — Vanilla TS + 기존 CDP 경로 재활용
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `bippy` | Hand-rolled `__REACT_DEVTOOLS_GLOBAL_HOOK__` 패치 | 극단적 bundle 민감도 (`bippy/install-hook-only`은 90 바이트지만 full 기능 없음). React 19 한정이면 가능하나, React 18 사용자도 커버하려면 안정성 비용이 크다. **권장 안함.** |
| `bippy` | `react-devtools-inline` | devtools UI를 통째로 임베드하고 싶을 때. 우리는 fiber 정보만 필요해서 오버스펙. ~수백 KB 번들. |
| `bippy` | React `useId` 기반 identity | `useId`는 React 18+ 안정이지만 **컴포넌트 내부에서만** 생성 가능하고, 외부에서 특정 요소 → 컴포넌트 식별을 역조회할 수 없다. 우리 use case(runtime이 DOM element를 보고 component identity를 역추적)에 부적합. 단, owned 프로젝트에서 **명시적 `data-agrune-id={useId()}`** opt-in은 보조 수단으로 가능. |
| `zod` | `valibot` | `@agrune/manifest`가 최종적으로 브라우저 런타임 번들(루트 임포트 경로)에 들어갈 때 재평가. 현재 manifest parse는 Node CLI + 빌드타임에서만 실행되므로 bundle size 무관. `valibot` 1KB vs `zod` 17KB 차이는 client bundle에 들어갈 때만 중요. |
| `zod` | `arktype` | TypeScript 타입 리터럴 기반 문법이 매력적이지만 러닝 커브 + 우리 MCP 스택이 이미 zod. 생태계 정합성 우선. |
| `tsup --dts` | `rollup-plugin-dts` | Vue 패키지들처럼 매우 복잡한 multi-entry 빌드에만. 우리 SDK는 2개 entry 미만. |
| `tsup --dts` | `@microsoft/api-extractor` | API Report, markdown 문서, JSON model이 필요한 대규모 SDK(Rush, Fluent UI)에 적합. 우리는 공개 API surface가 작고 문서는 README + TSDoc으로 충분. |
| GitHub raw + `fetch` | npm registry에 publish | `@agrune/maps-youtube.com`처럼 패키지당 하나씩 npm 퍼블리시하면 semver·tooling 혜택 크지만 (a) 모든 제보를 npm org에 밀어넣는 모더레이션 부담 (b) 취소/yank 절차가 무거움. **v0.5는 GitHub tag 기반으로 가볍게 시작**하고 v0.7+ 재평가. |
| GitHub raw + `fetch` | 자체 registry (CDN+DB) | 초기부터 오버엔지니어링. 사용자 수 < 100 단계에선 GitHub tag + `raw.githubusercontent.com/agrune/maps/v1.2.3/sites/youtube.com/manifest.js`로 충분. asdf/mise도 동일 패턴. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-devtools-core` 직접 import | 번들 수십 KB, 우리가 쓰는 건 fiber traversal 정도. 또한 React 버전별 호환 레이어를 직접 떠맡게 됨. | `bippy` |
| 순수 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 직접 조작 | 모든 React 버전을 따라가야 함. `FiberRootNode` vs `FiberNode`, React 19의 `HostRoot` 변경, concurrent mode commit phase 타이밍 — 전부 직접 처리해야 하고 `bippy`가 이미 해결함. | `bippy` (`secure()` wrapper로 비지원 React 버전 gracefully skip) |
| DOM selector로만 폴백 + fiber 포기 | "YouTube는 되고 내부 React 앱은 CSS selector로 충분하다"는 유혹. 하지만 root-import의 핵심 가치는 **컴포넌트가 리랜더 후에도 안정적 ID**라는 점. Tailwind class · nth-child · 자동생성 hash는 회귀 취약. | fiber → CSS selector dual resolution. fiber 우선, 실패 시 CSS fallback + stale 경고. |
| `require()` 기반 manifest 로딩 | `@agrune/manifest`가 ESM-only면 Node CJS 환경에서 깨짐. CLI(`agrune manifest dev`)가 ESM으로 파싱할 때 user TS를 직접 evaluate해야 함. | `tsx` 또는 `jiti` 런타임 로더로 `manifest.ts`를 직접 import (이미 CLI가 Node 20+ 가정이므로 `import()` + `.ts` loader 옵션 충분). 외부 의존성 추가 여부는 구현 단계에서 결정. |
| Custom DSL / YAML manifest | 타입 안전성 포기, IDE 자동완성 포기, `defineTarget` 같은 헬퍼가 주는 inference 이점 상실 | **TS 파일을 manifest 소스로** 유지. registry에 저장할 때만 빌드 산출물(JSON 또는 최소 ESM)로 정규화. |
| Custom DevTools overlay 프레임워크 (Preact, Solid) | DevTools 웹앱이 이미 Vanilla TS 기반이고 mcp 서버가 Vite 산출물로 서빙 중. 추가 프레임워크는 학습 비용·번들 비용 증가. | 계속 **Vanilla TS + 모듈화된 subview**(`LogsView`, `SessionsView`, `HitlToolbar` 패턴)를 따르고, `RecorderView` 추가. |
| Chrome Extension Recorder (`playwright-crx` 등) | v1.1에서 extension mode 완전히 제거됨 (2026-04-15 결정, Key Decision 참조). 재도입 금지. | CDP `Overlay.highlightNode` + injected content script(`Runtime.evaluate`의 isolated world)로 recorder 구현. |

## Stack Patterns by Variant

**컴포넌트 식별 대상이 React 앱인 경우 (owned):**
- Fiber selector 우선 (`bippy.getFiberFromHostInstance` → `setFiberId` 누적)
- `<AgruneDevtools />` 루트 import로 hook 초기화
- Manifest에 `component: "LoginForm.SubmitButton"` 형태로 fiber identity 저장
- CSS selector는 backup 필드로만

**외부 사이트 (non-owned, e.g., youtube.com):**
- CSS selector 전용 (fiber 접근 불가 가정)
- Manifest에 `selector: { css: "ytd-button#create" }` + optional `text` 힌트
- registry 경로로만 배포 (`github.com/agrune/maps/sites/youtube.com/`)

**Prod 번들 옵션 (opt-in):**
- `@agrune/react`의 `<AgruneDevtools mode="prod-silent" />` — recorder overlay OFF, fiber ID 기반 runtime loader만
- `bippy.secure()` wrapper로 감싸서 비지원 React 버전에서도 안전하게 no-op
- Dev 전용 기능(recorder overlay, HITL 제어)은 Vite `import.meta.env.DEV` 또는 별도 entry(`@agrune/react/dev`)로 분리해서 트리셰이크 보장

**Registry 읽기만 하는 최소 CLI:**
- `@octokit/rest` 불필요 — `fetch('https://raw.githubusercontent.com/agrune/maps/v1.2.3/...')` 한 줄
- Token 없이 익명 GitHub public API 사용 (rate limit 60/hr로 충분)
- 쓰기(`submit`)만 `@octokit/rest` + user token 요구

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `bippy@^0.3` | `react@^18 \|\| ^19` | `secure()` wrapper로 React 17 이하 / 미래 20+ 자동 비활성. peer로 선언해야 user가 가진 React 인스턴스 재사용. |
| `@agrune/react@0.5` | `react@>=18 <20` | React 19는 `useEffectEvent`, `<Activity />` 신규 API 있지만 우리는 사용 안 함. React 19.2의 `useId` prefix 변경은 우리 영향 없음 (useId를 selector 재료로 쓰지 않음). |
| `tsup@8` | `typescript@>=5.0` | 기존 `^5.7.0` 그대로 호환. TS 5.8/5.9 변경사항은 declaration 생성에 영향 없음. |
| `zod@^3.23` | MCP SDK `z` re-export | `@modelcontextprotocol/sdk`가 이미 `zod` dependency로 가지므로 workspace level dedupe 되도록 root에 `^3.23` pin 권장. |
| `@octokit/rest@^21` | Node 20+ (내장 fetch) | Octokit v21이 Node 18+ 요구. 기존 agrune CI가 Node 20이면 문제 없음. |

## React 버전 민감도 플래그

| Concern | Detail | Mitigation |
|---------|--------|-----------|
| React 18 → 19 fiber 구조 | `HostRoot` 처리, `use()` hook 도입, concurrent commit 타이밍 | `bippy`가 이미 커버. 내부 fiber 프로퍼티(`memoizedProps`, `stateNode`)는 직접 접근 금지, 항상 `bippy` 유틸리티 경유. |
| React 19.2 `useId` prefix 변경 (`:r:` → `_r_`) | HTML id에 영향 | 우리는 selector 생성에 `useId` 결과를 쓰지 않으므로 영향 없음. 혹시 `[id^=":r"]` CSS selector를 런타임이 사용하지 않는지만 확인. |
| React DevTools Firefox + React 19 버그 (`facebook/react#32836`) | Firefox에서 React 19 fiber 미인식 | agrune은 Chromium 전용 (CDP 요구). Firefox는 현재 지원 scope 밖. |
| Production React build | `development` 경로의 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 주입이 prod에도 있음 (React가 조건부로 emit) | `bippy.secure()`가 hook 존재 여부 감지. 단, minification으로 `displayName`이 사라진 경우 fallback 필요 — AI authoring 단계에서 `defineTarget`에 명시적 `displayName: 'SubmitButton'` 기록. |
| StrictMode 이중 렌더 | fiber가 2회 mount/unmount | `traverseRenderedFibers`의 `'mount' \| 'update' \| 'unmount'` phase 구분으로 처리 가능. recorder 캡처 시 `'mount'` phase만 사용. |

## Framework 확장 (v0.6+ 준비용)

현재 milestone은 React 전용. 향후 확장 시 예상되는 접근:

| Framework | 접근 방법 | 라이브러리 후보 |
|-----------|----------|-----------------|
| Vue 3 | `window.__VUE_DEVTOOLS_GLOBAL_HOOK__` + `setupDevtoolsPlugin` API 역이용. `getInspectorTree`/`getInspectorState` hook으로 component tree 접근. | 자체 구현 (bippy 유사 wrapper를 만들거나 `@vue/devtools-api`를 runtime-side에서 소비) |
| Svelte 5 | Runes는 컴파일러 변환으로 component identity 메타가 사라짐. `svelte-devtools` 확장은 컴파일 타임 주입된 `__svelte_meta`에 의존. owned 프로젝트에서 컴파일러 플러그인(vite-plugin-svelte)의 `dev: true` 옵션 필요. | `svelte-devtools` backend 소스 참고 — 라이브러리로는 미흡 |
| Solid/Qwik | 각자 devtools가 DOM marker 기반. | 케이스바이케이스, v0.6 스코프 아님 |

**v0.5 결론:** React fiber 경로만 production ready. 그 외 프레임워크는 CSS selector + optional `data-*` opt-in 경로로만 지원. 프레임워크-agnostic 추상화(`ComponentIdentityResolver` 인터페이스)는 코드 구조상 열어두되 구현체는 `ReactFiberResolver` 하나만.

## Prior Art to Study (의존하지 말고 참고)

| Source | 배울 점 | 위치 |
|--------|--------|------|
| Playwright `InjectedScript` | selector engine 플러그형 아키텍처 (CSS/XPath/Text/Role/React 엔진 병렬), `generateSelector` 우선순위, `__pw_recorderElementPicked` 이벤트 |  `microsoft/playwright` `packages/playwright-core/src/server/injected/` |
| Chrome Recorder (devtools-frontend) | isolated world script 주입, multi-selector (CSS + ARIA + XPath + Pierce + Text) 동시 생성, click/keydown/input 이벤트 리스너 | `chromium.googlesource.com/devtools/devtools-frontend/+/refs/heads/main/front_end/panels/recorder/injected/` |
| `@tanstack/react-query-devtools` | floating 토글 + embedded panel + ReactQueryDevtoolsPanel 같은 programmatic 표시 제어 | `TanStack/query` `packages/query-devtools/` |
| `react-scan` (bippy 동 저자) | fiber `onRender` hook + highlight overlay + `secure()` prod gate 실전 패턴 | `aidenybai/react-scan` |
| `asdf-vm/asdf-plugins` | shortname → GitHub repo 매핑 index 레포 운영 방식 | — |
| `mise-plugins/registry` | shortname registry + plugin 신뢰성 관리 (fork + maintainer-only commit) — `agrune/maps` 모더레이션 모델 그대로 차용 가능 | — |

## Integration Points with Existing CDP-only Architecture

1. **Runtime 주입 경로 (변경 없음):** `@agrune/browser`의 `CdpRuntimeInjector`가 `Page.addScriptToEvaluateOnNewDocument`로 `@agrune/runtime` global bundle을 주입하는 현재 경로 유지. 신규 manifest loader도 같은 번들 안에 포함.
2. **DOM scanner 제거:** `packages/runtime/src/dom-scanner.ts` + `manifest-builder.ts` 완전 삭제. 대신 `manifest-loader.ts`가 `window.__AGRUNE_MANIFEST__` (root-import에서 set) 또는 registry fetch 결과를 읽어 `PageSnapshot` 생성.
3. **Selector resolution 이중화:** 기존 `PageTarget.selector: string`을 `PageTarget.selector: { fiberId?: string; css?: string; text?: string }` 형태로 확장. `@agrune/core`의 `PageTarget` 인터페이스 변경은 v0.5 breaking change.
4. **Bootstrap 조건 변경:** `data-agrune-action/group/canvas/meta` 존재 체크 → `window.__AGRUNE_MANIFEST__` 또는 `window.__AGRUNE_REGISTRY_HINT__` 존재 체크. CDP evaluate 시 조기 return 조건.
5. **DevTools 웹앱 recorder:** `packages/devtools/src/panel.ts`에 `RecorderView` 추가. 서버 측 `CommandBroker`에 `recorder_capture` 이벤트 추가해서 클릭된 element의 fiber/CSS selector를 MCP 서버로 전달 → `agrune manifest dev`가 watch 모드로 변경사항 append.
6. **MCP 도구:** 기존 11개 유지. `agrune_read`는 manifest 기반 경로로 내부 구현만 교체. 신규 도구 `agrune_recorder_start/stop` 추가 여부는 요구사항 단계에서 결정.

## Sources

### Context7 / 공식
- `/aidenybai/bippy` (Context7, High reputation, 155 snippets) — `getFiberFromHostInstance`, `setFiberId`/`getFiberId`, `getDisplayName`, `traverseFiber`, `traverseRenderedFibers`, `secure()` wrapper, React 17–19 호환 — **HIGH**
- [React `useId` — react.dev](https://react.dev/reference/react/useId) — 19.2 prefix 변경 등 — **HIGH**
- [Chrome DevTools Protocol Overlay domain](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/) — `Overlay.highlightNode`, selector 지원 — **HIGH**
- [tsup 공식](https://tsup.egoist.dev/) — `--dts`, dual ESM/CJS, tree-shaking — **HIGH**

### 공식 문서 (WebSearch 경유)
- [Playwright Test generator](https://playwright.dev/docs/codegen) — getByRole/getByTestId, Pick locator — **HIGH**
- [Playwright Extensibility / Selectors](https://playwright.dev/docs/extensibility) — **HIGH**
- [bippy npm package](https://www.npmjs.com/package/bippy) + [GitHub README](https://github.com/aidenybai/bippy/blob/main/README.md) — bundle ~4KB, `secure()` wrapper, MIT — **HIGH**
- [Vue Devtools plugin guide](https://devtools-v6.vuejs.org/plugin/plugins-guide) — `__VUE_DEVTOOLS_GLOBAL_HOOK__`, `setupDevtoolsPlugin` — **MEDIUM** (v0.6+ 용 참고)
- [mise Plugins](https://mise.jdx.dev/plugins.html) + [mise-plugins/registry](https://github.com/mise-plugins/registry) — shortname registry 패턴 — **MEDIUM**
- [GitHub REST: Repository contents API](https://docs.github.com/en/rest/repos/contents) — raw fetch + tag resolve — **HIGH**

### 산업 비교 자료 (WebSearch, MEDIUM)
- [Zod vs Valibot vs ArkType in 2026 — Pockit Blog](https://pockit.tools/blog/zod-valibot-arktype-comparison-2026/) — 성능/번들/DX 비교
- [dts-bundle-generator vs rollup-plugin-dts vs tsup 2026 — PkgPulse](https://www.pkgpulse.com/blog/dts-bundle-generator-vs-rollup-plugin-dts-vs-tsup-dts-2026) — `tsup --dts`가 2026 기본값
- [How We Rebuilt React DevTools with Replay Routines — Replay blog](https://blog.replay.io/how-we-rebuilt-react-devtools-with-replay-routines) — DevTools bridge / operations 메시지 구조
- [What Makes Playwright So Robust?](https://lorenzhw.substack.com/p/what-makes-playwright-so-robust-i) — `InjectedScript` ~2000 LOC, selector engine, recorder overlay 구현 소개
- [Non-Intrusive Web Recon — Chrome DevTools Recorder](https://flatt.tech/research/posts/non-intrusive-web-recon-techniques-from-chrome-devtools-recorder/) — Recorder 내부 구조 분석
- [ts-morph 공식](https://github.com/dsherret/ts-morph) — (현재 milestone 범위 밖이지만 향후 manifest → .d.ts 자동 emit 시 후보)

### 기존 agrune 코드베이스 (verified HIGH)
- `/Users/chenjing/dev/agrune/agrune/.planning/PROJECT.md` — v0.5 milestone 정의 및 Key Decisions
- `/Users/chenjing/dev/agrune/agrune/packages/core/src/index.ts` — `PageTarget`, `PageSnapshot`, `CommandRequest` 공용 타입
- `/Users/chenjing/dev/agrune/agrune/packages/runtime/src/dom-scanner.ts`, `manifest-builder.ts` — 제거 대상 파일들
- `/Users/chenjing/dev/agrune/agrune/packages/devtools/src/panel.ts` — 확장할 뷰 아키텍처 패턴(`LogsView` / `SessionsView` / `HitlToolbar`)
- `/Users/chenjing/dev/agrune/agrune/packages/mcp/src/mcp-tools.ts` — 기존 11 MCP 도구 스키마

---
*Stack research for: v0.5 Manifest Pivot (agrune browser automation)*
*Researched: 2026-04-19*
