import type { AuroraTheme, AgagruneRuntimeConfig, DragPlacement } from '@agrune/core'
import { getCursorMeta, DEFAULT_CURSOR_NAME, POINTER_FILL_SVG, POINTER_BORDER_MASK_SVG } from './cursors/index'
import type { CursorMeta } from './cursors/index'
import { Motion } from 'ai-motion'
import {
  type PointerCoords,
  getDragPlacementCoords,
  getEventTargetAtPoint,
  getInteractablePoint,
} from './dom-utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CURSOR_STYLE_ID = 'agrune-cursor-style'
export const CURSOR_CLICK_PRESS_MS = 100
export const CURSOR_POST_ANIMATION_DELAY_MS = 200
export const IDLE_TIMEOUT_MS = 5_000

const DEFAULT_POINTER_DURATION_MS = 600

export function resolvePointerDurationMs(durationMs: number | undefined): number {
  return Number.isFinite(durationMs) && durationMs != null && durationMs >= 0
    ? durationMs
    : DEFAULT_POINTER_DURATION_MS
}

// ---------------------------------------------------------------------------
// Cursor state
// ---------------------------------------------------------------------------

export interface CursorState {
  element: HTMLDivElement
  cursorName: string
  lastX: number | null
  lastY: number | null
}

export let cursorState: CursorState | null = null

/** Reset cursorState — exported for testing and disposal */
export function resetCursorState(): void {
  cursorState = null
}

// ---------------------------------------------------------------------------
// Cursor element creation
// ---------------------------------------------------------------------------

