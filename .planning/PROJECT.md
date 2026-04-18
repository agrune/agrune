# agrune

## Current State

✅ **Shipped: v1.0 Research** (2026-04-18) — [MILESTONES.md](MILESTONES.md)

v1.0은 desktop 확장 가능성 연구 사이클로 완료. 결론: `browser precision 유지 + AX-first hybrid expansion GO`.

v1.0 종료 직후 브라우저 본체에서 **CDP-only 단일 아키텍처 피봇**이 단행됨 (2026-04-15 주변, commits `213aca9`/`37d9257`/`98fde6f`/`f9d3801`): extension mode·native messaging·backend daemon 제거, devtools는 standalone 웹 앱으로 전환. 현 코드베이스는 이 피봇 결과 상태이며 아래 "Validated" 섹션의 아키텍처 진술은 그 현실 기준으로 갱신됨.

## Current Milestone: v1.1 Browser Completion

**Goal:** CDP-only 피봇 이후 브라우저 본체의 입력 신뢰성·복구력·다중 탭 UX·devtools 웹앱을 닫아 프로덕션 품질로 끌어올린다.

**Target features:**
- **입력 신뢰성** — `fill` CDP 통일 (controlled input·contenteditable·masking 처리)
- **안정성·복구력** — Self-healing (CDP 연결 손실 감지·재연결, Chrome crash 자동 복구, resync 자동화)
- **다중 탭·세션 UX** — Active session 개념 도입, 최근 상호작용 추적, 포커스 전환 (`agrune_focus` 스펙 연결)
- **DevTools 웹앱 완성** — 명령 로그, HITL step 제어, 실패 진단 UI, 세션 선택 UX
- **품질 인프라** — Overlay/modal E2E 프레임 (Playwright 도입), Annotation build-linter (`docs/superpowers/specs/2026-03-29-build-linter-design.md` 스펙 실행)
- **문서·배포 정리** — `agrune/README.md`·`agrune/AGENTS.md`·`docs/notes/`·`docs/improvement-notes.md`에서 extension mode 잔재 제거, `.github/profile/README.md` (조직 프로필) CDP-only 메시지로 재작성, CLI UX 다듬기(`agrune`/`--headless`/`--attach`/`--port`), automation profile import/복제 UX

**Key context:**
- v1.0의 macOS AX-first hybrid 권고는 v1.2+ 로 연기 (2026-04-18 사용자 결정)
- Extension mode·native messaging·backend daemon 재도입 금지
- QA 자동 시트, `agrune_capture/draw/system-interaction`, 범용 캔버스는 v1.1 스코프 밖 (v1.2+)
- Phase 번호는 5번부터 시작 (v1.0이 1-4번 소진)
- Phase/plan/requirement 단위는 `/gsd-new-milestone` 현재 실행 중에 확정

## What This Is

agrune는 AI 에이전트가 어노테이션된 웹 앱을 **CDP(Chrome DevTools Protocol)** 로 직접 조작할 수 있게 해주는 로컬 우선 브라우저 자동화 플랫폼이다. 핵심 배포물은 `@agrune/mcp` 서버이며, Claude Code·Codex 같은 MCP 하네스가 stdio로 실행해 사용한다. 단일 진입 경로: `agrune` CLI가 Chrome을 launch/attach/headless로 띄우고, 사람용 devtools UI는 MCP 서버가 함께 띄우는 standalone 웹앱(`http://localhost:PORT/devtools`)으로 제공된다.

## Core Value

AI 에이전트가 의미를 이해할 수 있는 제어 표면(`data-agrune-*` 어노테이션 기반 target/group/canvas/meta)을 통해 웹 앱을 로컬·결정적·검증 가능하게 자동화한다.

## Requirements

### Validated

- ✓ AI 에이전트가 annotated web app을 MCP를 통해 제어할 수 있다 — `@agrune/mcp` 10 도구 (`agrune_sessions/snapshot/act/fill/drag/pointer/wait/guide/read/config`)
- ✓ 브라우저 연결은 **CDP-only** — `CdpDriver`가 `BrowserDriver` 단일 구현체로 launch/attach/headless 모드 지원 (2026-04-15 피봇 이후)
- ✓ DevTools UI는 standalone 웹앱 — `@agrune/devtools`가 Vite 빌드 산출물이고 `@agrune/mcp` 서버가 HTTP/WebSocket으로 서빙
- ✓ 페이지 런타임 공용화 — `@agrune/runtime`이 dom-scanner, manifest-builder, page-runtime을 제공하고 CDP `addScriptToEvaluateOnNewDocument` + `Runtime.evaluate`로 주입
- ✓ Bootstrap 조건 — `data-agrune-action/group/canvas/meta` 중 하나라도 있으면 런타임 부팅 (`cdp-runtime-injector.ts:43-48`)
- ✓ annotation authoring workflow — `workflows/annotate/WORKFLOW.md`가 하네스 중립 워크플로 원본
- ✓ macOS-first OS-level agrune의 어노테이션 방법 보고서(3가지 직접 방식) — v1.0
- ✓ macOS-first OS-level agrune의 어노테이션 대체 방법 보고서(3가지 비-어노테이션 방식) — v1.0
- ✓ 6개 케이스를 기술/제품/리스크/권한/성능/UX 관점으로 비교한 synthesis — v1.0
- ✓ 브라우저+로컬 unified control surface 확장 가능성 판단 기준 — v1.0 (AX-first hybrid GO, 실행은 v1.2+ 로 연기)
- ✓ 개발자 모드 셋업 + 쉬운 사용 경험이라는 목표의 현실성 평가 — v1.0 (조건부 가능)

### Active

(v1.1 requirements는 현재 `/gsd-new-milestone` 실행 중에 정의 예정. 아래는 코드 실측 + 사용자 방향으로 잡힌 후보 카테고리)

- 입력 신뢰성 — `fill` CDP 통일, controlled input·contenteditable·masking 처리
- 안정성·복구력 — self-healing(sender loss, CDP 연결 손실, Chrome crash, native reconnect resync)
- 다중 탭·세션 UX — active session 개념, 최근 상호작용 추적, 포커스 전환
- DevTools 웹앱 — 명령 로그, 실패 진단, HITL step 제어
- 품질 인프라 — Overlay E2E, build-linter
- 문서·배포 정리 — 구형 표현 제거, CLI·profile UX

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
*Last updated: 2026-04-18 — 이전 폴더 이동, CDP-only 피봇 반영, v1.1 브라우저 본체 완성 방향 확정*
