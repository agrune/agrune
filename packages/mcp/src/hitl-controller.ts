export interface HitlState {
  paused: boolean
  pausedAt: number | null
  pendingTool: string | null
}

export type HitlStateListener = (state: HitlState) => void

export class HitlSkipError extends Error {
  code = 'HITL_SKIPPED' as const
  constructor(tool: string) {
    super(`HITL: call to ${tool} was skipped by the operator.`)
    this.name = 'HitlSkipError'
  }
}

type GateResolver = (decision: 'resume' | 'skip') => void

/**
 * Pause gate for MCP tool calls. UI sends pause/resume/skip/step commands
 * over the devtools WebSocket. When `paused` is true, incoming tool calls
 * block at `awaitGate()` until the operator resumes, steps once, or skips.
 */
export class HitlController {
  private state: HitlState = { paused: false, pausedAt: null, pendingTool: null }
  private readonly listeners = new Set<HitlStateListener>()
  private waiters: GateResolver[] = []
  private stepPending = false

  getState(): HitlState {
    return { ...this.state }
  }

  onChange(listener: HitlStateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  pause(): void {
    if (this.state.paused) return
    this.state = { paused: true, pausedAt: Date.now(), pendingTool: null }
    this.broadcast()
  }

  resume(): void {
    if (!this.state.paused) return
    this.state = { paused: false, pausedAt: null, pendingTool: null }
    this.flush('resume')
    this.broadcast()
  }

  step(): void {
    // "Step" only makes sense while paused — no-op otherwise.
    if (!this.state.paused && this.waiters.length === 0) return
    // "Step" = let the next pending (or upcoming) call through once, then re-pause.
    this.stepPending = true
    if (this.waiters.length > 0) {
      const [next, ...rest] = this.waiters
      this.waiters = rest
      this.stepPending = false // consumed
      next('resume')
    }
  }

  skip(): void {
    if (this.waiters.length === 0) return
    const [next, ...rest] = this.waiters
    this.waiters = rest
    next('skip')
    // Remain paused; pendingTool cleared, next call will pause again.
    this.state = { paused: true, pausedAt: this.state.pausedAt ?? Date.now(), pendingTool: null }
    this.broadcast()
  }

  /**
   * Gate a tool call. Resolves immediately when not paused.
   * Throws HitlSkipError if the operator chose "skip current call".
   */
  async awaitGate(tool: string): Promise<void> {
    if (this.stepPending) {
      // One-shot step: allow this call, then re-pause.
      this.stepPending = false
      this.state = { paused: true, pausedAt: Date.now(), pendingTool: null }
      this.broadcast()
      return
    }
    if (!this.state.paused) return
    this.state = { ...this.state, pendingTool: tool }
    this.broadcast()
    const decision = await new Promise<'resume' | 'skip'>((resolve) => {
      this.waiters.push(resolve)
    })
    if (decision === 'skip') {
      throw new HitlSkipError(tool)
    }
  }

  private flush(decision: 'resume' | 'skip'): void {
    const pending = this.waiters.splice(0)
    for (const w of pending) w(decision)
  }

  private broadcast(): void {
    const snapshot = this.getState()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        // Ignore bad listeners.
      }
    }
  }
}
