# Phase 18: REGISTRY - Research

**Researched:** 2026-04-20
**Domain:** Public manifest registry (GitHub repo + CLI cache + PR submission + governance automation)
**Confidence:** MEDIUM-HIGH (external tooling stack verified via npm; governance thresholds ASSUMED pending maintainer input)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Monorepo layout:** pnpm workspace, `@agrune/*` packages. CLI는 `@agrune/maps-cli` 또는 확장된 `@agrune/cli` 중 선택 (plan-phase 확정). [VERIFIED: 현재 CLI는 `@agrune/mcp`의 `bin/agrune-mcp.ts` 단일 binary → 본 연구는 이 기존 패턴 확장을 권고, 아래 "Architectural Responsibility Map" 참조]
- **Manifest schema:** v3 stable (Phase 11). content-hash는 stable canonical JSON serialization 필요.
- **External repo:** `/Users/chenjing/dev/agrune/agrune/maps` 또는 별도 checkout. 초기 seed는 repo 내 `registry-seed/` 디렉토리로 prototype 후 분리.
- **No real users yet:** breaking 변경 자유. Backward-compat adapter 없이 직행.
- **Autonomous mode:** 외부 push / GitHub repo 생성은 사용자 수동. Claude는 로컬 로직 + 문서 + 시딩 데이터 준비만.

### Claude's Discretion
- Registry repo 구조: flat `manifests/<host>.json` vs. tiered `manifests/<tier>/<host>/`
- `agrune maps add` cache location: `~/.agrune/maps/` vs. project-local `.agrune/maps/` (Context 문서에는 `~/.agrune/maps/` 로 지정되어 있으므로 이를 default로 채택, project-local은 오버라이드 가능)
- `agrune maps doctor` staleness threshold: weekly re-fetch, 4주 stale, 8주 auto-disable (Context 예시 기준)
- PR bot 구현: GitHub Actions workflow vs. external service
- Seed manifest 선정 기준: 10 low-risk 사이트

### Deferred Ideas (OUT OF SCOPE for v0.5)
- Paid tier / monetization
- Non-GitHub backing store (S3, own server)
- Auto-capture of `sensitive:true` diff alerts via Slack/Discord webhook
- Localization of registry metadata (tags, description)
- Distributed ownership model (REGISTRY-07, v0.6+)
- YAML export (REGISTRY-08, v0.6+)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REGISTRY-01 | `github.com/agrune/maps` 저장소 구조 초기화 + 10 seed manifest (verified tier) | § "Registry Repo Architecture", § "Seed Manifest Selection" |
| REGISTRY-02 | CLI `agrune maps {add, types, doctor, submit}` 구현 | § "CLI Design", § "Standard Stack" |
| REGISTRY-03 | `~/.agrune/maps/<host>@<ver>.json` 디스크 캐시 + `agrune.maps.lock.json` content-hash 잠금 | § "Cache & Lock Layout", § "Content Hash" |
| REGISTRY-04 | `REGISTRY_GOVERNANCE.md` — tier 시스템 / velocity limit / revocation | § "Governance Doc Structure", § "Tier Transition Triggers" |
| REGISTRY-05 | PR bot — `sensitive:false` diff 자동 하이라이트 + weekly health check | § "PR Bot (GitHub Actions)", § "Weekly Health Check" |
| REGISTRY-06 | `agrune maps doctor` — staleness 진단 + 자동 disable | § "Doctor Command", § "Staleness Detection" |
</phase_requirements>

## Summary

Phase 18은 순수한 **새 코드 + 새 repo + 거버넌스 문서** 작업이다. 스키마는 Phase 11에서 이미 stable하고 (v3), Phase 17에서 legacy 경로와 regression guard가 닫혔다. 따라서 **기존 런타임 / 브라우저 / React 패키지는 건드리지 않고**, CLI 서브커맨드 확장 + 신규 `@agrune/registry` 패키지 + 외부 repo 디렉토리 구조 + GitHub Actions workflow만 추가하면 된다.

결정적 tradeoff는 3가지:

1. **PR 인증 모델** — `@octokit/rest` (PAT 전제) vs. `@octokit/auth-oauth-device` (Device Flow, first-time contributor DX 우수)
2. **Registry 저장소 레이아웃** — flat `manifests/<host>@<ver>.json` vs. tiered `manifests/<tier>/<host>/` (tier migration 시 파일 이동이냐 메타데이터 이동이냐)
3. **PR bot enforcement scope** — Action이 "label만 부착"할지, "sensitive 변경 시 merge block"까지 할지 (후자는 branch protection 의존)

