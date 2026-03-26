/**
 * Synthetic event dispatch functions.
 *
 * These exist solely as a **fallback for test environments** (jsdom) where CDP
 * event sequences are not available.  In production the extension bridge
 * provides CDP and these functions are never called.
 *
 * @internal — not part of the public API.
 */

import type { DragPlacement } from '@agrune/core'
import {
  type PointerCoords,
  getElementCenter,
  getDragPlacementCoords,
  getEventTargetAtPoint,
  getInteractablePoint,
} from './dom-utils'
import type { SyntheticDispatchFallback } from './command-handlers'
import {
  animateWithRAF,
  easeOutCubic,
  getOrCreateCursorElement,
  getCursorStartPosition,
  getCursorTranslatePosition,
  setCursorTransform,
  CURSOR_CLICK_PRESS_MS,
  waitForCursorTransition,
  saveCursorPosition,
  resolvePointerDurationMs,
} from './cursor-animator'
import { getCursorMeta } from './cursors/index'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAG_POINTER_ID = 1
const DRAG_MOVE_STEPS = 12

// ---------------------------------------------------------------------------
// Low-level dispatch helpers
// ---------------------------------------------------------------------------

function dispatchMouseLikeEvent(
  target: EventTarget,
  type: string,
  coords: PointerCoords,
  buttons: number,
  bubbles: boolean,
  options?: { button?: number; detail?: number },
): void {
  const event = new MouseEvent(type, {
    bubbles,
    button: options?.button ?? 0,
    buttons,
    cancelable: true,
    clientX: coords.clientX,
    clientY: coords.clientY,
    composed: true,
    detail: options?.detail ?? 1,
    screenX: coords.clientX,
    screenY: coords.clientY,
  })
  target.dispatchEvent(event)
}

function dispatchPointerLikeEvent(
  target: EventTarget,
  type: string,
  coords: PointerCoords,
  buttons: number,
  bubbles: boolean,
  options?: { button?: number },
): void {
  if (typeof window.PointerEvent !== 'function') return

  const event = new window.PointerEvent(type, {
    bubbles,
    button: options?.button ?? 0,
    buttons,
    cancelable: true,
    clientX: coords.clientX,
    clientY: coords.clientY,
    composed: true,
    isPrimary: true,
    pointerId: DRAG_POINTER_ID,
    pointerType: 'mouse',
    pressure: buttons === 0 ? 0 : 0.5,
    screenX: coords.clientX,
    screenY: coords.clientY,
  })
  target.dispatchEvent(event)
}

function dispatchWheelEvent(
  target: EventTarget,
  coords: PointerCoords,
  deltaY: number,
  ctrlKey: boolean,
): void {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: coords.clientX,
    clientY: coords.clientY,
    screenX: coords.clientX,
    screenY: coords.clientY,
    deltaY,
    deltaMode: 0,
    ctrlKey,
    composed: true,
  })
  target.dispatchEvent(event)
}

function createSyntheticDataTransfer(): DataTransfer {
  if (typeof DataTransfer === 'function') {
    return new DataTransfer()
  }

  const store = new Map<string, string>()
  const dataTransfer = {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as string[],
    clearData(format?: string) {
      if (typeof format === 'string' && format) {
        store.delete(format)
      } else {
        store.clear()
      }
      this.types = Array.from(store.keys())
    },
    getData(format: string) {
      return store.get(format) ?? ''
    },
    setData(format: string, data: string) {
      store.set(format, data)
      this.types = Array.from(store.keys())
    },
    setDragImage() {
      // noop
    },
  } satisfies Partial<DataTransfer> & {
    clearData: (format?: string) => void
    getData: (format: string) => string
    setData: (format: string, data: string) => void
    setDragImage: DataTransfer['setDragImage']
    types: string[]
  }

  return dataTransfer as DataTransfer
}

function dispatchDragLikeEvent(
  target: EventTarget,
  type: string,
  coords: PointerCoords,
  dataTransfer: DataTransfer,
): void {
  const event =
    typeof window.DragEvent === 'function'
      ? new window.DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: coords.clientX,
          clientY: coords.clientY,
          screenX: coords.clientX,
          screenY: coords.clientY,
        })
      : new Event(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
        })

  for (const [key, value] of Object.entries({
    clientX: coords.clientX,
    clientY: coords.clientY,
    screenX: coords.clientX,
    screenY: coords.clientY,
    dataTransfer,
  })) {
    if (key in event) continue
    Object.defineProperty(event, key, {
      configurable: true,
      enumerable: true,
      value,
    })
  }

  if ('dataTransfer' in event) {
    try {
      Object.defineProperty(event, 'dataTransfer', {
        configurable: true,
        enumerable: true,
        value: dataTransfer,
      })
    } catch {
      // noop
    }
  }

  target.dispatchEvent(event)
}

