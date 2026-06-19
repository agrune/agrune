/**
 * In-page functions executed via `locator.evaluate` / `locator.evaluateAll`.
 *
 * `captureElementState` is the single source of truth for the DOM heuristics
 * (visibility, viewport clipping, covered, overlay, sensitive). Playwright
 * serializes the function source, so it must be fully self-contained: every
 * helper and constant lives inside the function body — no references to
 * module scope survive serialization.
 *
 * The standalone exports (`isSensitive`, regex/set constants) are thin
 * wrappers and data mirrors used by unit tests; behavior flows through
 * `captureElementState` so the inline copies are what tests exercise.
 */

// Type-only import (erased at build) — the serialized page functions never
// reference module scope at runtime.
import type { CanvasViewportTransform } from '@agrune/core'

export interface ElementStateOptions {
  /** Manifest `sensitive: true` flag — OR-only, cannot clear a DOM heuristic. */
  sensitiveFlag?: boolean
  /** Whether the target declares the `fill` action (drives the `sensitive` reason). */
  fillAction?: boolean
}

export type ElementStateReason =
  | 'hidden'
  | 'offscreen'
  | 'covered'
  | 'disabled'
  | 'sensitive'
  | 'ready'

export interface ElementCapturedState {
  visible: boolean
  inViewport: boolean
  enabled: boolean
  covered: boolean
  overlay: boolean
  sensitive: boolean
  actionableNow: boolean
  reason: ElementStateReason
  textContent: string
  valuePreview: string | null
  /** Fillable target holds a non-empty value (signature signal; never leaks the value). */
  hasValue: boolean
  /** Fillable target is required (HTML `required` or `aria-required="true"`). */
  required: boolean
  center?: { x: number; y: number }
  size?: { w: number; h: number }
}

