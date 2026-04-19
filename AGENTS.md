# agrune 개발 가이드

## 빌드 주의사항

- 브랜치 전환 후 반드시 `pnpm build` 실행할 것. `@agrune/mcp` 실행 바이너리는 빌드된 `packages/mcp/dist/` 기준으로 동작한다.
- CDP 경로만 사용하므로 Chrome 확장 설치/리로드 과정은 필요 없다. `agrune` 실행 시 Chrome 이 자동 런치되거나 `--attach` 로 기존 인스턴스에 붙는다.
- DevTools 웹앱(`packages/devtools`) 을 수정했으면 `pnpm --filter @agrune/devtools build` 후 `pnpm --filter @agrune/mcp build` 로 MCP 서버 번들을 재생성해야 `http://localhost:47654/devtools` 에 반영된다.
- `@agrune/manifest` SDK 를 수정했으면 의존 소비자(`@agrune/react`, `@agrune/runtime`, fixture 의 manifest.ts) 가 타입 체크에 걸리지 않는지 확인 후 `pnpm --filter @agrune/manifest build` 로 dist 를 갱신한다.

## Manifest authoring workflow

agrune v0.5 부터 제어 대상은 `@agrune/manifest` SDK 로 작성한 외부 `manifest.ts` 파일로 정의한다. 더 이상 앱 소스에 `data-agrune-*` 속성을 붙이지 않는다.

- **owned React 앱**: root (App.tsx / main.tsx) 에 `<AgruneDevtools manifest={m} mode="dev" />` 한 줄을 추가하고, `src/manifest.ts` 를 `defineManifest({ groups: [defineGroup({ groupId, targets: [defineTarget({ ... })] })] })` 형태로 작성한다.
- **외부 사이트**: `window.__agrune_preload_manifest__` 경로로 manifest JSON 을 preload 하거나 MCP `agrune_manifest_load` 도구로 runtime 에 주입한다. React fiber selector 는 사용 불가 — `role` / `text` / `testId` / `css` 로 대체.
- **복합 플로우**: `defineMacro` 로 로그인·다단계 워크플로를 묶어 `agrune_macro_run` 으로 실행.
- **동적 리스트**: `defineRepeat({ keyFrom, nameFrom, strategy })` 으로 TodoMVC 같은 per-row target 을 한 번에 등록.

### AI 에이전트가 manifest 를 작성할 때

authoritative source 는 [`.agents/skills/manifest/SKILL.md`](./.agents/skills/manifest/SKILL.md) 이다. 이 skill 은 `manifest.ts` 를 직접 생성하거나 기존 파일에 target 을 추가하는 절차를 정의한다. AGENTS.md 는 agrune 모노레포 개발자용 가이드이고, skill 파일이 실제 authoring 절차의 single source of truth 다.

SDK reference:

- `@agrune/manifest` — `defineManifest`, `defineGroup`, `defineTarget`, `defineRepeat`, `defineMacro` (타입 정의는 `packages/manifest/src/` 참조)
- Reference manifest: [`packages/e2e/fixtures/todomvc/manifest.ts`](./packages/e2e/fixtures/todomvc/manifest.ts)

## 프로젝트 구조

- `agrune` — 메인 모노레포 (`@agrune/core`, `@agrune/manifest`, `@agrune/runtime`, `@agrune/browser`, `@agrune/react`, `@agrune/mcp`, `@agrune/devtools`)
- `workflows/annotate` — 하네스 중립 manifest authoring workflow 요약판 (authoritative source 는 `.agents/skills/manifest/`)
- `.agents/skills/manifest/` — AI 에이전트 manifest authoring skill (authoritative)
- 하네스별 플러그인/스킬 저장소 — core repo 밖에서 별도로 관리하는 어댑터 레이어

## 실행 모드

- 기본 `agrune` — Chrome 런치 + DevTools 웹앱 (port 47654)
- `agrune --headless` — UI 없이 실행
- `agrune --attach ws://...` — 이미 실행 중인 Chrome (`--remote-debugging-port`) 에 붙기
- `agrune --port 47655` — DevTools 웹앱 포트 오버라이드
- `agrune --no-devtools` — DevTools 웹앱 비활성화 (MCP stdio 만 사용)
- `agrune manifest validate <file> [--url <URL>]` — manifest 검증 (shape + live DOM)
- `agrune manifest dev <file>` — recorder → ts-morph merge watcher 기동

## 테스트 시 체크리스트

1. `pnpm build` 실행 (monorepo 전체)
2. `pnpm test` — 유닛/통합 테스트
3. `pnpm test:e2e` — Playwright E2E 하네스 (v1.1 phase 9 에서 추가)
4. `pnpm lint:no-legacy` — Phase 17 regression guard. allow-list (`scripts/regression-guard/data-agrune-allowlist.txt`) 외에서 legacy `data-agrune-` 참조가 새로 등장하면 CI 를 실패시킨다. 외부 소비자용 build-linter (`@agrune/core/annotation-lint`) 는 그대로 publish 되므로, 외부 프로젝트는 `agrune-lint` bin 을 직접 호출한다.
5. `agrune` 수동 실행 → Chrome 상단에 "Chrome is being controlled by automated test software" 디버깅 툴바가 떠야 정상
6. `http://localhost:47654/devtools` 를 열어 command log / HITL toolbar / sessions panel / failure diagnostics / recorder 가 동작하는지 확인
7. manifest 작성 후 `agrune manifest validate src/manifest.ts --url <target-url>` 로 live DOM 매칭 확인

## 역사적 참고

- Chrome 확장/네이티브 메시징 경로와 백엔드 데몬은 v1.0 시점 구현이며 v1.1 에서 제거되었다 (2026-04-15 CDP-only 피봇). 관련 설계 메모는 `docs/notes/` 아카이브 참고.
- inline `data-agrune-*` DOM 속성 기반 제어 표면은 v0.4 까지 사용됐고, v0.5 (Phase 17) 에서 런타임 스캐너가 제거돼 현재는 runtime 이 해당 속성을 무시한다. upgrade 경로는 속성을 `@agrune/manifest` SDK 로 외부 manifest 에 다시 표현하는 것이다.
