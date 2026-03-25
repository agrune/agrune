# ActionKind 확장 및 agrune_read 커맨드 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ActionKind에 dblclick/contextmenu/hover/longpress를 추가하고, 페이지 visible content를 마크다운으로 추출하는 agrune_read 커맨드를 도입한다.

**Architecture:** 변경은 3개 레이어로 나뉜다. (1) core 타입 확장 → (2) MCP 툴/백엔드 확장 → (3) 런타임 이벤트 시퀀스 구현 + DOM→마크다운 변환. 각 레이어는 하위 레이어에 의존하므로 순서대로 진행한다.

**Tech Stack:** TypeScript, pnpm monorepo, vitest, Chrome Extension (Manifest V3), MCP SDK

**Spec:** `docs/superpowers/specs/2026-03-25-action-kind-expansion-and-read-command-design.md`

---

## File Map

| 파일 | 역할 | 변경 |
|------|------|------|
| `packages/core/src/index.ts` | 공유 타입 | ActionKind/CommandKind 확장, ActCommandRequest에 action 필드, ReadCommandRequest 추가 |
| `packages/build-core/src/types.ts` | 빌드 타입 | AgagruneSupportedAction 확장 |
| `packages/extension/src/content/dom-scanner.ts` | DOM 스캐너 | actionKind 타입 확장 + 런타임 검증 |
| `packages/mcp-server/src/tools.ts` | MCP 툴 스키마 (레거시) | agrune_act에 action 파라미터, agrune_read 추가 |
| `packages/mcp-server/src/mcp-tools.ts` | MCP 툴 등록 (Zod) | agrune_act에 action 파라미터, agrune_read 등록 |
| `packages/mcp-server/src/backend.ts` | 백엔드 핸들러 | switch에 agrune_read 추가 |
| `packages/build-core/src/runtime/page-agent-runtime.ts` | 런타임 | 인터페이스 확장, 가드 로직, 이벤트 헬퍼, 시퀀스 함수, read 핸들러 |
| `packages/mcp-server/tests/tools.spec.ts` | 툴 정의 테스트 | 새 툴/파라미터 검증 |
| `packages/mcp-server/tests/backend.spec.ts` | 백엔드 테스트 | agrune_read 통합 테스트 |

---

### Task 1: Core 타입 확장

**Files:**
- Modify: `packages/core/src/index.ts:16-19` (ActionKind, CommandKind)
- Modify: `packages/core/src/index.ts:100-139` (ActCommandRequest, CommandRequest)
- Modify: `packages/build-core/src/types.ts:9` (AgagruneSupportedAction)

- [ ] **Step 1: ActionKind 확장**

`packages/core/src/index.ts` line 16:

```typescript
// 기존:
export type ActionKind = 'click' | 'fill'
// 변경:
export type ActionKind = 'click' | 'fill' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'
```

- [ ] **Step 2: CommandKind에 read 추가**

`packages/core/src/index.ts` line 19:

```typescript
// 기존:
export type CommandKind = 'act' | 'drag' | 'fill' | 'wait' | 'guide'
// 변경:
export type CommandKind = 'act' | 'drag' | 'fill' | 'wait' | 'guide' | 'read'
```

- [ ] **Step 3: ActCommandRequest에 action 필드 추가**

`packages/core/src/index.ts` line 100-104:

```typescript
export interface ActCommandRequest extends BaseCommandRequest {
  kind: 'act'
  targetId: string
  action?: 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'
  expectedVersion?: number
}
```

- [ ] **Step 4: ReadCommandRequest 추가**

`packages/core/src/index.ts` line 132 뒤 (WaitCommandRequest 다음에):

```typescript
export interface ReadCommandRequest extends BaseCommandRequest {
  kind: 'read'
  selector?: string
  expectedVersion?: number
}
```

- [ ] **Step 5: CommandRequest 유니온에 ReadCommandRequest 추가**

`packages/core/src/index.ts` CommandRequest 타입:

```typescript
export type CommandRequest =
  | ActCommandRequest
  | DragCommandRequest
  | GuideCommandRequest
  | FillCommandRequest
  | WaitCommandRequest
  | ReadCommandRequest
```

- [ ] **Step 6: AgagruneSupportedAction 확장**

`packages/build-core/src/types.ts` line 9:

