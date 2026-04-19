import type { DragPlacement } from '@agrune/core'

// ---------------------------------------------------------------------------
// Constants used by DOM utilities
// ---------------------------------------------------------------------------

const AGRUNE_INTERNAL_SELECTOR = '[data-agrune-aurora], [data-agrune-pointer], #agrune-cursor-style'
const CURSOR_STYLE_ID = 'agrune-cursor-style'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PointerCoords {
  clientX: number
  clientY: number
}

export interface RectBounds {
  top: number
  left: number
  right: number
  bottom: number
}

// ---------------------------------------------------------------------------
// Internal-node detection
// ---------------------------------------------------------------------------

export function isAgruneInternalNode(node: Node | null): boolean {
  if (!node) return false
  if (node.nodeType !== 1) {
    return (node.parentElement?.closest?.(AGRUNE_INTERNAL_SELECTOR) ?? null) != null
  }
  const element = node as HTMLElement
  if (element.id === CURSOR_STYLE_ID) return true
  if (
    element.hasAttribute('data-agrune-aurora') ||
    element.hasAttribute('data-agrune-pointer')
  ) {
    return true
  }
  return element.closest(AGRUNE_INTERNAL_SELECTOR) != null
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function toRectBounds(
  rect: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>,
): RectBounds {
  return {
    top: Math.min(rect.top, rect.bottom),
    left: Math.min(rect.left, rect.right),
    right: Math.max(rect.left, rect.right),
    bottom: Math.max(rect.top, rect.bottom),
  }
}

export function intersectRectBounds(
  rect: RectBounds,
  other: RectBounds,
): RectBounds | null {
  const top = Math.max(rect.top, other.top)
  const left = Math.max(rect.left, other.left)
  const right = Math.min(rect.right, other.right)
  const bottom = Math.min(rect.bottom, other.bottom)

  if (right - left < 1 || bottom - top < 1) {
    return null
  }

  return { top, left, right, bottom }
}

// ---------------------------------------------------------------------------
// Visibility / viewport checks
// ---------------------------------------------------------------------------

export function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function isInViewport(rect: DOMRect): boolean {
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
}

function isScrollableOverflowValue(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'overlay'
}

export function getElementViewportRect(element: HTMLElement): RectBounds | null {
  let visibleRect = intersectRectBounds(
    toRectBounds(element.getBoundingClientRect()),
    {
      top: 0,
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    },
  )

  if (!visibleRect) {
    return null
  }

  let current = element.parentElement
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current)
    if (
      isScrollableOverflowValue(style.overflow) ||
      isScrollableOverflowValue(style.overflowX) ||
      isScrollableOverflowValue(style.overflowY)
    ) {
      visibleRect = intersectRectBounds(
        visibleRect,
        toRectBounds(current.getBoundingClientRect()),
      )
      if (!visibleRect) {
        return null
      }
    }
    current = current.parentElement
  }

  return visibleRect
}

export function isElementInViewport(element: HTMLElement): boolean {
  return getElementViewportRect(element) !== null
}

export function isEnabled(element: HTMLElement): boolean {
  if ('disabled' in element) {
    return !(element as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled
  }
  return true
}

export function isPointInsideViewport(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight
}

// ---------------------------------------------------------------------------
// Sample-point generation / interactable-point detection
// ---------------------------------------------------------------------------

export function getVisibleSamplePoints(
  rect: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>,
): PointerCoords[] {
  const normalizedRect = toRectBounds(rect)
  if (normalizedRect.right - normalizedRect.left < 1 || normalizedRect.bottom - normalizedRect.top < 1) {
    return []
  }

  const insetX = Math.min(18, Math.max(4, (normalizedRect.right - normalizedRect.left) * 0.15))
  const insetY = Math.min(18, Math.max(4, (normalizedRect.bottom - normalizedRect.top) * 0.15))
  const left = normalizedRect.left + insetX
  const centerX = (normalizedRect.left + normalizedRect.right) / 2
  const right = normalizedRect.right - insetX
  const top = normalizedRect.top + insetY
  const centerY = (normalizedRect.top + normalizedRect.bottom) / 2
  const bottom = normalizedRect.bottom - insetY

  const orderedPoints: PointerCoords[] = [
    { clientX: centerX, clientY: centerY },
    { clientX: left, clientY: centerY },
    { clientX: right, clientY: centerY },
    { clientX: centerX, clientY: top },
    { clientX: centerX, clientY: bottom },
    { clientX: left, clientY: top },
    { clientX: right, clientY: top },
    { clientX: left, clientY: bottom },
    { clientX: right, clientY: bottom },
  ]

  const uniquePoints = new Map<string, PointerCoords>()
  for (const point of orderedPoints) {
    const key = `${Math.round(point.clientX * 100) / 100}:${Math.round(point.clientY * 100) / 100}`
    if (!uniquePoints.has(key)) {
      uniquePoints.set(key, point)
    }
  }

  return Array.from(uniquePoints.values())
}

export function findInteractablePoint(element: HTMLElement): PointerCoords | null {
  if (typeof document.elementFromPoint !== 'function') {
    return getElementCenter(element)
  }

  const viewportRect = getElementViewportRect(element)
  if (!viewportRect) {
    return null
  }

  const samplePoints = getVisibleSamplePoints(viewportRect)
  for (const point of samplePoints) {
    if (
      !Number.isFinite(point.clientX) ||
      !Number.isFinite(point.clientY) ||
      !isPointInsideViewport(point.clientX, point.clientY)
    ) {
      continue
    }
    const topmost = document.elementFromPoint(point.clientX, point.clientY)
    if (topmost && (topmost === element || element.contains(topmost))) {
      return point
    }
  }

  return null
}

export function isTopmostInteractable(element: HTMLElement): boolean {
  if (typeof document.elementFromPoint !== 'function') {
    return true
  }
  return findInteractablePoint(element) !== null
}

export function getInteractablePoint(element: HTMLElement): PointerCoords {
  return findInteractablePoint(element) ?? getElementCenter(element)
}

export function getElementCenter(element: HTMLElement): PointerCoords {
  const rect = element.getBoundingClientRect()
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  }
}

