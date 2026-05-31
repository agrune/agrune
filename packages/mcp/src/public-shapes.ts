import type {
  CommandErrorShape,
  CommandResult,
  PageSnapshot,
  PageSnapshotGroup,
  PageTarget,
  Session,
} from '@agrune/core'
import { toAgentTargetRef } from './target-id-normalizer'

export interface PublicSession {
  tabId: number
  url: string
  title: string
  hasSnapshot: boolean
  snapshotVersion: number | null
  active: boolean
}

export interface PublicSnapshotGroup {
  groupId: string
  groupName?: string
  groupDesc?: string
  targetCount: number
  sampleTargetNames: string[]
  meta?: unknown
}

export interface PublicSnapshotTarget {
  ref: string
  groupId: string
  name: string
  description: string
  reason?: PageTarget['reason']
  sensitive?: boolean
  unresolved?: boolean
  textContent?: string
  center?: { x: number; y: number }
  size?: { w: number; h: number }
  coordSpace?: 'viewport' | 'canvas'
}

export interface PublicSnapshotOptions {
  mode?: 'outline' | 'full'
  groupIds?: string[]
  includeTextContent?: boolean
  // includeRect removed — center+size always included when present
}

export interface PublicSnapshot {
  version: number
  url: string
  title: string
  context: 'page' | 'overlay'
  groups?: PublicSnapshotGroup[]
  targets?: PublicSnapshotTarget[]
}

export type PublicSnapshotDocument = PublicSnapshot & {
  session?: PublicSessionMeta | null
}

export type PublicCommandResult =
  | {
      commandId: string
      ok: true
      result?: Record<string, unknown>
    }
  | {
      commandId: string
      ok: false
      error: CommandErrorShape
    }

export function toPublicSession(
  session: Session & { snapshot?: PageSnapshot | null },
): PublicSession {
  const snapshot =
    'snapshot' in session && session.snapshot
      ? session.snapshot
      : null

  return {
    tabId: session.tabId,
    url: session.url,
    title: session.title || snapshot?.title || '',
    hasSnapshot: session.hasSnapshot ?? snapshot !== null,
    snapshotVersion: session.snapshotVersion ?? snapshot?.version ?? null,
    active: session.active ?? false,
  }
}

export interface PublicSessionMeta {
  tabId: number
  url: string
  title: string
  wasActive: boolean
  becameActive: boolean
}

export function toPublicSessionMeta(
  session: Session & { snapshot?: PageSnapshot | null },
  opts: { wasActive: boolean; becameActive: boolean },
): PublicSessionMeta {
  const snapshot =
    'snapshot' in session && session.snapshot
      ? session.snapshot
      : null
  return {
    tabId: session.tabId,
    url: session.url,
    title: session.title || snapshot?.title || '',
    wasActive: opts.wasActive,
    becameActive: opts.becameActive,
  }
}

function toPublicTarget(target: PageTarget, includeTextContent: boolean): PublicSnapshotTarget {
  return {
    ref: toAgentTargetRef(target),
    groupId: target.groupId,
    name: target.name,
    description: target.description,
    ...(targetDomResolved(target) === false ? { unresolved: true } : {}),
    ...(target.reason !== 'ready' ? { reason: target.reason } : {}),
    ...(target.sensitive ? { sensitive: true } : {}),
    ...(includeTextContent && target.textContent ? { textContent: target.textContent } : {}),
    ...(target.center ? { center: target.center } : {}),
    ...(target.size ? { size: target.size } : {}),
    ...(target.coordSpace ? { coordSpace: target.coordSpace } : {}),
  }
}

function getActiveContext(snapshot: PageSnapshot): {
  context: PublicSnapshot['context']
  targets: PageTarget[]
} {
  const actionableTargets = snapshot.targets.filter(target => target.actionableNow)
  const overlayTargets = actionableTargets.filter(target => target.overlay)

  if (overlayTargets.length > 0) {
    return {
      context: 'overlay',
      targets: overlayTargets,
    }
  }

  return {
    context: 'page',
    targets: actionableTargets,
  }
}

function toPublicGroups(targets: PageTarget[], snapshotGroups: PageSnapshotGroup[]): PublicSnapshotGroup[] {
  const metaMap = new Map(
    snapshotGroups
      .filter(g => g.meta !== undefined)
      .map(g => [g.groupId, g.meta]),
  )

  const groups = new Map<string, { groupId: string; groupName?: string; groupDesc?: string; targets: PageTarget[] }>()

  for (const target of targets) {
    const existing = groups.get(target.groupId)
    if (existing) {
      existing.targets.push(target)
      continue
    }

    groups.set(target.groupId, {
      groupId: target.groupId,
      groupName: target.groupName,
      groupDesc: target.groupDesc,
      targets: [target],
    })
  }

  return Array.from(groups.values()).map(group => ({
    groupId: group.groupId,
    groupName: group.groupName,
    groupDesc: group.groupDesc,
    targetCount: group.targets.length,
    sampleTargetNames: group.targets
      .map(target => target.name)
      .filter(name => name.length > 0)
      .slice(0, 3),
    ...(metaMap.has(group.groupId) ? { meta: metaMap.get(group.groupId) } : {}),
  }))
}