export function ensureCursorStyles(): void {
  if (document.getElementById(CURSOR_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = CURSOR_STYLE_ID
  style.textContent = `
.agrune-cursor{position:fixed;top:0;left:0;width:75px;height:75px;pointer-events:none;z-index:2147483647;will-change:transform;display:none}
.agrune-cursor-filling{position:absolute;width:100%;height:100%;background-image:url("${POINTER_FILL_SVG}");background-size:100% 100%;background-repeat:no-repeat;filter:drop-shadow(3px 4px 4px rgba(0,0,0,0.4));transform-origin:center;transform:rotate(-135deg) scale(1.2);margin-left:-10px;margin-top:-18px}
.agrune-cursor-border{position:absolute;width:100%;height:100%;background:linear-gradient(45deg,rgb(57,182,255),rgb(189,69,251));-webkit-mask-image:url("${POINTER_BORDER_MASK_SVG}");mask-image:url("${POINTER_BORDER_MASK_SVG}");-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;transform-origin:center;transform:rotate(-135deg) scale(1.2);margin-left:-10px;margin-top:-18px}
.agrune-cursor-ripple{position:absolute;width:100%;height:100%;pointer-events:none;margin-left:-50%;margin-top:-50%}
.agrune-cursor-ripple::after{content:"";opacity:0;position:absolute;inset:0;border:4px solid rgba(57,182,255,1);border-radius:50%}
.agrune-cursor.clicking .agrune-cursor-ripple::after{animation:agrune-ripple 300ms ease-out forwards}
@keyframes agrune-ripple{0%{transform:scale(0);opacity:1}100%{transform:scale(2);opacity:0}}
`
  document.head.appendChild(style)
}

export function createPointerCursorElement(): HTMLDivElement {
  ensureCursorStyles()
  const el = document.createElement('div')
  el.className = 'agrune-cursor'
  el.setAttribute('data-agrune-pointer', 'true')

  const ripple = document.createElement('div')
  ripple.className = 'agrune-cursor-ripple'
  const filling = document.createElement('div')
  filling.className = 'agrune-cursor-filling'
  const border = document.createElement('div')
  border.className = 'agrune-cursor-border'

  el.appendChild(ripple)
  el.appendChild(filling)
  el.appendChild(border)
  return el
}

export function createSvgCursorElement(meta: CursorMeta): HTMLDivElement {
  const el = document.createElement('div')
  el.setAttribute('data-agrune-pointer', 'true')
  el.innerHTML = meta.svg ?? ''
  Object.assign(el.style, {
    position: 'fixed',
    top: '0px',
    left: '0px',
    width: `${meta.width}px`,
    height: `${meta.height}px`,
    pointerEvents: 'none',
    zIndex: '2147483647',
    willChange: 'transform',
    display: 'none',
  })
  return el
}

export function getOrCreateCursorElement(cursorName: string): CursorState {
  const meta = getCursorMeta(cursorName)

  if (cursorState) {
    if (!cursorState.element.parentElement) {
      document.body.appendChild(cursorState.element)
    }
    if (cursorState.cursorName !== cursorName) {
      cursorState.element.remove()
      const el = meta.kind === 'css-layers' ? createPointerCursorElement() : createSvgCursorElement(meta)
      document.body.appendChild(el)
      cursorState.element = el
      cursorState.cursorName = cursorName
    }
    return cursorState
  }

  const el = meta.kind === 'css-layers' ? createPointerCursorElement() : createSvgCursorElement(meta)
  document.body.appendChild(el)
  cursorState = { element: el, cursorName, lastX: null, lastY: null }
  return cursorState
}

// ---------------------------------------------------------------------------
// Cursor state helpers
// ---------------------------------------------------------------------------

export function saveCursorPosition(state: CursorState, x: number, y: number): void {
  state.lastX = x
  state.lastY = y
}

export function getCursorStartPosition(state: CursorState): { x: number; y: number } {
  if (state.lastX !== null && state.lastY !== null) {
    return {
      x: state.lastX,
      y: state.lastY,
    }
  }

  return {
    x: window.innerWidth + 20,
    y: window.innerHeight / 2,
  }
}

export function getCursorTranslatePosition(
  coords: PointerCoords,
  meta: CursorMeta,
): { x: number; y: number } {
  return {
    x: coords.clientX - meta.hotspotX,
    y: coords.clientY - meta.hotspotY,
  }
}

// ---------------------------------------------------------------------------
// Cursor transform & transition helpers
// ---------------------------------------------------------------------------

export function setCursorTransform(
  el: HTMLDivElement,
  x: number,
  y: number,
  scale = 1,
): void {
  el.style.transform =
    scale === 1
      ? `translate(${x}px, ${y}px)`
      : `translate(${x}px, ${y}px) scale(${scale})`
}

export async function waitForCursorTransition(el: HTMLDivElement): Promise<void> {
  await new Promise<void>(r => {
    const done = () => { el.removeEventListener('transitionend', done); r() }
    el.addEventListener('transitionend', done, { once: true })
    setTimeout(done, CURSOR_CLICK_PRESS_MS + 50)
  })
}

export function applyCursorPressStyle(el: HTMLDivElement): void {
  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`
}

export function removeCursorPressStyle(el: HTMLDivElement): void {
  el.style.transition = ''
}

export function triggerCursorClick(el: HTMLDivElement): void {
  el.classList.remove('clicking')
  void el.offsetHeight
  el.classList.add('clicking')
}

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function animateWithRAF(
  durationMs: number,
  onFrame: (progress: number) => void,
): Promise<void> {
  return new Promise(resolve => {
    const startTime = performance.now()
    function tick(now: number) {
      const elapsed = now - startTime
      const raw = Math.min(elapsed / durationMs, 1)
      onFrame(raw)
      if (raw < 1) {
        requestAnimationFrame(tick)
      } else {
        resolve()
      }
    }
    requestAnimationFrame(tick)
  })
}

// ---------------------------------------------------------------------------
// Overlay show / hide
// ---------------------------------------------------------------------------

export function hidePointerOverlay(): void {
  if (!cursorState) return
  cursorState.element.style.display = 'none'
  cursorState.element.style.transition = ''
  cursorState.element.classList.remove('clicking')
  // Preserve lastX/lastY so the cursor resumes from its last position
  // when re-activated (e.g. between consecutive agent tool calls)
}

function getIdleCursorPosition(meta: CursorMeta): { x: number; y: number } {
  return {
    x: window.innerWidth - meta.hotspotX - 32,
    y: 32 - meta.hotspotY,
  }
}

export function showIdlePointerOverlay(cursorName: string): void {
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element
  const position =
    state.lastX != null && state.lastY != null
      ? { x: state.lastX, y: state.lastY }
      : getIdleCursorPosition(meta)

  el.style.display = 'block'
  el.style.transition = ''
  el.classList.remove('clicking')
  setCursorTransform(el, position.x, position.y)
  state.lastX = position.x
  state.lastY = position.y
}

// ---------------------------------------------------------------------------
// Core cursor animation
// ---------------------------------------------------------------------------

export async function animateCursorTo(
  element: HTMLElement,
  cursorName: string,
  durationMs: number,
  onPress?: () => void,
): Promise<void> {
  const animationDurationMs = resolvePointerDurationMs(durationMs)
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element

  const { x: endX, y: endY } = getCursorTranslatePosition(getInteractablePoint(element), meta)
  const { x: startX, y: startY } = getCursorStartPosition(state)

  el.style.display = 'block'
  setCursorTransform(el, startX, startY)

  await animateWithRAF(animationDurationMs, raw => {
    const t = easeOutCubic(raw)
    const cx = startX + (endX - startX) * t
    const cy = startY + (endY - startY) * t
    setCursorTransform(el, cx, cy)
  })

  // Press down: cursor shrinks
  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`
  setCursorTransform(el, endX, endY, 0.85)
  await waitForCursorTransition(el)

  // Cursor fully pressed — fire ripple + action at the impact moment
  triggerCursorClick(el)
  onPress?.()

  // Release
  setCursorTransform(el, endX, endY, 1)
  await waitForCursorTransition(el)
  el.style.transition = ''

  state.lastX = endX
  state.lastY = endY
}

export async function flashPointerOverlay(
  element: HTMLElement,
  config: AgagruneRuntimeConfig,
  onPress?: () => void,
): Promise<void> {
  await animateCursorTo(
    element,
    config.cursorName ?? DEFAULT_CURSOR_NAME,
    config.pointerDurationMs,
    onPress,
  )
}

// ---------------------------------------------------------------------------
// Animated action wrappers (these call event dispatch functions inline —
// they will be rewritten in Task 12b to use CDP event sequences)
// ---------------------------------------------------------------------------

/**
 * Dependencies that the animated drag wrappers need from the event dispatch
 * system. Passed in to avoid circular imports. Will be removed in Task 12b.
 */
export interface AnimationEventDeps {
  dispatchHoverTransition: (
    previousTarget: HTMLElement | null,
    nextTarget: HTMLElement | null,
    coords: PointerCoords,
    buttons: number,
  ) => void
  dispatchPointerLikeEvent: (
    target: EventTarget,
    type: string,
    coords: PointerCoords,
    buttons: number,
    bubbles: boolean,
    options?: { button?: number },
  ) => void
  dispatchMouseLikeEvent: (
    target: EventTarget,
    type: string,
    coords: PointerCoords,
    buttons: number,
    bubbles: boolean,
    options?: { button?: number; detail?: number },
  ) => void
  dispatchDragMove: (
    sourceElement: HTMLElement,
    hoverTarget: HTMLElement,
    coords: PointerCoords,
  ) => void
  dispatchDragRelease: (
    sourceElement: HTMLElement,
    dropTarget: HTMLElement,
    coords: PointerCoords,
  ) => void
  dispatchDragLikeEvent: (
    target: EventTarget,
    type: string,
    coords: PointerCoords,
    dataTransfer: DataTransfer,
  ) => void
  createSyntheticDataTransfer: () => DataTransfer
  sleep: (ms: number) => Promise<void>
}

export async function animatePointerDragWithCursor(
  sourceElement: HTMLElement,
  destinationElement: HTMLElement,
  placement: DragPlacement,
  cursorName: string,
  durationMs: number,
  deps: AnimationEventDeps,
): Promise<void> {
  const animationDurationMs = resolvePointerDurationMs(durationMs)
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element

  const sourceCoords = getInteractablePoint(sourceElement)
  const destinationCoords = getDragPlacementCoords(destinationElement, placement)
  const { x: sourceX, y: sourceY } = getCursorTranslatePosition(sourceCoords, meta)
  const { x: destinationX, y: destinationY } = getCursorTranslatePosition(destinationCoords, meta)
  const { x: startX, y: startY } = getCursorStartPosition(state)

  el.style.display = 'block'
  setCursorTransform(el, startX, startY)

  await animateWithRAF(animationDurationMs, raw => {
    const t = easeOutCubic(raw)
    const cx = startX + (sourceX - startX) * t
    const cy = startY + (sourceY - startY) * t
    setCursorTransform(el, cx, cy)
  })

  const pressTarget = getEventTargetAtPoint(sourceElement, sourceCoords)
  deps.dispatchHoverTransition(null, pressTarget, sourceCoords, 0)
  deps.dispatchPointerLikeEvent(pressTarget, 'pointermove', sourceCoords, 0, true)
  deps.dispatchMouseLikeEvent(pressTarget, 'mousemove', sourceCoords, 0, true)
  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`
  setCursorTransform(el, sourceX, sourceY, 0.85)
  await waitForCursorTransition(el)

  deps.dispatchPointerLikeEvent(pressTarget, 'pointerdown', sourceCoords, 1, true)
  deps.dispatchMouseLikeEvent(pressTarget, 'mousedown', sourceCoords, 1, true)

  let previousHover = pressTarget
  el.style.transition = ''
  await animateWithRAF(animationDurationMs, raw => {
    const t = raw
    const coords = {
      clientX:
        sourceCoords.clientX +
        (destinationCoords.clientX - sourceCoords.clientX) * t,
      clientY:
        sourceCoords.clientY +
        (destinationCoords.clientY - sourceCoords.clientY) * t,
    }
    const { x, y } = getCursorTranslatePosition(coords, meta)
    setCursorTransform(el, x, y, 0.85)

    const nextHover = getEventTargetAtPoint(destinationElement, coords)
    deps.dispatchHoverTransition(previousHover, nextHover, coords, 1)
    deps.dispatchDragMove(sourceElement, nextHover, coords)
    previousHover = nextHover
  })

  const dropTarget = getEventTargetAtPoint(destinationElement, destinationCoords)
  deps.dispatchHoverTransition(previousHover, dropTarget, destinationCoords, 1)
  deps.dispatchDragRelease(sourceElement, dropTarget, destinationCoords)

  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-out`
  setCursorTransform(el, destinationX, destinationY, 1)
  await waitForCursorTransition(el)
  el.style.transition = ''

  state.lastX = destinationX
  state.lastY = destinationY
}

export async function animatePointerDragToCoordsWithCursor(
  sourceElement: HTMLElement,
  destinationCoords: PointerCoords,
  cursorName: string,
  durationMs: number,
  deps: AnimationEventDeps,
): Promise<void> {
  const animationDurationMs = resolvePointerDurationMs(durationMs)
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element

  const sourceCoords = getInteractablePoint(sourceElement)
  const { x: sourceX, y: sourceY } = getCursorTranslatePosition(sourceCoords, meta)
  const { x: destinationX, y: destinationY } = getCursorTranslatePosition(destinationCoords, meta)
  const { x: startX, y: startY } = getCursorStartPosition(state)

  el.style.display = 'block'
  setCursorTransform(el, startX, startY)

  await animateWithRAF(animationDurationMs, raw => {
    const t = easeOutCubic(raw)
    const cx = startX + (sourceX - startX) * t
    const cy = startY + (sourceY - startY) * t
    setCursorTransform(el, cx, cy)
  })

  const pressTarget = getEventTargetAtPoint(sourceElement, sourceCoords)
  deps.dispatchHoverTransition(null, pressTarget, sourceCoords, 0)
  deps.dispatchPointerLikeEvent(pressTarget, 'pointermove', sourceCoords, 0, true)
  deps.dispatchMouseLikeEvent(pressTarget, 'mousemove', sourceCoords, 0, true)
  deps.dispatchPointerLikeEvent(pressTarget, 'pointerdown', sourceCoords, 1, true)
  deps.dispatchMouseLikeEvent(pressTarget, 'mousedown', sourceCoords, 1, true)

  applyCursorPressStyle(el)
  await deps.sleep(CURSOR_CLICK_PRESS_MS)

  let previousHover = pressTarget
  await animateWithRAF(animationDurationMs, raw => {
    const t = easeOutCubic(raw)
    const cx = sourceX + (destinationX - sourceX) * t
    const cy = sourceY + (destinationY - sourceY) * t
    setCursorTransform(el, cx, cy)

    const coords: PointerCoords = {
      clientX: sourceCoords.clientX + (destinationCoords.clientX - sourceCoords.clientX) * t,
      clientY: sourceCoords.clientY + (destinationCoords.clientY - sourceCoords.clientY) * t,
    }
    const nextHover = (document.elementFromPoint(coords.clientX, coords.clientY) as HTMLElement | null) ?? sourceElement
    deps.dispatchHoverTransition(previousHover, nextHover, coords, 1)
    deps.dispatchDragMove(sourceElement, nextHover, coords)
    previousHover = nextHover
  })

  const dropTarget = (document.elementFromPoint(destinationCoords.clientX, destinationCoords.clientY) as HTMLElement | null) ?? sourceElement
  deps.dispatchHoverTransition(previousHover, dropTarget, destinationCoords, 1)
  deps.dispatchDragRelease(sourceElement, dropTarget, destinationCoords)

  removeCursorPressStyle(el)
  saveCursorPosition(state, destinationX, destinationY)
}

export async function animateHtmlDragWithCursor(
  sourceElement: HTMLElement,
  destinationElement: HTMLElement,
  placement: DragPlacement,
  cursorName: string,
  durationMs: number,
  deps: AnimationEventDeps,
): Promise<void> {
  const animationDurationMs = resolvePointerDurationMs(durationMs)
  const dataTransfer = deps.createSyntheticDataTransfer()
  const sourceCoords = getInteractablePoint(sourceElement)
  const destinationCoords = getDragPlacementCoords(destinationElement, placement)
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element
  const { x: sourceX, y: sourceY } = getCursorTranslatePosition(sourceCoords, meta)
  const { x: destinationX, y: destinationY } = getCursorTranslatePosition(destinationCoords, meta)
  const { x: startX, y: startY } = getCursorStartPosition(state)

  el.style.display = 'block'
  setCursorTransform(el, startX, startY)

  await animateWithRAF(animationDurationMs, raw => {
    const t = easeOutCubic(raw)
    const cx = startX + (sourceX - startX) * t
    const cy = startY + (sourceY - startY) * t
    setCursorTransform(el, cx, cy)
  })

  const pressTarget = getEventTargetAtPoint(sourceElement, sourceCoords)
  deps.dispatchHoverTransition(null, pressTarget, sourceCoords, 0)
  deps.dispatchPointerLikeEvent(pressTarget, 'pointermove', sourceCoords, 0, true)
  deps.dispatchMouseLikeEvent(pressTarget, 'mousemove', sourceCoords, 0, true)
  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`
  setCursorTransform(el, sourceX, sourceY, 0.85)
  await waitForCursorTransition(el)

  deps.dispatchPointerLikeEvent(pressTarget, 'pointerdown', sourceCoords, 1, true)
  deps.dispatchMouseLikeEvent(pressTarget, 'mousedown', sourceCoords, 1, true)
  deps.dispatchDragLikeEvent(sourceElement, 'dragstart', sourceCoords, dataTransfer)
  await deps.sleep(0)

  let previousHover = pressTarget
  let previousDropTarget: HTMLElement | null = null
  el.style.transition = ''
  await animateWithRAF(animationDurationMs, raw => {
    const t = raw
    const coords = {
      clientX:
        sourceCoords.clientX +
        (destinationCoords.clientX - sourceCoords.clientX) * t,
      clientY:
        sourceCoords.clientY +
        (destinationCoords.clientY - sourceCoords.clientY) * t,
    }
    const { x, y } = getCursorTranslatePosition(coords, meta)
    setCursorTransform(el, x, y, 0.85)

    const nextHover = getEventTargetAtPoint(destinationElement, coords)
    deps.dispatchHoverTransition(previousHover, nextHover, coords, 1)
    if (nextHover !== previousDropTarget) {
      deps.dispatchDragLikeEvent(nextHover, 'dragenter', coords, dataTransfer)
      previousDropTarget = nextHover
    }
    deps.dispatchDragLikeEvent(nextHover, 'dragover', coords, dataTransfer)
    previousHover = nextHover
  })

  const dropTarget = getEventTargetAtPoint(destinationElement, destinationCoords)
  deps.dispatchHoverTransition(previousHover, dropTarget, destinationCoords, 1)
  if (dropTarget !== previousDropTarget) {
    deps.dispatchDragLikeEvent(dropTarget, 'dragenter', destinationCoords, dataTransfer)
  }
  deps.dispatchDragLikeEvent(dropTarget, 'dragover', destinationCoords, dataTransfer)
  deps.dispatchDragLikeEvent(dropTarget, 'drop', destinationCoords, dataTransfer)
  await deps.sleep(0)
  deps.dispatchDragLikeEvent(sourceElement, 'dragend', destinationCoords, dataTransfer)

  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-out`
  setCursorTransform(el, destinationX, destinationY, 1)
  await waitForCursorTransition(el)
  el.style.transition = ''

  state.lastX = destinationX
  state.lastY = destinationY
}

// ---------------------------------------------------------------------------
// Aurora glow border effect (ai-motion WebGL)
// ---------------------------------------------------------------------------

let motionInstance: Motion | null = null
let motionWrapper: HTMLDivElement | null = null
let currentAuroraTheme: AuroraTheme = 'dark'

export function showAuroraGlow(theme: AuroraTheme): void {
  if (motionInstance && motionWrapper?.isConnected && currentAuroraTheme === theme) return
  if (motionInstance && !motionWrapper?.isConnected) {
    motionInstance = null
    motionWrapper = null
  }
  if (motionWrapper && currentAuroraTheme !== theme) {
    const staleWrapper = motionWrapper
    try {
      motionInstance?.fadeOut()
    } catch {
      // ignore
    }
    staleWrapper.remove()
    motionInstance = null
    motionWrapper = null
  }

  try {
    if (!document.body) return

    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agrune-aurora', 'true')
    Object.assign(wrapper.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483646',
      overflow: 'hidden',
      pointerEvents: 'none',
    })
    document.body.appendChild(wrapper)

    const motion = new Motion({
      mode: theme,
      borderWidth: 2,
      glowWidth: 800,
      borderRadius: 0,
      styles: { position: 'absolute', inset: '0' },
    })

    wrapper.appendChild(motion.element)
    motion.autoResize(wrapper)
    motion.start()
    motion.fadeIn()

    motionInstance = motion
    motionWrapper = wrapper
    currentAuroraTheme = theme
  } catch {
    // WebGL2 not available — silently skip
  }
}

export function hideAuroraGlow(): void {
  if (!motionInstance || !motionWrapper) return
  try {
    motionInstance.fadeOut()
  } catch { /* ignore */ }
  const wrapper = motionWrapper
  motionInstance = null
  motionWrapper = null
  setTimeout(() => wrapper.remove(), 500)
}

// ---------------------------------------------------------------------------
// Animated pointer click (cursor + click overlay convenience)
// ---------------------------------------------------------------------------

export function animatePointerClickWithCursor(
  element: HTMLElement,
  cursorName: string,
  durationMs: number,
  onPress?: () => void,
): Promise<void> {
  return animateCursorTo(element, cursorName, durationMs, onPress)
}
