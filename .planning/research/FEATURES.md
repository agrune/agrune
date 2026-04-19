# Feature Research — v0.5 Manifest Pivot

**Domain:** AI-driven browser automation platform (manifest + root-import + MCP)
**Researched:** 2026-04-19
**Confidence:** HIGH (cross-referenced 20+ primary sources, all 6 feature areas covered)

## 0. Research Framing

v0.5는 inline `data-agrune-*` 어노테이션을 버리고 **manifest 기반 외부 매핑 + root-import 기반 프레임워크 통합**으로 피봇한다. 이 research는 "다른 제품/생태계는 이 여섯 개 메커니즘을 어떻게 구현하는가"에 대한 답을 모으고, 각 발견을 agrune의 현재 표면(MCP 11 tools, `PageTarget`/`PageSnapshot` 타입, devtools webapp, `CdpDriver`)에 정렬한 뒤 **Table Stakes / Differentiator / Anti-Feature**로 분류한다.

카테고리 정의:
- **Table Stakes** — 이 범주의 도구에 기대되는 기능. 없으면 "불완전" 낙인.
- **Differentiator** — agrune가 경쟁 제품(Playwright MCP, Stagehand, browser-use, Selenium IDE 등) 대비 실제로 차별화할 수 있는 축.
- **Anti-Feature** — 표면적으로 매력적이지만 agrune의 CDP-only·로컬 우선·deterministic 원칙과 충돌하거나 유지보수 비용이 폭발하는 것.

복잡도 평가 기준:
- **SMALL** — 기존 패키지 1~2개에 함수/타입 추가. `@agrune/core` 스키마 확장 + runtime 1곳 분기 수준.
- **MEDIUM** — 새 모듈/패키지 1개. 기존 타입에 non-trivial 변경. runtime ~ MCP ~ devtools 3축 걸침.
- **LARGE** — 새 서브시스템(registry, recorder 오버레이, React fiber reconciler shim 등). 다른 패키지 contract 재정의 수반.

---

## 1. 영역별 생태계 조사 요약

### 1.1 External Manifest / Element-Map 포맷

**조사 대상:** Playwright locators + Page Object Model + fixtures, Selenium IDE `.side` 포맷, Cypress commands.js + Cypress Studio, TestCafe page models, Appium UiSelector, Stagehand, Playwright MCP, browser-use.

**핵심 발견 (cross-cutting):**

| 접근법 | 포맷 | Authoring 주체 | agrune 시사점 |
|---|---|---|---|
| Playwright POM | TypeScript/JS 클래스 — locator 필드가 코드 | 엔지니어 | 타입 안전성 OK, 비엔지니어 편집 불가 |
| Cypress commands | `commands.ts`에 `Cypress.Commands.add('login', …)` | 엔지니어 | 플로우·macro 친화적, 셀렉터 매핑은 별도 |
| Selenium IDE | `.side` JSON (사람 읽기 어려움), DOM 기록 중심 | 비엔지니어 (GUI) | 셀렉터가 CSS path 기반이라 DOM 변경에 취약 |
| TestCafe | JSON/JS 설정 + Page Model 클래스 | 엔지니어 | `data-testid` 중심 권장 |
| Appium | UiSelector 빌더 + XPath `contains()` + index | 엔지니어 | XPath index로 dynamic list 처리 |
| Playwright MCP | 런타임 accessibility snapshot (authoring 없음) | AI만 | manifest 없음 — 매번 LLM이 재발견 |
| Stagehand | 자연어 `act("click login")` → LLM이 selector 생성 후 **캐시** | 엔지니어 + LLM | 매니페스트 ≈ 캐시. 프롬프트가 source of truth |
| browser-use | a11y tree + vision + LLM | AI 전담 | 매니페스트 개념 없음 |

**"live manifest format that non-engineers can edit" 여부:**
- **완전 일치하는 제품 없음.** Selenium IDE `.side`는 GUI 생성 후 JSON 저장이라 가장 가깝지만 셀렉터가 CSS path 중심이라 유지보수는 여전히 엔지니어 몫.
- 가장 가까운 비교군은 enterprise integration 도구의 **declarative YAML manifest** (Ampersand 등). CI/CD로 배포되며 비엔지니어가 수정 가능하게 설계됨.
- **Stagehand 캐시 파일**은 자동 생성되지만 엔지니어도 JSON 편집이 가능 — 가장 실용적인 참고.

**Selector priority (Playwright codegen 2026 기준):**
1. `getByRole` — 의미 기반, DOM 변경에 강함
2. `getByText` — 사용자 가시 콘텐츠
3. `getByTestId` (`data-testid` 기본, env 변수로 변경 가능)
4. CSS / XPath — fallback

agrune는 여기에 **React fiber component-identity**를 추가해 refactor resilience를 한 단계 더 올릴 수 있음 (경쟁 제품 중 fiber reconciler를 selector로 쓰는 건 없음).

### 1.2 Root-Import DevTools 드롭인

**조사 대상:** TanStack Query devtools, Redux DevTools Extension, MobX-react-devtools, Formik devtools, Jotai devtools, TanStack Router devtools.

**UX 표면 공통 패턴:**