**Primary recommendation:** `agrune` 기존 binary에 `maps {add,types,doctor,submit}` 서브커맨드를 추가하고 (manifest validate/dev 와 동일 패턴), registry 로직은 신규 `@agrune/registry` 패키지로 분리 (`@agrune/mcp`가 가져다 쓰는 workspace dep). Registry repo는 **flat + tier는 각 manifest 파일의 metadata 필드**로 표현 (파일 이동 없이 tier transition 가능). PR bot은 `@octokit/rest` + GitHub Actions로 **label enforcement**만 수행하고, branch protection에서 "requires-human-review:sensitive 라벨이 붙어있을 때만 reviewer 2명" 룰은 저장소 설정으로 분리 (사용자 수동).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Registry repo schema (JSON shape) | External GitHub repo (`agrune/maps`) | `@agrune/manifest` (re-exported types) | Schema는 manifest v3의 superset — 기존 `ManifestSchema` 재사용 + registry 메타(tier/author/createdAt)만 추가 |
| Content hashing | `@agrune/registry` (new) | `@agrune/manifest` (canonical-json utility) | Hash는 manifest의 bit-for-bit identity — 스키마 패키지가 소유 |
| CLI subcommand routing | `@agrune/mcp` bin (`agrune` entry) | `@agrune/registry` (command impl) | 기존 `manifest validate`/`dev`와 동일 dispatch 패턴 (bin/agrune-mcp.ts lines 64-87 참조) |
| HTTP fetch (registry → local) | `@agrune/registry` | Node 22 `fetch` (built-in) | 외부 라이브러리 불필요 — Node 22 내장 fetch, 이미 workspace minimum |
| Disk cache / lockfile | `@agrune/registry` | — | 로컬만 건드림, 다른 패키지 의존 없음 |
| PR submission | `@agrune/registry` | `@octokit/rest` 또는 fork-based | 외부 네트워크 의존 — 격리된 submodule로 |
| PR bot (diff analysis) | GitHub Actions (`.github/workflows/`) 외부 repo | `@agrune/registry` (shared validator) | bot이 `agrune/maps` repo에 살지만 `@agrune/manifest` validator를 npm으로 import |
| Weekly health check | GitHub Actions cron 외부 repo | `@agrune/registry` | 동일 bot pattern |
| Governance doc | Markdown in external repo | — | 런타임 코드 의존성 0 |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@octokit/rest` | `22.0.1` | GitHub REST API client (PR 생성, fork, contents) | GitHub 공식 메인테인, 모든 REST endpoint 커버, TypeScript 타입 내장 [VERIFIED: npm view @octokit/rest version = 22.0.1] |
| `@octokit/auth-oauth-device` | `8.0.3` | Device Flow authentication (first-time user DX) | PAT보다 UX 우수 — 브라우저에서 "device code 입력" 플로우로 headless-friendly [VERIFIED: npm view] |
| `fast-json-stable-stringify` | `2.1.0` | Canonical JSON serialization (content-hash 입력) | 10년+ 유지, 키 정렬 결정적, 모든 JSON-safe 값 지원 [VERIFIED: npm view] |
| `semver` | `7.7.4` | Version comparison / range matching (`^1.2.0` 등) | npm 자체가 쓰는 사실상 표준 [VERIFIED: npm view] |
| `zod` | `4.3.6` | Registry metadata schema validation (이미 workspace dep) | 기존 패키지가 전부 사용 — `@agrune/manifest`, `@agrune/mcp` 모두 의존 [VERIFIED: packages/manifest/package.json L25] |
| Node 22 built-in `crypto` | — | SHA-256 content hash | 외부 의존성 없이 `createHash('sha256')` 사용 가능 [VERIFIED: Node 22 LTS] |
| Node 22 built-in `fetch` | — | Registry HTTP GET | workspace minimum = Node 22, undici 내장 [VERIFIED: actions/setup-node@v4 node-version: 22] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@actions/core` | `3.0.0` | GitHub Actions output/annotation helpers | PR bot / weekly health check workflow 내부에서 (workspace dep 아님 — workflow 스크립트에서만) [VERIFIED: npm view] |
| `picocolors` | `1.1.1` | Terminal color output (chalk 대체, 경량) | CLI 진단 출력 (`doctor` warning 강조용) [VERIFIED: npm view] |
| 기존 `diff` `8.0.2` | (already dep of `@agrune/mcp`) | Lockfile diff preview in `agrune maps add` | 이미 workspace에 있음 — recorder 머지와 동일 dep 재사용 [VERIFIED: packages/mcp/package.json L30] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@octokit/rest` + device-flow | Fork-based unauthenticated (push to user fork, manual PR link) | 인증 로직 0 but DX ↓ (사용자 수동 clone/fork/push) — v0.5 minimum으로는 동작하지만 `submit` 명령 의미 퇴색 |
| `fast-json-stable-stringify` | `safe-stable-stringify` | 후자는 BigInt / circular ref 처리 추가, 본 도메인에서는 불필요 (manifest는 순수 JSON-safe) |
| 자체 argparse | `commander@14.0.3` / `cac@7.0.0` | 기존 bin/agrune-mcp.ts는 **수동 argv 파싱** (일관성 유지). maps 서브커맨드도 동일 패턴 — 새 dep 추가 비용 피함 |
| SHA-256 | SHA-1 | SHA-1 collision 위험, content-hash에는 부적절. SHA-256이 git이 2021+ 로 전환 중인 표준 |
| Separate `@agrune/cli` package | 기존 `@agrune/mcp` bin 확장 | CONTEXT 문서가 둘 다 허용. mcp bin이 이미 `manifest validate`/`dev` 서브커맨드를 호스트 — 동일 패턴 확장이 reader에게 일관성 |

**Installation (new deps only):**

```bash
pnpm --filter @agrune/registry add @octokit/rest@22 @octokit/auth-oauth-device@8 fast-json-stable-stringify@2 semver@7 picocolors@1
# zod, diff는 기존 workspace dep 재사용
```

**Version verification date:** 2026-04-20. 패키지 불안정성 낮음 (Octokit은 semver 메이저 주기 1년+, fast-json-stable-stringify는 5년간 minor만).

## Architecture Patterns

### System Architecture Diagram

```
  ┌──────────────────────────────────────────┐
  │  Author Machine                          │
  │                                          │
  │  ┌──────────────┐        ┌────────────┐ │
  │  │ author writes │ ─────▶ │ agrune maps │─────┐
  │  │ manifest.ts  │   TS   │ submit      │     │
  │  └──────────────┘        └────────────┘     │
  │                                              │
  │  ┌──────────────┐        ┌────────────┐     │
  │  │  project     │ ◀───── │ agrune maps │     │
  │  │  manifest.ts │ types  │ add <host>  │◀────┼── GET manifest JSON
  │  │  +           │ merge  │             │     │
  │  │  lockfile    │        └────────────┘     │
  │  └──────────────┘               │            │
  │         │                       │ cache      │
  │         │                       ▼            │
  │         │                 ┌─────────┐        │
  │         │                 │ ~/.agrune│        │
  │         │                 │ /maps/  │        │
  │         │                 └─────────┘        │
  │         │                                     │
  │         │  agrune maps doctor                 │
  │         └────────────▶ staleness check ──────┤
  │                                               │
  └───────────────────────────────────────────────┤
                                                  │
                                                  │ octokit + device-flow
                                                  ▼
  ┌──────────────────────────────────────────────────┐
  │  github.com/agrune/maps  (public registry repo)  │
  │                                                  │
  │  ┌────────────────────┐   ┌───────────────────┐ │
  │  │ manifests/         │   │ REGISTRY_         │ │
  │  │   example.com@     │   │ GOVERNANCE.md     │ │
  │  │   1.0.0.json       │   │                   │ │
  │  │ incidents.json     │   │ README.md         │ │
  │  │ index.json         │   │                   │ │
  │  └────────────────────┘   └───────────────────┘ │
  │                                                  │
  │  ┌──────────────────────────────────────────┐   │
  │  │ .github/workflows/                       │   │
  │  │   pr-bot.yml      (on: pull_request)     │   │
  │  │     ├── schema validation                │   │
  │  │     ├── sensitive:* diff highlight       │   │
  │  │     ├── tier enforcement                 │   │
  │  │     └── velocity limit check             │   │
  │  │   health-check.yml (on: schedule weekly) │   │
  │  │     ├── fetch each manifest URL          │   │
  │  │     ├── selector liveness sample         │   │
  │  │     └── label 'stale' if fail 2 weeks    │   │
  │  └──────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────┘
                           │
                           │ PR bot fetches latest
                           │ agrune/maps/incidents.json
                           │ on every `agrune maps doctor`
                           ▼
                    ┌─────────────┐
                    │ user CLI    │
                    │ auto-disable│
                    │ revoked host│
                    └─────────────┘
```

Entry points: (1) author writes manifest.ts, (2) author runs `agrune maps submit`, (3) agent runs `agrune maps add <host>`, (4) user runs `agrune maps doctor` periodically. Data flows left-to-right: local authoring → PR → merge → registry repo → CLI fetch → disk cache → project lockfile. Decision points: PR bot gates merge via labels; `doctor` gates runtime via disable.

### Recommended Project Structure

```
packages/
├── registry/                      # NEW
│   ├── src/
│   │   ├── index.ts               # public API (used by agrune bin)
│   │   ├── cli/
│   │   │   ├── add.ts             # agrune maps add <host>
│   │   │   ├── types.ts           # agrune maps types
│   │   │   ├── doctor.ts          # agrune maps doctor
│   │   │   └── submit.ts          # agrune maps submit
│   │   ├── cache.ts               # ~/.agrune/maps/ read/write + lock
│   │   ├── content-hash.ts        # fast-json-stable-stringify + sha256
│   │   ├── registry-client.ts     # fetch from github.com/agrune/maps (raw.githubusercontent.com)
│   │   ├── lockfile.ts            # agrune.maps.lock.json shape + atomic write
│   │   ├── staleness.ts           # doctor logic
│   │   └── schema.ts              # RegistryEntrySchema (wraps ManifestSchema + metadata)
│   ├── tests/
│   └── package.json               # deps: @agrune/manifest, @octokit/rest, ...
└── mcp/
    └── bin/
        └── agrune-mcp.ts          # MODIFY: add "maps" subcommand dispatch (lines ~64-87)

