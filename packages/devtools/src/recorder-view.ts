import type { SelectorLadder } from '@agrune/manifest'
import type {
  CaptureResult,
  CommitPayload,
  InboundMessage,
  OutboundMessage,
  RecorderMode,
} from './types.js'
import type { DevtoolsWsClient } from './ws-client.js'

/**
 * RecorderView — Phase 16 RECORD-01/02 authoring UI.
 *
 * Mode state machine: idle → picking → recording-action → idle.
 *
 * Keyboard shortcuts:
 *  - Ctrl+Shift+R : toggle idle ↔ picking (server decides actual mode via recorder_state)
 *  - Esc          : cancel picking / recording (same toggle message, server resets)
 *  - Enter        : when in recording-action, commit the captured selectors
 *
 * Reconnect safety (Pitfall 6): on WS disconnect the view forces mode=idle and
 * clears any pending candidates so that reconnect does not display stale state.
 *
 * Security (T-16-04): RecorderView never touches element values. It only
 * emits OutboundMessage shapes that contain selectors + flags.
 */
export class RecorderView {
  private mode: RecorderMode = 'idle'
  private candidates: CaptureResult | null = null
  private targetIdOverride: string | null = null
  private readonly handleKeyDown: (e: KeyboardEvent) => void
  private readonly unsubscribeStatus: () => void

  constructor(
    private readonly root: HTMLElement,
    private readonly ws: DevtoolsWsClient,
  ) {
    this.handleKeyDown = (e) => this.onKey(e)
    document.addEventListener('keydown', this.handleKeyDown)
    this.unsubscribeStatus = ws.onStatusChange((connected) => {
      if (!connected) this.forceIdle()
    })
    this.render()
  }

