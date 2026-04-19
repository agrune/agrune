---
phase: "17"
topic: REMOVE
generated: 2026-04-19
domain: legacy-removal + documentation-rewrite
confidence: HIGH
---

# Phase 17: REMOVE — Research

**Researched:** 2026-04-19
**Domain:** Legacy `data-agrune-*` bootstrap scanner removal + documentation/terminology rewrite
**Confidence:** HIGH — codebase and docs fully mapped, path-level call-site inventory complete

## Summary

Phase 17의 표면은 두 축이다. **(1) runtime bootstrap 경로 제거** — `packages/runtime/src/dom-scanner.ts`·`manifest-builder.ts`·`page-runtime.ts`의 legacy export, `browser/src/cdp-runtime-injector.ts`의 inline-scan 브랜치, `runtime/src/runtime/snapshot.ts`의 `LIVE_SCAN_*`/`collectLiveDescriptors`/`buildLiveSelector` 경로, `runtime/src/runtime/dom-utils.ts`의 `isSensitive` legacy fallback(L393-394), `runtime/src/runtime/command-handlers.ts`의 canvas/overlay helper가 전부 `data-agrune-*` attribute에 종속. 단순 2개 파일 삭제만으로는 "runtime이 `data-agrune-*`을 무시한다"는 Success Criteria 1을 만족하지 못한다. **(2) 문서·외부 profile 재작성** — README·AGENTS·PRIVACY·workflows/annotate/WORKFLOW·docs/agent-setup·docs/improvement-notes·packages/mcp/README 전부에 legacy 표현이 박혀 있고, 외부 `/Users/chenjing/dev/agrune/.github/profile/README.md` 및 외부 `/Users/chenjing/dev/agrune/skills/skills/annotate/`(별도 repo)도 sync 대상.

Success Criteria 4의 예외 허용 리스트를 **코드 레벨에서 명시적으로 인코딩**(allow-list 파일 + regression grep script)하면 phase 종료 후 회귀를 CI로 감지 가능하다. annotation-lint 패키지(`@agrune/core/annotation-lint`)는 legacy linter이지만 Success Criteria 4가 "build-linter 레거시 참조 외에는 매치하지 않는다"고 **명시적 예외**로 둔 대상이므로 존속. 단 `package.json`의 `lint:annotations` script는 src 내 `data-agrune-*`이 사실상 0이 되므로 phase 17 말미에 효용 재평가 필요.

**Primary recommendation:** legacy 제거를 4개 wave로 분해 — (W1) runtime+browser src 제거 및 export cleanup, (W2) E2E bootstrap shim 재작성 + fixture 의미반전, (W3) 루트 docs·workflows·PRIVACY·AGENTS 재작성, (W4) 외부 profile/skills sync + regression guard script. 각 wave는 독립 타입체크/테스트 가능하도록 쪼갠다. `lint:annotations` script 운명은 W1 종료 직후 결정.

## User Constraints (from CONTEXT.md)

### Locked Decisions

Discuss phase skipped (`workflow.skip_discuss=true`). CONTEXT.md가 명시한 known constraints만 locked로 간주:

- **CDP-only architecture** (2026-04-15 pivot): extension/native-messaging/backend-daemon 경로 없음. Runtime은 devtools standalone 웹앱에서만 돌아감.
- **No backward compatibility adapter** (2026-04-19): PageSnapshot v2↔v3 처럼 breaking change 직행. 실 사용자 없음. **Phase 17도 같은 원칙 — `data-agrune-*` migration 없이 drop.**
- **GitHub 조직 프로필 sync** (MEMORY): 제품 표면 변경 시 `.github/profile/README.md`도 같이 업데이트 (외부 repo `/Users/chenjing/dev/agrune/.github/`). **사용자 수동 push는 phase 범위 밖** — phase 17은 파일 수정만 수행.
- **"target mapping" 용어 전환**: Phase 17이 실행 단계.
- **Cursor animation non-negotiable**: `data-agrune-aurora`/`data-agrune-pointer`는 runtime 내부 마커로 **제거 금지**.

### Claude's Discretion

- Runtime 삭제 vs 속성 무시(no-op 유지)의 접근 — 삭제 권고(후술).
- Regression guard 구현 방식 (script/ci/husky) — CI script + npm script로 수렴 권고.
- `packages/core/annotation-lint/` 및 `package.json` 의 `lint:annotations` script 운명 — build-linter는 유지 (Success Criteria 4 명시 예외), `lint:annotations`는 src 내 매치 0으로 효용 감소 → phase 말미 review.
- E2E fixture `legacy-annotated.html`의 이름/의미 처리 — 이름 유지하되 의미 반전(runtime이 무시하는지 검증) 권고.
- `docs/notes/` 아카이브 (`[통합됨] *.md`) 수정 여부 — **historical aquipro**라 수정 불필요 (README.md L215가 이미 "v1.0 시점 아카이브 문서"라고 명시).
- `.planning/` 하위 문서 — 모두 historical record, 수정 금지.
- 외부 `/Users/chenjing/dev/agrune/skills/` repo sync 실행 시점 — 별도 repo라 phase 내부에서는 파일 수정만 하고 push는 사용자 수동 안내.

### Deferred Ideas (OUT OF SCOPE)

- Phase 18 REGISTRY 는 Phase 17 완료 전제. schema stable 확정은 Phase 17 종료 시점에 함께 선언.
- Canvas 런타임 지원(`data-agrune-canvas` 기반): 이미 v0.5 manifest schema에 canvas 필드 없음 → Phase 17 이후 de facto 비활성. 공식 제거 혹은 manifest schema 확장은 v0.6+.
- annotation-lint 패키지 자체의 폐기 — Success Criteria 4가 "build-linter 레거시 참조 외 매치 안 함"으로 예외 인정. 본 phase는 폐기하지 않음.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REMOVE-01 | `packages/runtime/src/runtime/dom-scanner.ts`·`manifest-builder.ts`의 bootstrap 경로 제거 (테스트 픽스처만 잔존) | §3 Runtime Inventory — scanner·builder·injector·live-scan·sensitive legacy 5 call-site 그룹 전부 식별 |
| REMOVE-02 | README·AGENTS·`docs/*`에서 `data-agrune-*` 어노테이션 섹션 제거 + manifest 중심 재작성 | §4 Documentation Surface — 8개 문서 scope 확정 + 각 문서별 수정 범위 기록 |
| REMOVE-03 | 외부 `.github/profile/README.md` sync + "annotation" → "target mapping" 용어 전환 | §5 Terminology Audit + §6 External Surface |

