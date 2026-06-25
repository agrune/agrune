# agrune — Build Plan (goal-runnable checklist)

This is an **execution index over [`SPEC.md`](./SPEC.md)** — not a replacement for it.
`SPEC.md` stays the source of truth; each milestone below cites the sections it
implements and the **verifiable acceptance gate** to check against. Run **one goal
per milestone, in order**. Each goal must reference the cited SPEC sections for the
verbatim contracts (formats, types, error codes) — do not re-encode them here.

## How to run

Give **one autonomous goal** that self-drives M0 → M7 (a goal runs to completion — you
are not stepping it by hand). It uses this file as its roadmap:

> "Implement agrune per `SPEC.md`, following `BUILD-PLAN.md` M0 → M7 in order. For each
> milestone: read the cited SPEC sections, implement, then **actually run it for real**
> and pass the milestone's Acceptance gate before continuing. At the **evaluation
> checkpoints**, benchmark against playwright-cli and the recorded baseline (see the
> Evaluation section); if numbers regress, **STOP and diagnose the root cause before
> proceeding** — never build on a regressed foundation."

- The checklist gives the goal verifiable checkpoints so it doesn't skim the 155KB spec.
- Optional human checkpoints: split into two autonomous runs — **M0–M3** (the correctness
  core + token eval) then **M4–M7** — and inspect between them.
- If a gate fails, re-run that milestone only.

## Global invariants (every milestone must hold)

- **Public-API only.** Never import from `playwright-core/lib/**` or `playwright/lib/**`.
  Use only the published `playwright` API (SPEC §2.4). Add/keep the `verify:no-internals`
  grep gate; it must stay green.
- **Single package**, TypeScript strict, `tsup` two-entry build (SPEC §2.2).
- **Manifest is the only differentiator**; everything else is a thin wrapper over Playwright
  public API or an opt-in plugin (SPEC §1, §10.1).
- **Sensitive masking is always-on core** (SPEC A.0.5); the core resolver works with the
  self-heal plugin **absent** (SPEC A.0.4).

## Evaluation, benchmarking & regression loop (run at checkpoints, NOT just at the end)

The whole point of agrune is **better numbers than playwright-cli on the same task**,
via the manifest. So the build is measured as it goes, against two baselines, and a
regression **halts progress** until diagnosed.

### Two comparison baselines
1. **playwright-cli** (live competitor) — same scenarios, a11y / `eN` refs.
2. **Recorded prior agrune** (the deleted heavy impl) — the numbers the lean rebuild
   must **match or beat**. Recorded run (gpt-5.5, PM demo app, 6 scenarios S1–S6,
   viewport 1280×1200):

   | condition | completion | tokens | rounds | wander |
   |---|---:|---:|---:|---:|
   | agrune (manifest + desc) | **94%** (17/18) | 12,796 | 7.2 | **0.06** |
   | agrune (manifest, no desc) | 83% (15/18) | 10,857 | 6.8 | 0.22 |
   | playwright-cli (a11y) | 67% (12/18) | 20,001 | 8.8 | 0.39 |

   Per-scenario token advantage pwcli/agrune-desc ≈ 1.3×–2.4×. Token micro-bench
   reference (SPEC §1): 정부24 outline **227** tok vs raw a11y **8,310**. These are the
   regression targets — scoring materially below them means the port lost something.

### Metrics
- **Token cost** (cl100k_base, through the real agent-facing serializer) — the §4 outline
  win. Primary check after **M3**.
- **Completion %**, **rounds**, **wander** (off-path actions) on the multistep scenarios —
  after **M4** (actions) and again after **M6** (plugins on/off, desc/no-desc).
- **Latency** per command (daemon round-trip).

### Harness
Re-port the prior multistep bench (deleted; recoverable from git history — old
`packages/bench/src/accuracy/*` + the sibling `../demo` PM app + a model runner) as a
**dev-only** harness comparing agrune-lean vs playwright-cli vs the recorded baseline on
the same scenarios. The **token-only micro-bench** (raw a11y vs manifest outline) needs no
model and gates **M3**; the full completion/wander bench needs a live model + the demo app.

### Regression rule (NORMATIVE for the goal)
At each checkpoint, if agrune-lean is **worse than the recorded baseline** OR **fails to
beat playwright-cli** on the target metric:
1. **STOP** — do not advance to the next milestone.
2. **Diagnose** the cause: serializer (token bloat → diff outline vs the **A.7 golden**),
   resolver (wrong / re-drifting targets → wander/incompletion), a lost feedback signal
   (M6), or a harness mismatch (different scenarios/model/viewport).
3. **Fix, re-measure**, and only then continue.

---

## Pre-flight decisions (resolve before the noted milestone — they change the design)

These are blocking Open Questions from SPEC §11. Decide them up front:

