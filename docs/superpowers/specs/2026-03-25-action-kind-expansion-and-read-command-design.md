# ActionKind 확장 및 agrune_read 커맨드 설계

## 개요

agrune의 인터랙션 커버리지를 확장한다. 현재 `click`과 `fill`만 지원하는 ActionKind에 4개 액션 타입을 추가하고, 페이지 콘텐츠를 마크다운으로 추출하는 `agrune_read` 커맨드를 신규 도입한다.

## 동기

- 테스트 페이지 칸반 카드에 더블클릭 액션이 추가되었으나 현재 시스템으로는 트리거할 수 없음
- 복잡한 웹앱에서는 우클릭(컨텍스트 메뉴), 호버, 롱프레스 등 다양한 인터랙션이 필수
- 에이전트가 페이지를 분석하려면 visible content를 읽을 수 있어야 하나, 현재 `agrune_snapshot`은 어노테이션된 타겟 정보만 반환

## 설계 범위

1. **ActionKind 확장**: `dblclick`, `contextmenu`, `hover`, `longpress` 추가
2. **`agrune_act` 확장**: `action` 파라미터 추가 (기본값 `click`, 하위호환 유지)
3. **`agrune_read` 커맨드**: 페이지 visible content를 마크다운으로 추출하는 새 MCP 툴

---

## 1. ActionKind 확장

### 타입 변경

```typescript
// packages/core/src/index.ts
export type ActionKind = 'click' | 'fill' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'

// packages/build-core/src/types.ts
export type AgagruneSupportedAction = 'click' | 'fill' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'
```

### 어노테이션 사용법

```html
<div data-agrune-action="dblclick" data-agrune-name="Edit Task" ...>
<div data-agrune-action="contextmenu" data-agrune-name="Task Context Menu" ...>
<div data-agrune-action="hover" data-agrune-name="Show Tooltip" ...>
<div data-agrune-action="longpress" data-agrune-name="Select Mode" ...>
```

### MCP 툴 변경: `agrune_act`

기존 `agrune_act`에 `action` 파라미터를 추가한다. 기본값은 `click`으로 하위호환을 유지한다.

```typescript
// packages/mcp-server/src/tools.ts - agrune_act inputSchema
{
  type: 'object',
  properties: {
    tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
    targetId: { type: 'string', description: 'The target element ID from the page snapshot.' },
    action: {
      type: 'string',
      enum: ['click', 'dblclick', 'contextmenu', 'hover', 'longpress'],
      description: 'Interaction type to perform on the target. Defaults to click.',
    },
  },
  required: ['targetId'],
}
```

### 런타임 이벤트 시퀀스

각 액션별로 디스패치하는 브라우저 이벤트 시퀀스 (W3C UI Events 스펙 준수):

| 액션 | 이벤트 시퀀스 |
|------|--------------|
| `click` | pointerdown → mousedown → pointerup → mouseup → click(`detail:1`) (기존 `performPointerClickSequence`) |
| `dblclick` | pointerdown → mousedown → pointerup → mouseup → click(`detail:1`) → pointerdown → mousedown → pointerup → mouseup → click(`detail:2`) → dblclick |
| `contextmenu` | pointerdown(`button:2`) → mousedown(`button:2`) → pointerup(`button:2`) → mouseup(`button:2`) → contextmenu |
| `hover` | pointerover → pointerenter → mouseover → mouseenter (클릭 없음) |
| `longpress` | pointerdown → mousedown → (500ms 대기) → pointerup → mouseup (click 이벤트 없음) |

**주요 이벤트 속성:**
- `dblclick`: 두 번째 click 이벤트의 `detail` 속성을 `2`로 설정. React 등 프레임워크가 `detail`을 검사하므로 필수.
- `contextmenu`: 모든 마우스/포인터 이벤트의 `button`을 `2`(우클릭)로 설정.
- `hover`: W3C 표준 순서 — pointer 계열(`pointerover` → `pointerenter`) 후 mouse 계열(`mouseover` → `mouseenter`).
- `longpress`: `mousedown`은 `pointerdown` 직후 발생. 홀드 후 릴리스 시 `click` 이벤트를 발생시키지 않음 (의도적 — 롱프레스와 클릭은 별개 인터랙션).