// ---------------------------------------------------------------------------
// Hover transition
// ---------------------------------------------------------------------------

function dispatchHoverTransition(
  previousTarget: HTMLElement | null,
  nextTarget: HTMLElement | null,
  coords: PointerCoords,
  buttons: number,
): void {
  if (previousTarget === nextTarget) return

  if (previousTarget) {
    dispatchPointerLikeEvent(previousTarget, 'pointerout', coords, buttons, true)
    dispatchMouseLikeEvent(previousTarget, 'mouseout', coords, buttons, true)
  }

  if (nextTarget) {
    dispatchPointerLikeEvent(nextTarget, 'pointerover', coords, buttons, true)
    dispatchMouseLikeEvent(nextTarget, 'mouseover', coords, buttons, true)
  }
}

// ---------------------------------------------------------------------------
// High-level event sequences
// ---------------------------------------------------------------------------

function performPointerClickSequence(element: HTMLElement): void {
  const coords = getInteractablePoint(element)
  const pressTarget = getEventTargetAtPoint(element, coords)

  dispatchHoverTransition(null, pressTarget, coords, 0)
  dispatchPointerLikeEvent(pressTarget, 'pointermove', coords, 0, true)
  dispatchMouseLikeEvent(pressTarget, 'mousemove', coords, 0, true)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 1, true)
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 1, true)
  const releaseTarget = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget, 'mouseup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget, 'click', coords, 0, true, { detail: 1 })
}

function performPointerDblClickSequence(element: HTMLElement): void {
  const coords = getInteractablePoint(element)
  const pressTarget = getEventTargetAtPoint(element, coords)

  // First click (detail: 1)
  dispatchHoverTransition(null, pressTarget, coords, 0)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 1, true)
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 1, true)
  const releaseTarget1 = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget1, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget1, 'mouseup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget1, 'click', coords, 0, true, { detail: 1 })

  // Second click (detail: 2)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 1, true)
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 1, true, { detail: 2 })
  const releaseTarget2 = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget2, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget2, 'mouseup', coords, 0, true, { detail: 2 })
  dispatchMouseLikeEvent(releaseTarget2, 'click', coords, 0, true, { detail: 2 })

  // dblclick event
  dispatchMouseLikeEvent(releaseTarget2, 'dblclick', coords, 0, true, { detail: 2 })
}

function performContextMenuSequence(element: HTMLElement): void {
  const coords = getInteractablePoint(element)
  const pressTarget = getEventTargetAtPoint(element, coords)

  dispatchHoverTransition(null, pressTarget, coords, 0)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 2, true, { button: 2 })
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 2, true, { button: 2 })
  const releaseTarget = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget, 'pointerup', coords, 0, true, { button: 2 })
  dispatchMouseLikeEvent(releaseTarget, 'mouseup', coords, 0, true, { button: 2 })
  dispatchMouseLikeEvent(releaseTarget, 'contextmenu', coords, 0, true, { button: 2 })
}

