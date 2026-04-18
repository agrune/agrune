# Coding Conventions

**Analysis Date:** 2026-04-07

## Naming Patterns

**Files:**
- 제품 패키지 모듈은 kebab-case (`session-manager.ts`, `command-handlers.ts`)
- React 컴포넌트는 PascalCase (`App.tsx`, `WorkflowEditor.tsx`, `TaskWizard.tsx`)
- 테스트는 `*.spec.ts`
- package public export는 `src/index.ts` 또는 package-level `src/page-runtime.ts` 같은 진입 파일 사용

**Functions:**
- camelCase 기본
- 이벤트/명령 핸들러는 `handleX` 패턴 (`handleToolCall`, `handleNativeMessage`, `handleAct`)
- 팩토리 함수는 `createX` 패턴 (`createMcpServer`, `createBackgroundMessageRouter`, `createPageAgentRuntime`)

**Variables and Constants:**
- 일반 변수는 camelCase
- 상수는 `UPPER_SNAKE_CASE` (`SNAPSHOT_INTERVAL_MS`, `DOM_SETTLE_TIMEOUT_MS`)
- private 필드는 TS `private readonly`와 이름만으로 구분하며 `_prefix`는 거의 없음

**Types:**
- 인터페이스/타입 alias는 PascalCase
- `I` prefix는 사용하지 않음
- string literal union을 적극 사용 (`ActionKind`, `CommandErrorCode`, `WaitState`)

## Code Style

**Formatting:**
- `agrune/packages/*`는 대체로 single quote + semicolon 생략 스타일
- 들여쓰기는 2 spaces
- public logic 파일에는 구획용 section comments를 자주 사용
- `demo`의 일부 shadcn 계열 UI 파일은 double quote 스타일이 남아 있음 (`demo/src/components/ui/button.tsx`)

**Linting / Static Checks:**
- demo에는 `eslint.config.js`가 존재
- agrune 패키지는 lint보다 `tsc --noEmit` + Vitest + build 검증 비중이 큼
- annotation 품질은 `demo/vite.config.ts`의 `agruneAnnotationLint`로 추가 검증

## Import Organization

**Order:**
1. 외부 패키지
2. workspace alias (`@agrune/*`, `@/*`)
3. 상대 경로

**Grouping:**
- 그룹 사이 빈 줄을 두는 경우가 많음
- `import type`를 적극 사용
- React demo에서는 alias import가 일반적이며 `@/components`, `@/hooks`, `@/lib` 패턴을 사용

## Error Handling

**Patterns:**
- 런타임/드라이버 계층은 throw보다 구조화된 결과 반환을 선호
- 명령 실패는 `createCommandError()`와 `CommandResult`로 표현
- 초기 연결/준비 실패는 `ensureReady()`에서 사용자 문구로 반환
- background/content/popup 통신은 리스너 부재를 예상 실패로 간주하고 조용히 흡수

**Where errors surface:**
- CLI/daemon: `process.stderr.write`
- extension background: `console.warn`
- 테스트: explicit matcher assertions

## Logging

**Framework:**
- 전용 logger 라이브러리 없음
- `console.warn`, `process.stderr.write` 중심

**Patterns:**
- 사용자에게 중요한 브리지 상태는 stderr prefix와 함께 기록 (`[agrune-backend]`, `[agrune native-host]`)
- UI 레이어에서는 팝업 미오픈 같은 정상 상황을 noisy log 없이 무시

## Comments

**When to Comment:**
- 공개 API, lifecycle, tricky DOM/CDP 흐름에 설명 주석을 둠
- `what`보다 transport/ordering의 `why`를 설명하는 경우가 많음
- 대형 파일에는 section divider comment 블록 사용

**JSDoc / TSDoc:**
- exported interfaces/functions에 간단한 doc comment가 일부 존재
- 모든 함수에 광범위한 JSDoc를 강제하지는 않음

## Function and Module Design

**Functions:**
- command/driver APIs는 객체 인자 패턴을 선호
- early return이 많고 guard clause 중심
- side effect helpers를 작게 분리하는 편

**Modules:**
- named export 기본, React component만 default export가 흔함
- package-level `index.ts`에서 public API를 재노출
- workspace alias를 이용해 package 경계를 명확히 유지

## TODO / Decision Tracking

- 코드 내부 TODO는 적고, 대부분 `agrune/docs/notes/`, `agrune/docs/superpowers/specs/`, `CLAUDE.md`에 설계/후속 과제를 기록
- 즉, 이 저장소는 inline TODO보다 문서 중심 의사결정 추적을 선호

## Style Split to Preserve

- 제품 패키지와 demo는 같은 workspace 안에 있지만 스타일이 완전히 동일하지 않음
- `agrune/packages/*` 수정 시 현재 single quote/no semicolon 경향을 따르는 편이 안전
- `demo/src/components/ui/*` 수정 시 shadcn 생성 스타일을 유지하는 편이 diff를 줄임

---

*Convention analysis: 2026-04-07*
*Update when linting, formatting, or package boundaries change*