각 시퀀스는 `page-agent-runtime.ts`에 별도 함수로 구현한다:
- `performPointerClickSequence()` — 기존 유지
- `performPointerDblClickSequence()` — 신규
- `performContextMenuSequence()` — 신규
- `performHoverSequence()` — 신규
- `performLongPressSequence()` — 신규 (async, 500ms 대기 포함)

### `PageAgentRuntime.act` 입력 타입 변경

현재 `act()` 메서드의 input 타입에 `action` 필드가 없다. 확장이 필요하다:

```typescript
// packages/build-core/src/runtime/page-agent-runtime.ts - PageAgentRuntime 인터페이스
act: (input: {
  commandId?: string
  targetId: string
  action?: 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'  // 신규
  expectedVersion?: number
  config?: Partial<AgagruneRuntimeConfig>
}) => Promise<CommandResult>
```

### actionKind 가드 로직 변경

현재 act 핸들러에 `descriptor.actionKind !== 'click'` 가드가 있어 새 액션 타입을 가진 타겟을 거부한다. 이를 **action 파라미터와 어노테이션의 actionKind가 일치하는지** 검증하는 로직으로 교체한다:

```typescript
// page-agent-runtime.ts - act() 핸들러 내부

// 1. action 결정: 파라미터 > 어노테이션 기본값
const action = input.action ?? 'click'

// 2. 유효성 검증: 어노테이션된 actionKind와 요청된 action이 일치하는지 확인
//    fill 타겟에는 act 커맨드를 보낼 수 없음 (fill은 agrune_fill로 처리)
const ACT_COMPATIBLE_KINDS = ['click', 'dblclick', 'contextmenu', 'hover', 'longpress'] as const
if (!ACT_COMPATIBLE_KINDS.includes(descriptor.actionKind as any)) {
  return buildErrorResult(...)
}

// 3. action과 actionKind 불일치 경고는 하지 않음
//    에이전트가 dblclick 어노테이션 타겟에 click을 보낼 수도 있고,
//    click 어노테이션 타겟에 contextmenu를 보낼 수도 있음 (유연성)
```

**설계 결정: action과 actionKind의 관계**
- `action` 파라미터는 "어떤 인터랙션을 수행할지"를 결정
- `actionKind` 어노테이션은 "이 요소의 주요 인터랙션이 무엇인지" LLM에게 알려주는 힌트
- 에이전트는 어노테이션과 다른 action을 보낼 수 있음 (예: click 타겟에 contextmenu)
- 단, `fill` 타겟에는 act 커맨드를 거부 (`agrune_fill` 사용 유도)

### act 핸들러 분기

```typescript
// page-agent-runtime.ts - act() 핸들러 내부 (가드 통과 후)
switch (action) {
  case 'click':
    performPointerClickSequence(element)
    break
  case 'dblclick':
    performPointerDblClickSequence(element)
    break
  case 'contextmenu':
    performContextMenuSequence(element)
    break
  case 'hover':
    performHoverSequence(element)
    break
  case 'longpress':
    await performLongPressSequence(element)
    break
}
```

### DOM 스캐너 변경

`dom-scanner.ts`의 `ScannedTarget.actionKind` 타입이 확장된 `ActionKind`를 따르도록 변경하고, 런타임 유효성 검사를 추가한다:

```typescript
// packages/extension/src/content/dom-scanner.ts
import type { ActionKind } from '@agrune/core'

const VALID_ACTION_KINDS: Set<string> = new Set(['click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress'])

export interface ScannedTarget {
  // ...
  actionKind: ActionKind
}

// scanAnnotations() 내부 - 타입 단언 대신 런타임 검증
const rawAction = el.getAttribute('data-agrune-action') ?? ''
if (!VALID_ACTION_KINDS.has(rawAction)) return  // 잘못된 값은 스킵
const action = rawAction as ActionKind
```

### backend 변경

`backend.ts`는 `agrune_act` 케이스에서 `action` 파라미터를 커맨드에 그대로 전달한다. 현재 구조에서 `args`를 spread하여 command를 생성하므로 별도 처리 불필요:

```typescript
// backend.ts - 기존 코드가 이미 동작 (agrune_act)
const command: Record<string, unknown> & { kind: string } = {
  kind: name.replace('agrune_', ''),
  ...args,  // action 파라미터 자동 포함
}
```

`agrune_read`도 동일한 케이스 블록(`agrune_act | agrune_fill | ... | agrune_read`)에 추가한다. `name.replace('agrune_', '')` → `'read'`로 변환되어 기존 파이프라인을 그대로 탄다:

```typescript
// backend.ts - switch 케이스에 agrune_read 추가
case 'agrune_act':
case 'agrune_fill':
case 'agrune_drag':
case 'agrune_wait':
case 'agrune_guide':
case 'agrune_read': {  // 추가
  // ... 기존 로직 동일
}
```

### `agrune_act` 툴 설명 변경

`action` 파라미터 추가에 따라 툴 설명도 업데이트한다:

```typescript
// 기존: 'Click on a target element identified by its targetId from the page snapshot.'
// 변경:
description: 'Perform an interaction (click, dblclick, contextmenu, hover, longpress) on a target element. Defaults to click.'
```

---

## 2. `agrune_read` 커맨드

### 설계 원칙

- 어노테이션 시스템과 **독립적**으로 동작 (어노테이션 없는 페이지에서도 작동)
- 페이지의 visible content를 **구조화된 마크다운**으로 변환
- CSS 셀렉터로 추출 범위를 지정할 수 있음

### MCP 툴 정의

```typescript
{
  name: 'agrune_read',
  description: 'Extract visible page content as structured markdown.',
  inputSchema: {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: 'Browser tab ID. Defaults to the first active session.' },
      selector: { type: 'string', description: 'CSS selector to scope extraction. Defaults to document.body.' },
    },
  },
}
```

### core 타입 추가

```typescript
// packages/core/src/index.ts
export type CommandKind = 'act' | 'drag' | 'fill' | 'wait' | 'guide' | 'read'

export interface ReadCommandRequest extends BaseCommandRequest {
  kind: 'read'
  selector?: string
  expectedVersion?: number  // 다른 커맨드와 일관성 유지
}

export type CommandRequest =
  | ActCommandRequest
  | DragCommandRequest
  | GuideCommandRequest
  | FillCommandRequest
  | WaitCommandRequest
  | ReadCommandRequest
```

### DOM → 마크다운 변환 규칙

| HTML 요소 | 마크다운 출력 |
|-----------|-------------|
| `<h1>` ~ `<h6>` | `#` ~ `######` |
| `<p>` | 일반 텍스트 + 빈 줄 |
| `<ul>/<ol>` + `<li>` | `- item` / `1. item` |
| `<table>` | 마크다운 테이블 (`\| col \| col \|`) |
| `<a>` | `[text](href)` |
| `<img>` | `![alt](src)` |
| `<input>/<select>` | `[input: value]` / `[select: selected option]` |
| `<strong>/<em>` | `**bold**` / `*italic*` |
| `<code>/<pre>` | 인라인 `` `code` `` / 펜스드 코드 블록 |
| 기타 블록 요소 (`<div>`, `<section>`) | 내부 텍스트 재귀 추출 |

### 필터링 규칙

**제외 대상:**
- `display: none`, `visibility: hidden`, `opacity: 0` 요소
- `<script>`, `<style>`, `<noscript>`, `<template>` 태그
- `aria-hidden="true"` 요소
- 크기 0인 요소 (width/height = 0)

**포함 대상:**
- 뷰포트 밖이더라도 스크롤하면 보이는 콘텐츠는 포함 (페이지 전체 분석 목적)
- `<iframe>` 내부는 1차에서 제외 (same-origin이어도 범위 확장 우려)

### 커맨드 흐름

```
agrune_read({ selector? })
  ↓
MCP Backend.handleToolCall()
  ↓
CommandQueue.enqueue(tabId, { kind: 'read', selector })
  ↓
Extension → Content Script → page-runtime
  ↓
window.agruneDom.read({ selector })
  ↓
런타임: root 요소 결정 → DOM 재귀 순회 → visible 필터링 → 마크다운 변환
  ↓
CommandResult { ok: true, result: { markdown: "# Page Title\n..." } }
  ↓
MCP 응답으로 마크다운 문자열 반환
```