registry-seed/                      # NEW — v0.5 seed repo content, later move to github.com/agrune/maps
├── README.md
├── REGISTRY_GOVERNANCE.md
├── manifests/
│   ├── hackernews.com@1.0.0.json
│   ├── en.wikipedia.org@1.0.0.json
│   ├── ... (10 seed sites)
├── incidents.json                  # empty array initially
├── index.json                      # machine-readable catalog (auto-generated by PR bot)
└── .github/
    └── workflows/
        ├── pr-bot.yml
        └── health-check.yml
```

### Pattern 1: CLI Subcommand Dispatch

**What:** `agrune` binary의 단일 argv switch — 기존 `manifest validate`/`dev` 패턴을 `maps {add,types,doctor,submit}`으로 확장
**When to use:** 새 서브커맨드를 추가할 때
**Example:**

```typescript
// packages/mcp/bin/agrune-mcp.ts — EXISTING pattern (lines 64-87)
if (args[0] === 'manifest') { ... }

// NEW — add below manifest block
if (args[0] === 'maps') {
  const subArgs = args.slice(1)
  const sub = subArgs[0]
  if (sub === 'add') {
    const { runAddCli } = await import('@agrune/registry/cli/add')
    process.exit(await runAddCli(subArgs.slice(1)))
  }
  if (sub === 'types' || sub === 'doctor' || sub === 'submit') {
    const { runCli } = await import(`@agrune/registry/cli/${sub}`)
    process.exit(await runCli(subArgs.slice(1)))
  }
  process.stderr.write(`Unknown maps subcommand: ${sub}\n`)
  process.exit(1)
}
```

**Source:** `/Users/chenjing/dev/agrune/agrune/packages/mcp/bin/agrune-mcp.ts` L64-87 [VERIFIED: read 2026-04-20]

### Pattern 2: Content Hash (stable canonical JSON)

**What:** Manifest JSON → 키 정렬 직렬화 → SHA-256 → `sha256:<hex>` 형태 content hash
**When to use:** Lockfile 잠금, registry entry immutability 증명, cache invalidation key

```typescript
// packages/registry/src/content-hash.ts
import { createHash } from 'node:crypto'
import stableStringify from 'fast-json-stable-stringify'
import type { AgruneManifest } from '@agrune/manifest'

export function contentHash(manifest: AgruneManifest): string {
  const canonical = stableStringify(manifest)  // 키 정렬 + 결정적 whitespace
  const hash = createHash('sha256').update(canonical, 'utf-8').digest('hex')
  return `sha256:${hash}`
}
```

**Source:** `fast-json-stable-stringify` README — determinism guaranteed for JSON-safe values [CITED: https://www.npmjs.com/package/fast-json-stable-stringify]

**Why prefixed `sha256:`:** Multihash convention — 미래에 다른 hash로 마이그레이션하기 쉬움. npm integrity와 동일 패턴 (`sha512-...`).

### Pattern 3: Lockfile Shape

**What:** `agrune.maps.lock.json` — project root에 커밋되는 lockfile
**When to use:** `agrune maps add`가 쓰고, runtime이 로드할 manifest version을 결정

```typescript
// packages/registry/src/lockfile.ts
export interface LockfileEntry {
  host: string                 // e.g. "hackernews.com"
  version: string              // semver, e.g. "1.0.0"
  contentHash: string          // "sha256:..."
  tier: 'verified' | 'community' | 'unlisted'
  fetchedAt: string            // ISO 8601
  source: string               // URL from which it was fetched
  disabled?: {
    reason: 'stale' | 'revoked' | 'user'
    at: string                 // ISO 8601
  }
}

export interface Lockfile {
  version: 1
  entries: LockfileEntry[]     // sorted by host (determinism for diff review)
}
```

**Rationale:** npm `package-lock.json` / pnpm `pnpm-lock.yaml` 패턴 모사 — determinism이 핵심. `disabled` 필드는 `doctor`가 auto-disable 했을 때 기록.

### Pattern 4: Registry Entry Schema

**What:** `manifests/<host>@<ver>.json`의 shape — `AgruneManifest`를 감싸는 메타 래퍼
**When to use:** Registry repo에 저장된 JSON 파일 shape 정의

```typescript
// packages/registry/src/schema.ts
import { z } from 'zod'
import { ManifestSchema } from '@agrune/manifest'

export const RegistryEntrySchema = z.object({
  registry: z.object({
    host: z.string(),                                    // "hackernews.com"
    version: z.string(),                                 // "1.0.0" — semver
    tier: z.enum(['verified', 'community', 'unlisted']),
    author: z.string(),                                  // GitHub handle
    submittedAt: z.string().datetime(),                  // ISO
    reviewedBy: z.array(z.string()).optional(),          // GitHub handles
  }),
  manifest: ManifestSchema,                              // Phase 11 reuse
})
```

**Why separate `registry` top-level field:** Manifest는 그대로 재사용해서 `agrune maps types` emit시 타입이 깨끗해짐. Metadata는 registry에서만 필요.

### Pattern 5: PR Bot Workflow (label-only enforcement)

**What:** GitHub Actions workflow가 PR에 라벨만 부착. Branch protection이 병합을 gate.
**When to use:** Registry repo에서 contributor가 PR 열 때 자동 분류

```yaml
# agrune/maps/.github/workflows/pr-bot.yml
name: PR Bot
on:
  pull_request:
    paths: ['manifests/**']
jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install @agrune/manifest@latest fast-json-stable-stringify
      - name: Validate schema + detect sensitive diff
        run: node .github/scripts/pr-bot.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          PR_AUTHOR: ${{ github.event.pull_request.user.login }}
```

**Labels the bot applies:**
- `requires-human-review:sensitive` — PR diff에서 `"sensitive":true` → `"sensitive":false` 전환 감지 (MANIFEST-04 OR-only 위반 의심)
- `requires-human-review:sensitive` — 또는 `sensitive:true` field 삭제 감지
- `velocity:holddown` — author의 merged-PR 수 < 3 AND 첫 PR 이후 < 30 days
- `schema-fail` — zod validation 실패
- `tier-escalation` — `"tier": "community"` → `"tier": "verified"` 전환 감지

**Branch protection setup (사용자 수동):**
- `requires-human-review:sensitive` 라벨이 있으면 2명 reviewer 필수
- `schema-fail` 라벨이 있으면 merge block
- Bot 계정 자체는 contents:write 없음 → 라벨만 부착

**Source:** GitHub Actions permissions best practice [CITED: https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs]

### Pattern 6: Weekly Health Check Cron

**What:** 매주 cron으로 registry의 모든 manifest의 seed URL을 열어 selector ladder 중 최소 1개라도 매칭되는지 확인
**When to use:** 선택자 drift 조기 감지

```yaml
# agrune/maps/.github/workflows/health-check.yml
on:
  schedule: [{ cron: '0 6 * * 1' }]   # Monday 06:00 UTC
  workflow_dispatch:
jobs:
  probe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx playwright install --with-deps chromium
      - run: node .github/scripts/health-check.mjs
