# Multi-Action Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하나의 DOM 요소에 여러 인터랙션(예: click + dblclick)을 어노테이션할 수 있도록 `actionKind` → `actionKinds: ActionKind[]` 마이그레이션

**Architecture:** 코어 타입의 `actionKind` 필드를 `actionKinds` 배열로 일괄 변경. DOM 스캐너와 build-core 런타임의 파싱 로직에서 쉼표 구분 문자열을 지원. MCP 스냅샷 출력에 배열로 노출하여 LLM이 가능한 액션을 한눈에 파악.

**Tech Stack:** TypeScript, Vitest, Chrome Extension, React (demo)

**Spec:** `docs/superpowers/specs/2026-03-26-multi-action-support-design.md`

---

### Task 1: Core Type Migration — `actionKind` → `actionKinds`

**Files:**
- Modify: `packages/core/src/index.ts:28` (`PageTarget.actionKind`)

- [ ] **Step 1: `PageTarget` 인터페이스에서 `actionKind` → `actionKinds` 변경**

`packages/core/src/index.ts`에서:

```typescript
// Before (line 28 부근)
actionKind: ActionKind

// After
actionKinds: ActionKind[]
```

- [ ] **Step 2: 타입 에러 확인**

Run: `cd agrune && npx tsc --noEmit 2>&1 | head -80`
Expected: 다수의 타입 에러 발생 (모든 `actionKind` 참조처). 이 에러 목록이 이후 태스크의 변경 범위를 검증함.

- [ ] **Step 3: Commit**

```bash
cd agrune && git add packages/core/src/index.ts && git commit -m "refactor: rename PageTarget.actionKind to actionKinds array"
```

---

### Task 2: Extension DOM Scanner — 쉼표 파싱 + actionKinds 배열

**Files:**
- Modify: `packages/extension/src/content/dom-scanner.ts:5-6,20-23,31`
- Test: `packages/extension/tests/dom-scanner.spec.ts`

- [ ] **Step 1: 기존 테스트의 `actionKind` → `actionKinds` 변경**

`packages/extension/tests/dom-scanner.spec.ts`에서 모든 `actionKind` 참조를 `actionKinds` 배열로 변경:

```typescript
// line 25: actionKind: 'click' → actionKinds: ['click']
// line 45: actionKind → actionKinds, 값도 배열로
expect(result[0]).toMatchObject({
  name: 'submit-btn',
  description: 'Submits the form',
  actionKinds: ['click'],
  sensitive: false,
})
```

```typescript
// line 45
expect(result[0].actionKinds).toEqual(['fill'])
```

- [ ] **Step 2: 복수 액션 파싱 테스트 추가**

`packages/extension/tests/dom-scanner.spec.ts`의 `scanAnnotations` describe 블록 끝에 추가:

```typescript
it('parses comma-separated multiple actions', () => {
  document.body.innerHTML = `
    <div
      data-agrune-action="click,dblclick"
      data-agrune-name="card"
      data-agrune-desc="클릭으로 선택, 더블클릭으로 상세 보기"
    >Card</div>
  `
  const result = scanAnnotations(document)
  expect(result).toHaveLength(1)
  expect(result[0].actionKinds).toEqual(['click', 'dblclick'])
})

it('trims whitespace around action values', () => {
  document.body.innerHTML = `<div data-agrune-action="click, dblclick" data-agrune-name="a" data-agrune-desc="b">X</div>`
  const result = scanAnnotations(document)
  expect(result[0].actionKinds).toEqual(['click', 'dblclick'])
})

it('deduplicates repeated actions', () => {
  document.body.innerHTML = `<div data-agrune-action="click,click" data-agrune-name="a" data-agrune-desc="b">X</div>`
  const result = scanAnnotations(document)
  expect(result[0].actionKinds).toEqual(['click'])
})

it('filters out invalid action values', () => {
  document.body.innerHTML = `<div data-agrune-action="click,invalid,dblclick" data-agrune-name="a" data-agrune-desc="b">X</div>`
  const result = scanAnnotations(document)
  expect(result[0].actionKinds).toEqual(['click', 'dblclick'])
})

it('skips element when all action values are invalid', () => {
  document.body.innerHTML = `<div data-agrune-action="invalid,nope" data-agrune-name="a" data-agrune-desc="b">X</div>`
  const result = scanAnnotations(document)
  expect(result).toHaveLength(0)
})

it('ignores empty entries from consecutive commas', () => {
  document.body.innerHTML = `<div data-agrune-action="click,,dblclick" data-agrune-name="a" data-agrune-desc="b">X</div>`
  const result = scanAnnotations(document)
  expect(result[0].actionKinds).toEqual(['click', 'dblclick'])
})
```

