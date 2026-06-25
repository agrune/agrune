// Snapshot build + outline/full serializer. SPEC §4, A.7.
//
// The token-saving differentiator. Builds a manifest-derived PageSnapshot (only author-declared
// targets) and serializes it in outline (groups + counts — cheap default) or full (per-target)
// mode. formatSnapshot is reproduced VERBATIM (A.7 golden conformance vector). Canvas
// coordinate machinery is dropped from the lean core (§10.2); the a11y escape hatch
// (ariaSnapshot) stays a thin pass-through.

import type { Locator, Page } from 'playwright'
import {
  resolveLocator,
  resolveLocatorMulti,
  routeApplies,
  loadManifestFromPage,
} from './resolver.js'
import {
  REPEATED_TARGET_KEY_DELIMITER,
  normalizeAgentTargetId,
  toAgentTargetRef,
} from './target-ref.js'
import { CliError } from './errors.js'
import type {
  AgruneManifest,
  ManifestGroup,
  ManifestRepeat,
  ManifestTarget,
  ActionKind,
  SelectorLadder,
} from './manifest.js'
import {
  REPEAT_MAX_INSTANCES,
  captureElementState,
  expandRepeatRows,
  readContainerLogicalSize,
  type ElementCapturedState,
  type RepeatRow,
} from './page-functions.js'

// ---- types (§4.1) ----------------------------------------------------------

export type PageTargetReason = 'ready' | 'hidden' | 'offscreen' | 'covered' | 'disabled' | 'sensitive'

export interface PageTarget {
  targetId: string
  groupId: string
  groupName?: string
  groupDesc?: string
  name: string
  description: string
  actionKinds: ActionKind[]
  selector: SelectorLadder
  visible: boolean
  inViewport: boolean
  enabled: boolean
  covered: boolean
  actionableNow: boolean
  reason: PageTargetReason
  overlay: boolean
  sensitive: boolean
  textContent?: string
  valuePreview?: string | null
  center?: { x: number; y: number }
  size?: { w: number; h: number }
  coordSpace?: 'viewport' | 'canvas'
  sourceFile: string
  sourceLine: number
  sourceColumn: number
  domResolved?: boolean
  repeatInstance?: { repeatId: string; index: number; key: string }
  onSuccess?: string
  onNoEffect?: string
  volatile?: boolean
  hasValue?: boolean
  required?: boolean
}

export interface PageSnapshotGroup {
  groupId: string
  groupName?: string
  groupDesc?: string
  targetIds: string[]
  meta?: unknown
  repeats?: Array<{
    repeatId: string
    strategy: 'dom' | 'virtualized'
    instanceCount: number
    logicalSize: number | null
  }>
}

export interface PageSnapshot {
  schemaVersion: 3
  version: number
  capturedAt: number
  url: string
  title: string
  groups: PageSnapshotGroup[]
  targets: PageTarget[]
}

export interface SnapshotTargetFilterOptions {
  groupId?: string
  groupIds?: string[]
  targetRef?: string
}

// ---- snapshot store (§4.4) -------------------------------------------------

export interface SnapshotStore {
  version: number
  signature: string | null
}

export function createSnapshotStore(): SnapshotStore {
  return { version: 0, signature: null }
}

