# @agrune/mcp

Agrune 의 canonical MCP 패키지입니다.

이 패키지는 Claude Code, Codex, 기타 MCP 하네스가 공통으로 실행하는 stdio MCP 서버 본체이며, 제품 배포의 기준점입니다. 하네스별 플러그인이나 스킬은 이 패키지를 감싸는 얇은 어댑터로만 유지하는 것을 목표로 합니다.

2026-04-15 CDP-only 피봇 이후 Chrome 확장 / 네이티브 메시징 / 백엔드 데몬 경로는 제거되었습니다. 이 패키지는 **CDP 단일 경로** 로만 동작합니다.

## 실행

```bash
pnpm dlx @agrune/mcp@latest            # 기본: Chrome 런치 + DevTools 웹앱 (port 47654)
pnpm dlx @agrune/mcp@latest --headless # UI 없이 실행
pnpm dlx @agrune/mcp@latest --attach ws://127.0.0.1:9222/devtools/browser/<id>
pnpm dlx @agrune/mcp@latest --no-devtools  # MCP stdio 만 사용 (DevTools 웹앱 비활성)
```

전역 설치도 가능합니다:

```bash
npm i -g @agrune/mcp
# agrune / agrune-mcp 바이너리가 PATH 에 등록됨
```

## 포함 내용

- `agrune` / `agrune-mcp` CLI (Chrome launcher + MCP stdio server entry)
- stdio MCP server 구현 (`CommandBroker` 기반 event-stream broadcast, `HitlController` gate)
- Devtools webapp HTTP / WebSocket server (Phase 8) — `http://localhost:<port>/devtools`
- CDP runtime injector + session manager + recovery supervisor

## MCP 도구 (v0.5)

| 도구 | 설명 |
|------|------|
| `agrune_sessions` | 활성 세션 목록 조회 |
| `agrune_focus` | 활성 세션 지정 (multi-tab) |
| `agrune_snapshot` | 페이지 스냅샷 (manifest target + group) |
| `agrune_act` | 클릭 / 더블클릭 / 호버 / longpress / contextmenu |
| `agrune_fill` | 입력 (CDP Input 도메인) |
| `agrune_drag` | 드래그 앤 드롭 |
| `agrune_pointer` | 저수준 포인터 / 휠 시퀀스 |
| `agrune_wait` | 상태 변화 대기 |
| `agrune_guide` | 대상 하이라이트 |
| `agrune_read` | 페이지 마크다운 읽기 |
| `agrune_config` | 런타임 시각 설정 변경 |
| `agrune_manifest_load` | 런타임에 manifest 로드 / 교체 (v0.5 MANIFEST-LOAD) |
| `agrune_macro_run` | `defineMacro` 플로우 실행 (v0.5 MACRO) |
| `recorder_*` (internal) | DevTools RecorderView ↔ PendingStore WS 프로토콜 (Phase 16) |

## v0.5 Breaking Changes

- 더 이상 runtime 이 페이지 DOM 의 legacy HTML data attribute (v0.4 까지 사용하던 inline 어노테이션 prefix 시리즈) 를 스캔하지 않습니다. 모든 target 등록은 `@agrune/manifest` SDK 로 작성한 외부 manifest 를 `window.__agrune_manifest__` / `window.__agrune_preload_manifest__` / `agrune_manifest_load` 중 하나로 공급해야 합니다.
- PageSnapshot 이 v2 → v3 로 bump. `selector` 필드가 문자열에서 ladder (선호도 순 selector 배열) 로 변경.
- 런타임은 legacy 속성이 DOM 에 여전히 붙어 있어도 **idle 로 부팅** (source=idle, hasManifest=false) 합니다.
- 이전 버전 호환 adapter 는 제공하지 않습니다 (실제 사용자 없음 — PROJECT.md 명시).

자세한 마이그레이션 가이드: [`.planning/phases/17-remove/`](../../.planning/phases/17-remove/).

## 관련 디렉터리

- [`../../workflows/annotate/WORKFLOW.md`](../../workflows/annotate/WORKFLOW.md) — Agrune manifest workflow 하네스 중립 요약판
- [`../../.agents/skills/manifest/SKILL.md`](../../.agents/skills/manifest/SKILL.md) — AI 에이전트 manifest authoring skill (authoritative)
- [`../manifest/`](../manifest/) — `@agrune/manifest` SDK (`defineManifest` / `defineTarget` / `defineRepeat` / `defineMacro`)
- [`../react/`](../react/) — `@agrune/react` root-import (`<AgruneDevtools />`)
- [`../e2e/fixtures/todomvc/manifest.ts`](../e2e/fixtures/todomvc/manifest.ts) — reference manifest
