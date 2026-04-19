# Project Research Summary

**Project:** agrune v0.5 Manifest Pivot
**Domain:** 브라우저 자동화 플랫폼 — manifest 기반 외부 매핑 + React root-import 프레임워크 통합 (CDP-only)
**Researched:** 2026-04-19
**Confidence:** HIGH (stack·features·architecture는 공식 소스 + 기존 코드 인벤토리로 교차검증) / MEDIUM (registry 운영 임계값·manifest cache 정책·recorder IPC 세부는 구현 단계에서 결정 필요)

## Executive Summary

agrune v0.5는 inline `data-agrune-*` 어노테이션을 완전 폐기하고 **외부 manifest(`defineManifest`/`defineTarget`/`defineRepeat`/`defineMacro`) + React root-import(`<AgruneDevtools />`)** 로 피봇한다. 조사된 20여 개 경쟁 제품(Playwright POM, Playwright MCP, Stagehand, Selenium IDE, Cypress Studio, Katalon Recorder, TanStack Query devtools, Redux DevTools 등) 중 **"비엔지니어가 편집 가능한 라이브 manifest + 타입 안전 authoring + 결정론적 macro를 MCP 도구로 노출"** 조합을 가진 제품은 없다. 이것이 agrune의 시장 포지션이고, 동시에 "fiber 기반 component-identity selector"는 owned React 앱에서 Playwright/Selenium/Stagehand가 못 잡는 refactor 저항성을 제공한다.

기술적 핵심은 단 하나의 신규 라이브러리 의존성 — **`bippy`** — 로 React 17/18/19 fiber 구조 차이를 단일 API로 덮는 것이다. 나머지 스택(`tsup`, `zod`, `@octokit/rest`, Playwright E2E)은 이미 깔려 있거나 산업 표준이다. 아키텍처 측면에서는 (1) `@agrune/react`의 Fiber 인덱스를 `window.__agrune_identity__` **글로벌 브리지**(Object.defineProperty lock)로 runtime에 publish, (2) Macro runner를 **페이지 런타임 안에서 실행**(CDP round-trip 제거로 토큰·지연 동시 감축), (3) Registry를 **GitHub raw + 디스크 캐시(`~/.agrune/maps/`)** 로 가볍게 시작하는 세 결정이 설계 중추다.

가장 큰 리스크는 **prod 번들에 root-import가 포함될 때의 원격 제어 공격 표면**과 **registry supply-chain 공격(sensitive:false 우회)** 두 축이다. 둘 다 단일 phase가 소유할 수 없는 cross-cutting 우려로, `@agrune/react`의 2단계 guard(env + consent token)와 runtime의 DOM heuristic이 manifest의 `sensitive:false`를 **override하지 못하도록**(OR-only) 설계하는 것이 완화책이다. Registry governance(tier 시스템, auto-gate, velocity limit)는 트래픽이 붙은 뒤에는 bolt-on이 불가능하므로 **v0.5 scope 안에서 설계가 끝나야 한다**는 것이 PITFALLS 조사의 결론이다.

## Key Findings

### Recommended Stack

**신규 의존성은 `bippy` 1개만 강하게 추천**. 기존 v1.1 스택(pnpm workspace, tsup, vitest, Playwright, MCP SDK, `ai-motion`)은 그대로 유지한다. React는 **peerDependency**로만 선언해 이중 React 인스턴스를 방지한다. Registry 초기 단계는 GitHub raw + 내장 `fetch`만으로 충분하고, 쓰기(`submit`) 경로에서만 `@octokit/rest`가 필요하다.

**Core technologies (신규/추가):**
- `bippy@^0.3` — React fiber 조회(DOM ↔ fiber, persistent ID, `secure()` wrapper) — **React 17–19 단일 API, ~4KB gzip, MIT(Million.dev)**. 직접 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 패치는 버전별 호환 부담이 크므로 비권장.
- `react`/`react-dom` (peer, `>=18 <20`) — `<AgruneDevtools />` peer. **React 20 major는 재검증 필요** (플래그).
- `zod@^3.23` — `@agrune/manifest` 런타임 스키마 + `defineManifest` parse. MCP SDK가 이미 의존하므로 추가 bundle cost 0.
- `tsup@^8` — `@agrune/manifest`/`@agrune/react` dual ESM/CJS + `.d.ts` 번들. `rollup-plugin-dts`/`api-extractor`는 public API surface가 작아 불필요.
- `@octokit/rest@^21` + `semver@^7` — CLI `agrune maps` 명령의 쓰기 경로 전용. 읽기만 할 때는 불필요.

