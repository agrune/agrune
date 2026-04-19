# Agrune Manifest Authoring Workflow

> **v0.5 이후 authoritative source**: [`.agents/skills/manifest/SKILL.md`](../../.agents/skills/manifest/SKILL.md) 가 manifest authoring 의 공식 매뉴얼입니다. 이 파일은 하네스 호환을 위해 유지되는 하네스 중립 요약판입니다 — 외부 하네스 어댑터가 이 경로를 이미 링크해둔 경우를 대비해 경로(`workflows/annotate/WORKFLOW.md`) 는 그대로 두지만, 새로운 authoring 규칙/예제/패턴은 반드시 SKILL.md 를 업데이트합니다.

이 문서는 Agrune 를 사용하기 위해 필요한 manifest authoring workflow 의 하네스 중립 요약입니다. 하네스별 스킬·플러그인·에이전트 지침은 SKILL.md 또는 이 문서를 복제해서 제각각 진화시키지 말고, 여기 정의된 절차를 각 하네스 문법으로 얇게 감싸는 방식으로 유지합니다.

## 목표

- 사람이 실제로 조작할 인터랙션만 외부 `manifest.ts` 파일에 `defineTarget` 으로 선언한다
- 앱 컴포넌트 소스는 건드리지 않는다 (owned 앱은 root 에 `<AgruneDevtools />` 1 줄만 추가)
- 외부 사이트는 소스 접근 없이 `role` / `text` / `testId` / `css` selector 로 매핑한다
- 민감 입력은 manifest 의 `sensitive: true` (OR-only) + `autocomplete=current-password` 같은 DOM 힌트로 보호한다
- DOM 구조가 바뀌어도 의미가 유지되도록 `targetId` 와 `groupId` 를 명사·단위 중심으로 설계한다

## 기본 절차 (manifest authoring 3 단계)

1. **manifest.ts 작성**: `@agrune/manifest` SDK 의 `defineManifest({ groups: [defineGroup({ groupId, targets: [defineTarget({...})] })] })` 로 필요한 인터랙티브 요소를 선언한다.
   - `targetId`: snake_case unique. 페이지 맥락 접두어 (`login_`, `settings_`) 로 충돌 회피.
   - `selector`: `{ role?, text?, testId?, attr?, css?, fiber? }` — at-least-one. owned React 는 `fiber + css fallback`, 외부 사이트는 `role > text > testId > attr > css` 선호.
   - `actionKinds`: 실제 지원되는 인터랙션만 (`['click']` / `['fill']` / `['dblclick']` / `['contextmenu']` / `['hover']` / `['longpress']`).
   - `sensitive: true` — 비밀번호·CVV·OTP. OR-only (스키마가 `z.literal(true)`), 비-민감 필드는 필드 자체를 생략.
2. **검증**: `agrune manifest validate src/manifest.ts` 로 shape + selector 금칙(hash class, `:nth-child`) 를 체크하고, `--url <URL>` 옵션을 주면 live DOM 매칭을 확인한다.
3. **iterative 편집**: `agrune manifest dev src/manifest.ts` 로 watcher 를 띄우면, DevTools webapp 의 RecorderView 에서 캡처한 pending target 이 ts-morph merge 로 `manifest.ts` 에 자동 append 된다. 사용자는 unified diff 프리뷰를 확인한 뒤 `y` 를 입력해 write 를 승인.

## 네이밍 원칙

- `targetId` 는 사용자 관점에서 바로 이해되는 동사·명사 조합을 쓴다 (`submit_button`, `new_todo_input`).
- "button1", "input_field" 같은 구현 중심 이름은 피한다.
- 같은 화면 안에서 같은 의미가 반복되면 `groupId` 또는 `defineRepeat` 으로 구분한다.
- `groupId` 는 화면 구조가 아니라 사용자 작업 단위 (`login`, `checkout`, `sidebar_nav`) 에 맞춘다.

## Repeat / Macro 원칙

