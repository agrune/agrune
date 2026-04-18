export type CommandEventPhase = 'start' | 'end' | 'error'

export interface CommandEvent {
  id: string
  ts: number
  sessionId: number | null
  tool: string
  phase: CommandEventPhase
  durationMs?: number
  args?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
}

export type CommandEventListener = (event: CommandEvent) => void

/**
 * In-memory pub/sub for MCP command lifecycle events.
 * Also retains the last N events so a newly connected devtools client
 * can render a backfill on subscribe.
 */
export class CommandBroker {
  private readonly listeners = new Set<CommandEventListener>()
  private readonly buffer: CommandEvent[] = []
  private counter = 0

  constructor(private readonly bufferSize = 500) {}

  nextId(): string {
    this.counter += 1
    return `cmd-${Date.now()}-${this.counter}`
  }

  emit(event: CommandEvent): void {
    this.buffer.push(event)
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, this.buffer.length - this.bufferSize)
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Never let a rogue listener crash the tool call.
      }
    }
  }

  getBuffered(): CommandEvent[] {
    return [...this.buffer]
  }

  subscribe(listener: CommandEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  clear(): void {
    this.buffer.length = 0
  }
}
