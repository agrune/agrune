# 1-0. 캔버스 좌표 정밀화 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI가 canvas 좌표 공간에서 작업하도록 스냅샷/드래그/포인터 시스템을 전환하고, `data-agrune-meta` 어노테이션을 추가한다.

**Architecture:** 스냅샷 출력 시 viewport→canvas 역변환, 명령 입력 시 canvas→viewport 정변환. 모든 변환은 런타임(`build-core`)에서 수행. MCP 서버는 passthrough.

**Tech Stack:** TypeScript, Vitest, Zod, Chrome DevTools Protocol

---

### Task 1: 코어 타입 변경 — rect → center+size

**Files:**
- Modify: `packages/core/src/index.ts:63-93`
- Modify: `packages/core/tests/core.spec.ts`

- [ ] **Step 1: 타입 변경**

`packages/core/src/index.ts`에서:

```typescript
// 삭제
export interface RectBounds {
  x: number
  y: number
  width: number
  height: number
}

// PageTarget에서 rect 제거, center+size+coordSpace 추가
export interface PageTarget {
  // ... 기존 필드 유지
  center?: { x: number; y: number }
  size?: { w: number; h: number }
  coordSpace?: 'viewport' | 'canvas'
  // rect?: RectBounds  ← 삭제
  sourceFile: string
  sourceLine: number
  sourceColumn: number
}
```

- [ ] **Step 2: PageSnapshotGroup에 meta 추가**

```typescript
export interface PageSnapshotGroup {
  groupId: string
  groupName?: string
  groupDesc?: string
  targetIds: string[]
  viewportTransform?: ViewportTransform
  meta?: unknown  // 신규
}
```

- [ ] **Step 3: OFFSCREEN 에러코드 추가**

```typescript
export const COMMAND_ERROR_CODES = [
  // ... 기존 코드
  'OFFSCREEN',  // 신규
] as const
```

- [ ] **Step 4: `RectBounds` 사용처 검색 및 제거 확인**

Run: `grep -r "RectBounds\|\.rect" packages/ --include="*.ts" | grep -v node_modules | grep -v ".spec.ts"`

기존 코드에서 `RectBounds`를 참조하는 곳을 모두 확인. 이후 태스크에서 순차 수정.

- [ ] **Step 5: 커밋**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): replace rect with center+size, add coordSpace and meta"
```

---

### Task 2: 좌표 변환 유틸 추가

**Files:**
- Modify: `packages/build-core/src/runtime/dom-utils.ts`

- [ ] **Step 1: viewportToCanvas 함수 추가**

`packages/build-core/src/runtime/dom-utils.ts` 끝에 추가:

```typescript
export function viewportToCanvas(
  viewportX: number,
  viewportY: number,
  transform: ViewportTransform,
): { x: number; y: number } {
  return {
    x: Math.round((viewportX - transform.translateX) / transform.scale),
    y: Math.round((viewportY - transform.translateY) / transform.scale),
  }
}