export function toPublicSnapshot(
  snapshot: PageSnapshot,
  options: PublicSnapshotOptions = {},
): PublicSnapshot {
  const activeContext = getActiveContext(snapshot)
  const requestedGroupIds = new Set(options.groupIds ?? [])
  const includeTargets = requestedGroupIds.size > 0 || options.mode === 'full'
  const unresolvedTargets = snapshot.targets.filter(target => targetDomResolved(target) === false)
  const targetPool = includeTargets
    ? uniqueTargets(activeContext.context === 'overlay'
        ? [...activeContext.targets, ...unresolvedTargets]
        : snapshot.targets)
    : activeContext.targets
  const expandedTargets =
    requestedGroupIds.size > 0
      ? targetPool.filter(target => requestedGroupIds.has(target.groupId))
      : targetPool

  return {
    version: snapshot.version,
    url: snapshot.url,
    title: snapshot.title,
    context: activeContext.context,
    ...(requestedGroupIds.size === 0 ? { groups: toPublicGroups(targetPool, snapshot.groups) } : {}),
    ...(includeTargets ? { targets: expandedTargets.map(t => toPublicTarget(t, options.includeTextContent ?? false)) } : {}),
  }
}

function targetDomResolved(target: PageTarget): boolean | undefined {
  return (target as PageTarget & { domResolved?: boolean }).domResolved
}

function uniqueTargets(targets: PageTarget[]): PageTarget[] {
  const seen = new Set<string>()
  const result: PageTarget[] = []
  for (const target of targets) {
    if (seen.has(target.targetId)) continue
    seen.add(target.targetId)
    result.push(target)
  }
  return result
}

export function formatPublicSnapshot(snapshot: PublicSnapshotDocument): string {
  const lines = [
    '### Page',
    `- Page URL: ${snapshot.url}`,
    `- Page Title: ${snapshot.title}`,
    `- Agrune Context: ${snapshot.context}`,
    `- Snapshot Version: ${snapshot.version}`,
  ]

  if (snapshot.session) {
    lines.push(`- Tab ID: ${snapshot.session.tabId}`)
  }

  lines.push('### Snapshot', '```yaml')

  if (snapshot.targets && snapshot.targets.length > 0) {
    lines.push(...formatTargetTree(snapshot.targets, snapshot.groups))
  } else if (snapshot.groups && snapshot.groups.length > 0) {
    lines.push(...snapshot.groups.flatMap(formatGroup))
  } else {
    lines.push('- none')
  }

  lines.push('```')
  return lines.join('\n')
}

function formatGroup(group: PublicSnapshotGroup): string[] {
  const name = group.groupName || group.groupId
  const lines = [`- group ${quote(name)} [ref=${group.groupId}]:`]
  if (group.groupDesc) lines.push(`  - description: ${quote(group.groupDesc)}`)
  lines.push(`  - targets: ${group.targetCount}`)
  if (group.sampleTargetNames.length > 0) {
    lines.push(`  - samples: ${group.sampleTargetNames.map(quote).join(', ')}`)
  }
  return lines
}

function formatTargetTree(targets: PublicSnapshotTarget[], snapshotGroups: PublicSnapshotGroup[] = []): string[] {
  const targetsByGroup = new Map<string, PublicSnapshotTarget[]>()
  for (const target of targets) {
    const groupTargets = targetsByGroup.get(target.groupId)
    if (groupTargets) {
      groupTargets.push(target)
    } else {
      targetsByGroup.set(target.groupId, [target])
    }
  }

  const labels = new Map(snapshotGroups.map(group => [group.groupId, group.groupName || group.groupId]))

  return Array.from(targetsByGroup.entries()).flatMap(([groupId, groupTargets]) => {
    const lines = [`- group ${quote(labels.get(groupId) || groupId)} [ref=${groupId}]:`]
    for (const target of groupTargets) {
      lines.push(...formatTarget(target, 2))
    }
    return lines
  })
}

function formatTarget(target: PublicSnapshotTarget, indent: number): string[] {
  const pad = ' '.repeat(indent)
  const childPad = ' '.repeat(indent + 2)
  const label = target.name || target.ref
  const state = [
    target.unresolved ? 'unresolved' : '',
    target.reason ? `reason=${target.reason}` : '',
    target.sensitive ? 'sensitive' : '',
  ].filter(Boolean)
  const stateText = state.length > 0 ? ` [${state.join(' ')}]` : ''
  const lines = [`${pad}- target ${quote(label)} [ref=${target.ref}]${stateText}:`]
  if (target.description) lines.push(`${childPad}- description: ${quote(target.description)}`)
  if (target.textContent) lines.push(`${childPad}- text: ${quote(compactText(target.textContent))}`)
  const box = formatBox(target)
  if (box) lines.push(`${childPad}- box: ${box}`)
  return lines
}

function formatBox(target: PublicSnapshotTarget): string | null {
  if (!target.center && !target.size && !target.coordSpace) return null
  const parts = []
  if (target.center) parts.push(`center=(${round(target.center.x)},${round(target.center.y)})`)
  if (target.size) parts.push(`size=(${round(target.size.w)}x${round(target.size.h)})`)
  if (target.coordSpace) parts.push(`coordSpace=${target.coordSpace}`)
  return parts.join(', ')
}

function compactText(value: string): string {
  const compacted = value.replace(/\s+/g, ' ').trim()
  if (compacted.length <= 160) return compacted
  return `${compacted.slice(0, 157)}...`
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function toPublicCommandResult(result: CommandResult): PublicCommandResult {
  if (result.ok) {
    return {
      commandId: result.commandId,
      ok: true,
      ...(result.result ? { result: result.result } : {}),
    }
  }

  return {
    commandId: result.commandId,
    ok: false,
    error: result.error,
  }
}
