---
phase: "17-remove"
plan: "03"
subsystem: documentation
tags:
  - documentation
  - terminology-rewrite
  - manifest-pivot
  - sot-pointer
requirements:
  - REMOVE-02
dependency_graph:
  requires:
    - "17-01: runtime/browser src 에서 legacy 경로 제거 (docs가 가리킬 현재 아키텍처 존재 보장)"
    - "17-02: e2e bootstrap manifest-only (docs가 runtime 계약을 manifest-only로 선언하는 근거)"
  provides:
    - "product-surface 문서 7개가 manifest + CDP 정체성 반영"
    - "`.agents/skills/manifest/SKILL.md` = v0.5 authoritative SOT 배치 확정 (README, AGENTS, WORKFLOW.md에서 pointer)"
    - "v0.5 Breaking Changes 공지 블록 (packages/mcp/README.md)"
    - "Wave 4 (17-04) regression guard allow-list 설계에 필요한 '문서가 legacy 속성을 0회 참조한다' 기반선"
  affects:
    - "외부 하네스 어댑터가 `workflows/annotate/WORKFLOW.md` 를 이미 링크해둔 경우 — 파일 경로/이름은 보존 (breaking 아님)"
    - "외부 소비자가 `@agrune/core/annotation-lint` 패키지 API 에 의존 — 온전히 유지 (Success Criteria 4 예외)"
    - "`package.json` 의 `lint:annotations` script — 본 plan 은 본문 설명만 정리, script 엔트리 자체는 건드리지 않음 (17-04 이관)"
tech-stack:
  added: []
  patterns:
    - "SOT pointer placement — README Manifest 섹션 + AGENTS 상단 + WORKFLOW.md 최상단 + packages/mcp/README 관련 디렉터리 에 `.agents/skills/manifest/SKILL.md` 를 명시 (4 개 문서에서 동일 pointer 반복 — agent가 어느 진입점에서 들어와도 authoritative source 로 수렴)"
    - "의미 반전 후에도 파일명/경로 유지 — `workflows/annotate/WORKFLOW.md` 디렉터리명은 'annotate' 인 채로 내용을 manifest-centric 으로 재작성. 외부 하네스 링크 안정성 확보 (17-02 의 `legacy-annotated.html` 의미반전과 동일 전략)"
    - "legacy attribute 지칭 phrasing 전략 — Deprecated workflows 블록에서 `` `data-agrune-action` `` 같은 regex-literal 을 쓰면 Wave 4 regression grep 에 걸리므로, `data-agrune-` prefix 시리즈 / name → targetId / action → actionKinds 같은 자연어 mapping 으로 설명"
    - "description 정리 vs script 엔트리 보존 — README/AGENTS 의 `pnpm lint:annotations` 설명을 '외부 소비자용 build-linter' 로 rephrase 했지만 script 이름/경로/호출 행 자체는 건드리지 않음 (W4 가 삭제 여부 결정)"
key-files:
  created: []
  modified:
    - "README.md"
    - "AGENTS.md"
    - "PRIVACY.md"
    - "workflows/annotate/WORKFLOW.md"
    - "docs/agent-setup.md"
    - "docs/improvement-notes.md"
    - "packages/mcp/README.md"
  deleted: []
