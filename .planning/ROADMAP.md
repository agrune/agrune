# Roadmap: agrune

## Milestones

- ✅ **v1.0 Research** — Phases 1-4 (shipped 2026-04-18) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Browser Completion** — Phases 5-10 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v0.5 Manifest Pivot** — Phases 11-18 (kickoff 2026-04-19, branch `feat/v0.5-manifest`)

## Phases

<details>
<summary>✅ v1.0 Research (Phases 1-4) — SHIPPED 2026-04-18</summary>

- [x] Phase 1: Channel Inventory and Constraints (3/3 plans)
- [x] Phase 2: Annotation Methods Report (2/2 plans)
- [x] Phase 3: Annotation Alternatives Report (2/2 plans)
- [x] Phase 4: Product Synthesis and Recommendation (2/2 plans)

</details>

<details>
<summary>✅ v1.1 Browser Completion (Phases 5-10) — SHIPPED 2026-04-18</summary>

- [x] Phase 5: Input Reliability (3/3 plans) — completed 2026-04-18
- [x] Phase 6: Stability & Recovery (3/3 plans) — completed 2026-04-18
- [x] Phase 7: Multi-Tab Session UX (3/3 plans) — completed 2026-04-18
- [x] Phase 8: DevTools Webapp (2/2 plans) — completed 2026-04-18
- [x] Phase 9: Quality Infrastructure (3/3 plans) — completed 2026-04-18
- [x] Phase 10: Docs & Distribution (5/5 plans) — completed 2026-04-18

</details>

### v0.5 Manifest Pivot (Phases 11-18)

- [x] **Phase 11: MANIFEST** — `@agrune/manifest` SDK + v3 schema + CSS-only runtime resolver
- [x] **Phase 12: INJECT** — CDP manifest preload + `agrune_manifest_load` MCP tool + PageSnapshot v3 landing
- [x] **Phase 13: REACT** — `@agrune/react` root-import + fiber identity bridge + 2단계 prod guard
- [ ] **Phase 14: MACRO** — in-page MacroRunner + `agrune_macro_run` + runtime sensitive mask (override 불가)
- [ ] **Phase 15: REPEAT** — `defineRepeat` runtime expander + viewport-only virtualized strategy
- [ ] **Phase 16: RECORD** — DevTools recorder overlay + `agrune manifest dev` watcher + AI authoring skill rewrite
- [ ] **Phase 17: REMOVE** — inline `data-agrune-*` 스캐너 완전 제거 + 문서 재작성 + "target mapping" 용어 전환
- [ ] **Phase 18: REGISTRY** — `github.com/agrune/maps` 공개 + `agrune maps` CLI + governance(tier + velocity limit + PR bot)

## Phase Details

### Phase 11: MANIFEST
**Goal**: manifest가 모든 것의 뿌리가 된다 — 타입 안전 authoring SDK + v3 스키마 + CSS-only runtime resolver까지 닫아 수동 manifest 전달만으로 외부 사이트 자동화가 엔드투엔드 가능.
**Depends on**: Nothing (DAG root — Phase 10 v1.1 코드 기반 위에서 시작)
**Requirements**: MANIFEST-01, MANIFEST-02, MANIFEST-03, MANIFEST-04, MANIFEST-05, RESOLVE-02, RESOLVE-04
**Success Criteria** (what must be TRUE):
  1. Author가 `defineManifest({ targets: [defineTarget({...})], repeats: [defineRepeat({...})], macros: [defineMacro({...})] })` 를 작성하면 TS가 `targetId` union·`actionKinds`·selector ladder를 컴파일 타임에 검증한다.
  2. `agrune manifest validate <manifest.ts> --url https://site` 가 live DOM에 대해 selector 1:1 매칭을 확인하고 실패한 target을 보고한다.
  3. Runtime이 수동 주입한 manifest로 부팅하면, CSS fallback selector(priority: role > text > testId > stable attr > CSS; 해시 class/`:nth-child` 금지)로 외부 사이트 target을 resolve한다.
  4. Runtime은 더 이상 `data-agrune-*` 부트스트랩 게이트를 요구하지 않는다 — manifest 유무와 무관하게 항상 부팅하고 manifest 없으면 idle 상태에 머문다.
  5. Schema level에서 `sensitive:true` flag가 존재하며, `sensitive:false` 로 runtime heuristic을 override할 수 없다는 계약(OR-only)이 스키마·타입·validate CLI 에러 메시지로 확정돼 있다.
