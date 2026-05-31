import type { Page } from 'playwright'
import type { AgruneManifest } from '@agrune/manifest'
import { validateManifest } from '@agrune/manifest'
import { CliError } from './errors.js'

export async function loadManifestFromPage(page: Page): Promise<AgruneManifest> {
  const raw = await page.evaluate(() => {
    const win = window as typeof window & {
      __agrune_manifest__?: unknown
      __AGRUNE_MANIFEST__?: unknown
    }
    return win.__agrune_manifest__ ?? win.__AGRUNE_MANIFEST__ ?? null
  })

  if (!raw) {
    throw new CliError(
      'MANIFEST_NOT_FOUND',
      'No Agrune manifest found on the active page. Expected window.__agrune_manifest__.',
      { url: page.url() },
    )
  }

  const validated = validateManifest(raw)
  if (!validated.ok) {
    throw new CliError('INVALID_MANIFEST', 'The active page Agrune manifest is invalid.', {
      errors: validated.errors,
    })
  }

  return validated.manifest
}

export function routeApplies(route: string | undefined, url: string): boolean {
  if (!route || route.trim().length === 0) return true
  try {
    return new RegExp(route).test(url)
  } catch {
    return url.includes(route)
  }
}