- [ ] **Step 3: 테스트 실행하여 실패 확인**

Run: `cd agrune && npx vitest run packages/extension/tests/dom-scanner.spec.ts`
Expected: 기존 테스트는 `actionKinds` 필드 미존재로 실패, 새 테스트도 실패

- [ ] **Step 4: `ScannedTarget` 인터페이스와 `scanAnnotations` 구현 변경**

`packages/extension/src/content/dom-scanner.ts`에서:

```typescript
// ScannedTarget 인터페이스 (line 5-6 부근)
// Before
actionKind: ActionKind

// After
actionKinds: ActionKind[]
```

```typescript
// scanAnnotations 함수 내부 (line 20-23 부근)
// Before
const rawAction = el.getAttribute('data-agrune-action') ?? ''
if (!VALID_ACTION_KINDS.has(rawAction)) return
const action = rawAction as ActionKind

// After
const rawAction = el.getAttribute('data-agrune-action') ?? ''
const actionKinds = [...new Set(
  rawAction.split(',').map(a => a.trim()).filter(a => VALID_ACTION_KINDS.has(a))
)] as ActionKind[]
if (actionKinds.length === 0) return
```

```typescript
// targets.push 호출 (line 31 부근)
// Before
actionKind: action,

// After
actionKinds,
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd agrune && npx vitest run packages/extension/tests/dom-scanner.spec.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 6: Commit**

```bash
cd agrune && git add packages/extension/src/content/dom-scanner.ts packages/extension/tests/dom-scanner.spec.ts && git commit -m "feat: support comma-separated multi-action in DOM scanner"
```

---

### Task 3: Extension Manifest Builder — actionKinds 연동

**Files:**
- Modify: `packages/extension/src/content/manifest-builder.ts:28`
- Test: `packages/extension/tests/manifest-builder.spec.ts`

- [ ] **Step 1: manifest-builder 테스트의 `actionKind` → `actionKinds` 변경**

`packages/extension/tests/manifest-builder.spec.ts`에서 모든 `ScannedTarget` fixture의 `actionKind` → `actionKinds` 배열로 변경:

```typescript
// line 21: actionKind: 'click' → actionKinds: ['click']
// line 56: actionKind: 'click' → actionKinds: ['click']
// line 65: actionKind: 'fill' → actionKinds: ['fill']
// line 98: actionKind: 'click' → actionKinds: ['click']
// line 109: actionKind: 'click' → actionKinds: ['click']
// line 139: actionKind: 'click' → actionKinds: ['click']
// line 155: actionKind: 'click' → actionKinds: ['click']
```

복수 액션 테스트 추가:

```typescript
it('converts multi-action target into tool with comma-joined action', () => {
  const targets: ScannedTarget[] = [
    {
      targetId: 'card1',
      selector: '[data-agrune-key="card1"]',
      name: 'Task Card',
      description: '클릭으로 선택, 더블클릭으로 상세 보기',
      actionKinds: ['click', 'dblclick'],
      sensitive: false,
    },
  ]

  const manifest = buildManifest(targets, [])
  const tool = manifest.groups[0].tools[0]
  expect(tool.action).toBe('click,dblclick')
})
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd agrune && npx vitest run packages/extension/tests/manifest-builder.spec.ts`
Expected: FAIL

- [ ] **Step 3: manifest-builder 구현 변경**

`packages/extension/src/content/manifest-builder.ts:28`에서:

```typescript
// Before
action: target.actionKind,

