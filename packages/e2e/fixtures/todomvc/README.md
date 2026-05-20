# TodoMVC · agrune Manifest Authoring Demo

## Purpose (RECORD-05)

`agrune:manifest` authoring skill이 **소스 접근 가능한 React 프로젝트**에서 ~80–90% target을 자동 생성한다는 것을 데모 + 수동 체크리스트로 검증한다. CI는 heuristic 적중률을 증명하지 못하므로 (AI output is non-deterministic), 이 fixture는 **사람이 실행하는 수락 시험대**다.

## What's in this directory

| File | Role |
|---|---|
| `index.html` | Vite entry — `<div id="root">` + CSS + `<script type="module" src="./App.tsx">` |
| `App.tsx` | TodoMVC React 컴포넌트 (표준 new-todo input, toggle-all, todo 리스트, filter, clear-completed) |
| `manifest.ts` | **수작업 reference manifest** — AI skill output이 닮아야 할 최종 형태. 8 static targets + 1 `defineRepeat` (todo rows) |
| `README.md` | 이 파일 — 실행 방법 + RECORD-05 수락 체크리스트 |

## Important note

**이 fixture는 `packages/e2e/` 워크스페이스 내에서 실행되지 않는다.** `@agrune/e2e`는 `react` / `react-dom` 을 devDep으로 갖지 않으며, `packages/e2e/tsconfig.json`의 `include`는 `tests/**`와 `playwright.config.ts`만 포함한다 (`fixtures/todomvc/**`는 typecheck 대상 아님).

실제 실행이 필요하면 별도 Vite + React 프로젝트에 복사 후 `pnpm add react react-dom`한 뒤 `vite` 실행. 현재 목적은 **구조 reference + 수동 AI skill 검증 대상**.

## 수동 실행 방법 (demo)

1. 별도 터미널에서 임시 Vite 프로젝트 생성:
   ```
   pnpm create vite@latest todomvc-demo --template react-ts
   cd todomvc-demo
   pnpm add @agrune/manifest
   cp /Users/chenjing/dev/agrune/agrune/packages/e2e/fixtures/todomvc/{App.tsx,manifest.ts,index.html} .
   pnpm dev
   ```

2. 모노레포 터미널에서 agrune MCP server 확인:
   ```
   pnpm --filter agrune run build
   pnpm --filter agrune exec agrune --help
   ```

3. Claude Code 또는 Codex CLI에서 이 프로젝트 디렉터리를 열고:
   - `App.tsx`가 있는 상태에서 "이 TodoMVC에 agrune manifest 추가" 또는 `/agrune:manifest` 스킬 호출.
   - skill이 생성한 `manifest.ts`를 이 디렉토리의 reference `manifest.ts`와 비교.

## RECORD-05 수락 체크리스트

AI skill 출력이 다음을 모두 만족해야 pass:

- [ ] 생성된 manifest에 **6/8 static target 이상**이 자동 포함
  - `new_todo_input`
  - `toggle_all`
  - `filter_all` / `filter_active` / `filter_completed`
  - `clear_completed_button`
  - (선택) `todo_item_toggle` / `todo_item_label` / `todo_item_destroy` — 이들은 repeat 안쪽
- [ ] `todo_items` **`defineRepeat`가 생성**됨
  - 최소 `containerSelector: { css: '.todo-list' }` + `targets: [...]` + `keyFrom` + `strategy: 'dom'`
  - `keyFrom`이 `el.dataset.id` 또는 동등한 unique key 추출 표현식
- [ ] 전체 9 target 정의 (static 6 + repeat 내부 3) 중 **≥ 7개 자동 생성 (≥ 77%)**
- [ ] Manifest schema/target shape 수동 검증 통과:
  - Hash class selector 없음
  - `:nth-child` 없음
  - 모든 target에 `actionKinds` ≥ 1
  - 중복 `targetId` 없음
- [ ] `sensitive: false` 한 건도 없음 (이 demo는 password 필드가 없어 sensitive key 자체가 등장하지 않는 것이 옳음)

## AI skill의 현실적 한계

- **Type 추론**: AI는 `<input type="checkbox">` + `onChange`만 보고 `['click']`으로 매핑 — 이건 맞다.
- **Dynamic list detection**: `todos.map(todo => ...)` 패턴을 `defineRepeat`로 변환하는 것이 가장 어려운 부분. skill이 `containerSelector` + `keyFrom` 추출에 실패하면 수동 보정 필요.
- **actionKinds 혼동**: `<label onDoubleClick>`에 `['dblclick']` 대신 `['click']`으로 잘못 낼 수 있음. 수동 수정 예상 범위.
- **Sensitive 누락/과탐지**: TodoMVC엔 password 없음. 만약 skill이 억지로 `sensitive: true`를 붙이면 **실패** (precision 목표 위반).

## 왜 CI가 아니라 수동인가

- AI output은 deterministic 재현 불가 — 모델 버전, 샘플링, 프롬프트 drift 모두 영향.
- 자동 증거는 `packages/runtime/tests/sensitive-corpus.spec.ts` (RECORD-04) 에 존재 — sensitive heuristic의 precision/recall는 100% 재현 가능.
- Phase 16 scope에서 RECORD-05는 **수동 게이트**로 수용. Phase 18 (registry) 이후 seed manifest 누적 시 skill regression을 정기 측정하는 별도 infra를 추가하는 것이 v0.6+ 계획.

## 관련 파일

- `.agents/skills/manifest/SKILL.md` — skill 진입점
- `.agents/skills/manifest/references/pattern-list.md` — `defineRepeat` 상세 예시 (이 fixture의 todo_items는 해당 패턴 참조)
- `packages/runtime/tests/sensitive-corpus.spec.ts` — RECORD-04 자동 증거
- `.planning/phases/16-record/16-04-PLAN.md` — 전체 계획
