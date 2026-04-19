---
phase: 11-manifest
plan: "05"
subsystem: mcp-cli
tags: [cli, validate, playwright, manifest, tsx, selector-ladder]
dependency_graph:
  requires: [11-01, 11-02]
  provides: [manifest-validate-cli, manifest-file-loader, validate-fixtures]
  affects: [packages/mcp, packages/e2e]
tech_stack:
  added: ["@playwright/test (mcp dep)", "@agrune/manifest (mcp dep)", "tsx (mcp prod dep)"]
  patterns:
    - "tsx/esm absolute-path resolution via tsup-injected require.resolve"
    - "Playwright external-to-bundle (noExternal regex exclusion)"
    - "SelectorLadder priority: role > text > testId > attr > css"
    - "Schema-first validation gate before DOM check"
key_files:
  created:
    - packages/mcp/src/manifest-validate-cli.ts
    - packages/mcp/src/manifest-file-loader.ts
    - packages/e2e/fixtures/validate-test.html
    - packages/e2e/fixtures/validate-manifest-good.json
    - packages/e2e/fixtures/validate-manifest-missing.json
    - packages/e2e/fixtures/validate-manifest-sensitive-false.json
    - packages/e2e/fixtures/validate-manifest.ts
    - packages/e2e/tests/manifest-validate-cli.spec.ts
  modified:
    - packages/mcp/bin/agrune-mcp.ts
    - packages/mcp/package.json
    - packages/mcp/tsup.config.ts
    - packages/e2e/package.json
decisions:
  - "@playwright/test를 mcp dependencies에 추가하되 tsup noExternal 패턴에서 playwright/* 제외 — chromium-bidi CJS 내부 dep이 esbuild로 번들링 불가"
  - "tsx/esm을 절대 경로로 resolve: tsup banner inject된 require.resolve('tsx/esm')를 사용해 CWD 독립성 확보"
  - "E2E 테스트에서 spawnSync + webServer(port 5555) 조합 — 동일 프로세스 HTTP 서버 대신 playwright.config.ts webServer 재사용"
  - "Playwright 예외를 runLiveCheck에서 catch → exit 1로 정상 종료 (unhandled rejection 방지)"
metrics:
  duration: "640s (10m 40s)"
  completed: "2026-04-19"
  tasks_completed: 2
  tasks_total: 2
  files_created: 8
  files_modified: 4
---

# Phase 11 Plan 05: manifest validate CLI — schema + live DOM Summary

**One-liner**: `agrune manifest validate` CLI — @agrune/manifest schema 검증 + Playwright live DOM SelectorLadder 1:1 매칭, .ts/.json 양쪽 지원, 실패 target stderr 보고

## What Was Built

`agrune manifest validate <file> [--url <url>]` CLI 서브커맨드를 `@agrune/mcp` 패키지에 추가했다.

### manifest-validate-cli.ts (120+ lines)
- `validateManifest()` (@agrune/manifest)로 schema를 항상 먼저 검증 — `sensitive:false`, hash class, `:nth-child`, 빈 SelectorLadder를 DOM 검증 전에 거부
- `--url` 없으면 `Schema OK (N targets, M macros, K repeats).` + exit 0
- `--url` 있으면 Playwright `chromium.launch → page.goto(networkidle) → waitForTimeout(500)` → in-page evaluate로 SelectorLadder 우선순위(role > text > testId > attr > css) 해석
- 실패 target은 `<targetId>: not found (tried: role -> text -> testId -> attr -> css)` 형태로 stderr 출력 + exit 1
- 전부 매칭이면 `All N targets matched.` + exit 0

### manifest-file-loader.ts (100+ lines)
- `.json`: readFileSync + JSON.parse
- `.ts`/`.mts`: Node.js subprocess + tsx/esm loader로 default export를 JSON.stringify하여 stdout으로 수신
- tsx/esm 절대 경로를 tsup-injected `require.resolve('tsx/esm')`으로 resolve — CWD 독립성 보장

### agrune-mcp.ts 분기 삽입
- `args[0] === 'manifest'` 분기: CdpDriver/createMcpServer 미호출, `process.exit()`으로 즉시 종료 (T-11-27)
- `--help` 텍스트에 `manifest validate` 서브커맨드 예시 추가

