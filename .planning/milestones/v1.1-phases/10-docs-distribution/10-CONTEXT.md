# Phase 10: Docs & Distribution - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

외부 사용자가 `agrune/README.md`·조직 프로필 README·CLI `--help`만 보고 CDP-only 현실의 agrune를 이해하고 시작할 수 있도록 문서·배포 표면을 정리한다.

**Depends on**: Phase 9 (실제 동작 표면이 확정된 뒤 문서를 맞춰야 drift가 재발하지 않음).

Requirements: DOCS-01, DOCS-02, DOCS-03, DOCS-04.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
공유 규칙:

- **DOCS-01 (extension mode 잔재 제거)**: `agrune/README.md`, `agrune/AGENTS.md`, `agrune/docs/notes/` (전체), `agrune/docs/improvement-notes.md`에서 extension/native messaging/backend daemon 표현을 제거·재작성. 최종 상태에서 grep으로 "extension"·"native messaging"·"backend daemon" 표현이 의도된 역사 기록 외에는 남지 않아야 함.
- **외부 `/Users/chenjing/dev/agrune/CLAUDE.md`·`AGENTS.md`**: 상위 폴더는 별도 git 관리가 아니므로 **본 phase에서는 touch 하지 않는다**. 메모리에 남은 대로 별도 보관. (STATE.md에도 이 방침이 기록돼 있음.)
- **DOCS-02 (조직 프로필)**: `.github/profile/README.md`는 **별도 git 저장소** `/Users/chenjing/dev/agrune/.github/.git`에서 관리. cross-repo workflow:
  1. 현재 agrune repo에서 새 문구 초안을 `.planning/phases/10-docs-distribution/PROFILE-README.draft.md`로 작성.
  2. 외부 저장소에 git commit 하려면 cwd 전환이 필요하며, 자동화 agent는 cwd change·commit 한 건만 시도하되 실패 시 draft만 남기고 `human_needed`로 표시.
- **DOCS-03 (CLI --help)**: `agrune` CLI (`packages/mcp/bin/agrune-mcp.ts` 등)의 `--help` 출력에 `--headless`·`--attach`·`--port`·`--no-devtools`·기본 포트 47654를 문서화. README와 일관되게.
- **DOCS-04 (automation profile UX)**: README에서 automation profile import/복제 단계를 명시. 필요한 CLI 하위 명령이 아직 없다면 본 phase에서 최소 `agrune profile import <path>`/`agrune profile list` 수준의 경량 명령을 추가하되, 기능 폭발이 생기면 문서 단위만 정리하고 실제 CLI 구현은 v1.2+로 연기(여부는 plan-phase에서 판단).
- **GitHub 조직 프로필 sync**: 제품 표면이 변경됐으므로 `.github/profile/README.md` 업데이트는 필수 (memory: feedback_github_org_profile_sync).
- **문서 포맷**: 기존 README 톤(한국어 + 영어 혼용) 유지. CDP-only 메시지 일관.

</decisions>

<canonical_refs>
## Canonical References

### Project docs
- `.planning/REQUIREMENTS.md` §"Docs & Distribution" — DOCS-01~04
- `.planning/ROADMAP.md` §"Phase 10" — Success Criteria
- `.planning/PROJECT.md` — 제품 포지셔닝

### 문서 surfaces
- `agrune/README.md`
- `agrune/AGENTS.md`
- `agrune/CLAUDE.md`
- `agrune/docs/notes/` (서브디렉터리 전체)
- `agrune/docs/improvement-notes.md`
- 외부: `/Users/chenjing/dev/agrune/.github/profile/README.md` (별도 git 저장소)

### CLI surfaces
- `packages/mcp/bin/agrune-mcp.ts` 및 `agrune` CLI 엔트리
- Phase 9에서 추가된 `packages/core/bin/agrune-lint.js`

</canonical_refs>

<code_context>
## Existing Code Insights

Will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

- README 다이어그램/아스키 아트가 있다면 유지, 단 extension 언급만 제거.
- 기본 포트 47654는 설명에 반드시 포함.
- 조직 프로필은 1-2 문단 수준 요약 + 주요 링크.

</specifics>

<deferred>
## Deferred Ideas

- 본격적인 홈페이지·랜딩 페이지 리뉴얼은 v1.2+.
- 다국어(full 영어 번역)도 v1.2+.

</deferred>

---

*Phase: 10-docs-distribution*
*Context gathered: 2026-04-18*