export function canvasToViewport(
  canvasX: number,
  canvasY: number,
  transform: ViewportTransform,
): { x: number; y: number } {
  return {
    x: Math.round(canvasX * transform.scale + transform.translateX),
    y: Math.round(canvasY * transform.scale + transform.translateY),
  }
}
```

import 추가 필요: `import type { ViewportTransform } from '@agrune/core'`

- [ ] **Step 2: 커밋**

```bash
git add packages/build-core/src/runtime/dom-utils.ts
git commit -m "feat(build-core): add viewportToCanvas and canvasToViewport utils"
```

---

### Task 3: 스냅샷 — center+size 출력 + canvas 좌표 변환

**Files:**
- Modify: `packages/build-core/src/runtime/snapshot.ts:330-378` (captureTarget)
- Modify: `packages/build-core/src/runtime/snapshot.ts:385-476` (makeSnapshot)

- [ ] **Step 1: captureTargetState에 isCanvasGroup 파라미터 추가**

`packages/build-core/src/runtime/snapshot.ts`의 `captureTargetState()` (line 302):

```typescript
export function captureTargetState(
  actionKinds: ActionKind[],
  element: HTMLElement,
  isCanvasGroup: boolean = false,  // 신규 파라미터
): TargetState {
  const sensitive = isSensitive(element)
  const visible = isVisible(element)
  const inViewport = visible && isElementInViewport(element)
  const enabled = isEnabled(element)
  const covered = inViewport ? !isTopmostInteractable(element) : false
  // 캔버스 그룹은 covered여도 actionableNow 유지
  const actionableNow = isCanvasGroup
    ? visible && enabled
    : visible && enabled && !covered
  const overlay = isOverlayElement(element)

  return {
    visible,
    inViewport,
    enabled,
    covered,
    actionableNow,
    overlay,
    sensitive,
    reason: resolveTargetReason({
      actionKinds,
      visible,
      inViewport,
      enabled,
      covered,
      sensitive,
    }),
  }
}
```

- [ ] **Step 2: captureTarget에서 rect → center+size 변환**

`captureTarget()` (line 330)을 수정. 새 파라미터 `viewportTransform` 추가:

```typescript
export function captureTarget(
  descriptor: TargetDescriptor,
  element: HTMLElement,
  targetId: string,
  viewportTransform?: ViewportTransform,  // 신규
): PageTarget {
  const isCanvasGroup = viewportTransform !== undefined
  const state = captureTargetState(descriptor.actionKinds, element, isCanvasGroup)
  const textContent = element.textContent?.trim() ?? ''
  const valuePreview =
    isFillableElement(element) && !state.sensitive ? element.value : null

  const name = descriptor.target.name ?? element.getAttribute('data-agrune-name') ?? textContent
  const description = descriptor.target.desc ?? element.getAttribute('data-agrune-desc') ?? ''

  let center: PageTarget['center']
  let size: PageTarget['size']
  let coordSpace: PageTarget['coordSpace']

  if (state.actionableNow) {
    const domRect = element.getBoundingClientRect()
    const cx = domRect.left + domRect.width / 2
    const cy = domRect.top + domRect.height / 2

    if (viewportTransform) {
      const canvasCenter = viewportToCanvas(cx, cy, viewportTransform)
      center = canvasCenter
      size = {
        w: Math.round(domRect.width / viewportTransform.scale),
        h: Math.round(domRect.height / viewportTransform.scale),
      }
      coordSpace = 'canvas'
    } else {
      center = { x: Math.round(cx), y: Math.round(cy) }
      size = { w: Math.round(domRect.width), h: Math.round(domRect.height) }
      coordSpace = 'viewport'
    }
  }

  return {
    actionKinds: descriptor.actionKinds,
    description,
    enabled: state.enabled,
    groupId: descriptor.groupId,
    groupName: descriptor.groupName,
    groupDesc: descriptor.groupDesc,
    name,
    reason: state.reason,
    selector: descriptor.target.selector,
    sensitive: state.sensitive,
    targetId,
    visible: state.visible,
    inViewport: state.inViewport,
    covered: state.covered,
    actionableNow: state.actionableNow,
    overlay: state.overlay,
    textContent,
    valuePreview,
    center,
    size,
    coordSpace,
    sourceFile: descriptor.target.sourceFile,
    sourceLine: descriptor.target.sourceLine,
    sourceColumn: descriptor.target.sourceColumn,
  }
}
```

import 추가: `import { viewportToCanvas } from './dom-utils'`

- [ ] **Step 3: makeSnapshot에서 transform을 captureTarget에 전달**

`makeSnapshot()` (line 385)에서 targets 생성 부분 수정:

```typescript
// canvasSelectors 맵 구축 (기존 코드, line 400-405)
// parseViewportTransform 함수 (기존 코드, line 407-417)

