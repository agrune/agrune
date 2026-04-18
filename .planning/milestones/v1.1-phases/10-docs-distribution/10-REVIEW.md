# Phase 10 Code Review

**Reviewed:** 2026-04-18
**Depth:** standard (inline review by orchestrator — single-file CLI change)

## Scope

Only one source file was modified in Phase 10: `agrune/packages/mcp/bin/agrune-mcp.ts`. All other phase 10 changes are to Markdown documentation, which is out of scope for code review.

## Files reviewed

- `agrune/packages/mcp/bin/agrune-mcp.ts` (+39/-4 vs prior version)

## Findings

### BLOCKER
None.

### WARNING
None.

### INFO

1. **Function hoisting relied upon (not a bug).** Lines 48–53 call `getArgValue(...)` which is declared on line 134 as a `function` declaration. JavaScript function declarations hoist, so this is valid. No change needed.
2. **Shell execution of auto-open URL (line 106).** `exec(\`${openCmd} ${devtoolsUrl}\`)` composes a shell command with a URL built from `http://localhost:${devtoolsPort}/devtools` where `devtoolsPort` is numeric (parsed via `Number(devtoolsPortArg)`). No user-controlled string reaches the shell. Acceptable.
3. **`--user-data-dir` interaction with `--attach`.** When both are supplied, `--user-data-dir` is ignored and a stderr warning is printed. Covered by `--user-data-dir is ignored when --attach is set`. Good.
4. **`--help`/`--version` short-circuit placement.** Help and version handling run before `new CdpDriver(...)` so no Chrome launch side-effects occur. Matches plan `must_haves`.
5. **Version source.** `MCP_SERVER_VERSION` is injected by `tsup` from `package.json` via a `define` replacement. Runtime output confirmed as `agrune v0.4.1`.

## Build/type checks

- `pnpm --filter @agrune/mcp build` → ESM + DTS both succeeded.
- Postbuild hook ran (synced `dist/` to `~/.agrune/mcp-server`).

## Verdict

**PASS** — no blocking issues. Documentation-only changes across the remaining phase scope carry no code-review risk.
