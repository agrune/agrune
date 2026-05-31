export type DaemonEventPhase = 'start' | 'end' | 'error'

export interface DaemonEvent {
  id: string
  ts: number
  sessionId: number | null
  tool: string
  method: string
  path: string
  command: string
  phase: DaemonEventPhase
  durationMs?: number
  tabId?: number | null
  args?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
}

export type DaemonEventListener = (event: DaemonEvent) => void

export class DaemonEventBroker {
  private readonly listeners = new Set<DaemonEventListener>()
  private readonly buffer: DaemonEvent[] = []
  private counter = 0

  constructor(private readonly bufferSize = 500) {}

  nextId(): string {
    this.counter += 1
    return `cmd-${Date.now()}-${this.counter}`
  }

  emit(event: DaemonEvent): void {
    this.buffer.push(event)
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, this.buffer.length - this.bufferSize)
    }

    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Never let one event consumer break the daemon command path.
      }
    }
  }

  getBuffered(): DaemonEvent[] {
    return [...this.buffer]
  }

  subscribe(listener: DaemonEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
