import type { ScannedTarget, ScannedGroup } from './dom-scanner'

/**
 * Types compatible with WebCliManifest from @webcli-dom/build-core.
 * Defined locally to avoid adding a direct dependency on build-core.
 */

export interface WebCliTargetEntry {
  targetId: string
  name: string | null
  desc: string | null
  selector: string
  sourceFile: string
  sourceLine: number
  sourceColumn: number
}

export interface WebCliToolEntry {
  toolName: string
  toolDesc: string
  action: string
  status: 'active' | 'skipped_unsupported_action'
  targets: WebCliTargetEntry[]
}

export interface WebCliGroupEntry {
  groupId: string
  groupName?: string
  groupDesc?: string
  tools: WebCliToolEntry[]
}

export interface WebCliManifest {
  version: 2
  generatedAt: string
  exposureMode: 'grouped' | 'per-element'
  groups: WebCliGroupEntry[]
}

const DEFAULT_GROUP_ID = 'default'
const DEFAULT_GROUP_NAME = 'Default'

function toTargetEntry(target: ScannedTarget): WebCliTargetEntry {
  return {
    targetId: target.targetId,
    name: target.name || null,
    desc: target.description || null,
    selector: target.selector,
    sourceFile: '',
    sourceLine: 0,
    sourceColumn: 0,
  }
}

function toToolEntry(target: ScannedTarget): WebCliToolEntry {
  return {
    toolName: target.name || target.targetId,
    toolDesc: target.description || '',
    action: target.actionKind,
    status: 'active',
    targets: [toTargetEntry(target)],
  }
}

/**
 * Converts scanned DOM targets and groups into a WebCliManifest
 * that is compatible with installPageAgentRuntime() from build-core.
 */
export function buildManifest(
  targets: ScannedTarget[],
  groups: ScannedGroup[],
): WebCliManifest {
  if (targets.length === 0) {
    return {
      version: 2,
      generatedAt: new Date().toISOString(),
      exposureMode: 'per-element',
      groups: [],
    }
  }

  const groupMap = new Map<string, ScannedGroup>()
  for (const g of groups) {
    groupMap.set(g.groupId, g)
  }

  // Group targets by groupId
  const toolsByGroup = new Map<string, WebCliToolEntry[]>()
  for (const target of targets) {
    const gid = target.groupId ?? DEFAULT_GROUP_ID
    let tools = toolsByGroup.get(gid)
    if (!tools) {
      tools = []
      toolsByGroup.set(gid, tools)
    }
    tools.push(toToolEntry(target))
  }

  // Build group entries
  const groupEntries: WebCliGroupEntry[] = []
  for (const [gid, tools] of toolsByGroup) {
    const scannedGroup = groupMap.get(gid)
    groupEntries.push({
      groupId: gid,
      groupName: scannedGroup?.name || (gid === DEFAULT_GROUP_ID ? DEFAULT_GROUP_NAME : gid),
      groupDesc: scannedGroup?.description || undefined,
      tools,
    })
  }

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    exposureMode: 'per-element',
    groups: groupEntries,
  }
}
