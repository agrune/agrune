# Architecture Research — v0.5 Manifest Pivot (agrune)

**Domain:** 브라우저 자동화 플랫폼(MCP 서버 + CDP 런타임) — manifest 기반 외부 매핑 + root-import 프레임워크 통합으로의 아키텍처 피봇
**Researched:** 2026-04-19
**Confidence:** HIGH (기존 코드 인벤토리 기반) / MEDIUM (일부 외부 결정점: 레지스트리 캐시 정책, 레코더 IPC 형식)

---

## 0. Orientation — 무엇이 바뀌는가

v1.1까지 agrune의 "진실의 원천"은 **DOM 안의 `data-agrune-*` 속성**이었다. `CdpRuntimeInjector`가 `Page.addScriptToEvaluateOnNewDocument`로 bootstrap 스크립트를 주입하고, 이 스크립트는 `scanAnnotations(document)` + `scanGroups(document)` → `buildManifest()`로 inline 속성을 런타임 manifest로 변환한다. "annotation이 하나라도 있으면 부팅" 조건이 게이트였다.

v0.5에서 진실의 원천은 **외부 manifest(JS/TS 오브젝트)** 로 이동한다. 두 개의 새 패키지와 런타임 내부 개조가 맞물린다.

| 레이어 | v1.1 | v0.5 |
|---|---|---|
| 타겟 식별 | inline `data-agrune-*` → CSS selector | manifest target definition → (a) `@agrune/react`에서 publish된 **component-identity**, (b) manifest가 제공한 **CSS selector** fallback |
| 부팅 조건 | "annotation이 있으면" | 항상 부팅, manifest가 비어 있으면 idle |
| 소스 배포 | 소스코드에 inline | (a) owned 앱: root-import로 in-repo manifest.ts, (b) 외부 사이트: `github.com/agrune/maps` registry → `~/.agrune/maps/` 로컬 캐시 |
| 컴파운드 플로우 | MCP 쪽에서 여러 tool call로 조합 | `defineMacro` — manifest에 포함, runner가 **페이지 런타임**에서 실행 |

**따라서 이 연구의 핵심 질문은 "새 정보가 어디서 발원하고, 어느 프로세스/실행 컨텍스트를 거쳐, 누가 소비하는가"이다.**

---

## 1. System Overview — v0.5 후 전체 컴포넌트 맵

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          AUTHORING LAYER (dev 머신)                           │
│                                                                               │
│  ┌────────────────┐   ┌───────────────────┐   ┌──────────────────────────┐   │
│  │ manifest.ts    │   │ agrune CLI        │   │ agrune/maps (GitHub)     │   │
│  │ defineManifest │   │ manifest dev      │   │ Registry                 │   │
│  │ defineTarget   │◀──│ manifest validate │──▶│ PR-based contribution    │   │
│  │ defineRepeat   │   │ manifest submit   │   │ per-site versioned       │   │
│  │ defineMacro    │   │ maps add/types    │◀──│ raw.githubusercontent... │   │
│  │                │   │                   │   │                          │   │
│  │ @agrune/manifest│  └────────┬──────────┘   └──────────┬───────────────┘   │
│  └────────┬────────┘           │ emits/fetches           │                   │
│           │                    ▼                         ▼                   │
│           │           ┌──────────────────────────────────────┐               │
│           │           │  ~/.agrune/maps/<host>@<ver>.json    │               │
│           │           │  (offline-first local cache)         │               │
│           │           └──────────────────────────────────────┘               │
└───────────┼──────────────────────────────────────────────────────────────────┘
            │ imports
            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      HOST APP (owned repo; optional)                          │
│                                                                               │
│   import { AgruneDevtools } from '@agrune/react'                              │
│   import { manifest }      from './agrune.manifest.ts'                        │
│                                                                               │
│   <AgruneDevtools manifest={manifest} mode="dev"|"prod" />                    │
│              │                                                                │
│              │ React tree traversal (Fiber)                                   │
│              ▼                                                                │
│   ┌──────────────────────────────────────────────────────────┐                │
│   │ FiberIdentityIndex — Map<ComponentIdentityKey, DOMNode>  │                │
│   │ + manifest (passed as prop)                              │                │
│   └───────────────────┬──────────────────────────────────────┘                │
└───────────────────────┼──────────────────────────────────────────────────────┘
                        │ publishes (bridge)
                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                BROWSER PAGE CONTEXT (Chrome renderer, isolated)                │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │ agrune runtime (injected by CdpRuntimeInjector)                       │   │