**Plans**: 5 plans
- [x] 11-01-PLAN.md — @agrune/manifest SDK (v3 schema + defineManifest/Target/Repeat/Macro + zod validator)
- [x] 11-02-PLAN.md — TargetResolver CSS ladder (role>text>testId>attr>css) + isSensitive OR-only
- [x] 11-03-PLAN.md — @agrune/core v3 re-export + runtime descriptor 경로 v3 이식
- [x] 11-04-PLAN.md — bootstrap 게이트 제거 + idle boot + Playwright E2E
- [x] 11-05-PLAN.md — agrune manifest validate CLI + live DOM matching
**UI hint**: no

### Phase 12: INJECT
**Goal**: Phase 11의 manifest가 CDP 경로와 MCP tool로 연결되어 외부 사이트(예: YouTube)에서 수동 manifest 로드로 엔드투엔드 동작이 성립하고, PageSnapshot v3 breaking bump가 다른 phase에 침투하기 전에 닫힌다.
**Depends on**: Phase 11
**Requirements**: INJECT-01, INJECT-02, RESOLVE-01, RESOLVE-03
**Success Criteria** (what must be TRUE):
  1. AI 에이전트가 `agrune_manifest_load({ manifest })` 를 호출하면 CLI에서 로드한 manifest가 활성 세션에 주입되고 이후 `agrune_snapshot`/`agrune_act` 가 해당 manifest 기반으로 동작한다.
  2. `CdpRuntimeInjector.prepareSession({ preloadManifest })` 가 외부 사이트용 `__agrune_preload_manifest__` JSON을 `addScriptToEvaluateOnNewDocument` source에 직접 embed해 첫 페이지 로드에서 zero-RTT로 resolver가 준비된다.
  3. `ManifestLoader` 가 owned 앱의 `window.__agrune_manifest__` 또는 CDP preload JSON 둘 중 어느 소스에서도 manifest를 로드하고, 둘 다 제공되면 `window.__agrune_manifest__` 가 우선한다.
  4. `PageSnapshot.version` 이 2→3으로 breaking bump되고, 기존 v2 adapter 없이 MCP 도구 출력 shape 자체가 변경된다 (외부 소비자에게 breaking change로 선언).
  5. E2E 시나리오: `agrune_manifest_load` → YouTube 페이지 열기 → `agrune_snapshot` → target 1개 이상 resolve → `agrune_act` 가 성공 응답을 반환한다.
**Plans**: 3 plans
- [x] 12-01-PLAN.md — PageSnapshot v3 breaking bump (PageTarget.selector → SelectorLadder + schemaVersion: 3)
- [x] 12-02-PLAN.md — CdpRuntimeInjector preloadManifest embed + BrowserDriver.injectManifest + reloadRuntime debounce
- [x] 12-03-PLAN.md — agrune_manifest_load MCP tool (세 파일 동기화) + E2E smoke (local fixture)
**UI hint**: no

### Phase 13: REACT
**Goal**: `@agrune/react` 루트-임포트 한 줄로 owned React 앱의 per-element 수정 없이 component-identity selector가 활성화되고, prod 번들에 들어가도 2단계 guard가 통과하지 않으면 로드조차 되지 않는다.
**Depends on**: Phase 12
**Requirements**: REACT-01, REACT-02, REACT-03, REACT-04, REACT-05
**Success Criteria** (what must be TRUE):
  1. Author가 `<AgruneDevtools manifest={manifest} mode="dev" />` 1줄을 추가하면 agrune runtime이 `window.__agrune_identity__` bridge로 DOM ↔ fiber resolve가 가능해지고, refactor(컴포넌트 이동·className 변경·CSS-in-JS 해시 변경)에도 selector가 유효하게 유지된다.
  2. SSR 환경(Next.js App Router·Remix streaming)에서 hydration 완료 전에는 bridge가 activate되지 않고, `readyState === 'complete'` + root fiber 존재 확인 후에만 identity가 노출된다.
  3. Prod 번들에서 root-import가 활성화되려면 `AGRUNE_PROD_ENABLED=true` (빌드 env) + `localStorage['agrune.prod.consent']` (런타임 token) 두 guard가 모두 통과해야 하고, 하나라도 없으면 bridge는 no-op으로 동작한다.
  4. `bippy` 기반 `FiberIdentityIndex` 가 path descriptor(displayName + key props + index)로 저장되어, `React.memo(forwardRef(...))` / portal / Suspense / compound component 엣지케이스 fixture가 React 17/18/19 matrix CI에서 전부 pass한다.
  5. `window.__agrune_identity__` 가 `Object.defineProperty({ configurable: false, writable: false })` lock으로 게시되어 프로토타입 오염/덮어쓰기가 불가능하다.
