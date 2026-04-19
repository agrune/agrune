# Requirements: agrune v0.5 Manifest Pivot

**Defined:** 2026-04-19
**Core Value:** AI 에이전트가 의미를 이해할 수 있는 제어 표면(manifest 기반 target mapping + root-import component identity)을 통해 웹 앱을 로컬·결정적·검증 가능하게 자동화한다.

## v0.5 Requirements

Inline `data-agrune-*` 어노테이션을 완전 폐기하고 외부 manifest + React root-import로 아키텍처 피봇. 37개 requirements, 9 categories.

### MANIFEST — Schema + SDK

- [x] **MANIFEST-01**: `@agrune/manifest` 패키지가 `defineManifest`/`defineTarget`을 제공해 타입 안전 target 선언(`targetId` union + `actionKinds` + selector ladder) 가능
- [x] **MANIFEST-02**: `defineRepeat` 스키마가 template/keyFrom/nameFrom/strategy(dom|virtualized) 필드 지원
- [x] **MANIFEST-03**: `defineMacro` 스키마가 id/params/steps/precondition/postcondition/circuit breaker 지원
- [x] **MANIFEST-04**: `sensitive:true` flag + 런타임 DOM heuristic이 flag를 OR-only로 결합(override 불가) 설계 락
- [x] **MANIFEST-05**: `agrune manifest validate <file> --url` CLI가 live DOM에서 selector 1:1 매칭 검증

### RESOLVE — Runtime Target Resolution

- [x] **RESOLVE-01**: `ManifestLoader`가 `window.__agrune_manifest__` 또는 CDP preload JSON에서 manifest를 로드
- [x] **RESOLVE-02**: `TargetResolver`가 CSS fallback selector(priority: role > text > testId > stable attr > CSS, 해시 class / `:nth-child` 금지) 해석
- [x] **RESOLVE-03**: `PageSnapshot`을 v3로 breaking 교체 (MCP 도구 출력 shape 변경, backward-compat adapter 없음)
- [x] **RESOLVE-04**: Runtime bootstrap 게이트 제거 — `dom-scanner` 없이 항상 부팅

### INJECT — CDP + MCP 확장

- [x] **INJECT-01**: `CdpRuntimeInjector.prepareSession({ preloadManifest })`이 외부 사이트용 `__agrune_preload_manifest__` JSON을 source에 embed
- [x] **INJECT-02**: MCP tool `agrune_manifest_load`가 CLI에서 로드한 manifest를 활성 세션에 주입

### REACT — `@agrune/react` Root-Import

- [x] **REACT-01**: `bippy` 통합 — DOM ↔ Fiber, `FiberIdentityIndex` (path descriptor 기반, 참조 아님) 빌드
- [x] **REACT-02**: `window.__agrune_identity__` bridge가 `Object.defineProperty` lock으로 runtime에 publish
- [x] **REACT-03**: SSR hydration barrier — `readyState` + root fiber 존재 확인 후 bridge activate
- [x] **REACT-04**: 2단계 prod guard — `AGRUNE_PROD_ENABLED` 빌드 env + `localStorage['agrune.prod.consent']` 런타임 token 동시 통과해야 활성화
- [x] **REACT-05**: React 17/18/19 matrix CI fixture + memo/forwardRef/portal/Suspense 엣지케이스 전부 pass

### MACRO — Composed Flows + Sensitive

- [x] **MACRO-01**: `MacroRunner`가 페이지 런타임 내부에서 실행 + 기존 `CommandBroker`/`HitlController`/`action-queue` 재사용
- [x] **MACRO-02**: MCP tool `agrune_macro_run(macroId, params)` 노출
- [x] **MACRO-03**: `SensitiveMask` DOM heuristic(type=password, autocomplete whitelist, 단어 경계 regex, 다국어 ARIA label)이 snapshot/log/valuePreview에서 자동 마스킹
- [x] **MACRO-04**: Macro precondition/postcondition 실패 시 circuit breaker 발동 — partial-execution account-lockout 방지

### REPEAT — Dynamic Lists

