# agrune — Benchmark status & results

Per BUILD-PLAN's Evaluation/regression loop. This file records **exactly what was and was not
measured** in this environment (IF-BLOCKED honesty rule: never silently skip, never invent
numbers).

## Recorded baseline (the target to match/beat)

From the prior heavy implementation (gpt-5.5, PM demo app `../demo`, 6 scenarios S1–S6,
viewport 1280×1200):

| condition | completion | tokens | rounds | wander |
|---|---:|---:|---:|---:|
| agrune (manifest + desc) | **94%** (17/18) | 12,796 | 7.2 | **0.06** |
| agrune (manifest, no desc) | 83% (15/18) | 10,857 | 6.8 | 0.22 |
| playwright-cli (a11y) | 67% (12/18) | 20,001 | 8.8 | 0.39 |

Token micro-bench reference: 정부24 outline **227** tok vs raw a11y **8,310**.

## What WAS measured (this rebuild, this environment)

### 1. Token micro-bench — model-free (M3 EVAL gate) ✅
`pnpm/npm run bench:token` (`bench/token-bench.ts`), cl100k_base, synthetic 정부24-class portal
(everything rendered at once):

| view | tokens | vs raw a11y |
|---|---:|---:|
| raw a11y (full) | 3,579 | — |
| agrune outline (groups + counts) | **172** | **95.2%** |
| outline + expand one group | 473 | 86.8% |

Same reduction *ratio* as the recorded baseline (outline 227 vs raw 8,310 = 97.3%); the
synthetic portal is smaller so absolute raw tokens differ. **Gate: PASS** (outline ≪ raw a11y).

### 2. Live-model grounding eval — REAL demo, local model (M4 EVAL, best-effort) ✅
`npx tsx bench/grounding-eval.ts`, model **gpt-oss:20b via ollama**, the REAL PM demo (`../demo`),
8 single-shot grounding tasks:

| condition | grounding accuracy | context tokens |
|---|---:|---:|
| agrune manifest (outline + full targets) | **8/8 (100%)** | 3,495 |
| raw a11y (visible controls only) | 5/5 (100%) of the 5 **visible** tasks | 761 |
| agrune outline only | — | 384 |

- The small local model grounds the manifest **perfectly (8/8)**, *including 3 affordances that
  are hidden behind tabs and therefore absent from the a11y tree* (member search / next-page /
  role-filter). An a11y-driven agent cannot ground those from the current screen — it must
  navigate to discover them (extra rounds / wander).
- On this **tabbed SPA**, the initial a11y tree is small (761 tok) because most UI is hidden, so
  the manifest's value here is **completeness + stable reach**, not raw token reduction. (The raw
  token-dump reduction shows up on dense, fully-rendered pages — see #1.) The outline alone (384
  tok) is still smaller than even the small initial a11y tree.

### 3. Real-browser action smoke (M4) ✅
`test/m4-actions.integration.test.ts` + manual CLI smoke: fill (insert + auto-keystroke for
password), select, click, read=innerText, console/network recorders, the **dialog interruption
model** (click→confirm returned without hanging→handle-dialog→parked action completes),
FLOW_BLOCKED pending-dialog gate, run-code-unsafe gating, evaluate, wait validation — all pass on
real chromium.

## What was NOT measured (flagged) ⚠️

**The recorded gpt-5.5 multi-round completion/wander baseline is NOT reproducible in this
environment.** The recorded numbers (94% completion, 12,796 tok, 7.2 rounds, 0.06 wander) were
produced with **gpt-5.5**, a cloud model. No cloud API keys are present; only local ollama models
(gpt-oss:20b, qwen3, gemma3) are available. A local-model multi-round run would be a **different
experiment** whose absolute completion/rounds/wander cannot be compared to the gpt-5.5 baseline
(the model is the dominant variable). Running it and comparing to the recorded table would be
misleading, so it is intentionally NOT claimed.

`@playwright/cli` (0.1.14) and the Codex pwcli wrapper ARE available, so a same-model
agrune-vs-playwright-cli multi-round head-to-head is *possible* but was deferred for the same
reason (it would validate relative behavior on gpt-oss:20b, not the recorded gpt-5.5 baseline) and
because of small-model agentic fragility/runtime cost.

## Regression assessment (the NORMATIVE rule)

- **vs the recorded baseline:** not reproducible (different model) → flagged above, treated as
  not-a-signal rather than a pass or fail.
- **vs a11y on the SAME local model + SAME real demo:** agrune is **not worse** — it grounds 8/8
  (incl. 3 affordances a11y cannot surface) vs a11y's 5/5 visible-only, and its outline is
  cheaper than the a11y tree. **No regression → proceed.**
- **Token serializer:** byte-for-byte equal to the A.7 golden vector (conformance test green), so
  no serializer token bloat.