export function getDragPlacementCoords(
  element: HTMLElement,
  placement: DragPlacement,
): PointerCoords {
  const rect = element.getBoundingClientRect()
  const horizontalCenter = rect.left + rect.width / 2
  const edgeOffset = Math.max(6, Math.min(18, rect.height * 0.2))

  if (placement === 'before') {
    return {
      clientX: horizontalCenter,
      clientY: rect.top + edgeOffset,
    }
  }

  if (placement === 'after') {
    return {
      clientX: horizontalCenter,
      clientY: rect.bottom - edgeOffset,
    }
  }

  return {
    clientX: horizontalCenter,
    clientY: rect.top + rect.height / 2,
  }
}

export function getEventTargetAtPoint(
  fallback: HTMLElement,
  coords: PointerCoords,
): HTMLElement {
  const hit = document.elementFromPoint(coords.clientX, coords.clientY)
  return hit instanceof HTMLElement ? hit : fallback
}

// ---------------------------------------------------------------------------
// Element property checks
// ---------------------------------------------------------------------------

/**
 * Sensitive detection — OR-only.
 *
 * Sensitive = manifest-flag OR DOM-heuristic. Once any source reports
 * sensitive, the field is sensitive. A manifest cannot force `sensitive:false`
 * to override a heuristic — the parameter type is `true | undefined`, not
 * `boolean`, and the schema (@agrune/manifest) rejects `sensitive: false`.
 *
 * MANIFEST-04 / MACRO-03. Phase 14 extends the DOM heuristic with
 * word-boundary regex on name/id/placeholder/aria-label and multilingual
 * ARIA scanning.
 */
const AUTOCOMPLETE_SENSITIVE = new Set([
  'current-password',
  'new-password',
  'one-time-code',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
])

// ---------------------------------------------------------------------------
// Phase 14 MACRO-03: sensitive DOM heuristic 확장 (T-14-01, T-14-02)
// ---------------------------------------------------------------------------

/**
 * placeholder / aria-label 속성용 단어 경계 regex.
 * 공백이 \b 역할을 하므로 영어 단어 토큰에 안전하게 적용된다.
 * ReDoS 위험 없음 — 고정 길이 alternation만 사용, 중첩 quantifier 없음 (T-14-04).
 */
export const SENSITIVE_WORD_BOUNDARY =
  /\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i

/**
 * name / id 속성용 regex.
 * underscore · dash · dot · whitespace 를 단어 경계로 처리한다.
 * 예: "user_password" → match, "passwordless" → no match.
 */
export const SENSITIVE_NAME_ATTR =
  /(?:^|[_\-\s.])(?:password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)(?:[_\-\s.]|$)/i

/**
 * 다국어 aria-label exact/token match 목록.
 * 모든 엔트리는 lowercase·trim 상태로 저장.
 *
 * CJK 문자는 \b 가 동작하지 않으므로 (regex word boundary는 \w = [a-zA-Z0-9_] 기준)
 * Set exact-match 가 의도적 설계다 (research Q6, T-14-02).
 * ReadonlySet 으로 런타임 override 를 방지 (T-14-06).
 */
export const SENSITIVE_ARIA_LABELS_MULTILANG: ReadonlySet<string> = new Set<string>([
  // 한국어
  '비밀번호', '패스워드', '핀번호', '보안코드',
  // 일본어
  'パスワード', 'ぱすわーど', '暗証番号',
  // 중국어 간체 / 번체
  '密码', '口令', '密碼',
  // 프랑스어 (lowercase + trim 형태로 저장 — 비교 시 .toLowerCase() 적용)
  'mot de passe',
  // 독일어
  'passwort', 'kennwort',
  // 스페인어
  'contraseña',
])