│  │                                                                       │   │
│  │  ┌──────────────┐  ┌───────────────┐  ┌───────────────────────────┐   │   │
│  │  │ manifest     │  │ TargetResolver│  │ MacroRunner               │   │   │
│  │  │ loader       │──▶ ① fiber-idx  │──▶ compounds defineMacro      │   │   │
│  │  │ (expands     │  │ ② CSS selector│  │ steps → page-agent cmds   │   │   │
│  │  │  repeat)     │  │ fallback      │  │ status to snapshot        │   │   │
│  │  └──────┬───────┘  └───────┬───────┘  └───────┬───────────────────┘   │   │
│  │         │                  │                  │                        │   │
│  │         ▼                  ▼                  ▼                        │   │
│  │  ┌───────────────────────────────────────────────────────────────┐    │   │
│  │  │ page-agent-runtime (existing; command-handlers, snapshot,     │    │   │
│  │  │ cursor-animator, event-sequences, action-queue)               │    │   │
│  │  └──────────────┬────────────────────────────────────────────────┘    │   │
│  │                 │                                                     │   │
│  │         ┌───────┴─────────┐                                           │   │
│  │         │ sensitive mask  │ ← applied at snapshot emit & fill-log    │   │
│  │         └─────────────────┘                                           │   │
│  │                                                                       │   │
│  │  Recorder overlay (dev-only) ← toggled via window postMessage         │   │
│  └───────────────────────────┬───────────────────────────────────────────┘   │
│                              │ Runtime.addBinding('agrune_send')             │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │ CDP
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       CONTROL PLANE (Node; @agrune/mcp)                       │
│                                                                               │
│  CdpDriver → CdpConnection → CdpTargetManager → CdpRuntimeInjector            │
│         │                                                                     │
│         ├── MCP tools (stdio): sessions/snapshot/act/fill/drag/pointer/wait/  │
│         │   guide/read/config/focus  +  NEW: manifest_load, macro_run         │
│         ├── DevTools HTTP/WS server (serves @agrune/devtools webapp)          │
│         │   NEW inbound: recorder_captured (selector + proposed target)       │
│         │   NEW outbound: recorder_toggle (dev-only gate)                     │
│         └── CommandBroker + HitlController (unchanged; gets new tool names)   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**핵심 관찰:** 진실의 원천(manifest)은 authoring 쪽에 있지만, 런타임 결정(target resolution, macro execution)은 **페이지 컨텍스트**에서 일어난다. 두 컨텍스트 사이에서 manifest가 **어떻게 흘러가는가**가 이 피봇의 전부다.

---

## 2. 새/수정 패키지 인벤토리

| 패키지 | 상태 | 역할 | 주요 추가 |
|---|---|---|---|
| `@agrune/core` | **수정** | 공유 타입 | `AgruneManifest`를 v2→v3로 버전 범핑, `ManifestTarget`/`RepeatDef`/`MacroDef` 타입, `ComponentIdentityKey` 타입, 새 에러코드 (`MANIFEST_INVALID`, `MACRO_STEP_FAILED`, `IDENTITY_BRIDGE_MISSING`) |
| `@agrune/manifest` | **신규** | 타입 안전 authoring SDK | `defineManifest`/`defineTarget`/`defineRepeat`/`defineMacro` — 컴파일 타임에 identity/selector 짝 검증 |
| `@agrune/react` | **신규** | root-import 프레임워크 통합 | `<AgruneDevtools manifest={} mode />`, Fiber traversal → `FiberIdentityIndex`, **bridge** 구현 |
| `@agrune/runtime` | **수정** | 페이지 런타임 | `dom-scanner`를 deprecate (완전 삭제는 아님, 테스트용 유지 옵션), `ManifestLoader`/`TargetResolver`/`MacroRunner`/`SensitiveMask` 신규, bootstrap 게이트 제거(항상 부팅) |
| `@agrune/browser` | **수정** | CDP 드라이버 | `CdpRuntimeInjector`에 manifest preload 파라미터 추가, `Runtime.addBinding` 추가 이름 (`agrune_identity`, `agrune_recorder`) |
| `@agrune/mcp` | **수정** | MCP 서버 + devtools 서버 | `manifest_load`/`macro_run` tool, snapshot v3 변환 레이어, recorder 엔드포인트 |
| `@agrune/devtools` | **수정** | standalone webapp | 레코더 오버레이 모드 토글, 캡쳐된 셀렉터를 서버로 전송 |
| `@agrune/cli` (현재 `@agrune/mcp` 안) | **수정** | CLI | `agrune manifest {dev,validate,submit}`, `agrune maps {add,types}` 서브커맨드, `~/.agrune/maps/` 캐시 관리 |

**삭제 후보:** `packages/extension/` 아카이브는 v0.5에서 제거해도 안전함(이미 비활성). 단 이건 피봇과 독립된 청소 작업이므로 별도 PR 권장.

---

## 3. 질문별 결정 — 트레이드오프와 권장안

### Q1. `@agrune/react`의 Fiber 인덱스를 주입된 runtime에 어떻게 publish하는가?

**결정 매트릭스:**

