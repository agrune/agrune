# Phase 14: MACRO — Research

**Researched:** 2026-04-19
**Domain:** In-page MacroRunner + SensitiveMask DOM heuristic + agrune_macro_run MCP tool
**Confidence:** HIGH (코드베이스 직접 확인)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Upstream from Phase 11-13 (locked):**
  - `@agrune/manifest` defineMacro schema: `id/params/steps/precondition/postcondition` — Phase 11 완료
  - `isSensitive(el, manifestFlag?: true)` OR chain — Phase 11-02 완료
  - `BrowserDriver.injectManifest` — Phase 12 완료
  - `@agrune/react` FiberIdentityIndex — Phase 13 완료 (macro step에서 fiber resolve 활용 가능)
- **Key decision (2026-04-19):** Cross-cutting Pitfall 4 (sensitive 우회) primary owner = Phase 14 MACRO (runtime heuristic OR-override)

### Claude's Discretion
모든 구현 선택은 Claude 재량.

### Deferred Ideas (OUT OF SCOPE)
없음.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MACRO-01 | `MacroRunner`가 페이지 런타임 내부에서 실행 + 기존 `CommandBroker`/`HitlController`/`action-queue` 재사용 | CommandBroker.emit, HitlController.awaitGate, ActionQueue.push API 확인 완료 |
| MACRO-02 | MCP tool `agrune_macro_run(macroId, params)` 노출 | 3파일 동기화 패턴 Phase 12-03에서 검증 완료 |
| MACRO-03 | `SensitiveMask` DOM heuristic(type=password, autocomplete whitelist, 단어 경계 regex, 다국어 ARIA label)이 snapshot/log/valuePreview에서 자동 마스킹 | isSensitive 현재 구현 확인, 확장 지점 명확 |
| MACRO-04 | Macro precondition/postcondition 실패 시 circuit breaker 발동 — partial-execution account-lockout 방지 | ManifestMacro.circuitBreaker 스키마 확인 완료 |
</phase_requirements>

---

## Summary

Phase 14는 세 독립 서브시스템으로 구성된다. (1) **MacroRunner** — 페이지 런타임 내부에서 step loop를 실행, CDP round-trip 없이 4x 토큰 절감. (2) **agrune_macro_run MCP tool** — MCP layer에서 start/end만 orchestrate, Phase 12-03에서 확립한 3파일 동기화 패턴 재사용. (3) **SensitiveMask 확장** — isSensitive에 단어 경계 regex + 다국어 ARIA label을 추가, snapshot.ts의 valuePreview 마스킹 지점은 이미 존재.

Phase 11-13 모두 완료 상태이며 코드베이스를 직접 확인했다. 추측 없이 실제 파일 위치와 API를 검증했다. 아키텍처적으로 MacroRunner는 `packages/runtime/src/runtime/macro-runner.ts`에 신규 파일로 생성하고, page-agent-runtime.ts에 `runMacro()` 메서드를 추가해 MCP handler → runtime 브리지를 연결한다.

**Primary recommendation:** MacroRunner는 기존 `resolveRuntimeTarget` + `handleAct/Fill` command handler를 직접 호출(CDP 없이)하는 in-page step executor로 구현한다. HITL gate는 `sensitive:true` step 진입 전에만 추가로 pause하고, circuit breaker는 MacroRunner 인스턴스 메모리에 세션 범위로 유지한다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MacroRunner step 실행 | Page Runtime (브라우저 내) | — | CDP round-trip 제거가 핵심 목적. DOM 조작은 브라우저 내에서 직접 |
| Circuit breaker 상태 | Page Runtime (MacroRunner instance) | — | 세션 범위 메모리로 충분. 영구 저장 불필요 |
| HITL gate | MCP layer (HitlController) | Page Runtime | HitlController는 MCP index.ts에서 관리. sensitive step에서 추가 pause 신호를 MacroRunner가 던지면 상위 MCP handler가 awaitGate 처리 |
| agrune_macro_run 등록 | MCP layer (3파일) | — | Phase 12-03 패턴 동일 (mcp-tools.ts + index.ts + tools.ts) |
| SensitiveMask DOM heuristic | Page Runtime (dom-utils.ts) | — | isSensitive는 브라우저 DOM에서 직접 실행 |
| valuePreview 마스킹 | Page Runtime (snapshot.ts) | — | captureTarget line 366: `!state.sensitive ? element.value : null` 이미 존재 |
| Token 측정 | MCP layer (CommandBroker events) | — | CommandEvent에 durationMs가 있으나 token count는 MCP 호출 수로 근사 측정 |

---

## Standard Stack

### Core (변경 없음 — 기존 패키지 재사용)

| Library | 위치 | Purpose |
|---------|------|---------|
| `CommandBroker` | `packages/mcp/src/command-broker.ts` | step별 event 스트리밍 (emit start/end/error) |
| `HitlController` | `packages/mcp/src/hitl-controller.ts` | sensitive step HITL gate |
| `ActionQueue` | `packages/runtime/src/runtime/action-queue.ts` | step 순서 직렬화 (필요 시 사용) |
| `isSensitive` | `packages/runtime/src/runtime/dom-utils.ts` | OR-only sensitive 판정 |
| `resolveRuntimeTarget` | `packages/runtime/src/runtime/snapshot.ts` | targetId → element resolve |
| `handleAct`, `handleFill` | `packages/runtime/src/runtime/command-handlers.ts` | 실제 DOM 조작 (CDP 없이 직접) |

### 신규 파일

| 파일 | 목적 |
|------|------|
| `packages/runtime/src/runtime/macro-runner.ts` | MacroRunner 클래스 |
| `packages/mcp/tests/macro-run-tool.spec.ts` | TDD 테스트 |
| `packages/e2e/tests/user-flow/macro-run.spec.ts` | E2E smoke |

---

## Architecture Patterns

### 시스템 데이터 흐름