export function captureElementState(
  element: Element,
  opts?: ElementStateOptions,
): ElementCapturedState {
  const el = element as HTMLElement
  const win = el.ownerDocument?.defaultView ?? window
  const doc = el.ownerDocument ?? document

  interface Bounds { top: number; left: number; right: number; bottom: number }

  function toBounds(rect: { top: number; left: number; right: number; bottom: number }): Bounds {
    return {
      top: Math.min(rect.top, rect.bottom),
      left: Math.min(rect.left, rect.right),
      right: Math.max(rect.left, rect.right),
      bottom: Math.max(rect.top, rect.bottom),
    }
  }

  function intersectBounds(rect: Bounds, other: Bounds): Bounds | null {
    const top = Math.max(rect.top, other.top)
    const left = Math.max(rect.left, other.left)
    const right = Math.min(rect.right, other.right)
    const bottom = Math.min(rect.bottom, other.bottom)
    if (right - left < 1 || bottom - top < 1) return null
    return { top, left, right, bottom }
  }

  function isScrollableOverflowValue(value: string): boolean {
    return value === 'auto' || value === 'scroll' || value === 'overlay'
  }

  function viewportRect(target: HTMLElement): Bounds | null {
    let visibleRect = intersectBounds(toBounds(target.getBoundingClientRect()), {
      top: 0,
      left: 0,
      right: win.innerWidth,
      bottom: win.innerHeight,
    })
    if (!visibleRect) return null

    let current = target.parentElement
    while (current && current !== doc.body && current !== doc.documentElement) {
      const style = win.getComputedStyle(current)
      if (
        isScrollableOverflowValue(style.overflow) ||
        isScrollableOverflowValue(style.overflowX) ||
        isScrollableOverflowValue(style.overflowY)
      ) {
        visibleRect = intersectBounds(visibleRect, toBounds(current.getBoundingClientRect()))
        if (!visibleRect) return null
      }
      current = current.parentElement
    }
    return visibleRect
  }

  function isVisibleEl(target: HTMLElement): boolean {
    const style = win.getComputedStyle(target)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = target.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function isEnabledEl(target: HTMLElement): boolean {
    if ('disabled' in target) {
      return !(target as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled
    }
    return true
  }

  function samplePoints(rect: Bounds): Array<{ x: number; y: number }> {
    if (rect.right - rect.left < 1 || rect.bottom - rect.top < 1) return []
    const insetX = Math.min(18, Math.max(4, (rect.right - rect.left) * 0.15))
    const insetY = Math.min(18, Math.max(4, (rect.bottom - rect.top) * 0.15))
    const left = rect.left + insetX
    const centerX = (rect.left + rect.right) / 2
    const right = rect.right - insetX
    const top = rect.top + insetY
    const centerY = (rect.top + rect.bottom) / 2
    const bottom = rect.bottom - insetY
    const ordered = [
      { x: centerX, y: centerY },
      { x: left, y: centerY },
      { x: right, y: centerY },
      { x: centerX, y: top },
      { x: centerX, y: bottom },
      { x: left, y: top },
      { x: right, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
    ]
    const unique = new Map<string, { x: number; y: number }>()
    for (const point of ordered) {
      const key = `${Math.round(point.x * 100) / 100}:${Math.round(point.y * 100) / 100}`
      if (!unique.has(key)) unique.set(key, point)
    }
    return Array.from(unique.values())
  }

  function isTopmostInteractableEl(target: HTMLElement): boolean {
    if (typeof doc.elementFromPoint !== 'function') return true
    const rect = viewportRect(target)
    if (!rect) return false
    for (const point of samplePoints(rect)) {
      if (
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 || point.y < 0 || point.x > win.innerWidth || point.y > win.innerHeight
      ) {
        continue
      }
      const topmost = doc.elementFromPoint(point.x, point.y)
      if (topmost && (topmost === target || target.contains(topmost))) return true
    }
    return false
  }

  function isOverlayEl(target: HTMLElement): boolean {
    let current: HTMLElement | null = target
    while (current && current !== doc.body) {
      const role = current.getAttribute('role')
      const ariaModal = current.getAttribute('aria-modal')
      const style = win.getComputedStyle(current)
      const zIndex = Number(style.zIndex)
      if (
        role === 'dialog' ||
        role === 'alertdialog' ||
        ariaModal === 'true' ||
        (style.position === 'fixed' && Number.isFinite(zIndex) && zIndex > 0)
      ) {
        return true
      }
      current = current.parentElement
    }
    return false
  }

  function isSensitiveEl(target: HTMLElement, manifestFlag?: boolean): boolean {
    if (manifestFlag === true) return true

    if (target instanceof win.HTMLInputElement && target.type === 'password') return true

    const autocompleteSensitive = new Set([
      'current-password',
      'new-password',
      'one-time-code',
      'cc-number',
      'cc-csc',
      'cc-exp',
      'cc-exp-month',
      'cc-exp-year',
    ])
    const autocomplete = target.getAttribute('autocomplete')
    if (autocomplete && autocompleteSensitive.has(autocomplete.toLowerCase().trim())) return true

    const wordBoundary = /\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i
    const nameAttrPattern = /(?:^|[_\-\s.])(?:password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)(?:[_\-\s.]|$)/i

    const placeholder = target.getAttribute('placeholder') ?? ''
    if (placeholder && wordBoundary.test(placeholder)) return true

    const nameAttr = target.getAttribute('name') ?? ''
    if (nameAttr && nameAttrPattern.test(nameAttr)) return true

    const idAttr = target.id ?? ''
    if (idAttr && nameAttrPattern.test(idAttr)) return true

    const multilang = new Set([
      '비밀번호', '패스워드', '핀번호', '보안코드',
      'パスワード', 'ぱすわーど', '暗証番号',
      '密码', '口令', '密碼',
      'mot de passe',
      'passwort', 'kennwort',
      'contraseña',
    ])
    const ariaLabelRaw = target.getAttribute('aria-label') ?? ''
    const ariaLabel = ariaLabelRaw.trim().toLowerCase()
    if (ariaLabel) {
      if (multilang.has(ariaLabel)) return true
      for (const token of ariaLabel.split(/\s+/)) {
        if (token && multilang.has(token)) return true
      }
      if (wordBoundary.test(ariaLabelRaw)) return true
    }

    return false
  }

  function isFillable(target: Element): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    return (
      target instanceof win.HTMLInputElement ||
      target instanceof win.HTMLTextAreaElement ||
      target instanceof win.HTMLSelectElement
    )
  }

  const sensitive = isSensitiveEl(el, opts?.sensitiveFlag)
  const visible = isVisibleEl(el)
  const inViewport = visible && viewportRect(el) !== null
  const enabled = isEnabledEl(el)
  const covered = inViewport ? !isTopmostInteractableEl(el) : false
  const actionableNow = visible && enabled && !covered
  const overlay = isOverlayEl(el)

  let reason: ElementStateReason = 'ready'
  if (!visible) reason = 'hidden'
  else if (!inViewport) reason = 'offscreen'
  else if (covered) reason = 'covered'
  else if (!enabled) reason = 'disabled'
  else if (opts?.fillAction === true && sensitive) reason = 'sensitive'

  const textContent = el.textContent?.trim() ?? ''
  const fillable = isFillable(el)
  const valuePreview = fillable && !sensitive ? el.value : null
  // Presence-only signal (no value, no length) so a sensitive fill still changes
  // the signature without leaking the secret.
  const hasValue = fillable ? el.value.length > 0 : false
  // Required intent: native constraint or the ARIA equivalent. Scoped to fillable
  // targets — the "still-needed fields" nudge pairs this with hasValue.
  const required =
    fillable && ((el as HTMLInputElement).required === true || el.getAttribute('aria-required') === 'true')

  let center: ElementCapturedState['center']
  let size: ElementCapturedState['size']
  if (actionableNow) {
    const rect = el.getBoundingClientRect()
    center = {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    }
    size = { w: Math.round(rect.width), h: Math.round(rect.height) }
  }

  return {
    visible,
    inViewport,
    enabled,
    covered,
    overlay,
    sensitive,
    actionableNow,
    reason,
    textContent,
    valuePreview,
    hasValue,
    required,
    center,
    size,
  }
}

/**
 * Live pan/zoom transform of a canvas viewport element plus its pane's screen
 * rect. Read FRESH immediately before a canvas drag (pan/zoom and page scroll
 * both move it), then combined with the pure `canvasToViewport`/`viewportToCanvas`
 * helpers in @agrune/core to map a stable canvas coordinate to a viewport pixel.
 * Returns null when the viewport or pane element is not on the page.
 *
 * A structural superset of core's `CanvasViewportTransform` (adds the pane's
 * right/bottom edges for the off-pane bounds check), so it can be passed anywhere
 * a `CanvasViewportTransform` is expected with no field remapping.
 */
export interface CanvasTransformResult extends CanvasViewportTransform {
  /** Right/bottom of the pane rect (paneLeft/paneTop are inherited). */
  paneRight: number
  paneBottom: number
}

export function readCanvasTransformInBrowser(
  arg: { viewportSelector: string; paneSelector?: string | null },
): CanvasTransformResult | null {
  const viewport = document.querySelector(arg.viewportSelector) as HTMLElement | null
  if (!viewport) return null
  // The pane is the NON-transformed container that provides the screen origin.
  // Default to the viewport's parent (the renderer); the viewport itself is
  // transformed, so its own rect must NOT be used as the origin.
  const pane = (arg.paneSelector
    ? (document.querySelector(arg.paneSelector) as HTMLElement | null)
    : viewport.parentElement) as HTMLElement | null
  if (!pane) return null
  const paneRect = pane.getBoundingClientRect()

  let scale = 1
  let translateX = 0
  let translateY = 0
  const style = window.getComputedStyle(viewport)
  const transform = style.transform && style.transform !== 'none'
    ? style.transform
    : 'matrix(1, 0, 0, 1, 0, 0)'
  try {
    const Matrix = (window as unknown as { DOMMatrixReadOnly?: typeof DOMMatrixReadOnly }).DOMMatrixReadOnly
    if (Matrix) {
      const m = new Matrix(transform)
      scale = m.a || 1
      translateX = m.e
      translateY = m.f
    } else {
      // Fallback parse of "matrix(a, b, c, d, e, f)".
      const nums = transform.replace(/^matrix\(|\)$/g, '').split(',').map(v => Number(v.trim()))
      if (nums.length === 6 && nums.every(n => Number.isFinite(n))) {
        scale = nums[0] || 1
        translateX = nums[4]
        translateY = nums[5]
      }
    }
  } catch {
    // leave identity defaults
  }

  return {
    paneLeft: paneRect.left,
    paneTop: paneRect.top,
    paneRight: paneRect.right,
    paneBottom: paneRect.bottom,
    translateX,
    translateY,
    scale,
  }
}

/** DoS cap: maximum repeat instances expanded per repeat target. */
export const REPEAT_MAX_INSTANCES = 1000

export interface RepeatRowArgs {
  keyFrom: string
  nameFrom: string | null
  virtualized: boolean
  maxInstances: number
}

export interface RepeatRow {
  /** Index among the locator's matched elements — for `locator.nth(domIndex)`. */
  domIndex: number
  /** Index within the (filtered, capped) instance list — runtime `repeatInstance.index` parity. */
  index: number
  key: string
  name: string
}

export function expandRepeatRows(elements: Element[], args: RepeatRowArgs): RepeatRow[] {
  const win = elements[0]?.ownerDocument?.defaultView ?? window
  const doc = elements[0]?.ownerDocument ?? document

  interface Bounds { top: number; left: number; right: number; bottom: number }

  function toBounds(rect: { top: number; left: number; right: number; bottom: number }): Bounds {
    return {
      top: Math.min(rect.top, rect.bottom),
      left: Math.min(rect.left, rect.right),
      right: Math.max(rect.left, rect.right),
      bottom: Math.max(rect.top, rect.bottom),
    }
  }

  function intersectBounds(rect: Bounds, other: Bounds): Bounds | null {
    const top = Math.max(rect.top, other.top)
    const left = Math.max(rect.left, other.left)
    const right = Math.min(rect.right, other.right)
    const bottom = Math.min(rect.bottom, other.bottom)
    if (right - left < 1 || bottom - top < 1) return null
    return { top, left, right, bottom }
  }

  function isScrollableOverflowValue(value: string): boolean {
    return value === 'auto' || value === 'scroll' || value === 'overlay'
  }

  function inViewport(target: HTMLElement): boolean {
    let visibleRect = intersectBounds(toBounds(target.getBoundingClientRect()), {
      top: 0,
      left: 0,
      right: win.innerWidth,
      bottom: win.innerHeight,
    })
    if (!visibleRect) return false
    let current = target.parentElement
    while (current && current !== doc.body && current !== doc.documentElement) {
      const style = win.getComputedStyle(current)
      if (
        isScrollableOverflowValue(style.overflow) ||
        isScrollableOverflowValue(style.overflowX) ||
        isScrollableOverflowValue(style.overflowY)
      ) {
        visibleRect = intersectBounds(visibleRect, toBounds(current.getBoundingClientRect()))
        if (!visibleRect) return false
      }
      current = current.parentElement
    }
    return true
  }

  let candidates = elements.map((el, domIndex) => ({ el: el as HTMLElement, domIndex }))
  if (args.virtualized) {
    candidates = candidates.filter(candidate => inViewport(candidate.el))
  }
  if (candidates.length > args.maxInstances) {
    console.warn(
      `[agrune] expandRepeatRows: truncated from ${candidates.length} to ${args.maxInstances} instances (DoS cap)`,
    )
    candidates = candidates.slice(0, args.maxInstances)
  }

  let keyFn: ((el: HTMLElement) => string) | null = null
  try {
    keyFn = new Function('el', `return String(${args.keyFrom})`) as (el: HTMLElement) => string
  } catch (err) {
    console.warn('[agrune] expandRepeatRows: keyFrom compile failed:', err)
  }

  let nameFn: ((el: HTMLElement) => string) | null = null
  if (args.nameFrom) {
    try {
      nameFn = new Function('el', `return String(${args.nameFrom})`) as (el: HTMLElement) => string
    } catch (err) {
      console.warn('[agrune] expandRepeatRows: nameFrom compile failed:', err)
    }
  }

  const seen = new Map<string, number>()

  return candidates.map((candidate, index) => {
    let key: string
    if (keyFn) {
      try {
        const raw = keyFn(candidate.el)
        if (raw === undefined || raw === null || raw === 'undefined' || raw === 'null') {
          key = `__idx_${index}`
        } else {
          key = raw.trim()
          if (!key) key = `__idx_${index}`
        }
      } catch {
        key = `__idx_${index}`
      }
    } else {
      key = `__idx_${index}`
    }

    if (seen.has(key)) {
      key = `${key}__dup_${index}`
    }
    seen.set(key, index)

    let name = ''
    if (nameFn) {
      try {
        name = nameFn(candidate.el).trim()
      } catch {
        name = ''
      }
    }

    return { domIndex: candidate.domIndex, index, key, name }
  })
}

/**
 * READ-ONLY logical size hint from a virtualized repeat container:
 * `aria-rowcount` > `aria-setsize` > null.
 */
export function readContainerLogicalSize(element: Element): number | null {
  const rowCount = element.getAttribute('aria-rowcount')
  if (rowCount !== null) {
    const n = Number.parseInt(rowCount, 10)
    if (Number.isFinite(n) && n >= 0) return n
    return null
  }
  const setSize = element.getAttribute('aria-setsize')
  if (setSize !== null) {
    const n = Number.parseInt(setSize, 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

// ---------------------------------------------------------------------------
// Test-facing wrappers and data mirrors.
//
// The logic lives inside `captureElementState`; these exist so unit tests can
// exercise individual heuristics directly. The regex/set constants mirror the
// inline literals above — the or-only/corpus suites run through
// `captureElementState`, so the inline copies are what is actually verified.
// ---------------------------------------------------------------------------

export function isSensitive(element: HTMLElement, manifestFlag?: true | undefined): boolean {
  return captureElementState(element, { sensitiveFlag: manifestFlag === true }).sensitive
}

export const SENSITIVE_WORD_BOUNDARY =
  /\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i

export const SENSITIVE_NAME_ATTR =
  /(?:^|[_\-\s.])(?:password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)(?:[_\-\s.]|$)/i

export const SENSITIVE_ARIA_LABELS_MULTILANG: ReadonlySet<string> = new Set<string>([
  '비밀번호', '패스워드', '핀번호', '보안코드',
  'パスワード', 'ぱすわーど', '暗証番号',
  '密码', '口令', '密碼',
  'mot de passe',
  'passwort', 'kennwort',
  'contraseña',
])