| 후보 | 보안 | 타이밍 | DX | 빌드 결합도 | 권장 |
|---|---|---|---|---|---|
| (a) `window.__agrune_identity__` 글로벌 | 낮음(앱 코드 오염, 프로토타입 공격 표면) | 즉시 | 단순 | 약함 | **primary** |
| (b) `window.postMessage` + 커스텀 프로토콜 | 중간 | 약간의 비동기 | 리스너 관리 필요 | 약함 | 폐기 |
| (c) 커스텀 element (`<agrune-identity-bridge>`) | 높음(shadow DOM 격리 가능) | 즉시 | 복잡 | 약함 | 폐기 |
| (d) CDP 브리지 스크립트 (Node → page Runtime.evaluate) | 높음 | 매우 느림, RTT 비용 | 복잡 | 강함 | 폐기 |

**권장: (a) `window.__agrune_identity__` 글로벌 + "provider → reader" 계약을 타입으로 고정.**

이유:
1. **동일 실행 컨텍스트** — `<AgruneDevtools />`가 마운트되는 React 트리는 agrune runtime이 주입되는 페이지와 **같은 JS realm**에서 돈다. postMessage/CDP 브리지는 오버엔지니어링이다.
2. **의존 역전** — Fiber 트래버설은 React 버전/동시성 모드에 따라 변한다(참고: `__reactFiber$`는 React 내부 키, 공식 stable API 아님 — LogRocket/React FAQ 참조). 이 휘발성 있는 코드를 **런타임 번들에 박지 않고** host 앱에 두면, React major 업그레이드 시 runtime을 재배포하지 않아도 된다.
3. **프로덕션 모드 분기 용이** — `<AgruneDevtools mode="prod">`는 인덱스를 publish하지 않고, runtime은 자동으로 CSS selector fallback으로 떨어진다(아래 §4.2 resolver).

**계약 스케치 (`@agrune/core`에 선언):**

```typescript
// packages/core/src/identity-bridge.ts (신규)
export interface AgruneIdentityBridge {
  readonly version: 1
  // 런타임이 호출; 없으면 null
  resolveByKey(key: ComponentIdentityKey): Element | null
  // 디버깅/레코더용
  listKeys(): ComponentIdentityKey[]
  // React dev-mode에서만 제공
  reverseLookup?(el: Element): ComponentIdentityKey | null
}

declare global {
  interface Window {
    __agrune_identity__?: AgruneIdentityBridge
  }
}
```

**Fiber 트래버설은 `@agrune/react` 내부에 격리** — 이 패키지만 React 내부 API(`__reactFiber$`)에 의존하고, 다른 패키지는 전부 위 `AgruneIdentityBridge` 인터페이스만 본다.

**보안 고려:**
- 프로토타입 오염 방지: `Object.defineProperty(window, '__agrune_identity__', { configurable: false, writable: false, value: bridge })` 로 lock.
- CSP 호환: 이 방법은 `unsafe-eval`이나 inline 스크립트를 요구하지 않는다(host 앱이 번들러로 통합하므로). 주입된 agrune runtime 자체는 기존 CDP `Page.addScriptToEvaluateOnNewDocument` 경로라 CSP 우회 가능.
- Sensitive 필드는 identity index에 실렸어도 agrune runtime이 **snapshot emit 시** 마스킹하므로, bridge 계약 자체는 non-sensitive.

### Q2. Manifest 로딩 — inject 시점? 첫 snapshot 시점?

**권장: hybrid — default는 "inject 시 preload", 외부 레지스트리 사이트는 "lazy on first navigation"**.

| 전략 | cold-start 지연 | manifest 변경 반응성 | 복잡도 |
|---|---|---|---|
| inject 시 항상 preload | 가장 짧음(부트스트랩 직후 resolver 준비됨) | 변경 시 재주입 필요(이미 Chrome 재시작 = 자연스러움) | 낮음 |
| 첫 snapshot에 lazy fetch | snapshot 첫 호출 + 네트워크 RTT | host manifest 핫리로드 쉬움 | 중간 |
| **hybrid (권장)** | owned 앱 preload, 외부 lazy | 양쪽 최선 | 중간 |

**구체:**
- **owned 앱** (root-import 케이스) — `<AgruneDevtools manifest={m} />`가 첫 렌더 시 `window.__agrune_identity__`와 **동시에 `window.__agrune_manifest__`를 publish**. agrune runtime은 부트스트랩 직후 `window.__agrune_manifest__`를 읽어 resolver 초기화. **zero-RTT**.
- **외부 사이트** (registry 케이스) — CDP `CdpRuntimeInjector.prepareSession()`이 **주입 시 `Page.addScriptToEvaluateOnNewDocument`의 source에 `__agrune_preload_manifest__`를 포함**. 이 manifest는 Node 측 `~/.agrune/maps/` 캐시에서 읽어 **문자열 리터럴로 직렬화**되어 스크립트에 박힌다. RTT 없음, 네트워크 없음.
- **manifest가 없는 경우** — runtime은 idle 상태로 부팅, `manifest_load` MCP tool이 호출되면 그때 `Runtime.evaluate`로 manifest를 세팅.

