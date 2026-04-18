import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, 'fixtures')

// If Playwright's chromium binary cannot be downloaded (sandboxed local env),
// the user can export PLAYWRIGHT_SKIP_E2E=1 to have each test soft-skip itself.
// CI never sets this flag — ci.yml always runs the full suite.

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // A tiny static file server that streams `fixtures/` over HTTP 127.0.0.1:5555.
    // Keeping it inline (no dep) means we don't have to wire another package.
    command: `node -e "import('node:http').then(({createServer}) => import('node:fs/promises').then(async fs => { const srv = createServer(async (req, res) => { const p = new URL(req.url || '/', 'http://x').pathname; const rel = p === '/' ? '/overlay-modal.html' : p; try { const data = await fs.readFile('${fixturesDir}' + rel); const ct = rel.endsWith('.html') ? 'text/html' : rel.endsWith('.js') ? 'text/javascript' : 'text/plain'; res.writeHead(200, {'content-type': ct}); res.end(data); } catch { res.writeHead(404); res.end('not found'); } }); srv.listen(5555, '127.0.0.1', () => console.log('fixtures on 5555')); }));"`,
    url: 'http://127.0.0.1:5555/overlay-modal.html',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
})