| 제품 | 진입점 | 토글 UX | Prod 동작 |
|---|---|---|---|
| TanStack Query | `<ReactQueryDevtools />` | 화면 코너 floating 로고 버튼, localStorage 기억 | `loadDevtools` 옵션 + `NODE_ENV` 체크 |
| TanStack Router | `<TanStackRouterDevtools />` | floating 버튼 | same |
| Redux DevTools | 브라우저 확장 + `composeWithDevTools` | 확장 패널 또는 standalone 앱 | 명시적 `__REDUX_DEVTOOLS_EXTENSION_COMPOSE__` 가드 |
| Jotai devtools | `<DevTools />` 컴포넌트 | floating 버튼 | **tree-shaking에만 의존하면 prod에 남는 버그 실사례 있음** — 명시적 `NODE_ENV !== 'production'` 가드 권장 |
| Formik devtools | 크롬 확장만 | 확장 패널 | 확장 안 깔면 사라짐 |

**공통 합의:**
- **Floating 코너 버튼**이 사실상 표준. 키보드 단축키도 흔함 (예: `Shift+Ctrl+D`).
- **localStorage로 열림 상태 기억**이 기본. 리로드 후에도 같은 탭에서 유지.
- **Prod 가드는 "tree-shaking 믿지 말고 명시적 env 체크"**가 Jotai issue #49에서 learned lesson으로 확립됨.
- Dynamic import + `React.lazy`로 prod 번들 0 bytes 보장이 모범 사례.

**agrune 시사점:**
- `<AgruneDevtools />`는 TanStack 계열 UX를 그대로 차용 (floating 버튼 + localStorage 상태).
- runtime loader와 devtools UI는 **분리된 prop**으로 토글 — runtime은 prod에 포함 가능, devtools는 dev-only가 디폴트.
- prod 빌드에서 runtime만 살리고 devtools UI는 dynamic import로 0-byte.

### 1.3 Recorder / Codegen

**조사 대상:** Playwright codegen, Cypress Studio (Cypress 15.4+ 내장), Selenium IDE, Katalon Recorder, Chrome DevTools Recorder panel.

**Selector 안정성 랭킹 휴리스틱:**

| 도구 | 우선순위 | AI/self-healing |
|---|---|---|
| Playwright codegen | role > text > testId > CSS > XPath (`PLAYWRIGHT_MCP_TEST_ID_ATTRIBUTE` env 설정 가능) | 없음. 순수 규칙 기반 |
| Cypress Studio (2026) | testId > text > role, **Studio AI가 DOM diff로 assertion 자동 제안** | before/after DOM snapshot + LLM |
| Selenium IDE | CSS path 위주. 여러 후보 생성하지만 우선순위 구성 제한 | 없음 (별도 AI self-healing 제품 있음) |
| Katalon Recorder (2026) | 자연어 기반 "Web Recording Agent" + AI Self-Healing — locator 실패 시 구조/시각/속성 분석해 updated locator 생성 | 강함. AI 전담 |
| Chrome DevTools Recorder | 내부적으로 여러 후보 저장, JSON 포맷으로 export — Puppeteer/Playwright로 replay | 없음 |

**UX 공통 패턴:**
- **"Record" 버튼 → 사용자가 실제 클릭 → 도구가 이벤트 listener로 capture**.
- Cypress Studio는 Studio AI가 "before/after snapshot"을 비교해 assertion을 제안 — DOM diff 기반.
- Playwright codegen은 record 도중 Inspector 창에 real-time으로 selector 생성.
- Chrome Recorder는 JSON 중간 포맷 → 여러 프레임워크 adapter.

**agrune 시사점:**
- in-app recorder 오버레이는 **TanStack devtools + Playwright codegen의 하이브리드** — devtools 웹앱 안에 record 모드 토글, 호스트 앱에서 사용자가 클릭하면 React fiber 경로로 component-identity 추출 + textContent 기록.
- **Selector 우선순위**: fiber path > role > text > testId > CSS. fiber가 있는 이유는 refactor 저항성.
- **Assertion auto-suggest**는 Cypress Studio 아이디어 차용 가능 — DOM diff → `wait`/`read` 제안.

### 1.4 Repeat / Template Primitive

**조사 대상:** Playwright `locator.filter()`, React Testing Library `getAllByRole`, Appium XPath `[index]`, TanStack Virtual discussion #290.

**핵심 발견:**

| 문제 | Playwright 접근 | RTL 접근 | Appium 접근 |
|---|---|---|---|
| 리스트 N개 중 "Alice"행 찾기 | `locator('li').filter({ hasText: 'Alice' })` | `getAllByRole('row').find(…)` | `//li[contains(text(), 'Alice')]` |
| 인덱스로 찾기 | `locator('li').nth(3)` | `getAllByRole('row')[3]` | `//li[3]` |
| visible만 필터 | `locator.filter({ visible: true })` | `queryAllByRole(…)` + 필터 | DOM 기반이라 제한적 |
| virtualized list (react-window/tanstack-virtual) | **scroll로 viewport 내 element만 잡힘** — 구조상 DOM에 없는 row는 locator 실패 | same limitation | 모바일에서는 `UiScrollable` 사용 |

**Virtualized list는 근본적 한계가 있음:**
- react-window·tanstack-virtual은 viewport 내 DOM node만 render.
- **해결책**: 자동 스크롤 후 재탐색, 또는 리스트 data state에 직접 접근 (React fiber props 경로로 접근 가능).
- Playwright는 이 문제에 대해 공식 해결책이 없고 "scroll 후 locator 재실행" 패턴이 일반적.

**agrune `defineRepeat` 설계 시사점:**
- manifest에 "this is a repeat"만 선언하고, **runtime이 textContent anchor 기반으로 N개 확장** — 각 인스턴스는 동일 target template의 `targetId#index` 또는 `targetId#anchor:"Alice"` 형태로 스냅샷에 등장.
- virtualized list 대응: **React fiber 기반 component-identity로 virtual list의 underlying data state에 접근**하는 경로를 추가 가능 — 이것이 있으면 DOM에 안 보이는 row도 manifest에서 노출 가능 (경쟁사 대비 강력한 차별화).
- 초기에는 **viewport 내 row만** 지원하고 auto-scroll 전략은 deferred.

