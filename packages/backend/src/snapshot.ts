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
} from '@agrune/manifest'
import { resolveLocator } from './locator.js'
import { routeApplies } from './manifest-loader.js'

const MAX_REPEAT_INSTANCES_PER_TARGET = 250

export interface SnapshotTargetFilterOptions {
  groupId?: string
  groupIds?: string[]
  targetRef?: string
}

export interface SnapshotBuildOptions {
  version: number
}

export async function buildSnapshotFromManifest(
  page: Page,
  manifest: AgruneManifest,
  options: SnapshotBuildOptions,
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
        logicalSize: null,
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

  return {
    schemaVersion: 3,
    version: options.version,
    capturedAt: Date.now(),
    url,
    title,
    groups,
    targets,
  }
}

async function inspectRepeatTarget(
  page: Page,
  group: ManifestGroup,
  repeat: ManifestRepeat,
  target: ManifestTarget,
): Promise<PageTarget[]> {
  const resolved = await resolveLocator(page, target.selector)
  if (!resolved) return []

  const count = Math.min(
    await resolved.locator.count().catch(() => 0),
    MAX_REPEAT_INSTANCES_PER_TARGET,
  )
  const results: PageTarget[] = []

  for (let index = 0; index < count; index += 1) {
    const locator = resolved.locator.nth(index)
    const key = await evaluateRepeatExpression(locator, repeat.keyFrom)
    if (!key) continue
    const targetId = `${repeat.repeatId}${REPEATED_TARGET_KEY_DELIMITER}${key}.${target.targetId}`
    const name = repeat.nameFrom
      ? await evaluateRepeatExpression(locator, repeat.nameFrom).catch(() => '')
      : ''

    results.push(await inspectLocator(group, target, targetId, locator, {
      repeatInstance: { repeatId: repeat.repeatId, index, key },
      displayName: name || target.name,
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
    return baseTarget(group, target, targetId, {
      visible: false,
      enabled: false,
      inViewport: false,
      reason: 'hidden',
    })
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
  const visible = await locator.isVisible().catch(() => false)
  const enabled = await locator.isEnabled().catch(() => false)
  const box = visible ? await locator.boundingBox().catch(() => null) : null
  const textContent = await locator.evaluate((el) => (el.textContent ?? '').trim()).catch(() => '')
  const valuePreview = await locator.evaluate((el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return el.value
    }
    return null
  }).catch(() => null)
  const inViewport = Boolean(box)
  const reason = getTargetReason({ visible, enabled, inViewport })

  return baseTarget(group, target, targetId, {
    visible,
    enabled,
    inViewport,
    reason,
    textContent: textContent || undefined,
    valuePreview,
    center: box
      ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      : undefined,
    size: box ? { w: box.width, h: box.height } : undefined,
    repeatInstance: opts.repeatInstance,
    displayName: opts.displayName,
  })
}

function baseTarget(
  group: ManifestGroup,
  target: ManifestTarget,
  targetId: string,
  state: {
    visible: boolean
    enabled: boolean
    inViewport: boolean
    reason: PageTargetReason
    textContent?: string
    valuePreview?: string | null
    center?: { x: number; y: number }
    size?: { w: number; h: number }
    repeatInstance?: PageTarget['repeatInstance']
    displayName?: string
  },
): PageTarget {
  return {
    targetId,
    groupId: group.groupId,
    groupName: group.name,
    groupDesc: group.desc,
    name: state.displayName ?? target.name ?? target.targetId,
    description: target.desc ?? '',
    actionKinds: target.actionKinds,
    selector: target.selector,
    visible: state.visible,
    inViewport: state.inViewport,
    enabled: state.enabled,
    covered: false,
    actionableNow: state.visible && state.enabled && state.inViewport,
    reason: state.reason,
    overlay: false,
    sensitive: target.sensitive === true,
    textContent: state.textContent,
    valuePreview: state.valuePreview,
    center: state.center,
    size: state.size,
    sourceFile: 'page-manifest',
    sourceLine: 0,
    sourceColumn: 0,
    repeatInstance: state.repeatInstance,
  }
}

function getTargetReason(input: {
  visible: boolean
  enabled: boolean
  inViewport: boolean
}): PageTargetReason {
  if (!input.visible) return 'hidden'
  if (!input.inViewport) return 'offscreen'
  if (!input.enabled) return 'disabled'
  return 'ready'
}

async function evaluateRepeatExpression(locator: Locator, expression: string): Promise<string> {
  return locator.evaluate(
    (el, expr) => {
      const fn = new Function('el', `return String(${expr})`) as (el: Element) => string
      return fn(el).trim()
    },
    expression,
  )
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