// ---- build (§4.4) ----------------------------------------------------------

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

    const directTargets = await Promise.all(
      group.targets.map((target) => inspectTarget(page, group, target, target.targetId)),
    )

    const repeatResults = await Promise.all(
      (group.repeats ?? []).map(async (repeat) => {
        const instances = (
          await Promise.all(repeat.targets.map((target) => inspectRepeatTarget(page, group, repeat, target)))
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

    const groupTargets = [...directTargets, ...repeatResults.flatMap((r) => r.instances)]

    groups.push({
      groupId: group.groupId,
      groupName: group.name,
      groupDesc: group.desc,
      targetIds: groupTargets.map((t) => t.targetId),
      ...(repeatResults.length > 0 ? { repeats: repeatResults.map((r) => r.summary) } : {}),
    })
    targets.push(...groupTargets)
  }

  // Signature (§4.4) — version advances only when a meaningful target field changes. Volatile
  // text/value excluded; sensitive valuePreview stays null but hasValue still counts.
  const signature = JSON.stringify({
    targets: targets.map((target) => ({
      actionKinds: target.actionKinds,
      actionableNow: target.actionableNow,
      covered: target.covered,
      domResolved: target.domResolved,
      enabled: target.enabled,
      hasValue: target.hasValue,
      inViewport: target.inViewport,
      reason: target.reason,
      sensitive: target.sensitive,
      targetId: target.targetId,
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

async function readRepeatLogicalSize(page: Page, repeat: ManifestRepeat): Promise<number | null> {
  if (repeat.strategy !== 'virtualized' || !repeat.containerSelector) return null
  const container = await resolveLocator(page, repeat.containerSelector)
  if (!container) return null
  return container.locator.first().evaluate(readContainerLogicalSize).catch(() => null)
}

async function inspectRepeatTarget(
  page: Page,
  group: ManifestGroup,
  repeat: ManifestRepeat,
  target: ManifestTarget,
): Promise<PageTarget[]> {
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
    results.push(
      await inspectLocator(group, target, targetId, resolved.locator.nth(row.domIndex), {
        repeatInstance: { repeatId: repeat.repeatId, index: row.index, key: row.key },
        displayName: row.name || target.name,
      }),
    )
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
  if (!resolved) return missingTarget(group, target, targetId)
  return inspectLocator(group, target, targetId, resolved.locator)
}

async function inspectLocator(
  group: ManifestGroup,
  target: ManifestTarget,
  targetId: string,
  locator: Locator,
  opts: { repeatInstance?: PageTarget['repeatInstance']; displayName?: string } = {},
): Promise<PageTarget> {
  const state: ElementCapturedState | null = await locator
    .evaluate(captureElementState, {
      sensitiveFlag: target.sensitive === true,
      fillAction: target.actionKinds.includes('fill'),
    })
    .catch(() => null)

  if (!state) return missingTarget(group, target, targetId, opts)

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
    center: state.center,
    size: state.size,
    ...(state.center ? { coordSpace: 'viewport' as const } : {}),
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
  opts: { repeatInstance?: PageTarget['repeatInstance']; displayName?: string } = {},
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

// ---- filter (§4.3) ---------------------------------------------------------

export function filterSnapshot(
  snapshot: PageSnapshot,
  options: SnapshotTargetFilterOptions = {},
): PageSnapshot {
  const filter = resolveTargetFilter(options)
  if (filter.requestedGroupIds.size === 0 && !filter.requestedTargetId) return snapshot

  const targets = filterTargets(snapshot.targets, filter)
  const targetIds = new Set(targets.map((t) => t.targetId))
  const targetGroupIds = new Set(targets.map((t) => t.groupId))
  const groups = snapshot.groups
    .filter((group) => {
      if (filter.requestedGroupIds.size > 0) return filter.requestedGroupIds.has(group.groupId)
      return targetGroupIds.has(group.groupId)
    })
    .map((group) => ({
      ...group,
      targetIds: group.targetIds.filter((targetId) => targetIds.has(targetId)),
    }))

  return { ...snapshot, groups, targets }
}

function resolveTargetFilter(options: SnapshotTargetFilterOptions): {
  requestedGroupIds: Set<string>
  requestedTargetId?: string
} {
  return {
    requestedGroupIds: new Set(
      [...(options.groupId ? [options.groupId] : []), ...(options.groupIds ?? [])]
        .map((groupId) => groupId.trim())
        .filter(Boolean),
    ),
    requestedTargetId: options.targetRef ? normalizeAgentTargetId(options.targetRef) : undefined,
  }
}

function filterTargets(
  targets: PageTarget[],
  filter: { requestedGroupIds: Set<string>; requestedTargetId?: string },
): PageTarget[] {
  return targets.filter((target) => {
    if (filter.requestedTargetId && target.targetId !== filter.requestedTargetId) return false
    if (filter.requestedGroupIds.size > 0 && !filter.requestedGroupIds.has(target.groupId)) return false
    return true
  })
}

// ---- serializer (§4.2 / A.7 — VERBATIM) ------------------------------------

export function formatSnapshot(
  snapshot: PageSnapshot,
  options: SnapshotTargetFilterOptions & { full?: boolean; includeTextContent?: boolean } = {},
): string {
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
      if (target.textContent && options.includeTextContent) {
        lines.push(`  - text: ${quote(target.textContent)}`)
      }
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

function quote(value: string): string {
  return JSON.stringify(value)
}

// ---- snapshot service (daemon-side) ----------------------------------------

/**
 * Build a manifest snapshot for a page (empty snapshot when no manifest is present, so the
 * a11y-driven path still produces a versioned, `- none` outline). §4.4.
 */
export async function refreshSnapshot(
  page: Page,
  store: SnapshotStore,
): Promise<PageSnapshot> {
  let manifest: AgruneManifest
  try {
    manifest = await loadManifestFromPage(page)
  } catch (error) {
    if (error instanceof CliError && error.code === 'MANIFEST_NOT_FOUND') {
      manifest = { version: 3, groups: [] }
    } else {
      throw error
    }
  }
  return buildSnapshotFromManifest(page, manifest, store)
}

export interface AriaSnapshotOptions {
  target?: string
  mode?: 'ai' | 'default'
  depth?: number
}

/** The a11y escape hatch — thin pass-through to Playwright's public ariaSnapshot. §4.4. */
export async function ariaSnapshot(
  page: Page,
  resolveTarget: (ref: string) => Promise<Locator>,
  opts: AriaSnapshotOptions = {},
): Promise<{ text: string; mode: 'ai' | 'default'; target?: string; depth?: number }> {
  const mode = opts.mode ?? 'ai'
  const scope = opts.target ? await resolveTarget(opts.target) : page.locator('body')
  const text = await scope.ariaSnapshot()
  return {
    text,
    mode,
    ...(opts.target ? { target: opts.target } : {}),
    ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
  }
}
