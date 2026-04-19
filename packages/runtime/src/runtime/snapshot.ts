import {
  createCommandError,
  type CommandResult,
  type PageSnapshot,
  type PageTarget,
  type PageTargetReason,
  type ViewportTransform,
} from '@agrune/core'
import type {
  ActionKind,
  AgruneManifest,
  ManifestRepeat,
  ManifestTarget,
  SelectorLadder,
} from '../types'
import {
  buildLiveSelector,
  isElementInViewport,
  isEnabled,
  isFillableElement,
  isOverlayElement,
  isSensitive,
  isTopmostInteractable,
  isVisible,
  viewportToCanvas,
} from './dom-utils'
import { RepeatExpander } from './repeat-expander'
import { resolveByLadder } from './target-resolver'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TargetDescriptor {
  actionKinds: ActionKind[]
  groupId: string
  groupName?: string
  groupDesc?: string
  target: ManifestTarget & {
    // source info kept for tooling (live scan emits '', 0, 0)
    sourceFile?: string
    sourceLine?: number
    sourceColumn?: number
  }
  /** Phase 15-02 (REPEAT-03): Repeat 확장 시에만 존재. */
  repeatInstance?: { repeatId: string; index: number; key: string }
  /**
   * @internal Phase 15-02 — repeat 확장 시 collectDescriptors가 pre-resolve한 row element.
   * JSON.stringify 대상 아님 (T-15-11 mitigate). findElements/captureTarget에서 _instanceEl 우선 사용.
   */
  _instanceEl?: HTMLElement
  /**
   * @internal Phase 15-02 — repeat.strategy를 makeSnapshot groups.repeats 집계용으로 보존.
   * 직렬화 대상 아님.
   */
  _repeatStrategy?: 'dom' | 'virtualized'
  /**
   * @internal Phase 15-02 — expandVirtualized의 logicalSize를 makeSnapshot groups.repeats 집계용으로 보존.
   * 직렬화 대상 아님.
   */
  _repeatLogicalSize?: number | null
}

export interface RuntimeTargetMatch {
  descriptor: TargetDescriptor
  element: HTMLElement
  targetId: string
}

export interface MutableSnapshotStore {
  version: number
  signature: string | null
  latest: PageSnapshot | null
}