- [x] **REPEAT-01**: `defineRepeat` runtime expander — DOM enumerate + textContent anchor로 N 인스턴스 snapshot
- [x] **REPEAT-02**: `strategy: 'dom'|'virtualized'` — virtualized는 viewport 내 row + `aria-rowcount`/`aria-setsize` logical-size hint (fiber data-state 접근은 v0.6+)
- [x] **REPEAT-03**: Snapshot group의 `repeatInstance` 필드로 인스턴스 식별

### RECORD — Authoring UX

- [ ] **RECORD-01**: DevTools 패널에 `RecorderView` 추가 — mode 모델(idle/picking/recording-action) + keyboard shortcut
- [ ] **RECORD-02**: MCP `recorder_toggle`/`recorder_captured`/`recorder_commit` WS 프로토콜
- [x] **RECORD-03**: CLI `agrune manifest dev` watcher가 `~/.agrune/authoring/pending/`에서 ts-morph로 소스 manifest.ts 머지 (MCP는 pending에만 쓰고 CLI가 유일한 파일 수정 주체)
- [x] **RECORD-04**: Sensitive auto-detect at authoring time — recorder가 캡처 시점에 flag 자동 부여 + AI authoring skill이 정확도 precision≥90%/recall≥95% 달성
- [x] **RECORD-05**: AI authoring skill(manifest 버전)이 소스 접근 프로젝트에서 ~80-90% target 자동 생성 (demo page로 체감 검증)

### REMOVE — Inline 제거 + 문서

- [x] **REMOVE-01**: `packages/runtime/src/runtime/dom-scanner.ts`·`manifest-builder.ts`의 bootstrap 경로 제거 (테스트 픽스처만 잔존)
- [x] **REMOVE-02**: README·AGENTS·`docs/*`에서 `data-agrune-*` 어노테이션 섹션 제거 + manifest 중심 재작성
- [x] **REMOVE-03**: 외부 `.github/profile/README.md` sync + "annotation" → "target mapping" 용어 전환

### REGISTRY — 공개 + Governance

- [ ] **REGISTRY-01**: `github.com/agrune/maps` 저장소 구조 초기화 + 10개 seed manifest (유명 사이트 중 low-risk 선정)
- [ ] **REGISTRY-02**: CLI `agrune maps {add, types, doctor, submit}` 구현
- [x] **REGISTRY-03**: `~/.agrune/maps/<host>@<ver>.json` 디스크 캐시 + `agrune.maps.lock.json` content-hash 잠금
- [ ] **REGISTRY-04**: `REGISTRY_GOVERNANCE.md` — tier 시스템(verified/community/unlisted), velocity limit(신규 저자 첫 3 PR 30일 holddown), revocation 경로 명시
- [ ] **REGISTRY-05**: PR bot — `sensitive:false` 변경 자동 하이라이트 + weekly selector health check
- [ ] **REGISTRY-06**: `agrune maps doctor` — 캐시된 manifest staleness 진단 + 자동 disable 경로

## v0.6+ Requirements

Deferred to future release. 연구에서 식별된 항목만 기록 (상세는 `.planning/research/SUMMARY.md` 참조).

### Framework Expansion

- **VUE-01**: `@agrune/vue` component-identity selector
- **SVELTE-01**: `@agrune/svelte` component-identity selector
- **SOLID-01**: `@agrune/solid` component-identity selector

### Advanced Virtualization

- **VIRT-01**: Virtualized list fiber data-state 접근 (react-window/tanstack-virtual 내부 상태)
- **VIRT-02**: 논리적 전체 집합 AI-queryable API (렌더된 viewport 밖 데이터)

### Macro / Registry 확장

- **MACRO-05**: Multi-session macro (cross-tab flows)
- **REGISTRY-07**: Distributed ownership model (사이트 소유자 직접 maintainer 권한)
- **REGISTRY-08**: YAML export (display-only, 편집 불가)

### Unified Desktop

- **OS-01**: macOS AX-first hybrid 데스크톱 확장 프로토타입 (v1.0 GO 권고, v0.5에서 연기)

## Out of Scope

명시적 제외. 연구에서 NO-GO 판정되었거나 2026-04-15 CDP-only 피봇과 충돌.