### 1.5 Flow Macros / Composed Commands

**조사 대상:** Cypress `cy.login()` custom commands, Playwright fixtures, Mocha `before()`, k6 `group()`, Stagehand `act`/`agent` primitives, Playwright MCP의 token overhead.

**추상화 레벨 비교:**

| 도구 | 레벨 | LLM 호환성 |
|---|---|---|
| Mocha `before()` | hook — 테스트 앞에 자동 실행 | 낮음 (hook은 숨겨짐, LLM이 이해하기 어려움) |
| Cypress `cy.login(email, pw)` | custom command — 파라미터 있는 호출 | **높음** — 단일 호출, 파라미터 명시적 |
| Playwright fixtures | 의존성 주입 — test signature에 선언 | 중간 — 암묵적 활성화 |
| k6 `group('checkout', () => {…})` | 성능 측정용 그룹핑 | 낮음 — 단순 라벨 |
| Stagehand `agent.execute(task)` | 자연어 task — LLM이 내부적으로 act 반복 | 최고 — 자연어 그대로 |

**Playwright MCP vs Playwright CLI 토큰 벤치마크:**
- MCP 방식: 약 114,000 tokens per task
- CLI 방식: 약 27,000 tokens per task (**4x 감소**)
- 주요 절감원: `includeSnapshot: false` + 여러 step을 한 call로 묶기 (70~80% 감축).
- **함의**: snapshot-per-step 루프가 LLM 비용의 주범 → macro로 묶으면 압도적으로 저렴.

**LLM caller에게 최적 추상화 레벨:**
- **명시적 파라미터를 가진 named command** (Cypress `cy.login(email, pw)` 패턴)이 최고.
- 자연어 agent (Stagehand)는 강력하지만 deterministic 보장 부족 — agrune의 deterministic 원칙과 충돌.
- **agrune `defineMacro({id, params, steps})`는 Cypress custom command 모델을 MCP tool로 노출** — `agrune_macro` 단일 tool이 `macroId` + `params`를 받도록.

**agrune 시사점:**
- `defineMacro` 시 MCP tool 등록에 **macro 이름을 description에 포함**해 LLM이 planning 단계에서 snapshot 없이 macro 직접 호출 가능.
- Macro 내부 단계는 snapshot을 찍지 않음 — `targetId`가 manifest compile 시점에 고정됨.
- **결과**: 로그인 같은 flow는 snapshot 1회도 없이 실행 → 토큰 10x 감축 실사례 가능.

### 1.6 Sensitive Field Detection

**조사 대상:** Chrome autofill 엔진, 1Password autofill, WCAG 1.3.5 Identify Input Purpose, HTML autocomplete 속성.

**자동 감지 신호 우선순위:**

| 신호 | 신뢰도 | 출처 |
|---|---|---|
| `type="password"` | 100% | HTML spec |
| `autocomplete="cc-number"`, `cc-csc`, `cc-exp` | 95%+ | WCAG 1.3.5 + HTML Living Standard |
| `autocomplete="current-password"`, `new-password` | 95%+ | same |
| `name`/`id` 토큰 매칭 (`password`, `pwd`, `cvv`, `ssn`) | 80% | Chrome FormFieldClassifier 규칙 기반 |
| ML 기반 label/placeholder 분석 | 70~90% | Chrome "Form Understanding" ML model (2020, 100M+ forms 학습) |

**WCAG 1.3.5 (Level AA):** 53+ 표준 autocomplete 토큰이 정의되어 있고, 이 중 개인정보·금융·인증 관련 토큰은 사실상 sensitive 정의와 1:1 매칭.

**1Password 접근:**
- 페이지 field 전수 heuristic 분석 → 추천 표시.
- user confirmation prompt 옵션 — 민감 항목은 click-to-fill 강제.
- 실제 detection 알고리즘은 비공개 (private), 결과 UX만 관찰 가능.

**Chrome 접근:**
- rule-based (autocomplete attr → name/id → label) + ML fallback.
- 오분류율 30~40% 감소가 ML 도입 효과.

**agrune 시사점:**
- **manifest schema의 `sensitive: true` flag**는 명시적 선언이라 신뢰도 100%.
- **AI auto-detect**는 manifest 작성 시 (recorder 또는 AI authoring skill)만 동작 — runtime이 아님.
- 감지 규칙 우선순위: `type="password"` → `autocomplete="cc-*|*-password"` → name/id 토큰 → placeholder 텍스트.
- **Runtime 마스킹 범위**: target의 `valuePreview` 필드를 `***`로 교체, `textContent` 제외, devtools 로그에서 value arg 마스킹, snapshot에 `sensitive: true` 그대로 노출 (이미 `PageTarget.sensitive: boolean` 필드 존재 — `@agrune/core` index.ts:85).

---

## 2. Feature Landscape

### 2.1 Table Stakes (v0.5에 반드시 있어야 함)

사용자(= AI 에이전트, 그리고 manifest 작성하는 엔지니어)가 이 카테고리에 기대하는 베이스라인. 없으면 "불완전" 낙인.

