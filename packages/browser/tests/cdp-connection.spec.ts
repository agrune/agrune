import { describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket as WsServerSocket } from 'ws'
import { CdpConnection } from '../src/cdp-connection.js'

async function withServer<T>(
  handle: (url: string, server: WebSocketServer, nextClient: () => Promise<WsServerSocket>) => Promise<T>,
): Promise<T> {
  const server = new WebSocketServer({ port: 0 })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no address')
  const url = `ws://127.0.0.1:${address.port}/devtools/browser/mock`

  const pendingConnections: WsServerSocket[] = []
  const waiters: Array<(socket: WsServerSocket) => void> = []
  server.on('connection', (socket) => {
    const waiter = waiters.shift()
    if (waiter) waiter(socket)
    else pendingConnections.push(socket)
  })

  const nextClient = () =>
    new Promise<WsServerSocket>((resolve) => {
      const existing = pendingConnections.shift()
      if (existing) resolve(existing)
      else waiters.push(resolve)
    })

  try {
    return await handle(url, server, nextClient)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

describe('CdpConnection disconnect hook', () => {
  it('fires onDisconnect when the server closes the socket', async () => {
    await withServer(async (url, _server, nextClient) => {
      const conn = new CdpConnection()
      const clientPromise = nextClient()
      await conn.connect(url)
      const socket = await clientPromise

      const reasons: string[] = []
      conn.onDisconnect((reason) => {
        reasons.push(reason.message)
      })

      socket.close()
      await new Promise((r) => setTimeout(r, 50))

      expect(reasons.length).toBeGreaterThan(0)
      expect(conn.isConnected()).toBe(false)
    })
  })

  it('does not fire onDisconnect on explicit disconnect()', async () => {
    await withServer(async (url, _server, nextClient) => {
      const conn = new CdpConnection()
      const clientPromise = nextClient()
      await conn.connect(url)
      await clientPromise

      const reasons: string[] = []
      conn.onDisconnect((reason) => {
        reasons.push(reason.message)
      })

      await conn.disconnect()
      await new Promise((r) => setTimeout(r, 20))

      expect(reasons).toEqual([])
    })
  })

  it('rejects in-flight sends when the socket drops', async () => {
    await withServer(async (url, _server, nextClient) => {
      const conn = new CdpConnection()
      const clientPromise = nextClient()
      await conn.connect(url)
      const socket = await clientPromise

      const pending = conn.send('Target.getTargets').catch((error: Error) => error.message)
      socket.terminate()

      const message = await pending
      expect(String(message)).toMatch(/disconnected|closed/i)
    })
  })
})
