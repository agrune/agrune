/**
 * Page runtime — runs in the page's main world (no chrome APIs available).
 * Communicates with the content script via the postMessage bridge.
 */

const BRIDGE_MESSAGE_KEY = '__webcli_dom_bridge__'

function sendToContentScript(type: string, data: unknown): void {
  window.postMessage({ source: BRIDGE_MESSAGE_KEY, payload: { type, data } }, '*')
}

// Listen for commands from the content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (!event.data || event.data.source !== BRIDGE_MESSAGE_KEY) return

  const { type, data } = event.data.payload

  if (type === 'command' && (window as any).webcliDom) {
    const { kind, commandId, ...args } = data as Record<string, unknown>
    const runtime = (window as any).webcliDom
    const fn = runtime[kind as string]
    if (typeof fn === 'function') {
      fn.call(runtime, args).then((result: unknown) => {
        sendToContentScript('command_result', { commandId, result })
      })
    }
  }

  if (type === 'request_snapshot' && (window as any).webcliDom) {
    const snapshot = (window as any).webcliDom.getSnapshot()
    sendToContentScript('snapshot', snapshot)
  }

  if (type === 'config_update' && (window as any).webcliDom) {
    ;(window as any).webcliDom.applyConfig(data)
  }
})

// Signal that the runtime bridge is ready
sendToContentScript('runtime_ready', {})