**Plans**: 3 plans
- [x] 13-01-PLAN.md — @agrune/manifest SelectorLadder.fiber + FiberIdentityPath 타입 + runtime resolver fiber-first branch (REACT-01 schema+resolver groundwork)
- [x] 13-02-PLAN.md — @agrune/react 패키지 초기화 + FiberIdentityIndex (bippy) + identity-bridge lock + prod-guard + SSR barrier + <AgruneDevtools /> 컴포넌트 (REACT-01/02/03/04)
- [x] 13-03-PLAN.md — React 17/18/19 matrix fixture + memo/forwardRef/portal/Suspense/compound 엣지케이스 + .github/workflows/react-matrix.yml (REACT-05)
**UI hint**: yes

### Phase 14: MACRO
**Goal**: 복합 플로우(로그인 등)가 페이지 런타임 내부에서 실행되어 CDP round-trip 없이 4x 토큰 절감을 달성하고, 민감 필드는 manifest `sensitive:false` 로도 override할 수 없는 런타임 DOM heuristic으로 보호된다.
**Depends on**: Phase 13 (identity bridge가 안정된 뒤, macro step별 target resolve 안전)
**Requirements**: MACRO-01, MACRO-02, MACRO-03, MACRO-04
**Success Criteria** (what must be TRUE):
  1. AI 에이전트가 `agrune_macro_run({ macroId: 'login', params: { email, password } })` 를 호출하면 MacroRunner가 페이지 런타임 내부에서 전체 step을 실행하고 MCP는 시작/종료만 orchestrate한다 — 중간 step별 CDP round-trip이 발생하지 않는다.
  2. Runtime DOM heuristic(`type=password`, `autocomplete=current-password|new-password|cc-*|one-time-code`, 단어 경계 regex `/\b(password|pwd|cvv|ssn)\b/i`, 한/영/일 ARIA label) 이 manifest `sensitive` 플래그와 OR로 결합되어, 악성 manifest가 `sensitive:false` 로 설정해도 runtime이 override해 해당 필드의 `valuePreview`/로그/스냅샷이 자동 마스킹된다.
  3. Macro precondition(예: `login-form visible`) 실패 시 step 실행 전에 중단되고 "already-in-target-state" 신호가 반환된다. Postcondition 실패 또는 연속 실패 시 circuit breaker가 발동해 partial execution account-lockout을 방지한다.
  4. MacroRunner가 기존 `CommandBroker`/`HitlController`/`action-queue` 를 재사용해 devtools 웹앱 command log에 step별 progress가 스트리밍되고, `sensitive:true` step은 HITL gate를 강제한다.
**Plans**: TBD
**UI hint**: no

### Phase 15: REPEAT
**Goal**: 동적 리스트(YouTube 피드, Notion 리스트) 의 N 인스턴스를 manifest-level declarative하게 표현하고 viewport-only virtualized strategy로 v0.5 범위 안에서 안정 동작한다.
**Depends on**: Phase 14 (macro step에서 repeat instance targeting 가능해야 복합 플로우 완성)
**Requirements**: REPEAT-01, REPEAT-02, REPEAT-03
**Success Criteria** (what must be TRUE):
  1. Author가 `defineRepeat({ template, keyFrom: el => el.dataset.postId, strategy: 'dom' })` 를 작성하면 runtime이 DOM enumerate + textContent anchor로 N개 인스턴스 snapshot을 생성하고 각 인스턴스를 안정된 stable key로 식별한다.
  2. `strategy: 'virtualized'` 선택 시 viewport 내 row만 enumerate하되 `aria-rowcount`/`aria-setsize` 를 logical-size hint로 PageSnapshot에 반영해 AI가 "N보다 큰 index"를 요청할 때 명시적 에러가 나온다 (fiber data-state 접근은 v0.6+ 로 연기 선언).
  3. Snapshot group에 `repeatInstance: { index, key }` 필드가 등장해 AI 에이전트가 `login.items[postId=abc123]` 같은 경로로 개별 인스턴스를 타겟한다.
  4. Validation CLI가 `defineRepeat` 에 stable key가 누락되면 빌드 실패 — index-only key는 reorder에 취약하므로 금지.
