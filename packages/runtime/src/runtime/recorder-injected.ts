import type { FiberIdentityPath, SelectorLadder } from '@agrune/manifest'
import { isSensitive } from './dom-utils'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result produced by page-context capture. Intentionally mirrors the shape
 * used by the DevTools webapp so the recorder_captured WS payload can pass
 * straight through without translation.
 *
 * Security (T-16-04): MUST NOT contain element values. Only selectors +
 * flags. The `roleSelector.name` field is bounded to 80 chars so that long
 * textContent cannot smuggle sensitive data through.
 */
export interface CaptureResult {
  url: string
  fiberPath?: FiberIdentityPath
  roleSelector?: { role: string; name?: string }
  cssSelector?: string
  sensitive?: true
  autoTargetId: string
}

interface IdentityBridgeLike {
  resolve?: (path: FiberIdentityPath) => HTMLElement | null
  resolvePath?: (el: HTMLElement) => FiberIdentityPath | null
  readonly version?: string
}

interface WindowWithBridge {
  __agrune_identity__?: IdentityBridgeLike
}

// ─── Role / name extraction ────────────────────────────────────────────────

/**
 * Build the role+name candidate selector. Prefers explicit `role` attr,
 * then falls back to `tagName` lowercase. Name comes from aria-label, then
 * a slice-bounded textContent so we never leak the entire element body.
 */
export function buildRoleSelector(el: HTMLElement): { role: string; name?: string } {
  const role = el.getAttribute('role') || el.tagName.toLowerCase()
  const ariaLabel = el.getAttribute('aria-label')
  const textRaw = el.textContent ?? ''
  const text = textRaw.replace(/\s+/g, ' ').trim().slice(0, 80)
  const name = ariaLabel?.trim() || text || undefined
  return name ? { role, name } : { role }
}

// ─── CSS fallback ──────────────────────────────────────────────────────────

/**
 * Build a stable CSS selector candidate. Priority:
 *   1. data-testid (de-facto framework-agnostic stable hook)
 *   2. Stable id (alphanumeric-only runs under 8 chars; rejects hash-like ids)
 *   3. Deterministic DOM path built from tagName + nth-of-type
 *
 * Hash IDs are rejected because frameworks like Emotion/CSS Modules generate
 * 8+ char alphanumeric ids that change every build (snapshot drift Pitfall).
 */
export function buildCssFallback(el: HTMLElement): string {
  const testId = el.getAttribute('data-testid')
  if (testId) return `[data-testid="${cssEscape(testId)}"]`
  if (el.id && !/[a-zA-Z0-9]{8,}/.test(el.id)) return `#${cssEscape(el.id)}`
  return buildDomPath(el)
}

function buildDomPath(el: HTMLElement): string {
  const parts: string[] = []
  let current: Element | null = el
  const MAX_DEPTH = 6
  while (current && current !== document.body && parts.length < MAX_DEPTH) {
    const tag = current.tagName.toLowerCase()
    const parentEl: HTMLElement | null = current.parentElement
    if (!parentEl) {
      parts.unshift(tag)
      break
    }
    const currentTagName = current.tagName
    const siblings: Element[] = Array.from(parentEl.children).filter(
      (c: Element) => c.tagName === currentTagName,
    )
    if (siblings.length === 1) {
      parts.unshift(tag)
    } else {
      const idx = siblings.indexOf(current) + 1
      parts.unshift(`${tag}:nth-of-type(${idx})`)
    }
    current = parentEl
  }
  return parts.join(' > ')
}