decisions:
  - "파일명/디렉터리명 보존 (`workflows/annotate/WORKFLOW.md`) — 외부 하네스 어댑터가 이미 링크해둘 가능성 높음 (RESEARCH.md Open Q 3 권고 a)"
  - "`lint:annotations` script 엔트리 자체는 건드리지 않음 — Wave 4 (17-04) 가 삭제 여부 결정. 본 plan 은 본문 설명만 정리"
  - "SOT pointer = `.agents/skills/manifest/SKILL.md` — README/AGENTS/WORKFLOW.md/packages/mcp/README 4 개 문서에서 반복 선언해 agent 가 어느 진입점에서 들어와도 동일한 authoritative source 로 수렴"
  - "PRIVACY.md 의 'Updated' stamp 를 2026-04-19 로 갱신하고 CDP-only 피봇(2026-04-15) + v0.5 manifest pivot(2026-04-19) 두 건을 모두 명기"
  - "`KNOWN_AGRUNE_ATTRS` / `annotation-lint` 패키지 / annotation-lint 내부 상수 — 전혀 수정하지 않음 (Success Criteria 4 명시 예외). 문서에서도 패키지명 자체는 리네임 없이 '@agrune/core/annotation-lint' 그대로 유지"
  - "`docs/notes/` 아카이브 (v1.0 historical record) — 수정하지 않음 (README L215 명시 원칙 + RESEARCH.md §User Constraints)"
  - "Deprecated workflows 섹션 phrasing — code block 안에 실제 legacy attribute 예시를 쓰지 않고 'prefix 시리즈' / 'name → targetId / action → actionKinds' 같은 property-to-field upgrade map 으로 설명 (regression grep 안전)"
  - "PRIVACY 의 'browser extension' 언급 2 건 모두 제거 — 첫 문단은 MCP server 로 교체, 'does not install a browser extension' negative 표현도 'does not install any browser add-on' 으로 교체해 Wave 4 regression grep 이 literal 'browser extension' 을 0 회로 유지"
metrics:
  duration: "~9 minutes"
  completed: "2026-04-19T16:14:02Z"
---

# Phase 17 Plan 03: 루트 문서 7개 manifest 재작성 Summary

**One-liner:** 7 개 product-surface 문서 (README / AGENTS / PRIVACY / workflows/annotate/WORKFLOW / docs/agent-setup / docs/improvement-notes / packages/mcp/README) 를 manifest + CDP 정체성으로 재작성하고 `.agents/skills/manifest/SKILL.md` 를 authoritative SOT 로 명시. legacy `data-agrune-*` 어노테이션 지칭 맥락만 선별 치환하고, `annotation-lint` 패키지 API / `KNOWN_AGRUNE_ATTRS` / `lint:annotations` script 엔트리 / `docs/notes/` 아카이브 / 일반적 'annotation' 용례는 Pitfall 4 원칙에 따라 건드리지 않음.

## Tasks Completed

| # | Task | Commits |
| --- | --- | --- |
| 1 | Rewrite README.md + AGENTS.md + PRIVACY.md (product-surface trio) | `1302d4c`, `8718cca`, `a987b53` |
| 2 | Rewrite workflows/annotate/WORKFLOW.md + docs/agent-setup.md | `2cd7c5e`, `4ecb04c` |
| 3 | Tidy docs/improvement-notes.md + packages/mcp/README.md | `5bc2b0b`, `2bc221b` |

총 7 개 원자 커밋 (문서 1 개 = 커밋 1 개).

## 문서별 변경 요약 (Before → After 핵심 diff)

### 1. README.md — `1302d4c`

| Before | After |
|---|---|
| "AI 에이전트가 어노테이션된 웹 앱을 브라우저에서 직접 조작할 수 있게 해주는 CDP 기반 브라우저 자동화 도구" | "외부 manifest 로 정의된 제어 표면을 통해 ... MCP 서버. 제어 대상은 `@agrune/manifest` SDK 로 작성한 manifest.ts 한 파일" |
| `runtime/ page runtime, scanner, manifest builder` | `runtime/ page runtime, manifest loader, target resolver (fiber + CSS)` |
| (아키텍처 다이어그램 없음) | ASCII 다이어그램 추가: `manifest.ts → @agrune/manifest SDK → window.__agrune_manifest__ → CdpRuntimeInjector → TargetResolver (fiber/CSS) → CDP Input/DOM` |
| "### 어노테이션" 섹션 (`source of truth는 workflows/annotate/WORKFLOW.md`) | "### Manifest 작성" 섹션 (inline defineManifest 로그인 예제 + TodoMVC fixture 링크 + SKILL.md authoritative pointer + `agrune manifest validate/dev` 워크플로) |
| 패키지 표 5 개 (core/runtime/browser/mcp/devtools) | 패키지 표 7 개 (+ @agrune/manifest, @agrune/react) |
| MCP 도구 11 개 | MCP 도구 13 개 (+ agrune_manifest_load, agrune_macro_run) |
| `pnpm lint:annotations` — `data-agrune-*` 어노테이션 linter (`@agrune/core`) | `pnpm lint:annotations` — 외부 소비자용 `@agrune/core/annotation-lint` build-linter (모노레포 자체는 legacy 호환 체크) |
| 관련 디렉터리 3 개 | 관련 디렉터리 5 개 (+ .agents/skills/manifest/SKILL.md, TodoMVC fixture) |