```
Claude Code
    │  agrune_macro_run({ macroId, params })
    ▼
MCP index.ts (handleToolCall)
    │  1. HitlController.awaitGate('agrune_macro_run')
    │  2. driver.runMacro(tabId, macroId, params)
    ▼
BrowserDriver.runMacro  (CdpDriver)
    │  CDP Runtime.evaluate → pageRuntime.runMacro(macroId, params)
    ▼
PageAgentRuntime.runMacro  (브라우저 내 page-agent-runtime.ts)
    │  MacroRunner.run(macro, params, { hitlSignal })
    ▼
MacroRunner (packages/runtime/src/runtime/macro-runner.ts)
    ├─ precondition eval
    ├─ for each step:
    │    ├─ isSensitive check → HITL signal (if needed)
    │    ├─ resolveRuntimeTarget → element
    │    ├─ handleAct / handleFill (DOM 직접 조작)
    │    ├─ postcondition eval (step별)
    │    └─ circuit breaker 평가
    └─ final postcondition eval
    │
    ▼ (CDP evaluate 반환)
MCP index.ts
    │  CommandBroker.emit(end/error)
    ▼
DevTools WebApp  ← CommandBroker broadcast (step progress)
```

### Pattern 1: MacroRunner 클래스 설계

**What:** 단일 macro 정의를 받아 step loop를 실행하는 pure 클래스. page-agent-runtime.ts의 deps를 주입받아 DOM 조작.

**핵심 인터페이스:**

```typescript
// Source: packages/manifest/src/schema.ts (VERIFIED)
// ManifestMacro 스키마에서 precondition/postcondition은 string (JS 표현식)
// circuitBreaker.maxRetries는 number — schema 기본값 없으므로 런타임 default 필요

export interface MacroRunnerDeps {
  descriptors: TargetDescriptor[]
  snapshotStore: MutableSnapshotStore
  commandHandlerDeps: CommandHandlerDeps   // command-handlers.ts의 deps
  onStepStart?: (stepIndex: number, step: MacroStep) => void
  onStepEnd?: (stepIndex: number, step: MacroStep, ok: boolean) => void
  onHitlRequired?: (stepIndex: number, step: MacroStep) => Promise<'resume' | 'skip'>
}

export type MacroResult =
  | { status: 'ok' }
  | { status: 'already-satisfied' }
  | { status: 'precondition-failed'; reason: string }
  | { status: 'circuit-open'; failedStep: number }
  | { status: 'step-error'; stepIndex: number; error: string }

export class MacroRunner {
  private consecutiveFailures = 0  // circuit breaker 세션 메모리

  constructor(private deps: MacroRunnerDeps) {}

  async run(macro: ManifestMacro, params: Record<string, unknown>): Promise<MacroResult>
}
```

**Step loop 알고리즘:**

```
run(macro, params):
  1. precondition eval (if macro.precondition)
     - eval(interpolate(macro.precondition, params)) in page context
     - true → "already-satisfied" (idempotent early return)
     - false → 정상 진행
     - eval 오류 → precondition-failed
  2. for (stepIndex, step) of macro.steps:
     a. sensitive check: isSensitive(resolvedElement, step.sensitive)
        → true && onHitlRequired → await 'resume' or 'skip'
        → 'skip' → step 건너뜀, 실패 카운트 안 함
     b. resolveRuntimeTarget → element
     c. handleAct or handleFill (CommandResult)
     d. ok? → consecutiveFailures = 0
        fail? → consecutiveFailures++
              → if consecutiveFailures >= circuitThreshold → circuit-open
     e. step postcondition (if step.postcondition exists — v0.6+ 고려, v0.5는 macro-level만)
  3. macro postcondition eval (if macro.postcondition)
     - false → postcondition-failed (circuit breaker 동일 규칙)
  4. return { status: 'ok' }
```

### Pattern 2: Circuit Breaker

**What:** 연속 실패 N회 → abort. 상태는 MacroRunner 인스턴스 메모리(세션 범위).

**N값:** CONTEXT.md에서 "연속 실패 2회"로 확정. schema의 `circuitBreaker.maxRetries`가 우선, 없으면 default=2.

**persistence:** 세션 메모리만. `resetAfterMs`는 setTimeout으로 `consecutiveFailures = 0` 리셋. 영구 저장 없음.

```typescript
// Source: packages/manifest/src/schema.ts (VERIFIED)
// circuitBreaker?: { maxRetries: number; resetAfterMs?: number }
const threshold = macro.circuitBreaker?.maxRetries ?? 2
```

### Pattern 3: precondition/postcondition DSL

**현재 스키마 shape (VERIFIED — packages/manifest/src/schema.ts):**
```typescript
// ManifestMacro.precondition?: string
// ManifestMacro.postcondition?: string
// 타입: string (JS 표현식 문자열)
```

precondition/postcondition은 JS 표현식 string. 평가 방법:
- 브라우저 내 `new Function('params', 'return (' + expr + ')')` 호출
- params 객체를 인자로 전달
- boolean 반환 기대
- 예외 → precondition-failed / postcondition-failed

**중요:** schema에 step-level postcondition은 없음. `precondition/postcondition`은 macro 수준만. CONTEXT.md의 step loop는 macro-level postcondition 실패도 circuit breaker 트리거로 처리.

### Pattern 4: 3파일 동기화 (agrune_macro_run)

Phase 12-03에서 확립한 패턴 그대로 적용. [VERIFIED: 12-03-SUMMARY.md]

| 파일 | 추가 내용 |
|------|---------|
| `packages/mcp/src/mcp-tools.ts` | `mcp.tool('agrune_macro_run', ...)` 등록 (zod schema) |
| `packages/mcp/src/index.ts` | `case 'agrune_macro_run'` switch 분기 |
| `packages/mcp/src/tools.ts` | `getToolDefinitions()` 배열에 JSON Schema 추가 |

