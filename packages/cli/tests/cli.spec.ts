import { afterEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../src/cli'
import type { CliIo } from '../src/types'

let server: http.Server | null = null

afterEach(async () => {
  if (!server) return
  await new Promise<void>(resolve => server?.close(() => resolve()))
  server = null
})

describe('runCli', () => {
  it('maps Playwright-style tab aliases to daemon endpoints', async () => {
    const requests: Array<{ method?: string; path?: string; body: Record<string, unknown> }> = []
    const port = await startJsonServer(undefined, undefined, async (requestBody, url, req) => {
      requests.push({ method: req.method, path: url.pathname, body: requestBody })
      if (url.pathname === '/tabs/new') {
        return { ok: true, index: 0, tab: { index: 0, tabId: 1, url: requestBody.url, title: '', active: true, hasSnapshot: false, snapshotVersion: null } }
      }
      if (url.pathname === '/tabs/select') {
        return { ok: true, index: requestBody.index ?? 0, tab: { index: requestBody.index ?? 0, tabId: requestBody.tabId ?? 2, url: 'about:blank', title: '', active: true, hasSnapshot: false, snapshotVersion: null } }
      }
      if (url.pathname === '/close') {
        return { ok: true, index: requestBody.index ?? null, closedTabId: requestBody.tabId ?? 2, tabs: [] }
      }
      return { ok: true, tabs: [] }
    })
    const io = captureIo()

    expect(await runCli(['tabs', 'new', '--port', String(port), 'https://example.test'], io)).toBe(0)
    expect(await runCli(['tabs', 'select', '--port', String(port), '1'], io)).toBe(0)
    expect(await runCli(['tabs', 'select', '--port', String(port), '--index', '0'], io)).toBe(0)
    expect(await runCli(['close', '--port', String(port), '1'], io)).toBe(0)
    expect(await runCli(['close', '--port', String(port), '--index', '1'], io)).toBe(0)

    expect(requests.map(request => `${request.method} ${request.path}`)).toEqual([
      'POST /tabs/new',
      'POST /tabs/select',
      'POST /tabs/select',
      'POST /close',
      'POST /close',
    ])
    expect(requests[0]?.body.url).toBe('https://example.test')
    expect(requests[1]?.body.tabId).toBe(1)
    expect(requests[2]?.body.index).toBe(0)
    expect(requests[3]?.body.tabId).toBe(1)
    expect(requests[4]?.body.index).toBe(1)
  })

  it('passes click button, double-click, and modifier options', async () => {
    let body: Record<string, unknown> | null = null
    const port = await startJsonServer('POST', '/click', async requestBody => {
      body = requestBody
      return { ok: true, target: requestBody.target, action: 'dblclick' }
    })
    const io = captureIo()

    const code = await runCli([
      'click',
      '--port',
      String(port),
      '--button',
      'middle',
      '--double-click',
      '--modifiers',
      'Alt,Shift',
      'save_button',
    ], io)

    expect(code).toBe(0)
    const sent = requireCapturedBody(body)
    expect(sent).toMatchObject({
      target: 'save_button',
      action: 'click',
      button: 'middle',
      doubleClick: true,
      modifiers: ['Alt', 'Shift'],
    })
  })

  it('passes fill strategy options', async () => {
    let body: Record<string, unknown> | null = null
    const port = await startJsonServer('POST', '/fill', async requestBody => {
      body = requestBody
      return { ok: true, target: requestBody.target, value: requestBody.value, strategy: requestBody.strategy }
    })
    const io = captureIo()

    const code = await runCli([
      'fill',
      '--port',
      String(port),
      '--strategy',
      'keystroke',
      'cc_number',
      '4242',
    ], io)

    expect(code).toBe(0)
    expect(requireCapturedBody(body)).toMatchObject({
      target: 'cc_number',
      value: '4242',
      clear: true,
      strategy: 'keystroke',
    })
  })

  it('maps run-code-unsafe code and filename inputs to the daemon endpoint', async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = []
    const port = await startJsonServer('POST', '/run-code-unsafe', async (requestBody, url) => {
      requests.push({ path: url.pathname, body: requestBody })
      return { ok: true, action: 'run-code-unsafe', result: 'ok' }
    })
    const io = captureIo()

    expect(await runCli([
      'run-code',
      '--port',
      String(port),
      '--code',
      'async (page) => page.url()',
      '--json',
    ], io)).toBe(0)
    expect(await runCli([
      'run-code-unsafe',
      '--port',
      String(port),
      '--file',
      './snippet.js',
      '--json',
    ], io)).toBe(0)

    expect(requests).toHaveLength(2)
    expect(requests[0]?.body).toMatchObject({ code: 'async (page) => page.url()' })
    expect(requests[1]?.body).toMatchObject({ filename: './snippet.js' })
    expect(requests[1]?.body).not.toHaveProperty('code')
  })

  it('passes filename options for read-output commands', async () => {
    const requests: Array<{ method?: string; path: string; filename?: string; body: Record<string, unknown> }> = []
    const port = await startJsonServer(undefined, undefined, async (requestBody, url, req) => {
      requests.push({
        method: req.method,
        path: url.pathname,
        filename: url.searchParams.get('filename') ?? undefined,
        body: requestBody,
      })
      if (url.pathname === '/evaluate') {
        return { ok: true, action: 'evaluate', result: 'ok', path: requestBody.filename }
      }
      if (url.pathname === '/console') {
        return { ok: true, messages: [], path: url.searchParams.get('filename') }
      }
      if (url.pathname === '/network') {
        return { ok: true, requests: [], path: url.searchParams.get('filename') }
      }
      if (url.pathname === '/network/request') {
        return {
          ok: true,
          request: { index: Number(url.searchParams.get('index')), method: 'GET', url: 'https://example.test', resourceType: 'fetch', isNavigationRequest: false, timestamp: 0, navigationIndex: 1, tabId: 1 },
          part: url.searchParams.get('part'),
          value: '{}',
          path: url.searchParams.get('filename'),
        }
      }
      if (url.pathname === '/snapshot') {
        return { ok: true, text: '- button "Save"', mode: 'ai', path: url.searchParams.get('filename') }
      }
      return { ok: true }
    })
    const io = captureIo()

    expect(await runCli(['evaluate', '--port', String(port), '--filename', './eval.txt', 'document.title', '--json'], io)).toBe(0)
    expect(await runCli(['console', '--port', String(port), '--filename', './console.json', '--json'], io)).toBe(0)
    expect(await runCli(['network', '--port', String(port), '--filename', './network.json', '--json'], io)).toBe(0)
    expect(await runCli(['network', 'request', '--port', String(port), '--filename', './request.json', '--part', 'response-body', '1', '--json'], io)).toBe(0)
    expect(await runCli(['snapshot', '--port', String(port), '--filename', './snapshot.md', '--json'], io)).toBe(0)

    expect(requests.map(request => `${request.method} ${request.path}`)).toEqual([
      'POST /evaluate',
      'GET /console',
      'GET /network',
      'GET /network/request',
      'GET /snapshot',
    ])
    expect(requests[0]?.body.filename).toBe('./eval.txt')
    expect(requests[1]?.filename).toBe('./console.json')
    expect(requests[2]?.filename).toBe('./network.json')
    expect(requests[3]?.filename).toBe('./request.json')
    expect(requests[4]?.filename).toBe('./snapshot.md')
  })

  it('rejects invalid click options before making a request', async () => {
    const io = captureIo()

    const code = await runCli(['click', 'save_button', '--button', 'primary'], io)

    expect(code).toBe(1)
    expect(io.stderrText()).toContain('click button must be one of: left, right, middle')
  })

  it('passes snapshot query options and prints text output', async () => {
    let capturedTarget: string | null = null
    let capturedDepth: string | null = null
    let capturedBoxes: string | null = null
    let capturedIncludeTextContent: string | null = null
    const port = await startJsonServer('GET', '/snapshot', async (_body, url) => {
      capturedTarget = url.searchParams.get('target')
      capturedDepth = url.searchParams.get('depth')
      capturedBoxes = url.searchParams.get('boxes')
      capturedIncludeTextContent = url.searchParams.get('includeTextContent')
      return { ok: true, text: '- button "Save"', mode: 'ai', target: 'save_button', depth: 2, boxes: true, includeTextContent: true }
    })
    const io = captureIo()

    const code = await runCli(['snapshot', '--port', String(port), '--target', 'save_button', '--depth', '2', '--boxes', '--include-text-content'], io)

    expect(code).toBe(0)
    expect(capturedTarget).toBe('save_button')
    expect(capturedDepth).toBe('2')
    expect(capturedBoxes).toBe('true')
    expect(capturedIncludeTextContent).toBe('true')
    expect(io.stdoutText()).toContain('Save')
  })

  it('writes formatted target snapshots and accepts mode aliases', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agrune-cli-'))
    try {
      const output = join(tempDir, 'targets.md')
      const targetOutput = join(tempDir, 'target.md')
      const groupsOutput = join(tempDir, 'groups.md')
      const requests: URLSearchParams[] = []
      const port = await startJsonServer('GET', '/targets', async (_body, url) => {
        requests.push(new URLSearchParams(url.searchParams))
        return {
          ok: true,
          snapshot: {
            schemaVersion: 3,
            version: 1,
            capturedAt: 0,
            url: 'https://example.test',
            title: 'Targets',
            groups: [
              { groupId: 'main', groupName: 'Main', targetIds: ['save_button', 'cancel_button'] },
              { groupId: 'secondary', groupName: 'Secondary', targetIds: ['filter_input'] },
            ],
            targets: [
              targetSnapshot('save_button', 'main', 'Save', 'Save changes'),
              targetSnapshot('cancel_button', 'main', 'Cancel', 'Cancel changes'),
              targetSnapshot('filter_input', 'secondary', 'Filter', 'Filter rows'),
            ],
          },
        }
      })
      const io = captureIo()

      const code = await runCli(['targets', '--port', String(port), '--mode', 'full', '--text', '--filename', output], io)

      expect(code).toBe(0)
      expect(io.stdoutText().trim()).toBe(output)
      const written = await readFile(output, 'utf-8')
      expect(written).toContain('- target "Save" [ref=save_button]')
      expect(written).toContain('text: "Save changes"')

      const scopedIo = captureIo()
      const scopedCode = await runCli(['targets', '--port', String(port), '--target', 'save_button', '--text', '--filename', targetOutput], scopedIo)

      expect(scopedCode).toBe(0)
      expect(scopedIo.stdoutText().trim()).toBe(targetOutput)
      const scoped = await readFile(targetOutput, 'utf-8')
      expect(requests[1]?.get('target')).toBe('save_button')
      expect(scoped).toContain('- target "Save" [ref=save_button]')
      expect(scoped).not.toContain('- target "Cancel" [ref=cancel_button]')
      expect(scoped).not.toContain('- target "Filter" [ref=filter_input]')

      const groupIo = captureIo()
      const groupCode = await runCli(['targets', '--port', String(port), '--group-ids', 'secondary', '--filename', groupsOutput], groupIo)

      expect(groupCode).toBe(0)
      expect(groupIo.stdoutText().trim()).toBe(groupsOutput)
      expect(requests[2]?.getAll('groupIds')).toEqual(['secondary'])
      const groups = await readFile(groupsOutput, 'utf-8')
      expect(groups).toContain('- target "Filter" [ref=filter_input]')
      expect(groups).not.toContain('- target "Save" [ref=save_button]')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('uses a jpeg default extension for jpeg screenshots', async () => {
    let body: Record<string, unknown> | null = null
    const port = await startJsonServer('POST', '/screenshot', async requestBody => {
      body = requestBody
      return {
        ok: true,
        path: requestBody.path,
        type: requestBody.type,
        fullPage: requestBody.fullPage === true,
      }
    })
    const io = captureIo()

    const code = await runCli(['screenshot', '--port', String(port), '--type', 'jpeg', '--json'], io)

    expect(code).toBe(0)
    const sent = requireCapturedBody(body)
    expect(sent.path).toEqual(expect.stringMatching(/screenshot\.jpg$/))
    expect(sent.type).toBe('jpeg')
    expect(JSON.parse(io.stdoutText()).type).toBe('jpeg')
  })

  it('rejects screenshot flags that require values before making a request', async () => {
    const io = captureIo()

    const code = await runCli(['screenshot', '--target'], io)

    expect(code).toBe(1)
    expect(io.stderrText()).toContain('--target requires a value')
  })

  it('rejects unsupported screenshot types before making a request', async () => {
    const io = captureIo()

    const code = await runCli(['screenshot', '--type', 'webp'], io)

    expect(code).toBe(1)
    expect(io.stderrText()).toContain('screenshot type must be one of: png, jpeg')
  })

  it('rejects invalid snapshot options before making a request', async () => {
    const io = captureIo()

    const code = await runCli(['snapshot', '--mode', 'verbose'], io)

    expect(code).toBe(1)
    expect(io.stderrText()).toContain('snapshot mode must be one of: ai, default')
  })

  it('rejects invalid fill strategy options before making a request', async () => {
    const io = captureIo()

    const code = await runCli(['fill', '--strategy', 'paste', 'cc_number', '4242'], io)

    expect(code).toBe(1)
    expect(io.stderrText()).toContain('fill strategy must be one of: insert, keystroke, auto')
  })
})

async function startJsonServer(
  method: string | undefined,
  pathname: string | undefined,
  handler: (body: Record<string, unknown>, url: URL, req: http.IncomingMessage) => Promise<unknown> | unknown,
): Promise<number> {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if ((method && req.method !== method) || (pathname && url.pathname !== pathname)) {
      res.writeHead(404)
      res.end()
      return
    }
    const body = req.method === 'GET' ? {} : await readJsonBody(req)
    const response = await handler(body, url, req)
    const text = JSON.stringify(response)
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(text),
    })
    res.end(text)
  })
  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject)
    server?.listen(0, '127.0.0.1', () => {
      server?.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address !== 'object') {
    throw new Error('server did not expose a port')
  }
  return address.port
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>
}

function captureIo(): CliIo & { stdoutText(): string; stderrText(): string } {
  let stdout = ''
  let stderr = ''
  return {
    stdout: { write: (chunk: string) => { stdout += chunk; return true } } as CliIo['stdout'],
    stderr: { write: (chunk: string) => { stderr += chunk; return true } } as CliIo['stderr'],
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}

function targetSnapshot(
  targetId: string,
  groupId: string,
  name: string,
  textContent: string,
): Record<string, unknown> {
  return {
    targetId,
    groupId,
    groupName: groupId,
    name,
    description: '',
    actionKinds: ['click'],
    selector: { testId: targetId },
    visible: true,
    inViewport: true,
    enabled: true,
    covered: false,
    actionableNow: true,
    reason: 'ready',
    overlay: false,
    sensitive: false,
    textContent,
    sourceFile: 'page-manifest',
    sourceLine: 0,
    sourceColumn: 0,
  }
}

function requireCapturedBody(body: Record<string, unknown> | null): Record<string, unknown> {
  if (!body) throw new Error('expected CLI request body to be captured')
  return body
}