  /** Apply an inbound recorder_* message. Non-recorder messages are ignored. */
  update(msg: InboundMessage): void {
    switch (msg.type) {
      case 'recorder_state': {
        this.mode = msg.mode
        if (msg.mode !== 'recording-action') {
          this.candidates = null
          this.targetIdOverride = null
        }
        this.render()
        return
      }
      case 'recorder_captured': {
        this.candidates = msg.data
        this.targetIdOverride = msg.data.autoTargetId
        this.mode = 'recording-action'
        this.render()
        return
      }
      default:
        return
    }
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleKeyDown)
    this.unsubscribeStatus()
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private onKey(e: KeyboardEvent): void {
    // Ctrl+Shift+R toggle — case-insensitive on 'R' because some layouts emit 'r'
    if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
      e.preventDefault()
      this.send({ type: 'recorder_toggle' })
      return
    }
    if (e.key === 'Escape') {
      if (this.mode === 'idle') return
      this.send({ type: 'recorder_toggle' })
      return
    }
    if (e.key === 'Enter' && this.candidates) {
      // Do not steal Enter from input elements other than our target id input
      const active = document.activeElement
      if (active instanceof HTMLInputElement && !active.classList.contains('recorder-target-input')) {
        return
      }
      this.commit()
    }
  }

  private send(msg: OutboundMessage): void {
    this.ws.send(msg)
  }

  private forceIdle(): void {
    this.mode = 'idle'
    this.candidates = null
    this.targetIdOverride = null
    this.render()
  }

  private commit(): void {
    if (!this.candidates) return
    const targetId =
      (this.targetIdOverride && this.targetIdOverride.trim()) ||
      this.candidates.autoTargetId
    const selector = buildSelectorLadder(this.candidates)
    if (!selector) return
    // sessionId/ts are stamped server-side — the browser cannot trust its own
    // clock and sessionId is a server-owned UUID. We send a best-effort ts
    // hint so that the MCP layer can reconcile latency if desired.
    const payload: CommitPayload = {
      sessionId: '', // server fills in
      ts: Date.now(),
      url: this.candidates.url,
      targetId,
      selector,
      ...(this.candidates.sensitive ? { sensitive: true as const } : {}),
    }
    this.send({ type: 'recorder_commit', data: payload })
  }

  private render(): void {
    const modeBadge = `<span class="recorder-mode-badge recorder-mode-${this.mode}">${modeLabel(this.mode)}</span>`

    if (this.mode === 'idle') {
      this.root.innerHTML = `
        <div class="recorder-panel">
          ${modeBadge}
          <div class="recorder-status-line">Recorder idle. Press <span class="recorder-shortcut">Ctrl+Shift+R</span> to start picking.</div>
        </div>
      `
      return
    }

    if (this.mode === 'picking') {
      this.root.innerHTML = `
        <div class="recorder-panel">
          ${modeBadge}
          <div class="recorder-status-line">Picking… hover and click an element on the page. Press <span class="recorder-shortcut">Esc</span> to cancel.</div>
        </div>
      `
      return
    }

    // mode === 'recording-action'
    const c = this.candidates
    if (!c) {
      this.root.innerHTML = `
        <div class="recorder-panel">
          ${modeBadge}
          <div class="recorder-status-line">Waiting for capture data…</div>
        </div>
      `
      return
    }

    const candidates: Array<{ rank: string; label: string; value: string }> = []
    if (c.fiberPath && c.fiberPath.length > 0) {
      candidates.push({
        rank: '1',
        label: 'fiber',
        value: c.fiberPath.map(seg => `${seg.componentName || '<anon>'}:${seg.index}${seg.key != null ? `[${seg.key}]` : ''}`).join(' › '),
      })
    }
    if (c.roleSelector) {
      candidates.push({
        rank: String(candidates.length + 1),
        label: 'role',
        value: c.roleSelector.name
          ? `${c.roleSelector.role} "${c.roleSelector.name}"`
          : c.roleSelector.role,
      })
    }
    if (c.cssSelector) {
      candidates.push({
        rank: String(candidates.length + 1),
        label: 'css',
        value: c.cssSelector,
      })
    }

    const sensitiveBadge = c.sensitive
      ? `<span class="recorder-sensitive-flag">SENSITIVE</span>`
      : ''

    const targetIdValue = this.targetIdOverride ?? c.autoTargetId

    this.root.innerHTML = `
      <div class="recorder-panel">
        <div style="display:flex; gap:8px; align-items:center;">
          ${modeBadge}
          ${sensitiveBadge}
        </div>
        <div class="recorder-status-line">Captured <span class="recorder-shortcut">${escapeHtml(c.url)}</span>. Press <span class="recorder-shortcut">Enter</span> to commit or <span class="recorder-shortcut">Esc</span> to cancel.</div>
        <div class="recorder-candidates">
          ${candidates.map(cand => `
            <div class="candidate-selector">
              <span class="candidate-rank">#${cand.rank}</span>
              <span class="candidate-label">${escapeHtml(cand.label)}</span>
              <span class="candidate-value">${escapeHtml(cand.value)}</span>
            </div>
          `).join('')}
        </div>
        <div class="recorder-target-row">
          <label class="recorder-target-label" for="recorderTargetId">targetId</label>
          <input class="recorder-target-input" id="recorderTargetId" type="text" value="${escapeAttr(targetIdValue)}" />
        </div>
      </div>
    `

    const input = this.root.querySelector<HTMLInputElement>('.recorder-target-input')
    input?.addEventListener('input', () => {
      this.targetIdOverride = input.value
    })
  }
}

/**
 * Build a `SelectorLadder` from a capture result.
 *
 * Priority: fiber > role > css. At least one field MUST be present to satisfy
 * the AtLeastOne constraint; cssSelector fallback guarantees this in practice.
 *
 * Returns null if no selector could be built (should never happen — the page
 * context capture always produces at least cssSelector).
 */
export function buildSelectorLadder(capture: CaptureResult): SelectorLadder | null {
  const ladder: Partial<SelectorLadder> = {}
  if (capture.fiberPath && capture.fiberPath.length > 0) {
    ;(ladder as { fiber?: { path: typeof capture.fiberPath } }).fiber = {
      path: capture.fiberPath,
    }
  }
  if (capture.roleSelector) {
    ;(ladder as { role?: { name: string; level?: string } }).role = {
      name: capture.roleSelector.name ?? capture.roleSelector.role,
    }
  }
  if (capture.cssSelector) {
    ;(ladder as { css?: string }).css = capture.cssSelector
  }
  if (Object.keys(ladder).length === 0) return null
  return ladder as SelectorLadder
}

function modeLabel(mode: RecorderMode): string {
  switch (mode) {
    case 'idle':
      return 'IDLE'
    case 'picking':
      return 'PICKING'
    case 'recording-action':
      return 'RECORDING'
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}
