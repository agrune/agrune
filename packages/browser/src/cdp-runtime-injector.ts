import { existsSync, readFileSync } from 'node:fs'
import { createRequire as createNodeRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CdpConnection } from './cdp-connection.js'

export const QUICK_MODE_RUNTIME_KEY = '__agrune_quick_mode__'

let cachedInjectedSource: string | null = null

function resolvePageRuntimePath(): string {
  const bundledCandidate = fileURLToPath(
    new URL('./page-runtime.global.js', import.meta.url),
  )
  if (existsSync(bundledCandidate)) {
    return bundledCandidate
  }

  const require = createNodeRequire(import.meta.url)

  try {
    return require.resolve('@agrune/runtime/page-runtime')
  } catch {
    const runtimeEntry = require.resolve('@agrune/runtime')
    const candidate = join(dirname(runtimeEntry), 'page-runtime.global.js')
    if (existsSync(candidate)) {
      return candidate
    }
    throw new Error(
      `Could not locate @agrune/runtime page-runtime bundle. Expected ${candidate} to exist.`,
    )
  }
}

function buildBootstrapSource(): string {
  return `
;(() => {
  const runtimeApi = globalThis.__agrune_runtime__;
  const apiKey = ${JSON.stringify(QUICK_MODE_RUNTIME_KEY)};
  const bindingName = 'agrune_send';
  const debounceMs = 50;
  const snapshotIntervalMs = 800;
  const selectors = [
    '[data-agrune-action]',
    '[data-agrune-group]',
    '[data-agrune-canvas]',
    '[data-agrune-meta]',
  ];

  if (
    !runtimeApi ||
    typeof runtimeApi.installPageAgentRuntime !== 'function' ||
    typeof runtimeApi.scanAnnotations !== 'function' ||
    typeof runtimeApi.scanGroups !== 'function' ||
    typeof runtimeApi.buildManifest !== 'function'
  ) {
    throw new Error('Agrune runtime exports are not available in CDP quick mode.');
  }

  const post = (type, data) => {
    const binding = window[bindingName];
    if (typeof binding === 'function') {
      binding(JSON.stringify({ type, data }));
    }
  };

  const hasAnnotations = () => selectors.some(selector => document.querySelector(selector) !== null);

  const getRuntime = () => window.agruneDom ?? null;

  const isRuntimeBusy = () => {
    const runtime = getRuntime();
    if (!runtime) return false;
    if (typeof runtime.isBusy === 'function') {
      return runtime.isBusy();
    }
    if (typeof runtime.isActive === 'function') {
      return runtime.isActive();
    }
    return false;
  };

  let installTimer = null;
  let snapshotTimer = null;
  let pendingInstall = false;
  let currentConfig = {};

  const dispatchSnapshot = () => {
    if (window.agruneDom && typeof window.agruneDom.getSnapshot === 'function') {
      post('snapshot_update', window.agruneDom.getSnapshot());
    }
  };

  const installRuntime = () => {
    if (!hasAnnotations()) return;

    const manifest = runtimeApi.buildManifest(
      runtimeApi.scanAnnotations(document),
      runtimeApi.scanGroups(document),
    );

    runtimeApi.installPageAgentRuntime(manifest, {
      cdpPostMessage: (type, data) => post(type, data),
    });

    if (window.agruneDom && typeof window.agruneDom.applyConfig === 'function') {
      window.agruneDom.applyConfig(currentConfig);
    }

    post('runtime_ready', {});
    dispatchSnapshot();
  };

  const flushInstall = () => {
    if (!pendingInstall) return;
    if (isRuntimeBusy()) {
      scheduleInstall();
      return;
    }
    pendingInstall = false;
    installRuntime();
  };

  const scheduleInstall = () => {
    if (installTimer !== null) clearTimeout(installTimer);
    pendingInstall = true;
    installTimer = setTimeout(() => {
      installTimer = null;
      flushInstall();
    }, debounceMs);
  };

  const scheduleSnapshot = () => {
    if (snapshotTimer !== null) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      dispatchSnapshot();
    }, debounceMs);
  };

  const mutationTouchesAnnotations = (mutation) => {
    if (mutation.type === 'attributes') {
      return typeof mutation.attributeName === 'string' && mutation.attributeName.startsWith('data-agrune-');
    }

    if (mutation.type !== 'childList') return false;

    const matchesAnnotatedTree = (node) => {
      if (!(node instanceof Element)) return false;
      if (selectors.some(selector => node.matches(selector))) return true;
      return selectors.some(selector => node.querySelector(selector) !== null);
    };

    for (const node of mutation.addedNodes) {
      if (matchesAnnotatedTree(node)) return true;
    }

    for (const node of mutation.removedNodes) {
      if (matchesAnnotatedTree(node)) return true;
    }

    return false;
  };

  for (const type of [
    'mousedown', 'mousemove', 'mouseup',
    'pointerdown', 'pointermove', 'pointerup',
    'wheel', 'contextmenu', 'dblclick',
  ]) {
    document.addEventListener(type, (event) => {
      if (event.view === null) {
        Object.defineProperty(event, 'view', { value: window, configurable: true });
      }
    }, { capture: true });
  }

  const bootstrap = () => {
    if (!window[apiKey]) {
      const installObserver = new MutationObserver((mutations) => {
        if (mutations.some(mutation => mutationTouchesAnnotations(mutation))) {
          scheduleInstall();
        }
      });
      const root = document.documentElement ?? document;
      installObserver.observe(root, {
        attributes: true,
        childList: true,
        subtree: true,
      });

      setInterval(() => {
        dispatchSnapshot();
      }, snapshotIntervalMs);

      const wrapHistoryMethod = (name) => {
        const original = history[name];
        if (typeof original !== 'function') return;
        history[name] = function(...args) {
          const result = original.apply(this, args);
          scheduleInstall();
          scheduleSnapshot();
          return result;
        };
      };

      wrapHistoryMethod('pushState');
      wrapHistoryMethod('replaceState');

      window.addEventListener('popstate', () => {
        scheduleInstall();
        scheduleSnapshot();
      });
      window.addEventListener('hashchange', () => {
        scheduleInstall();
        scheduleSnapshot();
      });
    }

    window[apiKey] = {
      handleCommand: async (kind, input) => {
        if (!window.agruneDom) {
          installRuntime();
        }
        const runtime = window.agruneDom;
        if (!runtime) {
          throw new Error('Agrune runtime is not installed on this page.');
        }
        const fn = runtime[kind];
        if (typeof fn !== 'function') {
          throw new Error('Unknown command: ' + kind);
        }
        const result = await fn.call(runtime, input ?? {});
        scheduleSnapshot();
        return result;
      },
      getSnapshot: () => {
        if (!window.agruneDom) {
          installRuntime();
        }
        return window.agruneDom ? window.agruneDom.getSnapshot() : null;
      },
      applyConfig: (config) => {
        currentConfig = { ...currentConfig, ...(config ?? {}) };
        if (!window.agruneDom) {
          installRuntime();
        }
        if (window.agruneDom && typeof window.agruneDom.applyConfig === 'function') {
          window.agruneDom.applyConfig(currentConfig);
        }
      },
      setAgentActivity: (active) => {
        if (!window.agruneDom) {
          installRuntime();
        }
        if (!window.agruneDom) return;
        if (active) {
          window.agruneDom.beginAgentActivity?.();
        } else {
          window.agruneDom.endAgentActivity?.();
        }
      },
      dispatchCdpMessage: (detail) => {
        window.dispatchEvent(new CustomEvent('agrune:cdp', { detail }));
      },
    };

    installRuntime();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
`
}

function getInjectedSource(): string {
  if (cachedInjectedSource !== null) {
    return cachedInjectedSource
  }

  const runtimeSource = readFileSync(resolvePageRuntimePath(), 'utf8')
  cachedInjectedSource = `${runtimeSource}\n${buildBootstrapSource()}`
  return cachedInjectedSource
}

export class CdpRuntimeInjector {
  constructor(private readonly connection: CdpConnection) {}

  async prepareSession(sessionId: string): Promise<void> {
    const source = getInjectedSource()

    await this.connection.send('Page.enable', {}, sessionId).catch(() => {})
    await this.connection.send('Runtime.enable', {}, sessionId)
    await this.connection.send('Runtime.addBinding', { name: 'agrune_send' }, sessionId)
    await this.connection.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source },
      sessionId,
    )
    await this.connection.send(
      'Runtime.evaluate',
      {
        expression: source,
      },
      sessionId,
    )
  }
}
