// Shared wire types used by both the one-shot client and the daemon.

/** Public view of a browser tab (A.2.3 responses). */
export interface PublicTab {
  tabId: number
  index: number
  url: string
  title: string
  active: boolean
}

/** GET /health response (A.1.8). */
export interface DaemonHealth {
  ok: true
  name: 'agrune-daemon'
  browser: 'playwright'
  tabs: number
}

/** In-memory daemon event (§7.5). */
export interface DaemonEvent {
  id: string
  ts: number
  method: string
  path: string
  phase: 'start' | 'end' | 'error'
  durationMs?: number
  tabId?: number
  args?: Record<string, unknown>
  error?: { code: string; message: string }
}
