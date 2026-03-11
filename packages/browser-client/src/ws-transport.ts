import type { ServerWsMessage, SyncPayload } from './types'

type ConnectionSnapshot = {
  sessionId: string | null
  sessionToken: string | null
}

type CreateWsTransportOptions = {
  windowRef: Window & typeof globalThis
  companionBaseUrl: string
  getConnection: () => ConnectionSnapshot
  onOpen: () => void
  onMessage: (message: ServerWsMessage) => void | Promise<void>
  onAuthFailure: (reason: string | null) => void
  onTransportClose: (reason: string | null, enabled: boolean) => void
}

export function toCompanionWsUrl(
  baseUrl: string,
  sessionId: string,
  sessionToken: string | null,
): string {
  const url = new URL('/page/ws', baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('sessionId', sessionId)
  if (sessionToken) {
    url.searchParams.set('token', sessionToken)
  }
  return url.toString()
}

export function createWsTransport({
  windowRef,
  companionBaseUrl,
  getConnection,
  onOpen,
  onMessage,
  onAuthFailure,
  onTransportClose,
}: CreateWsTransportOptions) {
  let socket: WebSocket | null = null
  let socketConnecting = false
  let socketOpenedOnce = false
  const supportsWebSocket = typeof windowRef.WebSocket === 'function'
  let enabled = supportsWebSocket
  const WebSocketCtor = windowRef.WebSocket

  return {
    isEnabled() {
      return enabled
    },

    close() {
      if (!socket) return
      const current = socket
      socket = null
      socketConnecting = false
      current.onopen = null
      current.onmessage = null
      current.onerror = null
      current.onclose = null
      try {
        current.close()
      } catch {
        // noop
      }
    },

    connect() {
      const connection = getConnection()
      if (!enabled || !connection.sessionId || socket || socketConnecting) {
        return
      }

      socketConnecting = true
      let nextSocket: WebSocket
      try {
        nextSocket = new WebSocketCtor(
          toCompanionWsUrl(companionBaseUrl, connection.sessionId, connection.sessionToken),
        )
      } catch (error) {
        socketConnecting = false
        if (!socketOpenedOnce) {
          enabled = false
        }
        throw error
      }

      nextSocket.onopen = () => {
        socketConnecting = false
        socketOpenedOnce = true
        socket = nextSocket
        onOpen()
      }

      nextSocket.onmessage = event => {
        void (async () => {
          const raw =
            typeof event.data === 'string'
              ? event.data
              : event.data instanceof ArrayBuffer
                ? new TextDecoder().decode(event.data)
                : ''
          if (!raw) return

          let parsed: unknown
          try {
            parsed = JSON.parse(raw)
          } catch {
            return
          }

          await onMessage(parsed as ServerWsMessage)
        })()
      }

      nextSocket.onerror = () => {
        // onclose에서 상태 전환 처리
      }

      nextSocket.onclose = event => {
        if (socket === nextSocket) {
          socket = null
        }
        socketConnecting = false

        const isAuthFailure = event.code === 1008
        if (!socketOpenedOnce && !isAuthFailure) {
          enabled = false
        }

        if (isAuthFailure) {
          onAuthFailure(event.reason || null)
          return
        }

        onTransportClose(event.reason || null, enabled)
      }
    },

    sendSync(payload: SyncPayload): boolean {
      if (!socket || socket.readyState !== WebSocketCtor.OPEN) {
        return false
      }

      try {
        socket.send(
          JSON.stringify({
            type: 'sync',
            ...payload,
          }),
        )
        return true
      } catch {
        return false
      }
    },
  }
}