```

**Logic:** 각 `manifests/<host>@<ver>.json`마다 seed URL (manifest의 `registry.seedUrl` — 메타 추가 필드) 을 열고 targets 중 3개 랜덤 샘플의 selector를 resolve. 2주 연속 실패 시 manifest에 `stale` 라벨을 PR로 제안 (bot이 자동 PR을 열어 `registry.staleSince` 필드 추가).

### Anti-Patterns to Avoid

- **파일 경로로 tier 표현 (tiered directory):** `manifests/verified/hackernews.com/1.0.0.json` → tier transition이 `git mv` + lockfile 전체 rewrite. 대신 **파일 메타데이터 필드 `registry.tier`**를 single source of truth로.
- **Registry에 의존성 트리 표현:** npm처럼 dependency resolution 도입하면 lockfile이 graph가 됨. 각 manifest는 **self-contained** (다른 manifest를 참조하지 않음).
- **CLI에서 `exec('git push')` 호출:** `submit`이 사용자 git config를 건드리면 side effect 예측 불가. 반드시 **Octokit API를 통한 fork + commit + PR** (순수 HTTP).
- **PR bot에서 sensitive false → true 경고 누락:** OR-only 계약상 `true`로 추가하는 것은 OK, `false`로 바꾸는 게 위험. 둘 다 라벨 붙이지 말고 **위험한 쪽만** (reviewer attention 분산 방지).
- **Health check에서 실제 action 수행:** `click`/`fill`을 실제로 쏘면 external 사이트 부하 + 법적 이슈. **snapshot + resolve 검증까지만**.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canonical JSON serialization | 직접 키 정렬 | `fast-json-stable-stringify` | 음수 0, NaN, nested object 순서, Unicode normalization — edge case 수십 개 |
| GitHub API client | `fetch` + 직접 header 관리 | `@octokit/rest` | Rate limit / retry / pagination / conditional requests 내장 |
| Device flow auth | 직접 OAuth polling | `@octokit/auth-oauth-device` | CSRF / token expiry / poll interval 공식 구현 |
| Semver comparison | `split('.').map(Number)` | `semver` | prerelease / build metadata / range syntax 전부 처리 |
| Diff rendering | Myers algorithm 직접 | 기존 workspace dep `diff@8` | 이미 workspace에 있음, recorder merger와 동일 패턴 |
| Cron scheduling | 자체 scheduler | GitHub Actions `schedule:` | 관리할 인프라 0 |
| PR label management | 직접 gh CLI 호출 | Octokit `issues.addLabels` | typed API, 권한 명확 |
| SHA hash | 직접 SHA-256 | Node 22 `crypto.createHash` | 표준 라이브러리 |

**Key insight:** Phase 18의 모든 "새 로직"은 이미 검증된 표준 라이브러리로 조립 가능. 자체 구현이 정당화되는 유일한 영역은 (1) **registry 디렉토리 레이아웃 규칙** (domain-specific), (2) **lockfile shape** (domain-specific), (3) **staleness threshold 계산** (domain-specific). 그 외는 전부 off-the-shelf.

## Runtime State Inventory

> Phase 18은 rename/refactor/migration이 아닌 **신규 추가 기능**이므로 이 섹션은 관련 항목이 거의 없다. 그래도 registry 기능이 **새로 생성하는** 런타임 state는 문서화한다 (향후 마이그레이션 phase에서 참조용).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **신규 생성:** `~/.agrune/maps/<host>@<ver>.json` (사용자 홈, 캐시), 프로젝트 `agrune.maps.lock.json` (git 커밋됨) | 초기 생성 로직 + clear 명령 plan에 포함 |
| Live service config | **신규 외부 repo:** `github.com/agrune/maps` — 사용자 수동 생성 필요 (autonomous 제약). CI workflow는 repo 내 파일로 관리되므로 git 추적 |
| OS-registered state | None | — |
| Secrets/env vars | `GITHUB_TOKEN` (CLI `submit`에서 optional — device flow 기본, PAT은 override). Registry repo 내 `secrets.GITHUB_TOKEN`은 Actions 기본 제공 | 환경 변수 명명 convention: `AGRUNE_GITHUB_TOKEN` (사용자 토큰 override용) |
| Build artifacts / installed packages | `@agrune/registry` 신규 npm publish — `pnpm -r build`가 dist/ 생성 | 첫 publish 전까지 workspace internal로만 사용 |

**Nothing found in category (OS-registered state):** None — CLI는 OS-level 등록 없음 (launchd/systemd 대상 아님).

## Common Pitfalls

### Pitfall 1: Content hash instability from whitespace / key reorder

**What goes wrong:** `JSON.stringify(manifest)`로 hash 계산 → author A와 author B가 같은 논리적 manifest를 저장했는데 키 순서가 다르면 hash 달라짐 → PR bot이 "의미 없는 변경" 경고
**Why it happens:** V8 engine의 키 삽입 순서는 결정적이지만, 다른 author의 tool chain (Prettier, ts-morph)이 키 순서를 바꿔쓸 수 있음
**How to avoid:** `fast-json-stable-stringify`로 canonical 직렬화 후 hash. Prettier는 JSON 내부 키 재정렬 안 하므로 별도 `.prettierrc` 설정 불필요
**Warning signs:** PR diff에 "cosmetic" 변경만 있는데 contentHash가 달라짐

### Pitfall 2: Device flow token persistence leak

**What goes wrong:** `agrune maps submit`이 device flow 토큰을 disk에 저장 → 다른 user account가 같은 머신 사용 시 유출
**Why it happens:** 편의성 (두 번째 submit에서 재인증 스킵) 유혹
**How to avoid:** **Token 저장 금지** (v0.5). 매번 device flow 신규 발급. 세션 캐시는 `process.env.AGRUNE_SUBMIT_TOKEN`로만 (사용자가 명시적으로 내보낸 경우)
**Warning signs:** `~/.agrune/maps/.auth.json` 같은 파일 생성 시도 → PR review에서 차단

### Pitfall 3: Velocity limit false positive (bot account / monorepo)

**What goes wrong:** 같은 org의 multiple maintainer가 같은 GitHub account에서 연속 PR → velocity:holddown 라벨 부착 → merge 지연
**Why it happens:** `github.event.pull_request.user.login`은 PR 생성자 기준 — co-author 무시
**How to avoid:** Velocity 체크에서 **allowlist** 도입 — governance doc에 명시된 "maintainer list"는 holddown 면제. Allowlist는 `agrune/maps` repo 내 `maintainers.json` 파일
**Warning signs:** 같은 화이트리스트 저자가 holddown 받음 → PR bot script 로그에 allowlist 적용 여부 기록

### Pitfall 4: Seed URL privacy leak

**What goes wrong:** Registry manifest에 `seedUrl: https://company-internal.example.com/login`을 포함 → 공개 registry가 내부 URL leak
**Why it happens:** Author가 테스트용 URL을 실수로 제출
**How to avoid:** PR bot에서 **public-resolvable host only** 검증 (DNS lookup / HTTP HEAD 200). 내부 도메인이면 schema-fail 라벨
**Warning signs:** seedUrl이 `*.internal`, `localhost`, private IP → auto-reject

### Pitfall 5: Stale detection thrashing (4주 vs 8주)

**What goes wrong:** Threshold가 너무 tight하면 flaky 네트워크로 manifest auto-disable → 사용자 불만
**Why it happens:** 주간 체크 1회 실패만으로 stale 판정
**How to avoid:** **Two-strike rule** — 2주 연속 실패만 stale 라벨. Auto-disable은 4주 무응답. Governance doc에 명시
**Warning signs:** 사용자가 `doctor`에서 `--force-refresh`를 반복 실행 — threshold 너무 빠름을 시사

