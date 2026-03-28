# agrune 개발 가이드

## 빌드 주의사항

- 브랜치 전환 후 반드시 `pnpm build` 실행할 것. 확장 프로그램은 빌드된 dist/ 기준으로 동작하므로, 코드를 바꿔도 빌드 안 하면 이전 버전이 그대로 돌아간다.
- 확장 프로그램 빌드 후 Chrome `chrome://extensions`에서 리로드 버튼을 눌러야 반영된다.
- MCP 서버는 `pnpm build` 시 `~/.agrune/mcp-server/`에 자동 동기화되고 데몬이 재시작된다. 별도 배포 불필요.

## 프로젝트 구조

- `agrune` — 메인 모노레포 (extension, mcp-server, build-core, core, cli)
- `agrune-demo` — 데모 웹앱 (어노테이션 테스트용)
- `agrune-plugin` — 스킬/문서 레포 (빌드 대상 아님)

## 브랜치 현황 (2026-03-28 기준)

- `feat/cdp-migration` — CDP 기반 이벤트 디스패치. synthetic event 코드 전부 제거됨. 최신.
- `main` — synthetic MouseEvent/PointerEvent 방식. CDP 미적용.
- `feat/cdp-migration`이 main에 머지되기 전까지, 확장 프로그램 테스트는 반드시 `feat/cdp-migration` 브랜치에서 빌드해야 CDP로 동작한다.

## 테스트 시 체크리스트

1. 현재 브랜치 확인 (`git branch --show-current`)
2. `pnpm build` 실행
3. Chrome 확장 프로그램 리로드
4. CDP 동작 확인: Chrome 상단에 "Chrome is being controlled by automated test software" 디버깅 툴바가 떠야 정상