**Plans**: TBD
**UI hint**: no

### Phase 16: RECORD
**Goal**: 피봇의 authoring UX가 닫힌다 — DevTools 오버레이 recorder + CLI watcher가 pending 디렉토리를 통해 소스 파일을 안전하게 머지하고, AI authoring skill이 manifest 버전으로 재작성돼 sensitive auto-detect 정확도가 precision≥90%/recall≥95%를 달성한다.
**Depends on**: Phase 15 (recorder가 캡처하는 모든 구조 — target/repeat/macro — 이 이미 runtime에서 resolvable해야 함)
**Requirements**: RECORD-01, RECORD-02, RECORD-03, RECORD-04, RECORD-05
**Success Criteria** (what must be TRUE):
  1. DevTools 웹앱의 `RecorderView` 에서 사용자가 `idle → picking → recording-action` mode를 keyboard shortcut으로 토글하고, picking 모드에서 element hover→클릭으로 candidate selector 3개(fiber path, role+name, CSS fallback)를 캡처한다.
  2. `recorder_toggle` / `recorder_captured` / `recorder_commit` WS 프로토콜이 확정되어, MCP 서버가 캡처 결과를 `~/.agrune/authoring/pending/<session>/<ts>.json` 에만 쓰고 **사용자 소스 파일에는 절대 직접 쓰지 않는다**.
  3. `agrune manifest dev` watcher가 pending 디렉토리 변경을 감지해 ts-morph 기반으로 `manifest.ts` 의 `defineManifest` 오브젝트에 새 target을 머지한다 (주석·포매팅 보존, diff preview + 사용자 confirm 후 적용).
  4. Recorder가 capture 시점에 sensitive heuristic을 자동 적용해 적절한 target에 `sensitive:true` flag를 부여하고, AI authoring skill(manifest 버전)이 100+ 실제 로그인/결제 폼 corpus에서 precision ≥ 90%, recall ≥ 95% 를 CI 회귀 테스트로 달성한다.
  5. 소스 접근 가능한 React 프로젝트에서 AI authoring skill이 ~80-90% target을 자동 생성하는 것이 demo 페이지 시연으로 검증된다.
**Plans**: TBD
**UI hint**: yes

### Phase 17: REMOVE
**Goal**: 단일 authoring 경로 원칙이 구조적으로 확정된다 — inline `data-agrune-*` 스캐너 bootstrap 경로가 runtime에서 완전히 제거되고, 모든 문서·외부 조직 프로필이 "target mapping" 용어로 재작성된다.
**Depends on**: Phase 16 (recorder + CLI watcher로 authoring 대안이 완성된 뒤에만 legacy 경로 제거가 안전)
**Requirements**: REMOVE-01, REMOVE-02, REMOVE-03
**Success Criteria** (what must be TRUE):
  1. `packages/runtime/src/runtime/dom-scanner.ts` 와 `manifest-builder.ts` 의 bootstrap 경로가 완전히 삭제되고 (테스트 픽스처에서만 참조) 신규 페이지 로드에서 `data-agrune-*` 속성은 runtime이 무시한다.
  2. README·AGENTS·`docs/*` 의 `data-agrune-*` 어노테이션 섹션이 전부 제거되고 manifest + `defineTarget`/`defineMacro` 중심으로 재작성된다. 예제·튜토리얼이 inline 어노테이션을 보여주지 않는다.
  3. 외부 `/Users/chenjing/dev/agrune/.github/profile/README.md` 가 "annotation" → "target mapping" 용어로 sync되고, 제품 표면 설명이 manifest pivot을 반영한다.
  4. `grep -r 'data-agrune-' packages/` 가 테스트 픽스처(`packages/*/test-fixtures/` 등)와 build-linter 레거시 참조 외에는 매치하지 않는다.
