---
phase: 05-input-reliability
plan: "03"
subsystem: mcp-surface
tags: [mcp, tests, cdp]
provides:
  - MCP agrune_fill 도구의 clear/strategy 옵션
  - fill CDP 경로 회귀 방지 단위 테스트
affects:
  - packages/mcp/src/tools.ts
  - packages/mcp/src/mcp-tools.ts
  - packages/runtime/tests/fill-cdp.spec.ts
tech-stack:
  added: []
  patterns:
    - zod optional enum으로 전략 선택을 MCP 클라이언트에 노출
key-files:
  created:
    - packages/runtime/tests/fill-cdp.spec.ts
  modified:
    - packages/mcp/src/tools.ts
    - packages/mcp/src/mcp-tools.ts
key-decisions:
  - MCP 테스트는 실제 CDP traffic을 mockCdpPostMessage 방식으로 관찰 — jsdom 브라우저 동작을 assertion 대상으로 삼지 않음
  - 기존 ws 빌드 오류(devtools-server.ts)는 이번 phase와 무관한 pre-existing 이슈로 확인 (stash 검증 완료)
patterns-established:
  - CDP traffic 단위 테스트 패턴: mockCdpPostMessage.mock.calls → method/params 검사
duration: inline
completed: 2026-04-18
---

# Phase 5 Plan 03 Summary: Expose Options via MCP + Unit Tests

## Accomplishments
- `agrune_fill` MCP JSON schema에 `clear`/`strategy` 필드 추가 (`tools.ts`)
- `agrune_fill` zod 스키마에 `clear`/`strategy` 추가 (`mcp-tools.ts`)
- 새 테스트 파일 `fill-cdp.spec.ts`에 4개 시나리오:
  - INPUT-01: plain text input → `Input.insertText`
  - INPUT-02: contenteditable → `Input.insertText`
  - INPUT-03: masked tel → per-character `Input.dispatchKeyEvent`
  - INPUT-04: clear=false skips selectAll, clear=true triggers selectAll

## Files Changed
- `packages/mcp/src/tools.ts` — agrune_fill inputSchema 확장
- `packages/mcp/src/mcp-tools.ts` — zod 스키마 확장
- `packages/runtime/tests/fill-cdp.spec.ts` — 신규 단위 테스트 4개

## Verification
- `pnpm --filter @agrune/mcp test --exclude "**/devtools-server.spec.ts"` → 15 pass
  - `devtools-server.spec.ts`는 `ws` 모듈 resolve 실패로 pre-existing 빌드 깨짐. 이번 phase에서 도입된 문제가 아님 (git stash로 검증).
- `pnpm --filter @agrune/runtime test` → 69 pass (fill-cdp 4건 포함)
- `pnpm --filter @agrune/core build`·`@agrune/browser build`·`@agrune/runtime build` → all pass

## Requirements Coverage
| REQ | Coverage |
|-----|----------|
| INPUT-01 | `fill-cdp.spec.ts:"INPUT-01: plain text input uses Input.insertText"` |
| INPUT-02 | `fill-cdp.spec.ts:"INPUT-02: contenteditable element is accepted and receives insertText"` |
| INPUT-03 | `fill-cdp.spec.ts:"INPUT-03: masked tel input uses per-character dispatchKeyEvent"` |
| INPUT-04 | `fill-cdp.spec.ts:"INPUT-04: clear=false skips selectAll; clear=true triggers selectAll command"` |
