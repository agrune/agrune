# Pitfalls Research — v0.5 Manifest Pivot

**Domain:** Browser automation — manifest-based external mapping + React fiber root-import
**Researched:** 2026-04-19
**Confidence:** MEDIUM-HIGH (React fiber 세부와 Playwright codegen 문제는 HIGH, 구체적 "selector break rate" 수치는 LOW — 업계 공개된 수치가 정량화 부족)

이 문서는 agrune v0.5가 inline `data-agrune-*` 어노테이션을 폐기하고 manifest + root-import 기반으로 피봇하면서 **새로 도입되는 표면**에 특화된 함정을 다룬다. 일반적 "테스트 작성" 조언은 제외하고, 이 구체적 아키텍처가 실패할 수 있는 경로에만 집중한다.

---

## Critical Pitfalls

### Pitfall 1: React fiber field name suffix가 페이지/빌드마다 달라진다

**What goes wrong:**
`@agrune/react`가 DOM element → fiber 조회를 `el.__reactFiber$abc123` 식 고정 키로 파싱하면, 페이지마다 suffix가 달라서 selector resolver가 일부 페이지/빌드에서 `null`을 반환한다. 또한 React 16 이전 스타일의 `__reactInternalInstance$`를 체크하지 않으면 레거시 페이지 지원이 무음 실패한다.

**Why it happens:**
React는 DOM element에 fiber 참조를 저장할 때 **runtime마다 랜덤 suffix**를 붙인다 (`__reactFiber$` + 무작위 문자열). 같은 prefix라도 suffix는 React 버전·빌드·여러 React 인스턴스가 공존하는 페이지에서 다르다. 게다가 pre-Fiber React(16 이전)는 `__reactInternalInstance$` prefix를 쓰고, `__reactContainer$` (root)와 `__reactProps$` (props)도 별개 key다.

**How to avoid:**
- Prefix 기반 스캔을 쓴다:
  ```ts
  function getFiber(el: Element): Fiber | null {
    const key = Object.keys(el).find(k =>
      k.startsWith('__reactFiber$') ||
      k.startsWith('__reactInternalInstance$')
    )
    return key ? (el as any)[key] : null
  }
  ```
- 페이지에 여러 React 인스턴스(예: 메인 앱 + 임베드 위젯)가 있을 수 있으므로 **fiber가 속한 root를 추적**하고, `@agrune/react` 자체가 주입한 root와 동일한 root tree에서만 selector를 생성한다.
- `__REACT_DEVTOOLS_GLOBAL_HOOK__`의 `renderers` map을 검사해 React version을 탐지하고, 버전별 path 분기 가능하게 한다.
- 유닛테스트에 React 17/18/19 각 버전 pageload fixture를 둔다 (version matrix).

**Warning signs:**
- 특정 페이지에서만 fiber selector가 동작 안 함
- "works on my laptop" 리포트 (dev build는 되는데 prod build는 안 되는 경우, 단순 suffix 차이일 가능성)
- Third-party 위젯 포함된 페이지에서 selector 매칭률 급락

**Phase to address:** `@agrune/react` phase — resolver utility를 `getFiberFromNode`/`getReactRoot` 유틸로 격리, React version matrix CI 추가

---

### Pitfall 2: SSR/hydration 타이밍 중 fiber가 존재하지 않는다

**What goes wrong:**
Next.js App Router, Remix, Astro 등 SSR 환경에서 초기 HTML은 React가 hydrate하기 **전**에 이미 DOM에 존재한다. 이 윈도우에 agrune recorder나 runtime이 `getFiber(el)`을 호출하면 `null`이다. 사용자는 "페이지가 그려진 직후인데 왜 안 잡히지?" 상태가 된다. 더 미묘하게, streaming SSR/Suspense 경계는 나중에 hydrate되므로 **부분적으로 fiber가 있는 트리**가 된다.

**Why it happens:**
- SSR은 HTML만 보내고 fiber는 `ReactDOM.hydrateRoot` 이후에 attach된다
- React 18+ streaming Suspense는 boundary마다 hydrate 시점이 다르다
- 사용자가 페이지 로드 직후 recorder를 띄우면 hydrate 안 된 영역을 클릭할 수 있다

**How to avoid:**
- `@agrune/react` bootstrap은 `useEffect` 안에서 register — effect는 hydrate 후에만 실행됨
- Runtime loader는 **hydration barrier**를 구현: 첫 스캔을 `requestIdleCallback`+`document.readyState === 'complete'`+`root fiber 존재 확인` 셋 다 만족한 뒤
- Recorder 오버레이 상단에 "Waiting for app to hydrate…" 상태를 명시적으로 렌더하고, 미 hydrate 영역 클릭 시 "이 영역은 아직 준비 안됨" 토스트
- Selector resolution이 첫 시도 실패 시 CSS fallback으로 자동 강등 + 그 경고를 snapshot에 포함

**Warning signs:**
- 첫 snapshot의 target 수가 "이 페이지를 사람이 본 것"보다 현저히 적음
- "refresh 후 한 번 더 시도하면 잡힘" 패턴
- Streaming 섹션(dashboard의 Suspense skeleton)에서 selector 실패

**Phase to address:** `@agrune/react` phase + Runtime phase — hydration barrier가 두 계층에 모두 필요

---

### Pitfall 3: Prod-enabled root-import이 shipped 앱의 원격 제어 벡터가 된다

**What goes wrong:**
`<AgruneDevtools />`를 production 번들에 포함하면, 악의적 MCP 서버 또는 XSS 공격자가 같은 페이지에 실행되는 런타임을 통해 기업 내부 앱의 버튼을 대신 누를 수 있다. devtools/recorder가 dev-only여도 **runtime loader가 prod bundle에 포함**되면 manifest만 로드하면 같은 `getFiber`/`CDP-less in-page agent` 표면이 붙어버린다.

