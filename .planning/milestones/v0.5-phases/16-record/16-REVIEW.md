---
phase: 16-record
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - .agents/skills/manifest/SKILL.md
  - .agents/skills/manifest/references/pattern-list.md
  - .agents/skills/manifest/references/pattern-login.md
  - .agents/skills/manifest/references/pattern-navigation.md
  - .agents/skills/manifest/references/pattern-payment.md
  - packages/devtools/src/panel.ts
  - packages/devtools/src/recorder-view.ts
  - packages/devtools/src/types.ts
  - packages/devtools/tests/recorder-view.spec.ts
  - packages/e2e/fixtures/todomvc/App.tsx
  - packages/e2e/fixtures/todomvc/manifest.ts
  - packages/mcp/bin/agrune-mcp.ts
  - packages/mcp/src/devtools-server.ts
  - packages/mcp/src/manifest-dev-watcher.ts
  - packages/mcp/src/manifest-merger.ts
  - packages/mcp/src/pending-store.ts
  - packages/mcp/src/recorder-controller.ts
  - packages/mcp/tests/manifest-dev-watcher.spec.ts
  - packages/mcp/tests/manifest-merger.spec.ts
  - packages/mcp/tests/pending-store.spec.ts
  - packages/mcp/tests/recorder-controller.spec.ts
  - packages/react/src/bridge/identity-bridge.ts
  - packages/react/src/fiber/identity-index.ts
  - packages/react/tests/AgruneDevtools.spec.tsx
  - packages/react/tests/identity-bridge.spec.ts
  - packages/react/tests/identity-index.spec.ts
  - packages/runtime/src/runtime/command-handlers.ts
  - packages/runtime/src/runtime/recorder-injected.ts
  - packages/runtime/tests/fixtures/corpus/login.ts
  - packages/runtime/tests/fixtures/corpus/payment.ts
  - packages/runtime/tests/fixtures/corpus/profile.ts
  - packages/runtime/tests/fixtures/corpus/signup.ts
  - packages/runtime/tests/fixtures/corpus/types.ts
  - packages/runtime/tests/recorder-injected.spec.ts
  - packages/runtime/tests/sensitive-corpus.spec.ts
findings:
  critical: 1
  warning: 6
  info: 6
  total: 13
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 32 (including 2 small SKILL ref MDs + the types file)
**Status:** issues_found

## Summary

Phase 16 RECORD-01~05 의 핵심 보안 경계(`PendingStore` path containment / WS payload validation / ts-morph no-save 계약 / sensitive fiber-capture no-value-read)는 **설계·구현·테스트가 의도대로 잘 정합**해 있다. 특히:

- `PendingStore.sanitizeSessionId` + `writePending`/`deletePending`가 regex allowlist + `path.relative` 더블 체크로 T-16-02/T-16-06을 이중 방어.
- `manifest-merger.ts`는 `project.save()`류 호출을 절대 하지 않고 `getFullText()`만 꺼내 caller가 `writeFile`하는 구조가 명확하며, 검증 테스트(M11 주변)도 존재.
- `recorder-injected.ts`의 `captureElement`는 `el.value`/`valuePreview` 접근 없음. `roleSelector.name`은 80자 slice로 bounded.
- `AgruneIdentityBridge` v1→v2 bump 시 `index.getPathByDom` 존재 여부를 feature-detect해서 graceful degradation 설계됨.

그러나 **production 플로우에서 recorder가 작동하지 않는 critical wiring gap** 이 있다: `RecorderController`/`handleRecorderEnable`은 선언·테스트는 존재하지만 production 엔트리포인트(`agrune-mcp.ts`) 어디서도 실제 인스턴스가 생성되어 `startDevtoolsServer`에 주입되지 않는다. 또 DevTools panel.ts의 기존 `escapeText`는 `&`를 이스케이프하지 않아 XSS 표면이 남아 있고(기존 코드이지만 스코프 내), `manifest-dev-watcher`에는 rapid concurrent-add 시 stale-read TOCTOU 가능성이 하나 있다.

