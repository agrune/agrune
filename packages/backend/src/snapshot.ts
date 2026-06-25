import type { Locator, Page } from 'playwright'
import type {
  CanvasViewportTransform,
  PageSnapshot,
  PageSnapshotGroup,
  PageTarget,
  PageTargetReason,
  ViewportTransform,
} from '@agrune/core'
import {
  REPEATED_TARGET_KEY_DELIMITER,
  normalizeAgentTargetId,
  toAgentTargetRef,
  viewportToCanvas,
} from '@agrune/core'
import type {
  AgruneManifest,
  ManifestGroup,
  ManifestRepeat,
  ManifestTarget,
  SelectorLadder,
} from '@agrune/manifest'
import { resolveLocator, resolveLocatorMulti } from './locator.js'
import { routeApplies } from './manifest-loader.js'
import {
  REPEAT_MAX_INSTANCES,
  captureElementState,
  expandRepeatRows,
  readCanvasTransformInBrowser,
  readContainerLogicalSize,
  type CanvasTransformResult,
  type ElementCapturedState,
  type RepeatRow,
} from './page-functions.js'

export interface SnapshotTargetFilterOptions {
  groupId?: string
  groupIds?: string[]
  targetRef?: string
}

/**
 * Mutable snapshot version store — ports the runtime `MutableSnapshotStore`
 * semantics: the version only advances when the captured target signature
 * actually changes, so an unchanged page keeps a stable snapshot version.
 */
export interface SnapshotStore {
  version: number
  signature: string | null
}

export function createSnapshotStore(): SnapshotStore {
  return { version: 0, signature: null }
}

export async function buildSnapshotFromManifest(
  page: Page,
  manifest: AgruneManifest,
  store: SnapshotStore,
): Promise<PageSnapshot> {
  const url = page.url()
  const title = await page.title().catch(() => '')
  const groups: PageSnapshotGroup[] = []
  const targets: PageTarget[] = []

  for (const group of manifest.groups) {
    if (!routeApplies(group.route, url)) continue

    // Canvas groups: read the live pan/zoom transform once so each node's center
    // can be surfaced in STABLE canvas coordinates (coordSpace:'canvas') rather
    // than pan-dependent viewport px, and so the agent sees the current pan/zoom.
    const canvasTransform = group.canvas ? await readCanvasTransform(page, group.canvas) : null

    // Target inspections are independent DOM reads; run them concurrently while
    // preserving manifest order (direct targets, then each repeat's instances).
    const directTargets = await Promise.all(
      group.targets.map(target => inspectTarget(page, group, target, target.targetId, canvasTransform)),
    )

    const repeatResults = await Promise.all(
      (group.repeats ?? []).map(async repeat => {
        const instances = (
          await Promise.all(
            repeat.targets.map(target => inspectRepeatTarget(page, group, repeat, target, canvasTransform)),
          )
        ).flat()
        return {
          instances,
          summary: {
            repeatId: repeat.repeatId,
            strategy: repeat.strategy,
            instanceCount: instances.length,
            logicalSize: await readRepeatLogicalSize(page, repeat),
          },
        }
      }),
    )

    const groupTargets = [...directTargets, ...repeatResults.flatMap(result => result.instances)]

    const viewportTransform: ViewportTransform | undefined = canvasTransform
      ? {
          translateX: canvasTransform.translateX,
          translateY: canvasTransform.translateY,
          scale: canvasTransform.scale,
        }
      : undefined

    groups.push({
      groupId: group.groupId,
      groupName: group.name,
      groupDesc: group.desc,
      targetIds: groupTargets.map(target => target.targetId),
      ...(viewportTransform ? { viewportTransform } : {}),
      ...(repeatResults.length > 0 ? { repeats: repeatResults.map(result => result.summary) } : {}),
    })
    targets.push(...groupTargets)
  }

  const signature = JSON.stringify({
    targets: targets.map(target => ({
      actionKinds: target.actionKinds,
      actionableNow: target.actionableNow,
      covered: target.covered,
      domResolved: target.domResolved,
      enabled: target.enabled,
      // Presence-only fill signal so a sensitive fill (valuePreview stays null to
      // avoid leaking the secret) still counts as a screen change.
      hasValue: target.hasValue,
      inViewport: target.inViewport,
      reason: target.reason,
      sensitive: target.sensitive,
      targetId: target.targetId,
      // Volatile targets (clocks, live counters, relative timestamps) self-update;
      // their text/value must NOT count as a screen change, or every action would
      // look like it changed the page (corrupting the onSuccess/onNoEffect gate).
      textContent: target.volatile ? undefined : target.textContent,
      valuePreview: target.volatile ? undefined : target.valuePreview,
      visible: target.visible,
      repeatInstance: target.repeatInstance,
    })),
    title,
    url,
  })

  if (store.signature !== signature) {
    store.version += 1
    store.signature = signature
  }

  return {
    schemaVersion: 3,
    version: store.version,
    capturedAt: Date.now(),
    url,
    title,
    groups,
    targets,
  }
}