**Why it happens:**
현재 구조는 런타임이 `act/fill/drag` 같은 명령을 **페이지 내에서 실행 가능**하게 만든다. v1.1까지는 CDP connection이 있어야만 명령이 들어왔지만, root-import가 prod에 있으면 `window.postMessage`·DevTools Protocol shim·MCP 서버의 WebSocket 접근 등 부가 채널에서도 호출될 수 있는 위험이 생긴다. 게다가 React fiber 도입이 "DOM 주는 대로 선택"에서 "컴포넌트 의미로 선택"으로 바뀌므로, 공격자가 selector를 **구조 변경에 강건하게** 작성할 수 있다 — 방어가 훨씬 어려워진다.

**How to avoid:**
- **기본은 dev-only.** Prod 모드는 **명시적 opt-in 하나로는 부족**, 두 개의 독립 guard 요구:
  1. `AGRUNE_PROD_ENABLED=true` 환경변수 (빌드 타임)
  2. 런타임 `<AgruneDevtools allowProduction consentToken={hashed} />` 명시 prop + `localStorage['agrune.prod.consent']` 사용자 토큰
- Prod 모드에서는:
  - **명령 수신 채널 화이트리스트**: 어떤 origin/transport에서 들어온 명령만 실행하는지 코드에 고정 (기본: CDP-only, 동일 프로세스)
  - `act/fill/drag`에 **페이지 visual confirmation overlay** 강제 (사용자 탭이 포커스일 때만, 아니면 거부)
  - `sensitive:true` target은 prod에서 fill **완전 금지** (dev에서만 마스킹 로그와 함께 허용)
- Bundle analyzer CI 체크: prod build에 recorder/devtools 문자열 없음 검증
- Release notes에 "installing this on user-facing production is a remote-control surface" 경고를 README 1페이지 상단에

**Warning signs:**
- 사용자가 `<AgruneDevtools />`를 `_app.tsx`·`layout.tsx`에 무조건 두고 prod 배포
- "dev only인데 prod에서도 작동하네요" 포럼 질문
- MCP 서버 로그에 외부 IP의 접속 시도

**Phase to address:** `@agrune/react` phase — security guard + Registry phase — manifest schema에 `production.allow=false` 기본값을 강제

---

### Pitfall 4: 악의적 manifest 엔트리가 sensitive 필드를 로그에 유출한다

**What goes wrong:**
Community manifest 저장소에서 공격자가 `targets: [{ id: 'login-helper', selector: 'input[name=password]', sensitive: false }]`처럼 **sensitive 플래그를 꺼둔 채** PR을 낸다. Merge되면 해당 manifest를 쓰는 사용자의 입력·스냅샷이 agrune devtools UI의 명령 로그·에러 리포트·AI context에 평문으로 흘러간다. 비슷한 공격: `read` command이 DOM 전체를 dump하도록 selector를 `body`로 설정.

**Why it happens:**
- Manifest는 **외부 코드/설정**이므로 supply chain surface다
- 2025년에 Chrome Extension 생태계에서 최소 36개 확장이 supply chain attack으로 침해됨(eSentire·Sekoia 리포트) — 2.6M+ 사용자. agrune registry도 동일한 표면이 된다
- "Sensitive auto-detect"에 의존하면 공격자가 일부러 heuristic을 회피하는 selector를 쓴다 (`input[data-foo="bar"]`처럼 password 아닌 것처럼 보이는)
- Solo maintainer 모델은 PR review bottleneck이며, "reviewer fatigue" 이후 rubber-stamp merge 위험

**How to avoid:**
- **Defense in depth, registry만 믿지 않는다**:
  1. Runtime이 **DOM 속성 기반 auto-redaction**을 manifest의 `sensitive` 플래그와 **OR**로 적용 (`input[type=password]`, `autocomplete=cc-*|new-password|current-password|one-time-code`, `name*=password/cc/ssn/cvv` — browser heuristic)
  2. Sensitive 추정은 `sensitive:false`로도 **override 불가** — manifest가 false여도 DOM attribute이 sensitive면 여전히 마스킹
  3. Fill value·value preview·read result 모두 이 heuristic 통과한 뒤 저장/로그
- **Manifest 제출 시 자동 diff 스캐너**: PR 봇이 새/변경된 `sensitive:false` 엔트리를 자동 하이라이트, 매 PR에 `requires-human-review:sensitive` 라벨 강제
- **User-side allowlist**: `~/.agrune/trusted-maps.json` — 처음 manifest 로드 시 사용자 동의 프롬프트 (CLI에서 `agrune maps add` 시 diff 보여주고 확인)
- **Manifest 서명**: registry가 커지면 `agrune maps` CLI가 manifest hash를 트러스트 리스트와 대조, mismatch면 warning
- **Abandoned/stale 탐지**: manifest last-verified 날짜를 schema에 두고, 90일 초과 시 runtime이 경고

**Warning signs:**
- PR에서 기존 sensitive:true를 false로 낮추는 diff
- Read result가 예상보다 큰 payload (exfiltration 시도 가능)
- 같은 저자가 여러 manifest에 동시 PR (전형적 supply chain 전조)
- User bug report: "로그에 내 비밀번호가 보여요"

**Phase to address:** Registry phase (governance, PR bot, 트러스트 리스트) + Runtime phase (DOM-level redaction이 manifest 플래그를 override하는 것, 아니라 보강)

---

### Pitfall 5: DOM CSS selector drift — 배포마다 selector가 깨진다

**What goes wrong:**
Tailwind/CSS-in-JS 해시 클래스(`.css-1a2b3c`)를 포함한 selector, 동적 위치 기반 `:nth-child(n)`, 자동생성 ID(`#id-abc123`) 같은 것들은 사이트가 배포될 때마다 깨진다. Community 리포트와 Playwright codegen 문서는 "raw codegen output은 production-ready하지 않음" "selector drift가 AI-generated Playwright test의 top-3 실패 원인" 이라고 명시한다. 한 소스는 "per-selector 2% flakiness는 매우 낙관적"이라고 표현한다.

