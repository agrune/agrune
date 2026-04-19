---
phase: 16-record
fixed_at: 2026-04-19T13:14:00Z
review_path: .planning/phases/16-record/16-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-04-19
**Source review:** `.planning/phases/16-record/16-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 7
- Fixed: 7
- Skipped: 0

전체 scope 가 모두 Fix 됨. 다만 CR-01 은 fix 가 **partial** 하다 — MCP
쪽 wiring 은 완료·검증되었지만 runtime 쪽 `handleRecorderEnable` →
CDP 캡처 콜백 → `RecorderController.handleCaptured` bridge 는 의도적으로
scope 밖. 상세는 CR-01 섹션 참조. 해당 항목은 human verification 필요.

Info finding 6 개 (IN-01 ~ IN-06) 는 `fix_scope: critical_warning` 에 따라
건너뜀.

---

## Fixed Issues

### CR-01: RecorderController / recorder_enable wiring이 production 엔트리에 연결되어 있지 않음

**Status:** fixed: requires human verification
**Files modified:** `packages/mcp/bin/agrune-mcp.ts`, `packages/mcp/src/devtools-server.ts`, `packages/mcp/tests/recorder-integration.spec.ts`
**Commit:** e50005a
**Applied fix:**
- `agrune-mcp.ts` 에서 `PendingStore` + `RecorderController` 를 생성하고
  `startDevtoolsServer({ recorder, onRecorderBroadcastReady })` 에 주입.
  Deferred broadcast 패턴으로 초기화 순서 문제(controller 가 server 보다
  먼저 존재) 해결.
- `devtools-server.ts` `DevtoolsServerOptions` 에 `onRecorderBroadcastReady`
  hook 을 추가. WS client 목록 fan-out 준비가 끝난 시점에 caller 에게
  실제 `RecorderBroadcast` 함수를 넘겨 `recorder_state`/`recorder_captured`/
  `recorder_error` 를 모든 연결된 DevTools 클라이언트로 브로드캐스트.
- 통합 스모크 테스트 `recorder-integration.spec.ts` 에 4 케이스 추가:
  WIRE-1 (toggle → mode flip + broadcast), WIRE-2 (commit → PendingStore write
  + idle broadcast), WIRE-3 (last-client-disconnect → reset), WIRE-4 (malformed
  payload rejection before controller). 전부 pass.

**Partial scope — human verification needed:**
리뷰 원문은 세 가지를 요구한다:
1. `agrune-mcp.ts` wiring ✅
2. `runtime/command-handlers.ts` `handleRecorderEnable/Disable` 를 command dispatch kind 에 등록 ❌
3. Integration smoke test ✅ (단, MCP half 만)

2번은 리뷰가 "switch/case 에 case 'recorder_enable' 추가" 로 표현했지만
실제 `createPageAgentRuntime` 에는 switch/case dispatch 가 없다. CDP 경로는
`window.__agrune_quick_mode__.handleCommand(kind, input)` 이 `runtime[kind]`
메서드를 직접 호출하는 구조. 따라서 제대로 된 wiring 을 하려면:

- `PageAgentRuntime` 인터페이스에 `recorder_enable(input)` / `recorder_disable()`
  메서드 surface 를 추가하고
- 캡처 결과가 page context 의 click handler 에서 MCP 쪽으로 bubble up 되도록
  `agrune_send` CDP binding 또는 별도 event channel 을 새로 설계해야 한다.

이 작업은 `T-16-02` 스펙상 새로운 bridge 설계가 필요하고, runtime 테스트에
현재 flaky 타임아웃이 한 건 존재(`cursor-animator.ts` RangeError, 이번
변경과 무관)하는 등 리스크가 높다. 따라서 이번 fix session 에서는
**MCP layer 의 dead-path 를 정리하는 부분까지만** 처리하고, runtime half
는 별도 후속 PR 로 분리할 것을 권장. REVIEW-FIX 단독으로 recorder 가
완전 production-ready 가 되지는 않음을 phase verification 단계에서 반드시
인지해야 한다.

---

### WR-01: `manifest-dev-watcher` 동시 pending add 시 stale-source race

**Files modified:** `packages/mcp/src/manifest-dev-watcher.ts`
**Commit:** 097a002
**Applied fix:** `ManifestDevWatcher` 에 `pendingQueue: Promise<void>` 필드를
추가하고 `watcher.on('add', ...)` 핸들러를 `pendingQueue.then(() =>
this.processPending(filePath))` 로 체인. 각 단계의 에러는 log 후 swallow
하여 체인이 끊기지 않도록 유지. 테스트 9 건(W1–W9) 모두 통과.

---

### WR-02: `panel.ts` escapeText 가 `&` 를 이스케이프하지 않아 XSS 벡터

**Files modified:** `packages/devtools/src/panel.ts`
**Commit:** 227d47b
**Applied fix:** `escapeText` 가 `&` 를 `&amp;` 로 가장 먼저 치환하도록
수정. double-unescape 취약점 차단. 기존 devtools 테스트 7 건 모두 pass.

Scope 참고: 리뷰는 `panel.ts` 의 innerHTML 직접 주입 지점(190/203/230-252 행)
도 함께 `escapeText` 로 감싸는 것을 권장했으나, 이번 fix 는 **minimal-surface**
원칙에 따라 `escapeText` 함수 자체의 버그만 고침. innerHTML 주입 리팩터링은
별도 follow-up 으로 분리. (User: "safe/minimal-surface fix".)

---

### WR-03: `RecorderController.handleCommit` idle 상태에서 호출 가능 — pending 디렉터리 flood 위험

**Files modified:** `packages/mcp/src/recorder-controller.ts`, `packages/mcp/tests/recorder-controller.spec.ts`
**Commit:** 6798707
**Applied fix:** `handleCommit` 서두에 `this.mode !== 'recording-action'`
guard 를 추가하고 위반 시 `RECORDER_NOT_RECORDING` error broadcast 후 즉시
return. 기존 R2/R3 테스트는 정상 플로우(toggle → captured → commit)를 반영
하도록 `handleCaptured` 호출을 추가하여 수정. 새 R6/R7 두 케이스로 idle /
picking 상태에서의 commit 거절을 별도 검증.

---

### WR-04: `isValidCommitPayload` 가 `selector` 내부 shape 을 검증하지 않음

**Files modified:** `packages/mcp/src/devtools-server.ts`
**Commit:** a1b53af
**Applied fix:** `ALLOWED_SELECTOR_KEYS` set 으로 `SelectorLadder` 스펙
(fiber/role/text/testId/attr/css) 키 allowlist 를 강제하고, string 필드
(`css`, `attr`, `text`, `testId`) 의 타입과 object 필드(`fiber`, `role`)
의 non-null object 여부를 간이 검증. `__proto__` 같은 prototype pollution
페이로드는 allowlist 위반으로 거절. WIRE-4 통합 테스트로 검증.

Scope 참고: 리뷰는 zod 전면 도입도 언급했으나 이는 MCP 패키지의 zod
의존성 범위와 다른 validator 들과의 일관성까지 고려해야 하는 큰 변경.
이번 fix 는 수동 체크 확장으로만 처리.

---

### WR-05: `manifest-merger.detectTrailingCommaStyle` 휴리스틱이 주석·fixture 에 속음

**Files modified:** `packages/mcp/src/manifest-merger.ts`
**Commit:** 11271ac
**Applied fix:** `detectTrailingCommaStyle` 의 시그니처를 `(sourceText: string)`
→ `(arr: ArrayLiteralExpression)` 으로 바꾸고 `arr.getFullText()` 의 마지막
`]` 직전 non-whitespace 가 `,` 인지만 검사하도록 국소화. `Project` 를 먼저
생성해 AST 를 얻은 후 `project.manipulationSettings.set(...)` 로 trailing
comma 옵션을 재설정. 기존 merger 테스트 전부 통과.

---

### WR-06: `FiberIdentityIndex.getPathByDom` stale DOM 반환 위험

**Files modified:** `packages/react/src/fiber/identity-index.ts`, `packages/react/tests/identity-index.spec.ts`
**Commit:** 943b023
**Applied fix:** `getPathByDom` 서두에 `el.isConnected` 체크를 추가.
tests A/B/C/D 는 이제 `document.body.appendChild(dom)` 로 DOM 에 붙인 뒤
조회·정리하도록 수정. 새 test F (WR-06) 에서 indexFiber 후 `el.remove()`
하면 `getPathByDom` 이 null 을 반환하는 시나리오를 명시적으로 검증.
react 패키지 54 테스트 전부 pass.

---

## Skipped Issues

(없음 — 모든 critical + warning findings 가 fixed 상태.)

## Info findings (out of scope)

리뷰 원문의 IN-01 ~ IN-06 은 `fix_scope: critical_warning` 에 따라 이번 pass
에서 건드리지 않았다. 해당 항목은 follow-up tracking 으로 유지:

- IN-01: `ts-morph Project { useInMemoryFileSystem: true }` 로 바꿀지 주석 추가할지
- IN-02: `--headless` + `--attach` 조합 경고 출력
- IN-03: RecorderView Enter 핸들러가 IME composition 중에 commit 하지 않도록
- IN-04: `actionKinds: ['click']` 하드코드 를 recorder 휴리스틱(`['fill']`) 로 대체
- IN-05: TodoMVC fixture 주석 명시
- IN-06: sensitive corpus `knownGap` 필드 분리

---

## Verification summary

각 fix 후 해당 패키지 테스트를 실행:

| Fix | Package | Tests | Result |
|-----|---------|-------|--------|
| WR-06 | `@agrune/react` | 54 | pass |
| WR-02 | `@agrune/devtools` | 7 | pass |
| WR-05 | `@agrune/mcp` | 144 → 144 | pass |
| WR-04 | `@agrune/mcp` | 144 → 144 | pass |
| WR-03 | `@agrune/mcp` | 144 → 146 (+R6/R7) | pass |
| WR-01 | `@agrune/mcp` | 146 → 146 | pass |
| CR-01 | `@agrune/mcp` | 146 → 150 (+WIRE-1…4) | pass |

Typecheck: `pnpm --filter @agrune/mcp run typecheck` 통과.

**주의:** `@agrune/runtime` 테스트에는 이번 fix 와 무관한 **pre-existing
flaky** 실패가 1 건 존재 (`cursor-animator.ts`의 cssstyle RangeError —
`act는 동적으로 추가된 overlay target을 즉시 snapshot에 반영하고 실행할
수 있다`). 아무 패치도 적용하지 않은 상태에서 `git stash` 로 clean tree
를 만들어 재실행해도 같은 failure 가 나옴을 확인함. 이번 fix 들은
runtime 패키지의 어떤 파일도 건드리지 않음.

---

_Fixed: 2026-04-19_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
