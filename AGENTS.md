# agrune 개발 가이드

## 빌드 주의사항

- 브랜치 전환 후 반드시 `pnpm build` 실행할 것. `@agrune/mcp` 실행 바이너리는 빌드된 `packages/mcp/dist/` 기준으로 동작한다.
- CDP 경로만 사용하므로 Chrome 확장 설치/리로드 과정은 필요 없다. `agrune` 실행 시 Chrome 이 자동 런치되거나 `--attach` 로 기존 인스턴스에 붙는다.
- DevTools 웹앱(`packages/devtools`) 을 수정했으면 `pnpm --filter @agrune/devtools build` 후 `pnpm --filter @agrune/mcp build` 로 MCP 서버 번들을 재생성해야 `http://localhost:47654/devtools` 에 반영된다.

## 프로젝트 구조

- `agrune` — 메인 모노레포 (`@agrune/core`, `@agrune/runtime`, `@agrune/browser`, `@agrune/mcp`, `@agrune/devtools`)
- `workflows/annotate` — 하네스 중립 어노테이션 워크플로 원본
- 하네스별 플러그인/스킬 저장소 — core repo 밖에서 별도로 관리하는 어댑터 레이어

## 실행 모드

- 기본 `agrune` — Chrome 런치 + DevTools 웹앱 (port 47654)
- `agrune --headless` — UI 없이 실행
- `agrune --attach ws://...` — 이미 실행 중인 Chrome (`--remote-debugging-port`) 에 붙기
- `agrune --port 47655` — DevTools 웹앱 포트 오버라이드
- `agrune --no-devtools` — DevTools 웹앱 비활성화 (MCP stdio 만 사용)

## 테스트 시 체크리스트

1. `pnpm build` 실행 (monorepo 전체)
2. `pnpm test` — 유닛/통합 테스트
3. `pnpm test:e2e` — Playwright E2E 하네스 (v1.1 phase 9 에서 추가)
4. `pnpm lint:annotations` — `data-agrune-*` 어노테이션 linter (`@agrune/core`)
5. `agrune` 수동 실행 → Chrome 상단에 "Chrome is being controlled by automated test software" 디버깅 툴바가 떠야 정상
6. `http://localhost:47654/devtools` 를 열어 command log / HITL toolbar / sessions panel / failure diagnostics 가 동작하는지 확인

## 역사적 참고

- Chrome 확장/네이티브 메시징 경로와 백엔드 데몬은 v1.0 시점 구현이며 v1.1 에서 제거되었다. 관련 설계 메모는 `docs/notes/` 아카이브 참고.