**Why it happens:**
- Playwright codegen·Testing Library·Selenium IDE 모두 같은 문제를 겪는다
- CSS-in-JS·Tailwind JIT·Next.js module CSS 모두 빌드마다 다른 해시 생성
- agrune recorder가 "눈에 보이는 unique selector"를 뽑으면 결국 같은 trap에 빠진다
- Fiber 기반은 이 문제를 **owned app**에서는 해결하지만, **외부 사이트**(YouTube, X, etc.)는 root-import 불가능 → CSS fallback만 남음

**How to avoid:**
- **Selector priority ladder**를 recorder와 manifest schema가 강제:
  1. Fiber component path + prop key (`App > Feed > Post[@postId=123] > LikeButton`) — owned app
  2. ARIA/role + accessible name (`role=button[name="Like"]`) — Playwright 권장과 일치
  3. `data-testid`/`data-agrune-id` (있을 때)
  4. Stable attribute (href, aria-label, type, name)
  5. Textual content (`text="Like"`) with i18n 경고
  6. **절대 금지**: class 해시, nth-child(숫자), auto-generated id
- Recorder가 후보 selector 여러 개 제시 + "이 사이트는 CSS 해시 클래스를 사용합니다 — 이 selector는 자주 깨질 수 있어요" 경고 표시
- Manifest schema에 `selector.fallbacks: string[]` — primary 실패 시 순차 시도
- **Self-healing check in CI**: `agrune manifest validate`가 live 사이트에 대해 selector 각각을 테스트하고 health score 반환. Registry가 이 score를 manifest 메타데이터로 저장해 community가 stale 여부 확인
- **Automated weekly verification**: registry bot이 각 manifest의 primary selector를 headless로 주기 검증, 3회 연속 실패 시 auto-open "stale" 이슈

**Warning signs:**
- Manifest health score 하락
- `TARGET_NOT_FOUND` 에러 급증 (특정 manifest에서)
- 사용자가 "어제는 됐는데 오늘 안 됨" 리포트

**Phase to address:** Manifest SDK phase (schema priority) + Runtime phase (fallback resolution) + Registry phase (health monitoring)

---

### Pitfall 6: Component-identity selector가 React.memo/forwardRef/portal/Suspense에서 깨진다

**What goes wrong:**
- `React.memo(forwardRef(Comp))`로 감싼 컴포넌트는 fiber의 `type` field가 원래 `Comp`가 아니라 memo 래퍼가 되고, displayName이 기본적으로 "Anonymous"가 된다. Identity selector가 `type.name` 또는 `displayName` 기반이면 매칭 실패
- `ReactDOM.createPortal`로 modal을 `document.body`에 렌더하면 fiber tree 상 부모는 원래 컴포넌트지만 DOM tree 상 부모는 body. CSS descendant selector가 깨지고, fiber selector는 "왜 visible 아님?" 오판
- Suspense fallback 시 컴포넌트 이름은 같지만 child tree가 교체됨 — selector는 매칭되지만 action이 엉뚱한 element에
- 같은 displayName의 compound component 여러 개 (`Menu.Item` × N개) — path가 명확해야 구분 가능
- Re-keyed subtree는 fiber 인스턴스 자체가 바뀜 — prev snapshot의 fiber 참조 invalid

**Why it happens:**
- React 생태계의 보통 패턴이 이런 래퍼·포털·키 조합을 만든다 — v0.5 recorder가 "명확한 좋은 경로"만 본다고 가정하면 production app의 실제 구조와 불일치
- `displayName`을 명시 설정한 프로젝트는 소수 — [eslint-plugin-react]가 이 문제를 자동 검출하려고 만들어진 이유
- Fiber 참조를 selector로 저장하면 unmount 후 invalid

**How to avoid:**
- Selector는 **fiber 참조가 아니라 path descriptor**로 저장:
  ```ts
  type ComponentPath = Array<{
    displayName: string
    keyProps?: Record<string, unknown> // e.g. { postId: 123 }
    index?: number // siblings로 같은 컴포넌트일 때
  }>
  ```
- Resolver는 매 call마다 fresh walk (root → target)로 resolve — 참조 invalidation 문제 차단
- Portal 처리: fiber tree walk는 `return` field를 따라가면 portal-invariant. DOM tree가 아니라 fiber tree 기반 path 고정
- Memo/forwardRef unwrap: `type.$$typeof === Symbol.for('react.memo') && type.type`로 재귀 unwrap해 실제 컴포넌트 type을 얻음
- DisplayName 없을 때 fallback: `type.name` → hooks signature hash → file path from `_debugSource` (dev build만)
- Compound component 구분: prop-based key (manifest에서 `where: { postId: '$captured' }`)가 index보다 우선
- E2E test fixture: memo·forwardRef·portal·Suspense·compound 각각 케이스

**Warning signs:**
- Fiber selector가 displayName "Anonymous" 케이스 리포트
- Action은 성공하는데 엉뚱한 element (Suspense boundary 전환 타이밍)
- Modal 내부 target이 "not visible"로 잡힘 (portal 이슈)

**Phase to address:** `@agrune/react` phase — resolver 구현에 이 케이스별 테스트 포함이 Definition of Done에

---

### Pitfall 7: Repeat primitive가 virtualized list에서 rendered count ≠ logical count를 놓친다

**What goes wrong:**
SNS 피드·forum thread·테이블 같은 장소는 `react-window`, `react-virtual`, `@tanstack/virtual` 같은 virtualizer를 쓴다. DOM에는 **viewport에 보이는 ~10–20개**만 존재하지만 실제 데이터는 1,000개다. agrune의 `defineRepeat({ template, extract })`가 DOM 기반으로 instance를 enumerate하면 "10개 있다"고 응답하고 AI는 11번째로 진행 안 됨.
nested repeat(thread의 post → 각 reply → 각 quote)는 outer scroll 후 inner virtualizer가 restore되지 않을 수 있어 snapshot 간 state drift.

**Why it happens:**
- Virtualization은 실제 스크롤 위치만큼의 DOM만 유지하도록 설계됨 — `aria-setsize` 같은 힌트가 있어야 assistive tech가 전체 size를 안다
- recorder는 기본 한 번만 캡처 → virtualizer 내부 상태는 모름
- Items 재정렬(좋아요 순 ↔ 시간 순 toggle)은 같은 key로 다른 position 만듦