```typescript
// 기존:
export type AgagruneSupportedAction = 'click' | 'fill'
// 변경:
export type AgagruneSupportedAction = 'click' | 'fill' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'
```

- [ ] **Step 7: 빌드 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm build
```

Expected: 빌드 성공 (타입만 확장했으므로 기존 코드 호환)

- [ ] **Step 8: 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add packages/core/src/index.ts packages/build-core/src/types.ts && git commit -m "feat: expand ActionKind and CommandKind types for new action types and read command"
```

---

### Task 2: DOM 스캐너 — 새 액션 타입 인식 + 런타임 검증

**Files:**
- Modify: `packages/extension/src/content/dom-scanner.ts:1-55`

- [ ] **Step 1: actionKind 타입을 ActionKind import로 변경하고 런타임 검증 추가**

`packages/extension/src/content/dom-scanner.ts` 전체 수정:

파일 상단에 import 추가:
```typescript
import type { ActionKind } from '@agrune/core'
```

`ScannedTarget` 인터페이스에서 actionKind 타입 변경:
```typescript
export interface ScannedTarget {
  targetId: string
  selector: string
  name: string
  description: string
  actionKind: ActionKind  // 기존: 'click' | 'fill'
  groupId?: string
  sensitive: boolean
}
```

`scanAnnotations()` 내부에서 타입 단언을 런타임 검증으로 교체:

```typescript
const VALID_ACTION_KINDS: Set<string> = new Set([
  'click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress',
])

export function scanAnnotations(doc: Document): ScannedTarget[] {
  const elements = doc.querySelectorAll<HTMLElement>('[data-agrune-action]')
  const targets: ScannedTarget[] = []

  elements.forEach((el, index) => {
    const rawAction = el.getAttribute('data-agrune-action') ?? ''
    if (!VALID_ACTION_KINDS.has(rawAction)) return  // 잘못된 값은 스킵
    const action = rawAction as ActionKind

    const name = el.getAttribute('data-agrune-name') ?? ''
    const description = el.getAttribute('data-agrune-desc') ?? ''
    const key = el.getAttribute('data-agrune-key')
    const sensitive = el.hasAttribute('data-agrune-sensitive')

    const targetId = key ?? `agrune_${index}`
    const selector = key
      ? `[data-agrune-key="${key}"]`
      : name
        ? `[data-agrune-name="${name}"]`
        : `[data-agrune-action]`

    const groupEl = el.closest<HTMLElement>('[data-agrune-group]')
    const groupId = groupEl?.getAttribute('data-agrune-group') ?? undefined

    targets.push({
      targetId,
      selector,
      name,
      description,
      actionKind: action,
      groupId,
      sensitive,
    })
  })

  return targets
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm build
```

Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add packages/extension/src/content/dom-scanner.ts && git commit -m "feat: validate action kinds at scan time and accept new action types"
```

---

### Task 3: MCP 툴 정의 확장 — agrune_act action 파라미터 + agrune_read

**Files:**
- Modify: `packages/mcp-server/src/tools.ts:48-58` (agrune_act), 끝에 agrune_read 추가
- Modify: `packages/mcp-server/src/mcp-tools.ts:46-54` (agrune_act), 끝에 agrune_read 추가
- Test: `packages/mcp-server/tests/tools.spec.ts`

- [ ] **Step 1: 실패 테스트 작성 — tools.spec.ts에 새 검증 추가**

`packages/mcp-server/tests/tools.spec.ts`에 기존 테스트 수정 및 추가:

tool count 테스트 수정 (기존 line 7-18):
```typescript
  it('defines all 9 required tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toEqual([
      'agrune_sessions',
      'agrune_snapshot',
      'agrune_act',
      'agrune_fill',
      'agrune_drag',
      'agrune_wait',
      'agrune_guide',
      'agrune_config',
      'agrune_read',
    ])
  })
```

agrune_act 테스트 수정 (기존 line 31-34):
```typescript
  it('agrune_act requires targetId and has optional action enum', () => {
    const act = tools.find((t) => t.name === 'agrune_act')!
    expect(act.inputSchema.required).toContain('targetId')
    const actionProp = act.inputSchema.properties?.action as Record<string, unknown>
    expect(actionProp.enum).toEqual(['click', 'dblclick', 'contextmenu', 'hover', 'longpress'])
  })