### 2. AGENTS.md — `8718cca`

| Before | After |
|---|---|
| 빌드 주의사항 3 줄 | 빌드 주의사항 4 줄 (+ `@agrune/manifest` dist 갱신 항목) |
| 프로젝트 구조: 패키지 5 개 | 프로젝트 구조: 패키지 7 개 + `.agents/skills/manifest/` authoritative 표시 |
| (Manifest authoring workflow 섹션 없음) | 새 섹션: owned React (root-import) / 외부 사이트 (preload / manifest_load) / 복합 플로우 (defineMacro) / 동적 리스트 (defineRepeat) 4 가지 경로 + SKILL.md SOT 선언 + TodoMVC reference link |
| 실행 모드 5 항목 | 실행 모드 7 항목 (+ `agrune manifest validate/dev`) |
| 체크리스트 6 단계 | 체크리스트 7 단계 (+ `agrune manifest validate --url <target-url>` 검증) |
| 역사적 참고 1 줄 (extension 제거) | 역사적 참고 2 줄 (+ v0.4 inline `data-agrune-*` 경로 제거 + upgrade 전략) |

### 3. PRIVACY.md — `a987b53`

| Before | After |
|---|---|
| Last updated: March 25, 2026 | Last updated: April 19, 2026 (rephrased post-2026-04-15 CDP-only pivot; post-2026-04-19 v0.5 manifest pivot) |
| "agrune is a browser extension that enables AI agents to interact with web pages through annotated DOM snapshots and browser actions" | "agrune is an MCP (Model Context Protocol) server that enables AI agents to interact with web pages through a locally-installed Chrome instance, controlled via the Chrome DevTools Protocol (CDP). The target surface for each interaction is defined by an externally authored manifest" |
| "DOM structure and text content ... converted to annotated snapshots" | "DOM structure and text content ... converted to structured snapshots constrained to the manifest's declared targets" + sensitive:true 마스킹 설명 + heuristic OR-combine |
| "The extension stores only connection state and user preferences using Chrome's local storage API" | "CDP session is scoped to the Chrome instance that the user (or the `agrune` CLI) launched" + recorder pending 파일 `$HOME/.agrune/authoring/pending/` 설명 |
| "Permissions: browser permissions to fulfill core function" | "Permission model: no browser add-on install, no system-wide Chrome permissions, CDP session binds to user-launched Chrome, target set restricted to manifest-declared" |
| (downstream harness 책임 분리 문구 없음) | downstream MCP harness 가 모델 제공자에게 snapshot 을 전송할 수 있다는 책임 분리 고지 |

"browser extension" literal 2 회 등장 (Overview + Permissions) 모두 제거 (첫 건은 MCP server 로 교체, 두 번째 negative "does not install" 문은 "does not install any browser add-on" 으로 교체).

### 4. workflows/annotate/WORKFLOW.md — `2cd7c5e`