**cold-start 수치 가이드라인 (MEDIUM confidence — 실측 필요):**
- `Page.addScriptToEvaluateOnNewDocument` 소스 10 KB 추가 → 영향 미미(<5ms).
- 큰 manifest(>200 KB)는 스크립트에 박으면 페이지 파싱 지연이 발생할 수 있으므로, 초과 시 `Runtime.evaluate`로 분리 주입하는 fallback 경로를 마련해둘 것(향후 phase).

### Q3. Snapshot 프로토콜 — backward-compatible extend인가 breaking bump인가

**권장: `PageSnapshot.version`을 2 → 3으로 **breaking bump**. 단 MCP 공개 출력 스키마는 **adapter layer**에서 변환해 AI 하네스 기대값을 1 사이클 동안 유지.**

이유:
1. **internal vs external 구분** — `PageSnapshot`(runtime ↔ driver)는 내부 타입. `toPublicSnapshot()`이 이미 `@agrune/mcp/public-shapes.ts`에 존재 — MCP 공개 응답은 이 adapter 경유.
2. **v3에서 바뀌는 것**:
   - `PageTarget`에 `identityKey?: ComponentIdentityKey` 필드 추가 (resolver가 어떤 경로로 찾았는지 audit).
   - `PageSnapshot`에 `manifestRef?: { host: string; version: string }` 추가 (어떤 manifest가 쓰였는지 MCP 응답에 메타로).
   - `PageSnapshotGroup`에 `repeatInstance?: { index: number; key: string }` 추가 (repeat primitive 전개 결과).
   - `sourceFile`/`sourceLine`/`sourceColumn`은 inline annotation용이었으므로 **optional로 완화** (manifest는 별도 위치 추적).
3. **v2 유지 이유 없음** — v1.1 유저가 없어서 migration 필요 없음(PROJECT.md §Key Decisions 2026-04-19).
4. **AI 하네스 영향 완화** — `toPublicSnapshot()`이 v3 → v2-shaped 출력을 기본으로 내보내고, `mode: 'v3'` 파라미터(`agrune_snapshot`에 추가)로 옵트인. 한 사이클 뒤 기본값 전환.

**snapshot 내보내기 시점의 필터:**
```
runtime.getSnapshot()  →  [v3 internal]
       ↓
driver.getSnapshot()   →  [v3 internal] (unchanged)
       ↓
toPublicSnapshot(v3, { shapeVersion: 'v2' | 'v3' })  →  [public]
```

### Q4. Macro runner 위치 — 페이지 런타임인가, MCP 오케스트레이션인가

**권장: 페이지 런타임 — `MacroRunner`는 `command-handlers.ts`와 같은 realm.**

| 기준 | 페이지 런타임 (권장) | MCP 오케스트레이션 |
|---|---|---|
| 에러 복구 | `command-handlers`의 retry/flow-lock/overlay-guard 재사용 | 각 step마다 CDP round-trip, 중간 실패 시 snapshot 재동기 비용 |
| 부분 상태 | 한 realm 안이라 트랜잭션성 확보 용이(중단점에서 resume 가능) | 여러 MCP 호출 사이 상태 일관성 유지 어려움 |
| TypeScript 타이핑 | `defineMacro`의 step 타입 → runtime에서 직접 소비 가능 | MCP JSON 경계에서 타입 소실, Zod re-validation 필요 |
| HITL 통합 | `HitlController`가 macro 전체를 하나의 단위로 게이트 | step별 게이트(좋을 수도, 나쁠 수도) |
| 재시도/타임아웃 | `action-queue` + `event-sequences` 재사용 | MCP 툴 타임아웃 정책으로 위임 |

**타협:** `MacroRunner`는 페이지 런타임에 두되, **진행 상태를 `agrune_send` binding으로 스트리밍** — MCP `macro_run` 툴은 이를 duration/step events로 `CommandBroker`에 브로드캐스트. HITL gate는 macro 시작/종료에 한 번씩(step별로 필요하면 macro 정의에서 `hitl: 'step'` 플래그 지정).

**예외:** macro 안에 **다른 탭으로의 세션 스위치**가 들어가면 페이지 런타임으로는 불가능 — 이건 MCP 레벨에서만 가능. 따라서 `defineMacro`의 step 타입에 `session_switch`는 포함하지 않는다(v0.5 제약). multi-session 매크로는 v0.6+.

### Q5. Registry fetch 레이어 — 디스크 캐시 vs 런타임 스트리밍

**권장: 디스크 캐시 강제. 런타임 스트리밍 없음.**

```
agrune maps add youtube.com@1.2.0
  ↓
CLI fetch https://raw.githubusercontent.com/agrune/maps/v1.2.0/sites/youtube.com/manifest.json
  ↓
SHA256 검증 (레지스트리 lock 파일 agrune.maps.lock.json)
  ↓
writeFile ~/.agrune/maps/youtube.com@1.2.0.json
  ↓
업데이트 ./agrune.maps.lock.json (workspace-level)
```