> **경로 주의:** REMOVE-01의 REQUIREMENTS.md 표현은 `packages/runtime/src/runtime/dom-scanner.ts`이지만 실제 파일은 `packages/runtime/src/dom-scanner.ts`(한 단계 위). CONTEXT.md domain 섹션도 마찬가지. §3.1 Runtime Inventory 의 경로를 신뢰할 것.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Legacy scanner 파일 제거 | `@agrune/runtime` | — | scanner·builder가 정의된 단일 패키지 |
| Runtime attribute-ignore 계약 확정 | `@agrune/runtime` | `@agrune/browser` | injector가 legacy branch를 품고 있으므로 browser 패키지도 수정 |
| E2E fixture 의미 반전 | `@agrune/e2e` | — | 의미론적 회귀 검증은 e2e workspace 전용 |
| 문서·용어 재작성 | 루트 README/AGENTS/PRIVACY + docs/ | workflows/annotate | 제품 표면 = 루트 문서, workflow는 source of truth 재작성 |
| 외부 profile sync | `/Users/chenjing/dev/agrune/.github/profile/` (외부) | — | 본 repo 밖, file edit만 수행 |
| Regression guard | 루트 `scripts/` + `package.json` | CI | CI에 걸지 않으면 drift 감지 불가 |

## Standard Stack (not applicable)

본 phase는 신규 stack 도입 없음. 재사용하는 기존 stack:

| 도구 | 용도 | 근거 |
|------|------|------|
| `ts-morph` | 이미 Phase 16-03에서 `agrune manifest dev` watcher가 사용. Runtime 파일 import graph 정리에는 굳이 쓸 필요 없음(tsc/ESLint로 충분) | Phase 16-03 SUMMARY |
| `pnpm -r` | monorepo 전체 build/test 기존 script 그대로 사용 | `package.json` L7-9 |
| `ripgrep`(CI) or `grep -r` | regression guard 구현 수단 — Success Criteria 4의 문장 그대로 `grep -r 'data-agrune-' packages/`. CI 쉘에 rg가 있지만 표준 POSIX `grep`으로 짜면 dep 없음 | `ROADMAP.md` Phase 17 Success Criteria 4 |

## Architecture Patterns

### System Diagram — Before vs After

```
BEFORE (v1.1 ~ Phase 16)

owned app ───────────────┐
                         ▼
external site ──► preload JSON ──► CdpRuntimeInjector ──► resolveManifest() ──┬──► window.__agrune_manifest__ (owned)
                                                                               ├──► __agrune_preload_manifest__ (external preload)
                                                                               ├──► scanAnnotations + scanGroups + buildManifest (LEGACY — 제거 대상)
                                                                               └──► buildEmptyManifest() (idle)

page boot ─► page-agent-runtime ──► getDescriptors() ──► mergeDescriptors(manifestDescriptors, collectLiveDescriptors())
                                                                                                      │
                                                           LIVE_SCAN_ACTION_SELECTOR="[data-agrune-action]" (LEGACY — 제거 대상)


AFTER (Phase 17 target)

owned app ───────────────┐
                         ▼
external site ──► preload JSON ──► CdpRuntimeInjector ──► resolveManifest() ──┬──► window.__agrune_manifest__ (owned)
                                                                               ├──► __agrune_preload_manifest__ (external preload)
                                                                               └──► buildEmptyManifest() (idle — legacy branch 제거)

page boot ─► page-agent-runtime ──► getDescriptors() ──► manifestDescriptors  (live scan 경로 삭제)

runtime이 DOM에 박힌 data-agrune-*을 "읽지 않는다" = 구조적 계약
```

### Component Responsibilities