아래는 심각도별 finding.

## Critical Issues

### CR-01: RecorderController / recorder_enable wiring이 production 엔트리에 연결되어 있지 않음 (dead code path)

**File:** `packages/mcp/bin/agrune-mcp.ts:112-130` (+ `packages/mcp/src/devtools-server.ts:26-28, 315-325` / `packages/runtime/src/runtime/command-handlers.ts:1665-1687`)
**Issue:**
- `startDevtoolsServer` 호출부가 `{ commandBroker, hitl, onFocusSession }` 만 넘기고 `recorder: RecorderController` 를 주입하지 않는다. 결과적으로 `devtools-server.ts` 내부의 `recorder_toggle` / `recorder_commit` 분기(315-325행)와 last-client-disconnect 시 `options.recorder.reset()`(174행)은 전부 `if (!options.recorder) return` 으로 즉시 빠져나가 **DevTools UI의 Ctrl+Shift+R / Enter가 서버에 아무 효과도 내지 않는다.**
- 동일하게 `runtime/command-handlers.ts` 의 `handleRecorderEnable` / `handleRecorderDisable` 는 export 될 뿐 `createPageAgentRuntime` 의 command 분기에 등록되지 않았다 (`'recorder_enable'` / `'recorder_disable'` 문자열로 grep했을 때 매치 0). 따라서 MCP 레이어의 `RecorderController.handleCaptured` 가 **production에서 절대 호출되지 않는다** — 오직 `recorder-controller.spec.ts`의 R5 유닛 테스트에서만 호출.
- 즉 RECORD-01/02/03의 E2E chain(브라우저 DOM → recorder-injected → command-handlers → RecorderController → PendingStore → manifest-dev-watcher)이 **runtime 쪽 상단 1/3이 끊겨 있는** 상태로 통합된다. 테스트는 각 레이어가 단독으로 통과하지만 실제 `agrune` 바이너리를 실행하면 recorder는 전혀 동작하지 않을 것.

이 자체가 보안 취약점은 아니지만 (오히려 "비활성된 코드"이므로 외부로 나가는 리스크는 0), **기능 correctness critical**이다. Phase 16의 VERIFICATION 완료 판정 전에 반드시 통합을 끝내야 한다.

**Fix:** 두 군데의 wiring을 추가한다.

1. `packages/mcp/bin/agrune-mcp.ts` — `RecorderController` 를 생성하고 `startDevtoolsServer` 에 주입:
   ```ts
   // near the other imports
   import { RecorderController } from '../src/recorder-controller.js'
   import { PendingStore } from '../src/pending-store.js'

   // right after `const { server, commandBroker, hitl } = createMcpServer(driver)`
   const pendingStore = new PendingStore()
   let broadcastToDevtools: RecorderBroadcast = () => {} // filled in when server ready
   const recorder = new RecorderController(pendingStore, (msg) => broadcastToDevtools(msg))

   // ... then pass into startDevtoolsServer options:
   const devtoolsPort = await startDevtoolsServer(driver, port, {
     commandBroker,
     hitl,
     onFocusSession: /* existing */,
     recorder,   // ← 추가
   })
   ```
   또한 `devtools-server.ts`의 fan-out 에 `recorder_*` 브로드캐스트 hook을 노출하거나, `RecorderController` 생성 시 주입되는 broadcast 를 `clients` 배열에 직접 붙일 수 있도록 인터페이스를 확장해야 한다 (현재 `RecorderBroadcast` 는 private이다).

2. `packages/runtime/src/runtime/command-handlers.ts` — `handleRecorderEnable` / `handleRecorderDisable` 를 command dispatch kind에 등록. `createPageAgentRuntime` 의 switch/case에 `case 'recorder_enable'` / `case 'recorder_disable'` 를 추가하고, `onCapture` 콜백이 CDP Runtime.evaluate 응답으로 serialize되어 MCP 쪽 `RecorderController.handleCaptured` 로 도달하는 경로를 명시한다.

