# agrune

## Current State

🚧 **Active: v0.5 Manifest Pivot** (kicked off 2026-04-19, branch `feat/v0.5-manifest`)

v1.1 Browser Completion (shipped 2026-04-18)까지 inline `data-agrune-*` 어노테이션 기반 아키텍처로 브라우저 본체 완성. v0.5부터 **manifest 기반 외부 매핑 + root-import 프레임워크 통합**으로 아키텍처 피봇. macOS AX 확장은 다음 milestone(v0.6+)으로 연기.

내부 milestone 번호는 semver와 정렬을 위해 v0.5부터 재시작 (실제 npm 버전 0.4.1 기준). v1.x 명명은 공식 출시 전까지 사용하지 않음.

## Current Milestone: v0.5 Manifest Pivot

**Goal:** inline `data-agrune-*` 어노테이션을 완전 폐기하고, 외부 manifest + root-import 기반 프레임워크 통합으로 아키텍처 피봇. 외부 유명 사이트 자동화와 내부 타팀 코드에 대한 비침습 자동화를 같은 메커니즘으로 제공.

**Target features:**
- `@agrune/manifest` SDK — 타입 안전 authoring (`defineManifest`/`defineTarget`/`defineRepeat`/`defineMacro`)
- `@agrune/react` 패키지 — root-import (`<AgruneDevtools />`) + React fiber 기반 component-identity selector, prod 옵션
- Runtime 확장 — manifest loader, dual selector resolution (fiber/CSS), repeat primitive, macro runner, sensitive masking, route scoping
- AI authoring skill (manifest 버전) — root-import 기반 in-app recorder
- CLI — `agrune manifest dev/validate/submit`, `agrune maps add/types`
- Registry — `github.com/agrune/maps` 시작 (혼자 유지 → 검증 관리자 채용 → 다중 review)
- DevTools 웹앱 — recorder 오버레이 통합

**Key context:**
- **inline annotation 완전 폐기** — v1.1 유저 없어 migration 불필요, `data-agrune-*` 스캔 경로 runtime에서 제거
- **Root-import 필수** — owned 프로젝트는 1줄 추가 (per-element 수정 0). 외부 사이트(root-import 불가)는 CSS selector fallback
- **Prod 동작 옵션** — devtools/recorder는 dev-only, runtime loader는 prod 번들 포함 옵션
- **Macro 포함** — `defineMacro`로 복합 플로우 패키징 (로그인 등)
- **Sensitive 플래그** — manifest schema + AI auto-detect + 런타임 마스킹
- **용어 전환** — "annotation" → "target mapping" 중심. 기존 "annotation" 문서/코드는 정리
- **브랜치** `feat/v0.5-manifest` — 폐기 가능성 대비 main 격리 (acceptable to scrap and restart)

## What This Is

agrune는 AI 에이전트가 어노테이션된 웹 앱을 **CDP(Chrome DevTools Protocol)** 로 직접 조작할 수 있게 해주는 로컬 우선 브라우저 자동화 플랫폼이다. 핵심 배포물은 `@agrune/mcp` 서버이며, Claude Code·Codex 같은 MCP 하네스가 stdio로 실행해 사용한다. 단일 진입 경로: `agrune` CLI가 Chrome을 launch/attach/headless로 띄우고, 사람용 devtools UI는 MCP 서버가 함께 띄우는 standalone 웹앱(`http://localhost:PORT/devtools`)으로 제공된다.

## Core Value

AI 에이전트가 의미를 이해할 수 있는 제어 표면(`data-agrune-*` 어노테이션 기반 target/group/canvas/meta)을 통해 웹 앱을 로컬·결정적·검증 가능하게 자동화한다.

## Requirements

### Validated

