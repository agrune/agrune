# Handoff Notes

이 문서는 현재 `web-cli` 포크를 다른 엔지니어나 에이전트가 이어받을 때 바로 알아야 하는 결정사항과 함정을 정리한 인수인계 메모다.

## 1. 아키텍처 결정

- 목표는 MCP 노출이 아니라 `CLI + local companion + TUI` 조합이다.
- 브라우저 페이지와 companion 사이 transport는 유지한다.
  - `/page/connect`
  - `/page/sync`
  - `/page/ws`
- 외부 인터페이스는 JSON API와 `webcli` CLI다.
- 핵심 실행 계약은 `snapshot / act / fill / wait` 이다.
- `group`은 실행 계약의 핵심 개념이 아니라 TUI 탐색용 메타로만 취급한다.

## 2. DSL / Runtime 결정

- `data-mcp-*`는 버리고 `data-webcli-*`로 바꿨다.
- 현재 DSL 주요 속성:
  - `data-webcli-action`
  - `data-webcli-name`
  - `data-webcli-desc`
  - `data-webcli-key`
  - `data-webcli-sensitive`
  - `data-webcli-group*`
- runtime 전역은 `window.webcliDom` 이다.
- 자동 key prefix도 `mcp_`가 아니라 `wcli_`로 바꿨다.

## 3. Snapshot 정책

- 초기에 snapshot을 “실행 가능한 target만” 내보내는 방식으로 만들었다가 UX 문제가 생겼다.
- 현재는 “현재 페이지에 존재하는 target 전체”를 snapshot에 유지하는 방향이다.
- 각 target 상태는 별도로 붙는다.
  - `visible`
  - `inViewport`
  - `covered`
  - `actionableNow`
  - `overlay`
- 실행 가능 여부와 목록 노출 여부를 분리한 것이 핵심이다.

## 4. Overlay 정책

- 모달/드로어/런치패드가 뜨면 배경 target은 `covered`가 된다.
- overlay 성격의 actionable target이 하나라도 있으면 TUI `Live Actions`는 overlay 그룹만 우선 보여주도록 바꿨다.
- overlay 판정은 runtime과 TUI가 같이 쓴다.
  - runtime: `position: fixed`, `role="dialog"`, `aria-modal`, topmost hit-test
  - TUI: `overlay` 플래그 + group 메타에 `modal/drawer/dialog/launchpad` 키워드

중요:
- 이 overlay 우선 노출은 코드상 반영되었지만, 사용자가 최종적으로 “문제 해결됨”이라고 확인한 상태는 아니다.
- 다음 담당자는 실제로 모달 오픈 후 TUI에 overlay 그룹만 남는지 한 번 더 직접 검증해야 한다.

## 5. TUI 관련 반복 문제

### 6.1 실행이 안 되는 것처럼 보였던 이유

- 그룹을 펼쳐도 selection이 헤더에 남아 있으면 `Enter`가 실행이 아니라 재접힘으로 처리된다.
- 기본 포커스가 `Sessions`에 남아 있으면 눈으로는 액션 패널을 보고 있어도 Enter가 다른 패널에서 소비된다.
- 새로고침 후 같은 앱 탭이 여러 세션으로 붙으면 TUI가 다른 세션 snapshot을 볼 수 있다.

현재 반영 상태:
- 그룹 펼치면 첫 target으로 자동 이동
- target에서 `←`로 그룹 헤더 복귀
- 기본 active panel은 `Live Actions`
- panel label을 상단 `focus:`로 표시
- `Tab` 뿐 아니라 실제 `\t` 입력도 panel 전환으로 처리

### 6.2 중복 렌더 / 깜박임 / 무한증식

- `Non-unique keys` 경고가 실제로 발생했다.
- 원인은 refresh 중 중복 group/target 렌더와 key 충돌이었다.
- 현재는:
  - group/target 렌더 key를 `group:` / `target:` prefix로 분리
  - snapshot group/target도 TUI에서 방어적 dedupe

중요:
- 사용자가 모달 오픈 후 “무한 증식 / 깜박임”을 보고했다.
- key 충돌과 refresh 문제는 코드상 보강했지만, 최종 사용자 확인은 아직 필요하다.

## 6. 세션 관련 함정

- 같은 탭 refresh 시 기존에는 새 세션이 생겨 로그인 화면 세션과 콘솔 세션이 같이 남았다.
- 현재는 같은 `clientId`면 기존 세션을 재사용한다.
- TUI 세션 선택도 index가 아니라 `sessionId` 기준으로 유지한다.

실전 팁:
- 테스트할 때는 앱 탭을 하나만 남겨야 한다.
- 여러 탭이 열려 있으면 여전히 UX가 헷갈린다.

## 7. 데모 앱 관련 메모

- `apps/cli-test-page`는 로그인 화면 -> 운영 콘솔 전환 구조다.
- 운영 콘솔에는 다음 시연 포인트가 있다.
  - sidebar navigation
  - search/announcement fill
  - orders selection/approve/review/escalate
  - customer focus
  - operator brief fill
  - settings toggle
  - drawer
  - launchpad modal
- 사용자가 “sidebar navigation 클릭 시 실제 스크롤 체감이 없다”고 지적했고, 이 부분은 아직 개선 여지가 있다.

## 8. 현재 남아 있는 불확실성

- overlay 우선 그룹 표시가 사용자 환경에서 완전히 만족스러운지
- TUI에서 클릭/실행 UX가 더 이상 꼬이지 않는지
- browser refresh 후 stale snapshot이 정말 사라졌는지
- sidebar navigation에 실제 scroll 앵커를 붙일지

즉, 코드상 수정은 많이 들어갔지만 “사용자 확인 완료”가 안 된 항목이 아직 있다.

## 9. 권장 재현 절차

문제 재현이나 확인을 할 때는 항상 아래 순서를 권장한다.

1. companion 종료
2. 앱 탭을 하나만 남김
3. companion 시작
4. 앱 탭 새로고침
5. `Sessions`가 1개인지 확인
6. 그 다음 TUI/CLI 조작

명령 예시:

```bash
cd /Users/chenjing/dev/web-cli
pnpm --filter @webcli-dom/companion run stop
pnpm --filter @webcli-dom/companion run start
```

## 10. 문서/코드 정리 메모

- `docs/README.md`, `docs/RUNBOOK.md`, `docs/CHECKLIST.md`는 현재 기준으로 추가했다.
- 패키지별 README는 아직 과거 `webmcp` 문구가 남아 있을 수 있다.
- `packages/companion/src/admin-*`, `mcp-router.ts` 같은 예전 잔재 파일이 저장소에는 남아 있지만, 현재 companion 빌드 경로의 핵심은 아니다.

## 11. 다음 담당자가 우선 봐야 할 파일

- `/Users/chenjing/dev/web-cli/packages/core/src/index.ts`
- `/Users/chenjing/dev/web-cli/packages/build-core/src/runtime/page-agent-runtime.ts`
- `/Users/chenjing/dev/web-cli/packages/companion/src/tui-app.tsx`
- `/Users/chenjing/dev/web-cli/packages/companion/src/session-manager.ts`
- `/Users/chenjing/dev/web-cli/apps/cli-test-page/src/App.tsx`
