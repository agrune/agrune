import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let cached: string | null | undefined

/**
 * Locate the `visual-runtime.global.js` IIFE built by @agrune/runtime.
 * Distribution copies it next to the bundled entry (mcp/cli dist); the
 * workspace-dev fallback resolves packages/runtime/dist directly. Visuals are
 * pure decoration, so a missing bundle simply disables them.
 */
export function loadVisualRuntimeSource(): string | null {
  if (cached !== undefined) return cached
  cached = null

  const candidates: string[] = []
  const envPath = process.env.AGRUNE_VISUAL_BUNDLE
  if (envPath && envPath.trim().length > 0) candidates.push(envPath.trim())

  if (process.argv[1]) {
    const entryDir = dirname(process.argv[1])
    candidates.push(
      join(entryDir, 'visual-runtime.global.js'),
      join(entryDir, '..', 'visual-runtime.global.js'),
    )
  }

  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url))
    candidates.push(
      join(moduleDir, 'visual-runtime.global.js'),
      join(moduleDir, '..', 'visual-runtime.global.js'),
      // workspace dev layout: packages/backend/{src,dist} → packages/runtime/dist
      join(moduleDir, '..', '..', 'runtime', 'dist', 'visual-runtime.global.js'),
    )
  } catch {
    // import.meta.url unavailable in some bundling contexts — other candidates cover it.
  }

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        cached = readFileSync(candidate, 'utf-8')
        break
      }
    } catch {
      // unreadable candidate — try the next one
    }
  }
  return cached
}

/**
 * Wrap the IIFE bundle so the `__agrune_visual__` global survives both
 * `context.addInitScript` and ad-hoc `page.evaluate` installation.
 */
export function visualInstallExpression(source: string): string {
  return `(() => { if (window.__agrune_visual__) return; ${source}\n;try { window.__agrune_visual__ = __agrune_visual__ } catch {} })()`
}
