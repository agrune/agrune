# Codebase Structure

**Analysis Date:** 2026-04-07

## Directory Layout

```text
agrune-workspace/
├── .github/profile/        # GitHub organization profile assets
├── agrune/                 # 핵심 제품 모노레포
│   ├── packages/           # core/runtime/browser/mcp/devtools/extension
│   ├── docs/               # 스펙, 계획, 운영 노트
│   ├── workflows/          # harness-neutral annotate workflow
│   ├── apps/               # 보조 앱/실험 영역
│   └── .codemap/           # 생성된 코드맵 산출물
├── demo/                   # annotated React fixture 앱
├── skills/                 # Claude plugin / skill 래퍼 저장소
└── .planning/codebase/     # 이번 GSD codebase map 산출물
```

## Directory Purposes

**`agrune/`:**
- Purpose: 제품 본체 개발
- Contains: monorepo 패키지, 문서, 워크플로, 릴리스 설정
- Key files: `README.md`, `package.json`, `pnpm-workspace.yaml`, `AGENTS.md`
- Subdirectories: `packages/`, `docs/`, `workflows/`, `apps/`

**`agrune/packages/`:**
- Purpose: 런타임/브라우저/MCP/확장 계층별 코드 분리
- Contains: package manifests, source, tests, bundler config
- Key packages:
  - `core/`
  - `runtime/`
  - `browser/`
  - `mcp/`
  - `devtools/`
  - `extension/`

**`agrune/docs/`:**
- Purpose: 설계와 의사결정 기록
- Contains: `superpowers/specs`, `superpowers/plans`, `notes`, 운영 메모
- Key files: `improvement-notes.md`, `agent-setup.md`

**`demo/`:**
- Purpose: annotated fixture 및 수동 검증용 웹앱
- Contains: React app source, static docs, build output
- Key files: `src/App.tsx`, `vite.config.ts`, `README.md`

**`skills/`:**
- Purpose: agrune 관련 plugin/skill 배포 레이어
- Contains: `skills/annotate`, `skills/setup`, `skills/guide`, plugin metadata
- Key files: `README.md`, `skills/skills/annotate/SKILL.md`

**`.github/profile/`:**
- Purpose: GitHub org profile README 관리
- Contains: marketing README 한 개 중심

## Key File Locations

**Entry Points:**
- `agrune/packages/mcp/bin/agrune-mcp.ts` - CLI / daemon entry
- `agrune/packages/extension/src/background/service-worker.ts` - extension background entry
- `agrune/packages/extension/src/content/index.ts` - content script entry
- `agrune/packages/runtime/src/page-runtime.ts` - injected runtime export entry
- `demo/src/main.tsx` - demo app entry

**Configuration:**
- `agrune/tsconfig.base.json` - workspace TS alias
- `agrune/pnpm-workspace.yaml` - package workspace 범위
- `agrune/packages/extension/vite.config.ts` - extension bundle orchestration
- `demo/vite.config.ts` - demo build + annotation lint
- `agrune/.github/workflows/release.yml` - release automation

**Core Logic:**
- `agrune/packages/core/src/` - contracts/types
- `agrune/packages/runtime/src/runtime/` - snapshot and command execution
- `agrune/packages/browser/src/` - driver/transport/session management
- `agrune/packages/mcp/src/` - tool surface and public shapes

**Testing:**
- `agrune/packages/*/tests/**/*.spec.ts` - package별 Vitest suites
- `agrune/packages/extension/tests/background/` - background router/native host mocking

**Documentation:**
- `CLAUDE.md` - project memory / decision log
- `agrune/docs/superpowers/specs/` - detailed design specs
- `agrune/workflows/annotate/WORKFLOW.md` - annotation source of truth

## Naming Conventions

**Files:**
- core product modules: kebab-case `.ts`
- React components: PascalCase `.tsx`
- tests: `*.spec.ts`
- skill definitions: `SKILL.md`
- date-stamped specs/plans: `YYYY-MM-DD-topic-name.md`

**Directories:**
- package names: lower-case singular (`core`, `runtime`, `browser`, `mcp`)
- feature dirs in demo: `components/features`, `components/ui`, `hooks`, `lib`

**Special Patterns:**
- `index.ts` barrels for package exports
- `bin/` for executable entrypoints
- `.codemap/`, `.planning/`, `dist/` are generated or derived artifacts

## Where to Add New Code

**New product capability inside agrune:**
- Contracts: `agrune/packages/core/src/`
- Page-executed logic: `agrune/packages/runtime/src/runtime/`
- Transport/driver code: `agrune/packages/browser/src/`
- MCP tool exposure: `agrune/packages/mcp/src/`
- Extension shell/UI: `agrune/packages/extension/src/` or `agrune/packages/devtools/src/`

**New demo scenario or fixture:**
- Feature UI: `demo/src/components/features/`
- Shared UI primitive: `demo/src/components/ui/`
- Sample data/types: `demo/src/seed-data.ts`, `demo/src/types.ts`

**New skill or onboarding adapter:**
- `skills/skills/<name>/SKILL.md`
- plugin-facing docs: `skills/README.md`

## Special Directories

**`agrune/.codemap/`:**
- Purpose: generated code mapping artifacts
- Source: external codemap generation
- Committed: yes

**`demo/dist/`:**
- Purpose: built static app output
- Source: `pnpm build`
- Committed: yes in current workspace state

**Nested `.git/` directories:**
- `agrune/`, `demo/`, `skills/`, `.github/` 모두 개별 Git repo
- Tooling이나 automation이 workspace 전체를 단일 repo로 가정하면 주의 필요

---

*Structure analysis: 2026-04-07*
*Update when directories, repo boundaries, or package layout changes*