**How to avoid:**
- `defineRepeat`에 **두 mode**:
  1. `strategy: 'dom'` — visible 한도 내 enumerate (피드 무한 스크롤에 적합)
  2. `strategy: 'virtualized'` — runtime이 scroll을 트리거해 점진적 load + dedupe by stable key (`keyFrom: (el) => el.getAttribute('data-post-id')`)
- Manifest author가 **logical size source** 지정 가능: `total: '[role=list][aria-rowcount]'` 또는 `total: (ctx) => ctx.fetch('/api/feed/count')`
- Stable key **필수** — 없으면 validate CLI가 error. Index-based key는 reorder 후 무효
- Nested repeat: outer마다 inner snapshot의 scroll position을 `viewportTransform`에 기록, resume 시 복원
- Runtime이 `aria-setsize`/`aria-rowcount`/`data-total-count` heuristic을 자동 추출, manifest 명시 없을 때 힌트로 사용
- Recorder UI: "이 리스트는 virtualized로 보입니다. Logical size source를 제공해주세요" 강제 프롬프트

**Warning signs:**
- `repeat.count === repeat.visibleCount`인데 사용자가 더 많다고 주장
- Scroll 후 같은 item이 두 번 캡처됨 (key 없음)
- "N번째 post" 요청에서 N > visible count일 때 선택적 실패

**Phase to address:** Runtime phase — repeat primitive 구현에 virtualization 지원이 first-class

---

### Pitfall 8: Macro 부분 실행 시 앱이 intermediate state에 갇힌다

**What goes wrong:**
5-step login macro에서 step 3 (비밀번호 입력)이 `TARGET_NOT_FOUND`로 실패. 이미 step 1 (username fill) + step 2 (탭 전환)는 commit됨. 다음 실행이 macro를 다시 처음부터 실행하면 username이 이중 입력되거나, 이미 step 2 상태라 step 1 selector가 안 맞거나, 로그인 시도 카운트가 올라가 계정 잠김.

**Why it happens:**
- Macro는 atomic하지 않다 — DOM 변경·navigation은 rollback 불가
- Macro 저자 가정 ("이 페이지는 항상 로그아웃 상태")이 시간이 지나 깨진다. 사이트가 "remember me"를 추가하면 step 1 selector가 더 이상 표시되지 않음
- AI harness가 macro를 **의도와 다른 context**에서 호출 (사용자가 이미 로그인 상태인데 macro 돌림)

**How to avoid:**
- Macro schema에 **precondition**과 **postcondition** 필수:
  ```ts
  defineMacro({
    name: 'login',
    precondition: { target: 'login-form', visible: true },
    steps: [...],
    postcondition: { target: 'user-menu', visible: true },
  })
  ```
- Runtime이 precondition 실패 시 **step 실행 전 중단** → AI harness에 "already logged in, skipping" 신호
- 각 step에 `idempotent: boolean` — false면 재시도 전 `checkpoint` selector로 현재 위치 판정
- Macro failure시 **progress report**: "failed at step 3/5, current state appears to be X" — AI가 복구 결정 가능
- `sensitive`·`side-effect` 플래그가 있는 macro (결제 등)는 **HITL pause** 기본 on
- Rate-limit-sensitive macro(login, OTP)는 runtime이 연속 실패 시 **auto-backoff + circuit breaker**
- Recorder는 macro 저장 시 "이 단계는 idempotent인가요?" 체크리스트 강제
- Macro는 **context signature** 기록 (URL pattern + 특정 DOM token 존재 조건) — mismatch면 실행 거절

**Warning signs:**
- Macro step별 success rate가 step 수에 따라 기하적으로 하락
- Account lockout 리포트
- 같은 macro의 step N이 항상 실패 (author 가정 drift)

**Phase to address:** Runtime phase — macro runner의 precondition/postcondition/circuit breaker 설계. Manifest SDK phase — schema에 이 필드 필수화

---

### Pitfall 9: Recorder 오버레이가 앱 클릭을 가로챈다 (또는 잘못된 element 캡처)

**What goes wrong:**
사용자가 recorder를 켠 상태에서 앱의 버튼을 클릭하려 해도, 오버레이 자체가 위에 있어 클릭이 앱에 도달하지 못한다. 반대로 오버레이를 `pointer-events:none`으로 뚫으면 사용자가 element를 선택하려는 의도인지, 그냥 앱을 쓰는 중인지 구분할 수 없다. 또한 selection picker가 작은 버튼 대신 parent container를 잡거나, 반대로 너무 깊이 들어가 `<span>` inside label을 잡는 문제. nth-child 기반 selector가 dynamic 리스트에서 위치 이동.

**Why it happens:**
- Pointer event passthrough는 boolean 상태가 아니라 **mode 전환** 문제다 (recording vs. picking vs. using app)
- 사람이 "이 버튼"을 클릭해도 DOM 상 hit element는 아이콘 `<svg>`·`<path>`·padding `<span>` 등 여러 후보
- React 트리에서는 clicked DOM → semantic component (Button vs icon inside Button)로 **올라가야** 함

**How to avoid:**
- 명시적 mode 모델: `idle` / `picking` / `recording-action`. 모드 전환은 keyboard shortcut (`Cmd+Shift+A` 같은) — 마우스 클릭으로 전환 금지
- `picking` mode는 hover 기반 highlight + 클릭 하나로 확정 (Chrome DevTools inspector pattern)
- `recording-action` mode는 pointer-events 오버레이 없이 **사용자가 앱 그대로** 씀. 모든 native click을 capture → semantic inference → 후보 selector 3개 제시 (element, closest button, closest interactive)
- Picker가 hit element에서 **interactive ancestor**로 자동 상승: `closest('button, a, [role], [tabindex]')`
- Selector 후보 생성 시 priority ladder(Pitfall 5)로 여러 candidate + stability score
- 각 selector에 "이 selector는 list의 3번째 post를 가리킵니다 — 다른 post에도 적용하려면 `defineRepeat`을 쓰세요" 같은 hint
- 오버레이는 `z-index: 2147483647` 쓰되 **hit-testing은 disabled**, 작은 픽업 패널만 pointer-events enabled — 패널 위치는 viewport edge 고정

