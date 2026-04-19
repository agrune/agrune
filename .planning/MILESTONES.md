# Milestones

## v0.5 Manifest Pivot (Shipped: 2026-04-20)

**Phases completed:** 8 phases (11-18), 29 plans
**Branch:** `feat/v0.5-manifest`
**Audit verdict:** `pass_with_tech_debt` (no blockers) — see `milestones/v0.5-MILESTONE-AUDIT.md`
**Git range:** `95cd3f0` (docs: start milestone v0.5) → `8b0f585` (fix(18): WR-06 disable persist-credentials) — 174 commits over ~38h
**LOC:** ~33,731 lines TS/TSX/MJS across `packages/` (manifest + react + runtime + browser + mcp + devtools + registry + e2e)

**Key accomplishments:**

- `@agrune/manifest` SDK + v3 schema — 타입 안전 `defineManifest/defineTarget/defineRepeat/defineMacro` + zod validator + `sensitive:false` OR-only 차단 + hash class / `:nth-child` 금지. `@agrune/core` v2 manifest 제거 후 v3 re-export로 통일 (Phase 11)
- CDP manifest 주입 경로 완성 — `PageSnapshot` v2→v3 breaking bump (`SelectorLadder` 객체, `schemaVersion: 3`), `CdpRuntimeInjector.prepareSession({ preloadManifest })` zero-RTT embed + `safeJsonEmbed` U+2028/U+2029 방어, `agrune_manifest_load` MCP 도구 3파일 동기화 (Phase 12)
- `@agrune/react 0.4.1` root-import — `bippy` 기반 `FiberIdentityIndex` path descriptor + `Object.defineProperty(configurable:false)` tamper-proof `window.__agrune_identity__` + 2단계 prod guard + SSR hydration barrier + React 17/18/19 matrix CI (memo/forwardRef/portal/Suspense/compound 엣지케이스) (Phase 13)
- `MacroRunner` + `agrune_macro_run` — 페이지 런타임 내부 실행으로 step-level CDP round-trip 제거 + 4개 에러 코드 (`MACRO_NOT_FOUND`/`CIRCUIT_OPEN`/`PRECONDITION_FAILED`/`POSTCONDITION_FAILED`) + word-boundary regex + 한/일/중/프/독/스 ARIA Set으로 `sensitive:false` manifest 우회 차단 (Phase 14)
- `defineRepeat` runtime expander — `RepeatExpander` (DOM + virtualized strategy, `REPEAT_MAX_INSTANCES=1000` DoS cap) + dot-bracket `targetId` 파서 (AI usability, regex-free linear scan, ReDoS 방어) + validate CLI keyFrom 강화 (Phase 15)
- authoring UX 완결 — DevTools `RecorderView` + `recorder_*` WS 프로토콜 (pending-only write) + `agrune manifest dev` ts-morph watcher (diff preview + exact `y` 확인) + AI authoring skill + 116 form fixture sensitive corpus (KO/EN/JA, 실측 precision 1.000 / recall 1.000 vs 임계 0.90/0.95) (Phase 16)
- 단일 authoring 경로 구조 확정 — `dom-scanner.ts` / `manifest-builder.ts` 물리 삭제 + 9 call-site group 제거 + 7 product-surface 문서 manifest 용어 재작성 + regression guard CI 배선 (`lint:no-legacy`) + 외부 `.github/profile/README.md` 로컬 커밋 (Phase 17)
- `@agrune/registry` + `agrune maps` CLI + `github.com/agrune/maps` foundation — sha256 content-hash / 0o700·0o600 / atomic lockfile / 4-state staleness + 4 CLI subcommand (`add/types/doctor/submit` with device flow) + 10 verified seed manifest + 113줄 `REGISTRY_GOVERNANCE.md` + GitHub Actions 3 workflow (sensitive-diff / tier-escalation / schema-fail / velocity / weekly drift) + CODEOWNERS + PR template + 338줄 external-sync-instructions (Phase 18)

**Known deferred items at close (all by-design, no blockers):**

- Phase 12 SC5: `manifest_inject.spec.ts` 실 Chrome + fixture server 실행 (2 skipped, `PLAYWRIGHT_SKIP_E2E` 필요)
- Phase 16 SC1/SC3/SC5: RecorderView e2e picking flow, `agrune manifest dev` tty loop, AI skill TodoMVC acceptance (AI 비결정성)
- 외부 `.github` profile repo push (v1.1 DOCS-02 + Phase 17-04, 2 commits ahead) — `17-remove/external-sync-instructions.md`
- 외부 `skills/annotate/` 디렉터리 폐기 — 같은 문서
- `github.com/agrune/maps` public repo 생성 + 초기 push + branch protection + CODEOWNERS handle 교체 — `18-registry/external-sync-instructions.md §1-2`
- OAuth App(`agrune-maps-submit`) 등록 + `AGRUNE_OAUTH_CLIENT_ID` 주입 — §3
- Post-push smoke 6A-F (add / types / doctor / doctor --refresh / submit --dry-run / 첫 PR workflow) — §6

