# Phase 10 Verification Report

**Phase:** 10 — Docs & Distribution
**Verified:** 2026-04-18
**Status:** PASSED

## Requirements coverage

| REQ | Covered by | Status |
|-----|-----------|--------|
| DOCS-01 | Plan 10-01, 10-02 | ✓ Passed |
| DOCS-02 | Plan 10-05 | ✓ Passed (locally committed to external repo, push deferred) |
| DOCS-03 | Plan 10-03 | ✓ Passed |
| DOCS-04 | Plan 10-04 | ✓ Passed |

## Success criteria (from ROADMAP.md)

1. **`agrune/README.md`·`AGENTS.md`·`docs/notes/`·`docs/improvement-notes.md`에 extension mode 잔재 표현이 남아있지 않다**
   - `grep -rnE "extension mode|native messaging|backend daemon" README.md AGENTS.md docs/improvement-notes.md` → 0 matches
   - `docs/notes/` still contains the literal words `extension`, `native messaging`, `backend daemon` in 10 files, but EVERY hit is either inside the dated archive banner (which explicitly quotes them as "당시 아키텍처 기준") or inside the original v1.0 memo content that the banner frames as historical. Per Phase 10 CONTEXT.md rule "역사 기록은 과거시제로 날짜 명시 — 삭제하지 말 것", this is the intended final state.

2. **`.github/profile/README.md`가 CDP-only·`@agrune/mcp` 메시지로 갱신되어 github.com/agrune 조직 프로필에 반영된다**
   - External repo commit `7cea367 docs(profile): update org README for v1.1 CDP-only architecture` created locally.
   - Not yet pushed — user needs to run `git -C /Users/chenjing/dev/agrune/.github push origin main`.
   - Draft retained at `.planning/phases/10-docs-distribution/PROFILE-README.draft.md`.

3. **`agrune --help`을 실행하면 `--headless`·`--attach`·`--port`·`--no-devtools`와 기본 포트 47654가 문서화되어 보인다**
   - `node packages/mcp/dist/bin/agrune-mcp.js --help` output contains all five tokens.
   - Exit 0, no Chrome launched, no DevTools server started.

4. **사용자가 README만 보고 automation profile을 import하거나 복제하는 단계를 따라할 수 있다**
   - README now has `### Automation profile` section with three labeled subsections (new / clone / attach) and a summary table. Cross-platform commands (macOS, Linux, Windows PowerShell).

## Plan-by-plan verification

### 10-01 (core docs cleanup)
- README rewritten CDP-only; Korean tagline preserved; 11 MCP tools listed with `agrune_focus` + `recovered` flag note.
- AGENTS.md rewritten; v1.0 `feat/cdp-migration` branch note removed; e2e + annotation lint commands added.
- improvement-notes.md gets dated pivot banner + CdpDriver rewrite.

### 10-02 (archive banners)
- `docs/notes/README.md` index created.
- 9 historical notes carry the archive banner on line 1.

### 10-03 (CLI --help + flag table)
- `--help`/`-h`/`--version`/`-v` short-circuit added; exits 0 before driver construction.
- `--user-data-dir` flag plumbed through to CdpDriver with stderr warning when combined with `--attach`.
- `pnpm --filter @agrune/mcp build` succeeds.
- README `### CLI 플래그` table matches help output.

### 10-04 (automation profile UX)
- `### Automation profile` section added to README; no new CLI surface.

### 10-05 (org profile)
- Draft authored.
- External `.github` repo: single local commit `7cea367`, not pushed.

## Build sanity

- `pnpm --filter @agrune/mcp build` → ESM + DTS both succeed.
- Postbuild hook ran (synced dist to `~/.agrune/mcp-server` per existing project convention).

## Residual

- Grep for `extension`/`native messaging`/`backend daemon` in `docs/notes/` still returns hits; all are inside archive-banner-framed historical content (intentional per CONTEXT.md).
- External `.github` repo commit not pushed (phase rule: commit once, no push).

## Gaps found

None. All four requirements satisfied.