**추가로 필요한 파일:**
- `packages/core/src/driver.ts`: `BrowserDriver.runMacro?(tabId, macroId, params): Promise<MacroResult>` optional 메서드
- `packages/browser/src/cdp-driver.ts`: `CdpDriver.runMacro` 구현 (Runtime.evaluate 경유)
- `packages/runtime/src/runtime/page-agent-runtime.ts`: `PageAgentRuntime.runMacro()` 메서드

**zod schema (mcp-tools.ts):**
```typescript
mcp.tool('agrune_macro_run', 'Run a macro defined in the loaded manifest by macroId.',
  {
    macroId: z.string().describe('Macro ID as defined in the manifest'),
    params: z.record(z.unknown()).optional().describe('Params matching macro.params schema'),
    ...optionalTabId,
  },
  async (args) => toMcpToolResult(await handleToolCall('agrune_macro_run', args)),
)
```

### Pattern 5: HITL Gate — sensitive step 처리

**기존 HitlController.awaitGate** 는 MCP layer에서 tool 단위로 gate. MacroRunner는 page runtime 내부이므로 직접 `awaitGate` 호출 불가.

**설계:** MacroRunner가 `onHitlRequired` callback을 통해 MCP layer에 신호를 돌려준다.

```
MacroRunner (browser runtime)
    ↓  onHitlRequired(stepIndex, step) callback 호출
MCP index.ts / BrowserDriver.runMacro
    ↓  hitl.pause() + wait for resume
    ↓  resume → callback resolves 'resume'
MacroRunner
    ↓  step 실행
```

**현실적 구현:** CDP evaluate가 비동기 완료를 기다리므로, MacroRunner가 CDP evaluate 안에서 실행 완료까지 블록. 따라서 HITL signal은 Runtime.evaluate 반환 전에 처리될 수 없다. **실용적 접근:** `sensitive:true` step이 있는 macro는 macro 시작 전에 사용자에게 일괄 경고를 CommandBroker event로 emit하고, HITL pause는 MCP tool 호출 레벨에서 전처리. 세부 step-level HITL은 v0.6+ 고려 대상.

**v0.5 HITL 계약:** `sensitive:true` step이 포함된 macro → `agrune_macro_run` 호출 전 HitlController.pause 상태이면 awaitGate가 block. `sensitive:true` step이 포함된 경우 CommandBroker에 'sensitive-steps-present' 정보를 emit해 devtools가 표시.

### Anti-Patterns to Avoid

- **Anti-pattern 1: CDP round-trip per step** — MacroRunner가 각 step을 별도 `driver.execute()` 호출로 처리하면 Phase 14의 핵심 목적(4x 토큰 절감) 달성 불가. `Runtime.evaluate` 하나로 전체 loop를 브라우저에서 실행해야 함.
- **Anti-pattern 2: precondition을 `eval()` 직접 사용** — `eval()` 대신 `new Function()` 사용해 스코프 격리.
- **Anti-pattern 3: isSensitive(el) 확장을 snapshot.ts에서** — sensitive 로직은 dom-utils.ts의 `isSensitive` 단일 지점에서만 확장. snapshot.ts의 valuePreview 마스킹은 이미 `isSensitive()` 호출 결과를 사용 중.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Step 직렬화 | 커스텀 promise chain | `ActionQueue.push(block)` | pause/resume/dispose 엣지케이스 이미 처리 |
| event 브로드캐스트 | 커스텀 pub/sub | `CommandBroker.emit` | 버퍼 + 신규 devtools 클라이언트 backfill 처리 |
| HITL pause | 커스텀 gate | `HitlController.awaitGate` | step/skip/resume 프로토콜 완성 |
| regex 오탐 방지 | 직접 substring match | `/\b(password|...)\b/i` word boundary | "passwords123" 같은 오탐 방지 필수 |
| 타입 검증 | 커스텀 파서 | `MacroSchema.safeParse` (zod) | manifest는 이미 validateManifest 이중 검증 |

---

## 질문별 상세 Research 결과

### Q1. `defineMacro` schema의 현재 shape

[VERIFIED: packages/manifest/src/schema.ts 직접 확인]

```typescript
export interface ManifestMacro {
  macroId: string
  name?: string
  desc?: string
  params: Record<string, { type: 'string' | 'number' | 'boolean'; required?: boolean }>
  steps: MacroStep[]
  precondition?: string        // JS 표현식 문자열
  postcondition?: string       // JS 표현식 문자열
  circuitBreaker?: {
    maxRetries: number
    resetAfterMs?: number
  }
}

export interface MacroStep {
  targetId: string
  action: ActionKind
  value?: string
  sensitive?: true             // OR-only: false 불가 (z.literal(true).optional())
}
```

**중요 발견:**
- `precondition`/`postcondition`은 **string** — JS 표현식. DSL이 아닌 raw JS.
- step-level postcondition은 없음 (macro-level만).
- `sensitive?: true` — step 레벨에서도 OR-only 계약.
- `circuitBreaker`는 optional — 없으면 MacroRunner가 default (N=2) 적용.
- `params` 타입 시스템: `required?: boolean` 필드가 있으나 런타임 타입 캐스팅은 manifest loader에서 처리해야 함.

### Q2. `CommandBroker`, `HitlController`, `action-queue` 위치 + public API

[VERIFIED: 직접 파일 확인]

**CommandBroker** (`packages/mcp/src/command-broker.ts`):
```typescript
class CommandBroker {
  nextId(): string                           // cmd-{ts}-{counter}
  emit(event: CommandEvent): void            // broadcast + buffer
  getBuffered(): CommandEvent[]
  subscribe(listener): () => void
  clear(): void
}
// CommandEvent: { id, ts, sessionId, tool, phase: 'start'|'end'|'error', durationMs?, args?, error? }
```

**HitlController** (`packages/mcp/src/hitl-controller.ts`):
```typescript
class HitlController {
  getState(): HitlState
  pause(): void
  resume(): void
  step(): void
  skip(): void
  awaitGate(tool: string): Promise<void>   // throws HitlSkipError
  onChange(listener: HitlStateListener): () => void
}
```

