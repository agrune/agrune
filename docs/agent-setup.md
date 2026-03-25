# AI Agent 연동 가이드

`agrune`은 Chrome 확장 프로그램과 `agrune-mcp`를 통해 AI Agent가 브라우저를 직접 제어하도록 구성된다.

## 설치

```bash
pnpm dlx @agrune/cli
```

대화형 인스톨러가 실행되며 Chrome Extension, Claude MCP, Codex MCP 중 설치할 항목을 선택한다.

설치 후 상태 확인:

```bash
pnpm dlx @agrune/cli doctor
```

## 사용 가능한 MCP 도구

| 도구 | 설명 | 필수 파라미터 |
|------|------|--------------|
| `agrune_sessions` | 활성 탭 목록 | - |
| `agrune_snapshot` | 페이지 스냅샷 | tabId (선택) |
| `agrune_act` | 클릭 | targetId |
| `agrune_fill` | 입력 | targetId, value |
| `agrune_drag` | 드래그 | sourceTargetId, destinationTargetId |
| `agrune_wait` | 상태 대기 | targetId, state |
| `agrune_guide` | 시각적 가이드 | targetId |
| `agrune_config` | 런타임 설정 | pointerAnimation, auroraGlow 등 |

## 웹앱 준비

페이지에 `data-agrune-*` 어노테이션이 있으면 확장 프로그램이 자동으로 대상과 그룹을 수집한다.

```html
<button data-agrune-action="click" data-agrune-name="Login">로그인</button>
<input data-agrune-action="fill" data-agrune-name="Email" type="email" />
```
