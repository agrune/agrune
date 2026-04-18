# Phase 5 — Research: Input Reliability (CDP Input domain)

**Date:** 2026-04-18
**Mode:** inline research (agent spawn unavailable — orchestrator mode)

## Question

`agrune_fill`이 CDP `Input` 도메인 기반으로 controlled input·contenteditable·masked input 시나리오에서 결정적으로 동작하게 하려면 무엇을 알아야 plans가 탄탄해지는가?

## 1. 현행 경로 (삭제/대체 대상)

**파일:** `packages/runtime/src/runtime/command-handlers.ts`

- `setElementValue(element, value)` (lines 289-306) — native prototype value setter + `input`/`change` 이벤트 디스패치. React/Vue/Angular의 controlled input은 이 경로로도 대부분 통하지만, 다음 시나리오에서 실패한다:
  - `beforeinput`/`keydown` 리스너로 validation·masking을 하는 프레임워크(예: react-input-mask, cleave.js, react-number-format)는 `input` 이벤트만으로는 내부 상태를 갱신하지 않는다.
  - `contenteditable` 요소는 `value` 프로퍼티가 없어 현재 코드로 아예 처리 불가 — `isFillableElement` 타입가드가 `HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement`만 허용 (`dom-utils.ts:335`).
  - DOM 이벤트를 "signed"(isTrusted) 상태로 만들 수 없어 일부 프로덕션 가드(예: 복사 방지, reCAPTCHA)가 거부한다.

**현 `handleFill` 호출 흐름 (lines 475-533):**

1. `withDescriptor` → descriptor/element 해결.
2. 가시성/상호작용 가드 (visible, viewport, topmost, enabled).
3. `smoothScrollIntoView` + `clickDelayMs` 대기.
4. `pointerAnimation`이면 `queue.push({ type: 'animation', execute: () => flashPointerOverlay(..., () => setElementValue(...)) })`, 아니면 즉시 `setElementValue`.
5. `captureSettledSnapshot(2)` → `buildSuccessResult({ actionKind: 'fill', targetId, value })`.

## 2. CDP Input 도메인 (대체 경로)

Page 런타임에는 이미 `createCdpClient(postMessage)` 기반의 양방향 CDP 브리지가 존재한다 (`packages/runtime/src/runtime/cdp-client.ts`). `cdp.sendCdpEvent(method, params)`는 임의의 메서드·파라미터를 `cdp_request` 바인딩으로 보내고 `cdp_response`를 Promise로 반환한다 (`CDP_TIMEOUT_MS = 5_000ms`). 드라이버쪽 `CdpDriver.handleCdpRequest` (`cdp-driver.ts:345-380`)는 화이트리스트 없이 `connection.send(method, params, sessionId)`로 전달한다. ⇒ **`Input.insertText`, `Input.dispatchKeyEvent` 등은 추가 인프라 없이 사용 가능**하다.

### 2.1 `Input.insertText`

- **용도:** focus된 요소에 텍스트를 "IME 수준"으로 삽입. focus된 input/textarea에는 일반 입력으로 해석되고, contenteditable에서는 composition 없는 커밋으로 처리된다.
- **장점:**
  - React/Vue/Angular의 controlled input이 "사용자 입력"으로 인식 (beforeinput/input/change 모두 자연스럽게 발생).
  - contenteditable에서 `document.execCommand('insertText')` 없이도 캐럿 위치에 텍스트가 들어간다 (Chromium 기준).
- **한계:**
  - 요소에 **focus가 없으면 NOOP**. `insertText` 전에 반드시 focus를 설정해야 한다.
  - `readonly`/`disabled` 요소에는 아무 일도 일어나지 않음 — 현 핸들러가 이미 `isEnabled` 가드로 거름.
  - masked input처럼 "키 단위" 리스너로 포매팅하는 라이브러리는 `insertText` 한 번만으로는 포매팅이 깨질 수 있음 — **INPUT-03**은 `Input.dispatchKeyEvent` 키 시퀀스로 처리.