| Feature | Why Expected | Complexity | Dependencies | 구현 노트 |
|---|---|---|---|---|
| 타입 안전 manifest authoring (`defineTarget`) | Playwright POM·TestCafe page model은 모두 타입 안전. 타입 없는 manifest는 2025년 기준 불합격 | SMALL | `@agrune/core` manifest.ts 확장 | 이미 `AgruneManifest`/`AgruneTargetEntry` 존재 — v0.5 schema로 확장 |
| CSS selector fallback | 외부 사이트는 React fiber 접근 불가. Playwright·Selenium·Cypress 다 CSS 지원 | SMALL | runtime dual resolver | 현재 `PageTarget.selector: string` 필드 유지하면 그대로 이월 |
| Text/role 기반 selector | Playwright getByRole/getByText가 2026 표준. LLM도 이걸 기대 | MEDIUM | runtime resolver | dom-scanner 확장 — ARIA role + accessible name 추출 |
| Root-import floating devtools 버튼 | TanStack 계열이 깐 표준 UX | SMALL | `@agrune/react` 신규 패키지 | localStorage 상태 기억, Shift+A 같은 단축키 옵션 |
| Dev/prod 분리 번들링 | Jotai devtools prod 버그 실사례로 모든 devtools 라이브러리가 채택 중 | SMALL | `@agrune/react` 빌드 설정 | dynamic import + NODE_ENV 명시적 가드 |
| Recorder 기본 UX (record/stop/export) | Cypress Studio·Selenium IDE·Chrome Recorder 모두 제공 | MEDIUM | devtools webapp + page runtime 협업 | 기존 `CommandBroker`/`HitlController`에 record mode 이벤트 추가 |
| Basic repeat/list 지원 | Playwright `locator.filter()` 등 모든 도구 제공 | MEDIUM | runtime snapshot 확장 | `defineRepeat` template + textContent anchor 기반 확장 |
| Named macro/flow | Cypress custom command 패턴이 사실상 표준. LLM 토큰 비용 문제로 필수 | MEDIUM | MCP tool 추가 + manifest schema | `defineMacro` + `agrune_macro` MCP tool |
| Sensitive field 마스킹 | 금융·인증 자동화 대상이면 필수. Chrome/1Password가 기준점 | SMALL | 기존 `PageTarget.sensitive` 활용 | valuePreview 마스킹 + command log 마스킹 + snapshot sensitive reason |
| Manifest validation (CLI) | Kubernetes kubectl·Playwright config·ESLint 다 제공 | SMALL | `agrune manifest validate` | schema zod + AST-level lint |
| Component-identity selector (React fiber) | React ecosystem에서 refactor resilience 기대. 경쟁 제품 없지만 React 생태에선 "당연히 있어야" 느낌 | LARGE | `@agrune/react` + runtime dual resolver | fiber reconciler 접근 → componentPath + key 경로 추출 |

**Table Stakes 총계:** 11개. 복잡도 합계: SMALL 5 + MEDIUM 5 + LARGE 1.

### 2.2 Differentiators (경쟁 우위)

agrune를 실제로 차별화하는 축. Core Value(CDP-only·로컬 우선·deterministic)와 정렬.

| Feature | Value Proposition | Complexity | Dependencies | 구현 노트 |
|---|---|---|---|---|
| **Fiber-based component-identity** | Playwright·Selenium·Stagehand 모두 CSS/role 기반. React 앱에서 refactor 내성 1단계 위 | LARGE | `@agrune/react` | React fiber → component path + key 기반 식별. owned app 한정 |
| **Manifest-as-single-source** (internal + external 동일) | Selenium IDE는 external, Playwright POM은 internal — 같은 멘탈 모델로 양쪽 다루는 도구 없음 | MEDIUM | manifest schema + loader | URL pattern → manifest routing. route scoping 필드 필요 |
| **Macro as MCP tool** (flow 1회 호출) | Playwright MCP vs CLI 벤치마크 기준 4x 토큰 감축. Stagehand agent는 비결정적 — determinist + named macro가 agrune만의 포지션 | MEDIUM | MCP tool dynamic registration | `agrune_macro`가 macro 목록을 `agrune_snapshot`/`agrune_sessions`처럼 노출 |
| **Declarative repeat primitive** | Playwright `locator.filter()`는 코드, Appium `[index]`는 XPath — **manifest 차원의 template 선언**은 없음 | MEDIUM | runtime repeat expander | textContent anchor로 N개 PageTarget 생성, virtual list는 이후 단계 |
| **In-app recorder with fiber capture** | Cypress Studio는 CSS, Katalon은 AI self-healing, Chrome Recorder는 JSON — **fiber 기반 capture는 없음** | LARGE | devtools + React dev hook | React DevTools의 `__REACT_DEVTOOLS_GLOBAL_HOOK__`을 경유하거나 `@agrune/react`에서 자체 훅 주입 |
| **Community registry (GitHub-as-registry)** | VS Code extensions, MCP registries, awesome-lists가 검증한 패턴 | MEDIUM (single repo) → LARGE (governance) | CLI `agrune maps add/types` | 초기 `github.com/agrune/maps` 단일 repo, validated review → 이후 distributed ownership |
| **Sensitive auto-detect during authoring** | 1Password·Chrome은 runtime에서 detect. agrune는 **manifest 작성 시점**에서 detect → 배포된 manifest가 안전 | MEDIUM | recorder + AI skill 내 heuristic | `type=password` → `autocomplete` → name/id 토큰. runtime overhead 0 |
| **Dual selector resolution (fiber + CSS)** | 경쟁 제품은 selector 1개 path — agrune는 owned 프로젝트에선 fiber, 외부 사이트에선 CSS, 자동 전환 | MEDIUM | runtime resolver | manifest가 `fiberPath` + `cssSelector` 둘 다 선택 가능하게 |
| **Token-efficient snapshot** (outline + group 확장) | 현재 `agrune_snapshot`의 outline mode는 이미 이 방향. v0.5에서 manifest 기반이라 **컴파일타임에 group 구조가 고정** → outline이 더 안정적 | SMALL | 기존 snapshot 유지 + manifest 연동 | 이미 구현됨. 확장은 manifest의 group name/desc를 snapshot에 반영 |