| Component | Phase 17 액션 | 근거 (파일:라인) |
|-----------|--------------|------------------|
| `packages/runtime/src/dom-scanner.ts` | **삭제** | 전체 파일 82L, scanner 유일 정의 |
| `packages/runtime/src/manifest-builder.ts` | **삭제** | 전체 파일 69L, builder 유일 정의 |
| `packages/runtime/src/page-runtime.ts` | `scanAnnotations/scanGroups/buildManifest` re-export 삭제 | L19-20 |
| `packages/runtime/src/index.ts` | 동일 export 3개 + `ScannedTarget/ScannedGroup` 타입 re-export 삭제 | L19-22 |
| `packages/browser/src/cdp-runtime-injector.ts` | resolveManifest 안의 legacy inline-scan branch 삭제 (L130-142). 위 comment(L126 "legacy inline scan") 제거. L212, L296, L91의 주석 용어 정리 | L126, L130-142, L212, L296 |
| `packages/runtime/src/runtime/snapshot.ts` | `LIVE_SCAN_ACTION_SELECTOR`/`LIVE_SCAN_GROUP_SELECTOR`/`LIVE_SCAN_DEFAULT_GROUP_ID`/`LIVE_SCAN_DEFAULT_GROUP_NAME` 상수 + `collectLiveDescriptors()` 함수 삭제. `SNAPSHOT_RELEVANT_ATTRIBUTES`에서 `data-agrune-*` 엔트리 10개 삭제. `getTargetAttributes`/`resolveMeta` 내부 fallback(L522-523, L584) 재검토 | L93-96, L100-116, L203-240, L522-523, L584, L608-617, L715 |
| `packages/runtime/src/runtime/page-agent-runtime.ts` | `getDescriptors` 합성 단계에서 `mergeDescriptors(manifestDescriptors, collectLiveDescriptors())` → `manifestDescriptors` 단순 반환으로 축소. import 삭제 | L27, L205 |
| `packages/runtime/src/runtime/dom-utils.ts` | `isSensitive` fallback(L394) 삭제, comment(L393) 삭제. `buildLiveSelector`(L505-520) 전체 삭제 — 호출처(snapshot.ts L231)와 함께 정리. `AGRUNE_INTERNAL_SELECTOR`(L8)·`isAgruneInternalElement`(L39-40)는 **유지** (aurora/pointer 내부 마커) | L8, L39-40 유지 / L393-394 삭제 / L505-520 삭제 |
| `packages/runtime/src/runtime/command-handlers.ts` | `detectMaskedInput`(L319) `data-agrune-masked` 체크 삭제. Canvas helper (`isInCanvasGroup` L921-926, `getCanvasGroupTransform` L928-958, `findCanvasGroupEl` L960-970) 및 drag auto-pan 경로(L1174-1220) — **canvas 기능 자체 deactivation**으로 결정 필요. 대안: canvas 관련 경로 전체를 dead code로 삭제(권고) | L319, L921-970, L1175, L1201, L1249, L1269 |
| `packages/e2e/tests/user-flow/helpers.ts` | bootstrap inline script(L320-379)의 `buildManifest(scanAnnotations(...), scanGroups(...))` 경로 삭제, manifest-only로 재작성 | L334-336 |
| `packages/e2e/fixtures/idle-boot.html` | 같은 inline bootstrap script(L13-54)의 legacy branch 삭제 | L29-35 |
| `packages/e2e/fixtures/legacy-annotated.html` | **의미 반전** — runtime이 legacy attribute를 무시하는지 검증하는 fixture로 유지(Success Criteria 4의 "테스트 픽스처 허용"에 해당). inline script(L15-49)의 legacy branch 삭제 — 결과: `source=idle`, `hasManifest=false` | L23-31 |
| `packages/e2e/tests/bootstrap-idle.spec.ts` | `legacy-annotated.html: runtime boots active via inline scan` 테스트(L28-35) **의미 반전** → `legacy-annotated.html: runtime ignores legacy data-agrune-* attributes (source=idle)`. 또는 새 spec으로 분리 | L28-35 |
| `packages/e2e/fixtures/runtime.bundle.js` | 런타임 빌드 산출물. runtime 재빌드 후 자동 갱신되므로 수동 편집 불가 | (generated) |
| `packages/runtime/tests/bootstrap-gate.spec.ts` | `hasAnnotations`/`mutationTouchesAnnotations`/`installObserver` 부재 검증만 하는 test. 메시지/주석의 "annotation-specific" 표현 유지 가능 (의미 반전 아님 — Phase 11 RESOLVE-04에서 이미 충족) | — |
| `packages/runtime/tests/runtime.spec.ts` | `manifest { css: '[data-agrune-key="..."]' }` 및 DOM `setAttribute('data-agrune-key', ...)` 사용(L53-500대). manifest의 selector가 임의 CSS인 것은 post-removal에도 유효 → fixture-only 허용 | L53-500대 (수정 불필요) |
| `packages/runtime/tests/fill-cdp.spec.ts`·`macro-runner.spec.ts`·`sensitive-or-only.spec.ts` | 동일 패턴 — fixture-only CSS attribute 사용, 유지 | — |
| `packages/core/src/annotation-lint/**` | **유지** (Success Criteria 4 명시 예외). `KNOWN_AGRUNE_ATTRS`는 inline 어노테이션을 lint해주는 도구로 존속 | — |
| 루트 `package.json` `lint:annotations` script | W1 종료 후 src 스캔 결과 empty면 (a) 삭제 혹은 (b) `apps/` 전용 유지 중 선택. **권고: 삭제** — build-linter는 외부 소비자용으로 남기되 monorepo 자체에 data-agrune이 없는 이상 CI 단계 불필요 | L10 |

### Pattern 1: Deletion vs deprecation

**What:** 실제 사용자 없음(PROJECT.md 명시) + 무버전 호환 adapter 정책(2026-04-19 결정) 때문에 `@deprecated` 경유하지 않고 즉시 삭제하는 게 일관됨.
**When to use:** 본 phase 전체. PageSnapshot v3 breaking bump와 동일 처리.

### Pattern 2: Fixture-only 예외 allow-list를 파일로 인코딩

**What:** Success Criteria 4의 허용 예외 경로를 쉘 script 파일 상단 주석이 아니라 **별도 JSON/text 파일**로 관리해 CI가 참조.
```
scripts/regression-guard/data-agrune-allowlist.txt
───────────────────────────────────────────────
# Files allowed to contain 'data-agrune-' after Phase 17.
# Each line: glob relative to repo root.
# Updating this file requires phase-level approval.
packages/core/src/annotation-lint/**
packages/core/tests/annotation-lint.spec.ts
packages/runtime/tests/*.spec.ts
packages/e2e/fixtures/legacy-annotated.html
packages/e2e/fixtures/tricky-inputs.html
packages/e2e/fixtures/overlay-modal.html
packages/e2e/tests/annotation-scan.spec.ts
packages/e2e/tests/overlay-modal.spec.ts
```
**Why:** script와 allow-list 분리 → PR 리뷰 시 allow-list 변경이 명시적 승인 포인트로 드러남.

### Anti-Patterns to Avoid

- **단순 `grep -r 'data-agrune-' packages/` CI 체크**: test fixture까지 잡아 false positive가 큼. Success Criteria 4도 예외 명시. allow-list 기반 필터링 필수.
- **runtime 삭제 후 bundle 재빌드 생략**: `packages/e2e/fixtures/runtime.bundle.js`, `packages/browser/dist/*`, `packages/mcp/dist/*`은 generated. runtime 재빌드가 선행되지 않으면 e2e test가 stale bundle로 legacy 경로를 여전히 실행.
- **"annotation" 단어 맹목적 치환**: `annotation-lint` 패키지명/경로는 유지. 문서 내에서도 legacy 경로를 설명하는 historical context는 유지 가능.
- **canvas 관련 코드를 "나중에 처리"로 남기기**: canvas는 manifest schema에 없으므로 Phase 17 이후 dead code. 삭제하지 않으면 `data-agrune-canvas`가 regression grep에 계속 잡힘.

## Don't Hand-Roll