3. 통합 스모크 테스트를 추가 — e.g. `packages/mcp/tests/recorder-integration.spec.ts` 에서 `startDevtoolsServer({ recorder })` + mock WS client로 `recorder_toggle` → 모드 변경 → `recorder_captured` broadcast → `recorder_commit` → `pending-store` 쓰기까지를 end-to-end 로 확인.

이 세 가지 중 하나라도 빠지면 recorder는 production에서 여전히 dead.

---

## Warnings

### WR-01: `manifest-dev-watcher` 동시 pending add 시 stale-source race

**File:** `packages/mcp/src/manifest-dev-watcher.ts:120-219` (`processPending`)
**Issue:** chokidar `'add'` 이벤트가 짧은 간격으로 두 번 이상 fire 되면 (대표적: 동일 picking session 에서 Enter 를 연속 누르거나, 두 개의 DevTools 웹앱이 동시에 commit) 각각 `processPending` 가 **독립적으로** `readFile(manifestPath)` → merge → prompt 한다. Prompt 는 readline 으로 터미널을 통해 직렬화되지만, 첫 prompt 가 `y` 로 수락되어 `writeFile` 된 **뒤** 두 번째 merge 는 이미 낡은 `sourceText` 로 만들어진 `merged` 를 쓰므로 첫 번째 추가분이 **말없이 덮어써진다**.

`awaitWriteFinish` 는 단일 파일 write-settle 만 보호하므로 이 TOCTOU 는 못 막는다. Plan 03 에서 "user confirms every merge so concurrent writes are serialized" 라고 가정했을 가능성이 크지만 실제로는 `sourceText` snapshot 이 prompt 전에 찍히므로 순서 보장이 깨진다.

**Fix:** Watcher 내부에 간단한 직렬화 큐를 추가하여 한 번에 하나의 `processPending` 만 실행되도록 강제:

```ts
private pendingQueue: Promise<void> = Promise.resolve()

this.watcher.on('add', (filePath: string) => {
  if (extname(filePath) !== '.json') return
  this.pendingQueue = this.pendingQueue
    .then(() => this.processPending(filePath))
    .catch((err) => {
      this.log.error(`[manifest dev] process error: ${err instanceof Error ? err.message : String(err)}`)
    })
})
```

이렇게 하면 prompt 가 `y` 로 풀린 후 `writeFile` 완료 시점에서야 다음 `processPending` 이 시작되어 항상 갱신된 `manifest.ts` 를 읽게 된다. 기존 테스트 W1~W9 는 emit을 순차로 쏘므로 이 변경과 호환된다.

---

### WR-02: `panel.ts` escapeText 가 `&` 를 이스케이프하지 않아 XSS 벡터

**File:** `packages/devtools/src/panel.ts:263-265`
**Issue:** `escapeText` 는 `<`, `>`, `"` 만 치환한다. `s.title || s.url` 같은 cross-origin 페이지 기원 문자열이 `&lt;script` 같이 쓰여 오면 원래 안전하지만, 반대로 `"onmouseover=alert(1)//` 같은 페이로드를 포함한 URL 이 `&quot;` 로만 바뀌면 속성 brace 가 닫히지 않아 상대적으로 안전하다. 그러나 **`&` 를 치환하지 않으면** `escapeText` 의 결과를 innerHTML 에 사용했을 때 `&lt;script&gt;` 와 같은 이미 이스케이프된 문자열이 **다시 `<script>` 로 복원**되는 double-unescape 취약점이 전통적으로 발생한다. 또한 render() 에서는 panel.ts 가 `target.name`, `target.groupName`, `target.groupDesc`, `target.textContent`, `target.valuePreview`, `target.sourceFile` 을 전혀 이스케이프하지 않고 innerHTML 에 직접 주입(203, 231-245행) — 이는 phase 16 스코프는 아니나 **recorder_view.ts 의 `escapeHtml` 과 일관성 결여**라 한 PR에서 맞추는 것이 합리적.