**이유:**
1. **오프라인 우선** — 로컬 우선 제품 원칙(PROJECT.md Constraints Privacy)과 일치. 비행기/불안정 네트워크에서도 자동화가 돌아야 함.
2. **결정론적 실행** — AI 하네스 호출은 재현 가능해야 함. URL을 런타임에 fetch하면 레지스트리 변경이 조용히 동작을 바꿀 수 있음.
3. **감사 가능성** — `agrune.maps.lock.json`이 의존성 잠금 파일 역할. PR 리뷰어가 어떤 버전이 쓰였는지 봄.
4. **캐시 구조:**
   ```
   ~/.agrune/maps/
     index.json                          # host → latest version seen
     youtube.com@1.2.0.json              # 실제 manifest (immutable)
     youtube.com@1.2.0.sig               # optional 서명 (v0.6+)
     _downloads/<sha256>.json            # tmp, atomic rename용
   ```
5. **`agrune maps types`** — 캐시된 manifest들을 스캔해 `agrune.maps.d.ts`를 로컬에 생성 (host → manifest shape 타입 제공). `tsc` 파이프라인에 태울 것.

**런타임 스트리밍을 기각하는 실무 근거:**
- CORS/인증 이슈로 raw.githubusercontent.com 요청이 브라우저에서 막힐 수 있음.
- 렌더러 프로세스에서 외부 fetch → CSP 위반 가능.
- 레지스트리가 GitHub 외의 미러로 이동할 때 코드 수정 최소화(CLI만 바뀌면 됨).

### Q6. Recorder overlay → authoring 파일까지의 플로우

**권장: MCP 서버를 경유하는 **디스크 쓰기 + dry-run preview**. Vite 플러그인은 선택.**

```
(페이지 컨텍스트) 사용자가 devtools 웹앱에서 "Record" 토글
  ↓ (WS: recorder_toggle)
(devtools 웹앱) 상태 "recording" → runtime에 publish (agrune_recorder binding)
  ↓
(runtime) 오버레이 활성 — click 후보 element에 하이라이트, 선택 시 selector/identity 캡쳐
  ↓ (agrune_send binding)
(devtools 웹앱) recorder_captured 이벤트 수신 → 사용자가 name/desc/action 채움
  ↓ (WS: recorder_commit)
(MCP 서버) recorder_commit 수신 → CLI-owned 디렉토리(~/.agrune/authoring/pending/<session>/<target>.json)로 write
  ↓
(사용자 터미널) `agrune manifest dev` watcher가 pending/을 감지 → diff preview → "Apply to manifest.ts?" 컨펌
  ↓
코드 모드 머지 (ts-morph/recast로 defineManifest 오브젝트에 target 삽입)
```

**세 가지 대안 비교:**

| 대안 | 장점 | 단점 | 권장 |
|---|---|---|---|
| (a) MCP 서버가 manifest.ts 직접 쓰기 | 1단계 | 사용자 파일을 서버가 임의 수정 — 거부감·실수 위험 | ✗ |
| (b) 복사-붙여넣기 (devtools UI → 클립보드) | 안전 | DX 나쁨, 반복 지옥 | ✗ (백업) |
| (c) **pending 디렉토리 → `agrune manifest dev` 컨펌 머지** | 사용자 컨센트 지점 분리, CLI 경로가 파일 수정 책임 | 2단계 flow | **primary** |
| (d) Vite 플러그인 직접 HMR | 호트 리로드 즉시 | Vite 없는 프로젝트 제외, 빌드 툴 침습 | 선택 옵션 |

**경계 명확화:**
- **MCP 서버는 pending 디렉토리에만 쓴다** — 사용자 소스 파일에는 쓰지 않는다.
- **CLI가 소스 파일 수정의 유일한 주체** — 이걸 git hook/CI에서 감사 가능.
- **`agrune manifest dev`가 idle할 때 pending이 쌓이면 CLI가 다음 실행 시 prompt** — 잃어버리지 않음.

### Q7. 빌드 순서 — 무엇이 먼저 착지해야 partial하게 쓸 수 있는가

**의존 DAG:**

```
@agrune/core (types)
   ├──▶ @agrune/manifest (defineX SDK)          [A]
   │         └──▶ @agrune/react (bridge)         [B]
   ├──▶ @agrune/runtime (TargetResolver, etc)   [C]
   │         └──▶ @agrune/browser (injector)     [D]
   │                     └──▶ @agrune/mcp (tools)[E]
   │                                └──▶ devtools[F]
   │                                └──▶ CLI    [G]
   └──▶ registry schema                          [H]
```

**권장 착지 순서 (각 단계에서 시스템이 동작 가능한 상태 유지):**

