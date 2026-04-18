# External Integrations

**Analysis Date:** 2026-04-07

## APIs & External Services

**Browser Control:**
- Chrome DevTools Protocol - quick mode에서 브라우저 launch/attach 및 runtime 주입
  - Integration method: WebSocket via `ws`
  - Main code: `agrune/packages/browser/src/cdp-driver.ts`, `agrune/packages/browser/src/cdp-connection.ts`
  - Used for: target discovery, script injection, low-level input dispatch

**Chrome Extension Platform:**
- Chrome extension APIs - extension mode 제어 채널
  - APIs used: `chrome.runtime`, `chrome.tabs`, `chrome.debugger`
  - Main code: `agrune/packages/extension/src/background/service-worker.ts`, `agrune/packages/extension/src/background/message-router.ts`
  - Used for: tab broadcast, native host relay, devtools panel bridge

**MCP Integration:**
- Model Context Protocol - AI agent와의 표준 통신 표면
  - SDK: `@modelcontextprotocol/sdk`
  - Main code: `agrune/packages/mcp/src/index.ts`, `agrune/packages/mcp/src/mcp-tools.ts`
  - Transport: stdio in quick mode, local backend/native host bridge in extension mode

## Data Storage

**Local Filesystem:**
- `~/.agrune/` - backend port 파일과 설치 산출물 저장
  - Main code: `agrune/packages/mcp/bin/agrune-mcp.ts`
  - Data: `port`, synced MCP runtime, extension assets

**In-Memory State:**
- Session/snapshot cache - `SessionManager`
  - Main code: `agrune/packages/browser/src/session-manager.ts`
  - Data: active tabs, latest `PageSnapshot`, waiters

**Demo Storage:**
- Browser `localStorage`
  - Main code: `demo/src/hooks/useLocalStorage.ts`
  - Data: tasks, active tab, wizard state, filters

## Authentication & Identity

**Product Runtime:**
- 별도 사용자 인증 공급자 없음
- trust boundary는 로컬 머신, Chrome extension, native host, MCP client 사이에 형성됨

**Distribution Secrets:**
- npm publish token - GitHub Actions `NPM_TOKEN`
- Chrome Web Store credentials - `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`

## Monitoring & Observability

**Logs:**
- `process.stderr.write(...)` - native host / backend daemon 상태 로그
- `console.warn(...)` - extension background에서 복구 가능한 상태 경고
- 별도 외부 에러 수집 서비스는 없음

**Devtools:**
- 자체 devtools panel - snapshot/target inspection
  - Main code: `agrune/packages/devtools/src/*`, `agrune/packages/extension/src/devtools/*`

## CI/CD & Deployment

**Source Hosting:**
- GitHub repositories - 현재 워크스페이스는 여러 저장소를 함께 포함
  - `agrune/.git`
  - `demo/.git`
  - `skills/.git`
  - `.github/.git`

**CI Pipeline:**
- GitHub Actions - `agrune/.github/workflows/release.yml`
  - Trigger: tag push `v*`
  - Jobs: npm publish, Chrome Web Store packaging/upload

**Package Distribution:**
- npm org `@agrune`
- Chrome Web Store extension listing
- Claude plugin marketplace (`skills/README.md`)

## Environment Configuration

**Development:**
- 제품은 브라우저/확장/로컬 MCP 환경에 의존하며 일반적인 `.env` 중심 서버 앱은 아님
- 주요 설정은 CLI args, manifest, TS/Vite config, local install dir로 관리

**Runtime Modes:**
- extension mode: native host + backend daemon + extension 조합
- cdp quick mode: `agrune-mcp --mode cdp`로 직접 브라우저 연결

## Webhooks & Callbacks

**Incoming Internal Callbacks:**
- page runtime → CDP binding `agrune_send`
- content script → background `chrome.runtime.sendMessage`
- native host ↔ backend daemon TCP line protocol

**Outgoing Internal Callbacks:**
- background → content script command/config/activity broadcast
- MCP server → BrowserDriver execute/updateConfig

## Notable Non-Integrations

- 외부 DB 없음
- 외부 auth provider 없음
- 외부 analytics / error tracking 없음
- 제품 런타임에서 원격 SaaS API 호출 없음

---

*Integration audit: 2026-04-07*
*Update when adding external services, deployment targets, or secrets*
