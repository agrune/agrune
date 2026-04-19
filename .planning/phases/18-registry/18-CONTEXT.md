# Phase 18: REGISTRY - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

`github.com/agrune/maps` 가 공개되어 외부 사이트 자동화가 커뮤니티 기여로 확장되고, 트래픽이 붙기 전 **v0.5 scope 안에서** tier/velocity limit/PR bot/revocation 경로를 포함한 governance가 확정된다.

### Success Criteria (from ROADMAP)
1. `github.com/agrune/maps` 저장소가 공개되고 10개 seed manifest(low-risk 유명 사이트 — 예: news 읽기, docs 검색 등 sensitive 필드 적은 사이트 우선)가 `verified` tier로 merge된 상태.
2. CLI `agrune maps {add, types, doctor, submit}` 동작:
   - `add` → `~/.agrune/maps/<host>@<ver>.json` 캐시 + `agrune.maps.lock.json` content-hash 잠금 생성
   - `types` → `.d.ts` emit
   - `doctor` → stale manifest 진단 + auto-disable
   - `submit` → `@octokit/rest` 로 PR 생성
3. `REGISTRY_GOVERNANCE.md` 존재, tier 시스템(`verified`/`community`/`unlisted`), 신규 저자 첫 3 PR 30일 holddown(velocity limit), revocation 경로(incident list fetch + CLI auto-disable), maintainer 부재 시 default(disable-all) 명시.
4. PR bot(GitHub Actions)이 `sensitive:false` 변경을 자동 하이라이트하고 `requires-human-review:sensitive` 라벨을 강제 부착. Weekly selector health check로 stale manifest에 `stale` 라벨 자동 부여.
5. `agrune maps doctor` 실행 시 로컬 캐시의 모든 manifest가 registry 최신 버전 대비 staleness(weekly re-fetch 기준) 진단, stale이면 경고 + auto-disable 경로 제안.

### Requirements
REGISTRY-01, REGISTRY-02, REGISTRY-03, REGISTRY-04, REGISTRY-05, REGISTRY-06

### Dependencies
Phase 17 (inline 경로 제거 + manifest schema stable). Phase 17 완료 후에만 공개 — 초기 공개 후 schema 변경은 migration 지옥.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per workflow.skip_discuss setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Known constraints from project context
- **Monorepo layout**: pnpm workspace, `@agrune/*` packages. CLI lives as `@agrune/maps-cli` or extended `@agrune/cli` (plan-phase research 결정).
- **Manifest schema**: v3 stable (Phase 11). content-hash는 stable canonical JSON serialization 필요.
- **External repo**: `/Users/chenjing/dev/agrune/agrune/maps` or separate checkout. 초기 seed는 repo 내 `registry-seed/` 디렉토리로 prototype 후 분리.
- **No real users yet**: breaking 변경 자유도 있음. Backward-compat adapter 없이 직행 (project memory decision).
- **Autonomous mode**: 외부 push / GitHub repo 생성은 사용자 수동. Claude는 로컬 로직 + 문서 + 시딩 데이터 준비만.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Key areas:
- `packages/manifest/` — manifest schema (zod), defineManifest/defineTarget/defineMacro, content hashing utilities
- `packages/cli/` — existing `agrune` CLI entry (manifest watcher, commands)
- `packages/mcp/` — MCP server, tool surface (no direct registry dependency)
- External repo conventions: `/Users/chenjing/dev/agrune/.github/profile/README.md` sync pattern (17-04)

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond ROADMAP — discuss phase skipped.

### Open decisions for plan-phase research
- Registry repo 구조: flat `manifests/<host>.json` vs. tiered `manifests/<tier>/<host>/` 
- `agrune maps add` cache location: `~/.agrune/maps/` vs. project-local `.agrune/maps/`
- `agrune maps doctor` staleness threshold: weekly re-fetch, 4주 stale, 8주 auto-disable (예시)
- PR bot 구현: GitHub Actions workflow vs. external service
- Seed manifest 선정 기준: 10개 low-risk 사이트 — project memory에 "선정 기준 확정"이 pending으로 남음

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

### Items explicitly out of scope for v0.5 (post-milestone)
- Paid tier / monetization
- Non-GitHub backing store (S3, own server)
- Auto-capture of `sensitive:true` diff alerts via Slack/Discord webhook
- Localization of registry metadata (tags, description)

</deferred>