**Differentiators 총계:** 8개. 복잡도 합계: SMALL 1 + MEDIUM 5 + LARGE 2.

### 2.3 Anti-Features (명시적 non-goal)

요청되기 쉬우나 v0.5에서 빌드하면 안 되는 것들. 대안 명시.

| Anti-Feature | Why Requested | Why Problematic | 대안 |
|---|---|---|---|
| **Natural-language runtime agent** (Stagehand `act("click login")` 스타일) | "LLM이 manifest 없이 알아서 하면 편하잖아" | Deterministic 원칙 파괴, 토큰 비용 폭발, macOS AX 확장 준비에도 역행. 테스팅/디버깅 재현 불가 | manifest + macro 조합으로 동일 UX를 deterministic하게 |
| **Vision-based fallback selector** (screenshot → LLM → coordinate) | "셀렉터가 깨지면 vision으로라도" | v1.0 synthesis에서 NO-GO 확정 — confidence UX 부담, 로컬 성능 리스크 | self-healing retry → 명시적 ERROR → 사람/AI가 manifest 업데이트 |
| **Runtime self-healing selector** (Katalon AI self-healing 스타일) | "Selenium IDE도 locator 깨지면 AI가 고쳐준다" | 런타임에 비결정적 분기 생김. v1.1 `RecoverySupervisor` 철학(명시적 state machine)과 충돌 | Build-time manifest lint (기존 `annotation-lint` 확장) + 명시적 ERROR |
| **YAML-only manifest (코드 없이)** | "비엔지니어가 JSON/TS 싫어함" | agrune target은 타입 풍부 (ActionKind, DragPlacement, sensitive 등) — YAML로는 타입 안전성 상실. Ampersand/Kubernetes 사례 있지만 그들은 string-heavy 포맷 | `defineManifest` TS SDK + zod validation. YAML export는 display-only 옵션으로 v0.6 고려 |
| **브라우저 확장 / sidepanel UI** | "Chrome 확장 있으면 설치 쉬움" | 2026-04-15 extension mode 완전 제거 결정. CDP-only 원칙 | `@agrune/devtools` standalone 웹앱이 이미 존재 |
| **Cloud-based manifest registry backend** | "검색·버전관리·평점 달린 marketplace" | 로컬 우선 원칙 충돌, 유지보수 비용, 신뢰 이슈 | GitHub-as-registry (awesome-list 스타일). `agrune maps add` → git clone + zod validate |
| **Multi-framework root-import v0.5에 Vue/Svelte/Solid 모두** | "React만 지원하면 구멍" | fiber-equivalent를 각 프레임워크마다 구현하면 복잡도 폭발. v0.5 branch 폐기 가능성 증가 | React 먼저, CSS fallback은 즉시 동작하므로 v0.5 출하 가능. Vue/Svelte는 v0.6+ |
| **Browser extension based recorder** (Selenium IDE 스타일) | "확장 설치하면 바로 기록됨" | extension mode 제거 결정. 유지보수·분포 복잡도 | devtools webapp + `@agrune/react` in-app recorder |
| **Runtime LLM call** (Stagehand 내부처럼) | "agrune runtime이 element 못 찾으면 LLM한테 물어보자" | 네트워크 의존, 개인정보 원칙 위배, 비결정적 | manifest validate at build-time, runtime은 pure |
| **Visual regression snapshot diff** | "테스트 도구는 screenshot diff 있어야지" | agrune는 테스팅 도구 아님 (AI 에이전트용 자동화 플랫폼). 원칙과 무관 | 스코프 밖 — 원한다면 Playwright 함께 사용 |

**Anti-Features 총계:** 10개. 모두 이유 명확, 대안 제시됨.

---

## 3. Feature Dependencies

```
manifest schema (defineTarget/defineRepeat/defineMacro)
    ├──required by──> CSS selector fallback
    ├──required by──> Text/role selector
    ├──required by──> Component-identity selector
    ├──required by──> Manifest validation (CLI)
    ├──required by──> Repeat primitive
    ├──required by──> Macro runner
    └──required by──> Sensitive flag

@agrune/react root-import package
    ├──required by──> Floating devtools button
    ├──required by──> In-app recorder (fiber capture)
    ├──required by──> Component-identity selector
    └──enhances──────> Dev/prod bundle split

runtime dual selector resolver
    ├──requires──────> manifest schema
    ├──requires──────> CSS selector fallback
    └──requires──────> Component-identity selector

In-app recorder
    ├──requires──────> @agrune/react root-import
    ├──requires──────> devtools webapp (기존)
    ├──requires──────> CommandBroker (기존 v1.1)
    └──enhances──────> Sensitive auto-detect

Macro runner
    ├──requires──────> manifest schema (defineMacro)
    ├──requires──────> MCP tool registration 확장
    └──conflicts─────> Natural-language runtime agent (anti)

Repeat primitive
    ├──requires──────> manifest schema (defineRepeat)
    ├──requires──────> runtime snapshot expander
    └──enhances──────> token-efficient snapshot

Registry (GitHub-based)
    ├──requires──────> manifest schema (stable)
    ├──requires──────> CLI agrune maps add/types
    └──enhances──────> Community manifest 재사용

Sensitive masking
    ├──requires──────> manifest schema (sensitive flag)
    ├──requires──────> runtime PageTarget.sensitive (이미 존재)
    ├──enhances──────> In-app recorder (auto-detect)
    └──enhances──────> devtools command log
```