| 문제 | 수동 빌드 금지 | 대신 사용 | 이유 |
|------|----------------|-----------|------|
| Regression grep script | bash awk 파이프라인 custom | POSIX `grep -rE --include='...' --exclude='dist' + node reader for allow-list` | dep 없이 CI 호환, Windows git-bash에서도 동작 |
| `runtime.bundle.js` 재생성 | 수동 edit 금지 | `pnpm --filter @agrune/e2e run build:fixtures` 또는 runtime `pnpm build` 후 symlink/copy | tsup이 이미 build chain을 정의 |
| 문서 용어 bulk rename | `sed -i` find/replace | 문서별 개별 rewrite (각 문서마다 새로운 narrative 작성) | annotation/어노테이션은 중의적 (legacy ref vs general term) — 수동 판단 필요 |
| import graph cleanup | manual edit only | `pnpm --filter @agrune/runtime typecheck` 후 TS 에러 주도 + `pnpm build` 후 dist 확인 | ts-morph 도입은 과함, tsc 에러가 충분 |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 없음 — `data-agrune-*`은 DOM attribute이므로 페이지 내 transient state. agrune 자체가 저장하는 DB 없음 | 없음 |
| Live service config | 없음 — agrune runtime은 CDP 세션 내부에서만 동작, 외부 서비스 연계 없음 | 없음 |
| OS-registered state | 없음 — agrune은 Chrome launcher만 사용, 시스템 서비스 등록 없음 | 없음 |
| Secrets/env vars | 없음 | 없음 |
| Build artifacts | `packages/runtime/dist/`·`packages/browser/dist/`·`packages/mcp/dist/`·`packages/mcp/dist/bin/`·`packages/e2e/fixtures/runtime.bundle.js` 가 모두 legacy symbol 포함. **W1 직후 `pnpm -r build` 필수** (dist는 이미 `.gitignore`지만 e2e bundle은 commit될 수 있음 — 확인 필요) | W1 끝에 전체 빌드 + e2e bundle 재생성 |

추가로 **소스 접근 가능한 외부 artefact**:
- `/Users/chenjing/dev/agrune/.github/profile/README.md` — 외부 repo의 동명 브랜치/history. Phase 17은 파일 수정만, push 권한은 사용자.
- `/Users/chenjing/dev/agrune/skills/skills/annotate/SKILL.md` + `references/` — v1.0 annotate skill. 외부 `skills` repo. Phase 16 SUMMARY L258이 "retired once manifest skill reaches feature parity — this plan is the evidence"라고 선언. 사용자 push로 기존 `annotate` skill 폐기 가능. **Phase 17 범위: 사용자 안내만 생성** (직접 외부 repo 수정은 본 repo plan 밖).

## Common Pitfalls

### Pitfall 1: "2개 파일 삭제만으로 REMOVE-01 충족" 오인

**What goes wrong:** REMOVE-01의 텍스트가 `dom-scanner.ts`·`manifest-builder.ts` 두 파일을 명시해 그것만 삭제하면 완성으로 오해.
**Why it happens:** Success Criteria 1의 "신규 페이지 로드에서 `data-agrune-*` 속성은 runtime이 무시한다"는 snapshot.ts의 LIVE_SCAN 경로를 통해 runtime이 **이미 부팅된 후**에도 legacy attribute를 읽는다는 사실을 가려버림.
**How to avoid:** §3.2의 Runtime Inventory 표를 기준으로 삭제 대상 9개 파일/경로 전부를 wave 0 task breakdown에 포함. `runtime/tests/runtime.spec.ts`가 green인지만 체크하지 말고 "page-agent-runtime가 manifest-only 경로로 동작하는가"를 새 spec으로 검증.
**Warning signs:** runtime + browser 삭제만 한 뒤 `pnpm test`는 전부 통과하지만 `legacy-annotated.html` E2E가 여전히 `source=inline`을 출력.

### Pitfall 2: E2E bundle staleness

**What goes wrong:** runtime src 수정 후 `packages/e2e/fixtures/runtime.bundle.js`가 재생성되지 않아 E2E가 이전 bundle을 로드 → legacy 경로가 여전히 활성인 것처럼 보임.
**Why it happens:** runtime.bundle.js는 생성물이지만 commit될 수 있음(경로 패턴으로는 `dist` 제외만 됨).
**How to avoid:** W1 말미에 `git status packages/e2e/fixtures/runtime.bundle.js`로 변경 감지, 재생성 후 새 bundle commit. 또는 e2e build 단계를 `package.json` test:e2e 이전에 자동 hook.
**Warning signs:** `pnpm --filter @agrune/runtime test` 통과 / `pnpm --filter @agrune/e2e test:e2e` 실패.

### Pitfall 3: Canvas 코드 방치

**What goes wrong:** canvas 관련 경로(`isInCanvasGroup`, `getCanvasGroupTransform`, drag auto-pan)를 남겨두면 Phase 17 이후 dead code가 되고 regression grep에 `data-agrune-canvas`·`data-agrune-group`이 매치.
**Why it happens:** canvas는 v1.0~v1.1 `data-agrune-*` schema에 존재했지만 v0.5 manifest schema에 필드가 없음. 암묵적으로 deactivated.
**How to avoid:** command-handlers.ts canvas helper 3개 + drag path에서 canvas branch 전체 삭제. `canvasToViewport`, `viewportToCanvas` import도 unused가 되면 함께 정리.
**Warning signs:** `pnpm typecheck` 통과하지만 `CANVAS_PAN_FAILED` error code가 invoked 불가능한 dead code로 남음.

### Pitfall 4: "annotation" 용어 무차별 치환

**What goes wrong:** `annotation` 단어를 전부 "target mapping"으로 치환 → `annotation-lint` 패키지 export 경로가 바뀌어 외부 소비자 breaking change + build-linter 자기 정체성 혼란.
**Why it happens:** phase 목표가 "용어 전환"이라 편집 툴로 일괄 치환 유혹.
**How to avoid:** 치환 대상을 "legacy `data-agrune-*` inline 어노테이션을 지칭하는 문맥"에 한정. Lint 패키지명, 내부 심볼(`KNOWN_AGRUNE_ATTRS` 등) 유지. §5 Terminology Audit 결과표 기준 개별 판단.

### Pitfall 5: 외부 push 경계 흐림