**Fix:**
```ts
function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')   // 반드시 가장 먼저
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
```
추가로, 더 안전하게는 `recorder-view.ts` 의 `escapeHtml` 을 `packages/devtools/src/util/escape.ts` 같은 단일 모듈로 승격해 panel.ts 에서도 import 하여 사용하도록 리팩터링 권장. 이번 리뷰에서 발견된 직접 innerHTML 주입 지점(panel.ts 190, 203, 230-252) 도 같이 교체.

---

### WR-03: `RecorderController.handleCommit` 이 client 가 보낸 sessionId 를 무시해 `sessionId` 필드가 실질적으로 사용되지 않음 — 타입상 혼란

**File:** `packages/mcp/src/recorder-controller.ts:88-147` + `packages/devtools/src/recorder-view.ts:118-128`
**Issue:** 클라이언트는 `CommitPayload.sessionId = ''` 를 보낸다(해당 코드 주석 "server fills in"). 서버는 `this.sessionId ?? sanitizedUuid()` 로 덮어쓴다. 이 자체는 안전하지만 **idle 상태에서 `handleCommit` 이 호출된 경우** (예: WS 클라이언트가 raw message 를 임의 전송) `this.sessionId == null` 이므로 fresh `sanitizedUuid()` 가 생성되어 pending 파일이 쓰여 **picking 세션을 시작하지도 않은 상태에서 공격자가 pending 디렉터리를 채울 수 있다** (T-16-05 의 변형: 인증 없는 WS 엔드포인트이므로 로컬 악성 프로세스가 127.0.0.1 로 붙어 무한 write). 256KB cap 은 파일 당이지 전체 개수 제한이 아니다.

**Fix:** `handleCommit` 서두에 mode guard 를 추가:
```ts
async handleCommit(payload: CommitPayload): Promise<void> {
  if (this.mode !== 'recording-action') {
    this.broadcast({
      type: 'recorder_error',
      code: 'RECORDER_NOT_RECORDING',
      message: 'cannot commit: recorder is not in recording-action mode',
    })
    return
  }
  // ... 이하 기존 로직
}
```
`handleCaptured` 가 호출되어 `mode === 'recording-action'` 인 시점에서만 `handleCommit` 을 허용. 기존 테스트 R2 는 `handleToggle()` (idle→picking) 후 바로 `handleCommit` 하므로 이 가드를 넣으면 깨진다 — R2 앞에 `controller.handleCaptured({...})` 를 추가하여 올바른 상태 전이를 반영하도록 함께 고쳐야 한다.

---

### WR-04: `isValidCommitPayload` 가 `selector` 내부 shape 을 검증하지 않아 `PendingStore` 까지 임의 객체가 흘러감

**File:** `packages/mcp/src/devtools-server.ts:340-349`
**Issue:** 현재 체크는 `typeof r.selector === 'object' && r.selector !== null` 뿐. 이후 `recorder-controller.ts:127` 에서 `selector: payload.selector` 그대로 `PendingCaptureFile.targets[0].selector: unknown` 으로 전달 → JSON.stringify 되어 디스크에 기록. 악성 페이로드가 `{ __proto__: { polluted: 1 } }` 이나 거대한 중첩 객체(수MB) 를 담으면 256KB 캡은 `writePending` 직전에 체크하지 않으므로 통과. `manifest-merger` 단계의 `assertSelectorSafe` 가 string 필드만 검증해서 **object 전체 구조는 aucan unverified input** 으로 `sf.getFullText()` 후 삽입될 수 있다 (`JSON.stringify` 로 이스케이프되므로 code-injection 은 안 되지만, `defineTarget({ selector: { <attacker blob> }, ... })` 가 manifest.ts 에 그대로 기록되어 이후 `@agrune/manifest` schema 검증 단계에서야 튕기거나 user 가 prompt 에서 그대로 `y` 를 누를 수 있음).