| Before | After |
|---|---|
| 제목 "Agrune Annotate Workflow" | 제목 "Agrune Manifest Authoring Workflow" |
| (최상단 SOT pointer 없음) | 최상단 블록쿼트: `.agents/skills/manifest/SKILL.md` 가 v0.5 authoritative. 이 파일은 harness-compat 요약판. 파일명/경로 보존 이유 명시 |
| 목표 4 개 (`data-agrune-*` 노출 / 소스 레벨 / DOM 변화 견딤 / `data-agrune-sensitive`) | 목표 5 개 (`defineTarget` 선언 / 컴포넌트 소스 0 수정 / 외부 사이트 selector fallback / `sensitive: true` OR-only / targetId groupId 명사 중심) |
| 기본 절차 7 단계 (앱 구조 파악 → 어노테이션 추가 → 스캔) | 기본 절차 3 단계 (`defineManifest` 작성 → `agrune manifest validate` → `agrune manifest dev` watcher + DevTools recorder) + 각 필드 상세 규칙 |
| 네이밍 원칙 4 개 | 네이밍 원칙 4 개 (manifest 용어로 재작성: `targetId` / `groupId`) |
| 그룹 원칙 3 개 | Repeat / Macro 원칙 섹션 (`defineRepeat` keyFrom/nameFrom/strategy + `defineMacro` + `agrune_macro_run`) |
| 피해야 할 것 4 개 | 피해야 할 것 5 개 (+ hash class CSS / `:nth-child(n)` 금지) |
| 결과물 기대치 3 개 | 결과물 기대치 3 개 (manifest.ts 파일 + 설명 + live DOM 매칭 근거) |
| (하네스별 wrapping 섹션 없음) | Claude Code / Codex stdio 설정 + 기타 MCP 하네스 wrapping 가이드 |
| (Deprecated workflows 섹션 없음) | v0.4 legacy HTML data attribute 방식 → manifest upgrade 4 단계 + name→targetId / action→actionKinds 등 property-to-field mapping + TodoMVC reference link |

### 5. docs/agent-setup.md — `4ecb04c`

| Before | After |
|---|---|
| "`agrune`은 Chrome 확장 프로그램과 `agrune-mcp`를 통해 ..." | "`agrune` 은 `@agrune/mcp` stdio MCP 서버를 통해 ... CDP-only 피봇 이후 Chrome 확장·네이티브 메시징·백엔드 데몬 경로는 제거" |
| 설치: `pnpm dlx @agrune/cli` 대화형 인스톨러 → Chrome Extension / Claude MCP / Codex MCP 선택 | 설치: `npm i -g @agrune/mcp` (global) 또는 monorepo dev setup. 실행 모드 5 가지 (`agrune / --headless / --attach / --port / --no-devtools`) |
| (MCP 하네스 연결 섹션 없음) | Claude Code (`claude_desktop_config.json` stdio) + Codex (config.toml) 연결 예제 |
| MCP 도구 8 개 | MCP 도구 13 개 (+ focus, pointer, read, manifest_load, macro_run) |
| 웹앱 준비: `페이지에 data-agrune-* 어노테이션이 있으면 확장 프로그램이 자동으로 대상과 그룹 수집` + HTML 예제 (data-agrune-action/name) | 웹앱 준비: owned React `<AgruneDevtools />` root-import + src/manifest.ts defineManifest 예제 / 외부 사이트는 preload 또는 `agrune_manifest_load` |
| (Troubleshooting 섹션 없음) | Troubleshooting 4 항목: headful 가시성 (`--new-window` — MEMORY 근거), `--remote-debugging-port` 충돌, manifest 금칙 셀렉터, DevTools 포트 충돌 |

### 6. docs/improvement-notes.md — `5bc2b0b`