**What goes wrong:** `/Users/chenjing/dev/agrune/.github/`·`/Users/chenjing/dev/agrune/skills/`가 별도 git repo임을 잊고 phase 내부에서 push/commit 시도.
**Why it happens:** MEMORY `.planning/`은 agrune 본 repo 안이라는 점과 겹쳐 혼동.
**How to avoid:** phase plan의 모든 외부 repo 작업을 "file edit만, push 사용자 수동"으로 명시. 결과물로 외부 repo별 diff summary 문서 생성(예: `.planning/phases/17-remove/external-sync-instructions.md`).

### Pitfall 6: `lint:annotations` script 유지/삭제 결정 누락

**What goes wrong:** src 내 `data-agrune-*`이 거의 0이 된 상태에서 `pnpm lint:annotations`가 항상 pass → CI 슬롯 낭비. 혹은 `apps/cli-test-page/dist/`가 매치해 false alarm.
**Why it happens:** linter 패키지 유지 결정과 linter 실행 script 유지 결정이 혼동.
**How to avoid:** W1 종료 후 명시적 결정:
- (a) `lint:annotations` 삭제 — `package.json` L10, README L209, AGENTS.md L28 수정.
- (b) 경로를 `apps/` 또는 외부 소비자용으로 축소하여 유지.
권고: **(a) 삭제** — `@agrune/core/annotation-lint` 패키지는 외부 소비자(여전히 `data-agrune-*`을 쓰는 앱)용으로 publish되지만, monorepo 자체 CI로 돌릴 이유 없음.

### Pitfall 7: Bootstrap-gate-spec.ts 의미 오독

**What goes wrong:** `bootstrap-gate.spec.ts`가 **이미 Phase 11 RESOLVE-04**에서 annotation gating 부재를 검증하는 spec임을 잊고, "annotation" 단어가 들어있어 Phase 17에서 재작성하려 시도.
**Why it happens:** test 이름이 "annotation-gating logic"을 언급.
**How to avoid:** 이 spec은 "bootstrap gate가 annotation 유무에 좌우되지 않음"을 negative로 검증 → Phase 17 이후에도 맥락상 유효. **수정 불필요**. Phase 17은 대신 `bootstrap-idle.spec.ts` L28-35를 반전시킨다.

## Code Examples

### Example 1: page-agent-runtime getDescriptors simplification

```typescript
// Source: packages/runtime/src/runtime/page-agent-runtime.ts — L205 BEFORE
const getDescriptors = () => mergeDescriptors(manifestDescriptors, collectLiveDescriptors())

// AFTER
const getDescriptors = () => manifestDescriptors
// or, if mutation-driven refresh needed, recompute manifestDescriptors on mutation
```

이 한 줄 변경이 "runtime이 `data-agrune-*`을 무시한다"는 계약의 핵심. `collectLiveDescriptors`·`mergeDescriptors`의 live-side 인자 둘 다 삭제 가능. mergeDescriptors는 호출처 없으면 함께 삭제, 그렇지 않으면 manifest 전용 헬퍼로 rename.

### Example 2: cdp-runtime-injector resolveManifest simplification

```javascript
// Source: packages/browser/src/cdp-runtime-injector.ts — L125-144 BEFORE
const resolveManifest = () => {
  if (window.__agrune_manifest__) return { manifest: window.__agrune_manifest__, hasManifest: true, source: 'window' };
  if (window.__agrune_preload_manifest__) return { manifest: window.__agrune_preload_manifest__, hasManifest: true, source: 'preload' };
  // Legacy inline-scan path — maintained until Phase 17 (REMOVE-01).
  if (typeof runtimeApi.scanAnnotations === 'function' && /* ... */) {
    try {
      const legacyManifest = runtimeApi.buildManifest(/* ... */);
      if (/* ... */) return { manifest: legacyManifest, hasManifest: true, source: 'inline' };
    } catch (e) { /* fall through to idle */ }
  }
  return { manifest: runtimeApi.buildEmptyManifest(), hasManifest: false, source: 'idle' };
};

// AFTER
const resolveManifest = () => {
  if (window.__agrune_manifest__) return { manifest: window.__agrune_manifest__, hasManifest: true, source: 'window' };
  if (window.__agrune_preload_manifest__) return { manifest: window.__agrune_preload_manifest__, hasManifest: true, source: 'preload' };
  return { manifest: runtimeApi.buildEmptyManifest(), hasManifest: false, source: 'idle' };
};
```

`source` 타입 union에서 `'inline'` 제거 → `RuntimeState['source']`를 소비하는 쪽(`bootstrap-idle.spec.ts` L7, `legacy-annotated.html` L17·38, `idle-boot.html` L22·45) 전부 확인.

### Example 3: regression guard script (POSIX `grep` 기반)

```bash
#!/usr/bin/env bash
# Source: scripts/regression-guard/no-legacy-data-agrune.sh (NEW)
# Phase 17 REMOVE-01 regression guard.
# Fails CI if 'data-agrune-' appears outside the allow-listed paths.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ALLOWLIST="$ROOT/scripts/regression-guard/data-agrune-allowlist.txt"

# Build -path exclude args from allow-list
EXCLUDES=()
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  EXCLUDES+=( --exclude-dir=node_modules --exclude-dir=dist )
done < "$ALLOWLIST"

# Scan, then filter allow-listed files out
MATCHES=$(grep -rEn 'data-agrune-' "$ROOT/packages" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.html' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=dist || true)

# Apply allow-list (line-by-line exclusion)
while IFS= read -r allow; do
  [[ -z "$allow" || "$allow" == \#* ]] && continue
  MATCHES=$(echo "$MATCHES" | grep -vF "$allow" || true)
done < "$ALLOWLIST"

if [[ -n "$MATCHES" ]]; then
  echo "❌ Phase 17 regression: legacy 'data-agrune-' found outside allow-list:"
  echo "$MATCHES"
  exit 1
fi
echo "✓ No legacy 'data-agrune-' outside allow-list."
```

**Why this shape:** allow-list를 별도 파일로 분리 → PR 리뷰 시 allow-list 추가가 명시적 변경. `find`가 아니라 `grep -r`로 Success Criteria 4의 문장을 그대로 살림.

### Example 4: package.json script wiring