export interface TargetState {
  visible: boolean
  inViewport: boolean
  enabled: boolean
  covered: boolean
  actionableNow: boolean
  overlay: boolean
  sensitive: boolean
  reason: PageTargetReason
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_ACTIONS = new Set(['click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress'])
export const ACT_COMPATIBLE_KINDS = new Set(['click', 'dblclick', 'contextmenu', 'hover', 'longpress'])
export const LIVE_SCAN_ACTION_SELECTOR = '[data-agrune-action]'
export const LIVE_SCAN_GROUP_SELECTOR = '[data-agrune-group]'
export const LIVE_SCAN_DEFAULT_GROUP_ID = 'default'
export const LIVE_SCAN_DEFAULT_GROUP_NAME = 'Default'
export const DOM_SETTLE_TIMEOUT_MS = 320
export const DOM_SETTLE_QUIET_WINDOW_MS = 48
export const DOM_SETTLE_STABLE_FRAMES = 2
export const SNAPSHOT_RELEVANT_ATTRIBUTES = [
  'aria-modal',
  'class',
  'data-agrune-action',
  'data-agrune-canvas',
  'data-agrune-desc',
  'data-agrune-group',
  'data-agrune-group-desc',
  'data-agrune-group-name',
  'data-agrune-key',
  'data-agrune-meta',
  'data-agrune-name',
  'disabled',
  'hidden',
  'role',
  'style',
]

/** 기존 index 기반 delimiter — Phase 15-02 이전 경로에서 계속 사용 */
export const REPEATED_TARGET_ID_DELIMITER = '__agrune_idx_'

/**
 * Phase 15-02 (REPEAT-03): stable key 기반 targetId delimiter.
 * 형식: `{repeatId}__agrune_repeatKey_{key}.{baseTargetId}`
 * repeat 유래 descriptor에서만 사용 — index 기반보다 reorder-safe.
 */
export const REPEATED_TARGET_KEY_DELIMITER = '__agrune_repeatKey_'

// ---------------------------------------------------------------------------
// Descriptor collection
// ---------------------------------------------------------------------------

/**
 * RepeatExpander 싱글턴 — collectDescriptors 호출마다 재생성 방지.
 * module scope에 두어 tree shaking 시 번들에 포함되도록 한다.
 */
const _repeatExpander = new RepeatExpander()

export function collectDescriptors(manifest: AgruneManifest): TargetDescriptor[] {
  const result: TargetDescriptor[] = []

  for (const group of manifest.groups) {
    // --- 일반 targets (기존 경로) ---
    for (const target of group.targets) {
      const kinds = target.actionKinds.filter((k) => VALID_ACTIONS.has(k))
      if (kinds.length === 0) continue
      result.push({
        actionKinds: [...new Set(kinds)] as ActionKind[],
        groupId: group.groupId,
        groupName: group.name,
        groupDesc: group.desc,
        target,
      })
    }

    // --- repeat targets (Phase 15-02: RepeatExpander 경유) ---
    for (const repeat of group.repeats ?? []) {
      const { instances, logicalSize } = _expandRepeat(repeat)
      for (const instance of instances) {
        for (const target of repeat.targets) {
          const kinds = target.actionKinds.filter((k) => VALID_ACTIONS.has(k))
          if (kinds.length === 0) continue
          result.push({
            actionKinds: [...new Set(kinds)] as ActionKind[],
            groupId: group.groupId,
            groupName: group.name,
            groupDesc: group.desc,
            target,
            repeatInstance: {
              repeatId: repeat.repeatId,
              index: instance.index,
              key: instance.key,
            },
            _instanceEl: instance.el,
            _repeatStrategy: repeat.strategy,
            _repeatLogicalSize: logicalSize,
          })
        }
      }
    }
  }

  return result.sort((left, right) => left.target.targetId.localeCompare(right.target.targetId))
}

/**
 * ManifestRepeat → RepeatExpander 확장.
 * containerSelector가 있으면 resolveByLadder로 컨테이너 element 해석.
 * 항상 { instances, logicalSize } 형태로 반환 (DOM strategy는 logicalSize=null).
 */
function _expandRepeat(repeat: ManifestRepeat): { instances: ReturnType<RepeatExpander['expand']>; logicalSize: number | null } {
  // containerSelector가 있으면 해당 element를 scope으로 사용
  const containerEl = repeat.containerSelector
    ? (resolveByLadder(repeat.containerSelector as SelectorLadder)[0] ?? undefined)
    : undefined

  if (repeat.strategy === 'virtualized') {
    const result = _repeatExpander.expandVirtualized(repeat, containerEl)
    return { instances: result.instances, logicalSize: result.logicalSize }
  }
  return { instances: _repeatExpander.expand(repeat, containerEl), logicalSize: null }
}

export function collectLiveDescriptors(): TargetDescriptor[] {
  const result: TargetDescriptor[] = []
  const elements = document.querySelectorAll<HTMLElement>(LIVE_SCAN_ACTION_SELECTOR)

  elements.forEach((element, index) => {
    const rawAction = element.getAttribute('data-agrune-action') ?? ''
    const kinds = [...new Set(
      rawAction.split(',').map(a => a.trim()).filter(a => VALID_ACTIONS.has(a as ActionKind))
    )] as ActionKind[]
    if (kinds.length === 0) return

    const key = element.getAttribute('data-agrune-key')?.trim()
    const groupEl = element.closest<HTMLElement>(LIVE_SCAN_GROUP_SELECTOR)
    const groupId = groupEl?.getAttribute('data-agrune-group')?.trim() || LIVE_SCAN_DEFAULT_GROUP_ID

    result.push({
      actionKinds: kinds,
      groupId,
      groupName: groupEl?.getAttribute('data-agrune-group-name') || (
        groupId === LIVE_SCAN_DEFAULT_GROUP_ID ? LIVE_SCAN_DEFAULT_GROUP_NAME : groupId
      ),
      groupDesc: groupEl?.getAttribute('data-agrune-group-desc') || undefined,
      target: {
        targetId: key || `agrune_${index}`,
        name: element.getAttribute('data-agrune-name') ?? undefined,
        desc: element.getAttribute('data-agrune-desc') ?? undefined,
        actionKinds: kinds,
        // Legacy live scan wraps CSS selector in SelectorLadder — Phase 17에서 제거 예정
        selector: { css: buildLiveSelector(element) } as SelectorLadder,
        sourceFile: '',
        sourceLine: 0,
        sourceColumn: 0,
      },
    })
  })

  return result.sort((left, right) => left.target.targetId.localeCompare(right.target.targetId))
}

export function mergeDescriptors(
  manifestDescriptors: TargetDescriptor[],
  liveDescriptors: TargetDescriptor[],
): TargetDescriptor[] {
  if (liveDescriptors.length === 0) {
    return manifestDescriptors
  }

  const merged = new Map(
    manifestDescriptors.map(descriptor => [descriptor.target.targetId, descriptor] as const),
  )
  let changed = false

  for (const descriptor of liveDescriptors) {
    const existing = merged.get(descriptor.target.targetId)
    if (!existing) {
      merged.set(descriptor.target.targetId, descriptor)
      changed = true
      continue
    }

    merged.set(descriptor.target.targetId, {
      actionKinds: descriptor.actionKinds,
      groupId: descriptor.groupId,
      groupName: descriptor.groupName,
      groupDesc: descriptor.groupDesc,
      target: {
        ...existing.target,
        name: descriptor.target.name ?? existing.target.name,
        desc: descriptor.target.desc ?? existing.target.desc,
        selector: descriptor.target.selector,
      },
    })
    changed = true
  }

  if (!changed) {
    return manifestDescriptors
  }

  return Array.from(merged.values())
    .sort((left, right) => left.target.targetId.localeCompare(right.target.targetId))
}

// ---------------------------------------------------------------------------
// Element / target-id helpers
// ---------------------------------------------------------------------------

/**
 * descriptor → DOM element 목록 반환.
 *
 * Phase 15-02: repeat 확장 descriptor라면 _instanceEl(pre-resolved row element)을 직접 반환.
 * row 내부에서 target selector로 세부 element 탐색 가능 (css 있으면 scoped querySelector).
 * _instanceEl 없으면 기존 resolveByLadder 경로 (회귀 없음).
 */
export function findElements(descriptor: TargetDescriptor): HTMLElement[] {
  if (descriptor._instanceEl) {
    const rowEl = descriptor._instanceEl
    const ladder = descriptor.target.selector as SelectorLadder
    if (ladder.css) {
      const scoped = Array.from(rowEl.querySelectorAll<HTMLElement>(ladder.css))
      if (scoped.length > 0) return scoped
    }
    // row 자체를 element로 반환 (selector가 row와 동일한 경우)
    return [rowEl]
  }
  return resolveByLadder(descriptor.target.selector as SelectorLadder)
}

/**
 * runtime targetId 생성.
 *
 * - repeat key 기반 (REPEAT-03): `{repeatId}__agrune_repeatKey_{key}.{baseTargetId}`
 * - index 기반 (기존): `{baseTargetId}__agrune_idx_{index}` (total > 1인 경우)
 * - 단순 targetId: total <= 1 (기존)
 */
export function toRuntimeTargetId(
  baseTargetId: string,
  indexOrRepeat: number | { repeatId: string; key: string },
  total?: number,
): string {
  if (typeof indexOrRepeat === 'object') {
    // Phase 15-02: stable key 기반 targetId (reorder-safe)
    return `${indexOrRepeat.repeatId}${REPEATED_TARGET_KEY_DELIMITER}${indexOrRepeat.key}.${baseTargetId}`
  }
  // 기존 index 기반 경로
  const index = indexOrRepeat
  const resolvedTotal = total ?? 1
  if (resolvedTotal <= 1) {
    return baseTargetId
  }
  return `${baseTargetId}${REPEATED_TARGET_ID_DELIMITER}${index}`
}

export function parseRuntimeTargetId(targetId: string): {
  baseTargetId: string
  index: number
  hasExplicitIndex: boolean
} {
  const markerIndex = targetId.lastIndexOf(REPEATED_TARGET_ID_DELIMITER)
  if (markerIndex < 0) {
    return {
      baseTargetId: targetId,
      index: 0,
      hasExplicitIndex: false,
    }
  }

  const baseTargetId = targetId.slice(0, markerIndex)
  const indexText = targetId.slice(markerIndex + REPEATED_TARGET_ID_DELIMITER.length)
  const index = Number(indexText)
  if (!baseTargetId || !Number.isInteger(index) || index < 0) {
    return {
      baseTargetId: targetId,
      index: 0,
      hasExplicitIndex: false,
    }
  }

  return {
    baseTargetId,
    index,
    hasExplicitIndex: true,
  }
}

export function resolveRuntimeTarget(
  descriptors: TargetDescriptor[],
  requestedTargetId: string,
): RuntimeTargetMatch | null {
  const { baseTargetId, index } = parseRuntimeTargetId(requestedTargetId)
  const descriptor = descriptors.find(entry => entry.target.targetId === baseTargetId)
  if (!descriptor) {
    return null
  }

  const elements = findElements(descriptor)
  const element = elements[index]
  if (!element) {
    return null
  }

  return {
    descriptor,
    element,
    targetId: toRuntimeTargetId(baseTargetId, index, elements.length),
  }
}

// ---------------------------------------------------------------------------
// Target state capture
// ---------------------------------------------------------------------------

export function resolveTargetReason(input: {
  actionKinds: ActionKind[]
  visible: boolean
  inViewport: boolean
  enabled: boolean
  covered: boolean
  sensitive: boolean
}): PageTargetReason {
  if (!input.visible) {
    return 'hidden'
  }
  if (!input.inViewport) {
    return 'offscreen'
  }
  if (input.covered) {
    return 'covered'
  }
  if (!input.enabled) {
    return 'disabled'
  }
  if (input.actionKinds.includes('fill') && input.sensitive) {
    return 'sensitive'
  }
  return 'ready'
}

export function captureTargetState(
  actionKinds: ActionKind[],
  element: HTMLElement,
  isCanvasGroup: boolean = false,
): TargetState {
  const sensitive = isSensitive(element)
  const visible = isVisible(element)
  const inViewport = visible && isElementInViewport(element)
  const enabled = isEnabled(element)
  const covered = inViewport ? !isTopmostInteractable(element) : false
  // Canvas group targets remain actionableNow even when covered
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

export function captureTarget(
  descriptor: TargetDescriptor,
  element: HTMLElement,
  targetId: string,
  viewportTransform?: ViewportTransform,
): PageTarget {
  const isCanvasGroup = viewportTransform !== undefined
  const state = captureTargetState(descriptor.actionKinds, element, isCanvasGroup)
  const textContent = element.textContent?.trim() ?? ''
  const valuePreview =
    isFillableElement(element) && !state.sensitive ? element.value : null

  // 동적 속성(name/desc)이 null이면 DOM에서 읽는다
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
    sourceFile: descriptor.target.sourceFile ?? '',
    sourceLine: descriptor.target.sourceLine ?? 0,
    sourceColumn: descriptor.target.sourceColumn ?? 0,
    // Phase 15-02 (REPEAT-03): repeatInstance passthrough (T-15-11: _instanceEl은 제외)
    ...(descriptor.repeatInstance ? { repeatInstance: descriptor.repeatInstance } : {}),
  }
}

// ---------------------------------------------------------------------------
// Snapshot construction
// ---------------------------------------------------------------------------

function callMetaFunction(groupEl: HTMLElement): unknown | null {
  const fnName = groupEl.getAttribute('data-agrune-meta')?.trim()
  if (!fnName) return null

  const fn = (window as unknown as Record<string, unknown>)[fnName]
  if (typeof fn !== 'function') {
    console.warn(`[agrune] meta function not found: ${fnName}`)
    return null
  }

  try {
    const result = fn()
    JSON.stringify(result)  // verify serializable
    return result
  } catch (e) {
    console.error(`[agrune] meta function error: ${fnName}`, e)
    return null
  }
}

export function makeSnapshot(
  descriptors: TargetDescriptor[],
  store: MutableSnapshotStore,
): PageSnapshot {
  const canvasSelectors = new Map<string, string>()
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-agrune-canvas]'))) {
    const groupId = el.getAttribute('data-agrune-group')?.trim()
    const selector = el.getAttribute('data-agrune-canvas')?.trim()
    if (groupId && selector) canvasSelectors.set(groupId, selector)
  }

  function parseViewportTransform(groupId: string): ViewportTransform | undefined {
    const selector = canvasSelectors.get(groupId)
    if (!selector) return undefined
    const groupEl = document.querySelector<HTMLElement>(`[data-agrune-group="${groupId}"]`)
    const transformEl = groupEl?.querySelector<HTMLElement>(selector)
    if (!transformEl) return undefined
    const rect = transformEl.getBoundingClientRect()
    const style = window.getComputedStyle(transformEl)
    if (!style.transform || style.transform === 'none') return { translateX: Math.round(rect.left), translateY: Math.round(rect.top), scale: 1 }
    const m = new DOMMatrix(style.transform)
    return { translateX: Math.round(rect.left), translateY: Math.round(rect.top), scale: Math.round(m.a * 1000) / 1000 }
  }

  // Phase 15-02: repeat 유래 descriptor는 _instanceEl을 직접 사용
  // non-repeat descriptor는 기존 findElements → resolveByLadder 경로
  const targets = descriptors.flatMap(descriptor => {
    const elements = findElements(descriptor)
    const transform = canvasSelectors.has(descriptor.groupId)
      ? parseViewportTransform(descriptor.groupId)
      : undefined

    if (descriptor.repeatInstance) {
      // Repeat 유래: instanceEl 1개, stable key 기반 targetId
      return elements.map((element) =>
        captureTarget(
          descriptor,
          element,
          toRuntimeTargetId(descriptor.target.targetId, {
            repeatId: descriptor.repeatInstance!.repeatId,
            key: descriptor.repeatInstance!.key,
          }),
          transform,
        ),
      )
    }

    // 기존 경로 (회귀 없음)
    return elements.map((element, index) =>
      captureTarget(
        descriptor,
        element,
        toRuntimeTargetId(descriptor.target.targetId, index, elements.length),
        transform,
      ),
    )
  })

  // Phase 15-02: group별 repeat 집계 (PageSnapshotGroup.repeats 필드)
  // repeatId → { strategy, instanceCount, logicalSize }
  const groupRepeatsAgg = new Map<string, Map<string, {
    strategy: 'dom' | 'virtualized'
    instanceCount: number
    logicalSize: number | null
  }>>()

  for (const descriptor of descriptors) {
    if (!descriptor.repeatInstance) continue
    const { repeatId } = descriptor.repeatInstance
    if (!groupRepeatsAgg.has(descriptor.groupId)) {
      groupRepeatsAgg.set(descriptor.groupId, new Map())
    }
    const groupMap = groupRepeatsAgg.get(descriptor.groupId)!
    if (!groupMap.has(repeatId)) {
      groupMap.set(repeatId, {
        strategy: 'dom', // default — 아래에서 manifest에서 읽어올 수 없으므로 추적 필요
        instanceCount: 0,
        logicalSize: null,
      })
    }
    groupMap.get(repeatId)!.instanceCount += 1
  }

  // strategy/logicalSize를 descriptor에서 추적하기 위해 별도 Map
  // collectDescriptors가 repeatInstance에 strategy를 넣지 않으므로,
  // descriptor에 _repeatStrategy/_logicalSize를 추가하는 대신
  // 첫 descriptor의 _instanceEl로부터 container aria를 다시 읽는 것보다
  // collectDescriptors에서 메타를 보존하는 방식이 더 명확하다.
  // Phase 15-02 실용 결정: repeatMeta Map을 collectDescriptors에서 주입하는 대신
  // descriptor에 _repeatMeta 필드를 추가한다.
  // 현재 구현에서는 RepeatExpander.expandVirtualized가 logicalSize를 반환하므로
  // collectDescriptors가 이를 보존해야 한다 — 추가 필드 _repeatLogicalSize, _repeatStrategy.
  // 이 값들은 groupRepeatsAgg 집계에서 첫 번째 descriptor 기준으로 읽는다.

  const groups = new Map<string, {
    groupId: string
    groupName?: string
    groupDesc?: string
    targetIds: string[]
    viewportTransform?: ViewportTransform
    meta?: unknown
    repeats?: Array<{ repeatId: string; strategy: 'dom' | 'virtualized'; instanceCount: number; logicalSize: number | null }>
  }>()

  for (const target of targets) {
    const group = groups.get(target.groupId)
    if (group) {
      group.targetIds.push(target.targetId)
      continue
    }

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

  // Phase 15-02: groups에 repeats 필드 추가
  // descriptors에서 _repeatStrategy/_repeatLogicalSize를 첫 descriptor 기준으로 추출
  const repeatMetaByKey = new Map<string, { strategy: 'dom' | 'virtualized'; logicalSize: number | null }>()
  for (const descriptor of descriptors) {
    if (!descriptor.repeatInstance) continue
    const metaKey = `${descriptor.groupId}::${descriptor.repeatInstance.repeatId}`
    if (!repeatMetaByKey.has(metaKey)) {
      repeatMetaByKey.set(metaKey, {
        strategy: descriptor._repeatStrategy ?? 'dom',
        logicalSize: descriptor._repeatLogicalSize ?? null,
      })
    }
  }

  for (const [groupId, repeatMap] of groupRepeatsAgg) {
    const group = groups.get(groupId)
    if (!group) continue
    const repeatsArr = Array.from(repeatMap.entries()).map(([repeatId, agg]) => {
      const meta = repeatMetaByKey.get(`${groupId}::${repeatId}`)
      return {
        repeatId,
        strategy: meta?.strategy ?? agg.strategy,
        instanceCount: agg.instanceCount,
        logicalSize: meta?.logicalSize ?? agg.logicalSize,
      }
    })
    if (repeatsArr.length > 0) {
      group.repeats = repeatsArr
    }
  }

  const signature = JSON.stringify({
    targets: targets.map(target => ({
      actionKinds: target.actionKinds,
      actionableNow: target.actionableNow,
      covered: target.covered,
      enabled: target.enabled,
      inViewport: target.inViewport,
      reason: target.reason,
      sensitive: target.sensitive,
      targetId: target.targetId,
      textContent: target.textContent,
      valuePreview: target.valuePreview,
      visible: target.visible,
      // Phase 15-02: signature에 repeatInstance.key 포함 → row reorder 시 version 증가
      repeatInstance: target.repeatInstance,
    })),
    title: document.title,
    url: window.location.href,
  })

  if (store.signature !== signature) {
    store.version += 1
    store.signature = signature
  }

  const snapshot: PageSnapshot = {
    schemaVersion: 3,
    capturedAt: Date.now(),
    groups: Array.from(groups.values()).map(group => ({
      groupId: group.groupId,
      groupName: group.groupName,
      groupDesc: group.groupDesc,
      targetIds: group.targetIds.sort(),
      ...(group.viewportTransform ? { viewportTransform: group.viewportTransform } : {}),
      ...(group.meta !== undefined ? { meta: group.meta } : {}),
      ...(group.repeats && group.repeats.length > 0 ? { repeats: group.repeats } : {}),
    })),
    targets,
    title: document.title,
    url: window.location.href,
    version: store.version,
  }

  store.latest = snapshot
  return snapshot
}