**ActionQueue** (`packages/runtime/src/runtime/action-queue.ts`):
```typescript
class ActionQueue {
  push(block: Block): Promise<void>
  pause(): void / resume(): void / clear(): void / dispose(): void
  get length/processing/paused/active(): boolean
  onActivate/onDeactivate: (() => void) | null
}
// Block: { type: string; execute(): Promise<void> }
```

**중요:** CommandBroker와 HitlController는 `packages/mcp/src/`에 위치. ActionQueue는 `packages/runtime/src/runtime/`에 위치. MacroRunner는 runtime 내부이므로 ActionQueue는 직접 사용 가능. CommandBroker/HitlController는 MCP layer를 통해 callback으로 접근.

### Q3. `MacroRunner` 설계 — 핵심 결정

**파일 위치:** `packages/runtime/src/runtime/macro-runner.ts` (신규)

**step loop 전체 설계:**

```typescript
// 1. precondition 평가
//    - macro.precondition이 JS 표현식 → new Function('params', 'return (' + expr + ')')(resolvedParams)
//    - true → { status: 'already-satisfied' } (이미 목표 상태)
//    - false → 정상 진행
//    - 평가 오류 → { status: 'precondition-failed' }

// 2. step loop
//    for (let i = 0; i < steps.length; i++) {
//      const step = steps[i]
//      const element = resolveElement(step.targetId)
//
//      // HITL check (v0.5: macro 단위 사전 경고만)
//      if (isSensitive(element, step.sensitive)) {
//        deps.onSensitiveStep?.(i, step)
//      }
//
//      // action
//      let result: CommandResult
//      if (step.action === 'fill') {
//        result = await handleFill({ targetId: step.targetId, value: interpolate(step.value, params), ... })
//      } else {
//        result = await handleAct({ targetId: step.targetId, action: step.action, ... })
//      }
//
//      if (!result.ok) {
//        consecutiveFailures++
//        if (consecutiveFailures >= threshold) return { status: 'circuit-open', failedStep: i }
//      } else {
//        consecutiveFailures = 0
//      }
//    }

// 3. postcondition 평가 (macro level)
//    - macro.postcondition이 false → { status: 'postcondition-failed' }

// 4. return { status: 'ok' }
```

**params interpolation:** `step.value`에 `${params.username}` 같은 템플릿 참조가 있으면 치환. 단순 string replace로 충분 (`{{key}}` 또는 템플릿 리터럴 스타일 — schema에 명시 없으므로 `{{key}}` 패턴 권장).

### Q4. `agrune_macro_run` MCP tool — 3파일 동기화

**Phase 12-03 패턴 그대로** [VERIFIED: 12-03-SUMMARY.md]

추가로 필요한 error code:
- `MACRO_NOT_FOUND` — macroId가 manifest에 없음
- `MACRO_CIRCUIT_OPEN` — circuit breaker 발동
- `MACRO_PRECONDITION_FAILED`
- `MACRO_POSTCONDITION_FAILED`

이 4개를 `packages/core/src/index.ts`의 `COMMAND_ERROR_CODES` 배열에 추가.

**index.ts switch case 구조:**
```typescript
case 'agrune_macro_run': {
  if (tabId == null) return errorText('SESSION_NOT_ACTIVE', ...)
  if (typeof driver.runMacro !== 'function') return errorText('INVALID_COMMAND', ...)

  const cmdId = commandBroker.nextId()
  commandBroker.emit({ id: cmdId, ts: Date.now(), phase: 'start', tool: 'agrune_macro_run', ... })

  const result = await driver.runMacro(tabId, args.macroId as string, args.params ?? {})

  if (result.status !== 'ok' && result.status !== 'already-satisfied') {
    commandBroker.emit({ ..., phase: 'error', ... })
    return errorText('MACRO_CIRCUIT_OPEN' | 'MACRO_PRECONDITION_FAILED' | ..., ...)
  }

  commandBroker.emit({ ..., phase: 'end', durationMs: Date.now() - start, ... })
  return { text: JSON.stringify({ ok: true, status: result.status }), ... }
}
```

### Q5. sensitive mask OR-override — isSensitive 현재 구현에서 무엇이 더 필요한가

[VERIFIED: packages/runtime/src/runtime/dom-utils.ts 직접 확인]

**현재 isSensitive (Phase 11-02 완료):**
1. `manifestFlag === true` → true
2. `element.type === 'password'` → true
3. `autocomplete` whitelist (AUTOCOMPLETE_SENSITIVE) → true
4. `data-agrune-sensitive="true"` 레거시 → true

**Phase 14에서 추가할 내용 (CONTEXT.md 명시):**
5. 단어 경계 regex → `name`, `id`, `placeholder`, `aria-label` 속성에 대해 실행
6. 다국어 ARIA label 매핑 테이블

**추가 위치:** dom-utils.ts의 `isSensitive` 함수 하단에 append.

```typescript
// Phase 14 추가 — 단어 경계 regex
const SENSITIVE_WORD_BOUNDARY = /\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i

// Phase 14 추가 — 다국어 ARIA label
const SENSITIVE_ARIA_LABELS_MULTILANG = new Set([
  // 한국어
  '비밀번호', '패스워드', '핀번호', '보안코드',
  // 일본어
  'パスワード', 'ぱすわーど', '暗証番号',
  // 중국어 간체
  '密码', '口令',
  // 중국어 번체
  '密碼',
  // 프랑스어
  'mot de passe',
  // 독일어
  'passwort', 'kennwort',
  // 스페인어
  'contraseña',
])
```