| Before | After |
|---|---|
| "v1.1 기준. 2026-04 CDP-only 피봇 이후 갱신" | "Updated 2026-04-19 (v0.5 Manifest Pivot — Phase 17). 이전 버전 ... manifest 경로 반영 추가하고 legacy inline annotation 언급 정리" |
| 제품 방향 bullet 5 개 (annotate 타겟 기반) | 제품 방향 bullet 6 개 (+ manifest.ts 선언, runtime DOM 스캔 안 함) |
| 액션 타입 마지막 bullet: "(`data-agrune-action=\"click,dblclick\"`)" | 액션 타입 마지막 bullet: "manifest 에서 `actionKinds: ['click', 'dblclick']` 처럼 배열로 선언" (docs/notes/9-multi-action-support.md 는 v0.4 legacy 설명이라 필드명 1:1 치환 주석으로 보존) |
| 페이지 콘텐츠 읽기 bullet (annotation-independent 언급) | 페이지 콘텐츠 읽기 bullet (manifest-independent 로 rephrase, `read` 는 별도 ActionKind 로 미도입 이유 manifest 수준 자동 추론 어려움) |
| (Manifest authoring ergonomics 섹션 없음) | 새 섹션: Phase 17 이전 ergonomics 이슈 → Phase 11-14 resolution mapping (root-import / 외부 사이트 fallback / defineRepeat / defineMacro / recorder). v0.6+ 개선 여지 기록 |

### 7. packages/mcp/README.md — `2bc221b`

| Before | After |
|---|---|
| 실행: Quick mode (`--mode cdp`) / Extension mode 두 경로 | 실행: CDP 단일 경로 + `agrune / --headless / --attach / --no-devtools` + 전역 설치 옵션 |
| 포함 내용: agrune-mcp CLI / MCP tool definitions / **extension mode backend/native-host entrypoints** / CDP quick mode driver wiring | 포함 내용: agrune / agrune-mcp CLI / stdio MCP server (CommandBroker + HitlController) / devtools HTTP+WS server / CDP injector + session manager + recovery supervisor |
| (MCP 도구 목록 없음) | MCP 도구 표 14 개 (11 public + manifest_load + macro_run + recorder_* internal) |
| (v0.5 Breaking Changes 섹션 없음) | 새 섹션: runtime no-scan / PageSnapshot v2→v3 ladder / legacy 속성 존재 시 idle 부팅 / 호환 adapter 없음 + 마이그레이션 링크 (`.planning/phases/17-remove/`) |
| 관련 디렉터리 1 개 (workflows/annotate) | 관련 디렉터리 5 개 (+ SKILL.md, manifest SDK, @agrune/react, TodoMVC fixture) |

## 치환된 용어 vs 유지된 용어 (Pitfall 4 원칙 적용 로그)

### 치환됨 (legacy `data-agrune-*` inline 어노테이션을 지칭하는 문맥)

| Old phrase | New phrase | 등장 문서 |
|---|---|---|
| "annotated web app" / "어노테이션된 웹 앱" | "manifest-declared targets" / "외부 manifest 로 정의된 제어 표면" | README, PRIVACY |
| "annotate with data-agrune-*" | "define targets in a manifest" | README, AGENTS |
| "inline annotation" / "data-agrune-* 어노테이션" | "target mapping" / "manifest target" | WORKFLOW, docs/agent-setup |
| "annotate the HTML" / "소스 컴포넌트 레벨에서 어노테이션" | "author a manifest.ts" / "external manifest.ts" | WORKFLOW |
| "scan annotations" / "확장 프로그램이 자동으로 대상과 그룹을 수집" | "resolve targets via TargetResolver" / "manifest loader 가 target 등록" | README, docs/agent-setup, improvement-notes |
| "Chrome extension that…" / "browser extension" | "MCP server that launches Chrome via CDP…" | PRIVACY, packages/mcp/README, docs/agent-setup, AGENTS |
| "extension panel" | "devtools webapp" | (등장 없었음 — confirmed) |
| "install the extension" / `pnpm dlx @agrune/cli` installer | "run `agrune` / connect via MCP" / `npm i -g @agrune/mcp` | docs/agent-setup |
| "extension mode backend/native-host entrypoints" | (삭제; CDP 단일 경로로 대체) | packages/mcp/README |
| "어노테이션 시스템과 독립" | "manifest 시스템과 독립" | improvement-notes |
| "어노테이션 워크플로 원본" | "manifest authoring workflow 요약판" | README, AGENTS |

### 유지됨 (allow-list 대상)

