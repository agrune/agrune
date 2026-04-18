/**
 * Shared harness for real user-flow E2E specs.
 *
 * These specs route through the real MCP tool layer + CdpDriver + Chrome,
 * NOT through Playwright's bundled chromium. The point is to exercise the
 * exact stack that Claude Code / Codex hit when they call agrune tools.
 *
 * We construct the MCP server in-process via createMcpServer() and invoke
 * handleToolCall() directly with the same arg shape the stdio transport
 * would deliver — this is effectively identical to what @modelcontextprotocol/sdk
 * routes to the registered tool handlers, minus the JSON-RPC envelope.
 */

import { existsSync } from 'node:fs'
import { CdpDriver } from '@agrune/browser'
import type { CdpDriverOptions } from '@agrune/browser'
import { createMcpServer } from '@agrune/mcp'

export interface McpToolResponse {
  text: string
  isError?: boolean
  parsed: unknown
}

export interface RealHarness {
  driver: CdpDriver
  call: (name: string, args?: Record<string, unknown>) => Promise<McpToolResponse>
  teardown: () => Promise<void>
}

export interface HarnessOptions {
  startUrl?: string
  headless?: boolean
  driverOptions?: Partial<CdpDriverOptions>
}

/**
 * Decide whether real-Chrome E2E can run in the current environment.
 * - PLAYWRIGHT_SKIP_E2E=1 forces skip (matches existing convention).
 * - AGRUNE_E2E_REAL=0 forces skip (explicit opt-out).
 * - Otherwise we need a locatable Chrome binary.
 */
export function realE2eSkipReason(): string | null {
  if (process.env.PLAYWRIGHT_SKIP_E2E === '1') {
    return 'PLAYWRIGHT_SKIP_E2E=1 — run with real Chrome locally to execute.'
  }
  if (process.env.AGRUNE_E2E_REAL === '0') {
    return 'AGRUNE_E2E_REAL=0 — real-Chrome E2E explicitly disabled.'
  }
  const chromePath = findChromePath()
  if (!chromePath) {
    return 'No local Chrome binary found. Install Chrome or set AGRUNE_CHROME_PATH.'
  }
  return null
}

function findChromePath(): string | null {
  const envPath = process.env.AGRUNE_CHROME_PATH
  if (envPath && existsSync(envPath)) return envPath

  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
          ]
  return candidates.find(p => existsSync(p)) ?? null
}

export async function createRealHarness(options: HarnessOptions = {}): Promise<RealHarness> {
  // We default to headless=true so CI / background runs don't pop a window.
  // Local debugging can flip this by passing { headless: false }.
  //
  // NOTE: we deliberately launch Chrome with about:blank and navigate AFTER
  // the driver has auto-attached. On local macOS Chrome Stable we've observed
  // that `Page.addScriptToEvaluateOnNewDocument` occasionally fails to attach
  // `globalThis.__agrune_runtime__` when the driver auto-attaches DURING the
  // very first navigation — likely a race between `Target.setAutoAttach` and
  // the already-in-flight commandline-url navigation. Starting from
  // about:blank and navigating later ensures our injector fires on a
  // fully-settled session, and matches the steady-state path an MCP user
  // hits when they open a new tab after the server is running.
  const desiredUrl = options.startUrl ?? 'http://127.0.0.1:5555/tricky-inputs.html'
  const driver = new CdpDriver({
    mode: 'launch',
    headless: options.headless ?? true,
    startUrl: 'about:blank',
    ...options.driverOptions,
  })

  const { handleToolCall } = createMcpServer(driver)

  const call = async (
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolResponse> => {
    const raw = await handleToolCall(name, args)
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw.text)
    } catch {
      parsed = raw.text
    }
    return { text: raw.text, ...(raw.isError ? { isError: true } : {}), parsed }
  }

  await driver.connect()

  // Give the driver's auto-attach + initial prepareSession on about:blank a
  // tick to settle before we navigate.
  await sleep(200)

  if (desiredUrl && desiredUrl !== 'about:blank') {
    await navigateFirstSession(driver, desiredUrl)
    // Wait for the page to reach document.readyState === 'complete' before
    // re-injecting the runtime. Without this, the re-inject can race with
    // the nav and get discarded when the new document takes over.
    await waitForDocumentComplete(driver, 8_000)
  }

  // Force a re-prepare now that the target document is settled. This is the
  // fix for the auto-attach race: the driver's initial prepareSession ran
  // against about:blank, and `Page.addScriptToEvaluateOnNewDocument` does
  // NOT reliably re-install the runtime on the new document in launch mode.
  await forceReprepare(driver)
  await driver.sessions.waitForSnapshot(5_000)

  return {
    driver,
    call,
    teardown: async () => {
      await driver.disconnect().catch(() => {})
    },
  }
}

