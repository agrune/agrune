# agrune 노트 통합문서

작성일: 2026-04-02

`docs/notes`에 흩어져 있던 메모를 한 문서에서 먼저 볼 수 있도록 정리한 기준 문서다. 앞으로는 이 문서를 우선 보고, 세부 배경이나 당시 판단 근거가 필요할 때만 `[통합됨]` 원본 노트를 연다.

## 사용 원칙

- 현재 상태, 우선순위, 문서 관계는 이 문서를 기준으로 본다.
- `[통합됨]` 태그가 붙은 파일은 원본 메모이자 히스토리 기록으로 유지한다.
- 새 작업이 생기면 가능하면 먼저 이 문서를 갱신하고, 설계가 커질 때만 별도 note/spec/plan 문서를 추가한다.

## 현재 상태 한눈에 보기

| 영역 | 상태 | 핵심 내용 | 원본 |
|------|------|-----------|------|
| 런타임 warm-up / resync | 완료 | cold start 시 `ensureReady`, `resync`, 초기 `request_snapshot` 흐름 정리 | [`[통합됨] 1-mcp-warmup-resync-todo.md`]([통합됨] 1-mcp-warmup-resync-todo.md) |
| 기본 탭 선택 | 미착수 | 첫 세션 기본 선택 대신 snapshot/최근 상호작용/명시 선택 우선순위 필요 | [`[통합됨] 2-tab-selection-todo.md`]([통합됨] 2-tab-selection-todo.md) |
| 오버레이 E2E | 미착수 | overlay context를 E2E로 고정하는 별도 검증 필요 | [`[통합됨] 3-overlay-e2e-todo.md`]([통합됨] 3-overlay-e2e-todo.md) |
| 확장프로그램 UX 개선 | 부분 반영 | 타깃 인스펙터는 들어갔고, 포커스/세션 선택/명령 로그는 남아 있음 | [`[통합됨] 4-extension-improvement-ideas.md`]([통합됨] 4-extension-improvement-ideas.md) |
| 확장프로그램 업데이트 UX | 미착수 | reload 중심 개발 UX, 스토어/버전 스큐 전략 정리 필요 | [`[통합됨] 5-extension-update-ux-todo.md`]([통합됨] 5-extension-update-ux-todo.md) |
| Installer CLI | 폐기 | `packages/cli` 삭제. 설치/진단은 plugin 통합 방향으로 전환. | [`[통합됨] 6-installer-cli-plan.md`]([통합됨] 6-installer-cli-plan.md) |
| 릴리스 파이프라인 | 완료 | npm/CWS/GitHub Actions 릴리스 경로 정리 | [`[통합됨] 7-release-pipeline-todo.md`]([통합됨] 7-release-pipeline-todo.md) |
| 어노테이션 검증 패키지 | 미착수 | 빌드 타임 검증 도구는 아직 별도 논의 단계 | [`[통합됨] 8-annotation-validation-package.md`]([통합됨] 8-annotation-validation-package.md) |
| 복수 액션 지원 | 완료 | `actionKinds` 배열 방식으로 구현 완료 | [`[통합됨] 9-multi-action-support.md`]([통합됨] 9-multi-action-support.md) |
| 캔버스 포인터 / CDP 전환 | 완료 | 합성 이벤트 한계를 CDP 입력 전환으로 해소 | [`[통합됨] 10-canvas-pointer-cdp.md`]([통합됨] 10-canvas-pointer-cdp.md), [`[통합됨] 11-cdp-migration-issues.md`]([통합됨] 11-cdp-migration-issues.md), [`[통합됨] 12-cdp-remaining-tasks.md`]([통합됨] 12-cdp-remaining-tasks.md) |
| 범용 캔버스 지원 전략 | 미착수 | SVG/Canvas/WebGL에 대한 범용 표현 방식은 아직 설계 전 | [`[통합됨] 13-canvas-support-strategy.md`]([통합됨] 13-canvas-support-strategy.md) |
| 제품 로드맵 | 진행중 | capture/focus/system interaction/draw/build linter/QA 방향을 묶은 상위 로드맵 | [`[통합됨] 14-roadmap-ideas.md`]([통합됨] 14-roadmap-ideas.md) |
| main 기준 후속 작업 | 진행중 | `fill` CDP 전환, bootstrap 확장, self-healing, active session 정책이 현재 최우선 | [`[통합됨] 15-main-followups-2026-03-30.md`]([통합됨] 15-main-followups-2026-03-30.md) |
| CDP quick mode | **최우선** | extension 없이 CDP-only로 브라우저 launch/attach. QA 자동화·headless CI의 선행 조건. | [`[통합됨] 16-cdp-quick-mode-option.md`]([통합됨] 16-cdp-quick-mode-option.md) |
| QA 테스트 시트 자동 생성 | 미착수 (CDP quick mode 이후) | AI 탐색 → flows.json → 마크다운 시트 + 실행 시나리오 JSON. MCP 도구 3종 추가. | [`spec`](../superpowers/specs/2026-04-02-qa-test-sheet-design.md), [`plan`](../superpowers/plans/2026-04-02-qa-test-sheet.md) |

