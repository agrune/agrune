// agrune-visual — OPTIONAL cosmetic add-on (SPEC §8.5).
//
// By the original code's own admission this is "pure decoration": the REAL input is the
// synthetic page.mouse / locator.click executed by agrune core; this only *visualizes* the
// pointer. It ships as a SEPARATE, optional package so its WebGL2/ai-motion dependency stays out
// of the core dependency tree, it is OFF by default, and it has a hard guarantee that it never
// sits on the action critical path. Disabling yields identical landing, no added latency.
//
// This scaffold exposes the injection seam. A full implementation injects an animated cursor
// (easeOutCubic flight + press/ripple) and a fixed-viewport aurora glow via context.addInitScript;
// WebGL2-unavailable contexts silently skip. The agrune core never imports this package.

import type { BrowserContext } from 'playwright'

export interface VisualOptions {
  /** Cursor flight duration (ms). */
  pointerDurationMs?: number
  cursor?: 'default' | 'orb'
  aurora?: boolean
  auroraTheme?: 'light' | 'dark'
}

const CURSOR_SCRIPT = `
;(() => {
  if (window.__agrune_visual__) return
  const cursor = document.createElement('div')
  cursor.style.cssText =
    'position:fixed;top:0;left:0;width:18px;height:18px;border-radius:50%;' +
    'background:rgba(80,140,255,.6);box-shadow:0 0 12px rgba(80,140,255,.8);' +
    'pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);transition:transform .05s'
  const attach = () => { if (document.body && !cursor.isConnected) document.body.appendChild(cursor) }
  document.addEventListener('DOMContentLoaded', attach); attach()
  window.__agrune_visual__ = {
    moveTo(x, y) { cursor.style.left = x + 'px'; cursor.style.top = y + 'px' },
  }
})()
`

/**
 * Attach the visual layer to a context. OPT-IN — agrune core never calls this. Missing WebGL2 /
 * injection failure degrades silently (never throws onto the action path).
 */
export async function connectVisual(context: BrowserContext, _options: VisualOptions = {}): Promise<void> {
  try {
    await context.addInitScript(CURSOR_SCRIPT)
    for (const page of context.pages()) {
      await page.evaluate(CURSOR_SCRIPT).catch(() => undefined)
    }
  } catch {
    // Cosmetic only — never surface an error to the caller.
  }
}
