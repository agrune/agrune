import { loadManifestFile } from './manifest-file-loader.js'
import { validateManifest } from '@agrune/manifest'
import type { AgruneManifest, SelectorLadder } from '@agrune/manifest'

export async function runValidateCli(args: string[]): Promise<number> {
  const urlArg = getOption(args, '--url')
  const waitSelector = getOption(args, '--wait-selector')
  const filePath = args.find((a) => !a.startsWith('--') && !isOptionValue(args, a))

  if (!filePath) {
    process.stderr.write('Usage: agrune manifest validate <file> [--url <url>] [--wait-selector <css>]\n')
    return 1
  }

  // 1. Load file (.ts via tsx subprocess, .json direct parse)
  let loaded: Awaited<ReturnType<typeof loadManifestFile>>
  try {
    loaded = loadManifestFile(filePath)
  } catch (err) {
    process.stderr.write(`Load failed: ${(err as Error).message}\n`)
    return 1
  }

  // 2. Schema validation (always first — even before DOM check)
  //    sensitive:false, hash class, :nth-child, empty SelectorLadder are rejected here.
  const schema = validateManifest(loaded.manifest)
  if (!schema.ok) {
    process.stderr.write(`Schema validation failed in ${loaded.path}:\n`)
    for (const e of schema.errors) {
      process.stderr.write(`  - ${e.path || '(root)'}: ${e.message}\n`)
    }
    return 1
  }
  const manifest = schema.manifest

  const summary = computeSummary(manifest)

  if (!urlArg) {
    process.stdout.write(`Schema OK (${summary.targets} targets, ${summary.macros} macros, ${summary.repeats} repeats).\n`)
    return 0
  }

  // 3. Live DOM validation (--url provided)
  return await runLiveCheck(manifest, urlArg, waitSelector)
}

function computeSummary(manifest: AgruneManifest): { targets: number; macros: number; repeats: number } {
  let targets = 0
  let repeats = 0
  for (const g of manifest.groups) {
    targets += g.targets.length
    for (const _r of g.repeats ?? []) {
      repeats += 1
      targets += _r.targets.length
    }
  }
  return { targets, macros: manifest.macros?.length ?? 0, repeats }
}

async function runLiveCheck(manifest: AgruneManifest, url: string, waitSelector?: string): Promise<number> {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle' })
    if (waitSelector) {
      await page.waitForSelector(waitSelector, { state: 'attached', timeout: 15000 })
    } else {
      // Default: wait 500ms past networkidle for late JS render
      await page.waitForTimeout(500)
    }

    const flatTargets = flattenTargets(manifest)

    // In-page resolver — mirrors SelectorLadder priority: role > text > testId > attr > css
    const results = await page.evaluate((targetsJson: string) => {
      const targets = JSON.parse(targetsJson) as Array<{ targetId: string; selector: Record<string, unknown> }>

      const HASH = /\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/
      const NTH = /:nth-child\(/

      function computeAccessibleName(el: Element): string {
        const al = el.getAttribute('aria-label')
        if (al && al.trim()) return al.trim()
        const lb = el.getAttribute('aria-labelledby')
        if (lb) {
          const parts = lb
            .split(/\s+/)
            .map((id) => document.getElementById(id))
            .filter((x): x is HTMLElement => x !== null)
            .map((x) => (x.textContent ?? '').trim())
            .filter((s) => s.length > 0)
          if (parts.length > 0) return parts.join(' ')
        }
        return (el.textContent ?? '').trim()
      }

      function resolve(ladder: Record<string, unknown>): HTMLElement[] {
        // role
        if (ladder['role']) {
          const r = ladder['role'] as { name: string; level?: string }
          const els = Array.from(document.querySelectorAll(`[role="${r.name}"]`)) as HTMLElement[]
          const m = r.level ? els.filter((el) => computeAccessibleName(el) === r.level) : els
          if (m.length > 0) return m
        }
        // text
        if (ladder['text']) {
          const textVal = String(ladder['text'])
          const scope = 'button, a, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"]'
          const cands = Array.from(document.querySelectorAll(scope)) as HTMLElement[]
          const exact = cands.filter((el) => computeAccessibleName(el) === textVal)
          if (exact.length > 0) return exact
          const contains = cands.filter((el) => computeAccessibleName(el).includes(textVal))
          if (contains.length > 0) return contains
        }
        // testId
        if (ladder['testId']) {
          const tid = String(ladder['testId'])
          const els = Array.from(document.querySelectorAll(`[data-testid="${tid}"]`)) as HTMLElement[]
          if (els.length > 0) return els
        }
        // attr
        if (ladder['attr']) {
          const attr = String(ladder['attr'])
          if (HASH.test(attr) || NTH.test(attr)) return []
          try {
            const els = Array.from(document.querySelectorAll(attr)) as HTMLElement[]
            if (els.length > 0) return els
          } catch {
            return []
          }
        }
        // css
        if (ladder['css']) {
          const css = String(ladder['css'])
          if (HASH.test(css) || NTH.test(css)) return []
          try {
            const els = Array.from(document.querySelectorAll(css)) as HTMLElement[]
            if (els.length > 0) return els
          } catch {
            return []
          }
        }
        return []
      }

      return targets.map((t) => ({ targetId: t.targetId, found: resolve(t.selector).length > 0 }))
    }, JSON.stringify(flatTargets))

    const failed = results.filter((r) => !r.found)
    if (failed.length === 0) {
      process.stdout.write(`All ${results.length} targets matched.\n`)
      return 0
    }
    process.stderr.write(`${failed.length}/${results.length} targets not found:\n`)
    for (const f of failed) {
      process.stderr.write(`  - ${f.targetId}: not found (tried: role -> text -> testId -> attr -> css)\n`)
    }
    return 1
  } finally {
    await browser.close()
  }
}

function flattenTargets(manifest: AgruneManifest): Array<{ targetId: string; selector: SelectorLadder }> {
  const out: Array<{ targetId: string; selector: SelectorLadder }> = []
  for (const g of manifest.groups) {
    for (const t of g.targets) out.push({ targetId: t.targetId, selector: t.selector })
    for (const r of g.repeats ?? []) {
      for (const t of r.targets) out.push({ targetId: `${r.repeatId}:${t.targetId}`, selector: t.selector })
    }
  }
  return out
}

function getOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  return args[i + 1]
}

function isOptionValue(args: string[], value: string): boolean {
  // If previous arg is a recognized option, this is its value (skip it as positional)
  const i = args.indexOf(value)
  if (i <= 0) return false
  const prev = args[i - 1]
  return prev === '--url' || prev === '--wait-selector'
}
