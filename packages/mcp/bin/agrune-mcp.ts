#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CdpDriver } from '@agrune/browser'
import { createMcpServer } from '../src/index.js'
import { MCP_SERVER_VERSION } from '../src/version.js'

const HELP_TEXT = `agrune — AI 에이전트용 CDP 기반 브라우저 자동화 MCP 서버

Usage:
  agrune [options]
  agrune manifest validate <file> [--url <url>] [--wait-selector <css>]
  agrune manifest dev <file>                # watch ~/.agrune/authoring/pending and merge captures

Options:
  --headless              Chrome 을 headless 모드로 실행 (UI 없음)
  --attach <ws>           이미 실행 중인 Chrome 의 CDP WebSocket endpoint 에 연결
                          (예: --attach ws://127.0.0.1:9222/devtools/browser/...)
  --port <n>              DevTools 웹앱 포트 (default: 47654)
  --no-devtools           DevTools 웹앱을 서빙하지 않음 (MCP stdio 만 사용)
  --url <url>             Chrome 기동 시 열 초기 URL (default: about:blank)
  --user-data-dir <path>  Chrome user-data 디렉터리 지정. 기존 automation profile 을
                          그대로 사용하려면 여기에 profile 경로를 지정한다.
                          (미지정 시 agrune 이 임시 디렉터리를 생성·삭제)
  -h, --help              이 도움말 출력 후 종료
  -v, --version           버전 출력 후 종료

Subcommands:
  manifest validate <file> [--url <url>] [--wait-selector <css>]
                          manifest schema 검증 (+ --url 지정 시 live DOM selector 검증)
  manifest dev <file>     ~/.agrune/authoring/pending 디렉토리를 watch 하면서 recorder 가 기록한
                          capture JSON 을 <file> 에 ts-morph 머지 (사용자 confirm 후 적용)

DevTools 웹앱: http://localhost:<port>/devtools  (기본 포트 47654)

예시:
  agrune                                   # Chrome 런치 + DevTools 웹앱
  agrune --headless                        # headless 모드
  agrune --attach ws://127.0.0.1:9222/...  # 기존 Chrome 에 연결
  agrune --port 47655 --no-devtools        # 포트 변경 + DevTools 비활성화
  agrune --user-data-dir ~/.agrune/profile # automation profile 재사용
  agrune manifest validate my.manifest.ts  # manifest schema 검증
  agrune manifest validate my.manifest.json --url http://localhost:3000  # schema + live DOM

문서: https://github.com/agrune/agrune
`

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(HELP_TEXT)
  process.exit(0)
}
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`agrune v${MCP_SERVER_VERSION}\n`)
  process.exit(0)
}

// ── 서브커맨드 분기 ────────────────────────────────────────────────────────────
// manifest 서브커맨드는 CdpDriver / createMcpServer 를 전혀 건드리지 않고
// process.exit() 로 종료하므로 기존 MCP 서버 플로우에 영향이 없다 (T-11-27).
if (args[0] === 'manifest') {
  const subArgs = args.slice(1)
  if (subArgs[0] === 'validate') {
    const { runValidateCli } = await import('../src/manifest-validate-cli.js')
    const code = await runValidateCli(subArgs.slice(1))
    process.exit(code)
  }
  if (subArgs[0] === 'dev') {
    const { runManifestDevCli } = await import('../src/manifest-dev-watcher.js')
    const code = await runManifestDevCli(subArgs.slice(1))
    process.exit(code)
  }
  process.stderr.write(`Unknown manifest subcommand: ${subArgs[0] ?? '(none)'}\n`)
  process.stderr.write(`Usage: agrune manifest validate <file> [--url <url>]\n`)
  process.stderr.write(`       agrune manifest dev <file>\n`)
  process.exit(1)
}
// ── 서브커맨드 분기 끝 ─────────────────────────────────────────────────────────

const attachEndpoint = getArgValue('--attach')
const headless = args.includes('--headless')
const noDevtools = args.includes('--no-devtools')
const devtoolsPortArg = getArgValue('--port')
const startUrl = getArgValue('--url')
const userDataDir = getArgValue('--user-data-dir')

if (userDataDir && attachEndpoint) {
  process.stderr.write('[agrune] --user-data-dir is ignored when --attach is set\n')
}

const driver = new CdpDriver({
  mode: attachEndpoint ? 'attach' : 'launch',
  ...(attachEndpoint ? { wsEndpoint: attachEndpoint } : {}),
  headless,
  startUrl,
  ...(userDataDir && !attachEndpoint ? { userDataDir } : {}),
})

const { server, commandBroker, hitl } = createMcpServer(driver)

// Connect MCP transport FIRST so MCP hosts don't time out during Chrome launch.
// When stdin is a TTY (user running directly from terminal), skip transport.
const isMcpHost = !process.stdin.isTTY
if (isMcpHost) {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// Always start DevTools server (it works even before Chrome connects — shows empty
// until sessions arrive). This lets users open the DevTools UI at any time to
// observe what the AI is doing, without needing to run agrune separately.
if (!noDevtools) {
  try {
    const { startDevtoolsServer } = await import('../src/devtools-server.js')
    const devtoolsPort = await startDevtoolsServer(
      driver,
      devtoolsPortArg ? Number(devtoolsPortArg) : 47654,
      {
        commandBroker,
        hitl,
        onFocusSession: async (tabId: number) => {
          try {
            await driver.focusSession(tabId)
          } catch {
            // devtools-initiated focus is best-effort; ignore errors here
            // since the UI will re-render session list on next sessions_update.
          }
        },
      },
    )
    const devtoolsUrl = `http://localhost:${devtoolsPort}/devtools`
    process.stderr.write(`[agrune] DevTools: ${devtoolsUrl}\n`)

    // Only auto-open the URL when running standalone (not under an MCP host)
    if (!isMcpHost) {
      const { exec } = await import('node:child_process')
      const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
      exec(`${openCmd} ${devtoolsUrl}`)
    }
  } catch (error) {
    process.stderr.write(`[agrune] devtools error: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

// Standalone mode: launch Chrome eagerly. MCP mode: Chrome launches lazily on
// first tool call via the tool handler's driver.connect() fallback.
if (!isMcpHost) {
  void driver.connect().catch((error) => {
    process.stderr.write(`[agrune] chrome launch error: ${error instanceof Error ? error.message : String(error)}\n`)
  })
  // Keep process alive
  setInterval(() => {}, 1 << 30)
}

const cleanup = async () => {
  await driver.disconnect().catch(() => {})
}

process.once('SIGINT', () => {
  void cleanup().finally(() => process.exit(0))
})
process.once('SIGTERM', () => {
  void cleanup().finally(() => process.exit(0))
})

function getArgValue(flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}
