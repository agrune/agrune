# @webmcp-dom/companion

CSR 앱의 DOM 기반 tool을 로컬 MCP endpoint로 노출하는 단일 동반앱입니다.

기본 주소:

- MCP: `http://127.0.0.1:9333/mcp`
- Page WS: `ws://127.0.0.1:9333/page/ws?sessionId=<id>&token=<session-token>`
- Admin UI Login: `http://127.0.0.1:9333/admin/login?token=<admin-token>`
- Admin UI: `http://127.0.0.1:9333/admin`

## Run

```bash
pnpm --filter @webmcp-dom/companion run start
```

## CLI

```bash
pnpm --filter @webmcp-dom/companion run status
pnpm --filter @webmcp-dom/companion run stop
```

## 저장 경로

- 상태: `~/.webmcp-dom/companion/state.json`
- 관리자 토큰: `~/.webmcp-dom/companion/admin-token` (`start` 할 때마다 재발급)
- PID: `~/.webmcp-dom/companion/companion.pid`

## 인증 변경

- `/page/connect` 는 실제 브라우저 `Origin` 헤더를 기준으로 세션을 만들고 `sessionToken` 을 반환합니다.
- `/page/sync` 는 `Authorization: Bearer <session-token>` 헤더가 필요합니다.
- `/page/ws` 는 `token=<session-token>` query가 필요합니다.
- admin API/UI 는 `/admin/login` 에서 쿠키 세션을 교환한 뒤 접근합니다.