async function navigateFirstSession(driver: CdpDriver, url: string): Promise<void> {
  const anyDriver = driver as unknown as {
    targetManager: { getTargets: () => Array<{ sessionId: string | null }> }
    connection: {
      send: (
        method: string,
        params: Record<string, unknown>,
        sessionId?: string,
      ) => Promise<Record<string, unknown>>
    }
  }
  const target = anyDriver.targetManager.getTargets().find(t => t.sessionId)
  if (!target?.sessionId) {
    throw new Error('createRealHarness: no attached session to navigate')
  }
  await anyDriver.connection.send('Page.navigate', { url }, target.sessionId)
}

async function waitForDocumentComplete(driver: CdpDriver, timeoutMs: number): Promise<void> {
  const anyDriver = driver as unknown as {
    targetManager: { getTargets: () => Array<{ sessionId: string | null }> }
    connection: {
      send: (
        method: string,
        params: Record<string, unknown>,
        sessionId?: string,
      ) => Promise<Record<string, unknown>>
    }
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const target of anyDriver.targetManager.getTargets()) {
      if (!target.sessionId) continue
      try {
        const result = await anyDriver.connection.send(
          'Runtime.evaluate',
          {
            expression: 'document.readyState',
            returnByValue: true,
          },
          target.sessionId,
        )
        const value = (result.result as { value?: string } | undefined)?.value
        if (value === 'complete' || value === 'interactive') return
      } catch {
        // ignore — may be mid-navigation
      }
    }
    await sleep(100)
  }
}

/**
 * Re-run the injector on every attached session. Safe to call repeatedly.
 * This is our workaround for the early-launch auto-attach race.
 */
