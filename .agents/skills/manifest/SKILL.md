---
name: agrune:manifest
description: agrune manifest 작성 — defineManifest + defineTarget + defineRepeat + defineMacro 기반 타입 안전 authoring. data-agrune-* 인라인 어노테이션(annotate skill)의 v0.5 후속. "manifest 추가해줘", "agrune 타깃 생성", "이 React 앱 AI 자동화 가능하게 해줘"에 발동.
argument-hint: "[auto|interactive] [path/to/manifest.ts]"
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Agent
---

# agrune Manifest Authoring

React(또는 소스 접근 가능한) 프로젝트의 인터랙티브 요소를 분석하여, 외부 `manifest.ts` 한 파일로 AI 제어 표면을 정의한다. inline `data-agrune-*` 어노테이션 방식(v0.4 이하)과 달리, 컴포넌트 소스는 한 줄도 고치지 않는다 — root에 `<AgruneDevtools>` 1개만 추가하고, 모든 target 매핑은 manifest 하나에서 이루어진다.

## When to use

- React 프로젝트에 agrune runtime을 신규 통합할 때
- 외부 사이트용 manifest를 작성할 때 (CSS selector fallback 전용, fiber selector 사용 불가)
- 기존 inline `data-agrune-*` 어노테이션 프로젝트를 v0.5 manifest 버전으로 마이그레이션할 때 (Phase 17 removal 이전 단계)
- Recorder가 DevTools에서 생성한 pending capture를 수동으로 manifest에 반영하고 싶을 때 (`agrune manifest dev` watcher와 상보)

## Core workflow

1. **프로젝트 분석**: 라우트별 interactive element (button, input, select, a, [role=*])를 Glob + Grep으로 탐색. React 컴포넌트 트리에서 DOM을 만드는 leaf 컴포넌트 우선.
2. **Root-import 여부 확인**: `<AgruneDevtools manifest={m} mode="dev" />`이 앱 entry (일반적으로 `App.tsx` 또는 `main.tsx`)에 이미 존재하는가? 없으면 1줄 추가한다. React 프로젝트 외 (Vue/Svelte/HTML)는 v0.6+ 대기.
3. **manifest.ts 생성**: `defineManifest({ groups: [defineGroup({ groupId, targets: [defineTarget({...})] })] })`. 최소 groupId 하나부터 시작.
4. **Target 정의 규칙** (상세는 references 참조):
   - `targetId`: snake_case lowercase. 페이지/섹션 맥락을 담되 짧게 (`login_button`, `new_todo_input`).
   - `selector`: `{ role?, text?, testId?, attr?, css?, fiber? }` — at-least-one. React 프로젝트는 `fiber` + `css` fallback. 외부 사이트는 `role` > `text` > `testId` > `attr` > `css` 순으로 선호.
   - `actionKinds`: `['click']` / `['fill']` / `['click','fill']` / `['dblclick']` / `['contextmenu']` / `['hover']` / `['longpress']` 중 하나 이상.
   - `sensitive: true` — 비밀번호(type=password) / CVV / OTP / autocomplete=*-password 등. **`false`는 스키마 금지 (z.literal(true))** — OR-only 계약. 필드 생략이 default false.
5. **Validate**: `pnpm exec agrune manifest validate src/manifest.ts` — target shape + selector 금칙(hash class, `:nth-child`) 검증. 필요시 `--url https://site.example`로 live DOM matching 확인.
6. **Recorder 연동 (optional)**: `agrune manifest dev src/manifest.ts` watcher를 띄워두면, DevTools webapp의 RecorderView에서 캡처한 target이 pending JSON → ts-morph merge → manifest.ts에 자동 append된다.

## Output shape (반드시 이 형태)

```typescript
// src/manifest.ts
import {
  defineManifest,
  defineGroup,
  defineTarget,
  defineRepeat,
  defineMacro,
} from '@agrune/manifest'

export default defineManifest({
  groups: [
    defineGroup({
      groupId: 'login',
      route: '/login',
      targets: [
        defineTarget({
          targetId: 'email_input',
          selector: { role: { name: 'textbox' }, css: 'input[type=email]' },
          actionKinds: ['fill'],
        }),
        defineTarget({
          targetId: 'password_input',
          selector: { role: { name: 'textbox' }, css: 'input[type=password]' },
          actionKinds: ['fill'],
          sensitive: true,           // ← OR-only: true만 허용, false 불가
        }),
        defineTarget({
          targetId: 'submit_button',
          selector: { role: { name: 'button' }, text: '로그인' },
          actionKinds: ['click'],
        }),
      ],
    }),
  ],
})
```

