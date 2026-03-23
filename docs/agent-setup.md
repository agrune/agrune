# AI Agent 연동 가이드

webcli-dom MCP 서버를 AI Agent에 연결하여 브라우저를 직접 제어하는 방법.

## 사전 준비

1. Chrome Web Store에서 webcli-dom 확장 프로그램 설치
2. MCP 서버 설치: `npm install -g @webcli-dom/mcp-server`
3. 첫 실행 시 Native Messaging Host 설정이 자동 생성됨

## Claude Code

`~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "webcli": {
      "command": "webcli-mcp"
    }
  }
}
```

또는 프로젝트별 `.claude/settings.json`에 추가.

## Codex (OpenAI)

```bash
codex mcp add webcli --command "webcli-mcp"
```

## Gemini CLI

```bash
gemini mcp add webcli --command "webcli-mcp"
```

## 사용 가능한 MCP 도구

| 도구 | 설명 | 필수 파라미터 |
|------|------|--------------|
| `webcli_sessions` | 활성 탭 목록 | - |
| `webcli_snapshot` | 페이지 스냅샷 | tabId (선택) |
| `webcli_act` | 클릭 | targetId |
| `webcli_fill` | 입력 | targetId, value |
| `webcli_drag` | 드래그 | sourceTargetId, destinationTargetId |
| `webcli_wait` | 상태 대기 | targetId, state |
| `webcli_guide` | 시각적 가이드 | targetId |
| `webcli_config` | 런타임 설정 | pointerAnimation, auroraGlow 등 (전부 선택) |

## 웹앱 준비

웹앱 HTML/JSX에 `data-webcli-*` 어노테이션을 추가하면 자동으로 인식됨:

```html
<button data-webcli-action="click" data-webcli-name="Login">로그인</button>
<input data-webcli-action="fill" data-webcli-name="Email" type="email" />
```
