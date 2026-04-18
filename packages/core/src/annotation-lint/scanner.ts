import type { Diagnostic } from './rules.js'
import { VALID_ACTION_KINDS, KNOWN_AGRUNE_ATTRS, suggestAttribute } from './rules.js'

interface ParsedAttr {
  name: string
  value: string | null   // null = boolean attribute (no `=`) or dynamic JSX expression
  line: number
  column: number
}

interface ParsedElement {
  tagStart: { line: number; column: number }
  attrs: ParsedAttr[]
}

/**
 * Light-weight HTML/JSX attribute tokenizer. Only extracts opening-tag
 * attribute lists. Ignores dynamic JSX expressions ({foo}), closing tags,
 * and text content. Good enough for attribute-name/string-literal-value
 * level checks.
 */
export function extractElements(source: string): ParsedElement[] {
  const elements: ParsedElement[] = []
  let i = 0
  let line = 1
  let column = 1

  const advance = (n: number) => {
    for (let k = 0; k < n; k += 1) {
      if (source[i + k] === '\n') { line += 1; column = 1 }
      else { column += 1 }
    }
    i += n
  }

  while (i < source.length) {
    const ch = source[i]
    if (ch === '<' && /[A-Za-z]/.test(source[i + 1] ?? '')) {
      const tagStart = { line, column }
      advance(1) // skip '<'
      // skip tag name
      while (i < source.length && /[A-Za-z0-9-]/.test(source[i] ?? '')) advance(1)
      const attrs: ParsedAttr[] = []
      while (i < source.length && source[i] !== '>' && !(source[i] === '/' && source[i + 1] === '>')) {
        // skip whitespace
        while (i < source.length && /\s/.test(source[i] ?? '')) advance(1)
        if (i >= source.length || source[i] === '>' || source[i] === '/') break
        // attribute name
        const attrStart = { line, column }
        let name = ''
        while (i < source.length && /[A-Za-z0-9_:\-]/.test(source[i] ?? '')) {
          name += source[i]
          advance(1)
        }
        if (!name) { advance(1); continue }
        // optional '='
        let value: string | null = null
        if (source[i] === '=') {
          advance(1)
          if (source[i] === '"' || source[i] === "'") {
            const quote = source[i]
            advance(1)
            let v = ''
            while (i < source.length && source[i] !== quote) {
              v += source[i]
              advance(1)
            }
            if (source[i] === quote) advance(1)
            value = v
          } else if (source[i] === '{') {
            // JSX expression — skip balanced braces, record value as null (dynamic)
            let depth = 1
            advance(1)
            while (i < source.length && depth > 0) {
              if (source[i] === '{') depth += 1
              else if (source[i] === '}') depth -= 1
              advance(1)
            }
            value = null
          } else {
            // unquoted
            let v = ''
            while (i < source.length && !/\s|>|\//.test(source[i] ?? '')) {
              v += source[i]
              advance(1)
            }
            value = v
          }
        }
        attrs.push({ name, value, line: attrStart.line, column: attrStart.column })
      }
      // consume closer
      if (source[i] === '/' && source[i + 1] === '>') advance(2)
      else if (source[i] === '>') advance(1)
      elements.push({ tagStart, attrs })
    } else {
      advance(1)
    }
  }

  return elements
}

export interface ScanOptions {
  file: string
}

export function scanSource(source: string, opts: ScanOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const elements = extractElements(source)

  const keysInFile = new Map<string, ParsedAttr[]>()
  const groupsInFile = new Map<string, ParsedAttr[]>()

  for (const el of elements) {
    const hasAction = el.attrs.find(a => a.name === 'data-agrune-action')
    const hasName = el.attrs.find(a => a.name === 'data-agrune-name')
    const hasDesc = el.attrs.find(a => a.name === 'data-agrune-desc')
    const hasGroup = el.attrs.find(a => a.name === 'data-agrune-group')
    const hasGroupName = el.attrs.find(a => a.name === 'data-agrune-group-name')
    const hasGroupDesc = el.attrs.find(a => a.name === 'data-agrune-group-desc')
    const keyAttr = el.attrs.find(a => a.name === 'data-agrune-key')

    if (hasAction) {
      if (!hasName) {
        diagnostics.push({
          file: opts.file,
          line: hasAction.line,
          column: hasAction.column,
          code: 'missing-name',
          severity: 'error',
          message: 'data-agrune-action present but data-agrune-name missing',
        })
      }
      if (!hasDesc) {
        diagnostics.push({
          file: opts.file,
          line: hasAction.line,
          column: hasAction.column,
          code: 'missing-desc',
          severity: 'error',
          message: 'data-agrune-action present but data-agrune-desc missing',
        })
      }
      if (hasAction.value !== null && hasAction.value.length > 0) {
        const bad = hasAction.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .filter(tok => !VALID_ACTION_KINDS.has(tok))
        if (bad.length > 0) {
          diagnostics.push({
            file: opts.file,
            line: hasAction.line,
            column: hasAction.column,
            code: 'invalid-action',
            severity: 'error',
            message: `unknown action kind(s): ${bad.join(', ')}`,
          })
        }
      }
    }

    if (!hasGroup && (hasGroupName || hasGroupDesc)) {
      const src = (hasGroupName ?? hasGroupDesc)!
      diagnostics.push({
        file: opts.file,
        line: src.line,
        column: src.column,
        code: 'orphan-group-meta',
        severity: 'error',
        message: `${src.name} present without data-agrune-group on the same element`,
      })
    }

    if (keyAttr && keyAttr.value) {
      const bucket = keysInFile.get(keyAttr.value) ?? []
      bucket.push(keyAttr)
      keysInFile.set(keyAttr.value, bucket)
    }

    if (hasGroup && hasGroup.value) {
      const bucket = groupsInFile.get(hasGroup.value) ?? []
      bucket.push(hasGroup)
      groupsInFile.set(hasGroup.value, bucket)
    }

    for (const attr of el.attrs) {
      if (attr.name.startsWith('data-') && !KNOWN_AGRUNE_ATTRS.has(attr.name)) {
        const suggestion = suggestAttribute(attr.name)
        if (suggestion) {
          diagnostics.push({
            file: opts.file,
            line: attr.line,
            column: attr.column,
            code: 'typo-attribute',
            severity: 'error',
            message: `unknown attribute "${attr.name}" — did you mean "${suggestion}"?`,
          })
        }
      }
    }
  }

  for (const [key, occurrences] of keysInFile) {
    if (occurrences.length > 1) {
      for (const occ of occurrences.slice(1)) {
        diagnostics.push({
          file: opts.file,
          line: occ.line,
          column: occ.column,
          code: 'duplicate-key',
          severity: 'error',
          message: `data-agrune-key "${key}" used more than once in this file`,
        })
      }
    }
  }

  for (const [gid, occurrences] of groupsInFile) {
    if (occurrences.length > 1) {
      for (const occ of occurrences.slice(1)) {
        diagnostics.push({
          file: opts.file,
          line: occ.line,
          column: occ.column,
          code: 'duplicate-group',
          severity: 'error',
          message: `data-agrune-group "${gid}" used more than once in this file`,
        })
      }
    }
  }

  return diagnostics
}
