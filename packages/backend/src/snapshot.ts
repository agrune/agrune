import type { Locator, Page } from 'playwright'
import type {
  PageSnapshot,
  PageSnapshotGroup,
  PageTarget,
  PageTargetReason,
} from '@agrune/core'
import {
  REPEATED_TARGET_KEY_DELIMITER,
  normalizeAgentTargetId,
  toAgentTargetRef,
} from '@agrune/core'
import type {
  AgruneManifest,
  ManifestGroup,
  ManifestRepeat,
  ManifestTarget,
  SelectorLadder,
} from '@agrune/manifest'
import { resolveLocator } from './locator.js'
import { routeApplies } from './manifest-loader.js'
import {
  REPEAT_MAX_INSTANCES,
  captureElementState,
  expandRepeatRows,
  readContainerLogicalSize,
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

    const groupTargets: PageTarget[] = []
    for (const target of group.targets) {
      groupTargets.push(await inspectTarget(page, group, target, target.targetId))
    }

    const repeatSummaries: NonNullable<PageSnapshotGroup['repeats']> = []
    for (const repeat of group.repeats ?? []) {
      const before = groupTargets.length
      for (const target of repeat.targets) {
        groupTargets.push(...await inspectRepeatTarget(page, group, repeat, target))
      }
      repeatSummaries.push({
        repeatId: repeat.repeatId,
        strategy: repeat.strategy,
        instanceCount: groupTargets.length - before,
        logicalSize: await readRepeatLogicalSize(page, repeat),
      })
    }

    groups.push({
      groupId: group.groupId,
      groupName: group.name,
      groupDesc: group.desc,
      targetIds: groupTargets.map(target => target.targetId),
      ...(repeatSummaries.length > 0 ? { repeats: repeatSummaries } : {}),
    })
    targets.push(...groupTargets)
  }

  const signature = JSON.stringify({
    targets: targets.map(target => ({
      actionKinds: target.actionKinds,
      actionableNow: target.actionableNow,
      covered: target.covered,
      domResolved: (target as PageTarget & { domResolved?: boolean }).domResolved,
      enabled: target.enabled,
      inViewport: target.inViewport,
      reason: target.reason,
      sensitive: target.sensitive,
      targetId: target.targetId,
      textContent: target.textContent,
      valuePreview: target.valuePreview,
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
): Promise<PageTarget[]> {
  const resolved = await resolveLocator(page, target.selector)
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
    }))
  }

  return results
}

async function inspectTarget(
  page: Page,
  group: ManifestGroup,
  target: ManifestTarget,
  targetId: string,
): Promise<PageTarget> {
  const resolved = await resolveLocator(page, target.selector)
  if (!resolved) {
    return missingTarget(group, target, targetId)
  }
  return inspectLocator(group, target, targetId, resolved.locator)
}

async function inspectLocator(
  group: ManifestGroup,
  target: ManifestTarget,
  targetId: string,
  locator: Locator,
  opts: {
    repeatInstance?: PageTarget['repeatInstance']
    displayName?: string
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
    center: state.center,
    size: state.size,
    ...(state.center ? { coordSpace: 'viewport' as const } : {}),
    sourceFile: 'page-manifest',
    sourceLine: 0,
    sourceColumn: 0,
    domResolved: true,
    repeatInstance: opts.repeatInstance,
  } as PageTarget & { domResolved: true }
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
    sourceFile: 'page-manifest',
    sourceLine: 0,
    sourceColumn: 0,
    domResolved: false,
    repeatInstance: opts.repeatInstance,
  } as PageTarget & { domResolved: false }
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
