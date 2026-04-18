export type DiagnosticSeverity = 'error' | 'warning'

export type DiagnosticCode =
  | 'missing-name'
  | 'missing-desc'
  | 'invalid-action'
  | 'duplicate-key'
  | 'duplicate-group'
  | 'orphan-group-meta'
  | 'typo-attribute'

export interface Diagnostic {
  file: string
  line: number
  column: number
  code: DiagnosticCode
  severity: DiagnosticSeverity
  message: string
}

export const VALID_ACTION_KINDS = new Set([
  'click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress',
])

export const KNOWN_AGRUNE_ATTRS = new Set([
  'data-agrune-action',
  'data-agrune-name',
  'data-agrune-desc',
  'data-agrune-key',
  'data-agrune-group',
  'data-agrune-group-name',
  'data-agrune-group-desc',
  'data-agrune-canvas',
  'data-agrune-meta',
  'data-agrune-sensitive',
])

/** Levenshtein distance for typo detection — small-string quadratic is fine. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array<number>(n + 1)
  const curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j += 1) prev[j] = j
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      )
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j]
  }
  return prev[n]
}

/** Suggest the closest known attribute if `attr` looks like a typo. */
export function suggestAttribute(attr: string): string | null {
  if (KNOWN_AGRUNE_ATTRS.has(attr)) return null
  if (!attr.startsWith('data-')) return null
  // Only consider things that LOOK like attempts at data-agrune-*: any data-* attribute
  // whose characters (after 'data-' and before the next '-') include the letters of
  // 'agrune' (as a multiset) within Levenshtein 2. This catches 'agurne', 'agrunne',
  // 'agurn', etc. without matching unrelated data-* attributes.
  const mid = attr.slice('data-'.length).split('-')[0] ?? ''
  if (levenshtein(mid, 'agrune') > 2) return null
  let best: { name: string; dist: number } | null = null
  for (const known of KNOWN_AGRUNE_ATTRS) {
    const d = levenshtein(attr, known)
    if (d <= 2 && (best === null || d < best.dist)) best = { name: known, dist: d }
  }
  return best?.name ?? null
}