- **파라미터:** `{ text: string }` — `sessionId`는 CdpDriver에서 자동 주입됨.

### 2.2 `Input.dispatchKeyEvent`

- **용도:** 실제 키보드 이벤트를 합성 — `keydown`/`keyUp`/`char`/`rawKeyDown` 등.
- **장점:**
  - masked input 라이브러리가 `beforeinput`/`keydown`에서 패턴을 검사·재포매팅할 수 있게 해 준다.
  - `Meta+A`/`Backspace`/`Delete` 같은 제어 시퀀스로 기존 값을 지울 수 있다 (INPUT-04).
- **핵심 파라미터:**
  - `type`: `'keyDown' | 'keyUp' | 'char' | 'rawKeyDown'`
  - `text`: 타이핑될 문자 (있으면 자동으로 `input` 이벤트 발생).
  - `key`: `'a'`, `'Backspace'`, `'Meta'` 등 DOM KeyboardEvent.key 값.
  - `code`: physical key code (예: `'KeyA'`, `'Backspace'`).
  - `modifiers`: 비트마스크 (1=Alt, 2=Ctrl, 4=Meta, 8=Shift).
  - `windowsVirtualKeyCode` / `nativeVirtualKeyCode`: 일부 사이트가 필요.
- **결정적 타이핑 시퀀스 (한 글자 `c`):**
  1. `keyDown` `{ key: c, code, text: c }` — 이 한 번의 호출로 대부분의 경우 `keydown`·`beforeinput`·`input`이 트리거됨.
  2. `keyUp` `{ key: c, code }`.
  일부 사이트(IME 우회)에서 `keyDown` 후 `char { text }`를 추가로 보내야 하지만, 현대 Chromium에선 `keyDown.text`만으로 충분하다. 구현은 `keyDown + keyUp` 2-스텝으로 시작하고 테스트에서 실패하면 `char` 삽입을 추가한다.
- **Select-all/Delete 시퀀스 (macOS 기준, clear=true):**
  - `keyDown { key: 'Meta', code: 'MetaLeft', modifiers: 4 }`
  - `keyDown { key: 'a', code: 'KeyA', modifiers: 4 }` / `keyUp { key: 'a', code: 'KeyA', modifiers: 4 }`
  - `keyUp { key: 'Meta', code: 'MetaLeft' }`
  - `keyDown { key: 'Delete', code: 'Delete' }` / `keyUp { key: 'Delete', code: 'Delete' }`
  - macOS Chrome은 Meta+A를 받아들이지만, CDP 레벨에선 OS와 무관하게 이렇게 조합하면 "selection 전체"로 인식된다는 점을 Puppeteer가 이미 검증했다. 크로스 OS 안정성을 위해 `commands: ['selectAll']`을 `keyDown` 파라미터에 함께 넣는다(Chromium만 지원, 다른 브라우저엔 무시됨).

### 2.3 `DOM.focus` vs `Runtime.evaluate` focus

- `insertText`·`dispatchKeyEvent`는 현재 focused element를 대상으로 한다. 현 핸들러는 `element.focus()`를 호출 — **page 런타임 내부에서 JS로 focus**한 뒤 CDP 이벤트를 보내면 확실하다. 별도 `DOM.focus` CDP 호출은 불필요.

## 3. contenteditable 처리 (INPUT-02)

