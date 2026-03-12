# Worklog

## 2026-03-13

### TUI 실행 화면 정리

- TUI 실행 시 터미널 과거 로그가 남지 않도록 alternate screen으로 진입하게 바꿨다.
- `webcli tui` 경유 실행 시 불필요한 `pnpm` 출력이 TUI 화면을 덮지 않도록 시작 로그를 줄였다.

### Snapshot / 세션 선택 안정화

- TUI가 선택된 세션이 아니라 초기 `null` 세션 기준으로 snapshot을 계속 조회하던 문제를 수정했다.
- 세션 선택 상태를 index가 아니라 `sessionId` 기준으로 유지하게 정리했다.
- 브라우저 refresh 이후에도 현재 선택 세션 기준으로 snapshot을 다시 가져오도록 보강했다.

### 명령 실행 예외 처리

- `pending` 세션에서 `Enter` 실행 시 companion 프로세스가 죽던 문제를 막았다.
- 승인되지 않은 세션은 TUI 우측 패널에 안내를 띄우고, 승인된 세션이지만 inactive 상태면 실행 전에 자동 활성화하도록 바꿨다.
- 액션 실행 API 에러는 TUI를 종료시키지 않고 결과 패널에 남기도록 처리했다.

### Live Actions 검색

- `Live Actions` 패널에 `/` 검색을 추가했다.
- `Enter`로 click 실행, 숫자 단축 실행, `e`로 fill 진입할 때 검색어가 자동으로 초기화되도록 바꿨다.
- 검색 중에는 일치하는 그룹과 타깃만 보이고, 결과가 없으면 `검색 결과 없음`을 표시한다.

### 포커스 복원 구조 개편

- 기존 `selectedActionRow` 인덱스 기반 포커스를 제거하고 `selectedActionKey` 기반 포커스로 전환했다.
- `base` / `overlay` 화면을 `actionViewFrames` 스택으로 관리하도록 TUI 구조를 리팩터링했다.
- 모달이나 드로어가 열리면 overlay frame을 push하고, 닫히면 기존 base frame으로 pop하면서 다음 상태를 복원한다.
  - 선택된 action key
  - 검색어
  - 그룹 접힘 상태
- `viewKey`는 화면 title/url와 그룹/타깃 identity 기준으로 계산해, 같은 화면으로 돌아오면 기존 frame을 재사용하게 만들었다.

### 입력 처리 정리

- 화살표 이동, 그룹 접기/펼치기, `Enter`, 검색 입력을 모두 현재 top frame만 갱신하는 구조로 통일했다.
- 이전에 임시로 넣었던 시간 기반 action 쿨다운은 제거했고, 중복 실행 방지는 in-flight lock만 유지한다.

### 테스트 추가

- `reconcileActionViewFrames()`에 대해 두 가지 회귀 테스트를 추가했다.
  - 다른 base 화면으로 갔다가 이전 `viewKey`로 복귀할 때 기존 frame 상태 복원
  - overlay가 닫힐 때 base frame의 포커스와 접힘 상태 유지
- 검증 명령:

```bash
pnpm --filter @webcli-dom/companion run typecheck
pnpm --filter @webcli-dom/companion run test
```

### 현재 남은 과제

- TUI 내부 frame stack은 들어갔지만, runtime이 화면 단계 전환용 `contextKey`나 `backAction`을 직접 주는 구조는 아직 아니다.
- 따라서 앱별 단계형 화면 전환을 완전히 일반화한 `뒤로가기`는 아직 구현 전이다.
- 현재 `ready` 표시는 가시성/차폐 기준 상태이고, runtime의 실제 실행 가능성 메타와 완전히 같은 의미는 아니다.