- ✓ AI 에이전트가 annotated web app을 MCP를 통해 제어할 수 있다 — `@agrune/mcp` 11 도구 (`agrune_sessions/snapshot/act/fill/drag/pointer/wait/guide/read/config/focus`) — v1.1
- ✓ 브라우저 연결은 **CDP-only** — `CdpDriver`가 `BrowserDriver` 단일 구현체로 launch/attach/headless 모드 지원 (2026-04-15 피봇 이후)
- ✓ DevTools UI는 standalone 웹앱 — `@agrune/devtools`가 Vite 빌드 산출물이고 `@agrune/mcp` 서버가 HTTP/WebSocket으로 서빙
- ✓ 페이지 런타임 공용화 — `@agrune/runtime`이 dom-scanner, manifest-builder, page-runtime을 제공하고 CDP `addScriptToEvaluateOnNewDocument` + `Runtime.evaluate`로 주입
- ✓ Bootstrap 조건 — `data-agrune-action/group/canvas/meta` 중 하나라도 있으면 런타임 부팅
- ✓ annotation authoring workflow — `workflows/annotate/WORKFLOW.md`가 하네스 중립 워크플로 원본
- ✓ macOS-first OS-level agrune의 어노테이션 방법 보고서(3가지 직접 방식) — v1.0
- ✓ macOS-first OS-level agrune의 어노테이션 대체 방법 보고서(3가지 비-어노테이션 방식) — v1.0
- ✓ 6개 케이스를 기술/제품/리스크/권한/성능/UX 관점으로 비교한 synthesis — v1.0
- ✓ 브라우저+로컬 unified control surface 확장 가능성 판단 기준 — v1.0 (AX-first hybrid GO, 실행은 v1.2+ 로 연기)
- ✓ 개발자 모드 셋업 + 쉬운 사용 경험이라는 목표의 현실성 평가 — v1.0 (조건부 가능)
- ✓ 입력 신뢰성: `agrune_fill`이 CDP Input 도메인으로 controlled input·contenteditable·masked input 처리 — v1.1 (INPUT-01..04)
- ✓ 안정성·복구력: CDP 연결 손실·Chrome crash 자동 복구 + resync + 에러 코드·가이드 — v1.1 (HEAL-01..04)
- ✓ 다중 탭·세션 UX: active session 추적 + `agrune_focus` + session meta in responses — v1.1 (SESS-01..04)
- ✓ DevTools 웹앱: 명령 로그·HITL pause/resume/step/skip·실패 진단·세션 선택 UX — v1.1 (DEVT-01..04, SESS-04)
- ✓ 품질 인프라: Playwright E2E + annotation build-linter가 CI에서 블록 조건 — v1.1 (QUAL-01..03)
- ✓ 문서·배포 정리: README·AGENTS·CLI `--help`·automation profile UX·조직 프로필 재작성 — v1.1 (DOCS-01..04, DOCS-02는 외부 repo push 대기)

### Active

(v0.5 milestone — details in REQUIREMENTS.md after definition)

- Manifest 포맷 표준화 + `@agrune/manifest` SDK (`defineManifest`/`defineTarget`/`defineRepeat`/`defineMacro`)
- `@agrune/react` root-import 패키지 (component-identity selector via React fiber)
- Runtime manifest loader + dual selector resolution (fiber/CSS) + repeat/macro/sensitive
- AI authoring skill 재작성 (manifest 버전 + in-app recorder)
- CLI `agrune manifest {dev,validate,submit}` + `agrune maps {add,types}`
- Registry 초기 세팅 (`github.com/agrune/maps`)
- DevTools 웹앱 recorder 오버레이

### Carrying forward (v0.6+)

- macOS AX-first hybrid 데스크톱 확장 프로토타입 (v1.0 GO 권고, v1.1·v0.5에서 연기)
- `docs/superpowers/specs/` 미실행 스펙 (capture/draw/system-interaction/qa-test-sheet)
- Live-browser relaunch-and-reconnect E2E 실제 시나리오
- Masked-input heuristic 확대

### Out of Scope

- **macOS/AX 데스크톱 확장 (v1.1 한정)** — v1.0이 GO 권고했으나 브라우저 본체 완성 우선, v1.2+ 로 연기 (2026-04-18)
- Windows/Linux 지원 — 당분간 macOS 우선 유지
- Universal direct annotation 전략 — v1.0에서 NO-GO 판정
- Vision-first positioning — v1.0에서 NO-GO 판정
- Extension mode / native messaging / backend daemon — 2026-04-15 피봇으로 완전 제거, 재도입 계획 없음
- 사이드패널 채팅 UI / 에이전트 허브 — 확장 제거와 함께 폐기된 방향
- 클라우드 기반 기본 OCR/비전 파이프라인 — 로컬 우선/개인정보 원칙과 충돌

## Context

현재 GSD 워크스페이스는 `/Users/chenjing/dev/agrune/agrune/` 안에 위치 (2026-04-18 이동). 상위 `/Users/chenjing/dev/agrune/`는 `agrune`·`demo`·`skills`·`.github/profile`을 함께 두기 위한 **개념적 묶음 폴더**이며 버전 관리 대상이 아님.

