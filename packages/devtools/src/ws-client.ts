import type { InboundMessage, OutboundMessage } from './types.js'

export type MessageListener = (msg: InboundMessage) => void
export type StatusListener = (connected: boolean) => void

export class DevtoolsWsClient {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly messageListeners = new Set<MessageListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private pendingSubscribe: number | null = null

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${location.host}/devtools/ws`
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = socket

    socket.addEventListener('open', () => {
      this.emitStatus(true)
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      if (this.pendingSubscribe != null) {
        this.send({ type: 'subscribe', tabId: this.pendingSubscribe })
      }
    })

    socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as InboundMessage
        for (const listener of this.messageListeners) {
          try { listener(parsed) } catch { /* ignore listener errors */ }
        }
      } catch {
        // malformed — drop
      }
    })

    socket.addEventListener('close', () => {
      this.emitStatus(false)
      this.ws = null
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      // close fires next — handle there
    })
  }

  send(msg: OutboundMessage): void {
    if (msg.type === 'subscribe') {
      this.pendingSubscribe = msg.tabId
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener)
    return () => { this.messageListeners.delete(listener) }
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => { this.statusListeners.delete(listener) }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 2000)
  }

  private emitStatus(connected: boolean): void {
    for (const l of this.statusListeners) {
      try { l(connected) } catch { /* ignore */ }
    }
  }
}