```

새 테스트 추가:
```typescript
  it('agrune_read has optional selector', () => {
    const read = tools.find((t) => t.name === 'agrune_read')!
    expect(read.inputSchema.properties).toHaveProperty('selector')
    expect(read.inputSchema.required ?? []).not.toContain('selector')
  })
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm --filter @agrune/mcp-server test
```

Expected: FAIL — 아직 agrune_read가 없고, agrune_act에 action 파라미터 없음

- [ ] **Step 3: tools.ts 수정 — agrune_act에 action 파라미터 + 설명 변경**

`packages/mcp-server/src/tools.ts` agrune_act 정의 (line 48-58):

```typescript
    {
      name: 'agrune_act',
      description: 'Perform an interaction (click, dblclick, contextmenu, hover, longpress) on a target element. Defaults to click.',
      inputSchema: {
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
      },
    },
```

- [ ] **Step 4: tools.ts 수정 — agrune_read 추가**

`packages/mcp-server/src/tools.ts` agrune_config 다음에 추가:

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
    },
```

- [ ] **Step 5: mcp-tools.ts 수정 — agrune_act에 action 파라미터 + 설명 변경**

`packages/mcp-server/src/mcp-tools.ts` agrune_act 등록 (line 46-54):

```typescript
  mcp.tool(
    'agrune_act',
    'Perform an interaction (click, dblclick, contextmenu, hover, longpress) on a target element by targetId. Defaults to click. When ok:true is returned, do not re-snapshot to verify.',
    {
      targetId: z.string().describe('Target ID'),
      action: z.enum(['click', 'dblclick', 'contextmenu', 'hover', 'longpress']).optional().describe('Interaction type (default: click)'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_act', args)),
  )
```

- [ ] **Step 6: mcp-tools.ts 수정 — agrune_read 등록**

`packages/mcp-server/src/mcp-tools.ts` agrune_config 등록 다음에 추가:

```typescript
  mcp.tool(
    'agrune_read',
    'Extract visible page content as structured markdown. Use selector to scope extraction to a specific area.',
    {
      selector: z.string().optional().describe('CSS selector to scope extraction (default: full page)'),
      ...optionalTabId,
    },
    async (args) => toMcpToolResult(await handleToolCall('agrune_read', args)),
  )
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm --filter @agrune/mcp-server test
```

Expected: PASS