### Pitfall 6: CLI cache directory permission

**What goes wrong:** 회사 공용 머신에서 `~/.agrune/maps/`가 다른 사용자에게 readable → manifest 내용 (non-sensitive지만 registry-verified 정보) 유출
**Why it happens:** Default umask가 022
**How to avoid:** Cache 디렉토리 생성 시 `mkdir({ mode: 0o700 })`, 파일 쓰기 시 `writeFile({ mode: 0o600 })`. macOS/Linux 한정 — Windows는 ACL 별도 처리
**Warning signs:** Registry 팀에 "내 manifest 목록이 다른 사용자에게 보임" 보고

### Pitfall 7: Pitfall 3 secondary (prod root-import abuse) — REGISTRY 소유

**What goes wrong:** 공격자가 community tier에 올린 manifest가 `production.allow=false`를 기본으로 하지 않아, 다른 사용자 프로덕션 번들에 활성화 가능성
**Why it happens:** Cross-cutting — Phase 13 REACT가 prod guard를 2단계로 구현했지만, registry manifest에 `allowedEnvironments` 같은 필드가 없으면 registry 측 통제 부재
**How to avoid:** Registry 스키마에 `registry.allowedEnvironments: ['dev'] | ['dev', 'prod']` 필드 추가, 기본값 `['dev']`. Community tier 최대값도 `['dev']`. Verified tier만 prod 허용 가능
**Warning signs:** Community tier manifest가 prod guard를 통과시키는 설정 → PR bot이 tier-mismatch 라벨

### Pitfall 8: Pitfall 4 secondary (sensitive false bypass) — REGISTRY 소유

**What goes wrong:** Author가 `sensitive: true`였던 필드를 **삭제** (false 설정이 아니라) → zod는 통과 (optional) → runtime heuristic이 커버 못 하는 edge case 노출
**Why it happens:** MANIFEST-04 OR-only lock은 `false` 전환만 차단, 필드 삭제는 허용 (스키마상 optional)
**How to avoid:** PR bot이 git diff에서 `sensitive: true` 삭제를 감지하면 `requires-human-review:sensitive` 라벨. 복구는 git history에서 이전 버전 대비 diff 비교
**Warning signs:** 동일 targetId에서 이전 version에 `sensitive:true`였는데 새 version에 해당 필드 없음

## Code Examples

### Example 1: `agrune maps add <host>` (최소 버전)

```typescript
// packages/registry/src/cli/add.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { contentHash } from '../content-hash.js'
import { fetchRegistryEntry } from '../registry-client.js'
import { readLockfile, writeLockfile } from '../lockfile.js'
import { validateManifest } from '@agrune/manifest'
import { RegistryEntrySchema } from '../schema.js'

export async function runAddCli(args: string[]): Promise<number> {
  const host = args[0]
  const versionRange = args[1] ?? 'latest'
  if (!host) {
    process.stderr.write('Usage: agrune maps add <host> [version]\n')
    return 1
  }

  // 1. Fetch from github.com/agrune/maps
  const entry = await fetchRegistryEntry(host, versionRange)
  const parsed = RegistryEntrySchema.parse(entry)

  // 2. Re-validate manifest (defense-in-depth, registry may be compromised)
  const schemaResult = validateManifest(parsed.manifest)
  if (!schemaResult.ok) {
    process.stderr.write(`Registry entry for ${host} failed validation:\n`)
    for (const e of schemaResult.errors) process.stderr.write(`  - ${e.path}: ${e.message}\n`)
    return 1
  }

  // 3. Compute hash + compare to registry-declared hash (if present)
  const hash = contentHash(schemaResult.manifest)

  // 4. Write to ~/.agrune/maps/<host>@<version>.json (0600)
  const cacheDir = join(homedir(), '.agrune', 'maps')
  await mkdir(cacheDir, { recursive: true, mode: 0o700 })
  await writeFile(
    join(cacheDir, `${host}@${parsed.registry.version}.json`),
    JSON.stringify(parsed, null, 2),
    { mode: 0o600 },
  )

  // 5. Update agrune.maps.lock.json in project root
  const lock = await readLockfile(process.cwd())
  lock.entries = lock.entries.filter(e => e.host !== host)
  lock.entries.push({
    host,
    version: parsed.registry.version,
    contentHash: hash,
    tier: parsed.registry.tier,
    fetchedAt: new Date().toISOString(),
    source: `https://github.com/agrune/maps/blob/main/manifests/${host}@${parsed.registry.version}.json`,
  })
  lock.entries.sort((a, b) => a.host.localeCompare(b.host))
  await writeLockfile(process.cwd(), lock)

  process.stdout.write(`✓ Added ${host}@${parsed.registry.version} (tier=${parsed.registry.tier})\n`)
  return 0
}
```

**Source pattern:** `packages/mcp/src/manifest-validate-cli.ts` [VERIFIED: read 2026-04-20]

### Example 2: `agrune maps submit` with device flow

```typescript
// packages/registry/src/cli/submit.ts (skeleton)
import { Octokit } from '@octokit/rest'
import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device'

async function authenticate(): Promise<Octokit> {
  // v0.5: token persistence 금지 (Pitfall 2). 매번 device flow.
  const envToken = process.env.AGRUNE_GITHUB_TOKEN
  if (envToken) return new Octokit({ auth: envToken })

  const auth = createOAuthDeviceAuth({
    clientType: 'github-app',   // or 'oauth-app' — registration 후 결정
    clientId: 'AGRUNE_DEVICE_FLOW_CLIENT_ID',  // Phase 18 plan에서 app 등록 필요 (사용자 수동)
    scopes: ['public_repo'],
    onVerification(verification) {
      process.stdout.write(
        `Open ${verification.verification_uri} and enter code: ${verification.user_code}\n`
      )
    },
  })
  const { token } = await auth({ type: 'oauth' })
  return new Octokit({ auth: token })
}

// submit flow:
//  1. octokit.repos.getContent on agrune/maps/manifests/<host>@<ver>.json → 404 = new, 200 = update
//  2. octokit.repos.createFork on agrune/maps (idempotent)
//  3. octokit.repos.createOrUpdateFileContents on fork, branch = `submit/<host>-<version>`
//  4. octokit.pulls.create with base='agrune/maps:main', head='<user>:submit/<host>-<version>'
```

**Source:** Octokit Device Flow docs [CITED: https://github.com/octokit/auth-oauth-device.js]

### Example 3: PR bot sensitive diff detection

```typescript
// agrune/maps/.github/scripts/pr-bot.mjs (runs in Actions, npm-installed deps)
import { Octokit } from '@octokit/rest'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
const prNumber = Number(process.env.PR_NUMBER)
const owner = 'agrune', repo = 'maps'

// Get list of changed manifest files
const { data: files } = await octokit.pulls.listFiles({ owner, repo, pull_number: prNumber })
const manifestFiles = files.filter(f => f.filename.startsWith('manifests/') && f.filename.endsWith('.json'))

const labels = new Set<string>()