/**
 * Read a canvas viewport's live transform + pane rect. Shared by snapshot build
 * (to surface stable canvas coords) and the driver's drag dispatch (to convert a
 * canvas destination to viewport px). Null when the viewport/pane is absent.
 */
export async function readCanvasTransform(
  page: Page,
  canvas: { viewportSelector: string; paneSelector?: string },
): Promise<CanvasTransformResult | null> {
  return page
    .evaluate(readCanvasTransformInBrowser, {
      viewportSelector: canvas.viewportSelector,
      paneSelector: canvas.paneSelector ?? null,
    })
    .catch(() => null)
}

async function readRepeatLogicalSize(page: Page, repeat: ManifestRepeat): Promise<number | null> {
  if (repeat.strategy !== 'virtualized' || !repeat.containerSelector) return null
  const container = await resolveLocator(page, repeat.containerSelector as SelectorLadder)
  if (!container) return null
  return container.locator.first().evaluate(readContainerLogicalSize).catch(() => null)
}

async function inspectRepeatTarget(
  page: Page,
  group: ManifestGroup,
  repeat: ManifestRepeat,
  target: ManifestTarget,
  canvasTransform: CanvasViewportTransform | null = null,
): Promise<PageTarget[]> {
  // resolveLocatorMulti (not resolveLocator) so every matching row is enumerated;
  // resolveLocator's `.first()` would collapse the repeat to one instance.
  const resolved = await resolveLocatorMulti(page, target.selector)
  if (!resolved) return []

  const rows: RepeatRow[] = await resolved.locator
    .evaluateAll(expandRepeatRows, {
      keyFrom: repeat.keyFrom,
      nameFrom: repeat.nameFrom ?? null,
      virtualized: repeat.strategy === 'virtualized',
      maxInstances: REPEAT_MAX_INSTANCES,
    })
    .catch(() => [])

  const results: PageTarget[] = []
  for (const row of rows) {
    const targetId = `${repeat.repeatId}${REPEATED_TARGET_KEY_DELIMITER}${row.key}.${target.targetId}`
    results.push(await inspectLocator(group, target, targetId, resolved.locator.nth(row.domIndex), {
      repeatInstance: { repeatId: repeat.repeatId, index: row.index, key: row.key },
      displayName: row.name || target.name,
      canvasTransform,
    }))
  }

  return results
}

async function inspectTarget(
  page: Page,
  group: ManifestGroup,
  target: ManifestTarget,
  targetId: string,
  canvasTransform: CanvasViewportTransform | null = null,
): Promise<PageTarget> {
  const resolved = await resolveLocator(page, target.selector)
  if (!resolved) {
    return missingTarget(group, target, targetId)
  }
  return inspectLocator(group, target, targetId, resolved.locator, { canvasTransform })
}

async function inspectLocator(
  group: ManifestGroup,
  target: ManifestTarget,
  targetId: string,
  locator: Locator,
  opts: {
    repeatInstance?: PageTarget['repeatInstance']
    displayName?: string
    canvasTransform?: CanvasViewportTransform | null
  } = {},
): Promise<PageTarget> {
  const state: ElementCapturedState | null = await locator
    .evaluate(captureElementState, {
      sensitiveFlag: target.sensitive === true,
      fillAction: target.actionKinds.includes('fill'),
    })
    .catch(() => null)

  if (!state) {
    return missingTarget(group, target, targetId, opts)
  }

  // Canvas groups surface centers in STABLE canvas coordinates (so the agent can
  // supply pan-independent destinationCoords); plain groups keep viewport px.
  let center = state.center
  let coordSpace: 'viewport' | 'canvas' = 'viewport'
  if (state.center && opts.canvasTransform) {
    const c = viewportToCanvas(state.center.x, state.center.y, opts.canvasTransform)
    center = { x: Math.round(c.x), y: Math.round(c.y) }
    coordSpace = 'canvas'
  }

  return {
    targetId,
    groupId: group.groupId,
    groupName: group.name,
    groupDesc: group.desc,
    name: opts.displayName ?? target.name ?? target.targetId,
    description: target.desc ?? '',
    actionKinds: target.actionKinds,
    selector: target.selector,
    visible: state.visible,
    inViewport: state.inViewport,
    enabled: state.enabled,
    covered: state.covered,
    actionableNow: state.actionableNow,
    reason: state.reason as PageTargetReason,
    overlay: state.overlay,
    sensitive: state.sensitive,
    textContent: state.textContent || undefined,
    valuePreview: state.valuePreview,
    hasValue: state.hasValue,
    center,
    size: state.size,
    ...(state.center ? { coordSpace } : {}),
    sourceFile: 'page-manifest',
    sourceLine: 0,
    sourceColumn: 0,
    domResolved: true,
    repeatInstance: opts.repeatInstance,
    ...(target.onSuccess ? { onSuccess: target.onSuccess } : {}),
    ...(target.onNoEffect ? { onNoEffect: target.onNoEffect } : {}),
    ...(target.volatile ? { volatile: true } : {}),
    ...(target.required || state.required ? { required: true } : {}),
  }
}

