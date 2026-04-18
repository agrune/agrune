export type RecoveryEvent =
  | { kind: 'started'; cause: 'connection_lost' | 'chrome_crashed'; attempt: number }
  | { kind: 'attempt_failed'; attempt: number; error: string }
  | { kind: 'succeeded'; cause: 'connection_lost' | 'chrome_crashed'; attempts: number }
  | { kind: 'failed'; cause: 'connection_lost' | 'chrome_crashed'; attempts: number; error: string }

export interface RecoveryStrategy {
  reconnect(): Promise<void>
  relaunchAndReconnect(): Promise<void>
  canRelaunch: boolean
}

export interface RecoverySupervisorOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

type Cause = 'connection_lost' | 'chrome_crashed'

export class RecoverySupervisor {
  private readonly maxAttempts: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly listeners = new Set<(event: RecoveryEvent) => void>()
  private inflight: Promise<void> | null = null
  private lastFailure: { cause: Cause; error: Error; attempts: number } | null = null

  constructor(
    private readonly strategy: RecoveryStrategy,
    options: RecoverySupervisorOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 5
    this.baseDelayMs = options.baseDelayMs ?? 250
    this.maxDelayMs = options.maxDelayMs ?? 4000
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  onEvent(listener: (event: RecoveryEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getLastFailure(): { cause: Cause; error: Error; attempts: number } | null {
    return this.lastFailure ? { ...this.lastFailure } : null
  }

  isRecovering(): boolean {
    return this.inflight !== null
  }

  waitForRecovery(): Promise<void> {
    return this.inflight ?? Promise.resolve()
  }

  trigger(cause: Cause, reason: Error): Promise<void> {
    if (this.inflight) return this.inflight
    if (cause === 'chrome_crashed' && !this.strategy.canRelaunch) {
      const failure = new Error(
        `Chrome process crashed and relaunch is not available in attach mode: ${reason.message}`,
      )
      this.lastFailure = { cause, error: failure, attempts: 0 }
      this.emit({ kind: 'failed', cause, attempts: 0, error: failure.message })
      return Promise.reject(failure)
    }

    const task = this.runLoop(cause).finally(() => {
      this.inflight = null
    })
    this.inflight = task
    return task
  }

  private async runLoop(cause: Cause): Promise<void> {
    let attempt = 0
    let lastError: Error | null = null
    while (attempt < this.maxAttempts) {
      attempt += 1
      this.emit({ kind: 'started', cause, attempt })
      try {
        if (cause === 'chrome_crashed') {
          await this.strategy.relaunchAndReconnect()
        } else {
          await this.strategy.reconnect()
        }
        this.lastFailure = null
        this.emit({ kind: 'succeeded', cause, attempts: attempt })
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        this.emit({ kind: 'attempt_failed', attempt, error: lastError.message })
        if (attempt < this.maxAttempts) {
          const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1))
          await this.sleep(delay)
        }
      }
    }
    const finalError = lastError ?? new Error('Recovery failed for unknown reasons.')
    this.lastFailure = { cause, error: finalError, attempts: attempt }
    this.emit({ kind: 'failed', cause, attempts: attempt, error: finalError.message })
    throw finalError
  }

  private emit(event: RecoveryEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      } catch {
        // listeners must not propagate
      }
    }
  }
}
