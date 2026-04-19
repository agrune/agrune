# AI Agent 연동 가이드

`agrune` 은 `@agrune/mcp` stdio MCP 서버를 통해 AI Agent 가 **로컬 Chrome 을 CDP 로 직접 제어**하도록 구성된다. 2026-04-15 CDP-only 피봇 이후 Chrome 확장·네이티브 메시징·백엔드 데몬 경로는 제거되었다. v0.5 (2026-04-19) 부터 제어 대상은 외부 `manifest.ts` 파일로 정의한다.

## 설치

전역 바이너리로 설치하는 경우:

```bash
npm i -g @agrune/mcp
# 설치 후 `agrune` / `agrune-mcp` CLI 가 PATH 에 등록됨
```

monorepo 에서 dev 로 실행하는 경우:

```bash
git clone https://github.com/agrune/agrune.git
cd agrune
pnpm install
pnpm build
# 실행
node packages/mcp/dist/bin/agrune-mcp.js
```

## 실행 모드

```bash
agrune                       # Chrome 런치 + DevTools 웹앱 (기본 port 47654)
agrune --headless            # UI 없이 실행
agrune --attach ws://...     # 이미 열려 있는 Chrome (`--remote-debugging-port`) 에 붙기
agrune --port 47655          # DevTools 웹앱 포트 오버라이드
agrune --no-devtools         # MCP stdio 만 사용 (DevTools 웹앱 비활성화)
```

DevTools UI 는 `http://localhost:<port>/devtools` 에서 제공된다.

## MCP 하네스 연결

### Claude Code

`~/.claude/claude_desktop_config.json` (또는 프로젝트별 `.mcp.json`) 에 stdio 엔트리를 추가:

```json
{
  "mcpServers": {
    "agrune": {
      "command": "agrune-mcp",
      "args": []
    }
  }
}
```

### Codex

Codex 설정(`~/.codex/config.toml` 혹은 프로젝트 수준 MCP 설정) 에 동일한 stdio 엔트리를 등록. `command` 는 실제 바이너리 경로(`which agrune-mcp`) 를 지정해도 된다.

## 사용 가능한 MCP 도구

| 도구 | 설명 | 필수 파라미터 |
|------|------|--------------|
| `agrune_sessions` | 활성 세션 목록 | - |
| `agrune_focus` | 활성 세션 지정 | sessionId |
| `agrune_snapshot` | 페이지 스냅샷 | sessionId (선택) |
| `agrune_act` | 클릭/더블클릭/호버 등 | targetId, action |
| `agrune_fill` | 입력 (CDP Input 경로) | targetId, value |
| `agrune_drag` | 드래그 앤 드롭 | sourceTargetId, destinationTargetId |
| `agrune_pointer` | 저수준 포인터/휠 시퀀스 | sequence |
| `agrune_wait` | 상태 대기 | targetId, state |
| `agrune_guide` | 시각적 가이드 | targetId |
| `agrune_read` | 페이지 마크다운 읽기 | (범위 selector 선택) |
| `agrune_config` | 런타임 시각 설정 | pointerAnimation, auroraGlow 등 |
| `agrune_manifest_load` | 런타임에 manifest 로드/교체 | manifest payload |
| `agrune_macro_run` | `defineMacro` 실행 | macroId, args |

## 웹앱 준비 — manifest 작성

agrune 은 페이지 DOM 을 스캔하지 않는다 (Phase 17 이후 legacy 스캐너 제거). 제어 대상은 반드시 외부 `manifest.ts` 로 선언한다.

### owned React 앱

루트에 `<AgruneDevtools />` 한 줄을 추가:

```tsx
// src/App.tsx
import { AgruneDevtools } from '@agrune/react'
import manifest from './manifest'

export function App() {
  return (
    <>
      <AgruneDevtools manifest={manifest} mode="dev" />
      {/* ... */}
    </>
  )
}
```

`manifest.ts` 는 `@agrune/manifest` SDK 로 작성:

```typescript
// src/manifest.ts
import { defineManifest, defineGroup, defineTarget } from '@agrune/manifest'

export default defineManifest({
  groups: [
    defineGroup({
      groupId: 'login',
      route: '/login',
      targets: [
        defineTarget({
          targetId: 'email_input',
          selector: { role: { name: 'textbox' }, css: 'input[type=email]' },
          actionKinds: ['fill'],
        }),
        defineTarget({
          targetId: 'submit_button',
          selector: { role: { name: 'button' }, text: 'Login' },
          actionKinds: ['click'],
        }),
      ],
    }),
  ],
})
```

### 외부 사이트 (소스 접근 불가)

`window.__agrune_preload_manifest__` 에 preload JSON 을 주입하거나, 런타임에 `agrune_manifest_load` MCP 도구로 manifest 를 push 한다. React fiber selector 는 불가 — `role` / `text` / `testId` / `css` 로 대체.

작성 후 검증:

```bash
agrune manifest validate src/manifest.ts --url https://example.com
```

iterative 편집에는 DevTools recorder + watcher 조합을 사용:

```bash
agrune manifest dev src/manifest.ts
```

자세한 workflow 는 [`workflows/annotate/WORKFLOW.md`](../workflows/annotate/WORKFLOW.md) 와 AI 에이전트 authoritative source [`.agents/skills/manifest/SKILL.md`](../.agents/skills/manifest/SKILL.md) 를 참고.

## Troubleshooting

- **Chrome 이 headful 로 보이지 않음** — agrune 이 띄운 Chrome 창이 background 에 묻히거나 아예 표시되지 않는 경우, `--user-data-dir` 옵션과 함께 `--new-window` 를 명시적으로 주입해 해결. 단순 headful 프로세스 생성만으로는 가시성이 보장되지 않는다.
- **`--remote-debugging-port` 충돌** — 이미 다른 Chrome 인스턴스가 `9222` 를 쓰고 있으면 `agrune` 의 launcher 가 실패한다. 기존 Chrome 을 종료하거나 `agrune --attach ws://127.0.0.1:9222/devtools/browser/<id>` 로 붙기.
- **manifest target 이 매칭되지 않음** — `agrune manifest validate --url <URL>` 로 live DOM 매칭 결과를 확인. Hash class (`.css-abc123`) 나 `:nth-child(n)` 은 대부분 원인 — SKILL.md 의 금칙 규칙을 참고해 selector 를 교체.
- **DevTools 웹앱 미접속** — `http://localhost:47654/devtools` 가 열리지 않으면 `--no-devtools` 가 켜져 있거나 포트가 다른 프로세스에 점유된 것. `agrune --port <다른포트>` 로 재시도.
