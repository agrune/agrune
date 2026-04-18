# Plan 10-01 Summary

**Completed:** 2026-04-18
**Requirements:** DOCS-01 (core docs portion)

## What was done

- Rewrote `agrune/README.md` for CDP-only v1.1. Removed `packages/extension` row, dropped `--mode cdp` command, dropped the "확장 프로그램 개발" subsection. Added 11 MCP tools with `agrune_focus` and the self-healing `recovered` flag note. Added `pnpm test:e2e` and `pnpm lint:annotations` to 품질 검증. Korean tagline preserved.
- Rewrote `agrune/AGENTS.md` end-to-end. Replaced stale `feat/cdp-migration` branch note. Documented the five runtime flags (`--headless`, `--attach`, `--port`, `--no-devtools`, default 47654) and the v1.1 test matrix (build / test / e2e / annotation lint / manual Chrome toolbar / DevTools webapp).
- Edited `agrune/docs/improvement-notes.md`: added a dated pivot banner (`_v1.1 기준. 2026-04 CDP-only 피봇 이후 갱신._`) under the H1 and rewrote the design-principle bullet from `extension + native host + backend daemon + MCP` to `CdpDriver + @agrune/mcp`.

## Verification

- `grep -nE 'extension mode|native messaging|backend daemon|extension \+ native' README.md AGENTS.md docs/improvement-notes.md` returns nothing.
- README contains "CDP", "47654", "DevTools", "pnpm test:e2e", "pnpm lint:annotations".
- AGENTS contains "pnpm test:e2e", "47654", "--attach", "--no-devtools".
- improvement-notes contains "CdpDriver" and "v1.1".

## Files modified

- `agrune/README.md`
- `agrune/AGENTS.md`
- `agrune/docs/improvement-notes.md`
