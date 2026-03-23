export interface ScannedTarget {
  targetId: string
  selector: string
  name: string
  description: string
  actionKind: 'click' | 'fill'
  groupId?: string
  sensitive: boolean
}

export interface ScannedGroup {
  groupId: string
  name: string
  description: string
}

/**
 * Scans the document for elements annotated with `data-webcli-action`
 * and extracts target metadata for each.
 */
export function scanAnnotations(doc: Document): ScannedTarget[] {
  const elements = doc.querySelectorAll<HTMLElement>('[data-webcli-action]')
  const targets: ScannedTarget[] = []

  elements.forEach((el, index) => {
    const action = el.getAttribute('data-webcli-action') as 'click' | 'fill'
    const name = el.getAttribute('data-webcli-name') ?? ''
    const description = el.getAttribute('data-webcli-desc') ?? ''
    const key = el.getAttribute('data-webcli-key')
    const sensitive = el.hasAttribute('data-webcli-sensitive')

    const targetId = key ?? `wcli_${index}`
    const selector = key
      ? `[data-webcli-key="${key}"]`
      : name
        ? `[data-webcli-name="${name}"]`
        : `[data-webcli-action]`

    // Find closest ancestor with data-webcli-group
    const groupEl = el.closest<HTMLElement>('[data-webcli-group]')
    const groupId = groupEl?.getAttribute('data-webcli-group') ?? undefined

    targets.push({
      targetId,
      selector,
      name,
      description,
      actionKind: action,
      groupId,
      sensitive,
    })
  })

  return targets
}

/**
 * Scans the document for elements annotated with `data-webcli-group`
 * and extracts group metadata.
 */
export function scanGroups(doc: Document): ScannedGroup[] {
  const elements = doc.querySelectorAll<HTMLElement>('[data-webcli-group]')
  const groups: ScannedGroup[] = []

  elements.forEach((el) => {
    const groupId = el.getAttribute('data-webcli-group') ?? ''
    const name = el.getAttribute('data-webcli-group-name') ?? ''
    const description = el.getAttribute('data-webcli-group-desc') ?? ''

    groups.push({ groupId, name, description })
  })

  return groups
}