**검사 순서 (이미 존재하는 4개 체크 다음):**
```typescript
// 5. word-boundary regex on name/id/placeholder
const attrs = ['name', 'id', 'placeholder']
for (const attr of attrs) {
  const val = element.getAttribute(attr)
  if (val && SENSITIVE_WORD_BOUNDARY.test(val)) return true
}

// 6. aria-label exact match (다국어)
const ariaLabel = element.getAttribute('aria-label')?.toLowerCase().trim()
if (ariaLabel && SENSITIVE_ARIA_LABELS_MULTILANG.has(ariaLabel)) return true

// 7. aria-label word boundary regex (영어 포함)
if (ariaLabel && SENSITIVE_WORD_BOUNDARY.test(ariaLabel)) return true
```

**확장 가능한 registry 구조:** `SENSITIVE_ARIA_LABELS_MULTILANG`은 Set으로 분리해 향후 `addSensitiveAriaLabel(label: string)` API로 런타임 확장 가능하게 설계.

### Q6. 단어 경계 regex + 다국어 ARIA label

**영어 word boundary:** `/\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i`

**문제:** `\b`는 Unicode word boundary가 아님. 영어(ASCII 알파벳) 기준으로만 동작.
- "비밀번호" 같은 비ASCII 한글은 `\b`가 제대로 동작하지 않음.
- 따라서 한/일/중은 exact-match Set으로 처리 (SENSITIVE_ARIA_LABELS_MULTILANG).
- 영어 키워드는 word boundary regex로 처리.

**오탐 방지 사례:**
- `passwordless` → BOUNDARY regex는 `password` + `less` 연속이므로 `\b` 통과 안 됨 ✓
- `form_password_field` → underscore는 word character라 `\b`가 `password` 앞뒤를 단어 경계로 못 잡을 수 있음.
  → 해결: `name`, `id` 속성에서는 `_`로 분리된 경우도 처리: `/(?:^|[_\-\s.])(?:password|pwd|cvv|ssn)(?:[_\-\s.]|$)/i`

**실용적 접근:**
- `placeholder`, `aria-label` → `SENSITIVE_WORD_BOUNDARY` (\b 버전) 사용
- `name`, `id` → underscore/dash 인식 버전 별도 regex

### Q7. valuePreview 마스킹 — snapshot.ts의 어디에서 isSensitive 호출

[VERIFIED: packages/runtime/src/runtime/snapshot.ts 직접 확인]

**정확한 위치 (line 366):**
```typescript
// captureTarget 함수 내부
const valuePreview =
  isFillableElement(element) && !state.sensitive ? element.value : null
```

`state.sensitive`는 `captureTargetState()` 내에서 `isSensitive(element)` 호출 결과. 즉:
- `isSensitive`가 true → `state.sensitive = true` → `valuePreview = null` (자동 마스킹)
- 추가 코드 수정 없이 isSensitive 확장만으로 valuePreview 마스킹이 자동 전파됨.

**log 마스킹:** `CommandBroker.emit`의 `args` 필드에 fill value가 포함될 수 있음. `agrune_macro_run` handler에서 step.value를 args에 포함할 때 sensitive step의 value는 `"[REDACTED]"`로 치환해 emit.

**snapshot의 sensitive 필드:** `captureTarget`이 `PageTarget.sensitive: boolean`을 반환. AI 에이전트가 이 필드를 보고 해당 targetId에 value를 전달해서는 안 됨을 인지.

### Q8. HITL gate — sensitive:true step 식별 방법

**v0.5 제약사항 (CONTEXT.md + 아키텍처 분석에서 도출):**

CDP `Runtime.evaluate`는 동기적으로 완료까지 기다린다. MacroRunner는 evaluate 내부에서 실행되므로, step 중간에 외부 MCP layer의 HitlController와 통신이 불가능하다. 따라서:

**v0.5 HITL 구현 방식:**
1. macro 시작 전에 manifest에서 `sensitive:true` step 여부 확인
2. `sensitive:true` step이 있으면 CommandBroker event 발행: `{ phase: 'start', args: { hasSensitiveSteps: true, sensitiveStepIndices: [...] } }`
3. DevTools 웹앱이 이 event를 받아 사용자에게 표시
4. HITL pause가 걸려 있으면 `awaitGate` → 해제 후 `driver.runMacro()` 호출

**step-level HITL (v0.6+ 후보):** Runtime.evaluate를 step별로 분할하거나, CDP의 bidirectional 통신 채널(WebSocket)을 활용하는 방식 필요. v0.5 범위 밖.

**sensitive step 식별 방법 (코드):**
```typescript
// MCP index.ts에서 macro 시작 전
const manifest = driver.getManifest(tabId)
const macro = manifest?.macros?.find(m => m.macroId === macroId)
const sensitiveStepIndices = macro?.steps
  .map((step, i) => (step.sensitive === true ? i : -1))
  .filter(i => i >= 0)
```

### Q9. Token 4x 절감 — 측정 방법

**주장:** MCP tool 호출 횟수가 N step → 1회로 줄면 LLM context에서 소비하는 token이 줄어든다는 의미. "4x"는 동일 작업에서 CDP round-trip 기반(step당 1 MCP 호출) vs. MacroRunner(1 MCP 호출)의 비율.

**측정 방법 (this phase scope에 포함 여부):**

CommandBroker `CommandEvent`에 이미 `durationMs`가 있다. Token count 측정은 MCP SDK 레벨에서 노출되지 않으므로 **직접 측정 불가**. 간접 측정:
- Before: N step macro = agrune_snapshot(1) + agrune_fill×N + agrune_act×N → N*2+1 MCP 호출
- After: agrune_macro_run(1) → 1 MCP 호출

**Phase 14 scope:** 측정 tool 자체는 포함하지 않음. CommandBroker의 durationMs로 실행 시간은 추적. Token 절감은 수학적 비교(MCP 호출 횟수)로 문서화.

### Q10. Circuit breaker state — session memory vs persistent

**결론:** MacroRunner **인스턴스 메모리** (세션 범위). [ASSUMED] 영구 저장은 불필요.

