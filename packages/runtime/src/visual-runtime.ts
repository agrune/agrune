/**
 * Visual-effects page runtime — the only code agrune still injects into pages.
 *
 * Actions are executed by the Playwright backend; this bundle is pure
 * decoration: the animated agent cursor and the aurora glow border. It is
 * built as an IIFE exposed as `window.__agrune_visual__` and driven by the
 * backend through `applyConfig` / `animatePointer`.
 */
import type { AgruneRuntimeConfig } from '@agrune/core'
import { mergeRuntimeConfig, normalizeRuntimeConfig } from '@agrune/core'
import {
  CURSOR_CLICK_PRESS_MS,
  IDLE_TIMEOUT_MS,
  animateWithRAF,
  easeOutCubic,
  getCursorStartPosition,
  getCursorTranslatePosition,
  getOrCreateCursorElement,
  hideAuroraGlow,
  hidePointerOverlay,
  resolvePointerDurationMs,
  setCursorTransform,
  showAuroraGlow,
  showIdlePointerOverlay,
  triggerCursorClick,
  waitForCursorTransition,
} from './runtime/cursor-animator'
import { DEFAULT_CURSOR_NAME, getCursorMeta } from './runtime/cursors/index'

export interface AnimatePointerOptions {
  /** Play the press/ripple sequence after the move. Defaults to true. */
  press?: boolean
  durationMs?: number
}

let config: AgruneRuntimeConfig = normalizeRuntimeConfig(undefined)
let idleTimer: ReturnType<typeof setTimeout> | null = null

function clearIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleHide(): void {
  clearIdleTimer()
  idleTimer = setTimeout(() => {
    idleTimer = null
    hideVisuals()
  }, IDLE_TIMEOUT_MS)
}

function showVisuals(): void {
  if (config.auroraGlow) {
    try {
      showAuroraGlow(config.auroraTheme)
    } catch {
      // WebGL unavailable (headless contexts) — glow is best-effort.
    }
  } else {
    hideAuroraGlow()
  }
  if (config.pointerAnimation) {
    showIdlePointerOverlay(config.cursorName ?? DEFAULT_CURSOR_NAME)
  } else {
    hidePointerOverlay()
  }
}

function hideVisuals(): void {
  hideAuroraGlow()
  hidePointerOverlay()
}

export function applyConfig(patch?: Partial<AgruneRuntimeConfig>): AgruneRuntimeConfig {
  config = mergeRuntimeConfig(config, patch ?? {})
  if (config.pointerAnimation || config.auroraGlow) {
    showVisuals()
    scheduleIdleHide()
  } else {
    clearIdleTimer()
    hideVisuals()
  }
  return { ...config }
}

export function getConfig(): AgruneRuntimeConfig {
  return { ...config }
}

/**
 * Animate the agent cursor to viewport coordinates. Resolves when the press
 * sequence finishes; no-op (resolved immediately) while pointerAnimation is
 * disabled.
 */
export async function animatePointer(
  x: number,
  y: number,
  options: AnimatePointerOptions = {},
): Promise<void> {
  if (!config.pointerAnimation) return
  clearIdleTimer()
  showVisuals()

  const cursorName = config.cursorName ?? DEFAULT_CURSOR_NAME
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element

  const { x: endX, y: endY } = getCursorTranslatePosition({ clientX: x, clientY: y }, meta)
  const { x: startX, y: startY } = getCursorStartPosition(state)
  const durationMs = resolvePointerDurationMs(options.durationMs ?? config.pointerDurationMs)

  el.style.display = 'block'
  setCursorTransform(el, startX, startY)

  await animateWithRAF(durationMs, raw => {
    const t = easeOutCubic(raw)
    setCursorTransform(el, startX + (endX - startX) * t, startY + (endY - startY) * t)
  })

  if (options.press !== false) {
    el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`
    setCursorTransform(el, endX, endY, 0.85)
    await waitForCursorTransition(el)
    triggerCursorClick(el)
    setCursorTransform(el, endX, endY, 1)
    await waitForCursorTransition(el)
    el.style.transition = ''
  }

  state.lastX = endX
  state.lastY = endY
  scheduleIdleHide()
}
