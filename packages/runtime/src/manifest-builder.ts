import type { ScannedTarget, ScannedGroup } from './dom-scanner.js'
import type {
  ActionKind,
  AgruneManifest,
  ManifestGroup,
  SelectorLadder,
} from '@agrune/core'

const DEFAULT_GROUP_ID = 'default'
const DEFAULT_GROUP_NAME = 'Default'
const VALID_ACTION_KINDS: Set<string> = new Set(['click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress'])

/**
 * Converts scanned DOM targets and groups into a v3 AgruneManifest used by
 * installPageAgentRuntime().
 *
 * Legacy inline scan (data-agrune-*) wraps CSS selector in SelectorLadder { css: "..." }.
 * Phase 17에서 전체 inline scan 경로 제거 예정.
 */
export function buildManifest(
  targets: ScannedTarget[],
  groups: ScannedGroup[],
): AgruneManifest {
  if (targets.length === 0) {
    return {
      version: 3,
      groups: [],
    }
  }

  const groupMap = new Map<string, ScannedGroup>()
  for (const g of groups) {
    groupMap.set(g.groupId, g)
  }

  // Group targets by groupId
  const targetsByGroup = new Map<string, ManifestGroup>()

  for (const target of targets) {
    const gid = target.groupId ?? DEFAULT_GROUP_ID
    let group = targetsByGroup.get(gid)
    if (!group) {
      const scannedGroup = groupMap.get(gid)
      group = {
        groupId: gid,
        name: scannedGroup?.name || (gid === DEFAULT_GROUP_ID ? DEFAULT_GROUP_NAME : gid),
        desc: scannedGroup?.description || undefined,
        targets: [],
      }
      targetsByGroup.set(gid, group)
    }

    const kinds = target.actionKinds.filter((k) => VALID_ACTION_KINDS.has(k)) as ActionKind[]

    group.targets.push({
      targetId: target.targetId,
      name: target.name || undefined,
      desc: target.description || undefined,
      actionKinds: kinds,
      // Legacy CSS selector wrapped in SelectorLadder — Phase 17에서 전체 제거 예정
      selector: { css: target.selector } as SelectorLadder,
    })
  }

  return {
    version: 3,
    groups: Array.from(targetsByGroup.values()),
  }
}