코드베이스는 **6개 디렉터리 중 5개 활성 패키지**:

| 패키지 | 역할 |
|---|---|
| `@agrune/core` | 공유 타입, `BrowserDriver` 인터페이스, 에러 코드, 런타임 설정 |
| `@agrune/runtime` | page runtime, dom-scanner, manifest-builder |
| `@agrune/browser` | `CdpDriver`, `ChromeLauncher`, `CdpConnection`, `CdpTargetManager`, `SessionManager`, `CdpRuntimeInjector` |
| `@agrune/mcp` | stdio MCP 서버 + devtools HTTP/WebSocket 서버 + `agrune`/`agrune-mcp` CLI |
| `@agrune/devtools` | Vite 빌드 standalone 웹앱 (스냅샷 뷰어, 세션 선택, pause/resume) |
| ~~`@agrune/extension`~~ | dist 아카이브만 남음. 소스 제거됨, CI 배포 비활성. 재활성 계획 없음. |

**v1.0에서 이월된 tech debt (v1.2+ 로 연기):**
- 지원 앱 품질 compatibility matrix 실측
- manual profile UX / vision fallback confidence UX 설계

**v1.1에서 해결할 코드 괴리 이슈:**
- README·`/Users/chenjing/dev/agrune/CLAUDE.md`·`docs/notes/` 일부에 extension mode 잔재 표현
- `docs/superpowers/specs/`에 plan 없는 설계 6개 (capture/draw/focus/build-linter/system-interaction/qa-test-sheet) — v1.1/v1.2 후보

## Constraints