- [ ] **Step 8: 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add packages/mcp-server/src/tools.ts packages/mcp-server/src/mcp-tools.ts packages/mcp-server/tests/tools.spec.ts && git commit -m "feat: add action parameter to agrune_act and new agrune_read tool definition"
```

---

### Task 4: 백엔드 — agrune_read 케이스 추가

**Files:**
- Modify: `packages/mcp-server/src/backend.ts:90-108` (switch 케이스)

- [ ] **Step 1: backend.ts switch에 agrune_read 추가**

`packages/mcp-server/src/backend.ts` line 93-94 사이에 `'agrune_read'` 추가:

```typescript
      case 'agrune_act':
      case 'agrune_fill':
      case 'agrune_drag':
      case 'agrune_wait':
      case 'agrune_guide':
      case 'agrune_read': {
```

기존 내부 로직은 그대로. `name.replace('agrune_', '')` → `'read'`가 되어 커맨드 파이프라인을 탄다.

- [ ] **Step 2: 빌드 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm build
```

Expected: 빌드 성공

- [ ] **Step 3: 기존 테스트 통과 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm --filter @agrune/mcp-server test
```

Expected: PASS

- [ ] **Step 4: 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add packages/mcp-server/src/backend.ts && git commit -m "feat: route agrune_read through command pipeline"
```

---

### Task 5: 런타임 — 이벤트 헬퍼 함수에 옵셔널 파라미터 추가

**Files:**
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts:1216-1263` (dispatchMouseLikeEvent, dispatchPointerLikeEvent)

- [ ] **Step 1: dispatchMouseLikeEvent에 options 파라미터 추가**

`packages/build-core/src/runtime/page-agent-runtime.ts` line 1216-1236:

```typescript
function dispatchMouseLikeEvent(
  target: EventTarget,
  type: string,
  coords: PointerCoords,
  buttons: number,
  bubbles: boolean,
  options?: { button?: number; detail?: number },
): void {
  const event = new MouseEvent(type, {
    bubbles,
    button: options?.button ?? 0,
    buttons,
    cancelable: true,
    clientX: coords.clientX,
    clientY: coords.clientY,
    composed: true,
    detail: options?.detail ?? 1,
    screenX: coords.clientX,
    screenY: coords.clientY,
  })
  target.dispatchEvent(event)
}
```

- [ ] **Step 2: dispatchPointerLikeEvent에 options 파라미터 추가**

`packages/build-core/src/runtime/page-agent-runtime.ts` line 1238-1263:

```typescript
function dispatchPointerLikeEvent(
  target: EventTarget,
  type: string,
  coords: PointerCoords,
  buttons: number,
  bubbles: boolean,
  options?: { button?: number },
): void {
  if (typeof window.PointerEvent !== 'function') return

  const event = new window.PointerEvent(type, {
    bubbles,
    button: options?.button ?? 0,
    buttons,
    cancelable: true,
    clientX: coords.clientX,
    clientY: coords.clientY,
    composed: true,
    isPrimary: true,
    pointerId: DRAG_POINTER_ID,
    pointerType: 'mouse',
    pressure: buttons === 0 ? 0 : 0.5,
    screenX: coords.clientX,
    screenY: coords.clientY,
  })
  target.dispatchEvent(event)
}
```

- [ ] **Step 3: performPointerClickSequence — element.click()을 수동 디스패치로 교체**

`packages/build-core/src/runtime/page-agent-runtime.ts` line 1378-1391:

```typescript
function performPointerClickSequence(element: HTMLElement): void {
  const coords = getInteractablePoint(element)
  const pressTarget = getEventTargetAtPoint(element, coords)

  dispatchHoverTransition(null, pressTarget, coords, 0)
  dispatchPointerLikeEvent(pressTarget, 'pointermove', coords, 0, true)
  dispatchMouseLikeEvent(pressTarget, 'mousemove', coords, 0, true)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 1, true)
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 1, true)
  const releaseTarget = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget, 'mouseup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget, 'click', coords, 0, true, { detail: 1 })
}
```

주의: 마지막 줄이 `element.click()` → `dispatchMouseLikeEvent(releaseTarget, 'click', ...)` 로 변경됨.

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm build
```

Expected: 빌드 성공. 기존 호출부에 영향 없음 (options가 옵셔널).

- [ ] **Step 5: 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add packages/build-core/src/runtime/page-agent-runtime.ts && git commit -m "refactor: add optional button/detail params to event dispatch helpers"
```

---

### Task 6: 런타임 — 4개 이벤트 시퀀스 함수 구현

**Files:**
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts` (performPointerClickSequence 다음에 추가)

- [ ] **Step 1: performPointerDblClickSequence 구현**

`performPointerClickSequence` 바로 다음에 추가:

```typescript
function performPointerDblClickSequence(element: HTMLElement): void {
  const coords = getInteractablePoint(element)
  const pressTarget = getEventTargetAtPoint(element, coords)

  // First click (detail: 1)
  dispatchHoverTransition(null, pressTarget, coords, 0)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 1, true)
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 1, true)
  const releaseTarget1 = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget1, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget1, 'mouseup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget1, 'click', coords, 0, true, { detail: 1 })

  // Second click (detail: 2)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 1, true)
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 1, true, { detail: 2 })
  const releaseTarget2 = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget2, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget2, 'mouseup', coords, 0, true, { detail: 2 })
  dispatchMouseLikeEvent(releaseTarget2, 'click', coords, 0, true, { detail: 2 })

  // dblclick event
  dispatchMouseLikeEvent(releaseTarget2, 'dblclick', coords, 0, true, { detail: 2 })
}
```

- [ ] **Step 2: performContextMenuSequence 구현**

```typescript
function performContextMenuSequence(element: HTMLElement): void {
  const coords = getInteractablePoint(element)
  const pressTarget = getEventTargetAtPoint(element, coords)

  dispatchHoverTransition(null, pressTarget, coords, 0)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 2, true, { button: 2 })
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 2, true, { button: 2 })
  const releaseTarget = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget, 'pointerup', coords, 0, true, { button: 2 })
  dispatchMouseLikeEvent(releaseTarget, 'mouseup', coords, 0, true, { button: 2 })
  dispatchMouseLikeEvent(releaseTarget, 'contextmenu', coords, 0, true, { button: 2 })
}
```