**근거:**
- Macro는 동일 페이지 세션 내에서만 의미 있음. 페이지 리로드 → runtime 재초기화 → MacroRunner 재생성.
- account-lockout 방지 목적은 연속 실패를 즉시 멈추는 것이지 과거 실패를 기억하는 것이 아님.
- `resetAfterMs` 스키마 필드: MacroRunner 생성자에서 `setTimeout(() => { this.consecutiveFailures = 0 }, resetAfterMs)` 구현.

**단, 주의:** `MacroRunner` 인스턴스를 언제 생성하는가? `driver.runMacro()` 호출마다 새 인스턴스를 생성하면 consecutive failures 상태가 리셋됨. 동일 macro에 대한 연속 재시도를 추적하려면 `PageAgentRuntime`이 macro별 MacroRunner 캐시를 유지해야 함.

**권장:** `PageAgentRuntime`이 `macroRunners: Map<macroId, MacroRunner>` 캐시 유지. `resetAfterMs`가 지나면 캐시에서 제거.

---

## Common Pitfalls

### Pitfall 1: CDP round-trip per step (성능 목표 미달)
**What goes wrong:** `MacroRunner.run()`이 각 step을 별도 `Runtime.evaluate()`로 호출하면 round-trip이 step 수만큼 발생.
**Why it happens:** 기존 command handler가 각각 CDP call을 기대하는 구조여서 그냥 연결하면 이렇게 됨.
**How to avoid:** `driver.runMacro(tabId, macroId, params)` 하나의 `Runtime.evaluate()`로 전체 loop를 브라우저 내에서 실행.
**Warning signs:** E2E 테스트에서 `Runtime.evaluate` spy 카운트가 step 수만큼 증가하면 잘못된 것.

### Pitfall 2: precondition true = skip vs false = skip 혼동
**What goes wrong:** precondition이 `true`를 반환하면 "이미 목표 상태" → macro 실행 스킵. `false` = "아직 목표 상태 아님" → 정상 실행. 반대로 구현하는 실수.
**How to avoid:** 변수명을 `isAlreadySatisfied`로 명명, true면 early return.

### Pitfall 3: isSensitive 확장 시 aria-label 대소문자
**What goes wrong:** aria-label Set 매칭에서 "비밀번호"와 "비밀번호 입력"이 다른 문자열.
**How to avoid:** `aria-label.toLowerCase().trim()` 후 exact match. 또는 `includes` 검사 (오탐 주의).
**Korean 특이점:** 한글은 공백 단위로 분리되므로 "비밀번호 입력" 전체가 aria-label인 경우도 있음. Set에는 완전한 phrase가 아닌 토큰을 기준으로 partial match 필요.
**권장:** `someOf` 검사: aria-label.split(/\s+/)으로 토큰화 후 각 토큰이 Set에 있으면 sensitive.

### Pitfall 4: parity assertion 누락 (3파일 동기화 드리프트)
**What goes wrong:** mcp-tools.ts에만 등록하고 tools.ts에 누락 → devtools tool list와 MCP tool list 불일치.
**How to avoid:** Phase 12-03과 동일하게 parity assertion 테스트 포함. `registerAgruneTools` mock 기반 12 → 13 카운트 검증.

### Pitfall 5: MacroRunner가 브라우저 context에서 Node.js API 사용
**What goes wrong:** `setTimeout`, `Promise`, `Set`은 브라우저에서도 있지만 `process.env`, `fs` 등은 없음.
**How to avoid:** macro-runner.ts에 Node.js import 없이 순수 browser API만 사용.

### Pitfall 6: params 타입 캐스팅 없이 string 사용
**What goes wrong:** `params.username`이 string이 아닌 경우 step.value interpolation에서 undefined.
**How to avoid:** `macro.params`의 type 필드를 기준으로 런타임 타입 검증 + 강제 캐스팅.

---

## Code Examples

### isSensitive 확장 후 전체 시그니처

```typescript
// packages/runtime/src/runtime/dom-utils.ts
// Source: 현재 코드 + Phase 14 확장 계획 [VERIFIED base]

const SENSITIVE_WORD_BOUNDARY = /\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i
const SENSITIVE_NAME_ATTR = /(?:^|[_\-\s.])(?:password|passwd|pwd|cvv|ssn)(?:[_\-\s.]|$)/i

export const SENSITIVE_ARIA_LABELS_MULTILANG = new Set<string>([
  '비밀번호', '패스워드', '핀번호', '보안코드',  // 한국어
  'パスワード', '暗証番号',                       // 일본어
  '密码', '口令', '密碼',                          // 중국어
  'mot de passe', 'passwort', 'contraseña',      // 유럽
])

export function isSensitive(
  element: HTMLElement,
  manifestFlag?: true | undefined,
): boolean {
  if (manifestFlag === true) return true
  if (element instanceof HTMLInputElement && element.type === 'password') return true
  const autocomplete = element.getAttribute('autocomplete')
  if (autocomplete && AUTOCOMPLETE_SENSITIVE.has(autocomplete.toLowerCase().trim())) return true
  if (element.getAttribute('data-agrune-sensitive') === 'true') return true

  // Phase 14 추가: word-boundary regex
  const placeholder = element.getAttribute('placeholder') ?? ''
  if (SENSITIVE_WORD_BOUNDARY.test(placeholder)) return true
  const nameAttr = element.getAttribute('name') ?? ''
  if (SENSITIVE_NAME_ATTR.test(nameAttr)) return true
  const idAttr = element.id ?? ''
  if (SENSITIVE_NAME_ATTR.test(idAttr)) return true

  // Phase 14 추가: 다국어 ARIA label
  const ariaLabel = element.getAttribute('aria-label')?.trim() ?? ''
  const ariaTokens = ariaLabel.toLowerCase().split(/\s+/)
  if (ariaTokens.some(t => SENSITIVE_ARIA_LABELS_MULTILANG.has(t))) return true
  if (SENSITIVE_WORD_BOUNDARY.test(ariaLabel)) return true

  return false
}
```

