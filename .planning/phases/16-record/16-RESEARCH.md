# Phase 16: RECORD - Research

**Researched:** 2026-04-19
**Domain:** DevTools recorder UX + WS protocol + ts-morph AST editing + AI authoring skill
**Confidence:** HIGH (코드베이스 직접 검증 + Context7 ts-morph docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Phase 11: `defineManifest` SDK + `AgruneManifest` v3 types — 완료
- Phase 13: `FiberIdentityIndex` (bippy) — fiber path capture — 완료
- Phase 14: sensitive heuristic (Phase 14-01에서 다국어 ARIA 확장) — 완료
- Phase 15: `defineRepeat` runtime — recorder가 repeat 캡처 가능해야 함 — 완료
- **NO direct source-file writes** — pending 디렉토리만 사용. `agrune manifest dev` watcher가 사용자 confirm 후 ts-morph로 머지.
- ts-morph — AST 편집으로 주석/포매팅 보존.

### Claude's Discretion
모든 구현 선택은 Claude 재량.

### Deferred Ideas (OUT OF SCOPE)
- Multi-file manifest 지원 (현재 단일 `manifest.ts` 가정) → v0.6+
- AI skill이 macro/repeat 자동 생성 → v0.6+ (Phase 16은 target 중심)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RECORD-01 | DevTools 패널에 `RecorderView` 추가 — mode 모델(idle/picking/recording-action) + keyboard shortcut | 기존 `LogsView`/`SessionsView`/`HitlToolbar` 클래스 패턴 직접 검증 |
| RECORD-02 | MCP `recorder_toggle`/`recorder_captured`/`recorder_commit` WS 프로토콜 | `types.ts` InboundMessage/OutboundMessage union 확장, `devtools-server.ts` handleClientMessage 확장 패턴 직접 검증 |
| RECORD-03 | CLI `agrune manifest dev` watcher가 `~/.agrune/authoring/pending/`에서 ts-morph로 소스 manifest.ts 머지 | ts-morph API docs (Context7 검증) + chokidar 5.0.0 확인 |
| RECORD-04 | Sensitive auto-detect at authoring time — recorder가 캡처 시점에 flag 자동 부여 + AI authoring skill 정확도 precision≥90%/recall≥95% | `isSensitive` + `SENSITIVE_WORD_BOUNDARY` + `SENSITIVE_ARIA_LABELS_MULTILANG` export 직접 확인 |
| RECORD-05 | AI authoring skill(manifest 버전)이 소스 접근 프로젝트에서 ~80-90% target 자동 생성 | 기존 annotate skill 구조 직접 검증 |
</phase_requirements>

---

## Summary

Phase 16은 v0.5 Manifest Pivot의 authoring UX 완결 단계다. DevTools 웹앱에 `RecorderView`를 추가해 사용자가 브라우저에서 요소를 picking → capture하면, MCP 서버가 그 결과를 `~/.agrune/authoring/pending/` 디렉토리에만 기록한다. `agrune manifest dev` CLI watcher가 pending 변경을 감지하고 ts-morph로 소스 `manifest.ts`에 diff preview + confirm 후 안전하게 머지한다. capture 시점에 `isSensitive` heuristic(Phase 14 완성)이 자동 적용되고, AI authoring skill이 React 소스를 분석해 ~80-90% target을 자동 생성한다.

기존 코드베이스는 이미 강력한 기반을 제공한다. DevTools 웹앱은 Vite(plain TS, no React) 기반이고 `LogsView` / `SessionsView` / `HitlToolbar` 3개 클래스가 동일한 `class + innerHTML + addEventListener` 패턴을 사용한다 — `RecorderView`도 이 패턴을 따른다. WS 프로토콜은 `types.ts`의 `InboundMessage` / `OutboundMessage` union에 신규 variant를 추가하고 `devtools-server.ts`의 `handleClientMessage` switch에 case를 추가하는 방식이다. ts-morph 28.0.0이 `defineManifest` call expression의 targets 배열에 PropertyAssignment를 추가하고 파일을 그대로 저장하면 주석·포매팅이 보존된다.

**Primary recommendation:** RecorderView(Tab 추가) → types.ts union 확장 → devtools-server recorder 핸들러 → MCP pending 파일 기록 → chokidar watcher + ts-morph 머지 → isSensitive capture-time 적용 → AI authoring skill 재작성 → corpus CI → demo fixture 순서로 진행.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| RecorderView UI (mode state machine) | Browser/Client (DevTools webapp) | — | Vite standalone webapp이 UI 상태 관리. MCP는 결과 수신만 |
| recorder_toggle/recorder_captured/recorder_commit WS 메시지 | API/Backend (MCP devtools-server) | Browser/Client (ws-client.ts) | server가 브로드캐스트, client가 outbound 송신 |
| Fiber path / selector 3개 캡처 | Browser/Client (page runtime injected) | — | `window.__agrune_identity__` bridge가 page context에서 동작 |
| isSensitive heuristic 적용 | Browser/Client (capture side) | — | DOM 속성 접근이 page context 필요. MCP는 JSON 수신만 |
| Pending 파일 기록 | API/Backend (MCP server) | Database/Storage (~/.agrune/authoring/pending/) | MCP만 pending 파일 쓰기 권한. CLI는 읽기+머지 |
| agrune manifest dev watcher + ts-morph 머지 | API/Backend (CLI process) | Database/Storage (manifest.ts) | 파일 시스템 접근 + AST 편집은 Node.js process |
| AI authoring skill (manifest 재작성) | API/Backend (Claude skill) | — | 소스 분석 + manifest 생성은 AI agent 책임 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ts-morph | 28.0.0 | TypeScript AST 편집 (주석·포매팅 보존) | TypeScript Compiler API wrapper, useTrailingCommas 등 포매팅 설정 지원 |
| chokidar | 5.0.0 | 파일시스템 watcher (pending 디렉토리) | 기존 Vite/Node.js 생태계 표준, ESM native |
| ws (기존) | ^8.20.0 | WS 서버 (devtools-server.ts 이미 사용) | @agrune/mcp 기존 dep |

[VERIFIED: npm registry — ts-morph@28.0.0, chokidar@5.0.0]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs/promises | Node 내장 | pending 파일 write/read/mkdir | MCP pending 기록 |
| node:path, node:os | Node 내장 | `~/.agrune/authoring/pending/` 경로 구성 | homedir() 사용 |
| node:crypto | Node 내장 | sessionId UUID 생성 | crypto.randomUUID() |

[VERIFIED: codebase — node: prefix 패턴이 기존 devtools-server.ts에서 이미 사용됨]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ts-morph | TypeScript Compiler API 직접 | API 복잡도 매우 높음, 포매팅 보존 어려움 — ts-morph가 유일한 현실적 선택 |
| chokidar | node:fs.watch | cross-platform 이슈, chokidar가 표준 |
| pending dir → ts-morph | pending dir → JSON patch | ts-morph가 주석 보존. JSON patch는 템플릿 방식으로 포매팅 파괴 |

**Installation:**
```bash
pnpm --filter @agrune/mcp add ts-morph chokidar
# chokidar는 watcher가 CLI bin에서 실행되면 mcp에 추가, 또는 별도 CLI 패키지 신설
```

**Version verification:** [VERIFIED: npm view ts-morph version → 28.0.0, npm view chokidar version → 5.0.0, 2026-04-19]

---

## Architecture Patterns

### System Architecture Diagram

```
[사용자 브라우저]
    ↓ Ctrl+Shift+R (keyboard shortcut)
[DevTools webapp: RecorderView]
    ↓ OutboundMessage: { type: 'recorder_toggle' }
    ↑ InboundMessage: { type: 'recorder_state', mode: 'picking' }
[devtools-server.ts: handleClientMessage('recorder_toggle')]
    ↓ CDP → page context inject
[page context: picking overlay]
    ↓ 사용자 element hover → click
[page context: capture 3개 selector + isSensitive]
    ↓ CDP Runtime.evaluate → result JSON
[devtools-server.ts: recorder_captured 브로드캐스트]
    ↓ InboundMessage: { type: 'recorder_captured', data: CaptureResult }
[RecorderView: 결과 표시 + Enter(commit) / Esc(cancel)]
    ↓ OutboundMessage: { type: 'recorder_commit', data: CommitPayload }
[devtools-server.ts → MCP pending 파일 기록]
    ↓ ~/.agrune/authoring/pending/<sessionId>/<ts>.json
[chokidar watcher: agrune manifest dev]
    ↓ pending 파일 감지
[ts-morph: defineManifest 오브젝트 AST 탐색 → targets 배열에 추가]
    ↓ diff preview → 사용자 confirm (y/n)
[manifest.ts: 새 target 머지 완료]
```

### Recommended Project Structure

```
packages/devtools/src/
├── recorder-view.ts       # RecorderView 클래스 (신규) — mode state machine
├── types.ts               # recorder_* union 확장 (기존 수정)
├── ws-client.ts           # OutboundMessage 타입 확장 (기존 수정)
└── panel.ts               # RecorderView 인스턴스화 + Tab 추가 (기존 수정)

packages/mcp/src/
├── devtools-server.ts     # recorder_toggle/commit 핸들러 추가 (기존 수정)
├── pending-store.ts       # PendingStore 클래스 신규 — ~/.agrune/authoring/pending/ 관리
└── manifest-dev-watcher.ts # ManifestDevWatcher 신규 — chokidar + ts-morph 머지

packages/mcp/bin/
└── agrune-mcp.ts          # 'manifest dev' 서브커맨드 추가 (기존 수정)

skills/skills/annotate/    # 기존 (data-agrune-* 방식, 유지)
skills/skills/manifest/    # 신규 AI authoring skill (manifest 버전)
├── SKILL.md
└── references/
    ├── pattern-login-form.md
    ├── pattern-payment.md
    └── corpus/            # 100+ 합성 폼 데이터
```

### Pattern 1: RecorderView 클래스

**What:** DevTools webapp의 Tab으로 추가되는 `RecorderView`. `idle → picking → recording-action` 3-mode state machine.
**When to use:** 사용자가 Ctrl+Shift+R 또는 Tab 버튼으로 Recorder 진입 시.

```typescript
// Source: [VERIFIED: 기존 LogsView/HitlToolbar 패턴 분석]
// packages/devtools/src/recorder-view.ts

type RecorderMode = 'idle' | 'picking' | 'recording-action'

export class RecorderView {
  private mode: RecorderMode = 'idle'
  private candidates: CaptureResult | null = null
  private readonly root: HTMLElement

  constructor(root: HTMLElement, private readonly ws: DevtoolsWsClient) {
    this.root = root
    this.render()
    this.bindKeyboard()
  }

  update(msg: RecorderInboundMessage): void {
    if (msg.type === 'recorder_state') {
      this.mode = msg.mode
      this.render()
    }
    if (msg.type === 'recorder_captured') {
      this.candidates = msg.data
      this.mode = 'recording-action'
      this.render()
    }
  }

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'R') this.toggle()
      if (e.key === 'Escape') this.cancel()
      if (e.key === 'Enter' && this.candidates) this.commit()
    })
  }

  private toggle(): void {
    this.ws.send({ type: 'recorder_toggle' })
  }
  private cancel(): void {
    this.ws.send({ type: 'recorder_toggle' }) // idle로 복귀
  }
  private commit(): void {
    if (!this.candidates) return
    this.ws.send({ type: 'recorder_commit', data: this.candidates })
    this.candidates = null
  }

  private render(): void { /* innerHTML 패턴 */ }
}
```

### Pattern 2: types.ts WS union 확장

**What:** `types.ts`의 `InboundMessage` / `OutboundMessage` union에 recorder 메시지 추가.

```typescript
// Source: [VERIFIED: packages/devtools/src/types.ts 직접 분석]
// 기존 InboundMessage union 확장

export type InboundMessage =
  | { type: 'sessions_update'; data: Session[] }
  | { type: 'snapshot_update'; data: { tabId: number; snapshot: unknown } }
  | { type: 'command_event'; data: CommandEvent }
  | { type: 'command_backfill'; data: CommandEvent[] }
  | { type: 'hitl_state'; data: HitlState }
  // Phase 16: recorder
  | { type: 'recorder_state'; mode: RecorderMode }
  | { type: 'recorder_captured'; data: CaptureResult }

export type OutboundMessage =
  | { type: 'subscribe'; tabId: number }
  | { type: 'highlight'; targetId: string }
  | { type: 'clear_highlight' }
  | { type: 'hitl'; action: HitlAction }
  | { type: 'focus_session'; sessionId: number }
  // Phase 16: recorder
  | { type: 'recorder_toggle' }
  | { type: 'recorder_commit'; data: CommitPayload }

export type TabId = 'snapshot' | 'logs' | 'sessions' | 'recorder'  // recorder 추가

export interface CaptureResult {
  url: string
  fiberPath?: import('@agrune/manifest').FiberIdentityPath
  roleSelector?: string   // role+name ARIA selector
  cssSelector?: string    // CSS fallback
  sensitive?: boolean     // isSensitive 결과
}

export interface CommitPayload {
  sessionId: string
  ts: number
  url: string
  targetId: string        // 사용자가 입력 또는 자동 생성
  selector: SelectorLadder
  sensitive?: true
}
```

### Pattern 3: Pending 파일 구조

**What:** MCP가 `~/.agrune/authoring/pending/<session>/<ts>.json`에 기록하는 파일 shape.

```typescript
// Source: [VERIFIED: CONTEXT.md spec + isSensitive export 확인]
// PendingCaptureFile 인터페이스

export interface PendingCaptureFile {
  ts: number               // Date.now()
  sessionId: string        // crypto.randomUUID() per dev session
  url: string
  targets: Array<{
    targetId: string       // 사용자 입력 또는 자동 생성
    selector: {            // SelectorLadder shape
      fiber?: { path: FiberIdentityPath }
      role?: string
      css?: string
    }
    sensitive?: true
  }>
}
```

### Pattern 4: ts-morph defineManifest 탐색 + target 추가

**What:** ts-morph로 `manifest.ts`의 `defineManifest({})` call 내부 targets 배열을 찾아 PropertyAssignment를 추가. 주석·포매팅 보존이 핵심.

```typescript
// Source: [CITED: https://github.com/dsherret/ts-morph/blob/latest/docs/details/object-literal-expressions.md]
// packages/mcp/src/manifest-dev-watcher.ts

import { Project, SyntaxKind } from 'ts-morph'

function mergeTargetIntoManifest(manifestPath: string, newTarget: string): string {
  const project = new Project({
    manipulationSettings: {
      useTrailingCommas: true,   // 기존 파일의 trailing comma 스타일 감지 후 설정
      indentationText: IndentationText.TwoSpaces,
    },
    skipAddingFilesFromTsConfig: true,
  })

  const sourceFile = project.addSourceFileAtPath(manifestPath)

  // defineManifest 호출 찾기
  const callExprs = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
  const defineManifestCall = callExprs.find(ce =>
    ce.getExpression().getText() === 'defineManifest'
  )
  if (!defineManifestCall) throw new Error('defineManifest call not found')

  // 첫 번째 인자 (ObjectLiteralExpression) 가져오기
  const configObj = defineManifestCall.getArguments()[0]
  if (!configObj || configObj.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    throw new Error('defineManifest argument is not an object literal')
  }

  // groups[0].targets 배열에 새 target 추가
  // (groups 구조가 없으면 targets를 최상위에 추가)
  const targetsProperty = configObj.getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .find(pa => pa.getNameNode().getText() === 'targets')

  if (targetsProperty) {
    const arr = targetsProperty.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression)
    arr.addElement(newTarget)
  } else {
    // targets 없으면 최상위에 추가
    ;(configObj as ObjectLiteralExpression).addPropertyAssignment({
      name: 'targets',
      initializer: `[${newTarget}]`,
    })
  }

  return sourceFile.getFullText()  // diff preview용
}
```

**Edge case - trailing comma 감지:**
```typescript
// 기존 파일의 trailing comma 스타일을 자동 감지
// ts-morph Project 초기화 시 tsconfig.json 읽어 skipAddingFilesFromTsConfig:true로 AST만 처리
// useTrailingCommas를 파일 실제 패턴에서 감지 (마지막 element 후 comma 여부 grep)
```

**Edge case - prettier 설정:**
ts-morph는 prettier를 직접 호출하지 않는다. 머지 후 `prettier --write manifest.ts` 옵션 제공. [ASSUMED] prettier 연동 여부는 사용자 선택.

### Pattern 5: chokidar watcher (agrune manifest dev)

```typescript
// Source: [VERIFIED: chokidar@5.0.0 npm registry]
import chokidar from 'chokidar'
import { homedir } from 'node:os'
import { join } from 'node:path'

const pendingDir = join(homedir(), '.agrune', 'authoring', 'pending')

const watcher = chokidar.watch(pendingDir, {
  persistent: true,
  ignoreInitial: false,   // 이미 있는 파일도 감지
  depth: 2,               // <sessionId>/<ts>.json 구조
  awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
})

watcher.on('add', async (filePath) => {
  const pending = JSON.parse(await readFile(filePath, 'utf-8')) as PendingCaptureFile
  await processPending(pending, manifestPath)
})
```

### Anti-Patterns to Avoid

- **page context에서 직접 fs.writeFile 호출:** DevTools webapp과 page context는 브라우저 sandbox — 파일 시스템 접근 불가. 반드시 WS → MCP → Node.js 경유.
- **MCP가 직접 manifest.ts 수정:** NO direct source-file writes 원칙 위반. pending 디렉토리만 기록.
- **ts-morph로 파일 전체 재생성:** `project.save()` 대신 `sourceFile.getFullText()`로 변경된 텍스트만 추출해 diff 표시 후 사용자 confirm 받아야 함.
- **sensitive flag를 MCP 레이어에서 heuristic 적용:** DOM 속성 접근이 필요하므로 반드시 page context(capture 시점)에서 적용.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript AST 편집 | 정규식으로 manifest.ts 텍스트 조작 | ts-morph | 주석 제거, trailing comma 불일치, 중첩 구조 파괴 위험 |
| 파일시스템 watcher | setInterval + fs.stat 폴링 | chokidar | 이벤트 기반, cross-platform, ignore 패턴 지원 |
| sensitive DOM heuristic | 새로 구현 | `isSensitive()` from `@agrune/runtime/dom-utils` (Phase 14 완성) | 35개 테스트, 8단계 heuristic, 다국어 ARIA, ReDoS-safe |
| selector 3종 | 새로 구현 | Phase 13 `window.__agrune_identity__` + Phase 11 SelectorLadder | fiber path, role+name, CSS fallback 이미 구현됨 |

---

## Runtime State Inventory

> Phase 16은 새 상태를 추가하는 단계 — rename 없음.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `~/.agrune/authoring/pending/` 신규 디렉토리 (기존 없음) | Wave 0에서 `mkdir -p` 보장 |
| Live service config | devtools-server.ts: recorder 핸들러 추가 (코드 수정) | 코드 편집 |
| OS-registered state | 없음 | 없음 |
| Secrets/env vars | 없음 — pending 파일에 인증 정보 포함 금지 | 없음 |
| Build artifacts | `@agrune/devtools` dist 재빌드 필요 (RecorderView 추가) | `pnpm --filter @agrune/devtools run build` |

---

## Common Pitfalls

### Pitfall 1: RecorderView Tab 추가 시 index.html과 panel.ts 동기화 누락

**What goes wrong:** `index.html`에 `data-tab="recorder"` 버튼을 추가했는데 `panel.ts`의 `TabId` 타입에 `'recorder'` 추가를 빠뜨리거나, `handleMessage`에 `recorder_*` case를 빠뜨림.
**Why it happens:** 3곳 동기화 필요 (index.html + types.ts + panel.ts).
**How to avoid:** Wave 0 Task 1에서 types.ts 수정을 가장 먼저 — 타입 에러가 가이드 역할.
**Warning signs:** TypeScript 컴파일 에러 없이 빌드되지만 Tab 클릭 시 아무것도 렌더되지 않음.

### Pitfall 2: ts-morph trailing comma 불일치

**What goes wrong:** 기존 manifest.ts가 trailing comma 없는 스타일인데 ts-morph가 `useTrailingCommas: true`로 추가하면 diff preview에 불필요한 변경 포함.
**Why it happens:** ts-morph `useTrailingCommas` 기본값이 프로젝트 tsconfig를 반영하지 않음.
**How to avoid:** `manifest.ts` 첫 배열/객체에서 trailing comma 존재 여부를 텍스트 검사 후 `manipulationSettings.set({ useTrailingCommas })` 동적 설정.
**Warning signs:** diff preview에 추가한 target 외에도 기존 줄의 `,` 추가/제거가 보임.

### Pitfall 3: defineManifest 인자가 ObjectLiteralExpression이 아닌 경우

**What goes wrong:** `const m = { targets: [] }; export default defineManifest(m)` 처럼 변수 참조를 전달하면 `getArguments()[0]`가 Identifier — ObjectLiteralExpression 탐색 실패.
**Why it happens:** ts-morph는 런타임 값을 추론하지 않음, AST만 봄.
**How to avoid:** Phase 16 범위에서는 인라인 object literal 전달 방식만 지원. 변수 참조 감지 시 명확한 에러 메시지 출력.

### Pitfall 4: isSensitive가 page context 외부에서 호출될 때

**What goes wrong:** MCP Node.js 프로세스에서 `isSensitive(el)` 호출 시도 → `HTMLElement` 없음, DOM API 없음.
**Why it happens:** `dom-utils.ts`의 `isSensitive`는 브라우저 DOM에 의존.
**How to avoid:** capture 시점(page context)에서만 호출. CDP `Runtime.evaluate`로 결과를 JSON 직렬화해서 MCP에 전달.

### Pitfall 5: pending 파일 cleanup 정책 부재로 디스크 누적

**What goes wrong:** commit 없이 취소한 pending 파일이 무한 누적.
**How to avoid:** (1) `recorder_commit` 성공 후 해당 파일 삭제, (2) watcher 시작 시 7일 이상 파일 자동 삭제.

### Pitfall 6: WS 연결 끊김 시 recorder mode 상태 불일치

**What goes wrong:** picking 중 WS 재연결 후 RecorderView는 picking이지만 서버 상태는 idle.
**How to avoid:** WS 재연결 이벤트(`ws-client.ts`의 `onStatusChange`) 시 recorder mode를 idle로 강제 리셋.

### Pitfall 7: AI authoring skill corpus synthetic data의 과적합

**What goes wrong:** 합성 폼 corpus만으로 테스트하면 실제 사이트에서 recall 급락.
**Why it happens:** 실제 로그인 폼은 `name="j_password"`, `type="tel"`(핀 입력) 등 비표준 패턴.
**How to avoid:** corpus에 비표준 name 패턴(j_password, pword, pass) + type=tel 포함, CI에서 precision/recall 자동 측정.

---

## Code Examples

### ts-morph: defineManifest 오브젝트 탐색 전체 패턴

```typescript
// Source: [CITED: https://github.com/dsherret/ts-morph/blob/latest/docs/details/expressions.md]
// Source: [CITED: https://github.com/dsherret/ts-morph/blob/latest/docs/details/object-literal-expressions.md]

import { Project, SyntaxKind, IndentationText } from 'ts-morph'

function findDefineManifestArg(manifestPath: string) {
  const project = new Project({ skipAddingFilesFromTsConfig: true })
  const sf = project.addSourceFileAtPath(manifestPath)

  // 방법 A: 직접 descendants 탐색
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression)
  const call = calls.find(c => c.getExpression().getText() === 'defineManifest')

  if (!call) return null
  const arg = call.getArguments()[0]
  if (!arg || arg.getKind() !== SyntaxKind.ObjectLiteralExpression) return null

  return { sf, project, arg: arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression) }
}
```

### pending 파일 기록 (MCP side)

```typescript
// Source: [VERIFIED: node:fs/promises, node:os, node:crypto 기존 사용 패턴]
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

async function writePending(sessionId: string, capture: CommitPayload): Promise<string> {
  const pendingDir = join(homedir(), '.agrune', 'authoring', 'pending', sessionId)
  await mkdir(pendingDir, { recursive: true })
  const fileName = `${capture.ts}.json`
  const filePath = join(pendingDir, fileName)
  await writeFile(filePath, JSON.stringify(capture, null, 2), 'utf-8')
  return filePath
}
```

### capture 시점 selector 3종 (CDP Runtime.evaluate 내부)

```typescript
// Source: [VERIFIED: Phase 13 identity-bridge.ts, Phase 11 SelectorLadder]
// page context에서 실행 (CDP Runtime.evaluate)

function captureElement(el: HTMLElement): CaptureResult {
  const result: CaptureResult = { url: window.location.href }

  // 1순위: fiber path
  const bridge = window.__agrune_identity__
  if (bridge && typeof bridge.resolve === 'function') {
    // 역방향: DOM → path는 FiberIdentityIndex.domToPath에 있으나
    // bridge.resolve는 path→DOM. 따라서 DOM→path 접근은
    // AgruneDevtools가 주입한 indexFiber 결과를 통해 별도 bridge 확장 필요.
    // Phase 16에서 bridge에 resolvePath(el): FiberIdentityPath | null 추가.
  }

  // 2순위: role+name ARIA selector
  const role = el.getAttribute('role') || el.tagName.toLowerCase()
  const ariaLabel = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 50)
  if (ariaLabel) result.roleSelector = `[role="${role}"][aria-label="${ariaLabel}"]`

  // 3순위: CSS fallback
  result.cssSelector = buildDomPathSelector(el)  // dom-utils.ts 기존 함수

  // sensitive auto-detect
  if (isSensitive(el)) result.sensitive = true

  return result
}
```

**주의:** `window.__agrune_identity__` bridge는 현재 `resolve(path→DOM)` 방향만 지원. Phase 16에서 `resolvePath(DOM→path)` 방향을 bridge에 추가해야 fiber path 캡처 가능. [VERIFIED: identity-bridge.ts 직접 확인]

---

## Fiber Path Capture Bridge 확장 필요

[VERIFIED: packages/react/src/bridge/identity-bridge.ts 직접 분석]

현재 `AgruneIdentityBridge`:
```typescript
interface AgruneIdentityBridge {
  resolve(path: FiberIdentityPath): HTMLElement | null  // path → DOM
  readonly version: '1'
}
```

Phase 16 필요 확장:
```typescript
interface AgruneIdentityBridge {
  resolve(path: FiberIdentityPath): HTMLElement | null  // path → DOM (기존)
  resolvePath(el: HTMLElement): FiberIdentityPath | null  // DOM → path (신규)
  readonly version: '2'
}
```

`FiberIdentityIndex`에는 이미 `domToPath: WeakMap<HTMLElement, FiberIdentityPath>`가 있으므로 `getPathByDom(el: HTMLElement): FiberIdentityPath | null` 메서드만 추가하면 됨.

---

## AI Authoring Skill (RECORD-05)

### 기존 annotate skill 위치

[VERIFIED: /Users/chenjing/dev/agrune/skills/skills/annotate/SKILL.md 직접 확인]

기존 skill 경로: `/Users/chenjing/dev/agrune/skills/skills/annotate/`
- `SKILL.md` — data-agrune-* 어노테이션 방식 (v0.4.x용, Phase 17에서 폐기 예정)
- `references/` — pattern-canvas.md, pattern-dialog.md, etc.

**Phase 16에서 신규 작성:** `/Users/chenjing/dev/agrune/skills/skills/manifest/`
- `SKILL.md` — manifest 버전 authoring (`defineManifest` + `defineTarget` 기반)
- `references/` — manifest 패턴 가이드
  - `pattern-login.md` — 로그인 폼 target 정의
  - `pattern-payment.md` — 결제 폼 target 정의 (sensitive:true 예시)
  - `pattern-list.md` — defineRepeat 패턴

### AI authoring skill 작동 방식

```
1. 사용자 요청: "이 React 앱에 manifest 추가해줘"
2. skill이 소스 분석:
   - JSX 인터랙티브 요소 탐색 (button, input, select, a, [role=...])
   - AgruneDevtools import 감지 (이미 있으면 건너뜀)
   - FiberIdentityPath 자동 추론 (componentName 계층)
3. defineManifest 코드 생성 (80-90% target)
4. manifest.ts 파일에 직접 작성 (skill은 소스 파일 직접 작성 가능 — pending 우회 없음)
   (pending 디렉토리는 recorder UI용, AI skill은 직접 manifest.ts 작성)
5. 나머지 10-20%는 사용자 review/확인
```

---

## Corpus + CI 회귀 테스트 (RECORD-04)

### sensitive heuristic precision/recall 테스트 구조

```typescript
// packages/runtime/tests/sensitive-corpus.spec.ts

type FormFixture = {
  html: string          // 폼 HTML snippet
  elements: string[]    // 테스트 대상 selector
  expected: boolean[]   // 각 element의 기대 sensitive 값
  lang: 'ko' | 'en' | 'ja' | 'zh' | 'fr' | 'de' | 'es'
  category: 'login' | 'payment' | 'signup' | 'profile'
}

// 100+ corpus 항목
const CORPUS: FormFixture[] = [
  // 한국어 로그인
  { html: '<input aria-label="비밀번호" />', elements: ['input'], expected: [true], lang: 'ko', category: 'login' },
  // 영어 비표준
  { html: '<input name="j_password" />', elements: ['input'], expected: [true], lang: 'en', category: 'login' },
  // 일본어 결제
  { html: '<input aria-label="カード番号" />', elements: ['input'], expected: [false], lang: 'ja', category: 'payment' },
  // CVV
  { html: '<input placeholder="CVV" />', elements: ['input'], expected: [true], lang: 'en', category: 'payment' },
  // ... 97개 추가
]

// precision/recall 자동 계산
function computeMetrics(corpus: FormFixture[], isSensitiveFn: (el: HTMLElement) => boolean) {
  let tp = 0, fp = 0, fn = 0
  // ...
  return { precision: tp / (tp + fp), recall: tp / (tp + fn) }
}
```

**목표:** precision ≥ 0.90, recall ≥ 0.95 (CI에서 실패 시 블록)

---

## React TodoMVC Demo (RECORD-05)

### demo fixture 위치

```
packages/e2e/fixtures/todomvc/    # 또는 별도 demo 레포
├── index.html
├── App.tsx
├── manifest.ts                    # AI skill이 생성하는 대상
└── README.md
```

**검증 방법:**
1. AI skill이 TodoMVC 소스 분석 → `manifest.ts` 생성
2. `agrune manifest validate manifest.ts --url http://localhost:3000` 실행
3. 매칭된 target 비율 ≥ 80% 확인

[ASSUMED] demo fixture를 `packages/e2e/fixtures/`에 두는 것이 기존 패턴(validate-test.html 위치)과 일치하나, 독립 레포/디렉토리도 가능.

---

## `agrune manifest dev` CLI 서브커맨드

[VERIFIED: packages/mcp/bin/agrune-mcp.ts 직접 확인]

기존 패턴 (`manifest validate` 서브커맨드):
```typescript
if (args[0] === 'manifest') {
  const subArgs = args.slice(1)
  if (subArgs[0] === 'validate') {
    const { runValidateCli } = await import('../src/manifest-validate-cli.js')
    const code = await runValidateCli(subArgs.slice(1))
    process.exit(code)
  }
  // Phase 16 추가:
  if (subArgs[0] === 'dev') {
    const { runManifestDevWatcher } = await import('../src/manifest-dev-watcher.js')
    await runManifestDevWatcher(subArgs.slice(1))
    // watcher는 Ctrl+C까지 지속 실행
  }
}
```

`agrune manifest dev [manifest-file]` 사용 예시:
```bash
agrune manifest dev src/manifest.ts
# Watching ~/.agrune/authoring/pending/ for new captures...
# [capture] url=http://localhost:3000, targetId=login-btn detected
# + defineTarget({ targetId: 'login-btn', selector: { fiber: [...], css: '#login' } })
# Apply? [y/N]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| data-agrune-* 인라인 어노테이션 | defineManifest 외부 manifest | 2026-04-19 v0.5 pivot | inline 폐기, manifest 단일 소스 |
| annotation authoring skill (v0.4.x) | manifest authoring skill (v0.5) | Phase 16 | 소스 파일에 JSX 속성 추가 → TypeScript manifest 파일 생성 |
| 없음 (수동 manifest 작성) | RecorderView + pending → ts-morph 머지 | Phase 16 신규 | 브라우저 UI에서 click-to-capture |

**Deprecated/outdated:**
- `skills/skills/annotate/SKILL.md`: data-agrune-* 방식 — Phase 17에서 제거 예정. Phase 16에서는 병행 유지.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | prettier 연동 여부는 사용자 선택 — ts-morph 머지 후 prettier 실행 선택적 | Pattern 4 | prettier 없이 머지하면 코드 스타일 불일치. 낮은 위험 (diff 보고 후 사용자 판단) |
| A2 | demo fixture를 `packages/e2e/fixtures/todomvc/`에 배치 | RECORD-05 section | 위치 변경 시 경로 수정 필요. 위험 없음 |
| A3 | AI skill이 manifest 파일을 directly 작성 (pending 우회) | AI authoring skill section | skill이 pending 경유해야 한다면 watcher 불필요한 복잡성. CONTEXT.md에서 "pending은 recorder UI용"으로 읽음 |
| A4 | corpus 100+ 항목을 합성 데이터(HTML snippet)로 구성, 실제 사이트 HTML 미사용 | Corpus section | 합성 데이터로 precision/recall 검증 한계. 실제 사이트 HTML 추가 시 recall 개선 가능 |
| A5 | `agrune manifest dev` 서브커맨드가 `agrune manifest validate`와 동일 파일(`agrune-mcp.ts`)에서 분기 | CLI section | CLI 패키지 분리 시 구조 변경 필요. 현재 CLI가 mcp bin에 통합되어 있음을 확인 |

**A3 근거:** CONTEXT.md "NO direct source-file writes — pending 디렉토리만 사용" 조항은 **recorder UI**의 제약. AI skill은 독립적인 authoring 경로이며 직접 manifest.ts 작성이 더 자연스럽다. REQUIREMENTS.md RECORD-05 "소스 접근 가능한 React 프로젝트에서 AI authoring skill이 ~80-90% target 자동 생성"도 pending 경유를 명시하지 않는다.

---

## Open Questions

1. **AgruneIdentityBridge v2 — bridge 버전 충돌**
   - What we know: 현재 bridge.version = '1', `resolve(path→DOM)` 방향만 있음
   - What's unclear: bridge를 v2로 올릴 때 기존 코드가 `version: '1'` 체크하는 곳이 있는지
   - Recommendation: `resolvePath` 추가 후 `version: '2'`로 올리고, `typeof bridge.resolvePath === 'function'` guard로 구버전 bridge와 coexist

2. **capture 시점 vs commit 시점 — targetId 결정**
   - What we know: pending 파일 spec에 `targetId` 필드 있음
   - What's unclear: targetId를 (a) 사용자가 RecorderView에서 입력, (b) fiber componentName 기반 자동 생성, (c) watcher가 manifest에서 기존 ID와 중복 확인 중 어느 방식?
   - Recommendation: (b) 자동 생성 기본 + 사용자 편집 가능한 input 필드 제공. 중복은 watcher가 경고.

3. **CI에서 `agrune manifest dev` watcher 테스트**
   - What we know: watcher는 Ctrl+C까지 지속 실행, CI에서 자동 종료 필요
   - What's unclear: watcher 동작을 단위 테스트로 검증할 수 있는지 (chokidar mock)
   - Recommendation: `ManifestDevWatcher` 클래스로 분리, chokidar를 DI 주입해서 vitest에서 mock 가능하게 설계

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (node:fs, node:os, node:crypto) | pending store, watcher | ✓ | macOS 25.4.0 환경 | — |
| ts-morph | manifest-dev-watcher.ts | 미설치 (신규 추가 필요) | 28.0.0 (최신) | — |
| chokidar | manifest-dev-watcher.ts | 미설치 (신규 추가 필요) | 5.0.0 (최신) | — |
| React (for demo fixture) | RECORD-05 TodoMVC demo | ✓ (packages/react 존재) | 18+ | — |

[VERIFIED: packages/mcp/package.json — ts-morph, chokidar 미포함 확인]

**Missing dependencies with no fallback:**
- `ts-morph@28.0.0` — manifest AST 편집 핵심. 없으면 RECORD-03 불가.
- `chokidar@5.0.0` — pending 디렉토리 watcher. 없으면 RECORD-03 불가.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.0 |
| Config file | packages/mcp/vitest.config.ts (기존), packages/devtools/vitest.config.ts (기존) |
| Quick run command | `pnpm --filter @agrune/mcp run test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RECORD-01 | RecorderView mode state machine | unit | `pnpm --filter @agrune/devtools run test` | ❌ Wave 0 |
| RECORD-02 | recorder_* WS 메시지 라우팅 | unit | `pnpm --filter @agrune/mcp run test` | ❌ Wave 0 |
| RECORD-03 | ts-morph defineManifest targets 추가 | unit | `pnpm --filter @agrune/mcp run test` | ❌ Wave 0 |
| RECORD-04 | sensitive corpus precision/recall | unit | `pnpm --filter @agrune/runtime run test` | ❌ Wave 0 |
| RECORD-05 | AI skill demo (80%+ target 생성) | manual | `/agrune:manifest` skill 실행 후 validate | manual-only |

### Wave 0 Gaps

- [ ] `packages/devtools/tests/recorder-view.spec.ts` — RecorderView mode 전환 테스트
- [ ] `packages/mcp/tests/pending-store.spec.ts` — PendingStore 파일 기록/삭제 테스트
- [ ] `packages/mcp/tests/manifest-dev-watcher.spec.ts` — chokidar mock + ts-morph merge 테스트
- [ ] `packages/runtime/tests/sensitive-corpus.spec.ts` — corpus 100+ precision/recall 테스트
- [ ] ts-morph, chokidar npm 설치: `pnpm --filter @agrune/mcp add ts-morph chokidar`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (pending dir) | homedir() 경로 사용 — OS 사용자 권한으로 격리 |
| V5 Input Validation | yes | ts-morph AST 조작 전 validateManifest 호출 |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| pending 파일 경로 traversal (`../../etc/passwd`) | Tampering | `join(homedir(), '.agrune', 'authoring', 'pending', sessionId)` 고정 경로, sessionId는 UUID |
| ts-morph가 manifest.ts 외 파일 수정 | Tampering | `project.addSourceFileAtPath(manifestPath)` 단일 파일 — 다른 파일 접근 없음 |
| recorder_commit에 arbitrary JS 삽입 | Tampering | pending JSON에서 ts-morph로 추가 시 `sanitizeTargetId` (영문자·숫자·-·_ 만 허용) |
| capture 결과에 비밀번호 값 노출 | Info Disclosure | capture는 selector만 캡처 (element 값 제외). sensitive:true 표시만 |
| watcher가 외부 디렉토리 감시 | Elevation | pendingDir 고정 + chokidar depth:2 제한 |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase] `packages/devtools/src/types.ts` — InboundMessage/OutboundMessage union 구조
- [VERIFIED: codebase] `packages/devtools/src/panel.ts` — TabId, handleMessage switch 패턴
- [VERIFIED: codebase] `packages/devtools/src/logs-view.ts`, `hitl-toolbar.ts` — class + innerHTML 패턴
- [VERIFIED: codebase] `packages/mcp/src/devtools-server.ts` — handleClientMessage switch 확장 패턴
- [VERIFIED: codebase] `packages/react/src/bridge/identity-bridge.ts` — AgruneIdentityBridge 인터페이스
- [VERIFIED: codebase] `packages/react/src/fiber/identity-index.ts` — FiberIdentityIndex domToPath WeakMap
- [VERIFIED: codebase] `packages/runtime/src/runtime/dom-utils.ts` — isSensitive, SENSITIVE_* exports
- [VERIFIED: codebase] `packages/mcp/bin/agrune-mcp.ts` — 서브커맨드 분기 패턴
- [CITED: Context7 /dsherret/ts-morph] object literal 편집, manipulation settings, file save 패턴
- [VERIFIED: npm registry] ts-morph@28.0.0, chokidar@5.0.0

### Secondary (MEDIUM confidence)
- [VERIFIED: Phase 11-01 SUMMARY] defineManifest SDK 구조, SelectorLadder, sensitive:true pattern
- [VERIFIED: Phase 13-01/02 SUMMARY] FiberIdentityPath, bridge.resolve(path→DOM) 방향
- [VERIFIED: Phase 14-01 SUMMARY] isSensitive 8단계 heuristic, corpus 구성 근거

### Tertiary (LOW confidence)
- [ASSUMED] A3: AI skill이 pending 우회하고 직접 manifest.ts 작성 가능
- [ASSUMED] A4: 합성 corpus 100개로 precision/recall 검증 가능

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm 버전 직접 확인, 기존 패키지 dep 구조 확인
- Architecture: HIGH — 기존 코드베이스 4개 패턴 클래스 직접 분석
- Pitfalls: MEDIUM — ts-morph trailing comma, bridge 방향 역전은 코드 분석 기반. 실제 실행 중 추가 엣지케이스 가능
- AI skill: MEDIUM — 기존 annotate skill 구조 확인, manifest 버전은 신규

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable stack, 30일)

---

## RESEARCH COMPLETE
