import http from 'node:http'

export function writeJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

export async function readBody(req: http.IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      data += chunk
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function safeObject(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object') return undefined
  return input as Record<string, unknown>
}

export function writeHtml(res: http.ServerResponse, status: number, html: string): void {
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(html))
  res.end(html)
}

export function redirect(res: http.ServerResponse, location: string): void {
  res.statusCode = 302
  res.setHeader('location', location)
  res.end()
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
