import { test, expect } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolvePath(__dirname, '..', '..', '..')
const CLI = resolvePath(REPO_ROOT, 'packages', 'mcp', 'dist', 'bin', 'agrune-mcp.js')
const FIXTURE_DIR = resolvePath(__dirname, '..', 'fixtures')
const GOOD_JSON = resolvePath(FIXTURE_DIR, 'validate-manifest-good.json')
const MISSING_JSON = resolvePath(FIXTURE_DIR, 'validate-manifest-missing.json')
const SENS_JSON = resolvePath(FIXTURE_DIR, 'validate-manifest-sensitive-false.json')
const TS_MANIFEST = resolvePath(FIXTURE_DIR, 'validate-manifest.ts')

// The Playwright config's webServer serves fixtures/ on port 5555.
// validate-test.html is in fixtures/, so we can use this URL for --url tests.
const FIXTURE_URL = 'http://127.0.0.1:5555/validate-test.html'

test.beforeAll(() => {
  if (!existsSync(CLI)) {
    // Build mcp package if dist missing (Task 1 expected already built).
    execFileSync('pnpm', ['--filter', '@agrune/mcp', 'run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    })
  }
})

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  // Use spawnSync with a generous timeout (CLI spawns Playwright browser internally).
  // The webServer in playwright.config.ts serves fixtures on port 5555 so the
  // HTTP server is external to this process — spawnSync blocking is safe here.
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    timeout: 60_000,
  })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

test.describe('MANIFEST-05 — agrune manifest validate', () => {
  test('good manifest + URL — exit 0 and "All N targets matched."', () => {
    const r = runCli(['manifest', 'validate', GOOD_JSON, '--url', FIXTURE_URL])
    expect(r.code, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0)
    expect(r.stdout).toMatch(/All 3 targets matched\./)
  })

  test('missing target + URL — exit 1 and "not found" on ghost_button', () => {
    const r = runCli(['manifest', 'validate', MISSING_JSON, '--url', FIXTURE_URL])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/ghost_button/)
    expect(r.stderr).toMatch(/not found/)
  })

  test('sensitive:false manifest — schema rejection before DOM check', () => {
    const r = runCli(['manifest', 'validate', SENS_JSON])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/sensitive:false is not allowed/)
    expect(r.stderr).toMatch(/OR-only/)
  })

  test('.ts manifest + URL — tsx loader path matches 3 targets', () => {
    const r = runCli(['manifest', 'validate', TS_MANIFEST, '--url', FIXTURE_URL])
    expect(r.code, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0)
    expect(r.stdout).toMatch(/All 3 targets matched\./)
  })

  test('schema-only (no --url) — passes for good manifest', () => {
    const r = runCli(['manifest', 'validate', GOOD_JSON])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Schema OK \(3 targets/)
  })

  test('missing file — exit 1 with Load failed', () => {
    const r = runCli(['manifest', 'validate', '/tmp/does-not-exist-agrune-test.json'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/Load failed|not found/i)
  })
})
