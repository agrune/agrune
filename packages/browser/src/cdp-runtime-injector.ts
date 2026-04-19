import { existsSync, readFileSync } from 'node:fs'
import { createRequire as createNodeRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgruneManifest } from '@agrune/core'
import type { CdpConnection } from './cdp-connection.js'

export const QUICK_MODE_RUNTIME_KEY = '__agrune_quick_mode__'

export interface PrepareSessionOptions {
  preloadManifest?: AgruneManifest
}

/**
 * safeJsonEmbed — U+2028/U+2029를 JavaScript LineTerminator로 해석하는
 * 일부 파서에 대한 방어. JSON string literal을 JS 소스에 embed할 때 사용.
 *
 * Security note: addScriptToEvaluateOnNewDocument는 V8에 직접 평가되므로
 * HTML </script> 이탈 위협은 없으나, JSON.parse() wrapper 패턴과 조합해
 * statement boundary 이탈을 원천 차단한다 (T-12-04, T-12-05).
 */
export function safeJsonEmbed(json: string): string {
  return json
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * buildPreloadManifestSource — manifest를 JSON.parse() wrapper로 embed한 JS 스니펫을 생성.
 *
 * 이중 JSON.stringify를 사용해 임의 JS statement 이탈을 방지:
 *  - 내부 JSON.stringify(manifest): manifest 객체 → JSON string
 *  - 외부 JSON.stringify(...): JSON string → JS string literal (역슬래시 이스케이프)
 * 최종 eval context는 JSON.parse("...") → valid JSON만 허용
 */
function buildPreloadManifestSource(manifest: AgruneManifest): string {
  const jsonLiteral = JSON.stringify(JSON.stringify(manifest))
  return `;(function(){try{window.__agrune_preload_manifest__ = JSON.parse(${safeJsonEmbed(jsonLiteral)});}catch(e){}})();`
}

/**
 * getInjectedSourceWithPreload — preloadManifest가 있을 때 캐시를 우회해
 * 세션별로 독립된 source를 생성한다 (Pitfall 1: cache isolation).
 */
function getInjectedSourceWithPreload(manifest: AgruneManifest): string {
  const runtimeSource = readFileSync(resolvePageRuntimePath(), 'utf8')
  const preloadSource = buildPreloadManifestSource(manifest)
  // preload snippet을 runtime source 앞에 배치 → bootstrap이 resolveManifest() 시
  // window.__agrune_preload_manifest__를 읽을 수 있음
  return `${runtimeSource}\n${preloadSource}\n${buildBootstrapSource()}`
}

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

  if (
    !runtimeApi ||
    typeof runtimeApi.installPageAgentRuntime !== 'function' ||
    typeof runtimeApi.buildEmptyManifest !== 'function'
  ) {
    throw new Error('Agrune runtime exports are not available in CDP quick mode.');
  }

  const post = (type, data) => {
    const binding = window[bindingName];
    if (typeof binding === 'function') {
      binding(JSON.stringify({ type, data }));
    }
  };

  const getRuntime = () => window.agruneDom ?? null;

  const isRuntimeBusy = () => {
    const runtime = getRuntime();
    if (!runtime) return false;
    if (typeof runtime.isBusy === 'function') return runtime.isBusy();
    if (typeof runtime.isActive === 'function') return runtime.isActive();
    return false;
  };

  let installTimer = null;
  let snapshotTimer = null;
  let pendingInstall = false;
  let currentConfig = {};
  let reloadTimer = null;

  const dispatchSnapshot = () => {
    if (window.agruneDom && typeof window.agruneDom.getSnapshot === 'function') {
      post('snapshot_update', window.agruneDom.getSnapshot());
    }
  };

  const resolveManifest = () => {
    // Priority: owned-app injected > CDP preload > legacy inline scan > empty (idle)
    if (window.__agrune_manifest__) return { manifest: window.__agrune_manifest__, hasManifest: true, source: 'window' };
    if (window.__agrune_preload_manifest__) return { manifest: window.__agrune_preload_manifest__, hasManifest: true, source: 'preload' };
    // Legacy inline-scan path — maintained until Phase 17 (REMOVE-01).
    if (typeof runtimeApi.scanAnnotations === 'function' &&
        typeof runtimeApi.scanGroups === 'function' &&
        typeof runtimeApi.buildManifest === 'function') {
      try {
        const legacyManifest = runtimeApi.buildManifest(
          runtimeApi.scanAnnotations(document),
          runtimeApi.scanGroups(document),
        );
        if (legacyManifest && Array.isArray(legacyManifest.groups) && legacyManifest.groups.some(g => g.targets && g.targets.length > 0)) {
          return { manifest: legacyManifest, hasManifest: true, source: 'inline' };
        }
      } catch (e) { /* fall through to idle */ }
    }
    return { manifest: runtimeApi.buildEmptyManifest(), hasManifest: false, source: 'idle' };
  };

  const installRuntime = () => {
    const resolved = resolveManifest();
    runtimeApi.installPageAgentRuntime(resolved.manifest, {
      cdpPostMessage: (type, data) => post(type, data),
    });

    if (window.agruneDom && typeof window.agruneDom.applyConfig === 'function') {
      window.agruneDom.applyConfig(currentConfig);
    }

    post('runtime_ready', { hasManifest: resolved.hasManifest, source: resolved.source });

    // Expose runtime state for test visibility (Playwright page.evaluate).
    // tamper-proof: writable:false. configurable:true allows reload to redefine.
    try {
      Object.defineProperty(window, '__agrune_runtime_state__', {
        value: { hasManifest: resolved.hasManifest, source: resolved.source },
        writable: false,
        configurable: true,
        enumerable: true,
      });
    } catch (e) { /* defensive: don't crash bootstrap on sealed globals */ }

    if (resolved.hasManifest) dispatchSnapshot();
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

  // General snapshot observer — fires on ANY DOM change. Previously this also
  // triggered installer retries (annotation-specific). Post-Phase-11 the
  // runtime boots once on DOMContentLoaded; manifest changes arrive via
  // window.__agrune_manifest__ reassignment (Phase 12+) and trigger
  // reloadRuntime() explicitly.
  const snapshotObserver = new MutationObserver(() => {
    if (getRuntime()) scheduleSnapshot();
  });
  snapshotObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  setInterval(() => {
    if (getRuntime()) dispatchSnapshot();
  }, snapshotIntervalMs);

  const wrapHistoryMethod = (name) => {
    const original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function(...args) {
      const result = original.apply(this, args);
      scheduleSnapshot();
      return result;
    };
  };

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');

  window.addEventListener('popstate', scheduleSnapshot);
  window.addEventListener('hashchange', scheduleSnapshot);

  window[apiKey] = {
    handleCommand: async (kind, input) => {
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
      return window.agruneDom ? window.agruneDom.getSnapshot() : null;
    },
    applyConfig: (config) => {
      currentConfig = { ...currentConfig, ...(config ?? {}) };
      if (window.agruneDom && typeof window.agruneDom.applyConfig === 'function') {
        window.agruneDom.applyConfig(currentConfig);
      }
    },
    setAgentActivity: (active) => {
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
    // Expose reload hook for Phase 12 manifest injection.
    // Calling reloadRuntime() after setting window.__agrune_manifest__ will
    // re-resolve the manifest and reinstall the runtime.
    // Debounce 50ms: rapid-fire 호출 시 installRuntime 중복 실행 방지 (T-12-06).
    reloadRuntime: () => {
      if (reloadTimer !== null) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        installRuntime();
      }, 50);
    },
    getManifestSource: () => {
      return resolveManifest().source;
    },
  };

  // Bootstrap — always, regardless of annotation presence (RESOLVE-04)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installRuntime, { once: true });
  } else {
    installRuntime();
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

  async prepareSession(sessionId: string, options?: PrepareSessionOptions): Promise<void> {
    // preloadManifest가 있으면 캐시 우회 — 세션별로 다른 manifest가 섞이면 안 됨 (Pitfall 1)
    const source = options?.preloadManifest
      ? getInjectedSourceWithPreload(options.preloadManifest)
      : getInjectedSource()

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
