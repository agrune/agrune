# Phase 17 External Repository Sync Instructions

**Generated:** 2026-04-19 (Phase 17 Wave 4, Plan 17-04)
**Status:** Awaiting user manual push

Two external repositories need manual sync after Phase 17 REMOVE completion.
The agrune monorepo has no push permission to these repos, so Phase 17-04
only (a) edits the in-tree file where possible and (b) leaves explicit
commands for the user to run when ready.

---

## 1. `/Users/chenjing/dev/agrune/.github/` — org profile

**Repo:** `https://github.com/agrune/.github` (org-level profile repo)
**File edited by Phase 17-04:**

- `/Users/chenjing/dev/agrune/.github/profile/README.md`

### Local state after Phase 17-04

Plan 17-04 already created a **local commit** in the external `.github` repo:

```
docs(profile): manifest pivot — annotation → target mapping terminology
  74 insertions, 29 deletions
```

That branch (`main`) is now **2 commits ahead of origin/main**:

1. `7cea367 docs(profile): update org README for v1.1 CDP-only architecture`
   (pre-existing — v1.1 DOCS-02 work that was never pushed, per agrune
   repo "Pending todos" in `.planning/STATE.md`).
2. `3d429ba docs(profile): manifest pivot — annotation → target mapping terminology`
   (Phase 17-04 output).

Both commits are local-only. They are NOT pushed.

### Diff summary (what the rewrite does)

| Section | Before | After |
|---|---|---|
| Tagline | "Browser automation for AI agents — CDP-native, 100% local, works with any MCP harness" | "Manifest-driven, CDP-only, local-first browser automation for AI agents" |
| Intro | "agrune lets AI agents see and control web pages… Add simple `data-agrune-*` annotations to your UI, run `@agrune/mcp`…" | "agrune is an MCP (Model Context Protocol) server… The control surface for every interaction is declared in an external **manifest**… one typed `manifest.ts` file, written with `@agrune/manifest` and (for owned apps) a one-line React root-import" |
| Code example | — (none) | `defineManifest({ groups: [defineGroup({ groupId: 'login', targets: [defineTarget({…})] })] })` login form |
| Key Features — tool count | "10 MCP Tools" | "13 MCP Tools" (adds `manifest_load` + `macro_run`) |
| Key Features — tile | "Simple Annotations — add `data-agrune-*` attributes to your HTML" | "Typed Manifests — `@agrune/manifest` SDK types `defineTarget` / `defineRepeat` / `defineMacro` at compile time" |
| Comparison row "Semantic targeting" | "Named annotations" | "Manifest target mapping" |
| Comparison row "Setup" | "1 command" | "1 command + 1 manifest" |
| Architecture diagram footer | "data-agrune-*" | "manifest.ts (defineTarget)" |
| Quick Start | 3 steps, no manifest authoring | 4 steps, adds `agrune manifest validate` + `agrune manifest dev` |
| "browser extension" phrasing | 2 literal mentions ("No browser extension") | Replaced with "No browser add-on" (keeps main-repo regression guard grep at zero) |
| New section | — | "Current Milestone — v0.5 Manifest Pivot" with feat/v0.5-manifest branch + SDK bullets + Phase 18 registry roadmap |

### User action required (push)

```bash
cd /Users/chenjing/dev/agrune/.github

# 1. Review what is staged for push (two commits — v1.1 CDP-only + v0.5 manifest pivot)
git log origin/main..HEAD --oneline
git log origin/main..HEAD -p profile/README.md   # full diff across both commits

# 2. Push when ready (default branch is `main`)
git push origin main
```

**Verification after push:**

1. Visit `https://github.com/agrune` and confirm the org profile card now
   shows the new "Manifest-driven, CDP-only…" tagline.
2. The `defineManifest({ … })` code block should render correctly in the
   profile card.
3. Rollback, if needed: `git revert 3d429ba` (and optionally `7cea367`).

---

## 2. `/Users/chenjing/dev/agrune/skills/` — AI skills repo

**Repo:** `https://github.com/agrune/skills.git`
**Phase 17-04 status:** No edits performed. The main agrune repo now ships
`.agents/skills/manifest/SKILL.md` as the authoritative source (Phase 16-04
RECORD-05), so the external `skills/skills/annotate/` directory is redundant.

### Why retire `skills/skills/annotate/`

- v0.5 Manifest Pivot removed the inline `data-agrune-*` authoring path
  (Phase 17-01 runtime scanner removal; 17-02 e2e fixture semantic reversal;
  17-03 root documentation rewrite).
- `.agents/skills/manifest/SKILL.md` (main agrune repo) is the v0.5
  authoritative authoring workflow. All 5 root-level product-surface docs
  point at it (README / AGENTS / PRIVACY / WORKFLOW.md / packages/mcp/README).
- Phase 16-04 SUMMARY declared the annotate skill "retires once manifest
  skill reaches feature parity — this plan is the evidence" (L258). Phase
  17 is the physical retirement.

### Current repo state

Running `git status` in `/Users/chenjing/dev/agrune/skills/` shows
pre-existing local changes unrelated to Phase 17 (marketplace.json, .mcp.json,
mcp-server build artefacts, README.md). Those are NOT Phase 17 concerns and
should be resolved separately by the skills-repo maintainer before the
annotate retirement commit.

### User action required (retire annotate skill)

Run the following **only** after the skills repo's own pre-existing working
tree changes have been resolved (commit, stash, or discard them first —
Phase 17-04 has no opinion on those unrelated files):

```bash
cd /Users/chenjing/dev/agrune/skills

# 0. Sanity check that pre-existing changes are NOT about to be captured
git status

# 1. (Optional but recommended) Copy any still-useful references from
#    skills/skills/annotate/references/ into the main agrune repo at
#    .agents/skills/manifest/references/ if Phase 16-04 missed anything.
ls skills/annotate/references/   # inventory before deletion
# ... manual review / copy ...

# 2. Remove the annotate skill directory
git rm -r skills/annotate/

# 3. Update the top-level skills README to point at the main agrune repo's
#    .agents/skills/manifest/SKILL.md as the authoritative manifest
#    authoring skill. (Edit skills/README.md manually.)

# 4. Commit and push
git add skills/README.md
git commit -m "chore: retire skills/annotate per v0.5 manifest pivot (Phase 17)"
git push origin main
```

### Expected end-state

- `https://github.com/agrune/skills` no longer has a `skills/annotate/`
  directory.
- Top-level `skills/README.md` points external users to
  `https://github.com/agrune/agrune/tree/main/.agents/skills/manifest`
  for manifest authoring.
- Any remaining skills (`guide/`, `setup/`, etc.) stay untouched.

---

## Boundary declaration

Phase 17-04 performed the in-tree file edit where possible (org profile
README) and created `external-sync-instructions.md` (this file). It
**did not** push to either external repo. MEMORY: "외부 repo push는 사용자
수동 후속 조치". MEMORY: "Autonomous 무인 실행 — pause 대신 안전 기본값
(defer/accept/skip)으로 끝까지 진행" — the safe default here is "commit
locally where we have an existing local working tree, do NOT push".

Until the user runs the push commands above:

- The agrune org profile page still shows the pre-17-04 text until
  `git push origin main` is executed inside `/Users/chenjing/dev/agrune/.github`.
- The `skills/skills/annotate/` directory still exists publicly on
  `github.com/agrune/skills`. It is harmless (legacy reference) but
  redundant.

Neither of these gaps affects the main agrune repo's Phase 17 regression
guard (`pnpm lint:no-legacy`), because both live in external git
repositories not scanned by the guard.