| # (SPEC §11) | Decision | Gates |
|---|---|---|
| 28 | `repeats` (`repeatId[key=k].base`) — keep in resolver core, behind a flag, or drop? Needs a count of real manifests using them. | **M2** |
| 29 | Chromium-only (matches today's `import { chromium }`) or keep `--browser firefox/webkit/msedge`? | **M1** |
| 31 | `run-code-unsafe` / raw `page.evaluate(fn)` in core, or gate behind a flag/plugin? (only verb bypassing the manifest) | **M4** |
| 22 | Byte-identical playwright-cli primaries (`go-back`, `tab-list`, `dialog-accept`) or agrune primaries + aliases? | **M4/M5** |
| 20 | `state-load`/`delete-data` context lifecycle: recreate `BrowserContext` (lose tabs/listeners) vs per-tab storage scoping? | **M5** |
| 26 | `attach` to the user's real Chrome (their cookies/session) — supported workflow given the security-scoped posture? | **M5** |

Already resolved in SPEC Appendix A: `read`=plain text (A.0.1), session flag `-s=`/`--session` both (A.0.2), parity set incl. generate-locator/highlight/detach/--raw (A.0.3), self-heal decoupled (A.0.4), sensitive set in core (A.0.5).

---

## M0 — Skeleton & guardrails
- **Goal prompt:** *"Scaffold the single-package agrune project per SPEC §2.2 and §10.3-M0: `package.json` (name `agrune`, bin `agrune`, dep `playwright ^1.59`), `tsup` two-entry build, `bin/agrune.ts` shim, `program.ts` empty dispatch + `helpText()`/`--help`, `errors.ts` with the code→exit-code map. Add the `verify:no-internals` lint/CI gate (no `playwright-core/lib` imports)."*
- **Implements:** SPEC §2.2, §2.4, §10.3-M0, A.4 (error/exit), A.5 (helpText verbatim).
- **Deliverables:** `package.json`, `tsconfig.json`, `tsup.config.ts`, `bin/agrune.ts`, `src/program.ts`, `src/errors.ts`, `SKILL.md` placeholder.
- **Acceptance:** `agrune --help` prints the **verbatim** A.5 help text, exit 0; `agrune --version` plumbed; `errors.ts` map equals **A.4** exactly; `verify:no-internals` passes.
- **Depends on:** —

## M1 — Daemon + session transport
- **Goal prompt:** *"Implement the per-workspace daemon and one-shot client per SPEC §7 and Appendix A.1: `registry.ts` (workspace hash, run dir, `daemon.json`, GC), `session.ts` (connect socket, `run`/`stop`/`canConnect`), `daemon.ts` (`http`-over-unix-socket server per A.1, spawn ONE chromium context/page, auto-spawn detached + spawn-lock + version-skew restart + health). Wire `agrune open/close/list` and `agrune daemon start/stop/status`."*
- **Implements:** SPEC §2.3 (core loop), §7, A.1 (wire protocol verbatim), A.2 (lifecycle commands).
- **Acceptance:** `agrune open <url>` launches exactly **one** chromium (pid check) via the daemon and persists it across commands; `daemon status`/`list`/`close` work; request/response envelopes match **A.1.3–A.1.6**; default socket path + override precedence per **A.1.2**.
- **Decide first:** §11 #29 (chromium-only vs multi-browser).
- **Depends on:** M0.

## M2 — Manifest contract & resolver
- **Goal prompt:** *"Implement `manifest.ts` (v3-lite zod schema + `validateManifest`: Zod pass + forbidden-selector guards `assertNoHashClass`/`assertNoNthChild` + OR-only `sensitive` lock + keyFrom compile gate) and `resolver.ts` (`loadManifestFromPage` from `window.__agrune_manifest__`, `routeApplies`, `buildLocatorCandidates`, `resolveLocator`/`resolveLocatorMulti`, repeat-ref grammar `toAgentTargetRef`/`normalizeAgentTargetId`, raw-CSS a11y fallback) per SPEC §3, §5.1, §10.3-M2. Sensitive masking always-on. Core resolver must work with self-heal absent."*
- **Implements:** SPEC §3, §5.1, §10.2, A.0.4, A.0.5, A.3.
- **Acceptance:** the **golden manifest (A.7)** loads + validates; every target in it resolves to a Locator via the ladder (role→text→testId→attr→css, first non-empty `count()` wins, `.first()`); forbidden selectors rejected; no-rung-match returns `TARGET_NOT_FOUND` with **no `repair` field** (A.0.4); `password_input` surfaces as `reason: sensitive`, no value emitted.
- **Decide first:** §11 #28 (repeats core/flag/drop).
- **Depends on:** M1.

## M3 — Snapshot & outline serializer
- **Goal prompt:** *"Implement `snapshot.ts` per SPEC §4 and Appendix A.7: `buildSnapshotFromManifest`, `SnapshotStore` (signature/version gate), `filterSnapshot`/`resolveTargetFilter`, and `formatSnapshot` reproducing the **verbatim** outline + full grammar. No-manifest path = pass-through to Playwright public `locator.ariaSnapshot()`. Wire `agrune targets` and `agrune snapshot`/`aria-snapshot`."*
- **Implements:** SPEC §4, §10.3-M3, A.7 (golden conformance vector).
- **Acceptance:** `formatSnapshot` output for the A.7 golden `PageSnapshot` is **byte-for-byte equal** to the A.7 expected outline AND full blocks (this is the conformance test); a11y fallback returns `ariaSnapshot()` output unchanged.
- **EVAL gate (token):** run the **token micro-bench** (raw a11y vs manifest outline). agrune outline must show the big reduction (ballpark of the §1 / recorded baseline; e.g. ~227 vs ~8,310 on 정부24-class pages). If bloated, diff against the A.7 golden and fix **before M4**.
- **Depends on:** M2.

## M4 — Core actions (playwright-cli parity, HAVE set)
- **Goal prompt:** *"Implement `commands.ts` as the declarative verb→Playwright-public-API table per SPEC §5.3, §6, A.2: click/dblclick/right-click/hover/fill/type/press/select/upload/drop/drag/wait + navigate/back/forward/reload/resize/screenshot/evaluate/read/console/network/dialogs/tabs. Include the dialog & file-chooser interruption model (`runActionWithInterruptions`) and console/network recorders via `page.on(...)`."*
- **Implements:** SPEC §5.3 (action→API mapping table), §6 (command surface), A.2 (command table), A.3 (FillFormField/pointer/drop types).
- **Acceptance:** every HAVE-set verb maps to the public-API call in the §5.3 table (no `playwright-core/lib`); dialog/file-chooser interruption returns per spec; `read` returns plain `innerText()` (A.0.1); each verb's args/output match A.2.
- **EVAL gate (completion/wander):** run the **multistep bench** (live model) — agrune-lean vs **playwright-cli** vs the **recorded baseline** on scenarios S1–S6. agrune-lean must **match or beat** the baseline completion/tokens/rounds/wander table. If worse, apply the **Regression rule** (diagnose serializer vs resolver vs harness) **before M5**.
- **Decide first:** §11 #31 (run-code-unsafe gating), #22 (primary names vs aliases).
- **Depends on:** M3.

## M5 — Parity MISSING set
- **Goal prompt:** *"Add the remaining @playwright/cli parity commands per SPEC §6 / A.6: check/uncheck, keydown/keyup, mousemove/down/up/wheel, pdf, highlight, generate-locator, attach/detach/delete-data, state-save/load, cookie-*, localstorage-*/sessionstorage-*, route/route-list/unroute, network-state-set, tracing-*, video-*, show, pause-at/resume/step-over, install/install-browser, list/close-all/kill-all, global `--raw`. Add rename aliases (go-back, dialog-accept/dismiss, tab-list/new/close/select; session `-s=`)."*
- **Implements:** SPEC §6, A.6 (parity set), §10.3-M5.
- **Acceptance:** the **parity table (A.6/§6)** is fully covered — every real playwright-cli command has an agrune equivalent; `--raw` emits the bare value (decide exact shape, §11 #25).
- **Decide first:** §11 #20 (context lifecycle for state-load), #26 (attach posture).
- **Depends on:** M4.

## M6 — Optional plugins
- **Goal prompt:** *"Implement the opt-in plugins per SPEC §8 and §10.3-M6, each gated and decoupled from core: `feedback` (changed bit + onSuccess/onNoEffect + screen-delta + required-nudge), `self-heal` (env-gated; core already works without it per A.0.4), `unmapped` (gated), `settle` (off by default). Visual cursor/aurora ships as a SEPARATE package `agrune-visual`, default off."*
- **Implements:** SPEC §8, §10.3-M6, A.0.4.
- **Acceptance:** core runs unchanged with all plugins absent; enabling a plugin adds only its documented signals; `agrune-visual` is a separate, optional dependency.
- **Depends on:** M4 (plugins decorate the action path).

## M7 — Distribution & SKILL
- **Goal prompt:** *"Finish distribution per SPEC §9 and §10.3-M7: `agrune install` (`npx playwright install`) + missing-browser/version-skew hint, bundled agent `SKILL.md` (+ `agrune install --skills` writing to the workspace agent dir), semver injection + `--version`, confirm `files`/bin for the published `agrune` binary, LICENSE (already present). Land the **full eval harness** (agrune-lean vs playwright-cli vs recorded baseline) as a dev-only CI regression guard, plus the A.7 golden-outline conformance test."*
- **Implements:** SPEC §9, §10.3-M7, Evaluation section.
- **Acceptance:** fresh machine with no browser gets an actionable hint; `npx agrune --help`/`--version` work from the packed tarball; `SKILL.md` ships in `files`; the **golden-outline conformance test** + the **token micro-bench** run in CI as regression guards; the full multistep bench is reproducible dev-only and its latest numbers are recorded (and beat the baseline).
- **Decide first:** §11 #30 (SKILL.md target dir convention).
- **Depends on:** M5 (and M6 if shipping plugins in v1).