// 그룹별 transform 미리 계산
const groupTransforms = new Map<string, ViewportTransform>()
for (const [groupId] of canvasSelectors) {
  const transform = parseViewportTransform(groupId)
  if (transform) groupTransforms.set(groupId, transform)
}

const targets = descriptors.flatMap(descriptor => {
  const elements = findElements(descriptor)
  const transform = groupTransforms.get(descriptor.groupId)
  return elements.map((element, index) =>
    captureTarget(
      descriptor,
      element,
      toRuntimeTargetId(descriptor.target.targetId, index, elements.length),
      transform,  // 신규: transform 전달
    ),
  )
})
```

- [ ] **Step 4: SNAPSHOT_RELEVANT_ATTRIBUTES에 신규 속성 추가**

```typescript
export const SNAPSHOT_RELEVANT_ATTRIBUTES = [
  // ... 기존 속성
  'data-agrune-canvas',  // 추가
  'data-agrune-meta',    // 추가
]
```

- [ ] **Step 5: TypeScript 컴파일 확인**

Run: `pnpm tsc --noEmit` (또는 프로젝트의 타입체크 명령)

- [ ] **Step 6: 커밋**

```bash
git add packages/build-core/src/runtime/snapshot.ts
git commit -m "feat(build-core): snapshot outputs center+size with canvas coord transform"
```

---

### Task 4: data-agrune-meta 함수 호출

**Files:**
- Modify: `packages/build-core/src/runtime/snapshot.ts:419-434` (makeSnapshot의 groups 구축 부분)

- [ ] **Step 1: meta 함수 호출 헬퍼 추가**

`makeSnapshot()` 위에 헬퍼 함수 추가:

```typescript
function callMetaFunction(groupEl: HTMLElement): unknown | null {
  const fnName = groupEl.getAttribute('data-agrune-meta')?.trim()
  if (!fnName) return null

  const fn = (window as Record<string, unknown>)[fnName]
  if (typeof fn !== 'function') {
    console.warn(`[agrune] meta function not found: ${fnName}`)
    return null
  }

  try {
    const result = fn()
    // 직렬화 가능 여부 확인
    JSON.stringify(result)
    return result
  } catch (e) {
    console.error(`[agrune] meta function error: ${fnName}`, e)
    return null
  }
}
```

- [ ] **Step 2: groups 구축에서 meta 포함**

`makeSnapshot()`의 groups 구축 (line 419-434) 수정:

```typescript
const groups = new Map<string, {
  groupId: string
  groupName?: string
  groupDesc?: string
  targetIds: string[]
  viewportTransform?: ViewportTransform
  meta?: unknown  // 신규
}>()