**Prior art로 학습(의존하지 말 것):** Playwright `InjectedScript`의 `generateSelector`/`InspectTool` 패턴, Chrome Recorder의 isolated-world 캡처, `react-scan`의 `secure()` prod gate, `@tanstack/react-query-devtools`의 floating 토글 UX.

### Expected Features

조사된 Feature Landscape는 **Table Stakes 11 / Differentiators 8 / Anti-Features 10**으로 분류된다. 경쟁 제품 분석에서 발견된 가장 중요한 지표는 **토큰 비용** — Playwright MCP 114k tokens/task vs CLI 27k tokens/task(4x 차이) — 로, agrune의 `defineMacro` + outline snapshot 조합은 27k 급을 목표로 할 수 있다.

**Must have (table stakes):**
- 타입 안전 manifest authoring (`defineTarget`/`defineRepeat`/`defineMacro`) — 2025 기준 불합격 방지
- CSS selector fallback + role/text/testId selector — Playwright codegen 2026 표준
- Root-import floating devtools 버튼 + localStorage 상태 기억 — TanStack 계열 UX 표준
- Dev/prod 분리 번들링(dynamic import + 명시적 NODE_ENV 가드) — Jotai devtools #49 실사례 기반
- Recorder 기본 UX(record/stop/export) + repeat primitive + named macro + sensitive 마스킹 + CLI validate

**Should have (competitive differentiators):**
- **Fiber 기반 component-identity selector** — Playwright/Selenium/Stagehand 대비 refactor 내성 한 단계 위 (React 생태계에만)
- **"Live manifest format editable by non-engineers"** — 경쟁 제품 중 완전 일치하는 것 없음. agrune의 시장 포지션
- **Macro as MCP tool** — Stagehand의 비결정적 agent와 대비되는 "deterministic + LLM-callable" 포지션. 4x 토큰 감축 기대
- **Declarative repeat primitive** — manifest 차원 template 선언은 경쟁사 전무
- **In-app recorder with fiber capture** — Cypress Studio(CSS)·Katalon(AI self-healing)·Chrome Recorder(JSON) 모두 없음
- **Sensitive auto-detect during authoring** (runtime 아님) — 1Password/Chrome은 runtime detect만
- **Community registry (GitHub-as-registry)** — awesome-list/mise-plugins 패턴
- **Token-efficient outline snapshot** — manifest compile-time group 구조 고정으로 기존 outline 모드 안정성 상승

**Defer (v0.6+):**
- Virtualized list fiber data-state 접근 (v0.5는 viewport 내 row만)
- `@agrune/vue`·`@agrune/svelte`·`@agrune/solid` — fiber-equivalent 각 프레임워크 구현 비용 폭발
- YAML export (display-only), 분산 ownership registry, macOS AX 확장 unified manifest

**Anti-features (명시적 non-goal, 10개 전부 대안 제시됨):**
- Natural-language runtime agent (Stagehand 스타일) — deterministic 원칙 파괴
- Vision fallback selector, runtime self-healing selector, runtime LLM call — v1.0 NO-GO 재확인
- YAML-only manifest, 브라우저 확장/sidepanel, cloud registry backend — 2026-04-15 CDP-only 피봇과 충돌

### Architecture Approach

v0.5의 진실의 원천(source of truth)은 **DOM 안의 inline 속성**에서 **외부 manifest 객체**로 이동한다. authoring(dev 머신의 `manifest.ts` + `@agrune/manifest` SDK) → host app(`<AgruneDevtools />` + `@agrune/react`의 Fiber 인덱스) → page runtime(주입된 `ManifestLoader`/`TargetResolver`/`MacroRunner`) → control plane(`@agrune/mcp`) 의 4계층이 같은 JS realm 또는 CDP binding을 통해 연결된다. **Macro는 페이지 런타임에서 실행**되고 MCP는 시작/종료 orchestrate만 — 이것이 transactional boundary와 토큰 효율을 동시에 확보하는 결정적 설계다.

