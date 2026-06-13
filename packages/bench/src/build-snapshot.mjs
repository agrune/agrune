// Build an in-memory PageSnapshot (the exact shape @agrune/core defines) from a
// parsed actionable-node list, so we can run it through the real agent-facing
// serializer. No browser required — the serializer output is byte-identical to
// what the agent would receive for the same actionable set.

function actionKindsForRole(role) {
  switch (role) {
    case 'searchbox':
    case 'textbox':
    case 'spinbutton':
    case 'slider':
      return ['fill']
    case 'combobox':
    case 'listbox':
      return ['select']
    default:
      return ['click']
  }
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 't'
}

function groupIdFor(landmark) {
  return slug(landmark)
}

/**
 * @param {{role:string,name:string,landmark:string}[]} parsed
 * @returns {import('@agrune/core').PageSnapshot}
 */
export function buildSnapshotFromParsed(parsed, { url, title }) {
  /** @type {Map<string, {groupId:string, groupName:string, targetIds:string[]}>} */
  const groupMap = new Map()
  const targets = []
  let counter = 0

  for (const node of parsed) {
    const groupId = groupIdFor(node.landmark)
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, { groupId, groupName: node.landmark, targetIds: [] })
    }
    const group = groupMap.get(groupId)
    counter += 1
    const targetId = `${groupId}.${slug(node.name)}_${counter}`
    group.targetIds.push(targetId)

    targets.push({
      targetId,
      groupId,
      groupName: group.groupName,
      name: node.name,
      description: '', // lean manifest: name carries the meaning, desc omitted
      actionKinds: actionKindsForRole(node.role),
      selector: { role: { name: node.role, level: node.name } },
      visible: true,
      inViewport: true,
      enabled: true,
      covered: false,
      actionableNow: true,
      reason: 'ready',
      overlay: false,
      sensitive: false,
      domResolved: true,
      sourceFile: 'bench',
      sourceLine: 0,
      sourceColumn: 0,
    })
  }

  return {
    schemaVersion: 3,
    version: 1,
    capturedAt: 0,
    url,
    title,
    groups: [...groupMap.values()],
    targets,
  }
}