function performHoverSequence(element: HTMLElement): void {
  const coords = getInteractablePoint(element)
  const target = getEventTargetAtPoint(element, coords)

  dispatchPointerLikeEvent(target, 'pointerover', coords, 0, true)
  dispatchPointerLikeEvent(target, 'pointerenter', coords, 0, false)
  dispatchMouseLikeEvent(target, 'mouseover', coords, 0, true)
  dispatchMouseLikeEvent(target, 'mouseenter', coords, 0, false)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function performLongPressSequence(element: HTMLElement): Promise<void> {
  const coords = getInteractablePoint(element)
  const pressTarget = getEventTargetAtPoint(element, coords)

  dispatchHoverTransition(null, pressTarget, coords, 0)
  dispatchPointerLikeEvent(pressTarget, 'pointerdown', coords, 1, true)
  dispatchMouseLikeEvent(pressTarget, 'mousedown', coords, 1, true)

  await sleep(500)

  const releaseTarget = getEventTargetAtPoint(element, coords)
  dispatchPointerLikeEvent(releaseTarget, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(releaseTarget, 'mouseup', coords, 0, true)
  // click event intentionally omitted -- longpress is separate from click
}

async function performHtmlDragSequence(
  sourceElement: HTMLElement,
  destinationElement: HTMLElement,
  placement: DragPlacement,
): Promise<void> {
  const dataTransfer = createSyntheticDataTransfer()
  const sourceCoords = getElementCenter(sourceElement)
  const destinationCoords = getDragPlacementCoords(destinationElement, placement)

  dispatchHoverTransition(null, sourceElement, sourceCoords, 0)
  dispatchDragLikeEvent(sourceElement, 'dragstart', sourceCoords, dataTransfer)
  await sleep(0)

  dispatchDragLikeEvent(destinationElement, 'dragenter', destinationCoords, dataTransfer)
  dispatchDragLikeEvent(destinationElement, 'dragover', destinationCoords, dataTransfer)
  await sleep(0)

  dispatchDragLikeEvent(destinationElement, 'drop', destinationCoords, dataTransfer)
  await sleep(0)

  dispatchDragLikeEvent(sourceElement, 'dragend', destinationCoords, dataTransfer)
}

function dispatchDragMove(
  sourceElement: HTMLElement,
  hoverTarget: HTMLElement,
  coords: PointerCoords,
): void {
  if (hoverTarget === sourceElement) {
    dispatchPointerLikeEvent(sourceElement, 'pointermove', coords, 1, true)
    dispatchMouseLikeEvent(sourceElement, 'mousemove', coords, 1, true)
    return
  }

  dispatchPointerLikeEvent(sourceElement, 'pointermove', coords, 1, false)
  dispatchMouseLikeEvent(sourceElement, 'mousemove', coords, 1, false)
  dispatchPointerLikeEvent(hoverTarget, 'pointermove', coords, 1, true)
  dispatchMouseLikeEvent(hoverTarget, 'mousemove', coords, 1, true)
}

function dispatchDragRelease(
  sourceElement: HTMLElement,
  dropTarget: HTMLElement,
  coords: PointerCoords,
): void {
  if (dropTarget !== sourceElement) {
    dispatchPointerLikeEvent(sourceElement, 'pointerup', coords, 0, false)
    dispatchMouseLikeEvent(sourceElement, 'mouseup', coords, 0, false)
  }

  dispatchPointerLikeEvent(dropTarget, 'pointerup', coords, 0, true)
  dispatchMouseLikeEvent(dropTarget, 'mouseup', coords, 0, true)
}

async function performPointerDragSequence(
  sourceElement: HTMLElement,
  destinationElement: HTMLElement,
  placement: DragPlacement,
): Promise<void> {
  const sourceCoords = getElementCenter(sourceElement)
  dispatchHoverTransition(null, sourceElement, sourceCoords, 0)
  dispatchPointerLikeEvent(sourceElement, 'pointerdown', sourceCoords, 1, true)
  dispatchMouseLikeEvent(sourceElement, 'mousedown', sourceCoords, 1, true)

  const destinationCoords = getDragPlacementCoords(destinationElement, placement)
  let previousHover = sourceElement

  for (let step = 1; step <= DRAG_MOVE_STEPS; step += 1) {
    const progress = step / DRAG_MOVE_STEPS
    const coords = {
      clientX:
        sourceCoords.clientX +
        (destinationCoords.clientX - sourceCoords.clientX) * progress,
      clientY:
        sourceCoords.clientY +
        (destinationCoords.clientY - sourceCoords.clientY) * progress,
    }

    const nextHover = getEventTargetAtPoint(destinationElement, coords)
    dispatchHoverTransition(previousHover, nextHover, coords, 1)
    dispatchDragMove(sourceElement, nextHover, coords)
    previousHover = nextHover
  }

  const dropTarget = getEventTargetAtPoint(destinationElement, destinationCoords)
  dispatchHoverTransition(previousHover, dropTarget, destinationCoords, 1)
  dispatchDragRelease(sourceElement, dropTarget, destinationCoords)
}

async function performPointerDragToCoords(
  sourceElement: HTMLElement,
  destinationCoords: PointerCoords,
): Promise<void> {
  const sourceCoords = getElementCenter(sourceElement)
  dispatchHoverTransition(null, sourceElement, sourceCoords, 0)
  dispatchPointerLikeEvent(sourceElement, 'pointerdown', sourceCoords, 1, true)
  dispatchMouseLikeEvent(sourceElement, 'mousedown', sourceCoords, 1, true)

  let previousHover: HTMLElement = sourceElement

  for (let step = 1; step <= DRAG_MOVE_STEPS; step += 1) {
    const progress = step / DRAG_MOVE_STEPS
    const coords: PointerCoords = {
      clientX:
        sourceCoords.clientX +
        (destinationCoords.clientX - sourceCoords.clientX) * progress,
      clientY:
        sourceCoords.clientY +
        (destinationCoords.clientY - sourceCoords.clientY) * progress,
    }

    const nextHover = (document.elementFromPoint(coords.clientX, coords.clientY) as HTMLElement | null) ?? sourceElement
    dispatchHoverTransition(previousHover, nextHover, coords, 1)
    dispatchDragMove(sourceElement, nextHover, coords)
    previousHover = nextHover
  }

  const dropTarget = (document.elementFromPoint(destinationCoords.clientX, destinationCoords.clientY) as HTMLElement | null) ?? sourceElement
  dispatchHoverTransition(previousHover, dropTarget, destinationCoords, 1)
  dispatchDragRelease(sourceElement, dropTarget, destinationCoords)
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a SyntheticDispatchFallback instance.
 *
 * Used in test environments (jsdom) where CDP is not available.  In production
 * builds the extension bridge provides CDP event sequences and this fallback
 * is never exercised.
 */
export function createSyntheticDispatchFallback(): SyntheticDispatchFallback {
  return {
    performClick: performPointerClickSequence,
    performDblClick: performPointerDblClickSequence,
    performContextMenu: performContextMenuSequence,
    performHover: performHoverSequence,
    performLongPress: performLongPressSequence,
    performPointerDrag: performPointerDragSequence,
    performHtmlDrag: performHtmlDragSequence,
    performPointerDragToCoords,
    dispatchPointerLikeEvent,
    dispatchMouseLikeEvent,
    dispatchWheelEvent,
    animatePointerDragWithCursor: async (src, dst, placement, cursorName, durationMs) => {
      const animMs = resolvePointerDurationMs(durationMs)
      const meta = getCursorMeta(cursorName)
      const state = getOrCreateCursorElement(cursorName)
      const el = state.element

      const srcCoords = getInteractablePoint(src)
      const dstCoords = getDragPlacementCoords(dst, placement)
      const { x: srcX, y: srcY } = getCursorTranslatePosition(srcCoords, meta)
      const { x: dstX, y: dstY } = getCursorTranslatePosition(dstCoords, meta)
      const { x: startX, y: startY } = getCursorStartPosition(state)

      el.style.display = 'block'
      setCursorTransform(el, startX, startY)
      await animateWithRAF(animMs, raw => {
        const t = easeOutCubic(raw)
        setCursorTransform(el, startX + (srcX - startX) * t, startY + (srcY - startY) * t)
      })

      el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`
      setCursorTransform(el, srcX, srcY, 0.85)
      await waitForCursorTransition(el)
      el.style.transition = ''

      await performPointerDragSequence(src, dst, placement)

      el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-out`
      setCursorTransform(el, dstX, dstY, 1)
      await waitForCursorTransition(el)
      el.style.transition = ''
      saveCursorPosition(state, dstX, dstY)
    },
    animatePointerDragToCoordsWithCursor: async (src, dstCoords, cursorName, durationMs) => {
      const animMs = resolvePointerDurationMs(durationMs)
      const meta = getCursorMeta(cursorName)
      const state = getOrCreateCursorElement(cursorName)
      const el = state.element

      const srcCoords = getInteractablePoint(src)
      const { x: srcX, y: srcY } = getCursorTranslatePosition(srcCoords, meta)
      const { x: dstX, y: dstY } = getCursorTranslatePosition(dstCoords, meta)
      const { x: startX, y: startY } = getCursorStartPosition(state)

      el.style.display = 'block'
      setCursorTransform(el, startX, startY)
      await animateWithRAF(animMs, raw => {
        const t = easeOutCubic(raw)
        setCursorTransform(el, startX + (srcX - startX) * t, startY + (srcY - startY) * t)
      })

      await performPointerDragToCoords(src, dstCoords)

      setCursorTransform(el, dstX, dstY)
      saveCursorPosition(state, dstX, dstY)
    },
    animateHtmlDragWithCursor: async (src, dst, placement, cursorName, durationMs) => {
      const animMs = resolvePointerDurationMs(durationMs)
      const meta = getCursorMeta(cursorName)
      const state = getOrCreateCursorElement(cursorName)
      const el = state.element

      const srcCoords = getInteractablePoint(src)
      const dstCoords = getDragPlacementCoords(dst, placement)
      const { x: srcX, y: srcY } = getCursorTranslatePosition(srcCoords, meta)
      const { x: dstX, y: dstY } = getCursorTranslatePosition(dstCoords, meta)
      const { x: startX, y: startY } = getCursorStartPosition(state)

      el.style.display = 'block'
      setCursorTransform(el, startX, startY)
      await animateWithRAF(animMs, raw => {
        const t = easeOutCubic(raw)
        setCursorTransform(el, startX + (srcX - startX) * t, startY + (srcY - startY) * t)
      })

      el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`
      setCursorTransform(el, srcX, srcY, 0.85)
      await waitForCursorTransition(el)
      el.style.transition = ''

      await performHtmlDragSequence(src, dst, placement)

      el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-out`
      setCursorTransform(el, dstX, dstY, 1)
      await waitForCursorTransition(el)
      el.style.transition = ''
      saveCursorPosition(state, dstX, dstY)
    },
  }
}