## References (on-demand — progressive disclosure)

이 파일은 skill의 진입점이다. 각 폼/UI 패턴은 별도 reference 파일에 상세 예시로 분리돼 있어 필요할 때만 읽어라:

- [Login forms](references/pattern-login.md) — email/password, autocomplete, sensitive:true 적용 규칙
- [Payment forms](references/pattern-payment.md) — 카드번호/만료일/CVV, `autocomplete=cc-*` 매핑
- [Lists (`defineRepeat`)](references/pattern-list.md) — 동적 리스트, keyFrom/nameFrom, strategy(dom|virtualized)
- [Navigation / buttons](references/pattern-navigation.md) — 일반 탐색, 메뉴, 링크 (non-sensitive)

## Rules (hard constraints)

- **`sensitive: false` 금지** — 스키마가 `z.literal(true).optional()`로 강제. 필드가 sensitive이면 `sensitive: true`, 아니면 필드 **자체 생략**. `false`를 썼다간 컴파일이 깨진다.
- **Hash class CSS selector 금지** — `.css-abc123`, `.sc-xyz789` 같은 CSS-in-JS 해시는 빌드마다 바뀐다. `data-testid` / `role` / `text` / `css :is(#stable, [data-*])` 를 우선.
- **`:nth-child(n)` 금지** — reorder 취약. 대신 key 기반 `defineRepeat` 또는 텍스트 anchor를 사용.
- **actionKinds는 실제 지원만** — 버튼 ≠ fill, input ≠ click submit. 애매하면 `['click']`로 기본 + 사용자가 교정하도록 남긴다.
- **`targetId`는 snake_case unique** — 같은 manifest 내에서 중복 불가. 페이지 맥락 접두어(`login_`, `settings_`)로 충돌 회피.

## Output target coverage (RECORD-05)

- **소스 접근 가능한 React 프로젝트** (owned code): ~80-90% interactive target 자동 생성 기대. 사용자가 나머지 10-20%를 review/수동 조정.
- **외부 사이트 (source 없음)**: ~50-70% — role/text 기반 selector는 DOM 스냅샷에서 추정 가능하지만, React fiber selector는 포기. CSS fallback만 가능.
- **비 React 프로젝트 (Vue/Svelte/HTML)**: v0.6+ 대기. 현재는 CSS-only로 수동 작성 추천.

## Handoff to recorder workflow (optional)

이 skill은 **소스 파일 직접 수정**이 기본 흐름이다 (AI agent는 신뢰된 writer — 프로젝트 owner가 PR review로 gate).

반대편에 **recorder UI** 경로가 있다 — DevTools webapp의 `RecorderView`에서 사용자가 element를 picking하면:
1. MCP `recorder_*` WS 프로토콜로 세션 ID 발급
2. 사용자가 Enter 누르면 `recorder_commit`
3. PendingStore가 `$HOME/.agrune/authoring/pending/<session>/<target>.json`에 저장
4. `agrune manifest dev src/manifest.ts` watcher가 ts-morph로 읽어와 `defineTarget(...)` expression으로 머지
5. CLI가 unified diff 프리뷰 → 사용자가 `y` 입력 → `manifest.ts` 실제 write

**이 skill이 pending 경로를 직접 사용하려면** 같은 `PendingCaptureFile` JSON shape으로 drop만 하면 된다. `agrune manifest dev`가 자동으로 catch.

## CLAUDE.md / 프로젝트 가이드 준수

프로젝트 루트에 `CLAUDE.md` 또는 `AGENTS.md`가 있으면 먼저 읽어서 빌드/테스트 명령, 코드 스타일, 금지 패턴(예: `data-agrune-*` 사용 금지)을 파악하고 따를 것. agrune 모노레포 자체는 `pnpm build` 필수, manifest 파일 수정 후 `pnpm --filter @agrune/manifest run typecheck`로 검증한다.

## Argument 모드

`$ARGUMENTS`로 모드를 받는다:

- **auto** (기본): 분석 후 전체 manifest를 한 번에 생성. 애매한 경우 안전한 기본값 (`['click']`, `sensitive` 생략).
- **interactive**: 각 target 추가 시 사용자 확인 — actionKinds, sensitive flag, route grouping에 질문.

두 번째 인자로 target manifest path를 받을 수 있다 (`src/manifest.ts` 기본). 이미 존재하면 기존 groups/targets를 존중하고 새 target만 append.