### 출력 크기 제한

복잡한 웹앱은 거대한 DOM 트리를 가질 수 있다. LLM 컨텍스트와 MCP 응답 크기를 고려하여 제한을 둔다:

- **기본 최대 크기**: 50,000자 (약 12,500 토큰)
- 초과 시 마크다운 끝에 `\n\n[truncated — use selector to read specific sections]` 메시지 추가
- 셀렉터로 범위를 좁히면 해당 영역만 추출하므로 실질적으로 제한에 걸리지 않음

### 결과 형태

```typescript
// CommandResult.result
{
  markdown: "# 칸반 보드\n\n## To Do (3)\n\n- 로그인 페이지 디자인\n- API 엔드포인트 설계\n...",
  truncated: false,        // 잘림 여부
  charCount: 1234,         // 실제 문자 수
}
```

### DOM→마크다운 변환 로직 위치

변환 로직은 `page-agent-runtime.ts`에 `read()` 메서드로 구현한다. `page-runtime.ts`는 브릿지 역할만 하며, `window.agruneDom.read(args)`를 호출하여 런타임으로 위임한다.

```typescript
// packages/build-core/src/runtime/page-agent-runtime.ts
read: async (input) => {
  const root = input.selector
    ? document.querySelector(input.selector)
    : document.body
  if (!root) {
    return buildErrorResult(input.commandId, 'TARGET_NOT_FOUND', `selector not found: ${input.selector}`, ...)
  }
  const markdown = domToMarkdown(root)  // 재귀 순회 + 변환
  const truncated = markdown.length > MAX_READ_CHARS
  const result = truncated
    ? markdown.slice(0, MAX_READ_CHARS) + '\n\n[truncated — use selector to read specific sections]'
    : markdown
  return buildSuccessResult(input.commandId, captureSnapshot(), {
    markdown: result,
    truncated,
    charCount: markdown.length,
  })
}
```

---

## 변경 대상 파일 요약

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/index.ts` | `ActionKind` 확장, `CommandKind`에 `read` 추가, `ReadCommandRequest` 추가 |
| `packages/build-core/src/types.ts` | `AgagruneSupportedAction` 확장 |
| `packages/build-core/src/runtime/page-agent-runtime.ts` | `PageAgentRuntime.act` 입력 타입에 `action` 필드 추가, actionKind 가드 로직 변경, 4개 이벤트 시퀀스 함수 추가, act 핸들러 분기, `read()` 핸들러 + DOM→마크다운 변환 로직 |
| `packages/extension/src/content/dom-scanner.ts` | `ScannedTarget.actionKind` 타입을 `ActionKind`로 변경, 런타임 유효성 검증 추가 |
| `packages/extension/src/runtime/page-runtime.ts` | `read` 커맨드를 `window.agruneDom.read()`로 위임 (브릿지 역할) |
| `packages/mcp-server/src/tools.ts` | `agrune_act` 스키마에 `action` 파라미터 추가 + 설명 변경, `agrune_read` 툴 정의 추가 |
| `packages/mcp-server/src/backend.ts` | switch 케이스에 `agrune_read` 추가 (기존 커맨드 파이프라인 재사용) |

## 제외된 후보와 이유

| 후보 | 제외 이유 |
|------|----------|
| `select` | 네이티브 `<select>`는 `fill`로 처리 가능. 커스텀 드롭다운은 click → snapshot → click으로 에이전트가 해결 |
| `toggle` | 실행이 `click`과 동일. 별도 이벤트 시퀀스 없음 |
| `keypress` | 요소 중심 어노테이션 모델에 부적합. 페이지/컨텍스트 레벨 액션 |
| `focus` | 다른 액션에서 암시적으로 발생. 독립 액션으로서 실용적 케이스 부족 |
| `read` 어노테이션 | 모든 텍스트가 읽기 대상이라 어노테이션 경계가 모호. AI 자동 어노테이션 규칙 수립 어려움 |
