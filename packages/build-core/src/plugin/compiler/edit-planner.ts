import type { JSXOpeningElement } from '@babel/types'
import MagicString from 'magic-string'
import { DOM_KEY_ATTR, getJsxAttr, type AnyNode, type Edit } from './shared'

function removeAttrEditFromRange(loc: { startOffset: number; endOffset: number }): Edit {
  return {
    start: loc.startOffset,
    end: loc.endOffset,
    content: '',
  }
}

export function planHtmlNodeAttrStripEdits(
  node: AnyNode,
  attrNames: Iterable<string>,
): Edit[] {
  const edits: Edit[] = []
  const attrs = node.sourceCodeLocation?.attrs
  if (!attrs) return edits

  for (const attrName of attrNames) {
    const loc = attrs[attrName]
    if (!loc) continue
    edits.push(removeAttrEditFromRange(loc))
  }

  return edits
}

export function planJsxNodeAttrStripEdits(
  node: JSXOpeningElement,
  attrNames: Iterable<string>,
): Edit[] {
  const edits: Edit[] = []

  for (const attrName of attrNames) {
    const attr = getJsxAttr(node, attrName)
    if (!attr?.start || !attr.end) continue
    edits.push({ start: attr.start, end: attr.end, content: '' })
  }

  return edits
}

export function planHtmlTrackingAttrEdit(
  node: AnyNode,
  targetId: string,
): Edit | undefined {
  const endOffset = node.sourceCodeLocation?.startTag?.endOffset
  if (endOffset == null) return undefined

  return {
    start: endOffset - 1,
    end: endOffset - 1,
    content: ` ${DOM_KEY_ATTR}="${targetId}"`,
  }
}

export function planJsxTrackingAttrEdit(
  node: JSXOpeningElement,
  targetId: string,
): Edit | undefined {
  if (node.end == null) return undefined
  const insertAt = node.selfClosing ? node.end - 2 : node.end - 1

  return {
    start: insertAt,
    end: insertAt,
    content: ` ${DOM_KEY_ATTR}="${targetId}"`,
  }
}

export function applyEdits(
  code: string,
  edits: Edit[],
): { code: string; changed: boolean } {
  if (!edits.length) {
    return { code, changed: false }
  }

  const uniqueEdits = Array.from(
    new Map(edits.map(edit => [`${edit.start}:${edit.end}:${edit.content}`, edit])).values(),
  )

  const ms = new MagicString(code)
  const overwriteEdits = uniqueEdits
    .filter(edit => edit.start !== edit.end)
    .sort((a, b) => b.start - a.start)
  const insertEdits = uniqueEdits
    .filter(edit => edit.start === edit.end)
    .sort((a, b) => b.start - a.start)

  for (const edit of overwriteEdits) {
    ms.overwrite(edit.start, edit.end, edit.content)
  }

  for (const edit of insertEdits) {
    ms.appendLeft(edit.start, edit.content)
  }

  return {
    code: ms.toString(),
    changed: true,
  }
}
