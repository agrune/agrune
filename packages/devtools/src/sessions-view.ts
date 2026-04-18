import type { Session } from '@agrune/core'
import type { DevtoolsWsClient } from './ws-client.js'

export class SessionsView {
  private sessions: Session[] = []
  private readonly listEl: HTMLElement
  private readonly emptyEl: HTMLElement

  constructor(root: HTMLElement, private readonly ws: DevtoolsWsClient) {
    root.innerHTML = `
      <div class="sessions-empty" hidden>
        <div class="empty-heading">No sessions</div>
        <div class="empty-body">Launch agrune in a tab, then use agrune_focus to activate one.</div>
      </div>
      <div class="sessions-list"></div>
    `
    this.listEl = root.querySelector('.sessions-list') as HTMLElement
    this.emptyEl = root.querySelector('.sessions-empty') as HTMLElement
  }

  update(sessions: Session[]): void {
    this.sessions = sessions
    this.render()
  }

  private render(): void {
    if (this.sessions.length === 0) {
      this.emptyEl.hidden = false
      this.listEl.innerHTML = ''
      return
    }
    this.emptyEl.hidden = true

    this.listEl.innerHTML = this.sessions.map(s => {
      const active = s.active === true
      const label = s.title || s.url
      return `
        <div class="sessions-row${active ? ' sessions-row-active' : ''}" data-tab-id="${s.tabId}">
          <span class="sessions-dot${active ? ' active' : ''}">●</span>
          <span class="sessions-label">${escapeHtml(label)}</span>
          <span class="sessions-tabid">(tab ${s.tabId})</span>
          ${active ? '<span class="sessions-badge">ACTIVE</span>' : `<button class="sessions-focus-btn" data-focus="${s.tabId}" type="button">Focus session</button>`}
        </div>
      `
    }).join('')

    this.listEl.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = Number(btn.dataset.focus)
        if (!Number.isFinite(tabId)) return
        this.ws.send({ type: 'focus_session', sessionId: tabId })
      })
    })
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