**Major components (신규/수정):**
1. `@agrune/manifest` (신규) — `defineManifest`/`defineTarget`/`defineRepeat`/`defineMacro` 타입 안전 SDK + zod schema
2. `@agrune/react` (신규) — `<AgruneDevtools />` root-import, Fiber → `FiberIdentityIndex` 구축, `window.__agrune_identity__` bridge (Object.defineProperty lock)
3. `@agrune/core` (수정) — `AgruneManifest` v2 → **v3 breaking bump**, `PageTarget.identityKey?`, `PageSnapshot.manifestRef?`, `AgruneIdentityBridge` 인터페이스, 신규 에러코드(`MANIFEST_INVALID`/`MACRO_STEP_FAILED`/`IDENTITY_BRIDGE_MISSING`)
4. `@agrune/runtime` (수정) — `ManifestLoader`/`TargetResolver`(fiber → CSS dual)/`MacroRunner`/`SensitiveMask` 신규, `dom-scanner` deprecate, bootstrap 게이트 제거(항상 부팅)
5. `@agrune/browser` (수정) — `CdpRuntimeInjector`가 `__agrune_preload_manifest__`를 source에 embed(외부 사이트용 zero-RTT), `loadManifest`/`runMacro` 메서드 추가
6. `@agrune/mcp` (수정) — 신규 MCP 도구 `agrune_manifest_load`/`agrune_macro_run`, `toPublicSnapshot(snapshot, { shapeVersion: 'v2'|'v3' })` adapter로 AI 하네스 호환 한 사이클 유지
7. `@agrune/devtools` (수정) — Vanilla TS `RecorderView` 추가, `recorder_toggle`/`recorder_captured`/`recorder_commit` WS 프로토콜
8. `@agrune/cli` (수정, 현재 `@agrune/mcp` 내부) — `agrune manifest {dev,validate,submit}`, `agrune maps {add,types,doctor}`, `~/.agrune/maps/<host>@<ver>.json` 캐시 + `agrune.maps.lock.json` 잠금

**핵심 설계 결정 (ARCHITECTURE Q1–Q7 요약):**
- **Identity bridge:** `window.__agrune_identity__` 글로벌 + 타입 계약 (postMessage/커스텀 element/CDP 브리지 대안 기각 — 같은 JS realm이므로 오버엔지니어링)
- **Manifest 로딩:** hybrid — owned 앱은 `<AgruneDevtools />` 첫 렌더 시 `window.__agrune_manifest__` publish (zero-RTT), 외부 사이트는 CDP `addScriptToEvaluateOnNewDocument` source에 JSON 리터럴 embed
- **Snapshot 프로토콜:** `PageSnapshot.version` **2 → 3 breaking bump**. `toPublicSnapshot()` adapter가 기본 v2-shape 유지, `agrune_snapshot`의 `mode: 'v3'` 옵트인, 한 사이클 뒤 기본값 전환
- **Macro runner 위치:** 페이지 런타임 내부 (CDP round-trip 제거, `command-handlers`의 retry/flow-lock 재사용, HITL은 macro 시작/종료만 gate — step별은 opt-in)
- **Registry fetch:** 디스크 캐시 강제, 런타임 스트리밍 금지(CORS/CSP/오프라인/결정론). `~/.agrune/maps/<host>@<ver>.json` + content hash + `agrune.maps.lock.json`
- **Recorder → 파일 flow:** MCP가 `~/.agrune/authoring/pending/` 에만 쓰고, **CLI(`agrune manifest dev` watcher)가 소스 파일 수정의 유일한 주체** — 사용자 합의 지점 분리 (MCP 직접 쓰기/Vite 플러그인 대안 기각)

### Critical Pitfalls

PITFALLS 조사는 12개 함정을 확인했고, 그 중 **phase 경계를 넘는 3개**가 가장 위험하다 — phase 오너가 없으면 구조적으로 방치된다.

1. **Prod root-import 원격 제어 벡터 (Pitfall 3)** — `<AgruneDevtools />`가 prod 번들에 들어가면 fiber selector의 refactor 저항성이 역으로 공격자에게 유리해진다. **완화:** 2단계 guard(`AGRUNE_PROD_ENABLED` 빌드 env + `localStorage['agrune.prod.consent']` 런타임 token), bundle analyzer CI로 prod build에 recorder/devtools 문자열 부재 검증, `sensitive:true` target은 prod에서 fill **완전 금지**. **Cross-cutting — `@agrune/react` + Registry phase 공동 오너.**
2. **악성 manifest의 sensitive 우회 (Pitfall 4)** — registry PR로 `sensitive:false` 엔트리 침투 시도 (2025년 Chrome Extension supply-chain 사례 36개·2.6M 사용자). **완화:** runtime DOM heuristic(`type=password`, `autocomplete` whitelist, 단어 경계 regex)이 manifest 플래그와 **OR로 결합** — manifest `false`는 runtime 판정을 override할 수 없음. PR bot이 `sensitive:false` 변경 자동 하이라이트. **Cross-cutting — Runtime + Registry phase.**
3. **Registry governance를 v0.5 이후로 미루는 것 (Pitfall 11)** — solo maintainer + rubber-stamp merge + "clean 몇 년 후 flip"(ShadyPanda 패턴). **트래픽이 붙은 뒤에는 bolt-on 불가능** — tier 시스템(`verified`/`community`/`unlisted`), auto-gate, velocity limit(신규 저자 첫 3 PR 30일 holddown), revocation 경로, `REGISTRY_GOVERNANCE.md`가 v0.5 scope 안에서 확정되어야 한다.
4. **React fiber field suffix 가변성 (Pitfall 1) + SSR/hydration race (Pitfall 2)** — `el.__reactFiber$abc`는 suffix가 랜덤이며 여러 React 인스턴스 공존 시 깨진다. Next.js App Router·Remix streaming에서 초기 HTML에는 fiber가 없다. **완화:** prefix scan(`Object.keys(el).find(k => k.startsWith('__reactFiber$'))`), React 17/18/19 matrix CI fixture, `useEffect` + hydration barrier (readyState + root fiber 존재). **`@agrune/react` phase 단독 오너.**
5. **CSS selector drift + component-identity 파편화 (Pitfalls 5, 6)** — Tailwind/CSS-in-JS 해시, `React.memo(forwardRef(...))`의 displayName, portal의 DOM vs fiber tree 불일치, Suspense 경계. **완화:** selector priority ladder(fiber > role > text > testId > stable attr > CSS, 절대 금지: 해시 클래스/`:nth-child`/auto-id), fiber는 **참조가 아니라 path descriptor**로 저장, memo/forwardRef `$$typeof` 재귀 unwrap, weekly registry health check bot.