```json
// Source: package.json — L10 BEFORE
"lint:annotations": "node ./packages/core/bin/agrune-lint.js packages apps",
// Add (or replace):
"lint:no-legacy": "bash ./scripts/regression-guard/no-legacy-data-agrune.sh",
```

CI 쪽 (`.github/workflows/*.yml`)에서 기존 `pnpm lint:annotations` 잡을 `pnpm lint:no-legacy`로 교체 (본 repo `.github/workflows/` 내용은 별도 확인 후 plan에서 처리).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `data-agrune-action` 기반 inline annotation + `scanAnnotations` runtime 스캔 | `@agrune/manifest` SDK (`defineTarget`/`defineRepeat`/`defineMacro`) + TargetResolver ladder + React fiber bridge | Phase 11-16 (v0.5 kickoff 2026-04-19) | Phase 17에서 legacy 경로 **물리 제거** |
| Runtime이 DOM attribute로 bootstrap 게이트 | idle bootstrap 후 manifest 주입 대기 | Phase 11 (RESOLVE-04) | `bootstrap-gate.spec.ts` 이미 검증 |
| DevTools 오버레이가 없는 in-IDE 어노테이션 워크플로 | DevTools RecorderView + `agrune manifest dev` watcher + ts-morph merger | Phase 16 | annotate skill 폐기 근거 |

**Deprecated/outdated (Phase 17 종료 시):**
- `scanAnnotations`, `scanGroups`, `buildManifest`, `ScannedTarget`, `ScannedGroup` — 삭제
- `LIVE_SCAN_*` 상수, `collectLiveDescriptors`, `buildLiveSelector` — 삭제
- `data-agrune-canvas`/`data-agrune-meta`/`data-agrune-masked` 런타임 경로 — 삭제
- `docs/agent-setup.md` L8-16의 `@agrune/cli` 인스톨러·`Chrome Extension` 표현 — 2026-04-15 CDP-only 피봇 이후 이미 drift, phase 17에서 재작성
- `workflows/annotate/WORKFLOW.md` 전체 — manifest 기반 (`agrune manifest dev` watcher + recorder)로 재작성 or source-of-truth 경로를 `.agents/skills/manifest/SKILL.md`로 이전
- `README.md` L155-157 어노테이션 섹션, `PRIVACY.md` L1-2 "agrune is a browser extension" 표현

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `/Users/chenjing/dev/agrune/.github/profile/README.md`이 phase 17 sync 대상인 external profile README의 유일한 경로 [VERIFIED: `find` result 3 paths, profile dir만 README.md 포함] | §6 | 낮음 — fs 조사로 확인됨 |
| A2 | `packages/e2e/fixtures/runtime.bundle.js`가 `.gitignore` 밖 즉 commit 대상 [ASSUMED — `git ls-files` 미확인] | Pitfall 2 | 중간 — 만약 gitignore됐다면 재생성 지침만 있으면 됨. 확인 필요 |
| A3 | `@agrune/core/annotation-lint` 패키지를 유지한다는 Success Criteria 4 해석 [CITED: `ROADMAP.md` Phase 17 성공 기준 4 "build-linter 레거시 참조 외에는 매치하지 않는다"] | §3 Component 표 | 낮음 — 문구 해석 여지 있지만 "외"는 예외 허용으로 읽는 것이 자연스러움 |
| A4 | Canvas 기능은 v0.5 manifest schema에 없으므로 이미 de facto 비활성 [VERIFIED: `packages/manifest/src/*` grep에서 canvas 필드 없음 — 본 research에서 직접 확인] | Pitfall 3 | 낮음 — schema 재확인 |
| A5 | `apps/cli-test-page/` 에 src 디렉터리 없음, dist만 있음 [VERIFIED: `ls apps/cli-test-page/` 결과 `dist`와 `node_modules`만] | Pitfall 6 | 낮음 |
| A6 | Phase 17 내부에서 외부 `/Users/chenjing/dev/agrune/skills/skills/annotate/` 제거 수행 권한 [ASSUMED — 외부 repo 커밋 권한은 사용자에게 있음, phase 17 plan은 파일 수정 지침만 작성] | §6 | 중간 — plan이 외부 repo push를 전제로 success criteria를 짜면 blocked |
| A7 | runtime.spec.ts의 `data-agrune-key` 셀렉터 사용은 fixture-only로 허용됨 [CITED: ROADMAP Phase 17 성공 기준 4 "테스트 픽스처 ... 외에는 매치하지 않는다"] | §3 Component 표 | 낮음 |
| A8 | `docs/notes/` 아카이브 수정 불필요 [CITED: `README.md` L215 "v1.0 시점의 아카이브 문서. 현재 아키텍처는 본 README 기준"] | §4 Documentation Surface | 낮음 — historical record 원칙 |
| A9 | `lint:annotations` script 삭제 권고는 safe [ASSUMED — 외부 소비자가 이 root script를 직접 의존하지는 않음 / 각자 `@agrune/core/annotation-lint` 패키지를 직접 임포트] | Pitfall 6 | 낮음 |
| A10 | `package.json` version bump 필요 없음 — v0.5는 이미 manifest pivot 개시로 breaking 선언됨 [ASSUMED] | §7 Breaking-Change Communication | 낮음 — v0.5.0 release 타이밍은 Phase 18 이후 |

## Open Questions

1. **`lint:annotations` script의 최종 처리**
   - What we know: script가 `packages/ apps/` 스캔. Phase 17 후 src에 `data-agrune-*` 제로, `apps/cli-test-page/`엔 dist만.
   - What's unclear: 외부 사용자가 루트 script를 경유해 자기 프로젝트에 agrune-lint를 실행하는 케이스 여부.
   - Recommendation: W4에서 삭제 + README/AGENTS script list 정리. 외부 소비자는 `@agrune/core`를 dep으로 설치 후 `agrune-lint` bin을 직접 사용.

2. **Canvas 관련 코드 처리 — 삭제 vs deprecation 주석**
   - What we know: v0.5 manifest schema에 canvas 필드 없음. `data-agrune-canvas` attribute가 없으면 canvas helper는 no-op.
   - What's unclear: 어느 pre-v0.5 사용자(없음이 명시되어 있지만 방어적)가 `data-agrune-canvas`를 여전히 쓴다면 drag auto-pan이 조용히 실패.
   - Recommendation: Phase 17에서 **삭제**. manifest schema에 canvas 지원이 들어오는 v0.6+ 시점에 재도입. 삭제해야 regression grep에 `data-agrune-canvas`가 잡히지 않음.