- [ ] **Step 3: performHoverSequence 구현**

```typescript
function performHoverSequence(element: HTMLElement): void {
  const coords = getInteractablePoint(element)
  const target = getEventTargetAtPoint(element, coords)

  dispatchPointerLikeEvent(target, 'pointerover', coords, 0, true)
  dispatchPointerLikeEvent(target, 'pointerenter', coords, 0, false)
  dispatchMouseLikeEvent(target, 'mouseover', coords, 0, true)
  dispatchMouseLikeEvent(target, 'mouseenter', coords, 0, false)
}
```

- [ ] **Step 4: performLongPressSequence 구현**

```typescript
async function performLongPressSequence(element: HTMLElement): Promise<void> {
  const coords = getInteractablePoint(element)
  const pressTarget = getEventTargetAtPoint(element, coords)

  dispatchHoverTransition(null, pressTarget, coords, 0)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 1, true)
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 1, true)

  await sleep(500)

  const releaseTarget = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget, 'mouseup', coords, 0, true)
  // click 이벤트 의도적 생략 — longpress는 click과 별개
}
```

- [ ] **Step 5: 빌드 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm build
```

Expected: 빌드 성공

- [ ] **Step 6: 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add packages/build-core/src/runtime/page-agent-runtime.ts && git commit -m "feat: implement dblclick, contextmenu, hover, longpress event sequences"
```

---

### Task 7: 런타임 — act 핸들러 확장 (인터페이스, 가드, 분기)

**Files:**
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts:71-111` (PageAgentRuntime 인터페이스)
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts:286-306` (collectDescriptors)
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts:1611-1656` (act 핸들러)
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts:1930-1938` (guide 핸들러)

- [ ] **Step 1: PageAgentRuntime 인터페이스 — act에 action 필드 추가**

`packages/build-core/src/runtime/page-agent-runtime.ts` line 75-80:

```typescript
  act: (input: {
    commandId?: string
    targetId: string
    action?: 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'
    expectedVersion?: number
    config?: Partial<AgagruneRuntimeConfig>
  }) => Promise<CommandResult>
```

- [ ] **Step 2: collectDescriptors 필터 확장**

`packages/build-core/src/runtime/page-agent-runtime.ts` line 292:

```typescript
// 기존:
if (tool.action !== 'click' && tool.action !== 'fill') continue
// 변경:
const VALID_ACTIONS = new Set(['click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress'])
if (!VALID_ACTIONS.has(tool.action)) continue
```

참고: `VALID_ACTIONS`를 함수 밖 모듈 레벨 상수로 빼도 됨. 함수가 매 호출마다 Set을 생성하지 않도록.

- [ ] **Step 3: act 핸들러 — actionKind 가드 변경 + action 분기**

`packages/build-core/src/runtime/page-agent-runtime.ts` act 핸들러 내부 (line 1618-1650):

기존 가드를 교체:
```typescript
// 기존 (line 1618-1620):
// if (descriptor.actionKind !== 'click') {
//   return buildErrorResult(...)
// }

// 변경:
const ACT_COMPATIBLE_KINDS = new Set(['click', 'dblclick', 'contextmenu', 'hover', 'longpress'])
if (!ACT_COMPATIBLE_KINDS.has(descriptor.actionKind)) {
  return buildErrorResult(input.commandId ?? input.targetId, 'INVALID_TARGET', `target does not support act: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
}

const action = input.action ?? 'click'
```

기존 `performPointerClickSequence(element)` 호출 부분을 action 분기로 교체 (line 1643-1650 영역):

```typescript
        if (config.pointerAnimation) {
          await queue.push({
            type: 'animation',
            execute: () => flashPointerOverlay(element, config, () => {
              switch (action) {
                case 'click': performPointerClickSequence(element); break
                case 'dblclick': performPointerDblClickSequence(element); break
                case 'contextmenu': performContextMenuSequence(element); break
                case 'hover': performHoverSequence(element); break
              }
            }),
          })
          // longpress는 async이므로 애니메이션 밖에서 처리
          if (action === 'longpress') {
            await performLongPressSequence(element)
          }
        } else {
          switch (action) {
            case 'click': performPointerClickSequence(element); break
            case 'dblclick': performPointerDblClickSequence(element); break
            case 'contextmenu': performContextMenuSequence(element); break
            case 'hover': performHoverSequence(element); break
            case 'longpress': await performLongPressSequence(element); break
          }
        }