// ---------------------------------------------------------------------------
// Snapshot query helpers
// ---------------------------------------------------------------------------

export function isRunnableSnapshotTarget(target: PageTarget): boolean {
  return target.actionableNow === true
}

export function isOverlayFlowLocked(snapshot: PageSnapshot): boolean {
  return snapshot.targets.some(target => target.overlay && isRunnableSnapshotTarget(target))
}

export function findSnapshotTarget(
  snapshot: PageSnapshot,
  targetId: string,
): PageTarget | undefined {
  return snapshot.targets.find(target => target.targetId === targetId)
}

// ---------------------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------------------

export function buildFlowBlockedResult(
  commandId: string,
  snapshot: PageSnapshot,
  targetId: string,
): CommandResult {
  return buildErrorResult(
    commandId,
    'FLOW_BLOCKED',
    `target is blocked by active overlay flow: ${targetId}`,
    snapshot,
    targetId,
  )
}

export function buildErrorResult(
  commandId: string,
  code: Parameters<typeof createCommandError>[0],
  message: string,
  snapshot: PageSnapshot,
  targetId?: string,
): CommandResult {
  return {
    commandId,
    error: createCommandError(code, message, {
      snapshotVersion: snapshot.version,
      targetId,
    }),
    ok: false,
    snapshotVersion: snapshot.version,
    snapshot,
  }
}

export function buildSuccessResult(
  commandId: string,
  snapshot: PageSnapshot,
  result: Record<string, unknown>,
): CommandResult {
  return {
    commandId,
    ok: true,
    result,
    snapshotVersion: snapshot.version,
    snapshot,
  }
}