| Feature | Reason |
|---------|--------|
| Natural-language runtime agent (Stagehand 스타일) | deterministic 원칙 파괴 — v1.0 NO-GO 재확인 |
| Vision fallback selector | 로컬 성능·confidence UX 비용 — v1.0 NO-GO 재확인 |
| Runtime self-healing selector (Katalon 스타일) | 비결정적 동작, 디버깅 불가능 |
| Runtime LLM call from agrune 자체 | 제품 약속(deterministic, local-first) 파괴 |
| YAML-only manifest | 타입 안전성·IDE 지원 약화, TS 우선 원칙 |
| 브라우저 확장 / sidepanel UI | 2026-04-15 CDP-only 피봇과 충돌 |
| Cloud registry backend | 로컬 우선 원칙 + 공격 표면 확대 |
| Extension-based recorder | 브라우저 확장 채택 금지 |
| Visual regression 내장 | 제품 범위 밖 (Playwright/Percy가 담당) |
| Stagehand 스타일 비결정적 agent tool | "deterministic + LLM-callable" 포지션과 충돌 |
| Inline `data-agrune-*` 어노테이션 유지·병행 | 단일 authoring 경로 원칙 (2026-04-19 결정) |
| 버전 이관 adapter (PageSnapshot v2↔v3 포함) | 2026-04-19 결정 — 실 사용자 없음, breaking change 그대로 |

## Traceability

Roadmap 생성 완료 (2026-04-19) — 37개 requirements 전부 Phases 11-18에 매핑됨.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MANIFEST-01 | Phase 11 | Complete |
| MANIFEST-02 | Phase 11 | Complete |
| MANIFEST-03 | Phase 11 | Complete |
| MANIFEST-04 | Phase 11 | Complete |
| MANIFEST-05 | Phase 11 | Complete |
| RESOLVE-01 | Phase 12 | Complete |
| RESOLVE-02 | Phase 11 | Complete |
| RESOLVE-03 | Phase 12 | Complete |
| RESOLVE-04 | Phase 11 | Complete |
| INJECT-01 | Phase 12 | Complete |
| INJECT-02 | Phase 12 | Complete |
| REACT-01 | Phase 13 | Complete |
| REACT-02 | Phase 13 | Complete |
| REACT-03 | Phase 13 | Complete |
| REACT-04 | Phase 13 | Complete |
| REACT-05 | Phase 13 | Complete |
| MACRO-01 | Phase 14 | Complete |
| MACRO-02 | Phase 14 | Complete |
| MACRO-03 | Phase 14 | Complete |
| MACRO-04 | Phase 14 | Complete |
| REPEAT-01 | Phase 15 | Complete |
| REPEAT-02 | Phase 15 | Complete |
| REPEAT-03 | Phase 15 | Complete |
| RECORD-01 | Phase 16 | Pending |
| RECORD-02 | Phase 16 | Pending |
| RECORD-03 | Phase 16 | Complete |
| RECORD-04 | Phase 16 | Complete |
| RECORD-05 | Phase 16 | Complete |
| REMOVE-01 | Phase 17 | Complete |
| REMOVE-02 | Phase 17 | Complete |
| REMOVE-03 | Phase 17 | Complete |
| REGISTRY-01 | Phase 18 | Pending |
| REGISTRY-02 | Phase 18 | Pending |
| REGISTRY-03 | Phase 18 | Complete |
| REGISTRY-04 | Phase 18 | Pending |
| REGISTRY-05 | Phase 18 | Pending |
| REGISTRY-06 | Phase 18 | Pending |

**Coverage:**
- v0.5 requirements: 37 total
- Mapped to phases: 37 ✓
- Unmapped: 0 ✓

**Per-phase counts:**
- Phase 11 (MANIFEST): 7 requirements
- Phase 12 (INJECT): 4 requirements
- Phase 13 (REACT): 5 requirements
- Phase 14 (MACRO): 4 requirements
- Phase 15 (REPEAT): 3 requirements
- Phase 16 (RECORD): 5 requirements
- Phase 17 (REMOVE): 3 requirements
- Phase 18 (REGISTRY): 6 requirements
- **Total: 37 ✓**

---
*Requirements defined: 2026-04-19*
*Last updated: 2026-04-19 after roadmap creation — traceability table populated, 100% coverage*
