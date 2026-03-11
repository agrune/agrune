# Checklist

## 현재 구현됨

- [x] `data-webcli-*` DSL 수집 및 manifest 생성
- [x] `window.webcliDom.getSnapshot / act / fill / wait` runtime 설치
- [x] browser client -> companion snapshot/command 결과 동기화
- [x] local companion JSON API
- [x] `webcli` CLI 기본 명령
- [x] Ink 기반 TUI
- [x] 로그인 -> 운영 콘솔 전환이 있는 데모 앱
- [x] target 상태 모델(`visible`, `inViewport`, `covered`, `actionableNow`, `overlay`)
- [x] 같은 `clientId` 기준 새로고침 세션 재사용
- [x] overlay가 열리면 배경 target은 `covered`로 표시
- [x] 모달/드로어 actionable target이 있으면 TUI는 overlay 그룹 우선 표시

## 현재 부족한 기능

- [ ] TUI에서 현재 활성 세션과 브라우저 탭 대응 관계를 더 명확히 표시
- [ ] TUI에서 group/target 이동 상태를 더 명확히 시각화
- [ ] TUI action 실행 실패 원인을 더 친절하게 표시
- [ ] overlay 판정 기준을 앱별 커스텀 가능하게 만들기
- [ ] `wait` verb에 더 다양한 조건 지원
- [ ] CLI에서 session pinning / explicit session selection 옵션 강화
- [ ] browser-client reconnect / refresh 흐름 테스트 확대
- [ ] package README 전면 갱신

## 추가해야 할 기능

### Core / Runtime

- [ ] target 상태에 `reason` 필드 추가
  - 예: `covered-by-overlay`, `outside-viewport`, `disabled-by-form-state`
- [ ] click/fill 외 action 확장 검토
  - 예: `toggle`, `select`, `submit`
- [ ] runtime에서 scroll target/anchor 힌트 메타 지원

### Companion / TUI

- [ ] overlay 전용 뷰 배지 추가
- [ ] `ready only` / `all targets` 필터 토글
- [ ] 검색 입력으로 target 필터링
- [ ] 선택 target 상세 패널 강화
  - selector
  - source file/line
  - 현재 status reason
- [ ] TUI action history와 command replay
- [ ] 다중 세션 관리 UX 개선
  - 현재 active session 고정 표시
  - session switch shortcut

### CLI

- [ ] `webcli sessions use <sessionId>` 이후 sticky selection 저장 정책 정리
- [ ] `webcli snapshot --json` / `--compact` 같은 출력 모드
- [ ] `webcli act/fill/wait`에 `--session` 직접 지정 지원 강화
- [ ] 실패 시 구조화 에러 exit code 규칙 정리

### Demo App

- [ ] view 전환 시 실제 섹션 앵커 스크롤 강화
- [ ] modal/drawer/open overlay 조작을 더 명시적으로 드러내는 UI
- [ ] 데모 상태 reset 버튼 추가
- [ ] 테스트용 시나리오 preset
  - 로그인 후 주문 승인
  - 고객 포커스 전환
  - launchpad confirm/cancel

## 문서화가 필요한 항목

- [ ] session model 설명
- [ ] snapshot lifecycle 설명
- [ ] overlay 우선 정책 설명
- [ ] TUI 포커스/키맵 설명
- [ ] 브라우저 refresh 시 동작 설명

## 다음 우선순위 추천

- [ ] package README 최신화
- [ ] TUI target 상세 패널 강화
- [ ] 다중 탭/다중 세션 UX 명확화
- [ ] overlay 정책 테스트 추가