for (const f of manifestFiles) {
  const before = f.status === 'added' ? null : JSON.parse(
    execSync(`git show origin/main:${f.filename}`, { encoding: 'utf-8' })
  )
  const after = JSON.parse(readFileSync(f.filename, 'utf-8'))

  // Walk both trees and compare sensitive flags on each targetId
  const beforeSensitive = extractSensitiveMap(before)  // Map<targetId, true | absent>
  const afterSensitive = extractSensitiveMap(after)

  for (const [targetId, wasSensitive] of beforeSensitive) {
    if (wasSensitive && !afterSensitive.get(targetId)) {
      labels.add('requires-human-review:sensitive')  // Pitfall 8 (removal 감지)
    }
  }
}

// ... velocity check (author.login 기반 merged PR count in 30 days)

for (const label of labels) {
  await octokit.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [label] })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PAT-only GitHub CLI auth | Device flow default | ~2022 (GitHub官 recommend) | First-time contributor DX 대폭 개선 |
| Centralized package registry + auth server | Git-based registry (Homebrew / Nix flakes pattern) | ongoing | v0.5 scope에 맞음 (own server 불필요) |
| tier를 디렉토리로 | tier를 metadata 필드로 (npm dist-tags pattern) | 2019+ npm convention | Tier transition 시 파일 이동 제거 |
| `json-stable-stringify` | `fast-json-stable-stringify` | 2014 (fork, 10x faster) | 기본 선택 |
| `chalk` | `picocolors` (for CLI output) | 2022+ (Node 생태계 minimal dep trend) | 설치 시간/bundle 크기 감소 |

**Deprecated/outdated:**
- `gh` CLI 직접 호출을 라이브러리처럼 쓰는 패턴: subprocess 불안정, 테스트 어려움. 대신 Octokit 직접.
- `octokit/core.js` + plugin들 수동 조합: `@octokit/rest`가 번들 제공 (plugin 자동 포함).

## Seed Manifest Selection (REGISTRY-01)

> CONTEXT에서 "10개 low-risk 사이트" 지정. Project memory에 "선정 기준 확정" pending. 아래는 연구자 권고안.

### Selection Criteria (proposed)

| Criterion | Value | Rationale |
|-----------|-------|-----------|
| No auth required | 읽기 / 검색만 | 로그인 flow 필요 시 sensitive field 대량 → 초기 PR bot 테스트 대상으로는 noise |
| No payment flow | × | CVV/card input은 sensitive 정책 stress test 대상 — 초기는 회피 |
| Public content | ○ | registry는 public이므로 private 사이트 금지 |
| Stable DOM | HTML-first, SPA 최소 | 주간 health check 안정성 |
| No heavy consent modal | ○ | EU GDPR consent overlay는 snapshot noise |
| No bot detection | ○ | Cloudflare / reCAPTCHA 걸리면 health check 실패 |
| Diverse target types | link / button / form | 스키마 coverage |

### Proposed 10 Seeds (ASSUMED — author 수동 검증 필요)

| # | Host | Category | Why low-risk |
|---|------|----------|--------------|
| 1 | `news.ycombinator.com` | News aggregator | HTML-first, no auth for read, stable for 15년+ |
| 2 | `en.wikipedia.org` | Encyclopedia | stable wiki, rich semantic HTML, role 기반 selector 친화 |
| 3 | `developer.mozilla.org` | Docs | 검색 + 페이지 탐색, semantic markup |
| 4 | `docs.python.org` | Docs | 버전 스위처 + 검색 |
| 5 | `www.gutenberg.org` | Public library | static catalog, 안정 |
| 6 | `arxiv.org` | Preprint archive | search + abstract read |
| 7 | `pypi.org` | Package index | 검색 + 버전 선택 (동적이지만 stable) |
| 8 | `hn.algolia.com` | HN search UI | 검색 form + filter (form 다양성) |
| 9 | `www.wikidata.org` | Structured data | role 속성 풍부 |
| 10 | `observablehq.com` (public notebooks 읽기) | Notebook platform | interactive element 커버리지 |

**Explicit exclusions (초기에는 피함):**
- 검색엔진 (Google/Bing) — bot detection
- Social media (Twitter/Reddit) — auth + rate limit
- 뉴스 paywall 사이트 (NYT, WSJ)
- E-commerce (Amazon) — auth + 동적 콘텐츠
- GitHub 자체 — 자기참조 루프

[ASSUMED: 구체적 site list는 author가 직접 seed manifest 작성 가능성 확인 후 최종 확정 필요 — plan-phase에서 task로 쪼갤 때 "각 사이트 1개 target 이상 resolve 검증"을 acceptance gate로]

## Governance Doc Structure (REGISTRY-04)

`REGISTRY_GOVERNANCE.md`가 다뤄야 할 섹션 (연구자 권고):

```markdown
# agrune/maps Registry Governance

## Tiers

### `verified` (공식 검증)
- Maintainer review 2명 이상 + 주간 health check 2주 연속 green
- 프로덕션 번들에서 사용 가능 (`registry.allowedEnvironments: ['dev','prod']`)
- Tier promotion: community에서 3개월 연속 stable + incident 0건

### `community` (커뮤니티 기여)
- PR bot schema pass + maintainer 1명 review
- Dev only (`registry.allowedEnvironments: ['dev']`)
- 기본 tier

### `unlisted` (deprecated/retired)
- 과거 verified/community였으나 revocation 받은 경우
- CLI는 경고 + 일반 사용자 접근 차단
- incidents.json에 기록됨

## Velocity Limit

신규 저자 (first GitHub interaction with agrune/maps)의 첫 3 PR은 다음 제약 적용:
- PR 간 최소 간격 30일 (prevents spray attack)
- PR bot이 `velocity:holddown` 라벨 자동 부착 → 병합 지연
- 4번째 PR부터 holddown 해제 (3번까지는 maintainer가 수동 승인으로 건너뛸 수 있음)

## Revocation Path

1. Incident 보고: `agrune/maps` issues에 `incident` 라벨로 submit
2. Maintainer triage → 확정 시 `incidents.json`에 entry 추가 + manifest를 `unlisted` tier로 이동
3. 다음 `agrune maps doctor` 실행 시 CLI가 `incidents.json` fetch → 해당 host 로컬 캐시를 disable
4. Lockfile에 `disabled: { reason: 'revoked', at: ... }` 기록

## Maintainer Absence Default

모든 maintainer가 30일 무응답 시 — 모든 `verified` tier manifest를 자동 `community`로 강등.
60일 무응답 시 — CLI `doctor`가 전 manifest `disable-all` 경고 (새 `agrune maps add`는 경고 + confirm 필요).
```

## Tier Transition Triggers

| From | To | Trigger | Who approves |
|------|----|---------|--------------| 
| new PR | `community` | PR bot schema pass + 1 maintainer review | Maintainer (단일 명령) |
| `community` | `verified` | 3개월 stable + 0 incidents + 2 maintainers + seedUrl health check green 12/12주 | Maintainer ×2 |
| any | `unlisted` | Incident 확정 or revocation 투표 | Maintainer ×1 (emergency) |
| `verified` | `community` | Maintainer absence 30일 (automatic) | Bot |

## Staleness Detection Thresholds (REGISTRY-06)

Context 기준 "weekly re-fetch, 4주 stale, 8주 auto-disable" — 연구자 권고안 (Pitfall 5 반영):