**Fix:** `isValidCommitPayload` 에 selector 키 allowlist 를 강제:
```ts
const ALLOWED_SELECTOR_KEYS = new Set(['fiber', 'role', 'text', 'testId', 'attr', 'css'])
// ...
const sel = r.selector as Record<string, unknown>
if (Object.keys(sel).length === 0) return false
for (const k of Object.keys(sel)) {
  if (!ALLOWED_SELECTOR_KEYS.has(k)) return false
}
// 각 값 타입 최소 검증
if ('css' in sel && typeof sel.css !== 'string') return false
if ('attr' in sel && typeof sel.attr !== 'string') return false
if ('text' in sel && typeof sel.text !== 'string') return false
```
그리고 `@agrune/manifest` 에 이미 있는 `SelectorLadder` zod 스키마를 `@agrune/mcp` 에서 한 번 parse 하는 것이 궁극적으로 가장 청결. 현재 devtools-server 가 zod 의존을 피하려 한 의도는 이해하나, RECORD-03 의 `manifest-merger` 는 이미 ts-morph + diff 를 쓰므로 zod 하나 더 추가하는 비용은 실질적으로 0.

---

### WR-05: `manifest-merger` 의 `detectTrailingCommaStyle` 휴리스틱이 fenced code block / 주석에 속을 수 있음

**File:** `packages/mcp/src/manifest-merger.ts:298-303`
**Issue:** `/,\s*[\]\}\)]/m` 정규식은 **한 줄이라도** `, ]` / `, }` / `, )` 패턴을 포함하면 trailing comma 를 "present" 로 판정. Manifest 파일 상단 주석에 `example: [1, 2, 3,]` 같은 문자열이 있으면 실제 코드가 trailing comma 를 쓰지 않더라도 present 로 오판되어 ts-morph `manipulationSettings.useTrailingCommas: true` 가 설정되고, merged 결과에 불필요한 comma 가 붙는다. 같은 문제로 `detectIndentation` 도 첫 non-empty indent(주석 안의 공백 포함)를 집어간다.

Phase 16 의 merge 는 그래도 **정식 ts-morph AST 기반**으로 하므로 새로 insert 된 노드의 serialization 에만 영향이 있어 diff 가 "noise" 수준으로 발생. 실패는 아님 — 따라서 Warning.

**Fix:** 기존 targets 배열의 실제 마지막 요소에 trailing comma 가 있는지 AST 로 직접 검사. `ArrayLiteralExpression.hasTrailingComma()` 가 ts-morph 에 없다면 `arr.getFullText()` 의 마지막 `]` 직전 non-whitespace 문자가 `,` 인지 확인하는 식의 국소 검사로 충분.

```ts
function detectTrailingCommaStyle(arr: ArrayLiteralExpression): boolean {
  const fullText = arr.getFullText()
  const closeIdx = fullText.lastIndexOf(']')
  if (closeIdx < 0) return false
  const before = fullText.slice(0, closeIdx).replace(/\s+$/, '')
  return before.endsWith(',')
}
```
전역 heuristic 대신 해당 `arr` 만 보게 하면 주석/fixture blob 에 영향 받지 않는다.

---

### WR-06: `FiberIdentityIndex.getPathByDom` 이 stale DOM 을 반환할 수 있음 (deindex 타이밍)

**File:** `packages/react/src/fiber/identity-index.ts:50-56`
**Issue:** `domToPath` 는 WeakMap 이므로 DOM element 가 GC 되면 자동으로 정리되지만, React fiber 가 unmount 되었더라도 외부(예: recorder-injected) 가 이벤트 타깃으로 그 element 를 잡고 있는 한 WeakMap 엔트리는 살아있다. `deindexFiber` 는 commit 시 호출되지만 detach 와 unmount 사이에 `activateRecorderOverlay` 의 `onClick` 이 fire 되면 `bridge.resolvePath(el)` 이 "방금 사라진" path 를 리턴. 그 path 로 나중에 `resolve(path)` 를 돌리면 null 또는 다른 element 가 나와 테스트/런타임에서 "element not found" 가 된다.

