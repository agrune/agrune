import { parse as parseHtml } from 'parse5'
import type {
  WebMcpCompiledTarget,
  WebMcpDiagnostic,
  WebMcpToolStatus,
} from '../../types'
import type { ResolvedWebMcpDomOptions } from '../options'
import { planHtmlNodeAttrStripEdits, planHtmlTrackingAttrEdit, applyEdits } from './edit-planner'
import { resolveHtmlGroupContext } from './group-resolver'
import { toCompiledTarget } from './target-builder'
import { validateHtmlTargetNode } from './validators'
import {
  WEBCLI_ATTRS,
  buildDiagnostic,
  buildSelector,
  findAttr,
  walkHtml,
  type AnyNode,
  type CompileResult,
  type Edit,
} from './shared'

export function htmlCompile(
  code: string,
  relativePath: string,
  options: ResolvedWebMcpDomOptions,
  emitTrackingAttr: boolean,
): CompileResult {
  const diagnostics: WebMcpDiagnostic[] = []
  const entries: WebMcpCompiledTarget[] = []
  const edits: Edit[] = []
  const attrsToStrip = new Set<string>([...WEBCLI_ATTRS, options.groupAttr])

  let doc: AnyNode
  try {
    doc = parseHtml(code, { sourceCodeLocationInfo: true }) as unknown as AnyNode
  } catch (err) {
    diagnostics.push(
      buildDiagnostic(
        'error',
        'WMCP_COMPILE_PARSE_ERROR',
        `HTML 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
        relativePath,
        1,
        1,
      ),
    )
    return { code, changed: false, entries, diagnostics }
  }

  walkHtml(doc, node => {
    if (!node.tagName || !node.attrs || !node.sourceCodeLocation?.attrs) return
    if (!findAttr(node, 'data-webcli-action')) return

    const validated = validateHtmlTargetNode(node, relativePath, diagnostics)
    if (!validated) return

    let hasHardError = false
    const group = resolveHtmlGroupContext(
      node,
      options,
      relativePath,
      diagnostics,
      validated.line,
      validated.column,
    )

    if (group.hasErrors) {
      hasHardError = true
    }

    if (!emitTrackingAttr && (!options.preserveSourceAttrs || !validated.explicitKey)) {
      diagnostics.push(
        buildDiagnostic(
          'error',
          'WMCP_COMPILE_MISSING_ATTR',
          'emitTrackingAttr=none 사용 시 data-webcli-key를 명시하고 preserveSourceAttrs=true 여야 합니다.',
          relativePath,
          validated.line,
          validated.column,
        ),
      )
      hasHardError = true
    }

    if (hasHardError) return

    if (!options.preserveSourceAttrs) {
      edits.push(...planHtmlNodeAttrStripEdits(node, attrsToStrip))
      for (const stripNode of group.stripNodes) {
        edits.push(...planHtmlNodeAttrStripEdits(stripNode, attrsToStrip))
      }
    }

    const supported = validated.action === 'click' || validated.action === 'fill'
    const status: WebMcpToolStatus = supported ? 'active' : 'skipped_unsupported_action'

    if (!supported) {
      const diagLevel =
        options.unsupportedActionHandling === 'error' ? 'error' : 'warning'
      diagnostics.push(
        buildDiagnostic(
          diagLevel,
          'WMCP_COMPILE_UNSUPPORTED_ACTION',
          `지원하지 않는 action '${validated.action}' 입니다. v1에서는 click과 fill만 활성화됩니다.`,
          relativePath,
          validated.line,
          validated.column,
        ),
      )
    }

    if (emitTrackingAttr) {
      const trackingEdit = planHtmlTrackingAttrEdit(node, validated.targetId)
      if (trackingEdit) {
        edits.push(trackingEdit)
      }
    }

    entries.push(
      toCompiledTarget({
        action: validated.action,
        status,
        group: group.context,
        targetId: validated.targetId,
        targetName: validated.targetName,
        targetDesc: validated.targetDesc,
        selector: buildSelector(emitTrackingAttr, validated.targetId),
        relativePath,
        sourceLine: validated.line,
        sourceColumn: validated.column,
      }),
    )
  })

  const applied = applyEdits(code, edits)
  return {
    code: applied.code,
    changed: applied.changed,
    entries,
    diagnostics,
  }
}