```

결과 반환 부분 수정 (기존 `actionKind: 'click'`):
```typescript
        const nextSnapshot = captureSnapshot()
        return buildSuccessResult(input.commandId ?? input.targetId, nextSnapshot, {
          actionKind: action,
          targetId: input.targetId,
        })
```

- [ ] **Step 4: guide 핸들러 — actionKind 가드 변경**

`packages/build-core/src/runtime/page-agent-runtime.ts` line 1936-1938:

```typescript
// 기존:
// if (descriptor.actionKind !== 'click') {
//   return buildErrorResult(...)
// }

// 변경 (ACT_COMPATIBLE_KINDS는 이미 위에서 정의됨):
if (!ACT_COMPATIBLE_KINDS.has(descriptor.actionKind)) {
  return buildErrorResult(input.commandId ?? input.targetId, 'INVALID_TARGET', `target does not support guide: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
}
```

참고: `ACT_COMPATIBLE_KINDS`를 모듈 레벨 상수로 올려서 act/guide 핸들러 모두 사용.

- [ ] **Step 5: 빌드 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm build
```

Expected: 빌드 성공

- [ ] **Step 6: 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add packages/build-core/src/runtime/page-agent-runtime.ts && git commit -m "feat: extend act handler with action parameter dispatch and relax actionKind guards"
```

---

### Task 8: 런타임 — read 핸들러 + DOM→마크다운 변환

**Files:**
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts:71-111` (PageAgentRuntime 인터페이스에 read 추가)
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts` (read 핸들러 + domToMarkdown 함수)

- [ ] **Step 1: PageAgentRuntime 인터페이스에 read 메서드 추가**

`packages/build-core/src/runtime/page-agent-runtime.ts` guide 메서드 다음 (line 107 다음):

```typescript
  read: (input: {
    commandId?: string
    selector?: string
    expectedVersion?: number
  }) => Promise<CommandResult>
```

- [ ] **Step 2: domToMarkdown 헬퍼 함수 구현**

`performLongPressSequence` 다음에 구현:

```typescript
const MAX_READ_CHARS = 50_000

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG',
])

function isVisibleForRead(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none') return false
  if (style.visibility === 'hidden') return false
  if (style.opacity === '0') return false
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return false
  return true
}

function domToMarkdown(root: Element): string {
  const parts: string[] = []
  walkNode(root, parts, 0)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

function walkNode(node: Node, parts: string[], listDepth: number): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, ' ') ?? ''
    if (text.trim()) parts.push(text)
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as Element
  if (!isVisibleForRead(el)) return

  const tag = el.tagName

  // Headings
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    const text = el.textContent?.trim() ?? ''
    if (text) parts.push(`\n\n${'#'.repeat(level)} ${text}\n\n`)
    return
  }

  // Paragraph
  if (tag === 'P') {
    parts.push('\n\n')
    for (const child of el.childNodes) walkNode(child, parts, listDepth)
    parts.push('\n\n')
    return
  }

  // Lists
  if (tag === 'UL' || tag === 'OL') {
    parts.push('\n')
    let index = 1
    for (const child of el.children) {
      if (child.tagName === 'LI') {
        const indent = '  '.repeat(listDepth)
        const bullet = tag === 'UL' ? '- ' : `${index++}. `
        parts.push(`${indent}${bullet}`)
        for (const liChild of child.childNodes) walkNode(liChild, parts, listDepth + 1)
        parts.push('\n')
      }
    }
    parts.push('\n')
    return
  }

  // Table
  if (tag === 'TABLE') {
    const rows = el.querySelectorAll('tr')
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('th, td')
      const cellTexts = Array.from(cells).map(c => c.textContent?.trim() ?? '')
      parts.push(`| ${cellTexts.join(' | ')} |\n`)
      if (rowIndex === 0) {
        parts.push(`| ${cellTexts.map(() => '---').join(' | ')} |\n`)
      }
    })
    parts.push('\n')
    return
  }

  // Links
  if (tag === 'A') {
    const href = (el as HTMLAnchorElement).href
    const text = el.textContent?.trim() ?? ''
    if (text) parts.push(`[${text}](${href})`)
    return
  }

  // Images
  if (tag === 'IMG') {
    const alt = el.getAttribute('alt') ?? ''
    const src = (el as HTMLImageElement).src
    parts.push(`![${alt}](${src})`)
    return
  }

  // Inline formatting
  if (tag === 'STRONG' || tag === 'B') {
    parts.push('**')
    for (const child of el.childNodes) walkNode(child, parts, listDepth)
    parts.push('**')
    return
  }
  if (tag === 'EM' || tag === 'I') {
    parts.push('*')
    for (const child of el.childNodes) walkNode(child, parts, listDepth)
    parts.push('*')
    return
  }

  // Code
  if (tag === 'CODE') {
    const parent = el.parentElement
    if (parent?.tagName === 'PRE') {
      parts.push(`\n\n\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n\n`)
      return
    }
    parts.push(`\`${el.textContent?.trim() ?? ''}\``)
    return
  }
  if (tag === 'PRE') {
    // PRE with CODE child is handled by CODE case
    const codeChild = el.querySelector('code')
    if (codeChild) {
      walkNode(codeChild, parts, listDepth)
      return
    }
    parts.push(`\n\n\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n\n`)
    return
  }

  // Form elements
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement
    parts.push(`[input: ${input.value || input.placeholder || ''}]`)
    return
  }
  if (tag === 'SELECT') {
    const select = el as HTMLSelectElement
    const selected = select.options[select.selectedIndex]
    parts.push(`[select: ${selected?.text ?? ''}]`)
    return
  }
  if (tag === 'TEXTAREA') {
    const textarea = el as HTMLTextAreaElement
    parts.push(`[textarea: ${textarea.value || textarea.placeholder || ''}]`)
    return
  }

  // Block elements — add line breaks
  if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'MAIN' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'NAV' || tag === 'ASIDE') {
    parts.push('\n')
    for (const child of el.childNodes) walkNode(child, parts, listDepth)
    parts.push('\n')
    return
  }

  // BR
  if (tag === 'BR') {
    parts.push('\n')
    return
  }

  // HR
  if (tag === 'HR') {
    parts.push('\n\n---\n\n')
    return
  }

  // Default: recurse
  for (const child of el.childNodes) walkNode(child, parts, listDepth)
}
```

- [ ] **Step 3: read 핸들러 구현**

런타임 객체의 `guide` 핸들러 다음에 추가:

```typescript
    read: async (input) => {
      const root = input.selector
        ? document.querySelector(input.selector)
        : document.body
      if (!root) {
        const snapshot = captureSnapshot()
        return buildErrorResult(
          input.commandId ?? 'read',
          'TARGET_NOT_FOUND',
          `selector not found: ${input.selector}`,
          snapshot,
        )
      }

      const fullMarkdown = domToMarkdown(root)
      const truncated = fullMarkdown.length > MAX_READ_CHARS
      const markdown = truncated
        ? fullMarkdown.slice(0, MAX_READ_CHARS) + '\n\n[truncated — use selector to read specific sections]'
        : fullMarkdown

      const snapshot = captureSnapshot()
      return buildSuccessResult(input.commandId ?? 'read', snapshot, {
        markdown,
        truncated,
        charCount: fullMarkdown.length,
      })
    },
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/chenjing/dev/agrune && pnpm build
```

Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add packages/build-core/src/runtime/page-agent-runtime.ts && git commit -m "feat: implement read handler with DOM-to-markdown conversion"
```

---

### Task 9: 전체 빌드 + 테스트 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 빌드**

```bash
cd /Users/chenjing/dev/agrune && pnpm build
```

Expected: 모든 패키지 빌드 성공

- [ ] **Step 2: 전체 테스트**

```bash
cd /Users/chenjing/dev/agrune && pnpm test
```

Expected: 모든 테스트 통과

- [ ] **Step 3: 빌드/테스트 실패 시 수정 후 커밋**

```bash
cd /Users/chenjing/dev/agrune && git add -A && git commit -m "fix: resolve build/test issues after action kind expansion"
```
