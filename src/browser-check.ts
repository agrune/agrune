// Missing-browser detection → actionable `agrune install` hint (SPEC §9). Public API only:
// chromium.executablePath() returns the expected binary path; we check it exists on disk.

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { CliError } from './errors.js'

export function browserInstalled(): boolean {
  try {
    const p = chromium.executablePath()
    return typeof p === 'string' && p.length > 0 && existsSync(p)
  } catch {
    return false
  }
}

export function assertBrowserInstalled(): void {
  if (!browserInstalled()) {
    throw new CliError(
      'INVALID_COMMAND',
      'No Chromium browser found for Playwright. Run "agrune install" (or "npx playwright install chromium") to download it.',
    )
  }
}