나머지 함정(Pitfall 7 virtualized list, 8 macro partial execution, 9 recorder overlay mode, 10 sensitive heuristic 오차, 12 manifest cache staleness)은 단일 phase에 격리 가능하며 PITFALLS.md의 Pitfall-to-Phase Mapping 표 그대로 적용한다.

## Implications for Roadmap

ARCHITECTURE의 7-phase DAG와 FEATURES의 8-phase 분할을 **아래 8-phase 통일 로드맵**으로 reconcile한다. 핵심 차이점은 (1) ARCHITECTURE가 `@agrune/manifest` SDK를 Phase 1에 묶은 데 반해 FEATURES는 schema와 SDK를 분리하지 않았고, (2) ARCHITECTURE가 "inline annotation 제거"를 별도 phase로 두지 않은 반면 FEATURES는 Phase 7로 분리한 점이다. 아래 로드맵은 **ARCHITECTURE의 DAG 제약(각 단계에서 시스템이 동작 가능)을 유지하면서** FEATURES의 "inline 제거"와 "registry 공개"를 명시적 phase로 분리했다.

### Phase 1: Manifest Schema v3 + `@agrune/manifest` SDK + CSS-only Runtime Resolver

**Rationale:** ARCHITECTURE Q7 DAG의 뿌리. 이 phase 없으면 나머지 전부 블록. CSS-only resolver를 먼저 세우면 React 패키지가 블로커 아님 (외부 사이트 자동화는 이 phase에서 이미 E2E 가능).
**Delivers:** `@agrune/core` manifest v3 타입 + `AgruneIdentityBridge` 인터페이스, `@agrune/manifest` SDK (`defineManifest`/`defineTarget`/`defineRepeat`/`defineMacro` — schema 전부, runtime 구현은 후속 phase), `@agrune/runtime`의 `ManifestLoader`·`TargetResolver`(CSS 경로만), 수동 manifest 전달로 유닛 테스트 가능.
**Addresses:** 타입 안전 authoring(table stake), CSS fallback, selector priority ladder schema (Pitfall 5 방어)
**Avoids:** Pitfall 1(fiber suffix — 이 phase는 fiber 없음), Pitfall 5(schema에 priority 강제)

### Phase 2: CDP Injector Manifest Preload + MCP `manifest_load` Tool

**Rationale:** Phase 1 결과물을 CDP 경로에 연결 — 외부 사이트 수동 manifest 로드로 **엔드투엔드 동작** 성립 (registry 없이도). `PageSnapshot.version` 2→3 breaking bump + `toPublicSnapshot()` adapter가 이 phase에서 landing — 스냅샷 프로토콜 변경은 다른 phase에 침투하기 전에 닫아야 한다.
**Delivers:** `CdpRuntimeInjector.prepareSession({ preloadManifest })`, `__agrune_preload_manifest__` source embed, `agrune_manifest_load` MCP tool, `toPublicSnapshot(v3 → v2|v3)` adapter
**Uses:** `@agrune/browser` injector(기존), CDP `Page.addScriptToEvaluateOnNewDocument`
**Implements:** ARCHITECTURE Q2 hybrid loading + Q3 snapshot bump

### Phase 3: `@agrune/react` Root-Import + Fiber Identity Bridge (+ Prod Guard)