이는 선언된 semantic("snapshot 시점의 identity") 범위 내라 치명적이진 않지만, recorder 가 기록한 selector 가 직후 검증 단계에서 바로 resolve 실패하는 경험을 낳을 수 있다. `getPathByDom` 이 최소한 `el.isConnected` 를 확인하도록 방어하는 것이 값싸다.

**Fix:**
```ts
getPathByDom(el: HTMLElement): FiberIdentityPath | null {
  if (!(el instanceof HTMLElement)) return null
  if (!el.isConnected) return null   // ← stale detach 방어
  const stored = this.domToPath.get(el)
  if (!stored) return null
  return stored.map(seg => ({ ...seg }))
}
```
테스트 identity-index.spec.ts test E 에 `el.remove()` 후 `getPathByDom(el)` 이 null 을 반환하는 케이스를 하나 추가.

---

## Info

### IN-01: `ts-morph Project` 가 `useInMemoryFileSystem: false` 로 생성되어 있음 — 미래의 `.save()` 추가 시 실파일시스템에 쓰일 위험

**File:** `packages/mcp/src/manifest-merger.ts:97-107`
**Issue:** 현재는 `project.save()` / `sf.saveSync()` 를 어디서도 호출하지 않아 T-16-10 위반이 발생하지 않는다(grep 확인). 그러나 `useInMemoryFileSystem: false` 로 실제 FS 에 연결된 채 `createSourceFile(manifestFilePath, sourceText, { overwrite: true })` 를 호출하므로, 차후 누군가 `project.saveSync()` 한 줄을 추가하면 즉시 실파일이 덮어써진다(caller 의 confirm prompt 를 우회).
**Fix:** `useInMemoryFileSystem: true` 로 바꾸면 `manifestFilePath` 가 메모리 경로로만 존재하고 `save()` 를 호출해도 실파일에 닿지 않는다. 현재 로직은 `getFullText()` 만 꺼내 쓰므로 동작 변화 없음. 또는 현행을 유지하되 inline 주석에 "MUST NEVER call project.save()" 를 한 줄 추가.

---

### IN-02: `agrune-mcp.ts` 가 `--attach` + `--headless` 조합 경고 안 함

**File:** `packages/mcp/bin/agrune-mcp.ts:87-89`
**Issue:** `--user-data-dir` + `--attach` 조합만 경고("ignored when --attach is set"). `--headless` + `--attach` 역시 `headless` 플래그가 attach 모드에서는 무시되지만 조용히 넘어간다. 사용자 혼란 가능.
**Fix:** 동일하게 `process.stderr.write('[agrune] --headless is ignored when --attach is set\n')` 1줄 추가 — 또는 CdpDriver 내부에서 attach 모드면 headless 옵션을 무시하고 명시적으로 경고.

---

### IN-03: `RecorderView` 의 Enter 핸들러가 composition 중에도 commit 할 수 있음

**File:** `packages/devtools/src/recorder-view.ts:89-97`
**Issue:** IME(한/일/중) 입력 중 `compositionend` 이전의 Enter 가 `keydown` 으로 먼저 올라오면 `this.candidates` 가 있는 한 `this.commit()` 이 실행된다. 사용자가 한글 targetId 를 입력 중이었다면 조합이 끝나기 전에 commit 이 발사되어 "부분 글자" 로 보이는 값이 서버로 간다. PendingStore 의 targetId regex 가 한글을 거르므로 실질적 보안 이슈는 아니고, UX 버그다.
**Fix:**
```ts
if (e.key === 'Enter' && this.candidates) {
  if (e.isComposing || e.keyCode === 229) return
  // ...
}
```