**Warning signs:**
- Recorder 기록 내 selector가 대부분 `nth-child` 포함
- "버튼 클릭이 안 먹어요" 사용자 피드백
- 같은 의도의 클릭이 run마다 다른 element 캡처

**Phase to address:** DevTools 웹앱 phase (recorder UI) + Manifest SDK phase (stability scoring)

---

### Pitfall 10: Sensitive auto-detect의 false negative (custom password) · false positive (substring)

**What goes wrong:**
- False negative: 커스텀 "보이는 비밀번호 토글" UI가 `<input type="text">` + JS masking → agrune heuristic이 `type !== 'password'`로 판단 → 마스킹 없이 로그. 다른 예: OTP 입력 (`autocomplete="one-time-code"`가 없는 이전 사이트), 신용카드 커스텀 컴포넌트
- False positive: 회원 프로필 `<input name="legal_name_ssn_holder">` (이름 필드인데 "ssn" 부분문자열) → 마스킹되어 AI가 사용자 이름을 볼 수 없고 workflow 고장

**Why it happens:**
- `type=password`만으로는 부족 — 실제 사이트는 수많은 이유로 custom input 사용
- Substring heuristic은 단어 경계 없음
- Locale/언어 문제: 한국어 필드 `비밀번호`를 영어 substring 매칭으로는 못 잡음

**How to avoid:**
- Heuristic **겹겹**:
  1. `type=password` (강한 증거)
  2. `autocomplete` token whitelist: `current-password`, `new-password`, `cc-number`, `cc-csc`, `one-time-code`
  3. 단어 경계 regex: `/\b(password|passwd|pwd|ssn|cvv|cvc|cc[-_ ]?num)\b/i`
  4. ARIA/label 텍스트가 다국어 keyword와 매칭 (최소 한/영/일 시작)
  5. Input 근처 토글 아이콘 (eye/eye-off) 존재 heuristic
- 결정: **OR로 sensitive 판단** (하나라도 true면 sensitive), **AND로 non-sensitive 확정 금지** (false negative 리스크 > false positive 리스크)
- Manifest authoring UI에 **"이 필드는 왜 sensitive로 잡혔나"** 설명 (어느 heuristic이 발화했나), 사용자가 `sensitiveOverride: false` 로 해제 가능하되 confirmation + warning
- **감사 테스트 세트**: OWASP/HIBP 유명 로그인 폼 100개·KR 주요 사이트 sensitive 필드들로 precision/recall 측정, CI에 회귀 테스트
- Custom password component 탐지용 Chrome Password Manager heuristic 참고 (autofill 결정 방식)

**Warning signs:**
- User report "name 필드가 왜 `***`로 나와요?"
- Sensitive 미감지로 로그 유출 incident
- Precision < 90% 또는 recall < 95% (heuristic 기준점)

**Phase to address:** Runtime phase (heuristic 구현 + test corpus) + Manifest SDK phase (override UX)

---

### Pitfall 11: Registry PR review bottleneck + solo maintainer governance

**What goes wrong:**
초기에 solo dev가 모든 manifest PR을 review. 10개/주 넘어가면 "rubber stamp" 화, 또는 PR이 쌓여 community 신뢰 하락. 저자가 나중에 maintainer를 뽑을 때 권한 granularity 부재 (전부 admin 아니면 외부). 동시에 악성 행위자는 **저신뢰 시기**(초기 트래픽 적을 때)에 trusted 포지션 획득 후 나중 공격 시도 — 실제로 ShadyPanda 캠페인이 이 패턴 (clean 몇 년 뒤 flip).

**Why it happens:**
- GitHub repo로 registry를 구현하면 기본 권한 모델은 "모든 write or none"
- Manual review는 scale 안 됨
- Manifest 하나당 review 부담이 Chrome Extension보다 낮아 보여 "쉬워 보임" 착각
- Solo dev burnout

**How to avoid:**
- **Tier system** (registry schema에 명시):
  - `verified`: maintainer review 통과, automated health monitoring OK, signed
  - `community`: merged but un-verified, user가 opt-in으로만 사용
  - `unlisted`: fork·private — registry 미노출
- **Automated gate가 review bottleneck 우회**:
  - Sensitive 플래그 변경 / new selector 검증 / selector health check 자동 실행
  - 이 gate 통과 시 `community` auto-merge 가능, `verified`는 human sign-off 필수
- **CODEOWNERS** 기반 domain-별 reviewer pool (youtube.com 메인터너, twitter.com 메인터너 등)
- **Velocity limit**: 신규 저자는 첫 3 PR은 30일 holddown — long-game 공격 방지
- **revocation 경로 명시**: published manifest가 악의적이라 드러나면, CLI가 incident-list fetch해 즉시 disable + 사용자 warning
- **Governance doc** 초기부터 `REGISTRY_GOVERNANCE.md` — escalation, reviewer nomination, incident response. 사람이 없을 때의 행동까지 명시 (예: maintainer 부재 + 보안 사건 → 자동 default는 disable-all)
- CLI `agrune maps add`가 **첫 사용 시 trust 등급 보여주고 사용자 명시 동의**

**Warning signs:**
- PR backlog > 2주
- 동일 저자의 여러 manifest에서 sensitive:false 변경이 쌓임
- Maintainer가 하나뿐이고 maintainer가 며칠 응답 없음

**Phase to address:** Registry phase — governance doc + tier system + auto-gate를 v0.5 scope 안에서 정의 (scale 전에 설계 끝나야 함)

---

### Pitfall 12: Manifest cache staleness — 사이트 v2 배포 후 manifest v1이 계속 사용됨

**What goes wrong:**
사이트가 주요 리디자인을 배포 (selector 절반 깨짐). Registry에 새 manifest가 merge되기까지 며칠. 그 사이 사용자 machine은 로컬 cache된 v1 manifest로 계속 시도 — 모든 command가 `TARGET_NOT_FOUND` → 사용자가 "agrune이 망가졌다"고 느낌. 반대로 cache가 너무 짧으면 CI·오프라인 환경에서 불안정.