- `contenteditable` 요소는 `HTMLElement`지만 `value`가 없어 현 `isFillableElement`는 거절한다.
- 처리 전략:
  1. `dom-utils.ts`에 `isContentEditableElement(el: Element): el is HTMLElement` 추가 — `el.isContentEditable === true`.
  2. `isFillableElement` 기반 가드를 `canReceiveTextInput(el) = isFillableElement(el) || isContentEditableElement(el)`로 확장 — 이름은 유지, 시그니처만 union 확장.
  3. snapshot 쪽에서 contenteditable 요소를 `actionKinds: ['fill']`로 인식하려면 `dom-scanner.ts`/`snapshot.ts` 수정 필요. **이번 phase 스코프:** `data-agrune-action="fill"` 어노테이션이 contenteditable에 붙은 경우만 처리한다(ROADMAP success criteria #2는 "사용자가 contenteditable을 대상으로 호출"이라 annotation 전제). 자동 탐지는 out of scope로 명시.
  4. `setElementValue` 대신 `insertText`를 호출하기 전에, contenteditable이면 먼저 `Selection.removeAllRanges()` 후 `Range.selectNodeContents(el)` → `select()` → `insertText`. 기존 내용 위에 타이핑해도 되게끔 clear=false면 요소 끝으로 caret 이동만.

## 4. masked input (INPUT-03)

- 테스트 표본: react-input-mask, cleave.js, imask, react-number-format.
- 공통 패턴: `keydown`/`beforeinput` 리스너에서 character 단위로 검사 → `value`를 재포매팅.
- 전략: **한 글자씩** `Input.dispatchKeyEvent` 시퀀스를 보낸다. 각 글자마다 `keyDown(text, key, code) → keyUp(key, code)`. 글자 간 지연은 `config.clickDelayMs` 대신 0ms 기본(테스트에서 flaky면 `typeDelayMs` 옵션 도입). `Input.insertText`는 한 번에 한 덩어리를 넣기 때문에 masking lib가 "이전 값 전체 교체"로 인식해 포매팅이 깨진다 — 반드시 키 시퀀스.

### 4.1 전략 선택 결정 트리

요소 종류 × 전략:

| 요소 종류 | 기본 전략 | clear=true일 때 |
|----------|-----------|------------------|
| `<input type="text|email|password|search|url">`, `<textarea>` | `focus()` → `Input.insertText` | Select-all 시퀀스 → `insertText` |
| `<input type="tel|number" data-agrune-masked="true">` 또는 heuristic 감지된 masked | `focus()` → 글자별 `dispatchKeyEvent` | Select-all 시퀀스 → 글자별 `dispatchKeyEvent` |
| `contenteditable` | `focus()` → Selection 준비 → `Input.insertText` | Selection 전체 → `Input.dispatchKeyEvent('Delete')` → `insertText` |
| `<select>` | 기존 `setElementValue` 유지 (CDP Input 도메인 무관) | N/A |

**Masked 감지 heuristic:**
1. `element.getAttribute('inputmode')`가 `tel`/`numeric`이고, `pattern` 속성 존재.
2. `data-agrune-masked="true"` 또는 상위 element의 `data-cleave-*`/`data-mask`.
3. 기본 fallback: `type="tel"`이면 masked로 간주.
명시적 옵션 `strategy: 'insert' | 'keystroke' | 'auto'` (기본 `auto`)를 fill 커맨드에 받아, 사용자가 오버라이드 가능하게 한다.

## 5. API 확장 (INPUT-04)

`FillCommandRequest`에 필드 2개 추가:

```ts
export interface FillCommandRequest extends BaseCommandRequest {
  kind: 'fill'
  targetId: string
  value: string
  clear?: boolean           // 기본 false — 기존 값 유지하고 append
  strategy?: 'insert' | 'keystroke' | 'auto'  // 기본 'auto'
  expectedVersion?: number
}
```

MCP 쪽 (`packages/mcp/src/tools.ts`의 `agrune_fill` inputSchema)에도 두 필드를 추가한다. 기존 호출자는 필드를 안 넣어도 동일 동작(insert strategy, clear=false — 단 현 구현은 prototype setter로 전체 치환하므로 clear=true와 동등. 호환성 유지를 위해 **기본값을 `clear: true`로 둔다**. 문서에 "v1 behavior = fully replace" 명시.)

## 6. 바닐라 대체 경로(보존) — fallback

`Input.insertText`가 NOOP인 환경(헤드리스 모드에서 focus stealing 이슈 등)을 대비해 기존 `setElementValue` 경로는 `strategy: 'dom-setter'`로 **숨은 옵션** 보존. 기본 플로우에는 쓰지 않되, 테스트에서 환경 이슈를 재현하면 즉시 전환할 수 있도록 한다. 이번 phase의 primary success path는 CDP.

## 7. 관련 테스트 변경

- `packages/runtime/tests/runtime.spec.ts` — `fill` 액션이 이미 매니페스트 기대값에 포함되어 있다. `setElementValue` 호출을 직접 기대하는 테스트는 없음 (grep 결과). ⇒ 매니페스트·스키마 테스트는 변경 불필요.
- `packages/browser/tests/command-queue.spec.ts:41` — `{ kind: 'fill', targetId, value }`를 enqueue하는 스모크 테스트. 새 optional 필드를 추가해도 호환.
- **새 테스트:**
  - `packages/runtime/tests/fill-cdp.spec.ts` — JSDOM으로 `handleFill`이 `eventSequences`에 `typeText`/`pressKey`/`selectAll` 등 새 메서드를 호출하는지 검증.
  - `packages/browser/tests/cdp-input.spec.ts` — `cdp-driver.handleCdpRequest`가 `Input.insertText`/`Input.dispatchKeyEvent`를 그대로 포워딩하는 smoke test (mock connection).

E2E(실제 Chrome)는 QUAL-01이 프레임워크를 준비한 뒤 커버. 이번 phase에선 단위 테스트 + manual 확인.

## 8. 리스크 / 알려진 이슈

1. **Headless focus drop:** `--headless=new`에서 focus가 자동으로 다른 탭에 뺏기는 버그 — `element.focus({ preventScroll: true })` + `if (document.activeElement !== element) throw FOCUS_FAILED`.
2. **Meta vs Ctrl:** macOS는 Meta+A, 나머지는 Ctrl+A. `navigator.platform`으로 분기하거나, CDP `commands: ['selectAll']` 힌트에 위임.
3. **5초 타임아웃:** 긴 텍스트(1000자)를 글자별로 치면 5초를 넘길 수 있음. `keystroke` 전략은 내부에서 `keyDown/keyUp` 한 라운드당 한 번의 CDP request. 1000자 × 2 = 2000 요청 → 문제 될 수 있음. 대안: `Input.insertText`를 기본으로, 마스크 라이브러리가 감지된 경우만 `keystroke`. 1000자 masked는 비현실적이라 현실적 한계.
4. **`deps.eventSequences` 확장:** 새 메서드(`typeText`, `pressKey`, `selectAll`, `deleteSelection`) 추가 → `page-agent-runtime`에서 `createEventSequences`가 자동으로 노출. 기존 메서드 유지.

## 9. 합의된 변경 목록 (plans가 참고할 단일 소스)

**파일 수정:**
- `packages/core/src/index.ts` — `FillCommandRequest`에 `clear`, `strategy` 필드 추가. `ActionKind`·`CommandKind`는 변경 없음.
- `packages/runtime/src/runtime/event-sequences.ts` — `typeText(text)`, `pressKey(key, modifiers?)`, `selectAll()`, `deleteSelection()` 추가.
- `packages/runtime/src/runtime/dom-utils.ts` — `isContentEditableElement` 추가, `isFillableElement` 시그니처 확장하지 않고 별도 `canReceiveTextInput` 헬퍼 추가 (or 확장 — 최종 결정은 plan-01에서).
- `packages/runtime/src/runtime/command-handlers.ts` — `handleFill` 재작성 + `setElementValue`는 "legacy DOM setter fallback"로 축소 (private, dev-only).
- `packages/mcp/src/tools.ts`·`packages/mcp/src/mcp-tools.ts` — `agrune_fill` inputSchema에 `clear`, `strategy` 필드.
- `packages/browser/src/cdp-driver.ts` — 변경 없음(이미 임의 CDP 메서드 포워딩).

**신규 테스트:**
- `packages/runtime/tests/fill-cdp.spec.ts`
- `packages/browser/tests/cdp-input.spec.ts` (smoke, 옵션)

**합의 미해결 (planner 재량):**
- `isFillableElement` 확장 vs `canReceiveTextInput` 추가 중 하나 — planner가 선택.
- masked 감지 heuristic의 구체 규칙 — planner가 단일 구현체를 선택.

## RESEARCH COMPLETE
