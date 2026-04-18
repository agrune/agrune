# Plan 10-03 Summary

**Completed:** 2026-04-18
**Requirements:** DOCS-03

## What was done

- Added `--help`, `-h`, `--version`, `-v` short-circuit handlers to `packages/mcp/bin/agrune-mcp.ts`. They exit 0 BEFORE constructing `CdpDriver` or starting the DevTools server, so `agrune --help` is fast and safe.
- Added `--user-data-dir <path>` CLI flag that passes through to `CdpDriver({ userDataDir })`. When combined with `--attach`, a stderr warning is printed ("--user-data-dir is ignored when --attach is set") and the flag is ignored.
- `--version` prints `agrune v0.4.1` using the existing `MCP_SERVER_VERSION` constant from `packages/mcp/src/version.ts` (built-time-injected by tsup).
- Added `### CLI 플래그` table to `agrune/README.md` matching the CLI help output (same flag names, defaults, and Korean descriptions). Table placed directly after `## 실행 방식` section.

## Verification

- `pnpm --filter @agrune/mcp build` succeeds.
- `node packages/mcp/dist/bin/agrune-mcp.js --help` prints full Korean+English help with all required flags (`--headless`, `--attach`, `--port`, `--no-devtools`, `--user-data-dir`, `47654`). Exit 0.
- `node packages/mcp/dist/bin/agrune-mcp.js --version` prints `agrune v0.4.1` and exits 0 without launching Chrome.
- README CLI 플래그 table present with default column showing `47654` for `--port`.

## Files modified

- `agrune/packages/mcp/bin/agrune-mcp.ts`
- `agrune/README.md`