| Phase | 착지 | 사용 가능한 기능 |
|---|---|---|
| **P1** | `@agrune/core` manifest v3 타입 + `@agrune/manifest` SDK + `@agrune/runtime` `ManifestLoader`/`TargetResolver` (CSS-only 경로), inline scanner deprecated지만 유지 | 수동으로 manifest 오브젝트 전달 → 테스트 가능 (유닛 레벨) |
| **P2** | `@agrune/browser` injector가 `__agrune_preload_manifest__` 지원 + `@agrune/mcp`에 `manifest_load` tool | E2E에서 외부 사이트 manifest 주입 가능, **registry 없이도 엔드투엔드 동작** |
| **P3** | `@agrune/react` 패키지 (fiber bridge) → runtime의 identity 경로 활성 | owned 앱에서 root-import 1줄로 동작 |
| **P4** | `MacroRunner` + macro_run tool | 복합 플로우(로그인 등) 자동화 가능 |
| **P5** | CLI `agrune maps add/types` + `~/.agrune/maps/` 캐시 + registry repo 초기 매니페스트 | 외부 유명 사이트 자동화 |
| **P6** | devtools 레코더 오버레이 + MCP recorder 엔드포인트 + CLI 머지 플로우 | 수기 작성 없이 target 추가 |
| **P7** | `agrune manifest submit` (registry PR 자동화) + 감사 관리자 역할 | 외부 기여자 온보딩 |

**핵심 관찰:**
- **P3는 P2 뒤에 와도 됨** — CSS-only 모드로 P2에서 이미 완성된 축이 동작. React 통합이 블로커가 되지 않는다.
- **P5는 P4와 독립** — 레지스트리 없이도 owned 앱 자동화는 P3까지로 완성.
- **inline scanner 완전 삭제는 P7 후** — v0.4 코드 회귀 테스트 용도로 유지, v0.6에서 제거.

---

## 4. 데이터/제어 흐름 — 3개의 대표 시나리오

### 4.1 "owned 앱에서 `agrune_act` 호출"

```
1. 사용자 React 앱이 <AgruneDevtools manifest={m} mode="dev" /> 마운트
2. @agrune/react가 Fiber 트래버스 → FiberIdentityIndex 구축
3. window.__agrune_identity__ = bridge (frozen)
4. window.__agrune_manifest__ = m (plain JSON-able)
5. [나중] agrune runtime이 이미 부팅됨 (CDP injector, 항상 부팅)
   runtime이 __agrune_manifest__를 poll → ManifestLoader가 소비 → TargetResolver ready
6. AI 하네스가 agrune_act({ targetId: 'login.submit' }) 호출
7. MCP server → CdpDriver.execute(tabId, cmd)
8. Runtime.callFunctionOn('handleCommand', 'act', ...)
9. page-agent-runtime의 handleAct:
   a. TargetResolver.resolve('login.submit')
      → manifest target의 identityKey 발견
      → window.__agrune_identity__.resolveByKey(key) → Element
      → (identity 실패 시) selector fallback → document.querySelector(...)
   b. 기존 command-handlers click 경로 실행
10. 결과 + snapshot → agrune_send binding → Node
11. MCP응답 (adapter: v3→public shape)
```

### 4.2 "외부 사이트(youtube.com)에서 macro 실행"

```
1. 사용자: `agrune maps add youtube.com@1.2.0`
   → ~/.agrune/maps/youtube.com@1.2.0.json 저장
2. 사용자: `agrune --map youtube.com=1.2.0 ...` CLI 실행
3. CdpRuntimeInjector.prepareSession():
   - 캐시에서 manifest 읽기
   - 스크립트 source에 JSON.stringify(manifest)를 __agrune_preload_manifest__로 박음
   - Page.addScriptToEvaluateOnNewDocument
4. 페이지 로드 → agrune runtime 부팅 → preload manifest 읽어 resolver ready
5. AI: agrune_macro_run({ macroId: 'upload_video', args: { title: '...' } })
6. MCP → CdpDriver.execute(tabId, { kind: 'macro_run', ... })
7. MacroRunner in-page:
   for step in macro.steps:
     resolve → command-handlers.handleX → snapshot post
     HITL gate 체크 (macro 시작/종료만, 내부 step은 skip)
     실패 시 macro.steps[i]의 onError 정책 평가
8. 최종 결과 배치 → MCP 응답 (step별 요약 포함)
```

### 4.3 "레코더로 target 추가"

```
1. 개발자: devtools 웹앱 접속 → Record 토글 ON
2. WS outbound: { type: 'recorder_toggle', on: true }
3. MCP server → CdpDriver → Runtime.callFunctionOn(recorderSetMode, true)
4. 페이지 오버레이 활성 (dev-only CSS, 호스트 앱 스타일 영향 없음)
5. 사용자가 화면에서 "Submit" 버튼 클릭
6. runtime 캡쳐:
   - element → CSS selector 추천 (agrune-selectorator 알고리즘)
   - identity bridge reverseLookup 가능하면 identityKey도 첨부
7. agrune_send('recorder_captured', { selector, identityKey, elementMeta })
8. WS: devtools 웹앱이 양식 표시 (name/desc/action 입력)
9. 사용자 "Commit" → WS: { type: 'recorder_commit', target: {...} }
10. MCP server: ~/.agrune/authoring/pending/<sessionId>/<ts>.json 저장
11. 터미널에서 `agrune manifest dev`가 pending 감지 → diff preview → 사용자 컨펌
12. ts-morph가 manifest.ts에 target 삽입
13. 파일 저장 → Vite/watcher가 HMR → <AgruneDevtools>가 새 manifest prop 받음
14. 페이지 새 __agrune_manifest__ 게시 → runtime hot-reload (invalidate + rebuild)
```