export async function forceReprepare(driver: CdpDriver): Promise<void> {
  const anyDriver = driver as unknown as {
    preparedSessions: Set<string>
    targetManager: { getTargets: () => Array<{ sessionId: string | null; tabId: number }> }
    connection: {
      send: (
        method: string,
        params: Record<string, unknown>,
        sessionId?: string,
      ) => Promise<Record<string, unknown>>
    }
    refreshSnapshot: (tabId: number) => Promise<void>
  }
  for (const target of anyDriver.targetManager.getTargets()) {
    if (!target.sessionId) continue
    anyDriver.preparedSessions.delete(target.sessionId)
    try {
      if (process.env.AGRUNE_E2E_DEBUG === '1') console.log('[forceReprepare] sessionId=', target.sessionId)

      // Bypass the injector's built-in Runtime.evaluate because launch-mode
      // Chrome has a quirk where top-level `var X = ...` in the evaluated
      // script does NOT attach to globalThis. We explicitly alias it to
      // globalThis instead.
      const { readFileSync } = await import('node:fs')
      const runtimeBundlePath = await resolveRuntimeBundlePath()
      const runtimeSrc = readFileSync(runtimeBundlePath, 'utf8')
      const runtimeInstall =
        runtimeSrc +
        '\n;try{globalThis.__agrune_runtime__ = __agrune_runtime__;}catch(e){globalThis.__agrune_runtime_error__ = String(e);}'
      await anyDriver.connection.send(
        'Runtime.evaluate',
        { expression: runtimeInstall, returnByValue: true },
        target.sessionId,
      )

      // Ensure the binding is present (runtime posts snapshots through it).
      await anyDriver.connection.send('Page.enable', {}, target.sessionId).catch(() => {})
      await anyDriver.connection.send('Runtime.enable', {}, target.sessionId).catch(() => {})
      await anyDriver.connection
        .send('Runtime.addBinding', { name: 'agrune_send' }, target.sessionId)
        .catch(() => {})

      // Now run the same bootstrap CdpRuntimeInjector would — but simplified
      // so everything is explicit about attaching to globalThis.
      await anyDriver.connection.send(
        'Runtime.evaluate',
        {
          expression: BOOTSTRAP_SOURCE,
          returnByValue: true,
        },
        target.sessionId,
      )

      // Verify runtime globals installed
      if (process.env.AGRUNE_E2E_DEBUG === '1') {
        const probe = await anyDriver.connection.send('Runtime.evaluate', {
          expression: 'JSON.stringify({runtime: typeof globalThis.__agrune_runtime__, dom: typeof window.agruneDom, qm: typeof window.__agrune_quick_mode__})',
          returnByValue: true,
        }, target.sessionId)
        console.log('[forceReprepare] probe:', JSON.stringify(probe))
      }

      // Now that the runtime is installed, ask for a snapshot explicitly
      // instead of waiting on the MutationObserver scan.
      const snap = await anyDriver.connection.send(
        'Runtime.evaluate',
        {
          expression: `window.__agrune_quick_mode__ && window.__agrune_quick_mode__.getSnapshot()`,
          awaitPromise: true,
          returnByValue: true,
        },
        target.sessionId,
      )
      if (process.env.AGRUNE_E2E_DEBUG === '1') console.log('[forceReprepare] snap result:', JSON.stringify(snap).slice(0, 300))
      const value = (snap.result as { value?: unknown } | undefined)?.value as
        | {
            version?: number
            url?: string
            title?: string
            groups?: unknown[]
            targets?: unknown[]
          }
        | null
        | undefined
      if (
        value &&
        typeof value.version === 'number' &&
        Array.isArray(value.groups) &&
        Array.isArray(value.targets)
      ) {
        ;(driver.sessions as unknown as {
          updateSnapshot: (tabId: number, snapshot: unknown) => void
        }).updateSnapshot(target.tabId, value)
        if (process.env.AGRUNE_E2E_DEBUG === '1') console.log('[forceReprepare] snapshot updated, targets=', value.targets.length)
      } else if (process.env.AGRUNE_E2E_DEBUG === '1') {
        console.log('[forceReprepare] snapshot value was not valid:', JSON.stringify(value).slice(0, 200))
      }
    } catch (e) {
      if (process.env.AGRUNE_E2E_DEBUG === '1') console.log('[forceReprepare] ERR:', e instanceof Error ? e.message : String(e))
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * Bootstrap source — functional equivalent of `buildBootstrapSource()` in
 * `cdp-runtime-injector.ts`, but everything is explicit about attaching to
 * globalThis because launch-mode Runtime.evaluate discards top-level `var`
 * declarations. Includes the MutationObserver + scheduled snapshot posts so
 * DOM changes after a command (e.g. a click that opens a modal) reach the
 * driver's session-manager.
 */
const BOOTSTRAP_SOURCE = `
;(() => {
  if (typeof globalThis.__agrune_runtime__ !== 'object') {
    globalThis.__agrune_bootstrap_error__ = 'runtime missing';
    return;
  }
  const runtimeApi = globalThis.__agrune_runtime__;
  const apiKey = '__agrune_quick_mode__';
  const bindingName = 'agrune_send';
  const debounceMs = 50;
  const post = (type, data) => {
    const b = window[bindingName];
    if (typeof b === 'function') b(JSON.stringify({ type, data }));
  };
  const installRuntime = () => {
    const manifest = runtimeApi.buildManifest(
      runtimeApi.scanAnnotations(document),
      runtimeApi.scanGroups(document),
    );
    runtimeApi.installPageAgentRuntime(manifest, {
      cdpPostMessage: (type, data) => post(type, data),
    });
    post('runtime_ready', {});
    if (window.agruneDom && typeof window.agruneDom.getSnapshot === 'function') {
      post('snapshot_update', window.agruneDom.getSnapshot());
    }
  };
  let snapshotTimer = null;
  const scheduleSnapshot = () => {
    if (snapshotTimer !== null) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      if (window.agruneDom && typeof window.agruneDom.getSnapshot === 'function') {
        post('snapshot_update', window.agruneDom.getSnapshot());
      }
    }, debounceMs);
  };
  const touchesAnnotations = (m) => {
    if (m.type === 'attributes') return typeof m.attributeName === 'string';
    if (m.type === 'childList') return true;
    return false;
  };
  if (!window.__agrune_e2e_observer_installed__) {
    window.__agrune_e2e_observer_installed__ = true;
    const observer = new MutationObserver((muts) => {
      if (muts.some(touchesAnnotations)) scheduleSnapshot();
    });
    observer.observe(document.documentElement || document, {
      attributes: true, childList: true, subtree: true,
    });
    setInterval(() => scheduleSnapshot(), 800);
  }
  window[apiKey] = {
    handleCommand: async (kind, input) => {
      if (!window.agruneDom) installRuntime();
      const runtime = window.agruneDom;
      if (!runtime) throw new Error('Agrune runtime not installed');
      const fn = runtime[kind];
      if (typeof fn !== 'function') throw new Error('Unknown command: ' + kind);
      const result = await fn.call(runtime, input ?? {});
      scheduleSnapshot();
      return result;
    },
    getSnapshot: () => {
      if (!window.agruneDom) installRuntime();
      return window.agruneDom ? window.agruneDom.getSnapshot() : null;
    },
    applyConfig: (config) => {
      if (!window.agruneDom) installRuntime();
      if (window.agruneDom && window.agruneDom.applyConfig) window.agruneDom.applyConfig(config ?? {});
    },
    setAgentActivity: (active) => {
      if (!window.agruneDom) installRuntime();
      if (!window.agruneDom) return;
      if (active) window.agruneDom.beginAgentActivity && window.agruneDom.beginAgentActivity();
      else window.agruneDom.endAgentActivity && window.agruneDom.endAgentActivity();
    },
    dispatchCdpMessage: (detail) => {
      window.dispatchEvent(new CustomEvent('agrune:cdp', { detail }));
    },
  };
  installRuntime();
})();
`

async function resolveRuntimeBundlePath(): Promise<string> {
  const { fileURLToPath } = await import('node:url')
  const { join, dirname } = await import('node:path')
  const { existsSync } = await import('node:fs')

  // Walk up from this helpers file to find packages/runtime/dist/page-runtime.global.js.
  const here = fileURLToPath(import.meta.url)
  let dir = dirname(here)
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'packages/runtime/dist/page-runtime.global.js')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  throw new Error('Could not locate runtime/dist/page-runtime.global.js — run `pnpm build` first.')
}

export interface SnapshotTargetLite {
  targetId: string
  groupId: string
  name: string
}

/**
 * Snapshot + flatten (`mode: 'full'`) so specs can pick a target by its
 * `data-agrune-key` slug without hand-parsing the outline. Waits briefly
 * because the runtime scan is async.
 */
export async function getFullTargets(
  call: RealHarness['call'],
  tabId?: number,
): Promise<SnapshotTargetLite[]> {
  const args: Record<string, unknown> = { mode: 'full' }
  if (typeof tabId === 'number') args.tabId = tabId
  const res = await call('agrune_snapshot', args)
  const parsed = res.parsed as { targets?: SnapshotTargetLite[] } | null
  return parsed?.targets ?? []
}

export async function waitForTargetByName(
  call: RealHarness['call'],
  predicate: (t: SnapshotTargetLite) => boolean,
  {
    tabId,
    timeoutMs = 10_000,
    intervalMs = 200,
  }: { tabId?: number; timeoutMs?: number; intervalMs?: number } = {},
): Promise<SnapshotTargetLite | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const targets = await getFullTargets(call, tabId)
    const hit = targets.find(predicate)
    if (hit) return hit
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return null
}