| State | Trigger | CLI 행동 | Lockfile 필드 |
|-------|---------|---------|---------------|
| `fresh` | 최근 fetch < 7일 | no-op | 없음 |
| `week_old` | 7-28일 | `doctor` 실행 시 info 메시지 | 없음 |
| `stale` | health check 2주 연속 fail (bot이 registry에 표기) | `doctor`가 warning + `--auto-disable` 플래그 제안 | `disabled: { reason: 'stale' }` (suggestion only) |
| `auto_disabled` | 4주 무응답 OR registry에서 `unlisted` 전환 | `doctor` 실행 시 자동 disable + confirm 없음 | `disabled: { reason: 'stale'\|'revoked' }` |

**Sampling rate:** `agrune maps doctor`는 외부 호출 없음 (로컬 파일 + cache 검사만). Registry 최신 상태 확인은 `--refresh` 플래그가 있을 때만 HTTP GET (rate limit 방어).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI runtime | ✓ (workspace min 22) | 22+ | — |
| Chrome / Chromium | health check workflow | ✓ (runner) | Actions ubuntu-latest 제공 | — |
| GitHub Actions | PR bot / health check | ✓ | — | — |
| `agrune/maps` GitHub repo | 공개 등록 | **✗** (아직 없음) | — | **사용자 수동 생성 필요 (autonomous 제약)** |
| GitHub App / OAuth App registration | Device flow client_id | **✗** | — | **사용자 수동 — plan에 명시** |
| Maintainer GitHub team | governance | **✗** (초기는 solo) | — | solo maintainer 허용, governance doc에 명시 |
| npm publish permission for `@agrune/registry` | 배포 | — | — | v0.5는 workspace internal만, publish는 v0.5 말기/v0.6 |

**Missing dependencies with no fallback:**
- `agrune/maps` repo 생성 — 플랜은 **`registry-seed/` 로컬 디렉토리로 prototype**하고, 실제 repo 생성 및 초기 push는 **외부 push instructions** (17-04와 동일 패턴) 로 사용자에게 위임.
- OAuth App / GitHub App registration — 플랜은 `submit` 구현하되 `client_id` placeholder, 사용자가 App 등록 후 환경 변수 또는 config로 주입.

**Missing dependencies with fallback:**
- Maintainer team 부재 → solo maintainer로 시작, governance doc에 "transition to multi-maintainer when review backlog > 2주" 명시 (`.planning/STATE.md` Blocker 기록된 임계값 반영).

## Validation Architecture

> SKIP — `.planning/config.json`의 `workflow.nyquist_validation`이 `false`이므로 이 섹션 생략.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `@octokit/auth-oauth-device` — OAuth Device Flow; PAT override via env var only |
| V3 Session Management | yes | Token 저장 금지 (v0.5) — 매 `submit`마다 fresh device flow |
| V4 Access Control | yes | GitHub branch protection + PR bot labels (registry repo 측 통제) |
| V5 Input Validation | yes | `zod` + `RegistryEntrySchema` + `validateManifest` (defense-in-depth: fetch 후에도 재검증) |
| V6 Cryptography | yes | SHA-256 via Node built-in `crypto` (no hand-rolled) |
| V7 Error Handling | yes | `fetch` 실패 시 명확한 에러 메시지 + 캐시 유지 (offline graceful) |
| V8 Data Protection | yes | Cache file mode 0600, dir 0700 (Pitfall 6) |
| V9 Communication | yes | HTTPS only (raw.githubusercontent.com) — HTTP 차단 |
| V10 Malicious Code | yes | PR bot이 manifest schema 밖 데이터 (예: script 필드) 거부 |
| V12 Files and Resources | yes | 파일 시스템 접근은 `~/.agrune/maps/`와 project root `agrune.maps.lock.json`만 — path traversal 차단 |
| V13 API and Web Service | yes | Octokit rate limit / retry 내장 활용 |
| V14 Configuration | yes | `client_id` 공개 OK (OAuth App 표준), client secret 없음 (device flow 특징) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious manifest (hidden script in unknown field) | Tampering | zod strict mode + ManifestSchema.parse로 unknown 필드 거부 |
| Typosquatting host (`hacker-news.com` vs `news.ycombinator.com`) | Spoofing | Registry 측 alias 금지 + PR bot domain verification |
| Lockfile poisoning (contentHash 조작 후 registry 파일 교체) | Tampering | `add` 명령이 downloaded content로 hash **재계산** + lockfile 값과 비교 |
| Device code phishing (attacker가 피해자에게 device URL 전달) | Spoofing | GitHub 공식 도메인만 접근 (`github.com/login/device`) — OAuth Device Flow 표준 UX에 내장 |
| Supply chain (`@octokit/rest` 하위 의존성 compromise) | Tampering | pnpm lockfile 기반 reproducible build + dependabot |
| PR bot token abuse (bot이 merge 권한 남용) | Elevation of Privilege | Bot permission = labels only (`issues: write`), contents:write 없음 |
| Incident.json 조작 (공격자가 PR로 incidents.json 역 조작) | Tampering | Governance doc에 "incidents.json 변경은 maintainer만" 명시 + CODEOWNERS로 파일 gate |
| Cache dir symlink attack | Tampering | `mkdir({ recursive: true })` 대신 `lstat` check — 심볼릭 링크면 에러 |
| Rate limit abuse (CLI가 매 실행마다 registry HTTP 호출) | DoS (external) | Cache-first + `--refresh` 플래그로만 네트워크 호출 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 10 seed manifest 후보 10개 (HN, Wikipedia 등) 전부 실제 manifest 작성 가능 | Seed Manifest Selection | 대체 후보 필요 — 플랜에서 "각 후보 1 target resolve 검증"을 wave 0 task로 |
| A2 | Staleness threshold = 2주 연속 fail → stale, 4주 → auto-disable | Staleness Detection | 사용자 체감 빈도 조정 필요 시 governance doc 수정 (코드 상수만 변경) |
| A3 | Velocity limit = 첫 3 PR 30일 holddown | Governance Doc | Threshold 조정 가능 — PR bot script 상수 |
| A4 | `@agrune/registry` 신규 패키지로 분리 (vs. mcp 내 src 하위) | Arch Map | 단일 bin 확장만으로 족하면 package 분리 불필요 — plan-phase 결정 |
| A5 | Tier는 metadata 필드로 표현 (flat layout) | Repo Architecture | 커뮤니티가 디렉토리 구조를 선호하면 migration 필요 |
| A6 | Device flow client_id 등록 및 cli_id 배포는 사용자 수동 | Environment Availability | OAuth App 없으면 submit은 PAT만 작동 (환경 변수) |
| A7 | Maintainer 부재 30일 → community 강등, 60일 → disable-all 경고 | Governance Doc | 엄격도 조정 가능 — 초기는 solo maintainer라 자주 발동할 수 있음 |
| A8 | Health check는 Playwright chromium으로 snapshot only (action 미수행) | PR Bot | 실제 site에 영향 없음을 governance에 명시 |
| A9 | `agrune maps doctor`는 기본 offline (cache만 검사) + `--refresh`가 있을 때만 registry HTTP | Doctor Command | 사용자가 매번 fresh 상태를 원하면 default 변경 |
| A10 | v0.5 scope는 npm publish 전 workspace-internal 동작까지 | Environment Availability | 실제 사용자가 `npx @agrune/registry` 원하면 publish 조기화 필요 |

## Open Questions