| Term | Context | 근거 |
|---|---|---|
| `annotation-lint` (패키지명) | README, AGENTS의 `@agrune/core/annotation-lint` 언급 | Success Criteria 4 명시 예외 (build-linter 레거시 참조 허용) |
| `KNOWN_AGRUNE_ATTRS` (상수) | packages/core/src/annotation-lint/rules.ts — **건드리지 않음** | 내부 lint 상수, 외부 소비자 API |
| `pnpm lint:annotations` (script 엔트리) | package.json L10 — **건드리지 않음**. README L282 / AGENTS L50 의 **설명 표현만** rephrase | Plan 명시: script 자체 삭제는 17-04 담당 |
| `docs/notes/` 전체 | 수정 없음 (`git status docs/notes/` empty) | README L215 명시 "v1.0 시점 historical record" |
| `workflows/annotate/` (디렉터리명) | 디렉터리명과 파일명(`WORKFLOW.md`) 보존 | 외부 하네스 어댑터 링크 안정성 (RESEARCH.md Open Q 3 권고 a) |
| `bootstrap-gate.spec.ts` / `annotation-scan.spec.ts` (spec 이름) | 본 plan 수정 범위 밖 | RESEARCH Pitfall 7 — spec 이름의 "annotation" 단어는 negative 검증 맥락이라 의미적 유효 |
| `data-agrune-aurora` / `data-agrune-pointer` (cursor-anim 내부 마커) | 본 plan 7 개 문서에 등장 없음 | MEMORY "Cursor animation non-negotiable" |
| "TypeScript annotation" / 일반적 "annotation" 일상어 | 본 plan 7 개 문서에 그런 용례 없음 | Pitfall 4 "맹목적 치환 금지" |

## SOT Pointer 배치 위치

| 문서 | 배치 위치 | 경로 표기 |
|---|---|---|
| README.md | 상단 소개 직후 블록쿼트 + "Manifest 작성" 섹션 + "관련 디렉터리" | `./.agents/skills/manifest/SKILL.md` |
| AGENTS.md | "Manifest authoring workflow > AI 에이전트가 manifest 를 작성할 때" 하위 섹션 + "프로젝트 구조" + "역사적 참고" | `./.agents/skills/manifest/SKILL.md` |
| workflows/annotate/WORKFLOW.md | **최상단 블록쿼트** (의도적으로 문서 첫 머리 — 외부 하네스 어댑터가 이 파일만 읽어도 authoritative source 를 놓치지 않도록) + "하네스별 wrapping" | `../../.agents/skills/manifest/SKILL.md` |
| packages/mcp/README.md | "관련 디렉터리" | `../../.agents/skills/manifest/SKILL.md` |
| docs/agent-setup.md | "웹앱 준비 — manifest 작성" 마지막 단락 | `../.agents/skills/manifest/SKILL.md` |

총 5 개 진입점에서 동일 SOT pointer 노출. agent 가 어느 문서로 들어와도 authoritative source 로 수렴.

## Gate Check Results

| # | Gate | Status |
| --- | --- | --- |
| 1 | `grep -En "data-agrune-(action\|key\|group\|canvas\|meta\|masked\|sensitive\|name)"` on 7 files | ✅ 0 matches |
| 2 | `grep -EnI "browser extension\|Chrome Extension\|extension mode\|native-host\|native messaging"` on 7 files | ✅ 0 matches |
| 3 | README + AGENTS + WORKFLOW 각각에 `defineManifest` 또는 `@agrune/manifest` ≥1 회 | ✅ README=10, AGENTS=6, WORKFLOW=3 |
| 4 | WORKFLOW.md 최상단(첫 3 줄) 에 `.agents/skills/manifest/SKILL.md` pointer | ✅ L3 block quote |
| 5 | PRIVACY 첫 10 줄 안에 "MCP server" 언급 | ✅ "MCP (Model Context Protocol) server" + "via Chrome DevTools Protocol (CDP)" |
| 6 | `annotation-lint` 패키지 내부 파일 (index.ts / rules.ts / scanner.ts / vite-plugin.ts / __fixtures__) 수정 없음 | ✅ `git status packages/core/src/annotation-lint/` empty |
| 7 | `docs/notes/` 아카이브 수정 없음 | ✅ `git status docs/notes/` empty |
| 8 | `lint:annotations` script 엔트리 자체 미수정 | ✅ `package.json:10` 원문 그대로 |

