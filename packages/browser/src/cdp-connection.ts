import WebSocket from 'ws'

export type CdpEventCallback = (
  params: Record<string, unknown>,
  sessionId?: string,
) => void

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void
  reject: (error: Error) => void
}

export class CdpConnection {
  private socket: WebSocket | null = null
  private nextId = 0
  private pending = new Map<number, PendingRequest>()
  private listeners = new Map<string, Set<CdpEventCallback>>()

  async connect(wsEndpoint: string): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsEndpoint)
      let settled = false

      const cleanup = () => {
        socket.off('open', handleOpen)
        socket.off('error', handleError)
        socket.off('close', handleClose)
      }

      const handleOpen = () => {
        settled = true
        cleanup()
        this.socket = socket
        socket.on('message', (data: WebSocket.RawData) =>
          this.handleMessage(data.toString()),
        )
        socket.on('close', () => this.handleDisconnect())
        socket.on('error', () => this.handleDisconnect())
        resolve()
      }

      const handleError = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      const handleClose = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('CDP connection closed before it was established.'))
      }

      socket.once('open', handleOpen)
      socket.once('error', handleError)
      socket.once('close', handleClose)
    })
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return

    const socket = this.socket
    this.socket = null
    await new Promise<void>((resolve) => {
      if (
        socket.readyState === WebSocket.CLOSING ||
        socket.readyState === WebSocket.CLOSED
      ) {
        resolve()
        return
      }
      socket.once('close', () => resolve())
      socket.close()
    })
    this.handleDisconnect()
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  async send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('CDP connection is not open.')
    }

    const id = ++this.nextId
    const payload = sessionId
      ? { id, method, params, sessionId }
      : { id, method, params }

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket?.send(JSON.stringify(payload), (error?: Error) => {
        if (!error) return
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  on(event: string, callback: CdpEventCallback): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.add(callback)
      return
    }
    this.listeners.set(event, new Set([callback]))
  }

  off(event: string, callback: CdpEventCallback): void {
    const listeners = this.listeners.get(event)
    if (!listeners) return
    listeners.delete(callback)
    if (listeners.size === 0) {
      this.listeners.delete(event)
    }
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as {
      id?: number
      method?: string
      params?: Record<string, unknown>
      result?: Record<string, unknown>
      error?: { message?: string }
      sessionId?: string
    }

    if (typeof message.id === 'number') {
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)

      if (message.error) {
        entry.reject(new Error(message.error.message ?? `CDP request failed: ${message.id}`))
        return
      }

      entry.resolve(message.result ?? {})
      return
    }

    if (!message.method) return

    const listeners = this.listeners.get(message.method)
    if (!listeners) return
    for (const listener of listeners) {
      listener(message.params ?? {}, message.sessionId)
    }
  }

  private handleDisconnect(): void {
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const entry of pending) {
      entry.reject(new Error('CDP connection disconnected.'))
    }
  }
}