### 핵심 의존성 노트

- **manifest schema가 모든 것의 뿌리.** Phase 1에서 stable 시켜야 다른 Phase 막히지 않음. zod schema + TS 타입 이중 정의.
- **`@agrune/react`는 3대 축** (floating 버튼 / fiber selector / recorder capture)을 동시에 열어줌. 초기 투자 비용 높지만 lock-in 크다.
- **runtime dual resolver는 CSS fallback이 먼저** 동작하게 만들면 외부 사이트 manifest는 React 패키지 없이도 부분 동작 → Phase 분리 가능.
- **Macro와 Natural-language agent는 mutually exclusive design choice** — macro 중심으로 가면 token efficient + deterministic. agent 방향 가면 Stagehand 됨.
- **Registry는 manifest schema가 stable해진 뒤** 열어야 함 — 초기 공개 후 schema 변경은 마이그레이션 지옥.

---

## 4. MVP Definition (v0.5 범위)

### 4.1 v0.5에서 출하해야 하는 것 (MUST)

내부 milestone "v0.5 Manifest Pivot"의 definition of done.

- [x] `@agrune/manifest` SDK 타입 안전 (`defineManifest`/`defineTarget`/`defineRepeat`/`defineMacro`) — **필수**: 이게 없으면 나머지 다 막힘.
- [x] `@agrune/react` root-import + floating devtools 버튼 — **필수**: 피봇의 사용자 약속.
- [x] Component-identity selector (React fiber 경로) — **필수**: refactor 저항성이 없으면 inline annotation 대비 이점 없음.
- [x] CSS selector fallback — **필수**: 외부 사이트 커버.
- [x] Runtime dual selector resolver — **필수**: 둘 다 있어도 runtime이 못 고르면 무의미.
- [x] 기본 repeat primitive (textContent anchor, viewport 내 row만) — **필수**: 외부 사이트(YouTube 피드, Notion 목록) 타겟이라 필수.
- [x] Named macro runner + `agrune_macro` MCP tool — **필수**: 토큰 비용 대응 + 로그인 같은 복합 플로우.
- [x] Sensitive flag + 런타임 마스킹 — **필수**: `PageTarget.sensitive` 이미 존재하니 manifest 연결만.
- [x] CLI `agrune manifest dev/validate` — **필수**: authoring loop.
- [x] DevTools 웹앱 recorder 오버레이 (기본 record/stop/export) — **필수**: 피봇의 사용자 UX.
- [x] AI authoring skill 재작성 (manifest 버전, sensitive auto-detect 포함) — **필수**: Claude Code/Codex 하네스에 필요.
- [x] Inline `data-agrune-*` 스캔 경로 runtime에서 제거 — **필수**: 단일 경로 원칙.

### 4.2 v0.5 후기 또는 v0.6 (SHOULD)

- [ ] `agrune maps add/types` CLI — registry 초기 수동 유지 단계면 먼저 `agrune manifest` 쪽부터 완성.
- [ ] Registry `github.com/agrune/maps` 공개 — schema stable 확인 후.
- [ ] `agrune manifest submit` — PR 자동화. Registry 공개 후 수동 PR 경험 누적 후.
- [ ] Virtualized list 대응 (fiber 기반 data state 접근) — 초기엔 limitation으로 문서화.
- [ ] Route scoping 세부 (wildcard URL pattern, A/B route 등) — 기본 exact/prefix 매칭 먼저.
- [ ] Assertion auto-suggest (Cypress Studio 스타일 DOM diff) — recorder 기본 기능 먼저.

### 4.3 v0.6+ (FUTURE)

- [ ] `@agrune/vue`, `@agrune/svelte`, `@agrune/solid` root-import 패키지.
- [ ] YAML export for display/review — TS가 source of truth.
- [ ] 분산 ownership registry (multiple validated reviewers) — 현재는 단일 reviewer.
- [ ] macOS AX 확장과의 unified manifest — 현재 DB: PROJECT.md Out of Scope에 의해 v0.6+ 연기.

---

## 5. Feature Prioritization Matrix

| Feature | User Value | Impl. Cost | Priority |
|---|---|---|---|
| `defineManifest`/`defineTarget` SDK | HIGH | SMALL | **P1** |
| `@agrune/react` root-import + floating button | HIGH | MEDIUM | **P1** |
| Component-identity selector (fiber) | HIGH | LARGE | **P1** |
| CSS selector fallback | HIGH | SMALL | **P1** |
| Runtime dual resolver | HIGH | MEDIUM | **P1** |
| `defineRepeat` primitive (기본) | HIGH | MEDIUM | **P1** |
| `defineMacro` + MCP tool | HIGH | MEDIUM | **P1** |
| Sensitive flag + 마스킹 | HIGH | SMALL | **P1** |
| CLI `agrune manifest dev/validate` | HIGH | SMALL | **P1** |
| DevTools recorder overlay (기본) | HIGH | MEDIUM | **P1** |
| AI authoring skill 재작성 | HIGH | MEDIUM | **P1** |
| Inline annotation 경로 제거 | HIGH | SMALL | **P1** |
| Sensitive auto-detect (authoring 시점) | MEDIUM | MEDIUM | **P2** |
| Token-efficient snapshot 유지 | HIGH (유지) | SMALL | **P1** (유지만) |
| GitHub registry 공개 | MEDIUM | MEDIUM | **P2** |
| `agrune maps add/types` CLI | MEDIUM | SMALL | **P2** |
| Virtualized list (fiber data state) | MEDIUM | LARGE | **P3** |
| Assertion auto-suggest (recorder) | LOW | MEDIUM | **P3** |
| Vue/Svelte/Solid root-import | LOW (지금) | LARGE | **P3** |
| YAML export | LOW | SMALL | **P3** |