- 동적 리스트(TodoMVC, 검색 결과, 채팅 메시지 등) 는 `defineRepeat({ repeatId, template, keyFrom, nameFrom, strategy, containerSelector, targets })` 으로 한 번에 등록.
  - `keyFrom` 은 `el.dataset.id ?? ""` 처럼 DOM 에서 stable key 를 뽑는 JS 표현식.
  - `strategy: 'dom'` 은 일반 리스트, `'virtualized'` 는 react-window 류 가상 리스트.
- 로그인·결제 같은 복합 플로우는 `defineMacro({ macroId, steps: [...] })` 로 묶어 `agrune_macro_run` 도구로 실행.

## 피해야 할 것

- Hash class CSS selector (`.css-abc123`, `.sc-xyz789`) — CSS-in-JS 빌드마다 바뀐다. `data-testid` / `role` / `text` 를 선호.
- `:nth-child(n)` — 리스트 reorder 에 취약. 대신 key 기반 `defineRepeat` 또는 텍스트 anchor 를 사용.
- 실제 인터랙션이 불가능한 장식 요소를 target 으로 잡는 것.
- 민감 필드에 `sensitive: true` 를 누락하는 것 (런타임 heuristic 이 보조로 감지하지만 manifest 선언이 1 차 방어선).
- 빌드 산출물이나 런타임에 잠깐 생기는 내부용 DOM 을 타깃으로 잡는 것.

## 결과물 기대치

- `manifest.ts` 파일 (`export default defineManifest({ ... })`) — 필요하면 `src/` 하위 여러 파일로 분리해 composition.
- 새로 추가한 group / target 의 의미가 드러나는 간단한 설명 (주석 또는 커밋 메시지).
- 필요하면 `agrune manifest validate --url` 결과 스냅샷으로 target 매칭이 올바른지 근거 제시.

## 하네스별 wrapping

- **Claude Code / Codex**: MCP stdio 설정에 `agrune-mcp` 바이너리를 등록하면, `manifest` skill 을 호출해 `manifest.ts` 를 생성·수정할 수 있다. Skill 파일은 `.agents/skills/manifest/SKILL.md` 가 authoritative.
- **기타 MCP 하네스**: 이 워크플로의 3 단계 (`작성 → validate → dev watcher`) 를 해당 하네스의 tool-call 문법으로 감싼다. `agrune manifest {validate|dev}` 는 CLI 이므로 shell-exec 권한이 있는 하네스면 모두 호출 가능.

## Deprecated workflows

Prior to agrune v0.5, target 정의는 앱 소스에 legacy HTML data attribute (`data-agrune-` prefix 시리즈: action / name / group / sensitive 등) 를 추가하는 방식이었습니다. 이 경로는 Phase 17 (v0.5) 에서 runtime 스캐너가 제거되어 더 이상 지원되지 않습니다. 기존 프로젝트의 upgrade 경로:

1. 기존 legacy 속성 목록을 훑어 각 element 의 의미를 파악한다.
2. `@agrune/manifest` SDK 로 외부 `manifest.ts` 를 작성하면서, 각 속성(action / name / group / sensitive) 의 의미를 `defineTarget({ targetId, selector, actionKinds, sensitive })` 필드로 재표현한다 — 속성명-필드명 매핑: name → targetId, action → actionKinds, group → groupId (defineGroup), sensitive → sensitive.
3. 앱 소스에서 해당 속성을 제거 (또는 fixture-only 로 남겨두어도 runtime 은 무시).
4. `agrune manifest validate --url <URL>` 로 live DOM 매칭이 모두 살아있는지 확인.

### Reference manifest

실제 동작하는 manifest 예시는 [`packages/e2e/fixtures/todomvc/manifest.ts`](../../packages/e2e/fixtures/todomvc/manifest.ts) — TodoMVC 의 8 개 static target + `defineRepeat` 하나로 인터랙티브 표면을 완전히 매핑한 레퍼런스 구현. 신규 프로젝트 authoring 시 minimal complete example 로 참고.
