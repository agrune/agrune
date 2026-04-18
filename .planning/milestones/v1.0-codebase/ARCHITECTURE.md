# Architecture

**Analysis Date:** 2026-04-07

## Pattern Overview

**Overall:** 로컬 우선 브라우저 자동화 모노레포 + 보조 저장소 묶음

**Key Characteristics:**
- semantic annotation 기반 브라우저 제어
- 동일한 MCP 표면 아래 extension mode와 CDP quick mode를 공존시킴
- page runtime, browser transport, MCP server를 패키지 단위로 분리
- 제품 저장소 외에 demo, skills, org-profile 레이어를 별도 저장소로 병행 운영

## Layers

**Contract Layer (`@agrune/core`):**
- Purpose: 공용 타입, 명령 결과 shape, `BrowserDriver` 인터페이스 정의
- Contains: `PageSnapshot`, `CommandResult`, runtime config, manifest types
- Depends on: 외부 런타임 의존성 없음
- Used by: `runtime`, `browser`, `mcp`, `extension`, `devtools`

**Page Runtime Layer (`@agrune/runtime`):**
- Purpose: 페이지에 주입되어 어노테이션 스캔, snapshot 생성, act/fill/drag/read 수행
- Contains: `page-agent-runtime`, `snapshot`, `command-handlers`, cursor/aurora visual layer
- Depends on: `@agrune/core`
- Used by: `@agrune/browser`, `@agrune/extension`

**Browser Transport Layer (`@agrune/browser`):**
- Purpose: 브라우저 세션 추적과 runtime 주입을 transport별로 추상화
- Contains: `ExtensionDriver`, `CdpDriver`, `SessionManager`, `CommandQueue`, native messaging, CDP helpers
- Depends on: `@agrune/core`, `@agrune/runtime`
- Used by: `@agrune/mcp`, `@agrune/devtools`, `@agrune/extension`

**Protocol Layer (`@agrune/mcp`):**
- Purpose: AI agent가 보는 canonical MCP 표면 제공
- Contains: MCP tool registration, public shape conversion, backend/native-host daemon entry
- Depends on: `@agrune/browser`, `@agrune/core`
- Used by: Codex, Claude Code, 기타 MCP 하네스

**Extension Shell Layer (`@agrune/extension`, `@agrune/devtools`):**
- Purpose: Chrome MV3 shell, background router, content bootstrap, popup/devtools UI
- Contains: service worker, content bridge, manifest sync, devtools panel
- Depends on: `@agrune/browser`, `@agrune/runtime`, `@agrune/core`, `@agrune/devtools`
- Used by: extension mode 사용자와 개발자 디버깅 흐름

**Adapter / Fixture Layer (`skills`, `demo`):**
- Purpose: 제품 사용 경험을 감싸는 plugin/skill, 검증용 annotated demo 앱
- Contains: `/agrune:*` skill wrappers, React fixture UI, annotation lint
- Depends on: 제품 개념과 MCP 실행물
- Used by: 온보딩, 수동 검증, annotation benchmark

## Data Flow

**Extension Mode Request Flow:**
1. AI agent가 MCP 도구 호출
2. `agrune/packages/mcp/src/index.ts`가 tool args를 `BrowserDriver` 명령으로 변환
3. `agrune/packages/mcp/bin/agrune-mcp.ts` backend/native-host 레이어가 로컬 브리지 유지
4. `ExtensionDriver`가 native message를 extension background로 전달
5. `service-worker.ts` / `message-router.ts`가 target tab content script로 브로드캐스트
6. content script가 injected page runtime에 command/snapshot 요청
7. page runtime이 DOM/annotation 기준으로 결과를 생성해 역방향으로 반환

**CDP Quick Mode Flow:**
1. MCP server가 `CdpDriver`로 Chrome launch/attach
2. `CdpTargetManager`가 page target을 추적
3. `CdpRuntimeInjector`가 `@agrune/runtime` 번들을 페이지에 주입
4. `Runtime.addBinding` 기반 메시지 채널로 snapshot/result 전달
5. MCP는 동일한 tool 인터페이스를 유지한 채 결과를 반환

**Annotation Authoring Flow:**
1. 앱 소스에 `data-agrune-*` 속성을 선언
2. content/runtime scanner가 target/group metadata를 수집
3. manifest/snapshot이 semantic target list로 정규화
4. AI는 selector 대신 `targetId`, `groupId`, `actionKinds` 중심으로 상호작용

**State Management:**
- 브라우저 상태: `SessionManager` in-memory cache
- 시각 효과 상태: runtime queue + cursor/aurora animator
- 로컬 설치 상태: `~/.agrune/`
- 데모 상태: `localStorage`

## Key Abstractions

**BrowserDriver:**
- Purpose: extension mode와 quick mode를 같은 서버 인터페이스로 묶음
- Examples: `ExtensionDriver`, `CdpDriver`
- Pattern: transport abstraction

**PageSnapshot / PageTarget:**
- Purpose: AI가 소비하는 현재 화면 semantic model
- Examples: `PageSnapshot`, `PageSnapshotGroup`, `PageTarget`
- Pattern: normalized read model

**PageAgentRuntime:**
- Purpose: 페이지 안에서 명령 실행과 snapshot 재계산을 담당
- Examples: `createPageAgentRuntime`, `handleAct`, `handleRead`
- Pattern: injected stateful runtime

**ActivityBlockStack:**
- Purpose: pointer/aurora visual effect의 busy lifecycle 관리
- Examples: `browser/src/activity-tracker.ts`
- Pattern: guard + tail lease

## Entry Points

**CLI / Server:**
- `agrune/packages/mcp/bin/agrune-mcp.ts` - native host, backend daemon, quick mode 진입점
- `agrune/packages/mcp/src/index.ts` - MCP server factory

**Extension:**
- `agrune/packages/extension/src/background/service-worker.ts` - background bootstrap
- `agrune/packages/extension/src/content/index.ts` - content bootstrap

**Runtime:**
- `agrune/packages/runtime/src/page-runtime.ts` - page runtime public entry

**Demo / Fixtures:**
- `demo/src/main.tsx` - React entry
- `demo/src/App.tsx` - fixture workspace composition

## Error Handling

**Strategy:** 예외보다 구조화된 command result와 준비 단계 게이트를 우선 사용

**Patterns:**
- MCP 진입 시 `ensureReady()`로 연결 상태 검증
- 런타임 명령 실패는 `createCommandError()` 코드와 함께 반환
- extension background는 팝업 미오픈, content script 미연결 같은 예상 실패를 경고 없이 흡수
- daemon/native-host 계층은 stderr 로그로 상태를 남김

## Cross-Cutting Concerns

**Visual Feedback:**
- pointer animation, aurora glow, highlight overlay

**Semantic Scanning:**
- live DOM scan + explicit annotation manifest merge

**Documentation-Driven Design:**
- `agrune/docs/superpowers/specs/*`, `agrune/docs/superpowers/plans/*`, `CLAUDE.md`

**Distribution Split:**
- canonical runtime은 `@agrune/mcp`
- harness wrapper는 `skills/`
- validation fixture는 `demo/`

---

*Architecture analysis: 2026-04-07*
*Update when transport layers, package boundaries, or entry flows change*