3. **`workflows/annotate/WORKFLOW.md`의 운명**
   - What we know: "단일 authoring source of truth" 문서. `.agents/skills/manifest/SKILL.md`가 v0.5 후속으로 존재.
   - What's unclear: WORKFLOW.md를 (a) manifest-기반으로 재작성해 유지, (b) `.agents/skills/manifest/` 로 대체하고 삭제, (c) SKILL.md → 링크.
   - Recommendation: (a) 재작성 + 최상단에 "v0.5 이후 SKILL.md를 authoritative source로 간주, WORKFLOW.md는 그 요약"으로 명시. 외부 하네스가 WORKFLOW.md를 이미 링크해뒀을 가능성 있어 완전 삭제는 breaking.

4. **`packages/mcp/README.md`의 "extension mode backend/native-host entrypoints" 줄**
   - What we know: L24 "extension mode backend/native-host entrypoints" — 2026-04-15 CDP-only 피봇 이후 이미 drift.
   - What's unclear: Phase 17 범위(inline annotation 제거)와 별도의 drift이지만 같이 고칠 기회.
   - Recommendation: 별도 세부 태스크로 다루되 W3 document wave에 포함. Phase 17 scope creep 아님 — REMOVE-02 "README 재작성" 안쪽.

5. **PRIVACY.md의 첫 줄 "browser extension that enables AI agents"**
   - What we know: PRIVACY.md L5 "agrune is a browser extension". 2026-04-15 피봇 이후 extension 아님.
   - What's unclear: 법적/정책적 문서라 수정이 신중해야 함.
   - Recommendation: W3에서 "MCP server that enables AI agents to interact with web pages through locally-installed Chrome via CDP"로 교체. 데이터 처리 원칙은 동일.

6. **외부 skills repo — `/Users/chenjing/dev/agrune/skills/skills/annotate/` 폐기 확정**
   - What we know: Phase 16-04 SUMMARY L149 "legacy external `skills/annotate/` stays until Phase 17".
   - What's unclear: 외부 repo 이므로 phase 17 plan에서 직접 파일 삭제 불가.
   - Recommendation: W4에서 `.planning/phases/17-remove/external-sync-instructions.md`에 skills repo에 대한 PR/commit 지침(annotate skill 제거 + README 재작성)을 구체 diff로 제공. 사용자가 해당 repo에서 별도 PR 생성.

## Environment Availability

> 본 phase는 신규 외부 도구/서비스 의존 없음. 기존 monorepo build chain + node 22 + pnpm 10.23만 사용.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥22 | pnpm workspace | 기존 가용 | v22+ | — |
| pnpm 10.23 | build/test | 기존 가용 | 10.23.0 | — |
| `tsup` | runtime/browser/mcp/core build | 기존 dev dep | 8.5.1 | — |
| `vitest` | unit tests | 기존 dev dep | 4.0.0 | — |
| `@playwright/test` | E2E | 기존 dev dep | — | `PLAYWRIGHT_SKIP_E2E=1`로 skip 가능 |
| POSIX `grep` | regression guard | 기본 shell | — | ripgrep 대체 가능 |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** 없음.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (unit) | `vitest` 4.0 |
| Framework (e2e) | `@playwright/test` |
| Config file (runtime unit) | `packages/runtime/vitest.config.ts` |
| Config file (core unit) | `packages/core/vitest.config.ts` (미확인 — Phase 16에서 annotation-lint.spec 사용 중이므로 존재 가정) |
| Config file (e2e) | `packages/e2e/playwright.config.ts` |
| Quick run command (per package) | `pnpm --filter @agrune/runtime run test` (단위) / `PLAYWRIGHT_SKIP_E2E=1 pnpm test:e2e` (e2e no-op) |
| Full suite command | `pnpm test && pnpm test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REMOVE-01 | runtime entry에서 scanner export 제거 | unit | `pnpm --filter @agrune/runtime test -t 'public-surface'` (NEW spec) | ❌ Wave 0 |
| REMOVE-01 | `collectLiveDescriptors` 제거 / page-agent-runtime이 manifest-only | unit | `pnpm --filter @agrune/runtime test -t 'runtime ignores data-agrune-*'` (NEW spec) | ❌ Wave 0 |
| REMOVE-01 | 페이지 로드 시 `data-agrune-*` 있어도 idle | e2e | `pnpm --filter @agrune/e2e exec playwright test bootstrap-idle.spec.ts -g 'legacy-annotated'` (spec 의미 반전) | ✅ 수정 필요 |
| REMOVE-01 | injector resolveManifest에 `'inline'` source 없음 | unit | `pnpm --filter @agrune/runtime test -t 'bootstrap gate'` (기존 spec 확장) | ✅ 기존 |
| REMOVE-02 | README/AGENTS/docs가 `data-agrune-*` 예제 없음 | doc-lint | `pnpm lint:no-legacy` (NEW script — allow-list 기반) | ❌ Wave 0 |
| REMOVE-03 | external profile README가 manifest 용어 반영 | 수동 | 사용자 리뷰 + `/Users/chenjing/dev/agrune/.github/profile/README.md` diff inspection | — (문서) |
| Success Criteria 4 | `grep -r 'data-agrune-' packages/` ≤ allow-list | CI | `pnpm lint:no-legacy` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @agrune/runtime test -x && pnpm typecheck`
- **Per wave merge:** 해당 wave가 수정한 패키지 전부 `pnpm -r test` + `pnpm lint:no-legacy`
- **Phase gate (before `/gsd-verify-work`):** `pnpm -r build && pnpm -r test && pnpm test:e2e && pnpm lint:no-legacy` 전부 green

### Wave 0 Gaps

