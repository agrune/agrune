import type { JSXOpeningElement } from '@babel/types'
import type { WebCliDiagnostic } from '../../types'
import { isLikelyDynamicExpression } from '../helpers'
import {
  TARGET_REQ_ATTRS,
  buildDiagnostic,
  findAttr,
  getAttrTrimmedValue,
  getJsxAttr,
  jsxAttrToStaticString,
  mkTargetId,
  type AnyNode,
} from './shared'

export interface ValidatedTarget {
  action: string
  targetName: string
  targetDesc: string
  targetId: string
  explicitKey?: string
  line: number
  column: number
}

export function validateHtmlTargetNode(
  node: AnyNode,
  relativePath: string,
  diagnostics: WebCliDiagnostic[],
): ValidatedTarget | undefined {
  const actionAttr = findAttr(node, 'data-webcli-action')
  if (!actionAttr) return undefined

  const actionLoc = node.sourceCodeLocation?.attrs?.['data-webcli-action']
  const line = actionLoc?.startLine ?? node.sourceCodeLocation?.startLine ?? 1
  const column = actionLoc?.startCol ?? node.sourceCodeLocation?.startCol ?? 1

  const requiredValues: Record<(typeof TARGET_REQ_ATTRS)[number], string | undefined> = {
    'data-webcli-action': undefined,
    'data-webcli-name': undefined,
    'data-webcli-desc': undefined,
  }

  let hasHardError = false

  for (const attrName of TARGET_REQ_ATTRS) {
    const attr = findAttr(node, attrName)
    const attrLoc = node.sourceCodeLocation?.attrs?.[attrName]
    const attrLine = attrLoc?.startLine ?? line
    const attrColumn = attrLoc?.startCol ?? column

    if (!attr) {
      diagnostics.push(
        buildDiagnostic(
          'error',
          'WCLI_COMPILE_MISSING_ATTR',
          `${attrName} 속성이 필요합니다.`,
          relativePath,
          attrLine,
          attrColumn,
        ),
      )
      hasHardError = true
      continue
    }

    if (!attr.value || attr.value.trim() === '') {
      diagnostics.push(
        buildDiagnostic(
          'error',
          'WCLI_COMPILE_EMPTY_ATTR',
          `${attrName} 값은 비어 있을 수 없습니다.`,
          relativePath,
          attrLine,
          attrColumn,
        ),
      )
      hasHardError = true
      continue
    }

    if (isLikelyDynamicExpression(attr.value)) {
      diagnostics.push(
        buildDiagnostic(
          'error',
          'WCLI_COMPILE_DYNAMIC_ATTR',
          `${attrName}는 정적 문자열이어야 합니다.`,
          relativePath,
          attrLine,
          attrColumn,
        ),
      )
      hasHardError = true
      continue
    }

    requiredValues[attrName] = attr.value.trim()
  }

  const explicitKey = getAttrTrimmedValue(node, 'data-webcli-key')
  if (explicitKey && isLikelyDynamicExpression(explicitKey)) {
    diagnostics.push(
      buildDiagnostic(
        'error',
        'WCLI_COMPILE_DYNAMIC_ATTR',
        'data-webcli-key는 정적 문자열이어야 합니다.',
        relativePath,
        node.sourceCodeLocation?.attrs?.['data-webcli-key']?.startLine ?? line,
        node.sourceCodeLocation?.attrs?.['data-webcli-key']?.startCol ?? column,
      ),
    )
    hasHardError = true
  }

  if (hasHardError) return undefined

  return {
    action: requiredValues['data-webcli-action'] as string,
    targetName: requiredValues['data-webcli-name'] as string,
    targetDesc: requiredValues['data-webcli-desc'] as string,
    explicitKey,
    targetId: explicitKey || mkTargetId(relativePath, line, column),
    line,
    column,
  }
}

export function validateJsxTargetNode(
  node: JSXOpeningElement,
  relativePath: string,
  diagnostics: WebCliDiagnostic[],
): ValidatedTarget | undefined {
  const actionAttr = getJsxAttr(node, 'data-webcli-action')
  if (!actionAttr) return undefined

  const line = actionAttr.loc?.start.line ?? node.loc?.start.line ?? 1
  const column = actionAttr.loc?.start.column ?? node.loc?.start.column ?? 1

  let hasHardError = false
  const staticValues: Record<string, string> = {}

  for (const attrName of TARGET_REQ_ATTRS) {
    const attr = getJsxAttr(node, attrName)
    if (!attr) {
      diagnostics.push(
        buildDiagnostic(
          'error',
          'WCLI_COMPILE_MISSING_ATTR',
          `${attrName} 속성이 필요합니다.`,
          relativePath,
          line,
          column,
        ),
      )
      hasHardError = true
      continue
    }

    const parsed = jsxAttrToStaticString(attr)
    if (!parsed.isStatic) {
      diagnostics.push(
        buildDiagnostic(
          'error',
          'WCLI_COMPILE_DYNAMIC_ATTR',
          `${attrName}는 정적 문자열이어야 합니다.`,
          relativePath,
          attr.loc?.start.line ?? line,
          attr.loc?.start.column ?? column,
        ),
      )
      hasHardError = true
      continue
    }

    if (!parsed.value || parsed.value.trim() === '') {
      diagnostics.push(
        buildDiagnostic(
          'error',
          'WCLI_COMPILE_EMPTY_ATTR',
          `${attrName} 값은 비어 있을 수 없습니다.`,
          relativePath,
          attr.loc?.start.line ?? line,
          attr.loc?.start.column ?? column,
        ),
      )
      hasHardError = true
      continue
    }

    staticValues[attrName] = parsed.value.trim()
  }

  const keyAttr = getJsxAttr(node, 'data-webcli-key')
  const keyParsed = jsxAttrToStaticString(keyAttr)
  let explicitKey: string | undefined

  if (keyAttr) {
    if (!keyParsed.isStatic || !keyParsed.value || keyParsed.value.trim() === '') {
      diagnostics.push(
        buildDiagnostic(
          'error',
          'WCLI_COMPILE_DYNAMIC_ATTR',
          'data-webcli-key는 정적 문자열이어야 합니다.',
          relativePath,
          keyAttr.loc?.start.line ?? line,
          keyAttr.loc?.start.column ?? column,
        ),
      )
      hasHardError = true
    } else {
      explicitKey = keyParsed.value.trim()
    }
  }

  if (hasHardError) return undefined

  return {
    action: staticValues['data-webcli-action'],
    targetName: staticValues['data-webcli-name'],
    targetDesc: staticValues['data-webcli-desc'],
    explicitKey,
    targetId: explicitKey || mkTargetId(relativePath, line, column),
    line,
    column,
  }
}