export function isSensitive(
  element: HTMLElement,
  manifestFlag?: true | undefined,
): boolean {
  // 1. Manifest flag — OR-only. `false` is not a valid argument.
  if (manifestFlag === true) return true

  // 2. DOM heuristic — input type=password
  if (element instanceof HTMLInputElement && element.type === 'password') {
    return true
  }

  // 3. DOM heuristic — autocomplete whitelist
  const autocomplete = element.getAttribute('autocomplete')
  if (autocomplete) {
    const normalized = autocomplete.toLowerCase().trim()
    if (AUTOCOMPLETE_SENSITIVE.has(normalized)) return true
  }

  // -------------------------------------------------------------------------
  // Phase 14 추가 — word-boundary regex (MACRO-03)
  // -------------------------------------------------------------------------

  // 4. placeholder 속성 — 공백 분리된 토큰에 \b 정상 작동
  const placeholder = element.getAttribute('placeholder') ?? ''
  if (placeholder && SENSITIVE_WORD_BOUNDARY.test(placeholder)) return true

  // 5. name 속성 — underscore/dash/dot 구분 경계 regex
  const nameAttr = element.getAttribute('name') ?? ''
  if (nameAttr && SENSITIVE_NAME_ATTR.test(nameAttr)) return true

  // 6. id 속성 — name 과 동일 regex (dot separator 포함)
  const idAttr = element.id ?? ''
  if (idAttr && SENSITIVE_NAME_ATTR.test(idAttr)) return true

  // -------------------------------------------------------------------------
  // Phase 14 추가 — 다국어 aria-label (MACRO-03, CJK Set exact-match)
  // -------------------------------------------------------------------------

  // 7. aria-label — exact phrase match + 공백 분리 토큰 + 영어 word-boundary
  const ariaLabelRaw = element.getAttribute('aria-label') ?? ''
  const ariaLabel = ariaLabelRaw.trim().toLowerCase()
  if (ariaLabel) {
    // 7a. Exact phrase match (e.g. "mot de passe", "비밀번호")
    if (SENSITIVE_ARIA_LABELS_MULTILANG.has(ariaLabel)) return true
    // 7b. 공백 분리 토큰 — CJK 복합 label (e.g. "비밀번호 입력") 처리
    for (const token of ariaLabel.split(/\s+/)) {
      if (token && SENSITIVE_ARIA_LABELS_MULTILANG.has(token)) return true
    }
    // 7c. 영어 단어 경계 regex (e.g. "Credit card CVV")
    if (SENSITIVE_WORD_BOUNDARY.test(ariaLabelRaw)) return true
  }

  return false
}

export function isOverlayElement(element: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current && current !== document.body) {
    const role = current.getAttribute('role')
    const ariaModal = current.getAttribute('aria-modal')
    const style = window.getComputedStyle(current)
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

export function isFillableElement(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
}

export function isContentEditableElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.isContentEditable === true
}

export function canReceiveTextInput(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement {
  return isFillableElement(element) || isContentEditableElement(element)
}

// ---------------------------------------------------------------------------
// Mutation relevance check
// ---------------------------------------------------------------------------

export function isRelevantSnapshotMutation(mutation: MutationRecord): boolean {
  if (mutation.type === 'attributes') {
    return !isAgruneInternalNode(mutation.target)
  }

  for (const node of Array.from(mutation.addedNodes)) {
    if (!isAgruneInternalNode(node)) return true
  }
  for (const node of Array.from(mutation.removedNodes)) {
    if (!isAgruneInternalNode(node)) return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Scroll / animation-frame helpers
// ---------------------------------------------------------------------------

export function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve())
      return
    }
    window.setTimeout(resolve, 16)
  })
}

export async function smoothScrollIntoView(element: HTMLElement): Promise<void> {
  const isReadyForInteraction = () => {
    return isElementInViewport(element) && isTopmostInteractable(element)
  }

  if (isReadyForInteraction()) {
    return
  }

  element.scrollIntoView({ block: 'center', inline: 'center' })
  const deadline = performance.now() + 400
  let lastRect = element.getBoundingClientRect()
  let stableFrames = 0
  while (performance.now() < deadline) {
    await waitForNextFrame()

    const nextRect = element.getBoundingClientRect()
    const moved =
      Math.abs(nextRect.top - lastRect.top) > 0.5 ||
      Math.abs(nextRect.left - lastRect.left) > 0.5 ||
      Math.abs(nextRect.bottom - lastRect.bottom) > 0.5 ||
      Math.abs(nextRect.right - lastRect.right) > 0.5

    if (!moved) {
      stableFrames++
    } else {
      stableFrames = 0
      lastRect = nextRect
    }

    if (isReadyForInteraction()) {
      if (stableFrames >= 1) {
        break
      }
      continue
    }

    if (stableFrames >= 3) {
      break
    }
  }
}