---

## 5. 기존 코드 통합 포인트 — 줄 단위 map

| 기존 파일 | v0.5 변경 내용 |
|---|---|
| `packages/core/src/index.ts` | 새 에러코드 추가(`MANIFEST_INVALID`, `MACRO_STEP_FAILED`, `IDENTITY_BRIDGE_MISSING`), `PageTarget.identityKey?` 필드, `PageSnapshot.version` 3으로, `manifestRef?` 필드 |
| `packages/core/src/manifest.ts` | v3 스키마(repeat/macro/sensitive 구조화), `AgruneExposureMode`에 `'manifest'` 추가 또는 재정의 |
| `packages/core/src/` (신규) | `identity-bridge.ts`, `manifest-v3.ts`, `registry-types.ts` |
| `packages/runtime/src/dom-scanner.ts` | **deprecate** 주석 + 테스트에서만 사용, bootstrap 경로에서 제거 |
| `packages/runtime/src/manifest-builder.ts` | **obsolete** — v0.5에선 manifest가 외부 소스에서 오므로 "scanned → manifest" 변환은 불필요. 테스트 픽스처로 유지 후 v0.6에서 삭제 |
| `packages/runtime/src/index.ts` | 새 exports: `createTargetResolver`, `createMacroRunner`, `installManifest` |
| `packages/runtime/src/runtime/page-agent-runtime.ts` | `installPageAgentRuntime(manifest, opts)` 시그니처 유지하되 `manifest`를 v3로, internal resolver 주입 |
| `packages/runtime/src/runtime/command-handlers.ts` | targetId 해석 경로가 `findSnapshotTarget` → `TargetResolver.resolve` 로, sensitive 마스킹 훅 |
| `packages/runtime/src/runtime/snapshot.ts` | snapshot 빌더가 repeat instance 전개, manifestRef 첨부, sensitive 마스킹 |
| `packages/browser/src/cdp-runtime-injector.ts` | `prepareSession(sessionId, { preloadManifest? })` 시그니처, bootstrap 소스가 `selectors`로 어노테이션을 체크하던 부분 제거(always-boot), `__agrune_preload_manifest__` 박아넣기 로직 |
| `packages/browser/src/cdp-driver.ts` | `loadManifest(tabId, manifest)`, `runMacro(tabId, macroId, args)` 메서드 추가 — `BrowserDriver` 인터페이스 확장 |
| `packages/mcp/src/mcp-tools.ts` | `agrune_manifest_load`, `agrune_macro_run` 툴 정의 |
| `packages/mcp/src/tools.ts` | getToolDefinitions에 신규 툴 |
| `packages/mcp/src/public-shapes.ts` | `toPublicSnapshot(snapshot, { shapeVersion: 'v2'|'v3' })` |
| `packages/mcp/src/devtools-server.ts` | 새 inbound: `recorder_capture`, `recorder_commit`; 새 outbound: `recorder_toggle`, `recorder_status` |
| `packages/devtools/src/types.ts` | 메시지 유니온에 recorder-* 추가 |
| `packages/devtools/src/panel.ts` (`index.ts`) | Recorder tab/오버레이 제어, pending list view |

---

## 6. 보안 고려사항

| 위협 | 완화 |
|---|---|
| `window.__agrune_identity__` 프로토타입 오염/덮어쓰기 | `Object.defineProperty({configurable:false, writable:false})`로 lock. 런타임이 lock 실패 시 `IDENTITY_BRIDGE_MISSING` 에러로 CSS selector fallback 강제 |
| 주입된 스크립트가 페이지 JS에 노출 | 기존 CDP `addScriptToEvaluateOnNewDocument` 패턴은 이미 페이지와 realm 공유 — v0.5가 새 위험을 추가하지 않음. 민감 데이터(manifest 값)는 접근 가능하나 manifest는 public으로 설계 |
| CSP 엄격한 사이트에서 CDP 주입 | CDP 주입은 CSP를 우회(확인된 동작). manifest를 scriptToEvaluate source에 박는 방식은 추가 CSP 요구 없음 |
| 레지스트리 manifest가 악성 selector/macro를 배포 | (1) PR 기반 리뷰(github.com/agrune/maps), (2) `agrune maps add`가 SHA256 검증, (3) manifest는 selector/macro만 포함 — executable 코드 없음. 단 macro의 `fill` step은 입력 값을 manifest가 제어 가능하므로 target/value 쌍이 사용자 의도와 일치하는지 CLI `agrune manifest validate`가 dry-run 검증 |
| React Fiber 내부 API(`__reactFiber$`) 변경 | `@agrune/react`에만 격리, runtime 측은 `AgruneIdentityBridge` 인터페이스만 의존. React 버전별 adapter 레이어 (`fiber-adapter-v18.ts`, `fiber-adapter-v19.ts`) |
| Sensitive 필드 우발적 노출 | 마스킹은 snapshot emit **시점에** 적용(data at rest는 원본, data over wire는 mask). manifest schema의 `sensitive: true`가 필수 필터 |
| Macro가 무한루프/무한대기 | MacroRunner에 전체 시간 제한 + step별 제한, action-queue의 기존 타임아웃 재사용 |