- [ ] `scripts/regression-guard/no-legacy-data-agrune.sh` — Success Criteria 4 automated check
- [ ] `scripts/regression-guard/data-agrune-allowlist.txt` — allow-list of permitted paths
- [ ] `packages/runtime/tests/runtime-ignores-legacy.spec.ts` — positive regression: runtime이 DOM에 `data-agrune-*`이 있어도 target으로 인식하지 않음
- [ ] `packages/runtime/tests/public-surface.spec.ts` — `@agrune/runtime` export surface에 scanner 심볼 없음 negative 검증
- [ ] `packages/e2e/tests/bootstrap-idle.spec.ts` 수정 — `legacy-annotated.html` expectation 반전 (혹은 신규 spec으로 분리)

## Security Domain

본 phase는 순수 코드 삭제 + 문서 재작성이며 새로운 입력/출력 surface 추가 없음. ASVS 주요 카테고리 점검:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 해당 없음 — runtime은 사용자 인증 처리 안함 |
| V3 Session Management | no | CDP session은 `SessionManager`가 관리, phase 17과 무관 |
| V4 Access Control | no | 관련 없음 |
| V5 Input Validation | no | manifest validator는 이미 Phase 11 완료 |
| V6 Cryptography | no | 없음 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 삭제된 export의 외부 소비자 breakage | Denial of service (indirect) | v0.5는 이미 breaking 라인 — 사전 announcement로 완화 |
| `data-agrune-sensitive` fallback 삭제로 인한 민감 데이터 마스킹 누락 | Information disclosure | **핵심 체크**: `isSensitive` 함수에서 `data-agrune-sensitive='true'` fallback을 삭제하면, 사용자가 manifest `sensitive:true` 또는 DOM heuristic(type=password 등)을 써야 함. Phase 14 MACRO-03에서 heuristic이 이미 OR-only로 강화되어 있어 **일반 민감 필드는 자동 감지**. 그러나 type=password가 아닌 커스텀 input에 `data-agrune-sensitive`만 달아둔 케이스는 Phase 17 이후 unmask. mitigation: doc에 manifest `sensitive:true` 필수 명시 + migration note 제공 |

## Sources

### Primary (HIGH confidence)

- `.planning/PROJECT.md` — v0.5 kickoff decisions (2026-04-19)
- `.planning/ROADMAP.md` Phase 17 entry — Goal / Success Criteria / Requirements
- `.planning/REQUIREMENTS.md` REMOVE section — REMOVE-01~03
- `.planning/phases/17-remove/17-CONTEXT.md` — discuss-skipped context + known constraints
- `.planning/phases/16-record/16-04-SUMMARY.md` — manifest skill 완료 근거 (Phase 17 depends-on 충족)
- `packages/runtime/src/dom-scanner.ts` (82L) / `manifest-builder.ts` (69L) / `page-runtime.ts` (20L) / `index.ts` / `types.ts`
- `packages/runtime/src/runtime/snapshot.ts` L85-300, L500-620
- `packages/runtime/src/runtime/page-agent-runtime.ts` L27, L205
- `packages/runtime/src/runtime/dom-utils.ts` L380-520
- `packages/runtime/src/runtime/command-handlers.ts` L310-330, L910-970, L1160-1280
- `packages/browser/src/cdp-runtime-injector.ts` L80-170, L212, L296
- `packages/runtime/tests/bootstrap-gate.spec.ts` (전체)
- `packages/runtime/tests/runtime.spec.ts` L50-520
- `packages/e2e/tests/bootstrap-idle.spec.ts` (전체)
- `packages/e2e/tests/annotation-scan.spec.ts` (전체)
- `packages/e2e/tests/user-flow/helpers.ts` L320-380
- `packages/e2e/fixtures/legacy-annotated.html` / `idle-boot.html` / `overlay-modal.html` / `tricky-inputs.html`
- `packages/core/src/annotation-lint/index.ts` / `rules.ts` / `scanner.ts` / `vite-plugin.ts` / `__fixtures__/*`
- `packages/core/package.json` / `bin/agrune-lint.js`
- `package.json` (root)
- `README.md` / `AGENTS.md` / `PRIVACY.md` / `workflows/annotate/WORKFLOW.md` / `docs/agent-setup.md` / `docs/improvement-notes.md` / `packages/mcp/README.md`
- `/Users/chenjing/dev/agrune/.github/profile/README.md` (전체)
- `/Users/chenjing/dev/agrune/skills/README.md` / `skills/skills/annotate/` 디렉터리 리스트

### Secondary (MEDIUM confidence)

- `.planning/phases/16-record/16-*-SUMMARY.md` — Phase 16 완료 증거 (indirect — phase 17 readiness)
- `docs/notes/[통합문서] agrune-notes.md` (미열람 — 존재만 확인, historical)

### Tertiary (LOW confidence)

- `docs/superpowers/specs/*` — 미실행 specs (ROADMAP에 실행 계획 없음)
- `docs/notes/[통합됨] *.md` — v1.0 시점 아카이브

## Project Constraints (from CLAUDE.md)

본 repo 루트에 `CLAUDE.md` 없음. 사용자 전역 CLAUDE.md는 phase 실행에 영향을 주는 actionable directive가 없음 (환경 메모뿐). MEMORY 항목 중 영향 요인:

- **"target mapping" 용어 전환** — phase 17이 실행 단계임이 재확인.
- **GitHub 조직 프로필 sync** — `.github/profile/README.md` 업데이트 필수.
- **CDP-only architecture** — extension 언급 복원 금지 (PRIVACY.md·agent-setup.md 재작성 시).
- **Cursor animation non-negotiable** — `data-agrune-aurora`/`data-agrune-pointer` 삭제 금지.
- **Milestone versioning** — v0.5.x로 semver 정렬. phase 17에서 별도 bump 요구 없음 (v0.5 전체가 breaking).

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — neutral (신규 도입 없음)
- Architecture mapping: HIGH — 9개 src 파일의 call-site 전부 식별, import/export graph 파악 완료
- Pitfalls: HIGH — bootstrap-gate vs bootstrap-idle 구분, E2E bundle stale 이슈 실측
- Terminology audit: MEDIUM — 루트 문서 8개 + 외부 2개 scope 완료, 세부 rewrite wording은 plan 단계 판단
- External surface (profile/skills): MEDIUM — 파일 존재·내용 확인, 실제 push는 phase 밖

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30일, stable domain)