**Why it happens:**
- Manifest 업데이트는 registry → user machine 까지 **push 없음** (기본 pull)
- 로컬 cache가 staleness 경고 없이 사용됨
- 사용자는 manifest를 어디서 받았고 언제 verify되었는지 모름

**How to avoid:**
- Manifest에 **schema version + site-version hint** 필드:
  ```yaml
  site: youtube.com
  siteVersionHash: 'last-verified-against:2026-04-15T10:00Z'
  manifestVersion: '0.3.2'
  ```
- Runtime이 **smoke test**: 첫 selector 3개가 연속 `TARGET_NOT_FOUND`면 "manifest may be stale — check for update" 표시 + CLI에 `agrune maps check --update` 안내
- `agrune maps add youtube`는 cache에 저장 + **weekly re-fetch**, 변경 시 사용자 확인 (auto-update는 공격 벡터이므로 기본 off)
- Registry bot이 health check 실패 manifest에 `stale` label 자동 부여, CLI `agrune maps list`가 이 flag 표시
- `agrune maps doctor` 커맨드: 설치된 모든 manifest vs registry 현재 버전 비교
- Devtools 웹앱의 에러 패널에 "이 타겟이 manifest에서 드롭되었을 수 있습니다" 힌트

**Warning signs:**
- 특정 manifest에서 갑자기 `TARGET_NOT_FOUND` 급증
- "YouTube redesigned yesterday" + agrune 안 됨
- 사용자 cache 디렉터리에 6개월 넘은 manifest

