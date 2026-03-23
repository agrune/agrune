import { scanAnnotations, scanGroups } from './dom-scanner'
import { buildManifest } from './manifest-builder'
import { injectRuntime } from './runtime-injector'
import { setupBridge, sendToBridge } from './bridge'

const SNAPSHOT_INTERVAL_MS = 800
const MUTATION_DEBOUNCE_MS = 500

function hasAnnotations(): boolean {
  return document.querySelector('[data-webcli-action]') !== null
}

function init() {
  if (!hasAnnotations()) return

  // 1. Notify service worker about this tab
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'session_open',
      url: location.href,
      title: document.title,
    })
  }

  // 2. Inject runtime into main world
  injectRuntime()

  // 3. Set up bridge to communicate with page runtime
  setupBridge((type, data) => {
    if (type === 'bridge_loaded') {
      // Runtime bridge is loaded, send manifest to initialize
      const targets = scanAnnotations(document)
      const groups = scanGroups(document)
      const manifest = buildManifest(targets, groups)
      sendToBridge('init_runtime', { manifest, options: {} })
    }

    if (type === 'runtime_ready') {
      // Runtime initialized, start snapshot loop
      startSnapshotLoop()
    }

    if (type === 'snapshot') {
      // Forward snapshot to service worker
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'snapshot', snapshot: data })
      }
    }

    if (type === 'command_result') {
      // Forward command result to service worker
      const { commandId, result } = data as { commandId: string; result: unknown }
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'command_result', commandId, result })
      }
    }
  })

  // 4. Listen for commands from service worker
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'command_request') {
        sendToBridge('command', {
          kind: msg.command.kind,
          commandId: msg.commandId,
          ...msg.command,
        })
      }
      if (msg.type === 'config_update') {
        sendToBridge('config_update', msg.config)
      }
    })
  }

  // 5. MutationObserver for dynamic DOM changes (debounced)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const targets = scanAnnotations(document)
      const groups = scanGroups(document)
      const manifest = buildManifest(targets, groups)
      sendToBridge('init_runtime', { manifest, options: {} })
    }, MUTATION_DEBOUNCE_MS)
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function startSnapshotLoop() {
  setInterval(() => {
    sendToBridge('request_snapshot', {})
  }, SNAPSHOT_INTERVAL_MS)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