## Deviations from Plan

### Auto-applied (Rule 2 — missing critical content)

**1. [Rule 2 - Security / Correctness] PRIVACY.md 두 번째 'browser extension' 언급도 제거**
- **Found during:** Task 1 post-commit gate 검증 (`grep -cn "browser extension" PRIVACY.md` → 1)
- **Issue:** Plan 의 Gate 2 는 "browser extension 0 matches in 7 files" 를 요구. PRIVACY 의 "agrune does **not** install a browser extension" 은 CDP-only 정체성을 *negative* 로 설명하는 의도적 문장이지만, Wave 4 regression grep 이 literal `browser extension` 을 매치하면 false positive 소음을 만든다.
- **Fix:** 해당 문장을 "agrune runs as a local stdio process and does **not** install any browser add-on, nor request system-wide Chrome permissions" 로 교체. 의미는 동일(확장 설치 없음 + 시스템 권한 없음) 하면서 regex 히트 방지.
- **Files modified:** `PRIVACY.md`
- **Commit:** `a987b53` (동일 task commit 안에서 처리 — 별도 커밋 불필요)

### Scope boundary respected (no Rule 4 checkpoints)

- `package.json` 의 `lint:annotations` script 엔트리 — 건드리지 않음. 본 plan 은 README L282 / AGENTS L50 의 **설명 문구만** rephrase. 삭제 여부는 17-04 Wave 4 담당 (Plan non-goal 명시).
- `.github/profile/README.md` (외부 repo) — 본 repo 범위 밖 (17-04 Wave 4 담당).
- 외부 `skills/annotate/` repo 폐기 지침 — 본 repo 밖 (17-04 Wave 4 담당, 사용자 수동 push).
- `packages/core/src/annotation-lint/**` — Success Criteria 4 명시 예외.
- Source code 수정 — Wave 1 (17-01) 담당.
- `docs/superpowers/specs/*` — Tertiary sources (RESEARCH.md §Sources), 수정 불필요.

### Baseline e2e failures (17-02 에서 이관된 이슈)

Plan 17-02 SUMMARY 에 기록된 "5 pre-existing user-flow E2E failures" (tricky-inputs / overlay-modal / manifest-inject fixture 에 inline manifest 주입 필요) 는 **본 plan 범위에서 제외**했다. Plan 17-03 의 scope 는 "문서 7 개 재작성" 으로 명시됐고, fixture 수정은 별도 plan (17-02.5 또는 17-04) 이 담당하는 것이 원자성 측면에서 옳다. 17-03 은 문서 contract 만 manifest-centric 으로 정리하고, fixture rewire 는 다음 wave 에서 목적형으로 다룬다.

Plan 17-02 handoff 의 Option A ("Wave 3 에서 tricky-inputs.html 등에 inline manifest 주입") 는 17-03 frontmatter 의 `files_modified` 목록과 `objective` 에 명시되지 않았으므로 scope creep 으로 판단. Wave 4 (17-04) 또는 별도 plan 이관 권고.

## Handoff to Wave 4 (17-04)

### 필수 작업

- [ ] `package.json` 의 `"lint:annotations": "node ./packages/core/bin/agrune-lint.js packages apps"` 엔트리 삭제 여부 결정.
  - 권고 (RESEARCH Pitfall 6): 삭제. 외부 소비자는 `@agrune/core/annotation-lint` 패키지를 직접 dep 으로 설치해 `agrune-lint` bin 을 호출하면 됨. 모노레포 자체 CI 에서 돌릴 이유 없음.
  - 삭제 시 README L282 / AGENTS L50 의 `pnpm lint:annotations` 설명 line 도 함께 삭제 (이번 plan 은 본문 rephrase 만, script 엔트리 자체는 보존 — 17-04 가 삭제할 경우 해당 line 도 함께 삭제해야 dangling reference 방지).