### MacroRunner 핵심 구조

```typescript
// packages/runtime/src/runtime/macro-runner.ts (신규)
// [ASSUMED structure — verified deps, designed pattern]

import type { ManifestMacro, MacroStep } from '@agrune/manifest'
import { isSensitive } from './dom-utils.js'
import { resolveRuntimeTarget } from './snapshot.js'
import type { TargetDescriptor, MutableSnapshotStore } from './snapshot.js'
import type { CommandHandlerDeps } from './command-handlers.js'
import { handleAct, handleFill } from './command-handlers.js'

export type MacroResult =
  | { status: 'ok' }
  | { status: 'already-satisfied' }
  | { status: 'precondition-failed'; reason: string }
  | { status: 'postcondition-failed'; reason: string }
  | { status: 'circuit-open'; failedStep: number }
  | { status: 'step-error'; stepIndex: number; error: string }

export interface MacroRunnerDeps {
  descriptors: TargetDescriptor[]
  snapshotStore: MutableSnapshotStore
  commandHandlerDeps: CommandHandlerDeps
  onStepStart?: (i: number, step: MacroStep) => void
  onStepEnd?: (i: number, step: MacroStep, ok: boolean) => void
  onSensitiveStep?: (i: number, step: MacroStep) => void
}

export class MacroRunner {
  private consecutiveFailures = 0
  private resetTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private deps: MacroRunnerDeps) {}

  async run(macro: ManifestMacro, params: Record<string, unknown>): Promise<MacroResult> {
    const threshold = macro.circuitBreaker?.maxRetries ?? 2
    if (macro.circuitBreaker?.resetAfterMs) {
      this.scheduleReset(macro.circuitBreaker.resetAfterMs)
    }

    // precondition
    if (macro.precondition) {
      const satisfied = this.evalExpr(macro.precondition, params)
      if (satisfied === true) return { status: 'already-satisfied' }
      if (satisfied === null) return { status: 'precondition-failed', reason: 'eval error' }
    }

    // step loop
    for (let i = 0; i < macro.steps.length; i++) {
      const step = macro.steps[i]
      this.deps.onStepStart?.(i, step)

      const match = resolveRuntimeTarget(this.deps.descriptors, step.targetId)
      if (!match) {
        this.consecutiveFailures++
        if (this.consecutiveFailures >= threshold) return { status: 'circuit-open', failedStep: i }
        this.deps.onStepEnd?.(i, step, false)
        continue
      }

      if (isSensitive(match.element, step.sensitive)) {
        this.deps.onSensitiveStep?.(i, step)
      }

      const value = step.value ? interpolateParams(step.value, params) : undefined
      const result = step.action === 'fill'
        ? await handleFill({ ...this.deps.commandHandlerDeps, targetId: step.targetId, value: value ?? '' })
        : await handleAct({ ...this.deps.commandHandlerDeps, targetId: step.targetId, action: step.action })

      if (result.ok) {
        this.consecutiveFailures = 0
      } else {
        this.consecutiveFailures++
        if (this.consecutiveFailures >= threshold) return { status: 'circuit-open', failedStep: i }
      }

      this.deps.onStepEnd?.(i, step, result.ok)
    }

    // postcondition
    if (macro.postcondition) {
      const satisfied = this.evalExpr(macro.postcondition, params)
      if (satisfied !== true) return { status: 'postcondition-failed', reason: 'postcondition not satisfied' }
    }

    return { status: 'ok' }
  }

  private evalExpr(expr: string, params: Record<string, unknown>): boolean | null {
    try {
      return new Function('params', `return !!(${expr})`)(params) as boolean
    } catch {
      return null
    }
  }

  private scheduleReset(ms: number): void {
    if (this.resetTimer) clearTimeout(this.resetTimer)
    this.resetTimer = setTimeout(() => { this.consecutiveFailures = 0 }, ms)
  }
}

function interpolateParams(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? ''))
}
```

---

## State of the Art

