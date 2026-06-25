// Real-chromium snapshot build over the golden manifest + a11y fallback pass-through.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import {
  buildSnapshotFromManifest,
  createSnapshotStore,
  refreshSnapshot,
  formatSnapshot,
  ariaSnapshot,
} from '../src/snapshot.js'
import { loadManifestFromPage, resolveTargetOrSelectorLocator } from '../src/resolver.js'
import { goldenManifest, goldenHtml } from './fixtures/golden-manifest.js'

let browser: Browser | null = null
let page: Page | null = null
let available = true

beforeAll(async () => {
  try {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
    await page.setContent(goldenHtml)
    await page.evaluate((m) => {
      ;(window as unknown as { __agrune_manifest__: unknown }).__agrune_manifest__ = m
    }, goldenManifest)
  } catch {
    available = false
  }
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

describe('M3 — snapshot build (real chromium)', () => {
  it('builds the right group/target structure incl. the 2-row repeat', async () => {
    if (!available || !page) return
    const manifest = await loadManifestFromPage(page)
    const snapshot = await buildSnapshotFromManifest(page, manifest, createSnapshotStore())

    expect(snapshot.version).toBe(1)
    const login = snapshot.groups.find((g) => g.groupId === 'login')!
    expect(login.targetIds).toEqual(['username_input', 'password_input'])

    const todos = snapshot.groups.find((g) => g.groupId === 'todos')!
    // direct (new_todo) then repeat instances: toggle@a1, toggle@b2, destroy@a1, destroy@b2.
    expect(todos.targetIds).toHaveLength(5)
    expect(todos.repeats?.[0]).toMatchObject({ repeatId: 'todo_items', instanceCount: 4 })

    const empty = snapshot.groups.find((g) => g.groupId === 'empty_group')!
    expect(empty.targetIds).toHaveLength(0)
  })

  it('outline reflects live counts; full mode marks the password sensitive (no value)', async () => {
    if (!available || !page) return
    const manifest = await loadManifestFromPage(page)
    const snapshot = await buildSnapshotFromManifest(page, manifest, createSnapshotStore())

    const outline = formatSnapshot(snapshot)
    expect(outline).toContain('- group "Login Form" [ref=login]:')
    expect(outline).toContain('  - targets: 2')
    expect(outline).toContain('- group "todos" [ref=todos]:')
    expect(outline).toContain('  - targets: 5')

    const full = formatSnapshot(snapshot, { groupId: 'login' })
    expect(full).toContain('- target "Password" [ref=password_input]:')
    expect(full).toContain('  - reason: sensitive')
    // The secret value is never serialized.
    expect(full).not.toMatch(/value/i)
  })

  it('version is stable across re-captures of an unchanged page (§4.4)', async () => {
    if (!available || !page) return
    const store = createSnapshotStore()
    const manifest = await loadManifestFromPage(page)
    const a = await buildSnapshotFromManifest(page, manifest, store)
    const b = await buildSnapshotFromManifest(page, manifest, store)
    expect(a.version).toBe(b.version)
  })

  it('a11y fallback: no manifest → empty versioned snapshot (- none outline)', async () => {
    if (!browser) return
    const bare = await browser.newPage()
    await bare.setContent('<button>Click</button>')
    const snapshot = await refreshSnapshot(bare, createSnapshotStore())
    expect(formatSnapshot(snapshot)).toContain('- none')

    // …and ariaSnapshot returns Playwright's tree unchanged.
    const aria = await ariaSnapshot(bare, (ref) => resolveTargetOrSelectorLocator(bare, ref), {})
    expect(aria.text).toContain('- button "Click"')
    await bare.close()
  })
})
