# @agrune/mcp

Agrune의 canonical MCP 패키지입니다.

이 패키지는 Claude Code, Codex, 기타 MCP 하네스가 공통으로 실행하는 본체이며, 제품 배포의 기준점입니다. 하네스별 플러그인이나 스킬은 이 패키지를 감싸는 얇은 어댑터로만 유지하는 것을 목표로 합니다.

## 실행

Quick mode:

```bash
pnpm dlx @agrune/mcp@latest --mode cdp
```

Extension mode:

```bash
pnpm dlx @agrune/mcp@latest
```

## 포함 내용

- `agrune-mcp` CLI
- MCP tool definitions
- extension mode backend/native-host entrypoints
- CDP quick mode driver wiring

## 관련 디렉터리

- `../../workflows/annotate` — Agrune 어노테이션 워크플로 원본