**P1 합계:** 13개 — v0.5 MVP 범위와 일치.
**P2 합계:** 3개 — v0.5 후반 또는 v0.6 초반.
**P3 합계:** 4개 — v0.6+.

---

## 6. Competitor Feature Analysis

| Feature | Playwright + POM | Stagehand | Playwright MCP | Selenium IDE | Cypress Studio | **agrune v0.5 (계획)** |
|---|---|---|---|---|---|---|
| Manifest format | TS classes | TS + runtime cache | 없음 (live a11y) | `.side` JSON (GUI) | commands.ts + cmd recording | **타입 안전 TS `defineManifest`** |
| Non-engineer authoring | No | No | N/A | Yes (GUI) | Partial (studio GUI) | **In-app recorder + AI authoring** |
| Selector priority | role > text > testId > CSS | LLM이 결정 (캐시) | a11y role (LLM) | CSS path | testId > text > role | **fiber > role > text > testId > CSS** |
| Root-import drop-in | No (별도 config) | No (SDK 통합) | No | No (extension) | No (별도 실행) | **`<AgruneDevtools />` 1줄** |
| Recorder | codegen CLI | 없음 | 없음 | 내장 | 내장 (Studio AI) | **devtools webapp 오버레이** |
| Self-healing | No | cached retry | 없음 | No | No | **명시적 ERROR + manifest lint** (anti-feature 회피) |
| Dynamic list/repeat | `locator.filter()` + code | LLM 자연어 | a11y tree | 수동 CSS | 수동 | **`defineRepeat` declarative** |
| Composed flow | fixtures | `agent.execute(task)` | step-by-step | command sequence | command group | **`defineMacro` → MCP tool** |
| Sensitive masking | No (테스트 도구라 안 중요) | No | No | No | No | **`sensitive: true` flag + 자동 감지** |
| Registry | No | No | MCP 생태계 | No | Cypress Cloud (paid) | **GitHub-as-registry** |
| Local-first | Yes | No (Browserbase cloud) | Yes | Yes | Hybrid | **Yes (CDP-only)** |
| Token efficiency (LLM) | N/A | 캐시 기반 | 114k tokens/task | N/A | N/A | **27k급 기대 (macro + outline)** |

**해석:**
- agrune는 **fiber selector + declarative repeat + named macro**의 조합이 경쟁 제품과 겹치지 않음.
- Playwright MCP가 토큰 측면에서 최대 위협인데, 매번 snapshot이라는 구조적 비용 때문에 agrune의 manifest-compile-time 접근이 정량적으로 앞설 여지 있음.
- **Stagehand가 "LLM native" 포지션을 가져감** — agrune는 "deterministic + LLM-callable" 포지션으로 차별화 (비결정적인 Stagehand agent와 명확히 다른 제품).

---

## 7. Downstream Consumer Notes

### 로드맵 Phase 분할 힌트

1. **Phase: manifest schema + CLI validate** (SMALL — 모든 것의 전제)
2. **Phase: runtime dual resolver + CSS fallback** (MEDIUM — 외부 사이트 일단 동작)
3. **Phase: `@agrune/react` root-import + fiber selector** (LARGE — 피봇의 핵심)
4. **Phase: macro + MCP tool 확장 + sensitive** (MEDIUM — LLM 사용자 가치)
5. **Phase: repeat primitive** (MEDIUM — 외부 사이트 리스트 커버)
6. **Phase: devtools recorder overlay + AI skill 재작성** (MEDIUM — authoring UX)
7. **Phase: inline annotation 경로 제거 + 문서 정리** (SMALL — 단일 경로 확정)
8. **Phase: registry 공개 + maps CLI** (MEDIUM — 외부 공개 단계, v0.5 후반)

### 기존 agrune 자산 재활용 맵

| v0.5 신규 기능 | 재활용 대상 | 노트 |
|---|---|---|
| manifest schema | `@agrune/core/manifest.ts` | 기존 `AgruneManifest` v2에서 v3로 bump. `AgruneTargetEntry` 확장 |
| runtime loader | `@agrune/runtime/manifest-builder.ts` | 기존은 DOM scan 결과 → manifest. 역방향 manifest → target descriptor 추가 |
| dual resolver | `@agrune/runtime/runtime/snapshot.ts`의 `resolveRuntimeTarget` | 기존 targetId 파싱 로직 확장 |
| macro runner | `@agrune/mcp/mcp-tools.ts` | 11 tools에 `agrune_macro` 추가. `handleToolCall`이 macro steps 순차 실행 |
| recorder overlay | `@agrune/devtools/src/panel.ts` + `CommandBroker` | 기존 subscribe/HITL 인프라에 record 이벤트 추가 |
| sensitive 마스킹 | 기존 `PageTarget.sensitive` + devtools `CommandEvent.args` | 새 필드 불필요, masking layer만 |
| fiber capture | 신규 `@agrune/react` 패키지 | `__REACT_DEVTOOLS_GLOBAL_HOOK__` 대신 자체 hook — 버전 안정성 |

### Quality Gate 확인

