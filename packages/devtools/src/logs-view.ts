import type { CommandEvent } from './types.js'

const MAX_BUFFER = 500

export interface LogFilters {
  tool: string
  sessionId: string // '' = any, else numeric string
  status: 'all' | 'success' | 'fail'
  search: string
}

export class LogsView {
  private buffer: CommandEvent[] = []
  private pendingById = new Map<string, CommandEvent>()
  private filters: LogFilters = { tool: '', sessionId: '', status: 'all', search: '' }
  private readonly emptyState: HTMLElement
  private readonly list: HTMLElement
  private readonly toolSelect: HTMLSelectElement
  private readonly sessionSelect: HTMLSelectElement
  private readonly statusSelect: HTMLSelectElement
  private readonly searchInput: HTMLInputElement
  private expanded = new Set<string>()

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="logs-filters">
        <select class="logs-filter-tool"><option value="">All tools</option></select>
        <select class="logs-filter-session"><option value="">All sessions</option></select>
        <select class="logs-filter-status">
          <option value="all">All status</option>
          <option value="success">Success only</option>
          <option value="fail">Failed only</option>
        </select>
        <input class="logs-search" type="text" placeholder="Search tool or error..." />
      </div>
      <div class="logs-empty" hidden>
        <div class="empty-heading">No commands yet</div>
        <div class="empty-body">Call an MCP tool to see events stream here.</div>
      </div>
      <div class="logs-list"></div>
    `
    this.emptyState = root.querySelector('.logs-empty') as HTMLElement
    this.list = root.querySelector('.logs-list') as HTMLElement
    this.toolSelect = root.querySelector('.logs-filter-tool') as HTMLSelectElement
    this.sessionSelect = root.querySelector('.logs-filter-session') as HTMLSelectElement
    this.statusSelect = root.querySelector('.logs-filter-status') as HTMLSelectElement
    this.searchInput = root.querySelector('.logs-search') as HTMLInputElement

    this.toolSelect.addEventListener('change', () => {
      this.filters.tool = this.toolSelect.value
      this.render()
    })
    this.sessionSelect.addEventListener('change', () => {
      this.filters.sessionId = this.sessionSelect.value
      this.render()
    })
    this.statusSelect.addEventListener('change', () => {
      this.filters.status = this.statusSelect.value as LogFilters['status']
      this.render()
    })
    this.searchInput.addEventListener('input', () => {
      this.filters.search = this.searchInput.value.toLowerCase()
      this.render()
    })
  }

  ingestBackfill(events: CommandEvent[]): void {
    for (const e of events) this.pushInternal(e)
    this.render()
  }

  ingest(event: CommandEvent): void {
    this.pushInternal(event)
    this.render()
  }

  private pushInternal(event: CommandEvent): void {
    // Merge start → end/error by id so each tool call is one row.
    if (event.phase === 'start') {
      this.pendingById.set(event.id, event)
      this.buffer.push(event)
    } else {
      const existing = this.pendingById.get(event.id)
      if (existing) {
        Object.assign(existing, event)
        this.pendingById.delete(event.id)
      } else {
        this.buffer.push(event)
      }
    }
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER)
    }
  }

  private render(): void {
    // Refresh filter option sets
    const toolNames = Array.from(new Set(this.buffer.map(e => e.tool))).sort()
    this.refillSelect(this.toolSelect, toolNames.map(t => ({ value: t, label: t })), this.filters.tool)
    const sessionIds = Array.from(new Set(this.buffer.map(e => e.sessionId).filter((s): s is number => s != null))).sort((a, b) => a - b)
    this.refillSelect(
      this.sessionSelect,
      sessionIds.map(s => ({ value: String(s), label: `session ${s}` })),
      this.filters.sessionId,
    )

    const filtered = this.buffer.filter((e) => this.matches(e))

    if (filtered.length === 0) {
      this.emptyState.hidden = false
      this.list.innerHTML = ''
      return
    }
    this.emptyState.hidden = true

    // Most recent first
    const rows = [...filtered].reverse()
    this.list.innerHTML = rows.map(e => this.renderRow(e)).join('')

    // Wire expand toggles on fail rows
    this.list.querySelectorAll<HTMLElement>('[data-toggle-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.toggleId ?? ''
        if (this.expanded.has(id)) this.expanded.delete(id)
        else this.expanded.add(id)
        this.render()
      })
    })
  }

  private matches(e: CommandEvent): boolean {
    if (this.filters.tool && e.tool !== this.filters.tool) return false
    if (this.filters.sessionId) {
      if (String(e.sessionId ?? '') !== this.filters.sessionId) return false
    }
    if (this.filters.status === 'success' && e.phase !== 'end') return false
    if (this.filters.status === 'fail' && e.phase !== 'error') return false
    if (this.filters.search) {
      const hay = `${e.tool} ${e.error?.code ?? ''} ${e.error?.message ?? ''}`.toLowerCase()
      if (!hay.includes(this.filters.search)) return false
    }
    return true
  }

  private renderRow(e: CommandEvent): string {
    const ts = new Date(e.ts).toLocaleTimeString([], { hour12: false })
    const sess = e.sessionId != null ? `session#${e.sessionId}` : 'no-session'
    const dur = e.durationMs != null ? `${e.durationMs}ms` : '—'
    const statusLabel = e.phase === 'end' ? 'OK' : e.phase === 'error' ? 'FAIL' : '...'
    const statusClass = e.phase === 'end' ? 'ok' : e.phase === 'error' ? 'fail' : 'running'
    const head = `
      <div class="logs-row logs-row-${statusClass}" data-toggle-id="${escapeAttr(e.id)}">
        <span class="logs-ts">[${ts}]</span>
        <span class="logs-sess">${escapeHtml(sess)}</span>
        <span class="logs-tool">${escapeHtml(e.tool)}</span>
        <span class="logs-dur">${dur}</span>
        <span class="logs-status logs-status-${statusClass}">${statusLabel}${e.phase === 'error' ? ' ⚠' : ''}</span>
      </div>
    `
    if (e.phase !== 'error' || !this.expanded.has(e.id)) return head
    const args = e.args ? JSON.stringify(e.args).slice(0, 240) : '—'
    return head + `
      <div class="logs-failure-detail">
        <div class="logs-failure-row"><span class="logs-failure-label">error.code</span><span class="logs-failure-value logs-failure-code">${escapeHtml(e.error?.code ?? 'UNKNOWN')}</span></div>
        <div class="logs-failure-row"><span class="logs-failure-label">error.message</span><span class="logs-failure-value">${escapeHtml(e.error?.message ?? '')}</span></div>
        <div class="logs-failure-row"><span class="logs-failure-label">args</span><span class="logs-failure-value logs-failure-args">${escapeHtml(args)}</span></div>
        <div class="logs-failure-row"><span class="logs-failure-label">durationMs</span><span class="logs-failure-value">${e.durationMs ?? '—'}</span></div>
      </div>
    `
  }

  private refillSelect(
    select: HTMLSelectElement,
    options: Array<{ value: string; label: string }>,
    currentValue: string,
  ): void {
    const firstLabel = select.options[0]?.text ?? 'All'
    select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` + options
      .map(o => `<option value="${escapeAttr(o.value)}"${o.value === currentValue ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
      .join('')
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