- [ ] 외부 `/Users/chenjing/dev/agrune/.github/profile/README.md` sync — manifest + CDP 정체성 반영. 파일 수정은 Wave 4 에서, push 는 사용자 수동.
- [ ] 외부 skills repo `/Users/chenjing/dev/agrune/skills/skills/annotate/` 폐기 지침 문서 생성 (`.planning/phases/17-remove/external-sync-instructions.md`) — annotate skill 제거 + README 재작성 diff 예시. 사용자가 해당 repo 에서 별도 PR.
- [ ] Regression guard script 추가 (`scripts/regression-guard/no-legacy-data-agrune.sh` + `data-agrune-allowlist.txt`) — 본 plan 이후 7 개 문서가 legacy 속성 참조 0 회인 것을 CI 로 lock.

### Allow-list 제안 엔트리 (Wave 4 신설 시)

`scripts/regression-guard/data-agrune-allowlist.txt`:
```
# annotation-lint build-linter (Success Criteria 4 명시 예외)
packages/core/src/annotation-lint/**
packages/core/tests/annotation-lint.spec.ts
packages/core/bin/agrune-lint.js

# runtime/e2e test fixtures with intentional legacy attribute bait
packages/e2e/fixtures/legacy-annotated.html
packages/e2e/fixtures/tricky-inputs.html
packages/e2e/fixtures/overlay-modal.html
packages/e2e/tests/annotation-scan.spec.ts

# runtime unit test fixtures (manifest selector uses arbitrary CSS — fixture-only)
packages/runtime/tests/runtime.spec.ts
packages/runtime/tests/fill-cdp.spec.ts
packages/runtime/tests/macro-runner.spec.ts
packages/runtime/tests/sensitive-or-only.spec.ts

# historical record (README L215 명시)
docs/notes/**

# .planning/ (historical phase records)
.planning/**
```

### 남은 위험 (Wave 4 담당)

- 17-02 handoff 에서 지목된 5 개 pre-existing user-flow E2E failure — 본 plan 범위 밖. 17-04 또는 별도 plan 에서 fixture 에 inline manifest 주입으로 해소.
- `manifest_load` happy-path refresh 타이밍 (17-02 handoff) — 별도 plan 또는 Phase 18 research 필요.
- Wave 4 가 regression guard script 를 추가할 때 본 plan 이 남겨둔 `pnpm lint:annotations` script 를 삭제하거나 `pnpm lint:no-legacy` 로 리네임하는 선택지 고려.

## Self-Check: PASSED

- **Created files:** `.planning/phases/17-remove/17-03-SUMMARY.md` — FOUND (this file)
- **Modified files (all 7):**
  - `README.md` — FOUND (manifest 섹션 추가, 아키텍처 다이어그램, SOT pointer)
  - `AGENTS.md` — FOUND (Manifest authoring workflow 섹션, 패키지 7 개, 체크리스트 확장)
  - `PRIVACY.md` — FOUND (MCP server 정체성, manifest target 스냅샷 제약)
  - `workflows/annotate/WORKFLOW.md` — FOUND (최상단 SOT, manifest 3 단계, Deprecated workflows)
  - `docs/agent-setup.md` — FOUND (MCP stdio 설정, 13 tools, manifest 작성, Troubleshooting)
  - `docs/improvement-notes.md` — FOUND (v0.5 stamp, Manifest authoring ergonomics 섹션)
  - `packages/mcp/README.md` — FOUND (CDP 단일 경로, v0.5 Breaking Changes, tool 표 14)
- **Commits verified in git log:** `1302d4c`, `8718cca`, `a987b53`, `2cd7c5e`, `4ecb04c`, `5bc2b0b`, `2bc221b` — all present
- **All 8 gate checks:** PASS