**Rationale:** 피봇의 사용자 약속. `bippy` 통합, SSR hydration barrier, `window.__agrune_identity__` lock, **2단계 prod guard가 이 phase에서 landing(cross-cutting Pitfall 3의 primary owner)**. Phase 2 CSS-only 경로가 이미 살아 있으므로 이 phase가 블로커는 아니지만, 차별화 가치의 70%가 여기서 나온다.
**Delivers:** `@agrune/react` 패키지, `<AgruneDevtools manifest mode>`, Fiber reconciler shim(memo/forwardRef/portal/Suspense 케이스 fixture), `AgruneIdentityBridge` 구현, 2단계 prod guard(env + consent token), bundle analyzer CI
**Uses:** `bippy@^0.3`, React peerDependency, `tsup --dts`
**Implements:** ARCHITECTURE Q1 identity bridge
**Avoids:** Pitfalls 1(prefix scan + 버전 matrix), 2(useEffect + hydration barrier), 3(2단계 guard), 6(path descriptor + $$typeof unwrap)

### Phase 4: Macro Runner (in-page) + `agrune_macro` MCP Tool + Sensitive Masking

**Rationale:** LLM 토큰 비용 대응(4x 감축 기대). ARCHITECTURE Q4가 결정적 — **페이지 런타임에서 실행**(MCP orchestration 아님). Sensitive 마스킹은 runtime DOM heuristic이 manifest를 override하는 defense-in-depth(Pitfall 4) — macro와 같은 phase에 묶어서 sensitive 통과하지 않은 fill을 macro에서 조기 차단.
**Delivers:** `MacroRunner` in-page, `agrune_macro_run` MCP tool, `SensitiveMask` heuristic(type=password, autocomplete whitelist, 단어 경계 regex, ARIA label 다국어), precondition/postcondition/circuit breaker schema, macro step별 HITL opt-in
**Uses:** 기존 `CommandBroker`/`HitlController`/`action-queue`
**Implements:** `defineMacro` runtime 전체
**Avoids:** Pitfalls 8(precondition/postcondition/circuit breaker), 10(OR-sensitive + override 불가), cross-cutting Pitfall 4의 runtime half

### Phase 5: Repeat Primitive + Virtualized-List Aware Expansion

**Rationale:** 외부 사이트(YouTube 피드, Notion 리스트)에 필수. Virtualized list는 v0.5에서 viewport 내 row만 지원하고 fiber data-state 접근은 v0.6+로 연기 — 다만 `keyFrom`, `total` schema 필드와 `aria-rowcount`/`aria-setsize` heuristic은 이 phase에서 확정해야 이후 확장 호환.
**Delivers:** `defineRepeat` runtime expander, textContent anchor 기반 N 인스턴스 스냅샷, `strategy: 'dom'|'virtualized'` schema, stable key 필수 validation
**Implements:** `defineRepeat` + snapshot group `repeatInstance`
**Avoids:** Pitfall 7(두 strategy + stable key + logical size hint)

### Phase 6: DevTools Recorder Overlay + `agrune manifest dev` Watcher + AI Authoring Skill 재작성

**Rationale:** 피봇의 authoring UX. ARCHITECTURE Q6 flow — MCP는 `~/.agrune/authoring/pending/`에만 쓰고 **CLI watcher가 ts-morph로 소스 머지**. Recorder mode 모델(idle/picking/recording-action)과 keyboard shortcut이 Pitfall 9 방어.
**Delivers:** `packages/devtools/src/panel.ts`의 `RecorderView`, `recorder_toggle`/`recorder_captured`/`recorder_commit` WS, MCP pending write, CLI watcher + ts-morph 머지, sensitive auto-detect at authoring time, AI authoring skill rewrite
**Uses:** 기존 `CommandBroker`/`HitlController`, Vanilla TS devtools 패턴 유지 (Preact/Solid 추가 금지)
**Implements:** FEATURES differentiators 3, 6, 7
**Avoids:** Pitfall 9(mode keyboard shortcut + hit-testing 분리 + interactive ancestor 자동 상승)

### Phase 7: Inline `data-agrune-*` 제거 + 문서 정리 + Single-Path Enforcement

