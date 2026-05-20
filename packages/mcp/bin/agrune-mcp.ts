#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CdpDriver } from '@agrune/browser'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createMcpServer } from '../src/index.js'
import { MCP_SERVER_VERSION } from '../src/version.js'

const HELP_TEXT = `agrune — AI 에이전트용 브라우저 자동화 MCP 서버

Usage:
  agrune [options]

Options:
  --headless              Chrome 을 headless 모드로 실행 (UI 없음)
  --attach <endpoint>     이미 실행 중인 Chrome 의 CDP endpoint 에 연결
                          (예: --attach http://127.0.0.1:9222
                               --attach ws://127.0.0.1:9222/devtools/browser/...)
  --url <url>             Chrome 기동 시 열 초기 URL (default: about:blank)
  --user-data-dir <path>  Chrome user-data 디렉터리 지정
                          (default: ~/.agrune/browser-profile)
  --isolated              임시 Chrome profile 사용. 종료 시 삭제됨
  -h, --help              이 도움말 출력 후 종료
  -v, --version           버전 출력 후 종료

예시:
  agrune
  agrune --headless
  agrune --attach http://127.0.0.1:9222
  agrune --user-data-dir ~/.agrune/profile
  agrune --isolated

문서: https://github.com/agrune/agrune
`

const args = process.argv.slice(2)
const argError = validateArgs(args)
if (argError) {
  process.stderr.write(`[agrune] ${argError}\n`)
  process.stderr.write('Run `agrune --help` for supported MCP server options.\n')
  process.exit(1)
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(HELP_TEXT)
  process.exit(0)
}
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`agrune v${MCP_SERVER_VERSION}\n`)
  process.exit(0)
}

const attachEndpoint = getArgValue('--attach')
const headless = args.includes('--headless')
const startUrl = getArgValue('--url')
const isolated = args.includes('--isolated')
const userDataDirArg = getArgValue('--user-data-dir')

if (userDataDirArg && attachEndpoint) {
  process.stderr.write('[agrune] --user-data-dir is ignored when --attach is set\n')
}
if (isolated && userDataDirArg) {
  process.stderr.write('[agrune] --user-data-dir is ignored when --isolated is set\n')
}

const userDataDir = attachEndpoint || isolated
  ? undefined
  : userDataDirArg ?? join(homedir(), '.agrune', 'browser-profile')

if (userDataDir) {
  await mkdir(userDataDir, { recursive: true })
}

const driver = new CdpDriver({
  mode: attachEndpoint ? 'attach' : 'launch',
  ...(attachEndpoint ? { wsEndpoint: attachEndpoint } : {}),
  headless,
  startUrl,
  ...(userDataDir && !attachEndpoint ? { userDataDir } : {}),
})

const { server } = createMcpServer(driver)

// MCP hosts often start, stop, and health-check servers before a user actually
// asks for browser control. Keep stdio cheap: Chrome launches lazily on the
// first tool call through createMcpServer().
const isMcpHost = !process.stdin.isTTY
if (isMcpHost) {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

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

function validateArgs(argv: string[]): string | null {
  const valueFlags = new Set(['--attach', '--url', '--user-data-dir'])
  const booleanFlags = new Set(['--headless', '--isolated', '--help', '-h', '--version', '-v'])

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (valueFlags.has(arg)) {
      const value = argv[i + 1]
      if (!value || value.startsWith('-')) {
        return `${arg} requires a value.`
      }
      i += 1
      continue
    }
    if (booleanFlags.has(arg)) {
      continue
    }
    if (arg.startsWith('-')) {
      return `Unsupported option: ${arg}`
    }
    return `Unsupported command: ${arg}. Agrune now runs the MCP server directly; remove the "${arg}" argument.`
  }

  return null
}