// Prefer the native CSS.escape when available (jsdom ships it) but stay
// defensive against older environments by providing a tiny fallback.
function cssEscape(value: string): string {
  const anyCss = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS
  if (anyCss && typeof anyCss.escape === 'function') return anyCss.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`)
}

// ─── Capture + ladder + targetId ───────────────────────────────────────────

/**
 * Produce a CaptureResult from a DOM element. Called from within the
 * picking overlay on click. Accepts a monotonically increasing counter so
 * consecutive captures in the same picking session produce unique auto ids.
 */
export function captureElement(el: HTMLElement, counter: number): CaptureResult {
  const bridge = (window as unknown as WindowWithBridge).__agrune_identity__
  let fiberPath: FiberIdentityPath | undefined
  if (bridge && typeof bridge.resolvePath === 'function') {
    try {
      const path = bridge.resolvePath(el)
      if (path && path.length > 0) fiberPath = path
    } catch {
      // Defensive: third-party bridge tampering must not crash the recorder.
    }
  }
  const role = buildRoleSelector(el)
  const css = buildCssFallback(el)
  // T-16-04: never touch `el.value` or other value-bearing attributes.
  const sensitive = isSensitive(el) ? (true as const) : undefined
  const autoTargetId = generateAutoTargetId(el, fiberPath, counter)
  const result: CaptureResult = {
    url: typeof window !== 'undefined' ? window.location.href : '',
    roleSelector: role,
    cssSelector: css,
    autoTargetId,
    ...(fiberPath ? { fiberPath } : {}),
    ...(sensitive ? { sensitive } : {}),
  }
  return result
}

/**
 * Generate a developer-friendly auto targetId. Prefers the last fiber
 * segment's componentName (e.g. `LoginButton`), falls back to the element's
 * tagName. Strips all non-[A-Za-z0-9] characters so the result passes the
 * PendingStore allowlist (server-side T-16-03 sanitizer).
 */
export function generateAutoTargetId(
  el: HTMLElement,
  path: FiberIdentityPath | undefined,
  counter: number,
): string {
  const last = path && path.length > 0 ? path[path.length - 1] : undefined
  const rawBase = last?.componentName || el.tagName.toLowerCase()
  const base = rawBase.replace(/[^a-zA-Z0-9]/g, '').slice(0, 48)
  return `${base || 'target'}_${counter}`
}

/**
 * Assemble the on-wire SelectorLadder from a CaptureResult. Priority order:
 * fiber (most stable) → role+name → css (fallback). At least one key is
 * always present because captureElement always produces cssSelector.
 *
 * Returns `null` when no key could be built — should not happen in practice.
 */
export function buildSelectorLadder(capture: CaptureResult): SelectorLadder | null {
  const ladder: Partial<SelectorLadder> = {}
  if (capture.fiberPath && capture.fiberPath.length > 0) {
    ;(ladder as { fiber?: { path: FiberIdentityPath } }).fiber = {
      path: capture.fiberPath,
    }
  }
  if (capture.roleSelector) {
    ;(ladder as { role?: { name: string; level?: string } }).role = {
      name: capture.roleSelector.name ?? capture.roleSelector.role,
    }
  }
  if (capture.cssSelector) {
    ;(ladder as { css?: string }).css = capture.cssSelector
  }
  if (Object.keys(ladder).length === 0) return null
  return ladder as SelectorLadder
}

// ─── Overlay ────────────────────────────────────────────────────────────────

const OUTLINE_COLOR = '#ff5722'

/**
 * Install hover + click listeners that visually outline the hovered element
 * and emit a CaptureResult on click. Single-shot: after the first click the
 * overlay tears itself down and invokes the supplied callback.
 *
 * Returns a cleanup function that can be used to cancel picking without a
 * click (e.g. when the DevTools operator hits Esc).
 *
 * Security:
 *  - click is `preventDefault + stopPropagation` so the original page's
 *    submit/navigation handlers cannot fire during picking
 *  - no code reads `el.value` or element-level secrets (T-16-04)
 */
export function activateRecorderOverlay(
  onCapture: (result: CaptureResult) => void,
): () => void {
  let counter = 0
  let hovered: HTMLElement | null = null
  let savedOutline: string | null = null
  let cleanedUp = false

  const setOutline = (el: HTMLElement | null, on: boolean): void => {
    if (!el) return
    if (on) {
      if (savedOutline === null) savedOutline = el.style.outline
      el.style.outline = `2px solid ${OUTLINE_COLOR}`
    } else {
      el.style.outline = savedOutline ?? ''
      savedOutline = null
    }
  }

  const onMove = (e: MouseEvent): void => {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (t === hovered) return
    setOutline(hovered, false)
    hovered = t
    setOutline(t, true)
  }

  const onClick = (e: MouseEvent): void => {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    e.preventDefault()
    e.stopPropagation()
    setOutline(t, false)
    counter += 1
    const result = captureElement(t, counter)
    try {
      onCapture(result)
    } finally {
      cleanup()
    }
  }

  const cleanup = (): void => {
    if (cleanedUp) return
    cleanedUp = true
    setOutline(hovered, false)
    hovered = null
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
  }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  return cleanup
}