// After
action: target.actionKinds.join(','),
```

**참고:** `AgagruneToolEntry.action`은 `string` 타입이므로 쉼표 join된 문자열이 그대로 들어감. build-core 런타임에서 이를 다시 파싱함.

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd agrune && npx vitest run packages/extension/tests/manifest-builder.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd agrune && git add packages/extension/src/content/manifest-builder.ts packages/extension/tests/manifest-builder.spec.ts && git commit -m "feat: manifest builder outputs comma-joined action for multi-action targets"
```

---

### Task 4: Build-Core Runtime — `actionKinds` 배열 마이그레이션

**Files:**
- Modify: `packages/build-core/src/runtime/page-agent-runtime.ts` (lines 210-211, 464-473, 528-541, 667-691, 693-727, 737, 794, 1963, 2189, 2298)
- Test: `packages/build-core/tests/runtime.spec.ts`

이 태스크는 build-core 런타임의 모든 `actionKind` 참조를 `actionKinds` 배열로 변경한다.

- [ ] **Step 1: `TargetDescriptor` 인터페이스 변경**

`packages/build-core/src/runtime/page-agent-runtime.ts` line 210-211:

```typescript
// Before
interface TargetDescriptor {
  actionKind: ActionKind

// After
interface TargetDescriptor {
  actionKinds: ActionKind[]
```

- [ ] **Step 2: `collectDescriptors` 함수 변경**

Line 464-479. `tool.action`을 쉼표 split하여 배열로:

```typescript
// Before (line 472-473)
result.push({
  actionKind: tool.action as ActionKind,

// After
const actionKinds = [...new Set(
  tool.action.split(',').map(a => a.trim()).filter(a => VALID_ACTIONS.has(a))
)] as ActionKind[]
if (actionKinds.length === 0) continue
// ...
result.push({
  actionKinds,
```

- [ ] **Step 3: `collectLiveDescriptors` 함수 변경**

Line 528-556. DOM 스캔 시에도 쉼표 파싱:

```typescript
// Before (line 533-534)
const rawAction = element.getAttribute('data-agrune-action') ?? ''
if (!VALID_ACTIONS.has(rawAction)) return

// After
const rawAction = element.getAttribute('data-agrune-action') ?? ''
const actionKinds = [...new Set(
  rawAction.split(',').map(a => a.trim()).filter(a => VALID_ACTIONS.has(a))
)] as ActionKind[]
if (actionKinds.length === 0) return
```

```typescript
// Before (line 540-541)
result.push({
  actionKind: rawAction as ActionKind,

// After
result.push({
  actionKinds,
```

- [ ] **Step 4: `resolveTargetReason` 함수 변경**

Line 667-691. `actionKind` 파라미터를 `actionKinds` 배열로:

```typescript
// Before
function resolveTargetReason(input: {
  actionKind: ActionKind
  // ...
}): PageTargetReason {
  // ...
  if (input.actionKind === 'fill' && input.sensitive) {

// After
function resolveTargetReason(input: {
  actionKinds: ActionKind[]
  // ...
}): PageTargetReason {
  // ...
  if (input.actionKinds.includes('fill') && input.sensitive) {
```

- [ ] **Step 5: `captureTargetState` 함수 변경**

Line 693-720:

```typescript
// Before
function captureTargetState(actionKind: ActionKind, element: HTMLElement): TargetState {
  // ...
  return {
    // ...
    reason: resolveTargetReason({
      actionKind,

// After
function captureTargetState(actionKinds: ActionKind[], element: HTMLElement): TargetState {
  // ...
  return {
    // ...
    reason: resolveTargetReason({
      actionKinds,
```

- [ ] **Step 6: `captureTarget` 함수 변경**

Line 722-758:

```typescript
// Before (line 727)
const state = captureTargetState(descriptor.actionKind, element)

// After
const state = captureTargetState(descriptor.actionKinds, element)
```

```typescript
// Before (line 737)
actionKind: descriptor.actionKind,

// After
actionKinds: descriptor.actionKinds,
```

- [ ] **Step 7: `makeSnapshot` 시그니처 변경**

Line 794:

```typescript
// Before
actionKind: target.actionKind,

// After
actionKinds: target.actionKinds,
```

