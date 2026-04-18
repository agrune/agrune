import type { HitlState } from './types.js'
import type { DevtoolsWsClient } from './ws-client.js'

export class HitlToolbar {
  private state: HitlState = { paused: false, pausedAt: null, pendingTool: null }
  private readonly root: HTMLElement

  constructor(root: HTMLElement, private readonly ws: DevtoolsWsClient) {
    this.root = root
    this.render()
  }

  update(state: HitlState): void {
    this.state = state
    this.render()
  }

  private render(): void {
    const { paused, pendingTool } = this.state
    if (!paused) {
      this.root.innerHTML = `<button class="hitl-pause-btn" type="button">Pause next tool</button>`
      const btn = this.root.querySelector('.hitl-pause-btn') as HTMLButtonElement | null
      btn?.addEventListener('click', () => this.ws.send({ type: 'hitl', action: 'pause' }))
      return
    }
    const pendingLabel = pendingTool ? ` — ${escapeHtml(pendingTool)}` : ''
    this.root.innerHTML = `
      <span class="hitl-badge">PAUSED${pendingLabel}</span>
      <button class="hitl-btn hitl-resume" type="button">Resume</button>
      <button class="hitl-btn hitl-step" type="button">Step</button>
      ${pendingTool ? '<button class="hitl-btn hitl-skip" type="button">Skip current call</button>' : ''}
    `
    this.root.querySelector('.hitl-resume')?.addEventListener('click', () => {
      this.ws.send({ type: 'hitl', action: 'resume' })
    })
    this.root.querySelector('.hitl-step')?.addEventListener('click', () => {
      this.ws.send({ type: 'hitl', action: 'step' })
    })
    this.root.querySelector('.hitl-skip')?.addEventListener('click', () => {
      if (!window.confirm('Skip current call?\nThe tool will return a \'skipped\' error to the caller.')) return
      this.ws.send({ type: 'hitl', action: 'skip' })
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