1. **`@agrune/registry` package 분리 vs. `@agrune/mcp` 내 confinement**
   - What we know: 기존 `manifest validate`/`dev`는 `packages/mcp/src/` 안에 있음. 코드량이 작으면 동일 패턴.
   - What's unclear: `registry` 로직이 Octokit/semver/fast-json-stable-stringify를 새로 가져오므로 `@agrune/mcp` bundle size 영향.
   - Recommendation: **분리 권고** — (a) mcp는 server side 의존성이 무거운데 registry는 CLI-only라 bundle 분리 이득, (b) PR bot이 `@agrune/registry`를 npm install 가능해야 함 (mcp 전체 끌어오면 과잉).

2. **Registry lockfile이 git에 커밋되는가**
   - What we know: npm package-lock은 git 커밋 (팀 재현성). pnpm-lock도 동일.
   - What's unclear: agrune.maps.lock.json이 사용자 프로젝트의 `.gitignore` 에 들어갈지 commit 대상인지.
   - Recommendation: **git 커밋 기본** — lockfile은 재현성 계약. `.gitignore` 권고 제공 안 함. Phase 18 문서에 명시.

3. **CLI의 offline 모드 정의**
   - What we know: `doctor`는 기본 cache only, `--refresh`가 network.
   - What's unclear: `add`가 offline에서 cache 있으면 재사용할지, 항상 fetch할지.
   - Recommendation: **항상 fetch (add는 authoring action) + `--offline` 플래그로 cache 전용 명시적 opt-in**. CI 환경에서는 `--offline` + lockfile hash 검증만 사용.

4. **PR bot이 `schema-fail`을 draft PR에도 강제할지**
   - What we know: Draft PR은 리뷰 유예.
   - What's unclear: Schema 실패는 항상 block이 나아 보이지만 draft는 WIP라 relax할 수 있음.
   - Recommendation: **Draft PR에서도 schema-fail 라벨은 부착하되 branch protection은 ready-for-review 이후 적용** (GitHub 기본 동작).

5. **`agrune maps add` 시 semver range 지원 여부**
   - What we know: `latest`, `1.0.0` 정확 매칭은 필수. `^1.0.0` 같은 range는 semver lib로 가능.
   - What's unclear: 초기 v0.5에 range 지원 넣을지, 정확 매칭만 지원할지.
   - Recommendation: **정확 매칭 + `latest` 만 지원 (v0.5 MVP)**. Range는 v0.6+.

6. **Device flow client_id를 github-app vs oauth-app으로 등록**
   - What we know: oauth-app은 fork + push + PR 가능. github-app은 fine-grained permission 하지만 설정 복잡.
   - What's unclear: 어느 쪽이 authorize flow UX 단순한가.
   - Recommendation: **oauth-app 선행 (v0.5), github-app은 v0.6+ migration 검토**. Scope = `public_repo` 충분.

## Deferred for Plan-Phase Discretion

이 연구가 결론 못 낸, plan-phase가 결정할 선택사항:

1. **Plan 분해 입자성** — 플랜을 (a) CLI 명령별 4개, (b) "CLI all / repo scaffolding / PR bot / governance doc" 4개, (c) 더 세분. 권고: **(b)** — 각 wave가 독립 테스트 가능.
2. **Seed manifest 10개를 개별 task로 vs. 묶음** — 권고: **묶음 task 1개로, 각 site 1 target resolve gate**.
3. **PR bot를 단일 `pr-bot.mjs` vs. 여러 script (schema-check.mjs, sensitive-diff.mjs, velocity-check.mjs)** — 권고: **단일 script로 시작 (분기 단순)**, 길어지면 plan-phase에서 쪼갬.
4. **`registry-seed/` 디렉토리 위치** — 권고: **agrune repo root에 `registry-seed/`** (monorepo 밖 아님). 사용자가 나중에 `git subtree split` 또는 `rsync`로 외부 repo로 이동. 17-04 external-sync-instructions와 동일 패턴.
5. **CLI output styling** — 권고: **picocolors 최소 사용** (색상은 warn/error만). `doctor`의 stale 경고는 yellow, revoked는 red.

## Sources

### Primary (HIGH confidence)
- `/Users/chenjing/dev/agrune/agrune/packages/mcp/bin/agrune-mcp.ts` — CLI dispatch 패턴 [VERIFIED: read 2026-04-20]
- `/Users/chenjing/dev/agrune/agrune/packages/manifest/src/schema.ts` — manifest v3 schema (재사용 대상) [VERIFIED: read 2026-04-20]
- `/Users/chenjing/dev/agrune/agrune/packages/manifest/src/validator.ts` — zod 래퍼 패턴 [VERIFIED: read 2026-04-20]
- `/Users/chenjing/dev/agrune/agrune/.planning/STATE.md` — cross-cutting ownership (Pitfall 3/4 REGISTRY 소유분) [VERIFIED: read 2026-04-20]
- `/Users/chenjing/dev/agrune/agrune/.planning/REQUIREMENTS.md` — REGISTRY-01..06 상세 [VERIFIED: read 2026-04-20]
- npm registry — `@octokit/rest@22.0.1`, `@octokit/auth-oauth-device@8.0.3`, `fast-json-stable-stringify@2.1.0`, `semver@7.7.4`, `picocolors@1.1.1`, `@actions/core@3.0.0`, `zod@4.3.6` [VERIFIED: `npm view` 2026-04-20]

### Secondary (MEDIUM confidence)
- `@octokit/auth-oauth-device` README [CITED: https://github.com/octokit/auth-oauth-device.js]
- `fast-json-stable-stringify` determinism guarantees [CITED: https://www.npmjs.com/package/fast-json-stable-stringify]
- GitHub Actions `permissions` best practice [CITED: https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs]

### Tertiary (LOW confidence)
- Seed manifest 10개 후보 선정 — 각 site DOM 안정성과 bot detection 여부는 실제 health check 전까지 미검증 [ASSUMED: A1]

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **CDP-only 아키텍처 유지** — 본 phase는 브라우저 드라이버 건드리지 않음, 순수 CLI/registry/문서 작업이라 해당 제약에 영향 없음.
- **Inline `data-agrune-*` 재도입 금지** — Registry 스키마는 `@agrune/manifest` v3만 사용, legacy 속성 미노출.
- **`lint:no-legacy` regression guard** — Phase 18 신규 코드/문서가 `data-agrune-` literal 언급 시 allow-list 추가 명시 필요.
- **`pnpm build` 후 dist 업데이트** — `@agrune/mcp` bin이 `@agrune/registry` 동적 import하려면 build 순서 고려.
- **`response_language: Korean`** — 모든 산출물 Korean, 코드 comment는 한글/영어 혼용 가능 (기존 코드베이스 관례).
- **No emojis** (global CLAUDE.md).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 모든 라이브러리 npm view로 버전 확인 완료
- Architecture: MEDIUM-HIGH — 기존 CLI 패턴 명확, registry repo 구조는 공개된 선례 (Homebrew/nix flakes)와 일치
- Seed manifest list: LOW — 개별 사이트 안정성은 실제 검증 필요 (A1)
- Governance thresholds: LOW — 업계 public 수치 없음, STATE.md가 정량 트리거 정립 시점 기록 (A2, A3, A7)
- Pitfalls: HIGH — Pitfall 3/4는 STATE.md Cross-Cutting Ownership에 명시된 REGISTRY 소유분 그대로 반영

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30일) — 단, Octokit major bump 시 versionLog 재확인 필요

## RESEARCH COMPLETE