### tsup.config.ts 수정
- `noExternal: [/^(?!@playwright|playwright|chromium-bidi).*/]` — playwright/* 번들 제외 (chromium-bidi CJS 내부 dep 번들 불가)

### E2E fixtures + 테스트
- `validate-test.html`: `<button role="button" aria-label="Sign in">`, `<div data-testid="user-card">`, `<a>Docs</a>` 포함
- 4개 JSON/TS fixture + 6개 E2E 시나리오 (6/6 pass)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @playwright/test 번들링 시 chromium-bidi CJS 내부 dep resolve 실패**
- **Found during**: Task 1 build
- **Issue**: `noExternal: [/.*/]`로 모든 패키지를 번들하면 `playwright-core`의 `chromium-bidi/lib/cjs/bidiMapper/BidiMapper` 등이 esbuild로 resolve 불가
- **Fix**: `noExternal` 패턴을 `[/^(?!@playwright|playwright|chromium-bidi).*/]`로 변경해 playwright 관련 패키지를 번들에서 제외
- **Files modified**: `packages/mcp/tsup.config.ts`
- **Commit**: 028c8ce

**2. [Rule 1 - Bug] tsx/esm 패키지를 CWD 기반으로 resolve하면 e2e 디렉토리에서 `Cannot find package 'tsx'` 발생**
- **Found during**: Task 2 E2E 실행
- **Issue**: `--import tsx/esm` 인자가 Node.js CWD 기준으로 tsx를 resolve하는데, 번들된 CLI가 다른 CWD에서 실행되면 tsx를 찾지 못함
- **Fix**: `manifest-file-loader.ts`에서 tsup banner가 inject한 `require.resolve('tsx/esm')`으로 절대 경로를 얻어 `--import file:///abs/path/tsx/dist/esm/index.mjs` 형태로 전달. fallback으로 `import.meta.resolve` 사용
- **Files modified**: `packages/mcp/src/manifest-file-loader.ts`
- **Commit**: 34aa018

**3. [Rule 1 - Bug] `import { createRequire } from 'node:module'`이 tsup banner의 `createRequire` inject와 충돌 → `Identifier 'createRequire' has already been declared`**
- **Found during**: Task 2 첫 수정 후 실행
- **Issue**: tsup banner가 `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`를 inject하는데, loader에서도 같은 이름을 import하면 duplicate declaration 에러
- **Fix**: import 제거 후 tsup-injected `require`를 타입 어설션으로 접근
- **Files modified**: `packages/mcp/src/manifest-file-loader.ts`
- **Commit**: 34aa018

**4. [Rule 1 - Bug] `page.goto` timeout 발생 시 unhandled promise rejection으로 프로세스 크래시**
- **Found during**: Task 2 E2E 실행
- **Issue**: `runLiveCheck`에서 Playwright 에러가 throw되면 `process.exit()`이 호출되지 않고 unhandled rejection으로 크래시
- **Fix**: `runValidateCli`에서 `runLiveCheck`를 try/catch로 감싸 `exit 1` 반환
- **Files modified**: `packages/mcp/src/manifest-validate-cli.ts`
- **Commit**: 34aa018

**5. [Rule 1 - Bug] E2E 테스트에서 `spawnSync` + 동일 프로세스 HTTP 서버 조합 → 서버가 요청 처리 불가**
- **Found during**: Task 2 E2E 실행
- **Issue**: `spawnSync`는 동기 블로킹 — 같은 Node.js 프로세스에서 `node:http` 서버를 만들고 `spawnSync`로 CLI를 실행하면 이벤트 루프가 막혀 서버가 요청을 받지 못함 → Playwright 30초 timeout
- **Fix**: `playwright.config.ts`의 기존 webServer(port 5555)가 fixtures/를 서빙하므로 `FIXTURE_URL = 'http://127.0.0.1:5555/validate-test.html'` 상수를 사용. `serveFixture()` 함수 제거
- **Files modified**: `packages/e2e/tests/manifest-validate-cli.spec.ts`
- **Commit**: 34aa018

## Threat Model Coverage

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-11-24 | mitigated | Playwright `page.goto`가 `javascript:` 스킴을 네이티브 거부 |
| T-11-26 | mitigated | validator 에러 메시지는 path + constraint만 출력, 원본 value 미포함 |
| T-11-27 | mitigated | `args[0] === 'manifest'` 분기 후 `process.exit()` — StdioServerTransport 코드 미도달 |
| T-11-21 | accepted | Author 자신의 manifest를 tsx subprocess로 실행 — trust 경계 내부 |
| T-11-22 | accepted | tsx 실행 후 JSON serialize된 값만 수신 (side effect는 subprocess 내부에서 완료) |
| T-11-23 | accepted | CLI 툴 — Author가 자신의 target URL 지정 |

## Known Stubs

없음 — 모든 기능이 실제 동작하는 코드로 구현됨.

## Self-Check: PASSED

**Files exist:**
- FOUND: packages/mcp/src/manifest-validate-cli.ts
- FOUND: packages/mcp/src/manifest-file-loader.ts
- FOUND: packages/mcp/bin/agrune-mcp.ts (modified)
- FOUND: packages/e2e/fixtures/validate-test.html
- FOUND: packages/e2e/fixtures/validate-manifest-good.json
- FOUND: packages/e2e/fixtures/validate-manifest-missing.json
- FOUND: packages/e2e/fixtures/validate-manifest-sensitive-false.json
- FOUND: packages/e2e/fixtures/validate-manifest.ts
- FOUND: packages/e2e/tests/manifest-validate-cli.spec.ts
- FOUND: packages/mcp/dist/bin/agrune-mcp.js

**Commits exist:**
- 028c8ce: feat(11-05): manifest validate CLI — subcommand dispatch + schema + live DOM
- 34aa018: feat(11-05): fixtures + E2E tests + tsx/playwright bug fixes

**E2E result:** 6/6 tests passed (`pnpm --filter @agrune/e2e run test:e2e -- manifest-validate-cli`)