**Rationale:** 단일 경로 원칙 확정. `@agrune/runtime`의 `dom-scanner.ts`/`manifest-builder.ts` 삭제는 테스트 픽스처만 남기고 bootstrap 경로에서 제거. `PageSnapshot` `sourceFile`/`sourceLine` optional 완화 반영. README·AGENTS·조직 프로필 sync(user memory 규칙).
**Delivers:** inline scanner 제거 PR, docs/* 재작성, `toPublicSnapshot()` 기본값을 v2 → v3 전환(한 사이클 뒤)
**Implements:** PROJECT.md "inline annotation 완전 폐기"

### Phase 8: Registry 공개 + `agrune maps {add,types,doctor,submit}` + Governance

**Rationale:** schema stable 확인 후에만 공개 — 초기 공개 후 schema 변경은 migration 지옥. **Governance(tier 시스템, auto-gate, velocity limit, `REGISTRY_GOVERNANCE.md`)는 이 phase scope 안에서 설계가 끝나야 한다**(Pitfall 11). 공개 시점에 manifest 수량은 적어도 설계는 완성 상태.
**Delivers:** `github.com/agrune/maps` 초기 repo + 10개 시드 manifest, `agrune maps add/types/doctor/submit` CLI, `~/.agrune/maps/` 캐시 + `agrune.maps.lock.json`, PR bot(sensitive 변경 하이라이트 + weekly selector health check), `REGISTRY_GOVERNANCE.md`, tier schema, velocity limit
**Uses:** `@octokit/rest@^21`, `semver@^7`, GitHub raw fetch
**Avoids:** Pitfalls 4(PR bot + trust allowlist), 11(governance doc + tier + auto-gate), 12(staleness smoke test + `agrune maps doctor`)

### Phase Ordering Rationale

- **Phase 1 → 2 → 3 순서가 ARCHITECTURE DAG의 핵심 sequential spine** — schema 없이는 runtime 없고, runtime injection 없이는 React bridge의 연결 지점이 없다.
- **Phase 3이 optional하게 보일 수 있지만 블록 아님** — Phase 2까지로 외부 사이트 CSS-only 자동화는 성립. `@agrune/react`가 지연돼도 제품은 동작. 하지만 차별화 가치는 Phase 3에서 나옴.
- **Phase 4(macro) + 5(repeat)를 Phase 3 다음에 둔 이유** — 둘 다 runtime resolver가 안정된 뒤에 확장해야 안전. 특히 macro는 HITL 통합이 필요하고 repeat은 snapshot 구조 변경을 동반.
- **Phase 6(recorder)가 Phase 4/5 뒤인 이유** — recorder가 캡처하는 모든 구조(target/repeat/macro)는 먼저 runtime에서 resolvable해야 한다. 반대 순서면 "capture는 되는데 runtime이 읽을 수 없는" 회색지대가 생김.
- **Phase 7(inline 제거)이 Phase 6 뒤인 이유** — recorder가 inline 기반 테스트 픽스처를 여전히 사용할 수 있고, authoring 대안이 완성된 뒤에 legacy 경로 제거가 안전.
- **Phase 8(registry)이 마지막인 이유** — schema가 7개 phase를 거쳐 stable해진 뒤에만 공개. 하지만 governance 설계는 **트래픽이 붙기 전** 필수.
- **Breaking snapshot bump(v2→v3)는 Phase 2에 landing** — 다른 phase에 스냅샷 변경이 침투하기 전에 프로토콜 경계 확정. `toPublicSnapshot()` adapter로 MCP 출력은 호환.
- **Cross-cutting 우려(prod guard, sensitive override)는 두 phase에 걸쳐 소유** — 3번째 phase에 primary owner(`@agrune/react`), 4번째 phase에 secondary owner(Runtime + macro).

### Research Flags

Phases likely needing deeper research during planning (via `/gsd-research-phase`):

- **Phase 3 (`@agrune/react`):** `bippy` + React 19 concurrent commit 타이밍, `__REACT_DEVTOOLS_GLOBAL_HOOK__` 기존 설치된 devtools 확장과의 co-existence, portal/Suspense/memo/forwardRef 엣지 케이스별 fixture 전략, **React 20 API 변경 대비 adapter 인터페이스 설계(STACK 플래그)**
- **Phase 6 (recorder + CLI watcher):** ts-morph/recast로 `defineManifest` 오브젝트에 target 삽입 AST 조작 패턴 (기존 주석·포매팅 보존), pending 디렉토리 충돌 해결, AI authoring skill의 sensitive auto-detect 정확도 corpus
- **Phase 8 (registry governance):** 실제 PR bot 구현(GitHub Actions), CODEOWNERS + velocity limit 메커니즘, revocation 경로(incident list fetch + CLI auto-disable), SHA256 lock 파일 구조, **초기 seed manifest 선정 기준**

Phases with standard patterns (research-phase 생략 가능):

- **Phase 1 (manifest schema):** zod + `defineX` identity SDK 패턴 well-documented (tRPC, Drizzle 등)
- **Phase 2 (CDP injector 확장):** 기존 `CdpRuntimeInjector` 구조 재사용, `Page.addScriptToEvaluateOnNewDocument` 사용 실적 있음
- **Phase 5 (repeat primitive DOM 경로):** virtualized 확장은 Phase 플래그, DOM enumerate + textContent anchor는 표준 패턴
- **Phase 7 (inline 제거):** 순수 삭제 + 문서 작업

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `bippy` Context7 High reputation(155 snippets), React/tsup/zod 공식 문서 직접 확인. `@octokit/rest`/semver 산업 표준. 불확실성은 **React 20 major 호환**(아직 릴리스 전) 한 지점. |
| Features | HIGH | 20+ primary sources 교차검증, 6개 feature 영역 전부 커버, Table Stakes/Differentiator/Anti-feature 경계가 각 카테고리 이유+대안과 함께 명확. 토큰 벤치마크(114k vs 27k)는 측정된 수치 기반. |
| Architecture | HIGH | 기존 코드 인벤토리 직접 읽음(HIGH), 7개 설계 질문(Q1–Q7) 각각 매트릭스 비교 + 권장안 + 근거. MEDIUM 영역은 cold-start 수치(>200KB manifest 시 분리 주입 임계점)와 recorder IPC 형식 세부. |
| Pitfalls | MEDIUM-HIGH | React fiber·Playwright codegen·Chrome Extension supply-chain 사례는 HIGH(공식·다중 교차). **정량 수치("per-selector 2% flakiness", solo maintainer 임계 PR/주)는 LOW** — 업계 공개 수치 부족. 방어 전략 자체는 HIGH. |

**Overall confidence:** HIGH

### Gaps to Address

- **React 20 호환:** `bippy`가 React 17–19 커버 확정. React 20 major 변경점은 아직 불투명. **Phase 3에서 `fiber-adapter-v18.ts`/`fiber-adapter-v19.ts` 레이어를 두고 향후 v20 adapter 추가 여지**를 남겨두는 것으로 완화.
- **Manifest cache 정책의 정량 기준:** weekly re-fetch가 맞는지, 사이트별 다른 lifetime이 필요한지 수치 없음. **Phase 8에서 observability를 먼저 깔고 데이터 기반 조정**. 기본은 weekly + 사용자 수동 `agrune maps update`.
- **Registry governance 임계값:** PR/주당 몇 개에서 solo → multi-reviewer 전환해야 하는지 업계 수치 없음. Chrome Extension 사례(2.6M 사용자 수준 침해)로 upper bound만 추정. **Phase 8 governance doc에 "review backlog > 2주"·"동일 저자 다중 PR 감지"를 정량 트리거로 명시**.
- **Recorder capture precision/recall corpus:** Pitfall 10 방어용 OWASP/HIBP/KR 주요 사이트 sensitive 필드 100+ 샘플 corpus 구축 필요. **Phase 6 CI에 precision ≥ 90%, recall ≥ 95% 회귀 테스트**.
- **Large manifest serialization(>200KB) 경로:** CDP source embed vs `Runtime.evaluate` 분리 임계점 실측 필요. **Phase 2에서 10KB까지 검증, 임계 초과 경로는 v0.6 연기 플래그**.
- **`tsx` vs `jiti` TypeScript manifest loader:** CLI가 user `manifest.ts`를 evaluate할 때 어느 loader가 안정적인지는 구현 단계 결정. 외부 의존성 최소화 우선.

## Sources

### Primary (HIGH confidence)

**Context7 / 공식 라이브러리:**
- `/aidenybai/bippy` (Context7, 155 snippets) — `getFiberFromHostInstance`, `setFiberId`, `traverseRenderedFibers`, `secure()` wrapper, React 17–19 호환
- [React `useId` — react.dev](https://react.dev/reference/react/useId)
- [React StrictMode + `#35676` issue](https://github.com/facebook/react/issues/35676)
- [React Fiber architecture (acdlite)](https://github.com/acdlite/react-fiber-architecture) + [React DevTools OVERVIEW.md](https://github.com/facebook/react/blob/main/packages/react-devtools/OVERVIEW.md)
- [React `#14319` — displayName on forwardRef/memo](https://github.com/facebook/react/issues/14319)
- [Next.js hydration errors 공식 메시지](https://nextjs.org/docs/messages/react-hydration-error)
- [Chrome DevTools Protocol — Overlay domain](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/)
- [tsup 공식](https://tsup.egoist.dev/)

**Playwright / Browser Automation:**
- [Playwright — Locators](https://playwright.dev/docs/locators), [Codegen](https://playwright.dev/docs/codegen), [Extensibility](https://playwright.dev/docs/extensibility)
- [Playwright selectors best practices 2026 — BrowserStack](https://www.browserstack.com/guide/playwright-selectors-best-practices)
- [Chrome DevTools Recorder Reference](https://developer.chrome.com/docs/devtools/recorder/reference)

**Root-import DevTools UX:**
- [TanStack Query DevTools](https://tanstack.com/query/latest/docs/framework/react/devtools) + [TanStack Router DevTools](https://tanstack.com/router/latest/docs/framework/react/devtools)
- [Jotai DevTools #49 — production bundle bug](https://github.com/jotaijs/jotai-devtools/issues/49)

**Sensitive field detection:**
- [WCAG 1.3.5 Identify Input Purpose](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html)
- [Chrome DevTools Autofill Inspection](https://developer.chrome.com/docs/devtools/autofill)
- [1Password autofill confirmation](https://support.1password.com/autofill-confirmation/)

**기존 agrune 코드베이스 (직접 읽음, HIGH):**
- `/Users/chenjing/dev/agrune/agrune/.planning/PROJECT.md` — v0.5 kickoff, Key Decisions 2026-04-19
- `packages/core/src/{index,manifest}.ts` — `PageTarget`/`PageSnapshot`/`AgruneManifest` v2
- `packages/runtime/src/{dom-scanner,manifest-builder}.ts` + `runtime/{page-agent-runtime,command-handlers,snapshot}.ts`
- `packages/browser/src/cdp-runtime-injector.ts` (lines 35–276)
- `packages/mcp/src/{mcp-tools,tools,public-shapes,devtools-server}.ts`
- `packages/devtools/src/panel.ts`

### Secondary (MEDIUM confidence)

**LLM browser automation 토큰 벤치마크:**
- [Playwright MCP — microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) + [TestCollab Playwright MCP vs CLI 비교](https://testcollab.com/blog/playwright-cli) (114k vs 27k tokens/task, 4x)
- [Stagehand](https://github.com/browserbase/stagehand) + [Stagehand vs Browser-use vs Playwright 2026 — NxCode](https://www.nxcode.io/resources/news/stagehand-vs-browser-use-vs-playwright-ai-browser-automation-2026)

**Supply chain 공격 사례:**
- [Sekoia — Chrome Extension supply chain 2025 (35+ 확장, 2.6M 사용자)](https://blog.sekoia.io/targeted-supply-chain-attack-against-chrome-browser-extensions/)
- [eSentire 악성 Chrome Extension 캠페인](https://www.esentire.com/security-advisories/update-malicious-chrome-extension-campaign)
- [TheHackerNews — ShadyPanda "clean 몇 년 후 flip" 패턴](https://thehackernews.com/2025/12/a-browser-extension-risk-guide-after.html)

**산업 비교/패턴:**
- [Zod vs Valibot vs ArkType 2026 — Pockit Blog](https://pockit.tools/blog/zod-valibot-arktype-comparison-2026/)
- [dts-bundle-generator vs rollup-plugin-dts vs tsup 2026 — PkgPulse](https://www.pkgpulse.com/blog/dts-bundle-generator-vs-rollup-plugin-dts-vs-tsup-dts-2026)
- [How We Rebuilt React DevTools with Replay Routines](https://blog.replay.io/how-we-rebuilt-react-devtools-with-replay-routines)
- [What Makes Playwright So Robust? — InjectedScript ~2000 LOC](https://lorenzhw.substack.com/p/what-makes-playwright-so-robust-i)
- [VWO Editor — DOM manipulation for React sites](https://engineering.wingify.com/posts/dom-manipulation-for-react-sites/)
- [mise Plugins registry 패턴](https://mise.jdx.dev/plugins.html) + [mise-plugins/registry](https://github.com/mise-plugins/registry)
- [Cypress Studio AI](https://docs.cypress.io/app/guides/cypress-studio)
- [Katalon Product Roundup January 2026 (AI Web Recording Agent)](https://katalon.com/resources-center/blog/katalon-product-roundup-january-2026)
- [Patterns.dev — List virtualization accessibility](https://www.patterns.dev/vanilla/virtual-lists/)

### Tertiary (LOW confidence — 구현 단계 validation 필요)

- "Per-selector 2% flakiness는 낙관적" — Playwright 커뮤니티 포럼 반복 언급, 공식 벤치마크 수치 부재
- Solo maintainer governance 임계 PR/주 — 업계 공개 수치 없음, ShadyPanda·Sekoia upper bound 추정
- React fiber field suffix 생성 정확한 규칙 — React 소스 내부, 미공개 안정 API 아님(prefix scan 방어 필수)
- Manifest registry cache lifetime 최적값 — weekly 기본값, 사이트별 drift rate 관찰 후 조정
- Recorder sensitive auto-detect precision/recall 실측값 — corpus 구축 후 측정

---
*Research completed: 2026-04-19*
*Ready for roadmap: yes*
