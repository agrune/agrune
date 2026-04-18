---
phase: 09-quality-infrastructure
reviewed_at: 2026-04-18
depth: standard
status: passed
---

# Phase 9 Code Review

Reviewer: orchestrator (standard depth). Scope: all files changed in commits `fb270bb`, `57fab56`, `cb4e739` plus the inline patch documented below.

## Summary

| Severity | Count |
|---|---|
| BLOCKER | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 1 (fixed inline) |
| INFO | 4 |

## Findings

### LOW-1 (fixed inline): scanner doesn't skip HTML comments

File: `packages/core/src/annotation-lint/scanner.ts`

An element embedded inside an HTML comment (`<!-- <button data-agrune-action="click"> -->`) would have been tokenized as a real element and triggered `missing-name`/`missing-desc` diagnostics. This is rare in practice but a valid false-positive source.

**Fix applied in this phase, same commit-chain:** scanner now skips from `<!--` to the next `-->` before the element-tokenizer branch runs. All 22 core tests still pass.

### INFO-1: Playwright webServer uses inline Node shell command

File: `packages/e2e/playwright.config.ts`

The static fixture server is launched by a single long `node -e "..."` string containing the interpolated `fixturesDir` path. Works because workspace paths have no special chars, but if this repo ever relocates under a path with quotes/dollars this will break. Acceptable for v1.1; revisit if we add more fixture types.

### INFO-2: `nextOfType` uses wall-clock deadline

Files: `packages/mcp/tests/devtools-server{,-extensions}.spec.ts`

Vitest timer jitter could cause `Date.now() >= deadline` to flip right as a queued message is being resolved. Mitigated by the 2s default timeout — worst case is a spurious fail; rerun succeeds. No fix needed.

### INFO-3: HITL spec dynamic-imports built artifacts

File: `packages/e2e/tests/hitl-toolbar.spec.ts`

Uses `await import('@agrune/mcp/devtools-server')` which depends on a built `dist`. The `pretest:e2e` script calls `pnpm … build` so this is guaranteed in-flow, and CI always builds before running E2E. Safe.

### INFO-4: Scanner ignores dynamic JSX expressions

Files: `packages/core/src/annotation-lint/scanner.ts`

JSX attributes with expression values (`data-agrune-action={kind}`) are tracked as `value: null` and skipped from `invalid-action` checks. This matches the spec's intentional conservative scope (only string literals are checked). Documented in SUMMARY 02.

## Non-findings (verified clean)

- No secrets or tokens committed anywhere.
- `.github/workflows/ci.yml` has no `continue-on-error`, no `pull_request_target`, no untrusted-input exec patterns. Cache key derives from `pnpm-lock.yaml` hash.
- No new `any` types introduced beyond the `VitePluginLike` `this` annotation, which is unavoidable without pulling in Rollup types.
- `noUnusedLocals`/`noUnusedParameters` in `@agrune/browser` passes — no code changes were required.
- Panel CSS edits are pure visual tokens; no selectors removed, no layout semantics changed.

## Verdict

`PASSED`. One low-severity finding surfaced and fixed in-phase. No blocking issues.
