---
phase: 11-manifest
verified: 2026-04-19T08:30:00Z
status: passed
score: 5/5
overrides_applied: 0
---

# Phase 11: manifest Verification Report

**Phase Goal:** manifest가 모든 것의 뿌리가 된다 — 타입 안전 authoring SDK (`@agrune/manifest`) + v3 스키마 + CSS-only runtime resolver까지 닫아 수동 manifest 전달만으로 외부 사이트 자동화가 엔드투엔드 가능.
**Verified:** 2026-04-19T08:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Author가 `defineManifest({ targets, repeats, macros })` 로 TS가 targetId union·actionKinds·selector ladder를 컴파일 타임에 검증 | VERIFIED | `packages/manifest/src/builders.ts`: `defineTarget<TId>` — `sensitive?: true` (false 불가), `actionKinds: ActionKind[]`, `selector: SelectorLadder` (AtLeastOne 타입). `builders.spec.ts`에 4개 `@ts-expect-error` 음성 테스트 확인. |
| 2 | `agrune manifest validate <manifest.ts> --url https://site` 가 live DOM 매칭 확인 + 실패 target 보고 | VERIFIED | `packages/mcp/src/manifest-validate-cli.ts`: `runValidateCli` → `validateManifest` (schema) → `runLiveCheck` (Playwright, role>text>testId>attr>css). `--url` 없으면 schema-only. 실패 시 `targetId: not found (tried: role -> text -> testId -> attr -> css)` stderr. E2E fixture 6개 테스트 pass (11-05-SUMMARY.md). |
| 3 | Runtime이 수동 주입한 manifest로 CSS fallback selector(role > text > testId > stable attr > CSS; 해시 class/`:nth-child` 금지)로 resolve | VERIFIED | `packages/runtime/src/runtime/target-resolver.ts` 221줄 — `resolveByLadder`가 role>text>testId>attr>css 순서로 DOM 쿼리. `resolveByAttr`/`resolveByCss`에서 `assertNoHashClass`·`assertNoNthChild` 호출, 위반 시 `SelectorForbiddenError` throw. Tailwind utility(.flex.items-center.bg-blue-500) 통과 (lookahead 패턴). target-resolver.spec.ts 28개 테스트 pass. |
| 4 | Runtime은 `data-agrune-*` 부트스트랩 게이트 없이 항상 부팅 — manifest 없으면 idle | VERIFIED | `packages/browser/src/cdp-runtime-injector.ts`: `buildBootstrapSource()`에서 `hasAnnotations()`, `mutationTouchesAnnotations()`, `installObserver` grep 0건. `resolveManifest()` → manifest 없으면 `buildEmptyManifest()`, `hasManifest:false, source:'idle'`. `Object.defineProperty(window,'__agrune_runtime_state__',{writable:false})`. Playwright E2E (bootstrap-idle.spec.ts) idle·active·tamper-proof 3개 테스트 pass. |
| 5 | `sensitive:true` flag만 허용, `sensitive:false`로 runtime heuristic override 불가 — 스키마·타입·validate CLI 세 층에서 확정 | VERIFIED | (a) 스키마: `TargetSchema.sensitive = z.literal(true).optional()` (schema.ts:104) — zod가 false 거부. (b) TS 빌더: `sensitive?: true` (builders.ts:18) — 컴파일 타임 차단, `@ts-expect-error` 테스트 확인. (c) Runtime: `isSensitive(element, manifestFlag?: true \| undefined)` (dom-utils.ts:333) — `false` 타입 불가, `sensitive-or-only.spec.ts` 13개 테스트 pass. validate CLI는 `validateManifest` 먼저 호출하므로 세 번째 레이어 커버. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/manifest/package.json` | @agrune/manifest 패키지 메타데이터 | VERIFIED | name: "@agrune/manifest", zod ^4.3.6, workspace 등록 (packages/* glob) |
| `packages/manifest/src/schema.ts` | v3 manifest 타입 + zod 스키마 | VERIFIED | AgruneManifest/ManifestGroup/ManifestTarget/ManifestRepeat/ManifestMacro/MacroStep/SelectorLadder/ActionKind + ManifestSchema/SelectorLadderSchema/TargetSchema 등 |
| `packages/manifest/src/builders.ts` | 타입 안전 빌더 함수 | VERIFIED | defineManifest/defineGroup/defineTarget/defineRepeat/defineMacro 전부 export |
| `packages/manifest/src/validator.ts` | 런타임 manifest 검증 + 금지 selector 에러 | VERIFIED | validateManifest, SelectorForbiddenError, HASH_CLASS_PATTERN, NTH_CHILD_PATTERN, assertNoHashClass, assertNoNthChild |
| `packages/manifest/src/index.ts` | public API barrel | VERIFIED | 빌더+validator+schema+타입 전부 re-export |
| `packages/manifest/tests/builders.spec.ts` | @ts-expect-error 음성 테스트 포함 단위 테스트 | VERIFIED | 202줄, @ts-expect-error 4건 (sensitive:false, invalid actionKind, 빈 selector, invalid strategy) |
| `packages/manifest/tests/validator.spec.ts` | zod 거부 테스트 | VERIFIED | 305줄, sensitive:false OR-only 에러메시지, hash class, nth-child, Tailwind 오탐 방지 |
| `packages/runtime/src/runtime/target-resolver.ts` | CSS ladder resolver + 금지 selector 가드 | VERIFIED | 221줄, resolveByLadder/assertNoHashClass/assertNoNthChild/SelectorForbiddenError/computeAccessibleName export |
| `packages/runtime/src/runtime/dom-utils.ts` | isSensitive OR-only 업데이트 | VERIFIED | `manifestFlag?: true \| undefined`, AUTOCOMPLETE_SENSITIVE set, type=password, legacy data-agrune-sensitive |
| `packages/runtime/tests/target-resolver.spec.ts` | ladder 우선순위 + forbidden 테스트 | VERIFIED | 175줄, 28개 테스트 |
| `packages/runtime/tests/sensitive-or-only.spec.ts` | isSensitive OR-only 테스트 | VERIFIED | 90줄, 13개 테스트, @ts-expect-error 1건 |
| `packages/browser/src/cdp-runtime-injector.ts` | bootstrap 게이트 제거 + idle boot | VERIFIED | hasAnnotations/mutationTouchesAnnotations/installObserver grep 0건, resolveManifest/buildEmptyManifest/\_\_agrune\_runtime\_state\_\_ 세팅 |
| `packages/runtime/src/page-runtime.ts` | buildEmptyManifest 노출 | VERIFIED | `buildEmptyManifest(): AgruneManifest { return { version: 3, groups: [] } }` |
| `packages/mcp/src/manifest-validate-cli.ts` | manifest validate CLI | VERIFIED | 194줄, validateManifest+runLiveCheck, role>text>testId>attr>css in-page evaluate |
| `packages/e2e/tests/bootstrap-idle.spec.ts` | idle boot E2E | VERIFIED | 3개 테스트 — idle boot, inline source, tamper-proof |
| `packages/e2e/tests/manifest-validate-cli.spec.ts` | validate CLI E2E | VERIFIED | 79줄, 6개 시나리오 pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `packages/manifest/src/builders.ts` | `packages/manifest/src/schema.ts` | `from './schema.js'` type import | WIRED | ManifestTarget/ManifestGroup/SelectorLadder/ActionKind import 확인 |
| `packages/manifest/src/validator.ts` | `packages/manifest/src/schema.ts` | `ManifestSchema.safeParse` | WIRED | `import { ManifestSchema } from './schema.js'` + `ManifestSchema.safeParse(input)` 확인 |
| `packages/manifest/src/index.ts` | `packages/manifest/src/builders.ts` | re-export builders | WIRED | `export { defineManifest, defineGroup, ... } from './builders.js'` |
| `packages/runtime/src/runtime/target-resolver.ts` | DOM API | `querySelectorAll` | WIRED | `doc.querySelectorAll<HTMLElement>(...)` 다수 호출 확인 |
| `packages/runtime/src/runtime/dom-utils.ts` | sensitive OR-only | `manifestFlag === true` | WIRED | line 336: `if (manifestFlag === true) return true` |
| `packages/browser/src/cdp-runtime-injector.ts` | `window.__agrune_manifest__` / `buildEmptyManifest` | `resolveManifest()` | WIRED | window.__agrune_manifest__ → preload → inline → idle 우선순위 분기 |
| `packages/mcp/bin/agrune-mcp.ts` | `manifest-validate-cli.ts` | `args[0]==='manifest'` 분기 | WIRED | `const { runValidateCli } = await import('../src/manifest-validate-cli.js')` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MANIFEST-01 | 11-01, 11-03 | `@agrune/manifest` 타입 안전 target 선언 | SATISFIED | defineTarget/defineManifest TS 컴파일 타임 검증 구현. @ts-expect-error 테스트. REQUIREMENTS.md가 [x] Complete 표시. |
| MANIFEST-02 | 11-01 | defineRepeat template/keyFrom/nameFrom/strategy 지원 | SATISFIED | `packages/manifest/src/builders.ts:38-47`에 defineRepeat 구현. strategy: 'dom'\|'virtualized'. REQUIREMENTS.md는 Pending이나 코드에 완전 구현됨 — REQUIREMENTS.md 업데이트 누락. |
| MANIFEST-03 | 11-01 | defineMacro params/steps/precondition/postcondition/circuitBreaker 지원 | SATISFIED | `packages/manifest/src/schema.ts`의 MacroSchema + `builders.ts`의 defineMacro. REQUIREMENTS.md는 Pending이나 코드에 완전 구현됨. |
| MANIFEST-04 | 11-01, 11-02 | sensitive OR-only — 스키마+타입+런타임 3층 | SATISFIED | (a) z.literal(true).optional() zod, (b) sensitive?: true TS signature, (c) isSensitive manifestFlag?: true\|undefined. REQUIREMENTS.md는 Pending이나 코드에 완전 구현됨. |
| MANIFEST-05 | 11-05 | agrune manifest validate CLI live DOM selector 검증 | SATISFIED | manifest-validate-cli.ts + agrune-mcp.ts 분기. E2E 6개 pass. REQUIREMENTS.md는 Pending이나 코드에 완전 구현됨. |
| RESOLVE-02 | 11-02 | TargetResolver CSS fallback selector ladder | SATISFIED | target-resolver.ts resolveByLadder — role>text>testId>attr>css, hash class/nth-child 금지. 28개 테스트 pass. REQUIREMENTS.md는 Pending이나 코드에 완전 구현됨. |
| RESOLVE-04 | 11-04 | Runtime bootstrap 게이트 제거 — 항상 부팅 | SATISFIED | cdp-runtime-injector.ts에서 hasAnnotations 게이트 완전 제거. idle boot E2E 3개 pass. REQUIREMENTS.md는 Pending이나 코드에 완전 구현됨. |

**참고:** REQUIREMENTS.md에서 MANIFEST-02~05, RESOLVE-02, RESOLVE-04 항목이 `[ ] Pending`으로 표시됨. 이는 Phase 11 구현 완료 후 REQUIREMENTS.md 체크박스가 업데이트되지 않아 발생한 문서 불일치. 코드 상으로는 모든 요건이 완전 구현되어 있음.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/runtime/src/runtime/dom-utils.ts` | 317 | `placeholder` 단어 (주석 내, "placeholder/aria-label" 속성명 언급) | Info | 코드가 아닌 JSDoc 주석 내 HTML 속성명 — 구현 stub 아님 |
| `packages/runtime/src/runtime/target-resolver.ts` | 220 | `return []` | Info | ladder 매칭 실패 시 정상 반환값 — 에러 없음이 계약. stub 아님. |

**Blocker 안티패턴 없음** — 스텁, 하드코딩 빈 데이터, 미구현 핸들러 없음.

### Human Verification Required

이 섹션은 비어있음. 모든 핵심 동작이 코드 수준에서 검증 가능했으며, E2E 테스트(Playwright)가 런타임 동작을 커버함.

### Gaps Summary

갭 없음. Phase 11의 모든 Success Criteria가 코드로 구현되어 있고, 테스트로 검증되었으며, 핵심 커밋(10개)이 존재함.

**REQUIREMENTS.md 상태 불일치** (실행 가능 갭 아님): MANIFEST-02~05, RESOLVE-02, RESOLVE-04가 코드에는 구현되었으나 REQUIREMENTS.md에서 `[ ] Pending`으로 남아있음. 이는 위험이 아니며, 다음 단계에서 REQUIREMENTS.md 체크박스를 업데이트하면 된다.

---

_Verified: 2026-04-19T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