## 완료된 축

### 1. 런타임 준비와 복구

- backend 재기동이나 native host 재연결 후에도 첫 호출이 빈 snapshot으로 끝나지 않도록 warm-up/resync 흐름을 정리했다.
- 핵심 포인트는 `runtime_ready` 직후 즉시 snapshot 요청, backend의 `ensureReady`, background의 `resync_request` 브로드캐스트다.
- 관련 원본: [`[통합됨] 1-mcp-warmup-resync-todo.md`]([통합됨] 1-mcp-warmup-resync-todo.md)

### 2. 설치와 배포

- installer CLI(`packages/cli`)는 `setup / doctor / repair / update / uninstall` 명령으로 구현되었으나, 이후 plugin 통합 방향으로 전환하면서 **폐기**되었다. 패키지 디렉토리, CI 빌드/배포 단계, root 스크립트 모두 제거 완료.
- 릴리스 파이프라인은 `@agrune/core`, `@agrune/build-core` npm 배포 + Chrome Web Store 업로드로 정리됐다.
- 관련 원본: [`[통합됨] 6-installer-cli-plan.md`]([통합됨] 6-installer-cli-plan.md), [`[통합됨] 7-release-pipeline-todo.md`]([통합됨] 7-release-pipeline-todo.md)

### 3. 인터랙션 모델 확장

- 하나의 요소가 여러 인터랙션을 가질 수 있도록 복수 액션 지원을 구현했다.
- 초기 노트는 타깃 분리 방식을 전제했지만, 실제 구현은 `actionKinds: ActionKind[]` 배열 방식으로 정리됐다.
- 관련 원본: [`[통합됨] 9-multi-action-support.md`]([통합됨] 9-multi-action-support.md)

### 4. 캔버스 조작과 CDP 마이그레이션

- 캔버스/React Flow 계열에서 합성 이벤트가 실패하던 문제를 CDP 입력 경로로 전환하며 해소했다.
- pointer delay, viewport transform, debugger auto-detach, fallback 제거까지 정리되어 CDP 마이그레이션은 사실상 완료 상태다.
- 관련 원본: [`[통합됨] 10-canvas-pointer-cdp.md`]([통합됨] 10-canvas-pointer-cdp.md), [`[통합됨] 11-cdp-migration-issues.md`]([통합됨] 11-cdp-migration-issues.md), [`[통합됨] 12-cdp-remaining-tasks.md`]([통합됨] 12-cdp-remaining-tasks.md)

## 현재 기준 최우선 작업

### 0. 두 가지 진입 경로 확립 (전체 선행)

agrune의 제품 진입 경로는 두 갈래다:

**Quick Mode** (Playwright MCP 유사)
- extension 없이 CDP-only로 전용 브라우저를 launch/attach.
- headless QA, CI 자동화, 단일 앱 데모 용도.
- QA 테스트 시트(Phase A/C), headless CI, 향후 모든 자동화 확장의 **선행 조건**.

