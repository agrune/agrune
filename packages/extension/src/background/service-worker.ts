const NATIVE_HOST_NAME = 'com.webcli.dom'

let nativePort: chrome.runtime.Port | null = null

function ensureNativeConnection(): chrome.runtime.Port {
  if (nativePort) return nativePort
  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME)

  nativePort.onMessage.addListener((msg) => {
    // Native Host → Extension: forward command_request and config_update to the right tab
    if ((msg.type === 'command_request' || msg.type === 'config_update') && msg.tabId) {
      chrome.tabs.sendMessage(msg.tabId, msg)
    }
  })

  nativePort.onDisconnect.addListener(() => {
    nativePort = null
    console.log('Native host disconnected:', chrome.runtime.lastError?.message)
  })

  return nativePort
}

// Content script → Service worker → Native Host
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[webcli-sw] message received:', msg.type, 'from tab:', sender.tab?.id)
  if (!sender.tab?.id) return

  const tabId = sender.tab.id

  switch (msg.type) {
    case 'session_open':
      ensureNativeConnection().postMessage({
        type: 'session_open', tabId, url: msg.url, title: msg.title
      })
      break
    case 'snapshot':
      ensureNativeConnection().postMessage({
        type: 'snapshot_update', tabId, snapshot: msg.snapshot
      })
      break
    case 'command_result':
      ensureNativeConnection().postMessage({
        type: 'command_result', tabId, commandId: msg.commandId, result: msg.result
      })
      break
  }
  return false
})

// Tab closed → notify Native Host
chrome.tabs.onRemoved.addListener((tabId) => {
  if (nativePort) {
    nativePort.postMessage({ type: 'session_close', tabId })
  }
})

// Tab URL changed → update session
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && nativePort) {
    nativePort.postMessage({
      type: 'session_open', tabId, url: changeInfo.url, title: changeInfo.title ?? ''
    })
  }
})