- **Architecture**: CDP-only 단일 경로 유지. ExtensionDriver·native messaging 재도입 금지
- **Platform**: 브라우저 먼저 완성, 데스크톱 확장은 v1.2+. 궁극적으로는 macOS 우선 (이는 v1.0 결정이며 해당 시점에 재적용)
- **Audience**: 일반 사용자 대상 — 설치가 까다로워도 실제 사용 경험은 단순해야 함. `agrune` CLI 한 줄로 시작 가능한 경험을 지킴
- **Distribution**: MCP 서버 + annotate workflow가 제품 본체. 하네스(Claude Code, Codex 등)는 얇은 어댑터
- **Privacy**: 로컬 우선 — 클라우드 기반 기본 파이프라인 배제
- **Git**: `.planning/`은 이제 `agrune/agrune` 리포지토리 안에 위치 (gitignored 아님). milestone close 시 git 안전망 작동

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| macOS를 첫 연구 플랫폼으로 삼는다 | 데스크톱 확장 가능성을 가장 빠르게 검증하기 위한 우선순위 | 2026-04-07 — ✓ v1.0 결정 유효 |
| v1.0 사이클의 목표는 구현이 아니라 연구 보고서 | 먼저 feasibility와 product fit을 확인한 뒤 implementation 투자 여부를 판단 | 2026-04-07 — ✓ v1.0 연구 완료 |
| 연구 결과는 일반 사용자 이용 가능성까지 판단한다 | 개발자 전용 실험이 아니라 실제 제품 방향성을 검토하기 위해 | 2026-04-07 — ✓ 조건부 가능 판정 |
| browser precision 유지 + AX-first hybrid 확장 | universal direct annotation과 vision-first는 제품 약속 대비 신뢰도/권한 비용이 너무 크다 | 2026-04-07 — ✓ GO 권고 확정 (실행은 v1.2+) |
| Universal direct annotation NO-GO | macOS 앱 전반의 annotation injection은 권한/보안/유지보수 비용 대비 커버리지가 제한적 | 2026-04-07 — ✓ v1.0 synthesis |
| Vision-first positioning NO-GO | deterministic 보장과 confidence UX 부담, 로컬 성능 리스크 | 2026-04-07 — ✓ v1.0 synthesis |
| **Extension mode 완전 제거, CDP-only로 단순화** | 두 모드 유지 비용 대비 extension 특유 장점(사이드패널·세션 선택기·명령 로그)이 대부분 미구현 상태였고, Quick Mode 구현 이후 extension이 감당하던 브라우저 연결·DOM 스캔·manifest 생성이 모두 CDP로 이전 가능함이 확인됨 | 2026-04-15 — ✓ 완료 (commits `37d9257`, `98fde6f`, `213aca9`) |
| **DevTools는 standalone 웹앱으로 이전** | extension panel 의존이 사라짐에 따라 devtools UI를 확장 밖으로 빼내야 했고, 동시에 headless·서버 자동화 환경에서도 사람용 검사 UI를 띄울 수 있게 됨 | 2026-04-15 — ✓ 완료 (commits `f9d3801`, `2700c70`, `c89d4c6`) |
| **v1.1은 브라우저 본체 완성에 집중, macOS 확장은 v1.2+** | CDP-only 피봇 직후 입력 신뢰성·복구력·다중 탭 UX·devtools 웹앱이 미완이며, 프로토타입 이전에 브라우저 고정 축을 먼저 닫기로 함 | 2026-04-18 — ✓ 확정 (사용자 방향) |
| **`.planning/`을 agrune 모노레포 안으로 이동** | 상위 폴더는 개념 묶음이라 git 안전망이 없었음. agrune 리포 안으로 옮기면 milestone 커밋 안전망 작동 | 2026-04-18 — ✓ 완료 |
| **Fill 경로를 DOM setter에서 CDP Input 도메인으로 통일** | React/Vue/Angular controlled input·contenteditable·masked input에서 DOM setter 경로가 실패. CDP `Input.insertText`/`dispatchKeyEvent`는 브라우저 네이티브 입력으로 프레임워크 관점에서는 실제 키보드와 동일 | 2026-04-18 — ✓ v1.1 INPUT-01..04 출하 |
| **Self-healing을 `RecoverySupervisor`로 분리** | connection loss·crash 두 이벤트 소스를 driver에 산재시키지 않고 supervisor가 state machine(backoff, dedupe, timeout)로 관리. `execute()`가 `waitForRecovery()` 후 dispatch | 2026-04-18 — ✓ v1.1 HEAL-01..04 출하 |
| **Active session precedence: explicit > active > first-ready > first** | "첫 세션" 기준의 엉뚱한 탭 조작 문제를 해결. 모든 성공한 실행이 `touchSession`을 호출해 last-interaction tab이 active가 됨 | 2026-04-18 — ✓ v1.1 SESS-01..03 출하 |
| **DevTools 웹앱을 CommandBroker + HitlController 기반으로 확장** | 기존 snapshot viewer만으로는 세션 관찰 불가. `CommandBroker`가 모든 도구 호출을 event-stream으로 broadcast하고 `HitlController`가 `handleToolCall`을 gate | 2026-04-18 — ✓ v1.1 DEVT-01..04 출하 |
| **E2E를 Playwright `packages/e2e/`에 분리, CI `e2e` 잡으로 배선** | 단위 테스트만으로는 overlay/modal 실제 동작 검증 불가. `@playwright/test` + 별도 workspace package가 유지보수 비용 최소화 | 2026-04-18 — ✓ v1.1 QUAL-01 출하 |
| **annotation build-linter를 `@agrune/core`에 내장, CLI + Vite plugin 양쪽 제공** | 어노테이션 실수는 런타임까지 가야 드러남. AST-level scan으로 HTML/JSX/TSX에서 missing/duplicate/typo를 빌드 타임에 잡음 | 2026-04-18 — ✓ v1.1 QUAL-02/03 출하 |
| **Inline `data-agrune-*` 어노테이션 완전 폐기, manifest + root-import 기반으로 피봇** | (1) 외부 사이트(YouTube 등)는 소스 접근 불가라 inline 불가능, (2) 내부 타팀 코드에 inline 어노테이션 요청은 PR 검토 비용이 큼, (3) manifest 단일 소스로 통일하면 external·internal 같은 멘탈 모델. Root-import 1줄이 per-element 수정을 대체 (React fiber component-identity selector) | 2026-04-19 — v0.5 킥오프 |
| **Milestone 번호를 semver와 정렬해 v0.5.x로 재시작, v1.x 명명 금지** | 실제 npm 패키지 버전은 0.4.1로 0점대 유지 중. 내부 milestone이 v1.1까지 갔지만 공식 출시 전까지 semver와 맞춰야 배포 혼동 방지 | 2026-04-19 — v0.5 킥오프 |
| **v0.5 브랜치를 main에서 격리 (`feat/v0.5-manifest`)** | 대규모 아키텍처 피봇이라 중간에 폐기·재시작 가능성 열어둠. v1.1 이전 브라우저 코드를 main에서 안정적으로 유지하면서 v0.5 실험 진행 | 2026-04-19 — 브랜치 생성 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-19 — v0.5 Manifest Pivot kickoff (branch `feat/v0.5-manifest`)*