**Extension Mode** (Claude Code Chrome 확장 유사)
- 기존 브라우저에 바로 attach. 확장 프로그램 설치만으로 동작.
- 사이드패널 채팅 UI 제공 — 브라우저 안에서 바로 에이전트와 대화.
- 원격 에이전트(Codex, Claude Code auth 방식) 또는 로컬 에이전트(MCP) 연결.
- 단순 MCP 브릿지를 넘어 **채팅 UI + 에이전트 연결 허브**로 확장.

핵심 설계 과제는 **드라이버 계층 분리** — CDP driver와 extension driver가 동일한 상위 인터페이스를 공유해야 quick mode/extension mode 간 기능 호환이 가능하다.

- 관련 원본: [`[통합됨] 16-cdp-quick-mode-option.md`]([통합됨] 16-cdp-quick-mode-option.md)

### 1. `fill` 입력 경로 CDP 통일

- 클릭/드래그/휠은 이미 CDP인데, `fill`은 아직 DOM setter 기반이라 입력 신뢰성이 갈린다.
- controlled input, contenteditable, 마스킹 입력, keydown 의존 로직을 안정적으로 다루려면 CDP 텍스트 입력 경로가 필요하다.
- 관련 원본: [`[통합됨] 15-main-followups-2026-03-30.md`]([통합됨] 15-main-followups-2026-03-30.md)

### 2. bootstrap 조건을 `data-agrune-*` 전반으로 확장

- 현재는 `[data-agrune-action]`이 있어야 runtime이 뜨지만, 실제 기능은 `group`, `canvas`, `meta`에도 걸쳐 있다.
- 이 항목은 전략이 아니라 단순 버그 수정 성격에 가깝다.
- 관련 원본: [`[통합됨] 15-main-followups-2026-03-30.md`]([통합됨] 15-main-followups-2026-03-30.md)

### 3. self-healing 보강

- sender loss 시 pending command 즉시 실패 처리, extension reload 이후 재동기화, native host 재연결 직후 resync가 핵심이다.
- 현재 warm-up/resync는 들어갔지만, 연결 손실 처리 전체가 닫힌 상태는 아니다.
- 관련 원본: [`[통합됨] 15-main-followups-2026-03-30.md`]([통합됨] 15-main-followups-2026-03-30.md)

### 4. active session 선택과 포커스 정책

- 기본 탭 선택, 세션 선택기, 포커스 전환은 서로 다른 문서에 흩어져 있지만 실제로는 같은 사용자 경험 축이다.
- 지금 기준으로는 `기본 탭 선택 개선`, `확장프로그램 개선 아이디어`, `main 기준 후속 작업`을 하나의 작업 묶음으로 보는 편이 맞다.
- 관련 원본: [`[통합됨] 2-tab-selection-todo.md`]([통합됨] 2-tab-selection-todo.md), [`[통합됨] 4-extension-improvement-ideas.md`]([통합됨] 4-extension-improvement-ideas.md), [`[통합됨] 15-main-followups-2026-03-30.md`]([통합됨] 15-main-followups-2026-03-30.md)

## 대기 중인 작업

### 1. 기본 탭 선택 개선

- 기본 선택 우선순위를 `snapshot 존재 -> 최근 상호작용 -> 명시 선택`으로 재정리해야 한다.
- 관련 원본: [`[통합됨] 2-tab-selection-todo.md`]([통합됨] 2-tab-selection-todo.md)

### 2. 모달/오버레이 E2E 고정

- overlay flow 자체의 런타임 테스트는 어느 정도 있지만, 문서가 요구하는 E2E 형태의 고정 검증은 아직 별도 작업이다.
- 관련 원본: [`[통합됨] 3-overlay-e2e-todo.md`]([통합됨] 3-overlay-e2e-todo.md)

### 3. 확장프로그램 업데이트 UX

- 개발 환경에서는 reload 중심 흐름, 상용 환경에서는 자동 업데이트와 버전 스큐 허용 전략이 필요하다.
- 관련 원본: [`[통합됨] 5-extension-update-ux-todo.md`]([통합됨] 5-extension-update-ux-todo.md)