for (const target of targets) {
  const group = groups.get(target.groupId)
  if (group) {
    group.targetIds.push(target.targetId)
    continue
  }

  // meta 함수 호출
  const groupEl = document.querySelector<HTMLElement>(
    `[data-agrune-group="${target.groupId}"]`
  )
  const meta = groupEl ? callMetaFunction(groupEl) : null

  groups.set(target.groupId, {
    groupId: target.groupId,
    groupName: target.groupName,
    groupDesc: target.groupDesc,
    targetIds: [target.targetId],
    viewportTransform: parseViewportTransform(target.groupId),
    ...(meta !== null ? { meta } : {}),
  })
}
```

- [ ] **Step 3: snapshot 출력에 meta 포함**

기존 그룹 출력 코드 (line 461-467)에서 meta 추가:

```typescript
groups: Array.from(groups.values()).map(group => ({
  groupId: group.groupId,
  groupName: group.groupName,
  groupDesc: group.groupDesc,
  targetIds: group.targetIds.sort(),
  ...(group.viewportTransform ? { viewportTransform: group.viewportTransform } : {}),
  ...(group.meta !== undefined ? { meta: group.meta } : {}),  // 신규
})),
```

- [ ] **Step 4: 커밋**

```bash
git add packages/build-core/src/runtime/snapshot.ts
git commit -m "feat(build-core): add data-agrune-meta function call support"
```

---

### Task 5: 드래그 — canvas 좌표 수용 + 결과 반환

**Files:**
- Modify: `packages/build-core/src/runtime/command-handlers.ts:918-950` (coordinate-based drag)

- [ ] **Step 1: canvas→viewport 변환 헬퍼**

`handleDrag()` 위에 헬퍼 추가:

```typescript
function getCanvasGroupTransform(
  descriptors: TargetDescriptor[],
  targetId: string,
): ViewportTransform | undefined {
  const { baseTargetId } = parseRuntimeTargetId(targetId)
  const descriptor = descriptors.find(d => d.target.targetId === baseTargetId)
  if (!descriptor) return undefined

  const groupEl = document.querySelector<HTMLElement>(
    `[data-agrune-group="${descriptor.groupId}"]`
  )
  if (!groupEl) return undefined

  const canvasSelector = groupEl.getAttribute('data-agrune-canvas')?.trim()
  if (!canvasSelector) return undefined

  const transformEl = groupEl.querySelector<HTMLElement>(canvasSelector)
  if (!transformEl) return undefined

  const style = window.getComputedStyle(transformEl)
  if (!style.transform || style.transform === 'none') {
    return { translateX: 0, translateY: 0, scale: 1 }
  }
  const m = new DOMMatrix(style.transform)
  return {
    translateX: Math.round(m.e),
    translateY: Math.round(m.f),
    scale: Math.round(m.a * 1000) / 1000,
  }
}
```

- [ ] **Step 2: movedTarget 빌더 헬퍼**

```typescript
function buildMovedTarget(
  element: HTMLElement,
  targetId: string,
  transform?: ViewportTransform,
): Record<string, unknown> {
  const domRect = element.getBoundingClientRect()
  const cx = domRect.left + domRect.width / 2
  const cy = domRect.top + domRect.height / 2

  if (transform) {
    const canvasCenter = viewportToCanvas(cx, cy, transform)
    return {
      targetId,
      center: canvasCenter,
      size: {
        w: Math.round(domRect.width / transform.scale),
        h: Math.round(domRect.height / transform.scale),
      },
      coordSpace: 'canvas',
    }
  }

  return {
    targetId,
    center: { x: Math.round(cx), y: Math.round(cy) },
    size: { w: Math.round(domRect.width), h: Math.round(domRect.height) },
    coordSpace: 'viewport',
  }
}
```

- [ ] **Step 3: coordinate-based drag에서 canvas→viewport 변환 적용**

`handleDrag()`의 coordinate-based branch (line 918-950) 수정:

```typescript
// --- Branch: coordinate-based drag ---
if (hasCoords) {
  const transform = getCanvasGroupTransform(deps.getDescriptors(), input.sourceTargetId)
  const srcCoords = getElementCenter(sourceElement)

  let destCoords: PointerCoords
  if (transform) {
    // canvas → viewport 변환
    const vp = canvasToViewport(input.destinationCoords!.x, input.destinationCoords!.y, transform)
    destCoords = { clientX: vp.x, clientY: vp.y }

    // viewport 밖이면 에러
    if (!isPointInsideViewport(vp.x, vp.y)) {
      return buildErrorResult(
        input.commandId ?? input.sourceTargetId,
        'OFFSCREEN',
        'Target is outside viewport. Use wheel to pan/zoom first.',
        snapshot,
        input.sourceTargetId,
      )
    }
  } else {
    destCoords = {
      clientX: input.destinationCoords!.x,
      clientY: input.destinationCoords!.y,
    }
  }

  // ... 기존 드래그 실행 코드 (animation/pointerDrag) ...

  const nextSnapshot = await deps.captureSettledSnapshot(2)
  return buildSuccessResult(input.commandId ?? input.sourceTargetId, nextSnapshot, {
    actionKind: 'drag',
    sourceTargetId: input.sourceTargetId,
    destinationCoords: input.destinationCoords,
    movedTarget: buildMovedTarget(sourceElement, input.sourceTargetId, transform),
  })
}
```

import 추가: `import { canvasToViewport, viewportToCanvas } from './dom-utils'`

- [ ] **Step 4: 커밋**

```bash
git add packages/build-core/src/runtime/command-handlers.ts
git commit -m "feat(build-core): drag accepts canvas coords and returns movedTarget"
```

---

### Task 6: 포인터 — 휠 후 updatedTransform 반환

**Files:**
- Modify: `packages/build-core/src/runtime/command-handlers.ts` (handlePointer 함수)

- [ ] **Step 1: handlePointer에서 wheel 액션 후 transform 반환**

`handlePointer()` (line ~1090)에서 결과 반환 부분을 수정. wheel 액션이 포함된 경우 해당 그룹의 transform을 결과에 포함:

```typescript
// handlePointer 내부, 결과 반환 직전에 추가
const hasWheelAction = input.actions.some(a => a.type === 'wheel')
let updatedTransform: Record<string, unknown> | undefined

