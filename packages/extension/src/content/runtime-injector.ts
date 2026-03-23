/**
 * Injects the page runtime script into the main world.
 * This must run in the content script context where chrome APIs are available.
 */
export function injectRuntime(): void {
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('dist/page-runtime.js')
  script.onload = () => script.remove()
  ;(document.head || document.documentElement).appendChild(script)
}