---

### IN-04: `manifest-merger.buildDefineTargetText` 가 actionKinds 를 항상 `['click']` 으로 하드코드 — Plan 에 의도는 기록됐으나 사용자에게 surface 되지 않음

**File:** `packages/mcp/src/manifest-merger.ts:176-187`
**Issue:** recorder 가 actionKind 를 추정하지 않으므로 merge 후 사용자가 수동 교정해야 하지만, diff preview 는 단지 `actionKinds: ['click']` 이라고 보여줄 뿐 **"이 값은 기본값이며 수정 필요할 수 있음"** 을 명시하지 않는다. Input / select 에 대해서는 최소한 `['fill']` 로 기본값을 바꾸는 휴리스틱이 가치가 있다 (runtime 의 `canReceiveTextInput`, `isFillableElement` 가 이미 존재).
**Fix:** `CaptureResult` 에 `suggestedActionKind: 'click' | 'fill'` 필드를 선택적으로 추가하거나(recorder-injected 가 `canReceiveTextInput(el)` 로 판정), 또는 `buildDefineTargetText` 가 pending.targets[n] 의 sensitive/selector 힌트로 `'fill'` 을 기본값으로 선택하게 개선. 적어도 diff preview 뒤에 `// review actionKinds: recorder defaulted to ['click']` 같은 인라인 주석을 emit 해 리뷰 attention 을 끌어주는 정도가 가장 가볍다.

---

### IN-05: `todomvc/App.tsx` 의 `// @ts-nocheck` fixture 는 skill 이 참조하는데 react import 가 workspace 에 없어 초심자가 실행하려다 혼란 가능

**File:** `packages/e2e/fixtures/todomvc/App.tsx:1-20`
**Issue:** 첫 주석에 "NOT a runnable app in this workspace" 가 있지만, skill SKILL.md 의 manifest 참조 예시로만 역할이 있는 파일이다. 초심자가 `pnpm --filter @agrune/e2e test` 를 돌릴 때 이 파일이 test fixture 로 인식되지 않도록 `tsconfig.json` 이 `fixtures/**` 를 exclude 하고 있음은 잘 기록되어 있다. 실제 문제는 없고 단지 doc 가독성 개선 여지만 있다.
**Fix:** 해당 파일 상단 주석에 "Used by agrune:manifest skill as reference fixture only" 한 줄 더 추가해 의도를 명시.

---

### IN-06: `sensitive-corpus.spec.ts` 가 known gap 을 negative assertion 으로 문서화 — 정확한 design choice 지만 메트릭 지표는 drift 주의

**File:** `packages/runtime/tests/sensitive-corpus.spec.ts` + corpus 4 파일
**Issue:** `payment-cvv-04 name="cvc"` 같은 known miss 가 `expected: [false]` 로 기록되어 있다. 이는 "heuristic 의 실제 동작 기록" 이라는 명시적 design choice (notes 참조) 이고 fp/fn 통계에 영향. Future 에 누군가 `cvc` 를 allow-list 에 추가하면 이 fixture 가 **precision 에는 영향 없지만 recall 을 올리며 동시에 이 fixture 에서 false positive 로 집계** (predicted=true, actual=false). threshold 가 borderline 이면 CI 가 flake. 진짜 ground truth (is this field actually sensitive?) 와 "heuristic currently says" 를 한 필드에 섞어 두면 risk 가 있다.
**Fix:** `FormFixture` 에 `knownGap?: boolean` 필드를 추가하여 "ground truth 는 true 이지만 현재 heuristic 이 못 잡는다" 와 "진짜 non-sensitive" 를 분리. metrics 계산 시 `knownGap` 은 별도 버킷으로 집계하여 `recall` 계산에서 제외하거나 별도 "known-miss-recall" 지표를 출력. 이번 phase 에서 당장 필요하진 않으나 corpus 를 v0.6+ 로 확장할 때 첫 번째 리팩터링.

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