**Tech debt carried forward:**

- `RUNTIME-FLAKY-1`: `packages/runtime/tests/runtime.spec.ts` overlay target 테스트 module-level mock order-dependent flake (격리 시 262/262 PASS)
- `E2E-USER-FLOW-5`: Pre-existing E2E 5건 (fill-real ×3, act-overlay ×1, manifest-inject ×1) — fixture-level inline manifest injection 필요
- `CORPUS-KNOWN-GAPS`: sensitive-corpus 의도된 gap 2건 (`パスワードの確認`, `name=cvc`)
- `REGISTRY-SCHEMA-DRIFT`: `registry-seed/.github/scripts/_schema.mjs`가 `ManifestSchema`/`RegistryEntrySchema` byte-for-byte 복제 — v0.6 블로커 (`@agrune/registry` npm publish 후 export re-import 한 줄로 축소)

---

## v1.1 Browser Completion (Shipped: 2026-04-18)

**Phases completed:** 6 phases, 19 plans

**Key accomplishments:**

- `agrune_fill`이 CDP `Input.insertText` / `dispatchKeyEvent` 경로로 통일되어 React/Vue/Angular controlled input·contenteditable·masked input을 결정적으로 처리 (INPUT-01..04)
- CDP 연결 손실·Chrome crash에 대한 `RecoverySupervisor` 자동 복구 루프 + `reprepareAllTargets` resync + `CONNECTION_LOST`/`CHROME_CRASHED`/`RECOVERY_FAILED` 에러 코드 추가 (HEAL-01..04)
- `SessionManager` active session 추적·`agrune_focus` MCP 도구·모든 도구 응답의 `session.{wasActive,becameActive}` 메타로 다중 탭 의도 명확화 (SESS-01..03)
- DevTools 웹앱 완성: 500-event FIFO 명령 로그 + tool/session/status 필터, `HitlController` pause/resume/step/skip, 실패 진단 카드, 세션 선택·Focus UI (SESS-04, DEVT-01..04)
- Playwright 기반 `packages/e2e/` (8 specs, overlay/modal + HITL) + annotation build-linter (`packages/core/src/annotation-lint/`)를 CI `build-test` + `e2e` 잡으로 블록 조건 배선 (QUAL-01..03)
- README·AGENTS·improvement-notes에서 extension mode 잔재 제거, CLI `--help` 플래그 문서화, automation profile import/clone/attach UX 추가, `.github/profile/README.md` CDP-only 재작성 (DOCS-01..04)
- 외부 `/Users/chenjing/dev/agrune/.github` repo 커밋 `7cea367` 생성 (push는 사용자 수동 후속 조치)

**Known deferred items at close:**
- 마스크 입력 heuristic 커버리지가 좁음 (library-custom masks는 `strategy='keystroke'` override 필요)
- Live-browser relaunch-and-reconnect E2E 시나리오 (Phase 9 E2E 프레임에 구조만 배선됨)
- GitHub branch-protection required-check 토글 (레포 외부 설정)
- 외부 `.github` repo push (사용자 수동)

---

## v1.0 Research (Shipped: 2026-04-18)

**Phases completed:** 4 phases, 9 plans, 9 tasks

**Key accomplishments:**

- Current agrune의 브라우저 gold path 를 기준점으로 고정해 desktop research 가 regression 을 일으키지 않도록 정리했다.
- DOM/CDP, AX, Apple events, ScreenCapture, Vision, manual profiles를 하나의 capability matrix 로 정리했다.
- 이후 연구 phase 전체에 공통 적용할 perception/action 정책과 product truths 를 고정했다.
- “앱에 직접 annotation”을 세 가지 다른 integration model 로 분해해 direct methods taxonomy 를 만들었다.
- 직접 어노테이션 전략만으로는 universal desktop coverage 가 안 되며, 현실적 조합은 accessibility-carrier + embedded web bridge 라고 결론냈다.
- 직접 어노테이션이 없을 때의 대체 전략을 AX harvesting, manual profiles, vision fallback 으로 분리했다.
- 대체 전략의 핵심은 후보 생성보다 verification loop 라는 점을 정리하고, AX default / manual profile rescue / vision last resort 구도를 제안했다.
- 여섯 케이스를 한 비교판에 올리고, 제품이 안전하게 약속할 수 있는 범위를 분리했다.
- 최종 결론은 ‘browser precision 유지 + AX-first hybrid expansion 은 GO, universal direct annotation 과 vision-first positioning 은 NO-GO’다.

---