- ✓ 카테고리 명확 (Table Stakes 11 / Differentiators 8 / Anti-features 10, 이유+대안)
- ✓ 복잡도 라벨 (SMALL/MEDIUM/LARGE) 각 feature에 부착
- ✓ 기존 agrune 의존성 명시 (재활용 맵 섹션)
- ✓ UX 패턴 실제 제품 인용 (TanStack Query devtools, Cypress Studio, Playwright codegen, 1Password, Chrome autofill, Stagehand, Katalon Recorder, Appium UiSelector)

---

## 8. Sources

**Selectors / Manifest / Locators:**
- [Playwright — Locators](https://playwright.dev/docs/locators)
- [Playwright — Test Generator (codegen)](https://playwright.dev/docs/codegen)
- [Playwright Selectors Best Practices 2026 — BrowserStack](https://www.browserstack.com/guide/playwright-selectors-best-practices)
- [Page Object Model with Playwright: Tutorial 2026 — BrowserStack](https://www.browserstack.com/guide/page-object-model-with-playwright)
- [TestCafe Best Practices — testcafe.io](https://testcafe.io/documentation/402836/guides/best-practices/best-practices)
- [Appium XPath Locators — Tricentis](https://www.tricentis.com/learn/testing-appium-xpath-locators)
- [Effective Locator Strategies in Appium — BrowserStack](https://www.browserstack.com/guide/locators-in-appium)

**Recorders / Codegen:**
- [Cypress Studio AI — Cypress Documentation](https://docs.cypress.io/app/guides/cypress-studio)
- [Cypress Studio: No-Code Test Generation Now Built In](https://www.cypress.io/blog/cypress-studio-no-code-test-generation-now-built-in)
- [Selenium IDE — selenium.dev](https://www.selenium.dev/selenium-ide/)
- [Katalon Recorder — katalon.com](https://katalon.com/katalon-recorder-ide)
- [Katalon Product Roundup January 2026](https://katalon.com/resources-center/blog/katalon-product-roundup-january-2026)
- [Chrome DevTools Recorder Reference](https://developer.chrome.com/docs/devtools/recorder/reference)

**Root-Import DevTools:**
- [TanStack Query DevTools — tanstack.com](https://tanstack.com/query/latest/docs/framework/react/devtools)
- [TanStack Router DevTools](https://tanstack.com/router/latest/docs/framework/react/devtools)
- [Jotai DevTools — jotai.org](https://jotai.org/docs/tools/devtools)
- [Jotai DevTools in production (issue #49)](https://github.com/jotaijs/jotai-devtools/issues/49)
- [Redux DevTools — github.com/reduxjs](https://github.com/reduxjs/redux-devtools)
- [Formik DevTools — petrenkoVitaliy](https://github.com/petrenkoVitaliy/formik-devtools)

**LLM Browser Automation / MCP:**
- [Playwright MCP — github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP Server Guide 2026 — TestCollab](https://testcollab.com/blog/playwright-mcp)
- [Playwright CLI: Token-Efficient Alternative to MCP](https://testcollab.com/blog/playwright-cli)
- [Stagehand — github.com/browserbase/stagehand](https://github.com/browserbase/stagehand)
- [Stagehand — browserbase.com/stagehand](https://www.browserbase.com/stagehand)
- [Stagehand vs Browser Use vs Playwright 2026 — NxCode](https://www.nxcode.io/resources/news/stagehand-vs-browser-use-vs-playwright-ai-browser-automation-2026)
- [Browser-Use — github.com/browser-use/browser-use](https://github.com/browser-use/browser-use)

**Composed Flows:**
- [Custom Commands in Cypress — docs.cypress.io](https://docs.cypress.io/api/cypress-api/custom-commands)
- [User Authentication with Cypress and Playwright — Kishor Munot (Medium)](https://kishor-munot.medium.com/user-authentication-in-automation-with-cypress-and-playwright-c87bc75c136e)
- [k6 Testing Library (Playwright-compatible)](https://github.com/grafana/k6-jslib-testing)

**Sensitive Field Detection:**
- [Chrome DevTools Autofill Inspection](https://developer.chrome.com/docs/devtools/autofill)
- [Chrome Form Auto-Filling Techniques — w3tutorials](https://www.w3tutorials.net/blog/how-does-form-auto-filling-in-the-browser-work/)
- [MDN — Turning off form autocompletion](https://developer.mozilla.org/en-US/docs/Web/Security/Securing_your_site/Turning_off_form_autocompletion)
- [1Password — Manage autofill confirmation prompts](https://support.1password.com/autofill-confirmation/)
- [1Password — Browser autofill security](https://support.1password.com/browser-autofill-security/)
- [WCAG 1.3.5 Identify Input Purpose — W3C](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html)
- [WCAG 1.3.5 Autocomplete Attributes — DigitalA11Y](https://www.digitala11y.com/what-are-the-autocomplete-attributes-defined-in-1-3-5-input-purpose/)

**Virtualized Lists:**
- [TanStack Virtual — tanstack.com](https://tanstack.com/virtual/latest)
- [TanStack Virtual Discussion #290: How to filter items in a virtual list](https://github.com/TanStack/virtual/discussions/290)

**Registry Patterns:**
- [Awesome Browser Automation — angrykoala](https://github.com/angrykoala/awesome-browser-automation)
- [Awesome MCP — abordage](https://github.com/abordage/awesome-mcp)

---

*Feature research for: agrune v0.5 Manifest Pivot*
*Researched: 2026-04-19*
*Confidence: HIGH — 20+ primary sources, 6 feature areas cross-referenced, anti-features aligned with PROJECT.md Out of Scope and Key Decisions*
