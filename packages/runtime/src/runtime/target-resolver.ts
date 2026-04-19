/**
 * TargetResolver — CSS fallback selector ladder.
 *
 * Priority: role > text > testId > attr > css.
 * Hash classes (`/\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/`) and `:nth-child(` are
 * rejected at resolve time via `assertNoHashClass` / `assertNoNthChild`.
 *
 * This module is runtime (browser)-only. It runs inside the page agent
 * runtime bundle that CdpRuntimeInjector injects via
 * `addScriptToEvaluateOnNewDocument`. It must not import Node-only modules.
 *
 * Phase 11 — RESOLVE-02. MANIFEST-04 sensitive OR-only runtime portion
 * lives in `dom-utils.ts::isSensitive`.
 */

// ---------------------------------------------------------------------------
// SelectorLadder type (local copy — Plan 03 will re-map to @agrune/core)
// ---------------------------------------------------------------------------

export interface SelectorLadder {
  role?: { name: string; level?: string }
  text?: string
  testId?: string
  attr?: string
  css?: string
}

// ---------------------------------------------------------------------------
// Forbidden selector patterns
// ---------------------------------------------------------------------------

/**
 * Hash class: 8+ alphanumeric characters with NO following hyphen or
 * alphanumeric character. This avoids false-positives on Tailwind utilities
 * like `.items-center` or `.bg-blue-500` which contain hyphens.
 *
 * Pitfall 2 from RESEARCH: `.flex.items-center.bg-blue-500` must pass.
 */
export const HASH_CLASS_PATTERN = /\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/

/**
 * Position-dependent pseudo-class that makes selectors fragile when
 * list items are added/removed.
 */
export const NTH_CHILD_PATTERN = /:nth-child\(/

// ---------------------------------------------------------------------------
// SelectorForbiddenError
// ---------------------------------------------------------------------------

export class SelectorForbiddenError extends Error {
  constructor(
    public readonly selector: string,
    message: string,
  ) {
    super(message)
    this.name = 'SelectorForbiddenError'
  }
}

// ---------------------------------------------------------------------------
// Guard functions
// ---------------------------------------------------------------------------

export function assertNoHashClass(selector: string): void {
  if (HASH_CLASS_PATTERN.test(selector)) {
    throw new SelectorForbiddenError(
      selector,
      `Selector "${selector}" contains a likely hash-based class. Use role, text, testId, or stable attribute instead.`,
    )
  }
}

export function assertNoNthChild(selector: string): void {
  if (NTH_CHILD_PATTERN.test(selector)) {
    throw new SelectorForbiddenError(
      selector,
      `Selector "${selector}" uses :nth-child which is position-dependent. Use a stable identifier instead.`,
    )
  }
}

// ---------------------------------------------------------------------------
// Accessible name computation
// ---------------------------------------------------------------------------

/**
 * Compute accessible name for the purposes of role+name matching.
 * Priority: aria-label > aria-labelledby referenced text > textContent trim.
 *
 * Note: the full WAI AccName algorithm is NOT implemented — this covers
 * the common cases for button/link/input labeling which is sufficient for
 * manifest selector resolution. [ASSUMED, see RESEARCH A2]
 */
export function computeAccessibleName(element: Element): string {
  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim()

  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument?.getElementById(id))
      .filter((el): el is HTMLElement => el !== null && el !== undefined)
      .map((el) => el.textContent?.trim() ?? '')
      .filter((s) => s.length > 0)
    if (parts.length > 0) return parts.join(' ')
  }

  return (element.textContent ?? '').trim()
}

// ---------------------------------------------------------------------------
// Step resolvers
// ---------------------------------------------------------------------------

function resolveByRole(
  doc: Document,
  role: { name: string; level?: string },
): HTMLElement[] {
  const elements = Array.from(
    doc.querySelectorAll<HTMLElement>(`[role="${cssEscape(role.name)}"]`),
  )
  if (!role.level) return elements
  return elements.filter((el) => computeAccessibleName(el) === role.level)
}

/**
 * Text selector queries interactive elements (button, a, label, role=*).
 * Exact match preferred; falls back to contains match if exact match returns empty.
 *
 * [ASSUMED A4]: Searching button/a/label + role-based elements is sufficient for
 * interactive content matching. Custom non-interactive components are edge cases.
 */
const TEXT_SELECTOR_SCOPE =
  'button, a, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"]'

function resolveByText(doc: Document, text: string): HTMLElement[] {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(TEXT_SELECTOR_SCOPE))
  const exact = candidates.filter((el) => {
    const name = computeAccessibleName(el)
    return name === text
  })
  if (exact.length > 0) return exact
  return candidates.filter((el) => computeAccessibleName(el).includes(text))
}

function resolveByTestId(doc: Document, testId: string): HTMLElement[] {
  return Array.from(
    doc.querySelectorAll<HTMLElement>(`[data-testid="${cssEscape(testId)}"]`),
  )
}

function resolveByAttr(doc: Document, attr: string): HTMLElement[] {
  assertNoHashClass(attr)
  assertNoNthChild(attr)
  return Array.from(doc.querySelectorAll<HTMLElement>(attr))
}

function resolveByCss(doc: Document, css: string): HTMLElement[] {
  assertNoHashClass(css)
  assertNoNthChild(css)
  return Array.from(doc.querySelectorAll<HTMLElement>(css))
}

/**
 * Minimal CSS.escape polyfill for environments (jsdom) that may lack it.
 * Only escapes double quotes and backslashes — sufficient for attribute value
 * interpolation in role/testId selectors.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Main resolver — resolveByLadder
// ---------------------------------------------------------------------------

/**
 * Resolve a SelectorLadder against the given document.
 *
 * Returns matched HTMLElements following the priority:
 *   role > text > testId > attr > css
 *
 * Returns [] if no step matches (never throws for empty result).
 * Throws SelectorForbiddenError if attr/css contain hash class or :nth-child.
 *
 * The caller is responsible for handling the empty case.
 *
 * @param ladder - SelectorLadder with one or more populated fields
 * @param doc - Document to query against (defaults to global `document`)
 */
export function resolveByLadder(
  ladder: SelectorLadder,
  doc: Document = document,
): HTMLElement[] {
  if (ladder.role) {
    const matched = resolveByRole(doc, ladder.role)
    if (matched.length > 0) return matched
  }
  if (ladder.text !== undefined && ladder.text !== '') {
    const matched = resolveByText(doc, ladder.text)
    if (matched.length > 0) return matched
  }
  if (ladder.testId) {
    const matched = resolveByTestId(doc, ladder.testId)
    if (matched.length > 0) return matched
  }
  if (ladder.attr) {
    const matched = resolveByAttr(doc, ladder.attr)
    if (matched.length > 0) return matched
  }
  if (ladder.css) {
    const matched = resolveByCss(doc, ladder.css)
    if (matched.length > 0) return matched
  }
  return []
}