**Phase to address:** Manifest SDK phase (schema) + CLI phase (maps commands) + Runtime phase (smoke test detection)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Fiber field prefix 고정 (`__reactFiber$` 가정 단일 키) | 빨리 POC 완성 | React 버전 상승 또는 여러 React 인스턴스 환경에서 무음 실패 | Never — prefix scan을 첫 구현부터 |
| Manifest validation 없이 production 로드 허용 | 배포 속도 | 악성 manifest 공격 면 노출, selector drift 자동 탐지 불가 | Never, 최소 schema validation + sensitive 감사 |
| Recorder가 nth-child selector 뱉어도 저장 허용 | 데모 편함 | 사용자가 "한 번 돌리고 다음 날 깨짐" 경험 | Only for `candidate` tag, manifest에 stability score 낮게 기록 |
| `<AgruneDevtools />` prod 기본 on | 사용자 셋업 간단 | Remote-control attack surface, compliance 리스크 | Never — opt-in 두 단계 guard |
| Macro에 precondition/postcondition 없이 schema 통과 | SDK 단순 | Partial execution으로 account lockout, 사용자 데이터 손상 | Never for macros with side effects; 순수 read-only macro만 허용 고려 |
| Solo maintainer로 community tier 오픈 | 초기 성장 | 악의적 PR 유입 risk + maintainer burnout | 자동 gate + velocity limit로 방어 시에만 일시 허용 |
| React 17 호환 포기 | 구현 간단 | 유저 베이스 절반 잃음 (React 17 여전히 상당함) | React 19+만 지원 공식 선언 시 |
| Sensitive heuristic을 substring만 사용 | 1시간 구현 | False positive로 정상 워크플로 차단 | Never — word-boundary regex 최소 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| React fiber | `el.__reactFiber$abc` 고정 키 | `Object.keys(el).find(k => k.startsWith('__reactFiber$'))` |
| React memo/forwardRef | `fiber.type.name`만 사용 | `$$typeof` 체크로 unwrap 후 실제 component 타입 접근 |
| Next.js SSR | 초기 HTML 상태에서 recorder 호출 | `useEffect` 안에서 register + hydration barrier wait |
| React portal | DOM descendant selector로 modal 찾기 | Fiber tree walk (`fiber.return`) — portal-invariant |
| Virtualized list | `querySelectorAll` count = logical count 가정 | `aria-rowcount`/`aria-setsize` 힌트 + incremental scroll + stable key |
| CSS-in-JS / Tailwind JIT | 해시 클래스 selector (`.css-1a2b3c`) | role/name/data-testid 기반 selector로 자동 강등 |
| MCP server | Runtime 명령 channel 화이트리스트 없음 | Prod 모드에서 transport origin 명시 확인 |
| Chrome Web Store 유사 공격 | Solo reviewer로 community PR merge | Automated gate + tier system + velocity limit |
| i18n 사이트 | Text selector (`text="Like"`) 하드코딩 | `aria-label` 또는 data attribute 우선, text는 fallback tier |
| Content script extension 공존 | `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 직접 mutate | 기존 hook 감지 후 co-existence mode |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Snapshot 매 command마다 full DOM 스캔 | 100+ target 페이지에서 command latency > 500ms | Mutation observer 기반 incremental + dirty-flag | target 수 > ~200 |
| Fiber walk를 각 selector마다 root→target 재실행 | 같은 snapshot에서 N targets × walk cost | Snapshot 한 번에 fiber map 캐시, same snapshot version 안에서 reuse | target > 50 + snapshot 재사용 |
| Repeat primitive가 virtualized list 전체를 stringify | Memory spike, serialization stall | Lazy materialization, 요청된 index만 resolve | 리스트 > 500 items |
| Manifest registry fetch를 매 session 시작마다 | Network latency → 첫 command 지연 | 7일 cache + background refresh | 매일 agrune 시작 사용자 |
| Recorder가 모든 pointer event hook | 사용자 앱 인터랙션 전체 lag | `recording-action` mode일 때만 listener attach | 고빈도 interaction (drag, typing) |
| `__REACT_DEVTOOLS_GLOBAL_HOOK__` profile hook 상시 on | Render overhead ~5–15% | 필요할 때만 활성, recorder off시 unhook | 대형 React 앱 + prod 모드 |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `sensitive:false` override가 DOM heuristic보다 우선 | 악성 manifest가 password 필드를 sensitive 해제 → 로그 유출 | DOM heuristic이 **always win**, manifest는 **추가만** 가능 |
| Prod bundle에 runtime 포함 opt-in이 1-flag | 공격자가 사용자 앱 원격 제어 | 2단계 guard (env + 사용자 consent token) |
| Manifest registry URL을 hardcode하지 않고 설정 가능 | Registry spoofing attack | URL allowlist, hash pinning |
| Macro 실행 중 confirmation 없음 | 악성 macro가 금전 이동·계정 삭제 | Side-effect 플래그 있는 macro는 HITL 기본 on |
| Recorder가 clipboard 데이터 자동 capture | PII·credential 실수 저장 | Clipboard access는 명시 user action 이후만 |
| Devtools WebSocket이 authentication 없이 listen | 로컬 네트워크의 다른 기기가 command inject 가능 | Token-based auth (`~/.agrune/auth.json`), localhost-only bind 기본 |
| Error report / telemetry에 raw DOM 포함 | Selector·text content·유저 입력이 원격 서버로 | Error report는 schema-validated 필드만, raw payload 기본 제외 |
| `read` command이 custom selector를 받음 | AI가 `body` selector로 전체 페이지 exfil 가능 | Read는 manifest에 등록된 target만 허용, ad-hoc selector는 sensitive 감사 통과한 경우만 |
| Abandoned manifest의 auto-update 허용 | 저자 계정 탈취 후 악성 버전 push | Auto-update 기본 off, CLI에 명시적 `maps update` |
| Manifest hash 없이 cache | Supply chain attack 후 이전 good 버전으로 rollback 불가 | Manifest content-addressed, cache에 모든 historical 유지 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Recorder에 mode 명시 없음 (pick vs. use) | 사용자가 실수로 앱 사용 중인 클릭이 기록됨 | Keyboard shortcut mode toggle, UI에 큰 mode indicator |
| Selector candidate를 "best"만 보여줌 | 사용자가 fragile selector를 모르고 저장 | 3+ candidate + stability score 나란히 표시 |
| Manifest 로드 실패 시 silent fallback | AI가 계속 작동하는 것처럼 보이지만 stale 상태 | Error panel에 명시 경고 + CLI 업데이트 가이드 |
| Sensitive 마스킹이 `***`만 표시 | 사용자가 왜 가려졌는지 모름, false positive 시 해제 방법 모름 | Hover tooltip: "이 필드는 `type=password`로 감지되어 마스킹됐어요. 해제하려면…" |
| Macro 실패 시 "failed at step 3"만 출력 | 사용자가 intermediate state 복구 방법 모름 | Progress report + 현재 판단되는 state + "continue from step 3" / "rollback" 선택지 |
| Registry CLI가 모든 manifest를 동일 트러스트로 표시 | 사용자가 verified vs community 차이 모름 | CLI 출력에 tier 배지, 처음 설치 시 명시 확인 |
| Prod 모드 경고가 initial setup에만 | 몇 달 뒤 사용자가 위험 잊음 | 런타임 DevTools panel에 상시 "PROD enabled" 배너 |
| Validation 에러 message가 schema jargon | "필드 누락" 수준 말고 해결법 모름 | "login-form target에 sensitive:true를 명시하세요" 처럼 action까지 |

## "Looks Done But Isn't" Checklist

- [ ] **React fiber resolver:** 구현 완료 표시되어도 → React 17 / 18 / 19 각각 fixture에서 pass 검증, memo·forwardRef·portal·Suspense 케이스 모두 통과
- [ ] **Manifest loader:** 완료로 보여도 → SSR hydration 중간 상태·Next.js streaming·react-window virtualized list 실제 사이트에서 검증
- [ ] **Sensitive 마스킹:** 기본 heuristic 통과 표시되어도 → custom password component (type=text + 마스크 JS)·OTP 필드·다국어(한/일) 라벨 corpus 회귀 테스트
- [ ] **Recorder 오버레이:** "동작함" 리포트되어도 → pointer-events passthrough 모드 전환·nested interactive(button in button)·virtualized 리스트 안의 item pick 검증
- [ ] **Registry PR flow:** "자동화됨" 보여도 → sensitive:false 변경 감지 bot · selector health check · velocity limit · tier 라벨 실제 PR에 시연
- [ ] **Macro runner:** "동작함" 보여도 → precondition fail·partial execution·postcondition 불만족·circuit breaker·HITL confirmation 각 경로 실제 시연
- [ ] **Prod opt-in:** "flag 존재함" 확인되어도 → env + consent 이중 guard 없이는 로드 거절 검증, bundle analyzer에서 recorder/devtools 제거 확인
- [ ] **Manifest staleness 감지:** "smoke test 있음" 확인되어도 → 의도적으로 selector 깨진 manifest 주입해 실제 `agrune maps doctor`가 잡는지 검증
- [ ] **Repeat primitive:** "테스트 통과" 되어도 → `react-window` 1000 item 리스트 + reorder + nested repeat 실제 시나리오로 stable key·scroll restore 검증
- [ ] **Dual selector resolution:** "fiber → CSS fallback 동작" 확인되어도 → 외부 사이트(root-import 불가) 실제 샘플 (YouTube, GitHub) 사이트에서 fallback 순서대로 시도되는지 스모크

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Fiber field prefix 고정 버그 발견 | LOW | `getFiber` 유틸 한 곳만 수정 + React 버전 fixture CI 추가 |
| SSR hydration race로 selector null | LOW | `useEffect` 래핑 + hydration barrier 추가 |
| 악성 manifest가 merge됨 | HIGH | Registry incident list 즉시 publish → CLI가 fetch해 disable → 사용자 개별 통지 → post-mortem → governance 강화 |
| 대형 selector drift 이벤트 (사이트 리디자인) | MEDIUM | Bot이 stale 라벨 자동 부여, 사용자에게 "maps doctor" 안내, community PR 수집 |
| Macro partial execution으로 계정 잠김 | HIGH | 사용자별 복구 불가, 서비스쪽 password reset 필요. 예방이 유일 — Pitfall 8 가드 강화 |
| Sensitive false negative로 로그 유출 | HIGH | 즉시 로그 purge (CLI `agrune logs purge --sensitive`), heuristic 패치 배포, regression corpus에 케이스 추가 |
| Prod bundle에 recorder 유출 | HIGH (compliance) | Incident 공개, 영향 받은 유저에 emergency patch, bundle analyzer CI 강화 |
| Registry PR bottleneck | MEDIUM | Auto-gate 추가 + trusted contributor 초대, 일시적 new-submission freeze 선택지 |
| Virtualized list logical count 누락 | LOW | Manifest에 `total` 필드 추가 PR, AI harness에 "logical count 미제공 경고" 렌더 |
| Manifest cache staleness | LOW | `agrune maps doctor` + `agrune maps update <site>`로 사용자 수동 해결 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Fiber field prefix suffix 가변 | `@agrune/react` phase | React 17/18/19 matrix CI pass |
| 2. SSR/hydration race | `@agrune/react` + Runtime phase | Next.js App Router fixture에서 recorder 정상 동작 |
| 3. Prod-enabled root-import abuse | `@agrune/react` phase + Runtime phase | 2단계 guard 없이 prod 모드 로드 거절 unit test; bundle analyzer CI |
| 4. 악성 manifest sensitive 유출 | Registry phase + Runtime phase | DOM heuristic이 manifest false를 override 단위 테스트; PR bot이 sensitive 변경 탐지 |
| 5. CSS selector drift | Manifest SDK phase + Registry phase | Selector priority ladder schema 강제; weekly health check bot |
| 6. Component-identity selector 파편화 | `@agrune/react` phase | memo·forwardRef·portal·Suspense·compound 케이스 fixture 모두 통과 |
| 7. Repeat primitive virtualization 실패 | Runtime phase | `react-window` 1000+ item 실제 시나리오 E2E |
| 8. Macro partial execution | Runtime phase + Manifest SDK phase | Precondition/postcondition/circuit breaker 3종 E2E |
| 9. Recorder 오버레이 UX | DevTools 웹앱 phase + Manifest SDK phase | Mode 전환 keyboard shortcut UX test; nested interactive pick 검증 |
| 10. Sensitive auto-detect 오차 | Runtime phase | Precision/recall corpus 회귀 테스트 CI |
| 11. Registry governance | Registry phase (v0.5 scope에 **반드시**) | Governance doc 존재; auto-gate 구현; tier 필드 schema 포함 |
| 12. Manifest staleness | Manifest SDK + CLI + Runtime phase | `agrune maps doctor`가 intentionally broken manifest 탐지 E2E |

## Sources

### HIGH confidence (공식·다중 교차 검증)

- [React — StrictMode 공식 문서 (double invocation)](https://react.dev/reference/react/StrictMode)
- [React GitHub #35676 — StrictMode + useEffect 2026 리포트](https://github.com/facebook/react/issues/35676)
- [React fiber architecture overview (acdlite)](https://github.com/acdlite/react-fiber-architecture)
- [React DevTools OVERVIEW.md — `__REACT_DEVTOOLS_GLOBAL_HOOK__` / hooks introspection](https://github.com/facebook/react/blob/main/packages/react-devtools/OVERVIEW.md)
- [React #14319 — displayName on forwardRef/memo 이슈](https://github.com/facebook/react/issues/14319)
- [Next.js hydration errors 공식 메시지](https://nextjs.org/docs/messages/react-hydration-error)
- [CSS `pointer-events` MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)

### MEDIUM confidence (복수 보고서 교차)

- [Sekoia — Chrome Extension supply chain attack 2025 (35+ 확장, 2.6M 사용자)](https://blog.sekoia.io/targeted-supply-chain-attack-against-chrome-browser-extensions/)
- [eSentire — 악성 Chrome Extension 캠페인 추적 update](https://www.esentire.com/security-advisories/update-malicious-chrome-extension-campaign)
- [TheHackerNews — ShadyPanda "7년 clean 후 flip" 공격 패턴 (browser extension risk guide)](https://thehackernews.com/2025/12/a-browser-extension-risk-guide-after.html)
- [TheRegister — Chrome Extensions supply chain attack 2025 해설](https://www.theregister.com/2025/01/22/supply_chain_attack_chrome_extension/)
- [BrowserStack — Playwright selector best practices 2026](https://www.browserstack.com/guide/playwright-selectors-best-practices)
- [TestDino — Playwright AI codegen (selector drift is top-3 failure)](https://testdino.com/blog/playwright-ai-codegen/)
- [Patterns.dev — List virtualization accessibility concerns](https://www.patterns.dev/vanilla/virtual-lists/)
- [SSR-safe hooks pattern (useEffect hydration)](https://reactuse.com/blog/ssr-safe-react-hooks/)
- [Accessibility in virtualized components (aria-setsize pattern)](https://app.studyraid.com/en/read/11538/362764/ensuring-accessibility-in-virtualized-components)

### LOW confidence (단일 소스·정량 수치 부족)

- "Per-selector 2% flakiness는 낙관적" 표현 — Playwright 커뮤니티 포럼에서 반복 언급되나 공식 벤치마크 수치 부재
- Solo maintainer governance 임계점 (주당 PR 수) — 업계 공개 수치 없음, ShadyPanda·Sekoia 사례로 upper bound만 추정
- React fiber 필드 suffix 생성 알고리즘 정확한 규칙 — React 소스 내부 구현 세부는 미공개 안정 API 아님, prefix scan 방어가 필수

### 기타

- Existing agrune codebase: `packages/runtime/src/dom-scanner.ts`, `packages/runtime/src/runtime/snapshot.ts` — 현재 `sensitive` 플래그 구현과 DOM heuristic 진입점 위치
- `.planning/PROJECT.md` v0.5 Manifest Pivot kickoff — 피봇 범위·constraint
- CLAUDE.md memory `project_cdp_only_architecture` — CDP-only 유지, runtime 주입은 CDP evaluate로만

---
*Pitfalls research for: v0.5 Manifest Pivot (manifest + React root-import + registry)*
*Researched: 2026-04-19*