if (hasWheelAction && resolvedElement) {
  // 요소가 속한 그룹의 canvas transform 조회
  const groupEl = resolvedElement.closest<HTMLElement>('[data-agrune-group]')
  const groupId = groupEl?.getAttribute('data-agrune-group')?.trim()
  if (groupId) {
    const transform = getCanvasGroupTransform(deps.getDescriptors(), /* targetId 또는 그룹 기반 조회 */)
    // 또는 직접 조회:
    const canvasSelector = groupEl?.getAttribute('data-agrune-canvas')?.trim()
    if (canvasSelector && groupEl) {
      const transformEl = groupEl.querySelector<HTMLElement>(canvasSelector)
      if (transformEl) {
        const style = window.getComputedStyle(transformEl)
        if (style.transform && style.transform !== 'none') {
          const m = new DOMMatrix(style.transform)
          updatedTransform = {
            groupId,
            viewportTransform: {
              translateX: Math.round(m.e),
              translateY: Math.round(m.f),
              scale: Math.round(m.a * 1000) / 1000,
            },
          }
        }
      }
    }
  }
}

// 결과에 포함
return buildSuccessResult(input.commandId ?? 'pointer', nextSnapshot, {
  actionKind: 'pointer',
  ...(updatedTransform ? { updatedTransform } : {}),
})
```

주의: `handlePointer`의 정확한 구조를 읽고 결과 반환 위치를 확인할 것. `getCanvasGroupTransform` 헬퍼를 재사용하거나 직접 DOM 조회.

- [ ] **Step 2: 커밋**

```bash
git add packages/build-core/src/runtime/command-handlers.ts
git commit -m "feat(build-core): pointer returns updatedTransform after wheel actions"
```

---

### Task 7: 공개 스냅샷 형식 업데이트

**Files:**
- Modify: `packages/mcp-server/src/public-shapes.ts`

- [ ] **Step 1: PublicSnapshotTarget에서 rect → center+size**

```typescript
export interface PublicSnapshotTarget {
  targetId: string
  groupId: string
  name: string
  description: string
  actionKinds: PageTarget['actionKinds']
  reason?: PageTarget['reason']
  sensitive?: boolean
  textContent?: string
  center?: { x: number; y: number }      // rect 대체
  size?: { w: number; h: number }         // rect 대체
  coordSpace?: 'viewport' | 'canvas'      // 신규
}
```

- [ ] **Step 2: PublicSnapshotGroup에 meta 추가**

```typescript
export interface PublicSnapshotGroup {
  groupId: string
  groupName?: string
  groupDesc?: string
  targetCount: number
  actionKinds: PageTarget['actionKinds'][number][]
  sampleTargetNames: string[]
  viewportTransform?: { translateX: number; translateY: number; scale: number }
  meta?: unknown  // 신규
}
```

- [ ] **Step 3: PublicSnapshotOptions에서 includeRect 제거**

```typescript
export interface PublicSnapshotOptions {
  mode?: 'outline' | 'full'
  groupIds?: string[]
  includeTextContent?: boolean
  // includeRect 삭제 — center+size는 항상 포함
}
```

- [ ] **Step 4: toPublicTarget 수정**

```typescript
function toPublicTarget(target: PageTarget, includeTextContent: boolean): PublicSnapshotTarget {
  return {
    targetId: target.targetId,
    groupId: target.groupId,
    name: target.name,
    description: target.description,
    actionKinds: target.actionKinds,
    ...(target.reason !== 'ready' ? { reason: target.reason } : {}),
    ...(target.sensitive ? { sensitive: true } : {}),
    ...(includeTextContent && target.textContent ? { textContent: target.textContent } : {}),
    ...(target.center ? { center: target.center } : {}),
    ...(target.size ? { size: target.size } : {}),
    ...(target.coordSpace ? { coordSpace: target.coordSpace } : {}),
  }
}
```

- [ ] **Step 5: toPublicGroups에서 meta 포함**

```typescript
return Array.from(groups.values()).map(group => ({
  // ... 기존 필드
  ...(transformMap.has(group.groupId) ? { viewportTransform: transformMap.get(group.groupId) } : {}),
  ...(metaMap.has(group.groupId) ? { meta: metaMap.get(group.groupId) } : {}),  // 신규
}))
```

meta 맵 구축: `snapshotGroups`에서 `meta` 필드를 추출.

- [ ] **Step 6: toPublicSnapshot에서 includeRect 파라미터 제거**

`toPublicSnapshot()` 내부에서 `includeRect` 관련 코드 제거. `toPublicTarget` 호출에서 두 번째 인자만 전달.

- [ ] **Step 7: 커밋**

```bash
git add packages/mcp-server/src/public-shapes.ts
git commit -m "feat(mcp-server): public shapes use center+size, add meta to groups"
```

---

### Task 8: MCP 도구 스키마 업데이트

**Files:**
- Modify: `packages/mcp-server/src/mcp-tools.ts:68-82`

- [ ] **Step 1: agrune_drag 스키마 업데이트**

`destinationCoords`의 describe를 canvas 좌표 지원으로 업데이트:

```typescript
mcp.tool(
  'agrune_drag',
  'Drag a source target to a destination. Destination can be another target (destinationTargetId) or coordinates (destinationCoords). For canvas groups, coords are in canvas space (auto-converted). Returns movedTarget with final position.',
  {
    sourceTargetId: z.string().describe('Source target ID'),
    destinationTargetId: z.string().optional().describe('Destination target ID'),
    destinationCoords: z.object({
      x: z.number().describe('X coordinate (canvas space for canvas groups, viewport otherwise)'),
      y: z.number().describe('Y coordinate'),
    }).optional().describe('Destination coordinates'),
    placement: z.enum(['before', 'inside', 'after']).optional().describe('Drop placement (only with destinationTargetId)'),
    ...optionalTabId,
  },
  async (args) => toMcpToolResult(await handleToolCall('agrune_drag', args)),
)
```

- [ ] **Step 2: 커밋**

```bash
git add packages/mcp-server/src/mcp-tools.ts
git commit -m "feat(mcp-server): update drag tool schema for canvas coordinates"
```

---

### Task 9: 전체 빌드 + 테스트 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: TypeScript 컴파일**

Run: `pnpm tsc --noEmit` (또는 `pnpm build`)
Expected: 에러 없음

- [ ] **Step 2: 기존 테스트 실행**

Run: `pnpm test`
Expected: 모든 테스트 통과. `RectBounds` 참조하는 테스트가 있으면 수정.

- [ ] **Step 3: rect 참조 완전 제거 확인**

Run: `grep -r "\.rect\b\|RectBounds\|includeRect" packages/ --include="*.ts" | grep -v node_modules`
Expected: 결과 없음

- [ ] **Step 4: 커밋 (테스트 수정이 있었다면)**

```bash
git add -A
git commit -m "fix: update tests for center+size format"
```