- [ ] **Step 8: `act` 핸들러 가드 변경**

Line 1963:

```typescript
// Before
if (!ACT_COMPATIBLE_KINDS.has(descriptor.actionKind)) {

// After
if (!descriptor.actionKinds.some(k => ACT_COMPATIBLE_KINDS.has(k))) {
```

Line 1967 이후에 액션 검증 추가:

```typescript
const action = input.action ?? 'click'

if (!descriptor.actionKinds.includes(action as ActionKind)) {
  return buildErrorResult(input.commandId ?? input.targetId, 'INVALID_TARGET', `target does not support action "${action}": ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
}
```

- [ ] **Step 9: `fill` 핸들러 가드 변경**

Line 2189:

```typescript
// Before
if (descriptor.actionKind !== 'fill') {

// After
if (!descriptor.actionKinds.includes('fill')) {
```

- [ ] **Step 10: `guide` 핸들러 가드 변경**

Line 2298:

```typescript
// Before
if (!ACT_COMPATIBLE_KINDS.has(descriptor.actionKind)) {

// After
if (!descriptor.actionKinds.some(k => ACT_COMPATIBLE_KINDS.has(k))) {
```

- [ ] **Step 11: 테스트 fixture의 `actionKind` 참조 확인 및 수정**

`packages/build-core/tests/runtime.spec.ts`에서 `actionKind` 참조를 검색하여 수정. 테스트 fixture는 매니페스트를 통해 들어오므로 `tool.action` 문자열은 그대로이지만, 런타임 내부에서 `actionKinds` 배열로 파싱됨. 테스트 assertion에 `actionKind`를 직접 참조하는 부분이 있으면 `actionKinds`로 수정.

- [ ] **Step 12: 테스트 실행**

Run: `cd agrune && npx vitest run packages/build-core/tests/runtime.spec.ts`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
cd agrune && git add packages/build-core/src/runtime/page-agent-runtime.ts packages/build-core/tests/runtime.spec.ts && git commit -m "refactor: migrate build-core runtime from actionKind to actionKinds array"
```

---

### Task 5: MCP Server — Public Shapes + Backend 테스트 마이그레이션

**Files:**
- Modify: `packages/mcp/src/public-shapes.ts:22,31,80,130`
- Modify: `packages/mcp/src/tools.ts:48-62` (description 힌트)
- Test: `packages/mcp/tests/public-shapes.spec.ts`
- Test: `packages/mcp/tests/backend.spec.ts`
- Test: `packages/mcp/tests/tools.spec.ts`

- [ ] **Step 1: `PublicSnapshotTarget` 타입 변경**

`packages/mcp/src/public-shapes.ts`:

```typescript
// line 31: Before
actionKind: PageTarget['actionKind']

// After
actionKinds: PageTarget['actionKinds']
```

- [ ] **Step 2: `PublicSnapshotGroup.actionKinds` 타입 변경**

Line 22:

```typescript
// Before
actionKinds: PageTarget['actionKind'][]

// After — 그룹의 actionKinds는 그룹 내 모든 타겟의 actionKinds를 flatten+deduplicate
actionKinds: PageTarget['actionKinds'][number][]
```

- [ ] **Step 3: `toPublicTarget` 함수 변경**

Line 80:

```typescript
// Before
actionKind: target.actionKind,

// After
actionKinds: target.actionKinds,
```

- [ ] **Step 4: `toPublicGroups` 함수 변경**

Line 130:

```typescript
// Before
actionKinds: [...new Set(group.targets.map(target => target.actionKind))],

// After
actionKinds: [...new Set(group.targets.flatMap(target => target.actionKinds))],
```

- [ ] **Step 5: `agrune_act` tool description에 복수 액션 힌트 추가**

`packages/mcp/src/tools.ts` line 49:

```typescript
// Before
description: 'Perform an interaction (click, dblclick, contextmenu, hover, longpress) on a target element. Defaults to click.',

// After
description: 'Perform an interaction (click, dblclick, contextmenu, hover, longpress) on a target element. Defaults to click. A target may support multiple actions — check actionKinds in the snapshot.',
```

- [ ] **Step 6: public-shapes 테스트 fixture 변경**

`packages/mcp/tests/public-shapes.spec.ts`에서 모든 `actionKind: 'click'` → `actionKinds: ['click']`, `actionKind: 'fill'` → `actionKinds: ['fill']` 변경.

테스트 assertion도 동일하게:
- `actionKind: 'click'` → `actionKinds: ['click']`
- `actionKind: 'fill'` → `actionKinds: ['fill']`

Line 237의 command result에서 `result: { actionKind: 'click', targetId: 'tab-board' }` — 이건 act 핸들러의 결과 객체이므로 그대로 둔다(실행된 단일 액션을 나타냄).

- [ ] **Step 7: backend 테스트 fixture 변경**

`packages/mcp/tests/backend.spec.ts`에서 모든 `PageTarget` fixture의 `actionKind` → `actionKinds` 배열로 변경.

- [ ] **Step 8: 테스트 실행**

Run: `cd agrune && npx vitest run packages/mcp/tests/`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd agrune && git add packages/mcp/ && git commit -m "refactor: migrate MCP server from actionKind to actionKinds array"
```

---

### Task 6: DevTools Panel — actionKinds 표시

**Files:**
- Modify: `packages/extension/src/devtools/panel.ts:70-73,86,110,142`

- [ ] **Step 1: 액션 필터 드롭다운 변경**

`packages/extension/src/devtools/panel.ts` line 70-73:

```typescript
// Before
const actionKinds = [...new Set(snapshot.targets.map(t => t.actionKind))]

// After
const actionKinds = [...new Set(snapshot.targets.flatMap(t => t.actionKinds))]
```

- [ ] **Step 2: 타겟 필터링 변경**

Line 86:

```typescript
// Before
.filter(t => !aFilter || t.actionKind === aFilter)

// After
.filter(t => !aFilter || t.actionKinds.includes(aFilter as any))
```

- [ ] **Step 3: 타겟 행 표시 변경**

Line 110:

```typescript
// Before
<span class="target-action">${target.actionKind}</span>

// After
<span class="target-action">${target.actionKinds.join(', ')}</span>
```

- [ ] **Step 4: 상세 패널 표시 변경**

Line 142:

```typescript
// Before
<tr><td>actionKind</td><td><span class="action-badge">${target.actionKind}</span></td></tr>

// After
<tr><td>actionKinds</td><td>${target.actionKinds.map(k => `<span class="action-badge">${k}</span>`).join(' ')}</td></tr>
```

- [ ] **Step 5: Commit**

```bash
cd agrune && git add packages/extension/src/devtools/panel.ts && git commit -m "refactor: update devtools panel for actionKinds array"
```

---

### Task 7: 전체 빌드 + 테스트 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 타입 체크**

Run: `cd agrune && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 전체 테스트**

Run: `cd agrune && npx vitest run`
Expected: 전체 PASS

- [ ] **Step 3: `actionKind` 잔여 참조 확인**

Run: `cd agrune && grep -r "actionKind" --include="*.ts" --include="*.tsx" -l | grep -v node_modules | grep -v ".spec." | grep -v "design.md"`

`actionKind`가 남아있으면 안 됨. 단, act 핸들러의 `result: { actionKind: action }` (실행 결과 객체)는 예외 — 실행된 단일 액션을 나타내는 별도 필드.

**참고:** act 핸들러의 결과 객체 `{ actionKind: action, targetId }` (line 2014-2016)는 `CommandResult.result`로 반환되는 임의 객체이므로 `PageTarget` 타입과 무관. 이 필드명을 변경할지는 선택사항이지만, 이 결과는 실행된 "하나의 액션"을 나타내므로 단수형이 적절하여 그대로 둔다.

- [ ] **Step 4: Commit (필요시)**

잔여 참조 수정이 있으면 커밋.

---

### Task 8: 플러그인 문서 업데이트

**Files:**
- Modify: `agrune-plugin/skills/annotate/SKILL.md:17`
- Modify: `agrune-plugin/skills/quickstart/SKILL.md:98`

**참고:** agrune-plugin은 별도 디렉토리(`/Users/laonpeople/dev/agrune/agrune-plugin/`)에 있다.

- [ ] **Step 1: annotate 스킬 문서 업데이트**

`agrune-plugin/skills/annotate/SKILL.md` line 17:

```markdown
<!-- Before -->
| `data-agrune-action` | `"click"`, `"fill"`, `"dblclick"`, `"contextmenu"`, `"hover"`, `"longpress"` 중 하나 | **정적만 가능** |

<!-- After -->
| `data-agrune-action` | `"click"`, `"fill"`, `"dblclick"`, `"contextmenu"`, `"hover"`, `"longpress"` 중 하나 또는 쉼표 구분 복수 (예: `"click,dblclick"`) | **정적만 가능** |
```

같은 파일에 복수 액션 예시 섹션 추가 (기존 어노테이션 예시 직후):

```markdown
### 복수 액션

하나의 요소에 여러 인터랙션이 필요하면 쉼표로 구분한다:

\`\`\`tsx
<div
  data-agrune-action="click,dblclick"
  data-agrune-name={task.title}
  data-agrune-desc="클릭으로 선택, 더블클릭으로 상세 보기"
>
\`\`\`

- `data-agrune-desc`에 각 액션이 무엇을 하는지 자연어로 기술한다
- `fill`과 다른 액션을 조합할 수 있다: `"fill,click"` → `agrune_fill`과 `agrune_act` 모두 사용 가능
```

- [ ] **Step 2: quickstart 스킬 문서 업데이트**

`agrune-plugin/skills/quickstart/SKILL.md` line 98:

```markdown
<!-- Before -->
| `agrune_act` | 타겟 요소 인터랙션 (click, dblclick, contextmenu, hover, longpress) |

<!-- After -->
| `agrune_act` | 타겟 요소 인터랙션 (click, dblclick, contextmenu, hover, longpress). 타겟의 `actionKinds` 배열에서 지원 액션 확인 |
```

- [ ] **Step 3: Commit**

```bash
cd agrune-plugin && git add skills/annotate/SKILL.md skills/quickstart/SKILL.md && git commit -m "docs: update skills for multi-action support"
```

---

### Task 9: Demo 검증 — KanbanBoard 복수 액션 적용

**Files:**
- Modify: `agrune-demo/src/components/features/KanbanBoard.tsx:226`

**참고:** agrune-demo는 별도 디렉토리(`/Users/laonpeople/dev/agrune/agrune-demo/`)에 있다.

- [ ] **Step 1: 칸반 카드에 복수 액션 적용**

`agrune-demo/src/components/features/KanbanBoard.tsx` line 226:

```tsx
// Before
data-agrune-action="click"
data-agrune-name={task.title}
data-agrune-desc="이 카드를 드래그하여 이동"

// After
data-agrune-action="click,dblclick"
data-agrune-name={task.title}
data-agrune-desc="클릭으로 선택하여 이동, 더블클릭으로 상세 보기"
```

- [ ] **Step 2: 데모 빌드 확인**

Run: `cd agrune-demo && npm run build`
Expected: 빌드 성공

- [ ] **Step 3: Commit**

```bash
cd agrune-demo && git add src/components/features/KanbanBoard.tsx && git commit -m "feat: add multi-action annotations to kanban cards"
```

---

### Task 10: 9번 노트 업데이트

**Files:**
- Modify: `agrune/docs/notes/9-multi-action-support.md`

- [ ] **Step 1: 현재 상태를 "완료"로 업데이트**

`agrune/docs/notes/9-multi-action-support.md` 하단의 `## 현재 상태` 섹션:

```markdown
## 현재 상태

완료. 배열 방식(`actionKinds: ActionKind[]`)으로 구현됨.
- 설계: `docs/superpowers/specs/2026-03-26-multi-action-support-design.md`
- 원래 노트의 타겟 분리(`::` 접미사) 방식 대신 단일 타겟 + actionKinds 배열 방식 채택
```

- [ ] **Step 2: Commit**

```bash
cd agrune && git add docs/notes/9-multi-action-support.md && git commit -m "docs: mark multi-action support as completed"
```