### 4. 어노테이션 검증 패키지

- 빌드 타임 검증 패키지는 아직 아이디어 단계다.
- roadmap의 build linter 축과 연결해서 다시 꺼내는 편이 좋다.
- 관련 원본: [`[통합됨] 8-annotation-validation-package.md`]([통합됨] 8-annotation-validation-package.md), [`[통합됨] 14-roadmap-ideas.md`]([통합됨] 14-roadmap-ideas.md)

### 5. 범용 캔버스 지원 전략

- 지금 구현은 “어노테이션된 캔버스/React Flow 계열 조작”에 가깝고, 범용 Canvas/WebGL 인지는 아직 아니다.
- 스크린샷 기반 비전, 구조화된 메타데이터, 접근성 트리 중 어떤 축을 기본으로 할지 결정이 필요하다.
- 관련 원본: [`[통합됨] 13-canvas-support-strategy.md`]([통합됨] 13-canvas-support-strategy.md)

### 6. QA 테스트 시트 자동 생성

- 어노테이션에 관계 정보를 추가하지 않고, AI 탐색(1회) → `flows.json` → 마크다운 테스트 시트 + 실행 시나리오 JSON을 디터미니스틱하게 생성하는 3-phase 파이프라인이다.
- Phase A(Explore): 스냅샷 before/after diff로 요소 간 관계 발견. Phase B(Generate): flows.json 그래프 순회로 시나리오 체인 빌드. Phase C(Run): 시나리오 실행 + expect 검증 + 리포트.
- 신규 `@agrune/qa` 패키지 + MCP 도구 3종(`agrune_qa_explore`, `agrune_qa_generate`, `agrune_qa_run`).
- CLI 커맨드는 만들지 않는다 (CLI 폐기됨, CI 연동이 필요할 때 재검토).
- 스펙: [`2026-04-02-qa-test-sheet-design.md`](../superpowers/specs/2026-04-02-qa-test-sheet-design.md)
- 플랜: [`2026-04-02-qa-test-sheet.md`](../superpowers/plans/2026-04-02-qa-test-sheet.md)

### 7. 디버깅 앱 — 에이전트 개입 기능 (CDP Quick Mode 후속)

- DevTools 패널을 별도 앱으로 빼면, 유저가 에이전트의 다음 step을 강제 지정할 수 있다.
- CDP 세션에 여러 클라이언트가 동시 attach 가능하므로, 디버깅 앱이 스냅샷 구독 + 명령 주입으로 human-in-the-loop 제어를 제공.
- CDP Quick Mode 인프라(`Runtime.addBinding` 양방향 채널)가 선행 조건.

## 전략 및 중장기 문서

### 1. 확장프로그램 개선 아이디어

- 타깃 인스펙터는 구현이 들어갔지만, 포커스 전환, 세션 선택기, 명령 로그는 여전히 후보군이다.
- 따라서 이 문서는 “완료”보다 “부분 반영된 아이디어 백로그”로 보는 편이 정확하다.
- 관련 원본: [`[통합됨] 4-extension-improvement-ideas.md`]([통합됨] 4-extension-improvement-ideas.md)

### 2. 제품 로드맵

- capture, focus, system interaction, draw, build linter, QA skill, CI, 외부 사이트 확장까지 상위 방향을 담고 있다.
- 일부는 이미 개별 spec로 파생됐고, 일부는 아직 아이디어 수준이다.
- 관련 원본: [`[통합됨] 14-roadmap-ideas.md`]([통합됨] 14-roadmap-ideas.md)

### 3. CDP quick mode + Extension 확장

- ~~전략 단계~~ → **최우선 작업으로 승격** (위의 "현재 기준 최우선 작업 > 0" 참조).
- 원래 문서는 quick mode 단일 경로를 다뤘지만, 현재 방향은 Quick Mode(CDP-only launch) + Extension Mode(사이드패널 채팅 + 에이전트 허브)의 **이중 진입 구조**다.
- 관련 원본: [`[통합됨] 16-cdp-quick-mode-option.md`]([통합됨] 16-cdp-quick-mode-option.md)