**Plans**: TBD
**UI hint**: no

### Phase 18: REGISTRY
**Goal**: `github.com/agrune/maps` 가 공개되어 외부 사이트 자동화가 커뮤니티 기여로 확장되고, 트래픽이 붙기 전 **v0.5 scope 안에서** tier/velocity limit/PR bot/revocation 경로를 포함한 governance가 확정된다.
**Depends on**: Phase 17 (inline 경로 제거 및 manifest schema stable 확인 후에만 공개 — 초기 공개 후 schema 변경은 migration 지옥)
**Requirements**: REGISTRY-01, REGISTRY-02, REGISTRY-03, REGISTRY-04, REGISTRY-05, REGISTRY-06
**Success Criteria** (what must be TRUE):
  1. `github.com/agrune/maps` 저장소가 공개되고 10개 seed manifest(low-risk 유명 사이트 — 예: news 읽기, docs 검색 등 sensitive 필드 적은 사이트 우선)가 `verified` tier로 merge된 상태다.
  2. CLI `agrune maps {add, types, doctor, submit}` 가 동작한다 — `add`는 `~/.agrune/maps/<host>@<ver>.json` 캐시 + `agrune.maps.lock.json` content-hash 잠금 생성, `types`는 `.d.ts` emit, `doctor`는 stale manifest 진단 + auto-disable, `submit`은 `@octokit/rest` 로 PR 생성.
  3. `REGISTRY_GOVERNANCE.md` 가 존재하며 tier 시스템(`verified`/`community`/`unlisted`), 신규 저자 첫 3 PR 30일 holddown(velocity limit), revocation 경로(incident list fetch + CLI auto-disable), maintainer 부재 시 default(disable-all) 가 명시돼 있다.
  4. PR bot(GitHub Actions)이 `sensitive:false` 변경을 자동 하이라이트하고 `requires-human-review:sensitive` 라벨을 강제로 부착한다. Weekly selector health check가 돌아 stale manifest에 `stale` 라벨이 자동 부여된다.
  5. 사용자가 `agrune maps doctor` 를 실행하면 로컬 캐시의 모든 manifest가 registry 최신 버전 대비 staleness(weekly re-fetch 기준)를 진단하고, stale이면 경고와 함께 auto-disable 경로를 제안한다.
**Plans**: TBD
**UI hint**: no

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Channel Inventory and Constraints | v1.0 | 3/3 | Complete | 2026-04-07 |
| 2. Annotation Methods Report | v1.0 | 2/2 | Complete | 2026-04-07 |
| 3. Annotation Alternatives Report | v1.0 | 2/2 | Complete | 2026-04-07 |
| 4. Product Synthesis and Recommendation | v1.0 | 2/2 | Complete | 2026-04-07 |
| 5. Input Reliability | v1.1 | 3/3 | Complete | 2026-04-18 |
| 6. Stability & Recovery | v1.1 | 3/3 | Complete | 2026-04-18 |
| 7. Multi-Tab Session UX | v1.1 | 3/3 | Complete | 2026-04-18 |
| 8. DevTools Webapp | v1.1 | 2/2 | Complete | 2026-04-18 |
| 9. Quality Infrastructure | v1.1 | 3/3 | Complete | 2026-04-18 |
| 10. Docs & Distribution | v1.1 | 5/5 | Complete | 2026-04-18 |
| 11. MANIFEST | v0.5 | 5/5 | Complete | 2026-04-19 |
| 12. INJECT | v0.5 | 3/3 | Complete | 2026-04-19 |
| 13. REACT | v0.5 | 3/3 | Complete | 2026-04-19 |
| 14. MACRO | v0.5 | 0/? | Not started | — |
| 15. REPEAT | v0.5 | 0/? | Not started | — |
| 16. RECORD | v0.5 | 0/? | Not started | — |
| 17. REMOVE | v0.5 | 0/? | Not started | — |
| 18. REGISTRY | v0.5 | 0/? | Not started | — |

---

v0.5 Manifest Pivot 활성. Next: `/gsd-plan-phase 11` to start Phase 11 (MANIFEST).
