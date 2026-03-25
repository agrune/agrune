let currentOverlay: HTMLDivElement | null = null
let fadeTimer: ReturnType<typeof setTimeout> | null = null

const FADE_MS = 3000
const Z_INDEX = 2147483647

export function showHighlight(opts: { selector: string; targetId: string; name?: string; reason?: string }): void {
  clearHighlight()

  const el = document.querySelector(opts.selector)
  if (!el) return

  const rect = el.getBoundingClientRect()
  const overlay = document.createElement('div')
  overlay.setAttribute('data-agrune-highlight', opts.targetId)
  Object.assign(overlay.style, {
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    border: '2px solid #cba6f7',
    backgroundColor: 'rgba(203, 166, 247, 0.15)',
    borderRadius: '4px',
    zIndex: String(Z_INDEX),
    pointerEvents: 'none',
    transition: 'opacity 0.3s ease-out',
  })

  // Label above the element
  if (opts.name) {
    const label = document.createElement('div')
    label.textContent = opts.reason ? `${opts.name} · ${opts.reason}` : opts.name
    Object.assign(label.style, {
      position: 'fixed',
      top: `${Math.max(0, rect.top - 20)}px`,
      left: `${rect.left}px`,
      background: '#cba6f7',
      color: '#1e1e2e',
      fontSize: '10px',
      fontFamily: 'system-ui, sans-serif',
      padding: '1px 6px',
      borderRadius: '2px',
      zIndex: String(Z_INDEX),
      pointerEvents: 'none',
      transition: 'opacity 0.3s ease-out',
    })
    overlay.appendChild(label)
  }

  document.body.appendChild(overlay)
  currentOverlay = overlay

  fadeTimer = setTimeout(() => {
    if (currentOverlay === overlay) {
      overlay.style.opacity = '0'
      setTimeout(() => clearHighlight(), 300)
    }
  }, FADE_MS)
}

export function clearHighlight(): void {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  if (currentOverlay) {
    currentOverlay.remove()
    currentOverlay = null
  }
}
