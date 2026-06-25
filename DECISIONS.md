# agrune — Build Decisions

Records the pre-flight decisions (BUILD-PLAN "Pre-flight decisions" + goal defaults) and
any design choices made during the rebuild. SPEC.md remains the source of truth; this file
only records the resolutions of its Open Questions (§11) where the goal/BUILD-PLAN required
a decision up front.

## Transport (resolves §11 #27)
**HTTP/1.1 over a Unix domain socket** (`node:http` server + `http.request` client), per
**Appendix A.1**, which is marked *NORMATIVE — SUPERSEDING*. Where BUILD-PLAN M1 mentions a
"length-prefixed JSON framer", A.1 governs: there is no custom framing. TCP fallback via
`--host`/`--port`. This is both the normative choice and the simpler one (no framer to write,
help text + route table already assume HTTP).

## Pre-flight defaults (from the goal prompt)

| # (SPEC §11) | Decision | Rationale |
|---|---|---|
| 29 | **Chromium-only for v1.** `import { chromium } from 'playwright'`; no `--browser` matrix. | Matches today's surface; avoids launch-matrix branching. Revisit if parity demands it. |
| 28 | **`repeats` kept in the resolver core, behind a flag** (`AGRUNE_REPEATS`, default ON). | Golden vector A.7 exercises a 2-row repeat, so resolver+serializer must support it; flag lets us disable cheaply if perf demands. |
| 31 | **`run-code-unsafe` gated behind an opt-in flag, OFF by default** (`AGRUNE_ALLOW_RUN_CODE=1`). | Only verb bypassing the manifest contract; off-by-default is the safe posture. Still implemented for parity. |
| 22 | **agrune primary command names + playwright-cli aliases.** Accept BOTH `-s=<id>` and `--session <id>`. | A.0.2 mandates both session forms. Primaries stay agrune-idiomatic; renames are aliases (go-back→back, tab-list→tabs list, dialog-accept→dialog accept). |
| 20 | **`state-load`/`delete-data`: per-tab storage scoping**; recreate the `BrowserContext` only if unavoidable (and document it). | Avoids losing open tabs / `page.on` listeners on the single long-lived context. cookie/storage ops use `context.*` / `page.evaluate` in place. |
| 26 | **`attach` supported but OFF the default path**, with a documented trust caveat. | `chromium.connectOverCDP` drives the user's real Chrome (their cookies/session); kept available for parity but never auto-engaged, and the manifest security posture is documented as not applying to an attached browser. |

## Other resolutions adopted from SPEC Appendix A.0
- **A.0.1** `read` returns plain `innerText()` (NOT markdown).
- **A.0.3** `generate-locator`, `highlight`, `detach`, global `--raw`, `video-chapter`, `[button]` on mousedown/mouseup ARE parity targets.
- **A.0.4** self-heal decoupled: core resolver returns `TARGET_NOT_FOUND` with **no `repair` field** when the plugin is absent.
- **A.0.5** sensitive-word set stays in CORE (security fail-safe), always on.

## Visual plugin packaging (resolves §11 #32)
Separate optional package **`agrune-visual`**, default OFF, never on the action critical path.
`ai-motion`/WebGL2 stay out of the core dependency tree.