| 기존 | 현재 (Phase 14 이후) | 변경 이유 |
|------|---------------------|---------|
| step별 CDP round-trip (N MCP calls) | 단일 MacroRunner evaluate (1 MCP call) | 토큰 절감, 속도 향상 |
| isSensitive: type=password + autocomplete만 | + word boundary regex + 다국어 ARIA | 악성 manifest sensitive:false 우회 방지 |
| circuit breaker: 스키마만 있고 runtime 없음 | MacroRunner 인스턴스에서 강제 | account-lockout 방지 실제 구현 |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (packages/runtime, packages/mcp) |
| Config file | vitest.config.ts (각 패키지) |
| Quick run command | `pnpm --filter @agrune/runtime run test` |
| Full suite command | `pnpm -r run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| MACRO-01 | MacroRunner step loop 실행 | unit | `pnpm --filter @agrune/runtime run test macro-runner` | ❌ Wave 0 |
| MACRO-01 | MacroRunner circuit breaker | unit | 위와 동일 | ❌ Wave 0 |
| MACRO-01 | isSensitive word-boundary regex | unit | `pnpm --filter @agrune/runtime run test dom-utils` | ❌ Wave 0 (기존 파일 확장) |
| MACRO-02 | agrune_macro_run tool 등록 parity | unit | `pnpm --filter @agrune/mcp run test macro-run-tool` | ❌ Wave 0 |
| MACRO-02 | MACRO_NOT_FOUND 에러코드 | unit | 위와 동일 | ❌ Wave 0 |
| MACRO-03 | isSensitive 다국어 ARIA | unit | `pnpm --filter @agrune/runtime run test dom-utils` | ❌ Wave 0 |
| MACRO-03 | valuePreview null when sensitive | unit | `pnpm --filter @agrune/runtime run test` | 기존 테스트 확장 |
| MACRO-04 | circuit-open 2회 연속 실패 | unit | `pnpm --filter @agrune/runtime run test macro-runner` | ❌ Wave 0 |
| MACRO-04 | already-satisfied early return | unit | 위와 동일 | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `packages/runtime/tests/macro-runner.spec.ts` — MACRO-01, MACRO-04
- [ ] `packages/runtime/tests/dom-utils-sensitive.spec.ts` (또는 기존 sensitive-or-only.spec.ts 확장) — MACRO-03
- [ ] `packages/mcp/tests/macro-run-tool.spec.ts` — MACRO-02
- [ ] `packages/e2e/tests/user-flow/macro-run.spec.ts` — E2E smoke (PLAYWRIGHT_SKIP_E2E=1 skip)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | HITL gate + sensitive step CommandBroker redaction |
| V5 Input Validation | yes | ManifestMacro zod safeParse + validateManifest 이중 검증 |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| precondition JS injection | Tampering | `new Function()` 스코프 격리, manifest는 이미 zod validated |
| step.value에 sensitive data 로깅 | Info Disclosure | CommandBroker args.value → `[REDACTED]` if sensitive step |
| manifest sensitive:false 우회 | Spoofing | isSensitive OR-only — false는 타입 레벨 차단 + runtime heuristic 2차 방어 |
| 연속 실패 → account lockout | DoS | circuit breaker maxRetries (default 2) → abort |
| MacroRunner evaluate injection | Tampering | macro는 manifest에서 로드 (validateManifest 통과한 데이터만) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | params interpolation 형식을 `{{key}}` 패턴으로 가정 | Q3, Code Examples | 다른 형식 사용 시 interpolate 함수 재작성 필요 (low impact) |
| A2 | v0.5 HITL는 macro 단위 사전 경고만 (step-level은 v0.6+) | Q8 | step-level HITL이 필요하면 architecture 변경 필요 (medium impact) |
| A3 | circuit breaker 상태를 PageAgentRuntime의 Map 캐시로 관리 | Q10 | 단순화해서 per-call 생성하면 consecutive 추적 불가 (medium impact) |
| A4 | handleAct/handleFill이 MacroRunner deps에서 직접 호출 가능한 형태 | Q3 | deps 구조가 다르면 adapter 필요 (low impact, 코드 확인 필요) |

---

## Open Questions

1. **handleAct/handleFill 호출 시그니처 (command-handlers.ts)**
   - What we know: `packages/runtime/src/runtime/command-handlers.ts`에 `handleAct`, `handleFill` export 존재 확인. `CommandHandlerDeps` 타입 사용.
   - What's unclear: 파일 전체를 읽지 않아 정확한 deps 구조 미확인.
   - Recommendation: Plan 작성 전 command-handlers.ts 첫 100줄 확인해 `CommandHandlerDeps` 인터페이스 파악.

2. **PageAgentRuntime.runMacro 메서드 추가 방식**
   - What we know: page-agent-runtime.ts가 `getSnapshot`, `act`, `fill` 등 메서드를 export하는 인터페이스.
   - What's unclear: runtime 내부에서 현재 로드된 manifest + descriptors를 어떻게 접근하는지.
   - Recommendation: page-agent-runtime.ts의 상태 관리 패턴 확인 후 `runMacro` 메서드 추가 지점 결정.

3. **CdpDriver.runMacro 구현 — evaluate 반환값 전달**
   - What we know: `Runtime.evaluate`는 primitive 반환. MacroResult 객체를 문자열 직렬화 → JSON.parse로 전달해야 함.
   - Recommendation: Phase 12-02의 injectManifest 패턴(JSON.stringify/parse) 동일 적용.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — pure browser runtime code change, existing toolchain)

---

## Sources

### Primary (HIGH confidence)
- `packages/manifest/src/schema.ts` — ManifestMacro, MacroStep, circuitBreaker 스키마 직접 확인
- `packages/runtime/src/runtime/dom-utils.ts` — isSensitive 현재 구현 직접 확인
- `packages/runtime/src/runtime/snapshot.ts` — valuePreview 마스킹 지점 (line 366) 직접 확인
- `packages/mcp/src/command-broker.ts` — CommandBroker API 직접 확인
- `packages/mcp/src/hitl-controller.ts` — HitlController API 직접 확인
- `packages/runtime/src/runtime/action-queue.ts` — ActionQueue API 직접 확인
- `packages/mcp/src/mcp-tools.ts` — tool 등록 패턴 확인
- `packages/mcp/src/index.ts` — switch case 패턴 확인
- `packages/mcp/src/tools.ts` — getToolDefinitions 패턴 확인
- `.planning/phases/11-manifest/11-02-SUMMARY.md` — isSensitive OR-only 구현 완료 확인
- `.planning/phases/12-inject/12-03-SUMMARY.md` — 3파일 동기화 패턴 확인
- `.planning/phases/14-macro/14-CONTEXT.md` — Phase 14 locked decisions
- `.planning/REQUIREMENTS.md` — MACRO-01..04 요건

### Secondary (MEDIUM confidence)
없음.

### Tertiary (LOW confidence, [ASSUMED] 표기)
- params interpolation `{{key}}` 형식 — schema에 명시 없어 assumed

---

## Metadata

**Confidence breakdown:**
- defineMacro schema shape: HIGH — 직접 파일 확인
- CommandBroker/HitlController/ActionQueue API: HIGH — 직접 파일 확인
- MacroRunner 설계: HIGH (deps) / MEDIUM (step loop 세부 — command-handlers.ts 부분 미확인)
- isSensitive 확장 지점: HIGH — 직접 확인
- valuePreview 마스킹 위치: HIGH — 직접 확인
- 다국어 ARIA label 목록: MEDIUM — 일반 지식 기반
- HITL v0.5 제약: HIGH — 아키텍처 분석
- Circuit breaker: HIGH (schema) / MEDIUM (persistence 전략)

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (코드베이스 변경 없으면 유효)

---

## RESEARCH COMPLETE