---

## 7. Scaling Considerations

| 규모 | 관심 지점 | 접근 |
|---|---|---|
| 1 host app, 10 targets | 현재 구조로 충분 | — |
| 1 host app, 1k targets | FiberIdentityIndex 빌드 비용 | React DevTools처럼 lazy subtree 트래버설 (viewport 기반) |
| 10+ external sites in registry | ~/.agrune/maps/ 캐시 수 증가 | JSON 단일 파일 유지(10 KB 규모라면 100개=1 MB, 무시 가능). index.json에 메타만 |
| Repeat primitive로 DOM 수백 인스턴스 | snapshot payload 크기 | snapshot outline mode(기존)로 그룹 단위 응답, full mode 요청 시에만 전개 |
| Macro 100 step | CDP round-trip 없이 한 realm 내 실행 | 권장 §Q4 유지 — 페이지 런타임 실행이 scaling에 핵심 |

---

## 8. Anti-Patterns (v0.5 맥락)

### Anti-Pattern 1: 런타임이 직접 Fiber에 의존
**잘못:** `@agrune/runtime`에서 `el.__reactFiber$...`를 직접 읽는 코드.
**왜 나쁜가:** React 버전마다 깨짐. runtime은 `@agrune/runtime` 패키지 하나의 버전인데, host app의 React는 제각각.
**대신:** `AgruneIdentityBridge` 인터페이스만 보고, 모든 React 의존은 `@agrune/react` 패키지에 격리.

### Anti-Pattern 2: Manifest 변경 시 페이지 전체 reload
**잘못:** manifest 핫리로드가 `location.reload()` 호출.
**왜 나쁜가:** 사용자 상태 손실(입력 폼, 스크롤), 레코더 중단.
**대신:** `ManifestLoader.update(newManifest)` — resolver/macro 테이블만 재구축. 기존 overlay/cursor 보존.

### Anti-Pattern 3: Macro를 MCP 쪽 JavaScript로 orchestrate
**잘못:** `macro_run` 툴이 내부적으로 `agrune_act` → `agrune_fill` → `agrune_act`를 순차 호출하는 Node 코드.
**왜 나쁜가:** step 사이 네트워크/CDP 지연, 트랜잭션성 상실, 상태 드리프트.
**대신:** §Q4 — MacroRunner를 페이지 런타임에서 실행, MCP는 시작/종료 orchestrate.

### Anti-Pattern 4: 레지스트리를 런타임 fetch
**잘못:** agrune runtime이 페이지에서 `fetch('https://raw.githubusercontent.com/...')`.
**왜 나쁜가:** CORS/CSP/오프라인. §Q5.
**대신:** CLI가 ~/.agrune/maps/로 pull, 주입 시 source에 embed.

### Anti-Pattern 5: devtools 웹앱이 사용자 파일 시스템에 쓴다
**잘못:** MCP 서버에 `write_file(path, content)` 툴.
**왜 나쁜가:** 사용자 합의 지점 부재, git diff에 갑자기 의문의 target들.
**대신:** §Q6 — pending 디렉토리 → CLI가 합의 후 머지.

---

## 9. Sources

- 기존 코드 인벤토리: `packages/{core,runtime,browser,mcp,devtools}/src/` (HIGH confidence, 직접 읽음)
- 기존 CDP 주입 패턴: `packages/browser/src/cdp-runtime-injector.ts` lines 35-276
- 기존 manifest v2 스키마: `packages/core/src/manifest.ts`
- 기존 MCP 툴 정의: `packages/mcp/src/mcp-tools.ts`, `packages/mcp/src/index.ts`
- PROJECT.md §Key Decisions (2026-04-19 v0.5 킥오프, 2026-04-15 CDP-only 피봇)
- React Fiber 내부 접근 제약: [React Fiber deep dive — LogRocket](https://blog.logrocket.com/deep-dive-react-fiber/) (MEDIUM)
- React 공식 태도(internals not stable API): [Virtual DOM and Internals – React](https://legacy.reactjs.org/docs/faq-internals.html) (HIGH)
- Fiber 기반 프로덕션 DOM 제어 사례: [VWO Editor — Wingify Engineering](https://engineering.wingify.com/posts/dom-manipulation-for-react-sites/) (MEDIUM — 유사 시나리오 존재 증거)

---

*Architecture research for: agrune v0.5 Manifest Pivot 통합 설계*
*Researched: 2026-04-19*
*Branch: feat/v0.5-manifest*
