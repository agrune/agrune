import { scanAnnotations } from './dom-scanner'

function init(): void {
  const annotations = scanAnnotations(document)

  if (annotations.length === 0) {
    return
  }

  // Send session_open message to the service worker
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'session_open',
      tabId: -1, // service worker will fill in the real tab id
      url: document.location.href,
      title: document.title,
    })
  }

  // Observe DOM mutations for future snapshot updates
  const observer = new MutationObserver((_mutations) => {
    // Re-scan will be triggered by the service worker via message;
    // for now we simply note that the DOM changed.
    // Future: debounce and send updated snapshot.
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  })
}

// Run when the content script loads
init()