function missingTarget(
  group: ManifestGroup,
  target: ManifestTarget,
  targetId: string,
  opts: {
    repeatInstance?: PageTarget['repeatInstance']
    displayName?: string
  } = {},
): PageTarget {
  return {
    targetId,
    groupId: group.groupId,
    groupName: group.name,
    groupDesc: group.desc,
    name: opts.displayName ?? target.name ?? target.targetId,
    description: target.desc ?? '',
    actionKinds: target.actionKinds,
    selector: target.selector,
    visible: false,
    inViewport: false,
    enabled: false,
    covered: false,
    actionableNow: false,
    reason: 'hidden',
    overlay: false,
    sensitive: target.sensitive === true,
    valuePreview: null,
    hasValue: false,
    sourceFile: 'page-manifest',
    sourceLine: 0,
    sourceColumn: 0,
    domResolved: false,
    repeatInstance: opts.repeatInstance,
    ...(target.onSuccess ? { onSuccess: target.onSuccess } : {}),
    ...(target.onNoEffect ? { onNoEffect: target.onNoEffect } : {}),
    ...(target.volatile ? { volatile: true } : {}),
    ...(target.required ? { required: true } : {}),
  }
}

export function filterSnapshot(snapshot: PageSnapshot, options: SnapshotTargetFilterOptions = {}): PageSnapshot {
  const filter = resolveTargetFilter(options)
  if (filter.requestedGroupIds.size === 0 && !filter.requestedTargetId) return snapshot

  const targets = filterTargets(snapshot.targets, filter)
  const targetIds = new Set(targets.map(target => target.targetId))
  const targetGroupIds = new Set(targets.map(target => target.groupId))
  const groups = snapshot.groups
    .filter(group => {
      if (filter.requestedGroupIds.size > 0) return filter.requestedGroupIds.has(group.groupId)
      return targetGroupIds.has(group.groupId)
    })
    .map(group => ({
      ...group,
      targetIds: group.targetIds.filter(targetId => targetIds.has(targetId)),
    }))

  return { ...snapshot, groups, targets }
}

export function formatSnapshot(snapshot: PageSnapshot, options: SnapshotTargetFilterOptions & {
  full?: boolean
  includeTextContent?: boolean
} = {}): string {
  const lines = [
    '### Page',
    `- Page URL: ${snapshot.url}`,
    `- Page Title: ${snapshot.title}`,
    `- Snapshot Version: ${snapshot.version}`,
    '### Snapshot',
    '```yaml',
  ]

  const filter = resolveTargetFilter(options)
  const filteredSnapshot = filterSnapshot(snapshot, options)
  if (options.full || filter.requestedGroupIds.size > 0 || filter.requestedTargetId) {
    for (const target of filteredSnapshot.targets) {
      lines.push(`- target ${quote(target.name)} [ref=${toAgentTargetRef(target)}]:`)
      if (target.description) lines.push(`  - description: ${quote(target.description)}`)
      lines.push(`  - group: ${quote(target.groupId)}`)
      if (target.reason !== 'ready') lines.push(`  - reason: ${target.reason}`)
      if (target.textContent && options.includeTextContent) lines.push(`  - text: ${quote(target.textContent)}`)
    }
  } else {
    for (const group of filteredSnapshot.groups) {
      lines.push(`- group ${quote(group.groupName ?? group.groupId)} [ref=${group.groupId}]:`)
      if (group.groupDesc) lines.push(`  - description: ${quote(group.groupDesc)}`)
      lines.push(`  - targets: ${group.targetIds.length}`)
    }
  }

  if (lines[lines.length - 1] === '```yaml') lines.push('- none')
  lines.push('```')
  return lines.join('\n')
}

function resolveTargetFilter(options: SnapshotTargetFilterOptions): {
  requestedGroupIds: Set<string>
  requestedTargetId?: string
} {
  return {
    requestedGroupIds: new Set([
      ...(options.groupId ? [options.groupId] : []),
      ...(options.groupIds ?? []),
    ].map(groupId => groupId.trim()).filter(Boolean)),
    requestedTargetId: options.targetRef ? normalizeAgentTargetId(options.targetRef) : undefined,
  }
}

function filterTargets(
  targets: PageTarget[],
  filter: { requestedGroupIds: Set<string>; requestedTargetId?: string },
): PageTarget[] {
  return targets.filter(target => {
    if (filter.requestedTargetId && target.targetId !== filter.requestedTargetId) return false
    if (filter.requestedGroupIds.size > 0 && !filter.requestedGroupIds.has(target.groupId)) return false
    return true
  })
}

function quote(value: string): string {
  return JSON.stringify(value)
}
