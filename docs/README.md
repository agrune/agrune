# web-cli Docs

`web-cli` 포크의 현재 구조, 실행 방법, 남은 작업을 정리한 문서 모음입니다.

## 문서 목록

- [`RUNBOOK.md`](./RUNBOOK.md)
  - 로컬 실행, 재시작, 자주 쓰는 명령
- [`CHECKLIST.md`](./CHECKLIST.md)
  - 현재 구현 상태, 부족한 기능, 추가해야 할 기능 체크리스트
- [`HANDOFF.md`](./HANDOFF.md)
  - 대화 기반 결정사항, 함정, 재현 팁, 아직 사용자 재확인이 필요한 항목
- [`WORKLOG.md`](./WORKLOG.md)
  - 최근 작업 내역, 변경 배경, 남은 과제

## 현재 구성

- `packages/core`
  - 공용 타입, command/result 모델, snapshot 모델
- `packages/build-core`
  - `data-webcli-*` DSL 수집, manifest 생성, `window.webcliDom` runtime 설치
- `packages/browser-client`
  - 페이지 snapshot/command 결과를 local companion으로 동기화
- `packages/companion`
  - local companion server + Ink TUI
- `packages/cli`
  - `webcli` 명령행 인터페이스
- `apps/cli-test-page`
  - 로그인 -> 운영 콘솔 전환이 있는 데모 앱

## 원칙

- 실행 계약은 `snapshot / act / fill / wait` 중심
- `group`은 실행 모델이 아니라 TUI 탐색용 메타
- TUI는 현재 컨텍스트를 기준으로 액션을 보여주고, CLI는 JSON 결과를 기본으로 출력