## 문서 관계

- `10 -> 11 -> 12`
  캔버스 포인터 문제 인식에서 시작해 CDP 마이그레이션 이슈 정리, 최종 closure로 이어진다.
- `2 + 4 + 15`
  active session 선택, 포커스 정책, 확장 UX는 사실상 하나의 사용성 작업 묶음이다.
- `5 + 6 + 7`
  설치, 업데이트, 릴리스는 각각 별도 문서지만 운영 경험 관점에서는 하나의 lifecycle이다.
- `8 + 14`
  어노테이션 검증 패키지는 roadmap의 build linter 축으로 다시 연결된다.
- `13 + 14 + 16`
  캔버스 일반화, 제품 로드맵, quick mode 전략은 모두 “agrune이 어디까지 자동화 범위를 넓힐 것인가”라는 큰 축에서 만난다.
- `16 → QA`
  CDP quick mode가 선행되어야 QA Phase A(explore)·Phase C(run)가 headless/CI에서 동작한다. quick mode 없이도 extension 경유로 Phase B(generate)는 가능하지만, 자동화 파이프라인의 완성은 quick mode에 의존한다.
- `14 + QA`
  QA 테스트 시트 자동 생성은 roadmap의 QA skill 축에서 파생된 첫 구체 구현이다.

## 앞으로의 문서 운영 규칙 제안

- 현재 상태나 우선순위 변경은 먼저 이 문서에 반영한다.
- 개별 note는 배경 맥락, 설계 당시 판단, 세부 TODO를 보존하는 용도로 유지한다.
- 새 note를 만들면 이 문서의 `현재 상태 한눈에 보기`와 `문서 관계`도 함께 갱신한다.

## 원본 노트 목록

- 완료: [`[통합됨] 1-mcp-warmup-resync-todo.md`]([통합됨] 1-mcp-warmup-resync-todo.md)
- 미착수: [`[통합됨] 2-tab-selection-todo.md`]([통합됨] 2-tab-selection-todo.md)
- 미착수: [`[통합됨] 3-overlay-e2e-todo.md`]([통합됨] 3-overlay-e2e-todo.md)
- 부분 반영: [`[통합됨] 4-extension-improvement-ideas.md`]([통합됨] 4-extension-improvement-ideas.md)
- 미착수: [`[통합됨] 5-extension-update-ux-todo.md`]([통합됨] 5-extension-update-ux-todo.md)
- 폐기: [`[통합됨] 6-installer-cli-plan.md`]([통합됨] 6-installer-cli-plan.md)
- 완료: [`[통합됨] 7-release-pipeline-todo.md`]([통합됨] 7-release-pipeline-todo.md)
- 미착수: [`[통합됨] 8-annotation-validation-package.md`]([통합됨] 8-annotation-validation-package.md)
- 완료: [`[통합됨] 9-multi-action-support.md`]([통합됨] 9-multi-action-support.md)
- 완료: [`[통합됨] 10-canvas-pointer-cdp.md`]([통합됨] 10-canvas-pointer-cdp.md)
- 완료: [`[통합됨] 11-cdp-migration-issues.md`]([통합됨] 11-cdp-migration-issues.md)
- 완료: [`[통합됨] 12-cdp-remaining-tasks.md`]([통합됨] 12-cdp-remaining-tasks.md)
- 미착수: [`[통합됨] 13-canvas-support-strategy.md`]([통합됨] 13-canvas-support-strategy.md)
- 진행중: [`[통합됨] 14-roadmap-ideas.md`]([통합됨] 14-roadmap-ideas.md)
- 진행중: [`[통합됨] 15-main-followups-2026-03-30.md`]([통합됨] 15-main-followups-2026-03-30.md)
- **최우선**: [`[통합됨] 16-cdp-quick-mode-option.md`]([통합됨] 16-cdp-quick-mode-option.md)
