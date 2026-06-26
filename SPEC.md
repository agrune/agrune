# agrune — Implementation Specification

> **Status:** Canonical source of truth. This document REPLACES the entire current ~10,611 LOC implementation. After it is approved the code is deleted and agrune is rebuilt lean from this document alone. It must therefore be complete and implementation-grade. Verbatim formats, field names, algorithms, thresholds, and error codes below are normative.

---

## 1. Overview & Positioning

### 1.1 Thesis

`agrune = Playwright (public API) + manifest resolver + thin CLI wrapper + minimal session daemon.`

agrune is the **manifest-driven peer of `@playwright/cli`**. The north-star, README-confirmed:

> *agrune : `@playwright/cli` :: manifest-driven : a11y-driven. Same Playwright engine, same terminal command surface.*

The **only intended divergence** is the perception/targeting layer:

| | `@playwright/cli` | agrune |
|---|---|---|
| Targeting | ephemeral a11y refs (`eN`) from `ariaSnapshot()` | stable, app-authored manifest `targetId`s + selector ladder |
| Snapshot | raw accessibility tree | manifest-derived outline (only author-declared targets), a11y tree as fallback |
| Engine | Playwright | Playwright (identical) |
| Command surface | terminal verbs | identical terminal verbs (+ a small set of agrune extras) |

agrune **may add extras** beyond playwright-cli (e.g. `targets` outline, `read`, `fill-form`, self-heal), but everything that is not (a) the manifest contract or (b) glue between a CLI verb and a Playwright public-API call is treated as gold-plating (optional plugin) or reinvention (deleted, replaced by the public API).

### 1.2 The differentiator in one sentence

Playwright has locators but no **stable, app-owned, agent-addressable element registry**. The manifest IS that registry: a page-authored, validated, drift-resistant control surface keyed by stable `targetId`, projected onto live DOM through a deterministic selector ladder that maps 1:1 onto Playwright public locators. This is the product.

### 1.3 Token economics

agrune does NOT dump a raw accessibility tree to the agent every turn. It serves a manifest-derived outline (groups + counts) by default — very cheap — and expands to per-target detail only when the agent filters to a group/target. This outline-first progressive disclosure is what the token benchmark measures, and the exact serialized line grammar (§4) is therefore normative.

---

## 2. Lean Architecture

### 2.1 Reference architecture it copies (playwright-cli)

The `@playwright/cli` client (`playwright-core/lib/tools/cli-client/`) is intentionally thin (~949 LOC):

| File | LOC | Role |
|---|---|---|
| `program.js` | 350 | top-level command switch (`open`/`close`/`list`/`attach`/`install`/default→run); spawns daemon, prints result text |
| `session.js` | 289 | `Session` — connects to daemon unix socket, `run(args)`/`stop()`/`canConnect()`; `SocketConnectionClient` = JSON-RPC over socket |
| `registry.js` | 176 | workspace discovery, `<cacheDir>/ms-playwright/daemon/<hash>` session-file store, `createClientInfo()` |
| cli-daemon `program.js` + `daemon.js` | ~290 | daemon: `net.createServer` on a socket, on `run` → `parseCliCommand(args) → backend.callTool(name, params)`, returns `{isError,text}` |
| `command.js` | 73 | `parseCommand` — zod-validates flags+positionals → `{toolName, toolParams}` |

agrune's twist: the "tool engine" is **the public Playwright API plus a manifest resolver**, NOT a vendored engine. agrune does not need a `commands.js`/`backend/tools.js` analogue at playwright-cli scale — its command table maps a verb straight onto `page.*` / `locator.*`.

### 2.2 Module / package layout

**Single package, no workspace.** Drop the 6-package pnpm monorepo (`core`/`manifest`/`runtime`/`backend`/`cli`/`bench` + `e2e`). One publishable package `agrune`.

```
agrune/
  package.json          # name "agrune", bin { agrune }, dep: playwright ^1.59
  tsconfig.json
  tsup.config.ts        # one config, two entries: bin + lib
  bin/
    agrune.ts           # #!/usr/bin/env node shim → import('../src/program.js').then(p=>p.main())
  src/
    program.ts          # ~180  command table + dispatch (cli-client/program.js analogue)
    commands.ts         # ~220  verb registry: name → {flags schema, args schema, handler}
    session.ts          # ~140  client Session: connect socket, run(args)/stop()/canConnect()
    registry.ts         # ~110  workspace hash, daemon dir, session-file read/write, GC
    daemon.ts           # ~240  net server: spawn browser once, on "run" → dispatch → format
    resolver.ts         # ~150  manifest load + targetId → Playwright Locator (the differentiator)
    manifest.ts         # ~150  zod schema (v3 lite) + validate() + selector ladder type
    snapshot.ts         # ~200  manifest-driven outline serializer + a11y fallback
    format.ts           # ~90   CommandResult → text/JSON; error codes → exit codes
    errors.ts           # ~40   CliError {code,message}; code→exit-code map
    skill/
      SKILL.md          # bundled agent skill (shipped in `files`)
  README.md
```

Total source ≈ **1,470–1,525 LOC** (§10). No `dist/bin/visual-runtime.global.js` copy step, no inter-package `pretest` builds.

### 2.3 The core loop

One pass, identical shape for every verb. The client is a dumb pipe; all browser work happens in the daemon.

```
argv
 └─ program.main(argv)
     ├─ tokenize argv → { commandName, positionals, flags }        (program.ts; ~30 LOC homegrown)
     ├─ command = commands[commandName]                            (commands.ts table)
     │     ├─ if lifecycle verb (open/close/list/install) → handle locally, return
     │     └─ else (browser verb):
     ├─ session = Session.forWorkspace(flags.session)              (session.ts + registry.ts)
     │     └─ ensure daemon running (auto-spawn detached if absent)
     ├─ session.run({ name, positionals, flags })  ── JSON over unix socket ──▶ DAEMON
     └─ print(result.text | JSON)                                  (format.ts)

DAEMON (daemon.ts), per "run" message:
 ├─ command = commands[name]; { args } = command.parse(positionals, flags)   (zod)
 ├─ page = session.page(args.tab)                                            (Playwright Page, public API)
 ├─ if command needs a target:
 │     ├─ manifest = await resolver.load(page)        # window.__agrune_manifest__ → validate
 │     ├─ locator  = resolver.resolve(page, manifest, args.target)   # targetId → Locator
 │     └─ else (a11y FALLBACK): locator = resolver.resolveRaw(page, args.target)
 ├─ await command.run(page, locator, args)            # ← the ONE Playwright public-API call
 ├─ snapshot = await snapshot.build(page, manifest)   # post-action outline + screen-change delta
 └─ return format(result, snapshot)                   # { isError, text }
```

**Resolve order (manifest-first, a11y-fallback):**
1. `args.target` matches a manifest `targetId` (incl. repeat ref `repeatId[key=k].base`) → walk the selector ladder (`role → text → testId → attr → css`), first rung with `count()>0` wins, return `.first()`.
2. No manifest match but `target` looks like a Playwright locator string (`getByRole('button',{name:'X'})`, `#css`, `text=...`) → pass straight to the public locator API (a11y fallback — agrune degrades to raw Playwright).
3. Neither → `TARGET_NOT_FOUND` (exit 3).

### 2.4 Dependency rule (HARD invariant)

**NEVER import from `playwright-core/lib/**` (or `playwright/lib/**`).** Use ONLY the published API.

- **Allowed:** `import { chromium, devices } from 'playwright'` and `playwright` types. Surface limited to documented classes: `Browser`, `BrowserContext`, `Page`, `Locator`, `FrameLocator`, `ConsoleMessage`, `Dialog`, `Request`/`Response`, `FileChooser`.
- **Allowed key methods:** `chromium.launch/launchPersistentContext/connectOverCDP`; `context.newPage/cookies/addCookies/storageState/clearCookies/tracing/setOffline`; `page.goto/goBack/goForward/reload/setViewportSize/screenshot/pdf/evaluate/pause/on`; `locator.click/dblclick/hover/fill/pressSequentially/press/selectOption/setInputFiles/dragTo/check/uncheck/highlight/waitFor/count/first/nth/boundingBox/isVisible/isEnabled/ariaSnapshot/screenshot/evaluate/getByRole/getByText/getByTestId/locator`.
- **Forbidden:** anything under `lib/` (`server/`, `client/`, `tools/backend`, `injected`, `zodBundle`, `serverRegistry`, `socketConnection`). agrune writes its own ~40-LOC socket framer instead of importing `../utils/socketConnection`.
- **Enforcement:** `eslint no-restricted-imports` pattern `playwright*/lib/**` = error; a `verify:no-internals` CI script greps `src/` for `playwright-core/lib` / `playwright/lib` and fails.
- **Rationale:** `lib/` is unversioned and reshuffles between minors; pinning to public API is what lets agrune track Playwright with a simple `^1.59` range.

### 2.5 LOC budget (target)

| Module | Budget LOC | Replaces (current) |
|---|---:|---|
| `bin/agrune.ts` | 5 | `cli/bin/agrune.ts` |
| `src/program.ts` | 180 | top of `cli/cli.ts` dispatch |
| `src/commands.ts` | 220 | the `cli.ts` if/else ladder (1,355) |
| `src/session.ts` | 140 | `cli/daemon-client.ts` + `daemon-manager.ts` (282) |
| `src/registry.ts` | 110 | `cli/session-file.ts` (93) |
| `src/daemon.ts` | 240 | `cli/daemon.ts` (1,052) HTTP server |
| `src/resolver.ts` | 150 | `backend/locator.ts` + `manifest-loader.ts` (139) |
| `src/manifest.ts` | 150 | `manifest/schema.ts` (248, minus macros/repeat-codegen) |
| `src/snapshot.ts` | 200 | `backend/snapshot.ts` (423) |
| `src/format.ts` | 90 | scattered `writeResult`/format helpers |
| `src/errors.ts` | 40 | `cli/errors.ts` + `backend/errors.ts` |
| **Core total** | **≈1,525** | from **10,611** |
| `plugins/visual` (optional, separate) | ~300 | `runtime/*` |
| `plugins/self-heal` (optional) | ~120 | `backend/self-heal.ts` |

---

## 3. The Manifest Contract (v3)

The manifest is the **single source of truth** for which page elements the agent may drive. It is a plain JSON-serializable object (`version: 3`) authored against a real app and exposed by that app at runtime on `window.__agrune_manifest__`. The backend reads it, validates it (Zod + forbidden-selector pass), and projects each declared target onto live DOM via the deterministic selector ladder.

### 3.1 Root — `AgruneManifest`

```ts
interface AgruneManifest {
  version: 3            // z.literal(3) — exact; no v2 adapter exists
  groups: ManifestGroup[]
  macros?: ManifestMacro[]   // OPTIONAL layer (§8); droppable from a lean core schema
}
```

`version` MUST be exactly the number `3`. v3 was a breaking change (2026-04-19): removed `exposureMode`, removed the `AgruneToolEntry` indirection (targets hang directly off groups), replaced `action: string` with `actionKinds: ActionKind[]`, replaced selector strings with `SelectorLadder`, added `sensitive?: true`, added top-level `macros` and per-group `repeats`.

There is **no app-level field** — the whole manifest is the app scope. Route scoping is per-**group**.

### 3.2 `ManifestGroup`

```ts
interface ManifestGroup {
  groupId: string          // z.string().min(1), required, unique within manifest
  name?: string
  desc?: string
  route?: string           // URL/route scope. Empty/absent = global. RegExp not allowed — string only
  canvas?: CanvasConfig    // present => pan/zoom canvas; targets surfaced with coordSpace:'canvas' (OPTIONAL plugin)
  targets: ManifestTarget[]    // required array (may be empty)
  repeats?: ManifestRepeat[]
}
```

**`route` semantics** (`routeApplies(route, url)`):
1. `route` absent or `route.trim().length === 0` → applies (global), return `true`.
2. Else `new RegExp(route).test(url)` — `route` is a JS regex source string matched against the full URL.
3. If `new RegExp(route)` throws (invalid regex) → fallback substring: `url.includes(route)`.

Groups whose `route` does not apply to the current URL are **skipped entirely** during snapshot build.

### 3.3 `ManifestTarget`

```ts
interface ManifestTarget {
  targetId: string          // z.string().min(1), REQUIRED, unique stable id
  name?: string             // human label; falls back to targetId in snapshot
  desc?: string             // description surfaced to agent
  actionKinds: ActionKind[] // z.array(ActionKindSchema).min(1) — REQUIRED, >=1
  selector: SelectorLadder  // REQUIRED, >=1 ladder rung
  sensitive?: true          // OR-only: z.literal(true).optional(). false is REJECTED
  onSuccess?: string        // authored post-action feedback when screen changed
  onNoEffect?: string       // authored feedback when mechanically-OK action produced no change
  volatile?: boolean        // exclude this target's text/value from snapshot signature
  required?: boolean        // mark fillable target required even without DOM required/aria-required
}
```

Field semantics:
- **`targetId`** — stable, author-chosen identifier. The agent addresses targets by this id (or its repeat-expanded form, §3.10). Snapshot fallback name chain: `name ?? targetId`.
- **`actionKinds`** — the set of actions the agent is allowed to perform (allowed-list; codegen and authoring rely on it). MUST contain ≥1 `ActionKind`. NOTE: at execution the act/fill/drag commands key off the runtime command kind, not this list — see Open Questions.
- **`onSuccess` / `onNoEffect`** — authored feedback strings, NOT rendered into the agent snapshot (zero per-turn token cost). The driver emits one of them AFTER an action, gated on a snapshot-version delta: `onSuccess` if the screen changed, `onNoEffect` if not. Authoring rule: describe semantic role only; never bake in dynamic facts (step/item counts) that drift.
- **`volatile`** — when true, the target's `textContent` and `valuePreview` are excluded from the snapshot signature so a self-updating control (clock, live counter, relative timestamp, animation label) does not bump the snapshot version and corrupt the onSuccess/onNoEffect gate. Target is still rendered.
- **`required`** — author override marking a fillable target required even when DOM has no `required`/`aria-required`. DOM-detected required intent (`el.required === true || aria-required="true"`) is honored regardless. Combined with `hasValue`, feeds the deterministic `pendingRequired` "still-needed fields" nudge. Carried to `PageTarget.required` only when true (`target.required || state.required`).

### 3.4 `ActionKind` (exact enum, in order)

```ts
type ActionKind =
  | 'click' | 'fill' | 'dblclick' | 'contextmenu' | 'hover'
  | 'longpress' | 'type' | 'press' | 'select' | 'upload' | 'drop'
```

`ActionKindSchema = z.enum([...])` — exactly these 11, no others.

### 3.5 `SelectorLadder` — the rungs

```ts
type SelectorLadder = AtLeastOne<{
  role: { name: string; level?: string }
  text: string
  testId: string
  attr: string
  css: string
}>
```

Zod: `SelectorLadderSchema` is an object with all five optional, plus a `.refine` requiring at least one of `role | text | testId | attr | css` (message: `"SelectorLadder must define at least one of: role, text, testId, attr, css"`).

**`role.level` is a documented misnomer:** it carries the accessible *name* (passed as Playwright's `{ name }` option, not `{ level }`). `role.name` is the ARIA role; `role.level` is the accessible-name filter.

### 3.6 Selector ladder semantics + precedence (CRITICAL)

The ladder is an **ordered fallback chain**, not a conjunction. Precedence is fixed:

**`role` → `text` → `testId` → `attr` → `css`**

`buildLocatorCandidates(scope, ladder)` builds candidates only for the rungs present, in that order. `resolveLocator` walks them and returns the FIRST candidate whose `locator.count() > 0`, narrowed via `.first()`. So a target with `{ role, css }` (e.g. TodoMVC `new_todo_input: { role: { name: 'textbox' }, css: '#new-todo' }`) resolves by role if a role match exists, and only falls back to css if role matched nothing. `resolveLocatorMulti` is identical but returns the full multi-element locator (no `.first()`) — used for repeat enumeration so an N-row repeat is not collapsed to its first instance.

**Per-rung mapping (1:1 to Playwright public API):**

| rung | Playwright call |
|------|-----------------|
| `role: { name, level? }` | `scope.getByRole(name, level ? { name: level } : undefined)` |
| `text` | `scope.getByText(text)` |
| `testId` | `scope.getByTestId(testId)` (honors configured `testIdAttribute`) |
| `attr` | `scope.locator(attr)` (after forbidden-selector assert) |
| `css` | `scope.locator(css)` (after forbidden-selector assert) |

`attr` and `css` are both `scope.locator(...)`. The only distinction is intent (attr = attribute selector like `a[href="#/all"]`; css = class/structural selector). Both run `assertNoHashClass` + `assertNoNthChild` at resolve time (a second runtime guard beyond build-time validation).

`scope` is a `Page` or `Locator` (`LocatorScope = Pick<Page|Locator, 'getByRole'|'getByText'|'getByTestId'|'locator'>`), so the ladder also works scoped to a container (repeats / canvas).

`resolveLocator` returns `{ locator, strategy } | null`; for each candidate, `count = await candidate.locator.count().catch(()=>0)`; first with `count>0` wins. **No ambiguity error** — multi-match silently narrows via `.first()`.

### 3.7 `ManifestRepeat`

```ts
interface ManifestRepeat {
  repeatId: string                    // z.string().min(1), required
  template: string                    // name template, e.g. "todo_${key}"
  keyFrom: string                     // JS expr extracting a STABLE key, e.g. "el.dataset.id ?? \"\""
  nameFrom?: string                   // JS expr for display name
  strategy: 'dom' | 'virtualized'     // z.enum(['dom','virtualized'])
  containerSelector?: SelectorLadder  // row-enumeration scope; absent => document scope
  targets: ManifestTarget[]           // the per-row targets
}
```

- `keyFrom` / `nameFrom` are JS expression source strings compiled at runtime as `new Function('el', 'return String(<expr>)')`. `el` is the matched row element.
- `strategy: 'virtualized'` → enumeration filters to in-viewport rows (windowed lists); `'dom'` enumerates all matched rows.
- DoS cap `REPEAT_MAX_INSTANCES = 1000` rows per repeat (truncated with console warning).
- `containerSelector` scopes enumeration; when virtualized, the container's `aria-rowcount` > `aria-setsize` gives `logicalSize` (else null).
- In a lean core, keep `strategy:'dom'` repeats; `virtualized` + aria-rowcount/aria-setsize reads are opt-in.

### 3.8 `ManifestMacro` (top-level `macros[]`) — OPTIONAL layer (§8)

```ts
interface MacroStep { targetId: string; action: ActionKind; value?: string; sensitive?: true }
interface ManifestMacro {
  macroId: string
  name?: string
  desc?: string
  params: Record<string, { type: 'string'|'number'|'boolean'; required?: boolean }>  // REQUIRED (may be {})
  steps: MacroStep[]        // z.array(...).min(1) — REQUIRED, >=1
  precondition?: string
  postcondition?: string
  circuitBreaker?: { maxRetries: number /* int >=0 */; resetAfterMs?: number /* int >=0 */ }
}
```

### 3.9 `CanvasConfig` — OPTIONAL plugin (§8)

```ts
interface CanvasConfig {
  viewportSelector: string   // min(1); the CSS-transformed pan/zoom element (e.g. .react-flow__viewport)
  paneSelector?: string      // non-transformed origin pane; defaults to viewportSelector's parentElement
}
```

`viewportSelector`/`paneSelector` are plain CSS strings (not SelectorLadder) read via `document.querySelector`. Presence of `canvas` makes the group a coordinate canvas: targets get `coordSpace:'canvas'` and centers in stable canvas coords (pan/zoom independent).

### 3.10 Repeat targetId grammar (`target-ref.ts`)

**Agent-facing form (canonical, what the model reads/writes):**
```
repeatId[key=K].baseTargetId       e.g.  posts[key=abc123].like_btn
```
**Internal form (storage):**
```
repeatId__agrune_repeatKey_K.baseTargetId
```
where `REPEATED_TARGET_KEY_DELIMITER = '__agrune_repeatKey_'`.

`normalizeAgentTargetId(input)` — agent form → internal:
- No `[` → returned unchanged (non-repeat targetId).
- `[` at index 0 → `AgentTargetIdParseError('Missing repeatId before "[")`.
- Already contains the delimiter → returned unchanged (idempotent).
- `repeatId` = substring before `[`; `]` = `lastIndexOf(']')`; if `]` ≤ `[` → `'Unbalanced brackets...'`.
- Bracket inner MUST contain `=`; else `'Bracket must contain "=" to specify key (e.g. posts[key=abc123].btn)'`.
- Key value = trim(after `=`); empty → `'Bracket key value cannot be empty'`.
- After `]` MUST start with `.`; else `'Expected "." after "]" ...'`.
- baseTargetId = after the `.`; empty → `'baseTargetId after "." cannot be empty'`.
- Returns `repeatId + DELIMITER + value + '.' + baseTargetId`.

`toAgentTargetRef(target)` — internal → agent form (inverse), preferring `target.repeatInstance.{repeatId,key}` when present; falls back to parsing the internal id. Returns `repeatId[key=K].baseTargetId`, or the raw id if it has no delimiter / is malformed.

Snapshot build constructs the internal id as `${repeat.repeatId}${DELIMITER}${row.key}.${target.targetId}`, and `formatSnapshot` renders each target as `[ref=${toAgentTargetRef(target)}]` (agent form).

**Stable-key enforcement:** repeat keys MUST come from a stable `keyFrom`; index-only identification is forbidden at build time (§3.11.4) because it is reorder-vulnerable.

### 3.11 Validation (`validateManifest`)

```ts
type ValidateResult =
  | { ok: true; manifest: AgruneManifest }
  | { ok: false; errors: { path: string; message: string }[] }
```

**3.11.1 Step 1 — Zod structural parse.** `ManifestSchema.safeParse(input)`. On failure, every issue → `{ path: issue.path.join('.'), message }` (symbol path segments dropped). Special case: if the failing path's last segment is `sensitive` AND the value is `false`, the message is replaced with the OR-only explanation (§3.11.3).

**3.11.2 Step 2 — forbidden-selector pass (`checkLadder`).** Runs ONLY over `attr` and `css` rungs of every target selector (direct group targets + repeat targets):

- **Hash classes** — `HASH_CLASS_PATTERN = /\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/`. Matches a class token of ≥8 pure-alphanumeric chars NOT followed by hyphen/alphanumeric. *Why:* CSS-module/styled-component hash classes (e.g. `.aB3xK9p2`) are build-generated and change every build. *Why the negative lookahead:* Tailwind utilities (`.flex`, `.items-center`, `.bg-blue-500`) contain hyphens → NOT flagged.
  Error: `groups[gi].targets[ti] (targetId=X).selector.css: hash class forbidden ("...")`.
- **`:nth-child`** — `NTH_CHILD_PATTERN = /:nth-child\(/`. *Why:* position-dependent; breaks on reorder/insert.
  Error: `...selector.css: :nth-child forbidden ("...")`.

These same asserts (`assertNoHashClass`, `assertNoNthChild`) re-run at **resolve time** for `attr`/`css` rungs, throwing `SelectorForbiddenError(selector, message)`. `role`/`text`/`testId` rungs are NOT checked (stable by construction).

**3.11.3 The `sensitive` OR-only lock (MANIFEST-04).** `sensitive` is `z.literal(true).optional()`. **`sensitive: false` is rejected by the schema** (using `z.boolean()` would let `false` pass — explicitly avoided). Rationale: sensitivity is OR-only — once detected sensitive (by manifest flag OR runtime DOM heuristic), it cannot be overridden to false. Verbatim substituted message:

> `sensitive:false is not allowed. The sensitive flag is OR-only: once detected as sensitive by manifest flag or runtime heuristic, it cannot be overridden to false. Remove the field or set to true.`

**3.11.4 Repeat `keyFrom` build-time gate (REPEAT-01/02/03).** For each repeat:
1. `keyFrom.trim()` empty → error: `repeatId="X": keyFrom is required. Index-only identification is forbidden (reorder-vulnerable).`
2. Else compile-only `new Function('el', 'return String(<keyFrom>)')`:
   - `SyntaxError` → error `repeatId="X": keyFrom compile failed: <msg>`.
   - `EvalError` (CSP blocks `Function`) → **graceful skip** (no error), so CSP environments still build.
   - Compile only; never executed at validation time.

**3.11.5 Result.** Any ladder error or keyFrom error accumulated → `{ ok: false, errors }`. Else `{ ok: true, manifest: parsed.data }`. (Zod-pass + extra-check-fail returns the extra-check errors only.)

### 3.12 Page exposure + trust boundary

**Exposure.** The app under test exposes the manifest on the global `window`:
- Primary: `window.__agrune_manifest__`
- Alias accepted: `window.__AGRUNE_MANIFEST__`

Injected via inline `<script>` in tests. The fixture owns the global; there is no MCP "load manifest" tool.

**Loader (`loadManifestFromPage(page)`):**
```ts
const raw = await page.evaluate(() =>
  window.__agrune_manifest__ ?? window.__AGRUNE_MANIFEST__ ?? null)
if (!raw) throw new CliError('MANIFEST_NOT_FOUND',
  'No Agrune manifest found on the active page. Expected window.__agrune_manifest__.', { url })
const validated = validateManifest(raw)
if (!validated.ok) throw new CliError('INVALID_MANIFEST',
  'The active page Agrune manifest is invalid.', { errors: validated.errors })
return validated.manifest
```
- Read via `page.evaluate` (public API; returns the structured-cloned object).
- Re-read fresh on each snapshot/command path — the manifest is re-read per operation, never cached as trusted.

**Trust boundary.** The manifest is **page-controlled (untrusted input)**. Consequences enforced by the contract:
- MUST be re-validated every load; never trusted structurally.
- JSON-serializable only (`route` cannot be a RegExp; everything passes through structured clone). RegExp/functions cannot survive.
- `keyFrom`/`nameFrom` are page-authored JS compiled with `new Function` — validation only *compiles* (never executes) them; execution happens inside the page's own `evaluateAll` sandbox (`expandRepeatRows`), where errors are caught and degrade to `__idx_N` keys. Duplicate keys → `key__dup_<index>`; null/undefined/empty keys → `__idx_<index>`.
- DoS cap: `REPEAT_MAX_INSTANCES = 1000`.
- Forbidden selectors blocked at BOTH validate time and resolve time.

### 3.13 Codegen — manifest → Playwright test (OPTIONAL, one-directional)

`generatePlaywrightTests(manifest, { baseUrl? }): string` emits a pure-string Playwright test file (no Playwright runtime dependency). One-way: manifest is source of truth, the test is a generated asset (`// Edit the manifest, not this file.`).

- Header `// AUTO-GENERATED from an agrune manifest...` + `import { test, expect } from '@playwright/test'`.
- Per non-empty group: `test.describe(group.name || groupId)` with one test `'targets resolve (drift check)'` that (optional `await page.goto(baseUrl)`) then per direct target `await expect(<locatorExpr>).toBeVisible()`.
- If `macros` present: `test.describe('macros')` with one test per macro, optional goto, each step resolved by `targetId` into `actionToCallExpr`. Unresolved step → `// unresolved target: <id>` comment.

`selectorToLocatorExpr` mirrors resolve precedence; role with `level` emits `getByRole(name, { name: level })`; empty ladder → `base.locator('body')`.

`actionToCallExpr`: `click→.click()`, `dblclick→.dblclick()`, `contextmenu→.click({ button: 'right' })`, `hover→.hover()`, `longpress→.click({ delay: 650 })`, `type→.pressSequentially(value ?? '')`, `press→.press(value ?? 'Enter')`, `fill→.fill(value ?? '')`, `select→.selectOption(value ?? '')`, `upload→.setInputFiles(value ?? '')`, `drop→// drop step not auto-generated`, unknown→`// unsupported action`.

This authoring/codegen concern is separate from the runtime CLI; **droppable from the lean runtime package** (move to authoring tooling).

### 3.14 Reference manifest (TodoMVC) — verbatim shape

8 static targets + 1 `defineRepeat`. Role-first ladders with css fallback:
- `new_todo_input: { role: { name: 'textbox' }, css: '#new-todo' }`
- filters: `{ role: { name: 'link' }, css: 'a[href="#/all"]' }`
- `clear_completed_button: { role: { name: 'button' }, css: '.clear-completed' }`

Repeat `todo_items`: `template: 'todo_${key}'`, `keyFrom: 'el.dataset.id ?? ""'`, `nameFrom: 'el.querySelector("label")?.textContent?.trim() ?? ""'`, `strategy: 'dom'`, `containerSelector: { css: '.todo-list' }`, `targets: [todoItemToggle, todoItemLabel, todoItemDestroy]`. Built via `defineManifest({ groups: [todosGroup] })` (auto-stamps `version: 3`). The repeat key comes from `data-id` on each `<li>` — stable, reorder-safe, satisfying the keyFrom gate.

### 3.15 Builders (authoring DX, OPTIONAL)

`defineTarget`/`defineGroup`/`defineRepeat`/`defineMacro`/`defineManifest` are identity functions with phantom types: (a) carry literal `targetId` types for cross-references; (b) type `sensitive` as `?: true` so `sensitive: false` is a compile error (matching the runtime OR-only lock); (c) `defineManifest` stamps `version: 3` and only includes `macros` when provided. No runtime validation — `validateManifest` is the runtime gate.

---

## 4. Snapshot & Outline Serialization (verbatim formats)

The token-saving differentiator. agrune builds a manifest-derived `PageSnapshot` (only author-declared targets) and serializes it in **outline** mode (groups + counts — the cheap default) or **full** mode (per-target lines, when the agent expands a group/target). The exact line grammars below are normative.

### 4.1 Data structures

**`PageSnapshot`:**
```ts
interface PageSnapshot {
  schemaVersion: 3          // literal; v3 = SelectorLadder on PageTarget.selector
  version: number           // monotonic, advances ONLY when target signature changes
  capturedAt: number        // Date.now() at build
  url: string               // page.url()
  title: string             // await page.title().catch(() => '')
  groups: PageSnapshotGroup[]
  targets: PageTarget[]     // flat; groups reference these by id via targetIds
}
```

**`PageSnapshotGroup`:**
```ts
interface PageSnapshotGroup {
  groupId: string
  groupName?: string
  groupDesc?: string
  targetIds: string[]                       // member targets in manifest order
  viewportTransform?: ViewportTransform     // canvas groups only
  meta?: unknown
  repeats?: Array<{
    repeatId: string
    strategy: 'dom' | 'virtualized'
    instanceCount: number                   // visible instances in this snapshot
    logicalSize: number | null              // aria-rowcount-based total; null = unknown
  }>
}
```

**`PageTarget`:**
```ts
interface PageTarget {
  targetId: string          // repeat instances: `${repeatId}__agrune_repeatKey_${key}.${baseTargetId}`
  groupId: string
  groupName?: string
  groupDesc?: string
  name: string              // displayName ?? target.name ?? target.targetId
  description: string       // target.desc ?? ''
  actionKinds: ActionKind[]
  selector: SelectorLadder
  visible: boolean
  inViewport: boolean
  enabled: boolean
  covered: boolean
  actionableNow: boolean    // visible && enabled && !covered
  reason: PageTargetReason  // 'ready'|'hidden'|'offscreen'|'covered'|'disabled'|'sensitive'
  overlay: boolean
  sensitive: boolean
  textContent?: string      // trimmed; undefined when empty
  valuePreview?: string | null   // input value, null if sensitive
  center?: { x: number; y: number }   // only when actionableNow
  size?: { w: number; h: number }
  coordSpace?: 'viewport' | 'canvas'  // 'canvas' when group has a canvas transform
  sourceFile: string        // 'page-manifest' | 'unmapped'
  sourceLine: number        // 0 for manifest targets
  sourceColumn: number      // 0
  domResolved?: boolean     // true if selector resolved to live DOM at capture
  repeatInstance?: { repeatId: string; index: number; key: string }
  onSuccess?: string        // carried from manifest; NOT rendered (driver-only feedback)
  onNoEffect?: string       // carried from manifest; NOT rendered
  volatile?: boolean        // excluded from signature; still rendered
  hasValue?: boolean        // NOT rendered; feeds signature (sensitive-fill detection)
  required?: boolean        // NOT rendered; powers still-needed-fields nudge
}
```

**`PageTargetReason`** (closed enum): `'ready' | 'hidden' | 'offscreen' | 'covered' | 'disabled' | 'sensitive'`.

Computed in `captureElementState`, priority-ordered:
```
reason = 'ready'
if (!visible)            reason = 'hidden'
else if (!inViewport)    reason = 'offscreen'
else if (covered)        reason = 'covered'
else if (!enabled)       reason = 'disabled'
else if (fillAction && sensitive) reason = 'sensitive'
```
where `inViewport = visible && viewportRect(el) !== null`, `covered = inViewport ? !isTopmostInteractableEl(el) : false`. A **missing** target (selector unresolved) is forced to `reason: 'hidden'`, `domResolved: false`, all booleans false.

### 4.2 EXACT serialized text format — `formatSnapshot`

```ts
formatSnapshot(snapshot, options: {
  groupId?, groupIds?, targetRef?, full?: boolean, includeTextContent?: boolean })
```

**Header (ALWAYS emitted, both modes), VERBATIM:**
```
### Page
- Page URL: <snapshot.url>
- Page Title: <snapshot.title>
- Snapshot Version: <snapshot.version>
### Snapshot
```yaml
```
(the code-fence opener is the literal three-backtick + `yaml`.)

**Mode selection.** Full mode when `options.full === true` OR `requestedGroupIds.size > 0` OR `requestedTargetId` is set (any filter). Otherwise outline mode. The snapshot is first passed through `filterSnapshot(snapshot, options)` → `filteredSnapshot`.

**OUTLINE mode (default) — VERBATIM line grammar.** For each `group` in `filteredSnapshot.groups`:
```
- group <JSON(groupName ?? groupId)> [ref=<groupId>]:
  - description: <JSON(groupDesc)>        # ONLY if groupDesc truthy
  - targets: <group.targetIds.length>
```
`targetIds.length` is the post-filter count.

**FULL mode (`--full` / `--mode full` / any filter) — VERBATIM line grammar.** For each `target` in `filteredSnapshot.targets`:
```
- target <JSON(name)> [ref=<toAgentTargetRef(target)>]:
  - description: <JSON(description)>      # ONLY if description truthy
  - group: <JSON(groupId)>
  - reason: <reason>                       # ONLY if reason !== 'ready' (UNQUOTED, raw enum)
  - text: <JSON(textContent)>              # ONLY if textContent && options.includeTextContent
```
Sub-line order is fixed: description, group, reason, text. `reason` is the only sub-line whose value is NOT JSON-quoted.

**Empty / footer.** After the body, if the last line is still ` ```yaml ` (zero groups/targets rendered), push the literal line `- none`. Then always push the closing fence ` ``` `. Result is `lines.join('\n')` (no trailing newline; the CLI adds one to stdout).

**`quote()` = `JSON.stringify(value)`.** Names/descriptions/text are double-quoted with JSON escaping. `ref`, `reason`, and the numeric count are raw/unquoted.

**VERBATIM example — OUTLINE (`agrune targets`):**
```
### Page
- Page URL: https://app.example.com/dashboard
- Page Title: Dashboard
- Snapshot Version: 7
### Snapshot
```yaml
- group "Top Navigation" [ref=topnav]:
  - description: "Primary navigation bar"
  - targets: 4
- group "Compose" [ref=compose]:
  - targets: 2
```
```

**VERBATIM example — FULL, single group (`agrune targets --group compose --full`):**
```
### Page
- Page URL: https://app.example.com/dashboard
- Page Title: Dashboard
- Snapshot Version: 7
### Snapshot
```yaml
- target "Subject" [ref=subject_input]:
  - description: "Email subject line"
  - group: "compose"
- target "Send" [ref=send_btn]:
  - group: "compose"
  - reason: disabled
```
```

**VERBATIM example — repeat-instance ref.** A target with `targetId = "posts__agrune_repeatKey_abc123.like_btn"` and `repeatInstance={repeatId:'posts',key:'abc123'}` renders via `toAgentTargetRef` as:
```
- target "Like" [ref=posts[key=abc123].like_btn]:
```

**VERBATIM example — EMPTY snapshot:**
```
### Page
- Page URL: https://example.com/
- Page Title: Example
- Snapshot Version: 0
### Snapshot
```yaml
- none
```
```

### 4.3 Progressive disclosure (outline-first, expand-one-group)

The agent sees the outline by default. To inspect a group it re-runs `targets` with a filter, which flips to full mode automatically and restricts output.

**`filterSnapshot(snapshot, options)` semantics:**
1. `resolveTargetFilter(options)`:
   - `requestedGroupIds: Set<string>` = union of `[groupId]` and `groupIds[]`, each `.trim()`ed, empties dropped.
   - `requestedTargetId?: string` = `normalizeAgentTargetId(targetRef)` if `targetRef` given.
2. No group ids AND no target id → returns the snapshot unchanged (identity; outline path).
3. `filterTargets`: keep target iff (no `requestedTargetId` OR `target.targetId === requestedTargetId`) AND (no group ids OR `requestedGroupIds.has(target.groupId)`). ANDed — a targetRef + groupId intersect.
4. Groups kept: if `requestedGroupIds.size > 0`, keep groups whose `groupId` is in the set (even if all targets filtered out); else keep groups with ≥1 surviving target. Each kept group's `targetIds` is re-filtered to surviving ids.
5. Returns `{ ...snapshot, groups, targets }` (version/url/title/capturedAt preserved).

**Filter flags (CLI → daemon → format):** see §6. `--group-ids` must yield ≥1 non-empty id else error `--group-ids requires at least one group id`. `--mode` validated to `outline|full` else error `targets mode must be one of: outline, full`.

> **Lean note:** Filtering should happen **once, server-side**; the CLI then only selects the mode. The current double-filter (server then client) is idempotent but redundant (Open Questions).

**`depth` / `--mode ai|default` / `--boxes` belong to the OTHER command.** They are NOT part of `formatSnapshot`/manifest snapshot. They belong to `agrune snapshot`/`aria-snapshot`, which calls `session.ariaSnapshot()` → Playwright's `page.ariaSnapshot({ mode, depth })` (raw a11y tree, the fallback/escape hatch). `mode` validates to `ai|default` (default `ai`); `depth` must be a positive integer.

### 4.4 Snapshot store / version / signature

**`SnapshotStore`:**
```ts
interface SnapshotStore { version: number; signature: string | null }
createSnapshotStore() => { version: 0, signature: null }
```
One store per tab entry. Reset on navigation. `hasSnapshot = version > 0`; reported `snapshotVersion = version===0 ? null : version`.

**`buildSnapshotFromManifest(page, manifest, store)`:**
1. Read `url=page.url()`, `title=await page.title().catch(()=>'')`.
2. For each `manifest.groups` where `routeApplies(group.route, url)`:
   - If `group.canvas`, read live `canvasTransform` once.
   - Inspect direct targets concurrently (`Promise.all`, manifest order) → `inspectTarget` → `inspectLocator`(captureElementState) or `missingTarget` if unresolved.
   - Inspect repeats concurrently → `inspectRepeatTarget` enumerates every matching row via `resolveLocatorMulti` + `expandRepeatRows` (capped at `REPEAT_MAX_INSTANCES`), building `repeatInstance` + per-instance `targetId`.
   - Build group with `targetIds`, optional `viewportTransform` (canvas only) and `repeats` summary.
   - Canvas targets convert center to STABLE canvas coords (`viewportToCanvas`, rounded), set `coordSpace:'canvas'`.
3. **Signature** = `JSON.stringify({ targets: [...projected fields...], title, url })`. Projected per target: `actionKinds, actionableNow, covered, domResolved, enabled, hasValue, inViewport, reason, sensitive, targetId, textContent (undefined if volatile), valuePreview (undefined if volatile), visible, repeatInstance`. (NOT in signature: name, description, center/size, selector, onSuccess/onNoEffect.) For sensitive fills `valuePreview` is `null` but `hasValue` is still included (a secret fill bumps version without leaking the value).
4. **Version advance:** `if (store.signature !== signature) { store.version += 1; store.signature = signature }`. An unchanged page keeps a STABLE version across re-captures — the onSuccess/onNoEffect change gate, and prevents volatile churn (clocks) from looking like a change.
5. Returns `{ schemaVersion:3, version: store.version, capturedAt: Date.now(), url, title, groups, targets }`.

**Manifest-less / unmapped paths:**
- `refreshSnapshot`: loads manifest; if missing AND `allowMissingManifest`, uses empty `{version:3, groups:[]}` → still produces an empty versioned snapshot.
- `augmentWithUnmapped`: AFTER the manifest snapshot, deterministically detects on-screen interactive controls not covered by the manifest, grafts them as synthetic `PageTarget`s under an `unmapped` group (raw refs, `reason:'ready'`, `sourceFile:'unmapped'`). Does NOT bump version. Gated on `detectUnmapped` (§8).
- `ariaSnapshot`: the escape hatch — directly returns Playwright `page.ariaSnapshot({mode, depth})` (or `locator.ariaSnapshot` when a `targetRef` is given). Already public API — keep as thin pass-through; do NOT reinvent an accessibility-tree serializer.

---

## 5. Target Resolution & Actions

### 5.1 Layering & control flow

`PlaywrightDriver.execute(tabId, command)` is the single command entrypoint:
1. `commandId` = `command.commandId` if string, else `cmd-${++counter}-${Date.now()}`.
2. **Pending-dialog fast-fail:** if any unhandled dialog exists for the tab → `{ ok:false, error: FLOW_BLOCKED "Page is blocked by a pending dialog. Handle it with browser_handle_dialog first." details:{tabId} }`. (A pending JS dialog freezes page script.)
3. Capture `before = snapshots.get(tabId)` and `beforeAx = axLines.get(tabId)` BEFORE any refresh.
4. Run `flowBlockGate` (§5.8). If blocked → return its error with `commandId`.
5. `dispatchCommand` → does the action via `PlaywrightSession`.
6. `settle(tabId)` → re-snapshot, optionally poll until quiescent (§5.9).
7. Compute `changed`, `feedback`, `screenMessages` delta, `pendingRequired`; fold via `withActionInsights`.
8. Return `{ commandId, ok:true, result, snapshotVersion, snapshot }`.
   On throw: refresh snapshot, map via `toCommandErrorParts`, return `{ ok:false, error: createCommandError(code,message,{...details, targetId?, snapshotVersion?}), snapshotVersion?, snapshot? }`.

`dispatchCommand` switch on `command.kind`: `act | fill | drag | wait | read | pointer`. Unknown → `INVALID_COMMAND "Unsupported command kind: ${kind}"`.

### 5.2 targetId → Locator resolution

**`buildLocatorCandidates(scope, ladder)`** — fixed precedence (§3.6): role → text → testId → attr → css. `assertNoHashClass`/`assertNoNthChild` run on attr/css.

**`resolveLocator(scope, ladder)`** → `{ locator, strategy } | null`: walk in order, first with `count()>0` → `{ strategy, locator: candidate.locator.first() }`; null if none.

**`resolveLocatorMulti(scope, ladder)`** → same minus `.first()` (full multi-element; for repeat enumeration).

**`findTargetLocator(page, manifest, normalizedId)`** — walk `manifest.groups` where `routeApplies(group.route, url)`:
- Direct: `group.targets.find(t => t.targetId === normalizedId)` → `resolveLocator(page, target.selector).locator` (`.first()`), or null.
- Repeat: `findRepeatTargetLocator(page, group, normalizedId)`.
First match across applicable groups wins.

**`resolveTargetLocator(tabId, targetRef)`** — the full action-path resolver:
1. **Unmapped raw ref** (`x1`, `x2`, …): if present in `unmappedRegistry[tabId]`, return `page.locator(unmapped.selector).first()` — re-resolved live.
2. Load manifest; `normalized = normalizeAgentTargetId(targetRef)`; `found = findTargetLocator(...)`. If found → return.
3. Not found in DOM. Determine declaration:
   - `declaredTarget = findDeclaredDirectTarget(manifest, normalized, url)`.
   - `declared = declaredTarget !== null || manifestDeclaresTarget(...)`.
   - **Not declared** → throw `TARGET_NOT_FOUND "Target not found: ${ref}"` details `{ target, manifestTarget:false, reason:'not-declared' }`.
   - **Declared direct + self-heal enabled** → `attemptSelfHeal` (§8). If decision `'auto'` and locator found → return. Else throw `TARGET_NOT_FOUND` details `{ target, manifestTarget:true, reason:'selector-unresolved', repair: serializeRepairOutcome(outcome) }`.
   - **Declared (repeat / self-heal off)** → throw `TARGET_NOT_FOUND` details `{ target, manifestTarget:true, reason:'selector-unresolved' }`.

**`findRepeatTargetLocator` / `findLocatorByRepeatKey`:**
- Target id format `${repeatId}${DELIMITER}${key}.${baseTargetId}`. Parsed by splitting on delimiter then first `.`.
- `repeat = group.repeats.find(...)`; `target = repeat.targets.find(...)`. Missing → null.
- `findLocatorByRepeatKey` uses **`resolveLocatorMulti`** (NOT `resolveLocator`). Iterates `nth(index)` over all matched rows; for each, evaluates `repeat.keyFrom` as `String(<keyFrom>).trim()` in-page (`new Function('el', 'return String('+expr+')')`); returns the locator whose computed key `=== key`. (`.first()` would only ever see row 0.)

**`resolveTargetOrSelectorLocator`** (screenshots / target-scoped evaluate): tries manifest target resolution first; if manifest-declared-but-unresolved (`details.manifestTarget===true`), rethrows. Otherwise treats `targetRef` as a raw CSS selector: `page.locator(selector)`; `count===1` → return; `count>1` → `INVALID_TARGET "Selector is not unique" {target,count}`; empty/invalid → `INVALID_TARGET`; nothing → `TARGET_NOT_FOUND`. The only path allowing raw CSS targets for read-only ops.

### 5.3 Action → Playwright PUBLIC API mapping table

Every action kind maps onto a documented Playwright v1.59 public locator/page method.

| Command kind / action | Session call | Playwright PUBLIC API | Notes |
|---|---|---|---|
| `act` / `click` | `session.click(...,'click')` | `locator.click(clickOptions)` (or `dblclick` if `doubleClick`) | `button∈left\|right\|middle`, `modifiers∈Alt\|Control\|ControlOrMeta\|Meta\|Shift` |
| `act` / `dblclick` | `session.click(...,'dblclick')` | `locator.dblclick(clickOptions)` | |
| `act` / `contextmenu` | `session.click(...,'contextmenu')` | `locator.click({...clickOptions, button:'right'})` | |
| `act` / `hover` | `session.click(...,'hover')` | `locator.hover()` | no clickOptions |
| `act` / `longpress` | `session.click(...,'longpress')` | `locator.click({ delay: 650 })` | 650ms mouse hold; ignores button/modifiers |
| `fill` (insert+clear) | `session.fill(...)` | `locator.fill(value)` | atomic set |
| `fill` (insert+append, `clear:false`) | `session.fill(...)` | `locator.inputValue()` + `locator.fill(cur+value)` | append semantics |
| `fill` (keystroke) | `session.fill(...,'keystroke')` | `locator.click()` + `press(Meta/Control+A)` + `press('Backspace')` + `pressSequentially(value)` | for masked/validated/password/OTP |
| `fillForm` textbox | `applyFillFormField` | `locator.fill(String(value))` | |
| `fillForm` checkbox/radio | `applyFillFormField` | `locator.setChecked(bool)` | boolean coercion (see below) |
| `fillForm` combobox | `applyFillFormField` | `locator.selectOption(String(value))` | |
| `fillForm` slider | `applyFillFormField` | `locator.fill(String(value))` + `dispatchEvent('input')` + `dispatchEvent('change')` | |
| `type` | `session.type(...)` | `locator.pressSequentially(text,{delay})` (+ `locator.press('Enter')` if submit) | `slowly` ⇒ 75ms inter-key |
| `select` | `session.select(...)` | `locator.selectOption([{value}...])` | driver passes `{value}` only |
| `upload` (input) | `session.upload(...)` | `locator.setInputFiles(absolutePaths)` | |
| `upload` (file chooser) | `uploadToFileChooser(...)` | `fileChooser.setFiles(absolutePaths)` | feeds a PENDING chooser captured by interruption |
| `drop` | `session.drop(...)` | `locator.evaluate(dispatchDropInBrowser)` | synthetic DataTransfer/DragEvent + base64 files; no public equivalent |
| `drag` (target→target) | `session.drag(...)` | `source.dragTo(destination)` | HTML5 DnD |
| `drag` (viewport coords) | `performCoordinateDrag(...)` | `page.mouse.move/down/up` | offset or absolute |
| `drag` (canvas coords) | `dispatchCanvasDrag(...)` | `page.mouse.*` + `locator.boundingBox()` + transform read | §5.4 |
| `wait` visible/hidden | `waitForTarget(...)` | `locator.waitFor({state,timeout})` | |
| `wait` enabled/disabled | `waitForTarget(...)` | custom `pollUntil` (100ms) on `locator.isEnabled()` | no native waitFor enabled/disabled |
| `wait` text/textGone | `waitForText(...)` | `page.getByText(text).waitFor({state})` | |
| `wait` time | `waitForTime(...)` | `page.waitForTimeout(timeMs)` | |
| `read` | `session.read()` | `page.locator('body').innerText()` | plain text, NOT markdown (Open Questions) |
| `press` | `session.press(...)` | `locator.press(key,{delay})` or `page.keyboard.press(key)` | |
| `pointer` | `dispatchPointer(...)` | `page.mouse.move/down/up/wheel`, `page.keyboard.down/up`, `page.waitForTimeout` | low-level interpreter |
| `screenshot` | `session.screenshot(...)` | `page.screenshot()` / `locator.screenshot({path,type,fullPage})` | mkdir + element+fullPage guard |
| `evaluate` | `session.evaluate(...)` | `page.evaluate` / `locator.evaluate` | function-or-expression shim |
| `runCodeUnsafe` | `session.runCodeUnsafe(...)` | `page.*` via `fn(page)` | compiles `(page)=>...`; JSON-sanitized result |
| navigate/back/forward/reload | session methods | `page.goto/goBack/goForward/reload` | |
| open/close tab | session methods | `context.newPage()` / `page.close()` | |
| resize | `session.resize(...)` | `page.setViewportSize({width,height})` | |
| focus | `focusSession(...)` | `page.bringToFront()` | |
| check/uncheck (parity) | new | `locator.check()` / `locator.uncheck()` | §6 |
| keydown/keyup (parity) | new | `page.keyboard.down/up(key)` | §6 |
| mousemove/down/up/wheel (parity) | new | `page.mouse.move/down/up/wheel` | §6 |
| highlight (parity) | new | `locator.highlight()` | §6 |
| pdf (parity) | new | `page.pdf({path})` | chromium headless only |

**`fillForm` boolean coercion:** bool as-is; number `!==0`; strings `1/true/yes/on/checked`→true, `0/false/no/off/unchecked`→false, else throws. `fillForm` iterates fields in order; any error → `FIELD_FAILED "Failed to fill form field ${name??target}: ${msg}" {index,name,target,type}` (stops at first failure).

**`shouldUseKeystrokeFill`** (in-page eval): true when element is `HTMLInputElement` AND (`type==='password'`, OR `inputMode ∈ {numeric,decimal,tel}`, OR `autocomplete` startsWith `cc-` or `=== 'one-time-code'`). Errors → false. `fillWithKeystrokes` clears with `Meta+A` on darwin / `Control+A` elsewhere (keyed off `process.platform` — Open Questions).

**`targetCenter(ref)`** = `locator.boundingBox()` center `{x+w/2, y+h/2}`; no box → `NOT_VISIBLE "Target has no visible bounding box: ${ref}" {target}`.

**`pointer` wheel:** `mouse.move(x,y)`; if `ctrlKey` → `keyboard.down('Control')`; `steps = max(1, floor(action.steps ?? 1))`; loop `steps`× `mouse.wheel(0, deltaY/steps)` with optional inter-step `waitForTimeout`; if ctrlKey → `keyboard.up('Control')` (Ctrl+wheel = pinch-zoom for canvas libs).

### 5.4 Canvas / React-Flow coordinate drag math — OPTIONAL plugin (§8)

`dispatchCanvasDrag`:
1. `t = readCanvasTransform(tab, {viewportSelector, paneSelector?})` → `CanvasTransformResult`. Null → `INVALID_TARGET "Canvas viewport not found for drag source ${id}." {target}`. In-page: parse `viewport` CSS `transform` via `DOMMatrixReadOnly` (fallback regex `matrix(a,b,c,d,e,f)`): `scale=m.a||1`, `translateX=m.e`, `translateY=m.f`; read `pane.getBoundingClientRect()`.
2. Destination in canvas space: `relativeTo` → `viewportToCanvas(targetCenter(relativeTo), t)` + `{dx,dy}`; else absolute `{x,y}`.
3. `destViewport = canvasToViewport(destCanvas, t)` where `canvasToViewport(cx,cy,t) = { x: paneLeft+translateX+cx*scale, y: paneTop+translateY+cy*scale }`. Inverse `viewportToCanvas(vx,vy,t) = { x:(vx-paneLeft-translateX)/scale, y:(vy-paneTop-translateY)/scale }` (`scale = t.scale||1`).
4. **Off-pane guard:** `isPointInsidePaneRect(destViewport, pane rect)` (inclusive). Outside → `DESTINATION_OUTSIDE_CANVAS` (message gives canvas point, viewport point, pan/zoom guidance; details `{target, destinationCanvas, viewport}`). **Never auto-pans** (a wheel pan reads as zoom in React Flow).
5. `fromCanvas = viewportToCanvas(source, t)`. `performCoordinateDrag(source, destViewport, config.canvasDragNudgePx)`.
6. `movedTarget = readMovedCanvasTarget(...)`: re-resolve source locator, `boundingBox()`, `movedPx = round(hypot((to.x-from.x)*scale,(to.y-from.y)*scale))`.
7. `moved = movedPx>=CANVAS_MOVED_THRESHOLD_PX (=3)` (the `changed` bit for drags, since canvas position is excluded from the snapshot signature). Result `{ sourceTargetId, coordSpace:'canvas', destinationCoords:{rounded x,y}, movedTarget?, moved? }`.

**`performCoordinateDrag(source, destination, nudge)`:** `mouse.move(source)`; `mouse.down()`; if `nudge>0` push past `nodeDragThreshold` then `to = destination+nudge`; `mouse.move(to, {steps:12})` (visuals-off) then `mouse.up()`. Playwright auto-carries `buttons=1` on interpolated moves. Default `canvasDragNudgePx=0`.

### 5.5 Dialog & file-chooser interruption model (Promise.race)

A click that opens an `alert/confirm/prompt` (blocks the action promise forever) or a native file chooser must not hang. Listeners registered at session start on `page.on('dialog')`/`page.on('filechooser')`; each fired event recorded (`dialogs[]`/`fileChoosers[]`, `pending*` maps).

**`runActionWithInterruptions(entry, action, watchFileChooser)`:**
- Snapshot `dialogAfterId/fileChooserAfterId = current lengths`; create waiters that resolve when a new record with `id > afterId` appears.
- If `watchFileChooser` (only for `click`): also `page.waitForEvent('filechooser',{timeout:250})` (belt-and-suspenders).
- `actionPromise = action()`; `winner = await Promise.race([settled, dialogResult, fileChooserResult, explicitFileChooserResult])`.
- `dialog` → park `actionPromise` in `dialogActions[id]`, return `{dialog}`. `fileChooser` → park in `fileChooserActions[id]`, return `{fileChooser}`. `error` → rethrow. `done` → re-check for an unhandled record that appeared during the action → return it; else `{}`.

**`handleDialog`:** `session.handleDialog(tab, {accept, promptText?})`: `firstPendingDialog` (none → `DIALOG_NOT_FOUND`); `accept ? dialog.accept(promptText) : dialog.dismiss()`; mark `{handled,accepted,promptText?,handledTimestamp}`; await the parked action promise. `DialogInfo`: `{id,tabId,type,message,defaultValue,timestamp,handled,accepted?,promptText?,handledTimestamp?,error?}`.

### 5.6 Network / console capture (per-page recorders)

- `page.on('console')` → `{tabId, level (debug→debug, warning→warning, error/assert→error, else info), type, text, timestamp, navigationIndex, location:{url,lineNumber,columnNumber}}`.
- `page.on('pageerror')` → `level:'error', type:'pageerror', text: stack??message`.
- `consoleMessages(query{level?,all?})`: filter to current `navigationIndex` unless `all`; keep `severity >= severityForConsoleLevel(level??'info')` (debug 10, info 20, warning 30, error 40).
- `page.on('request')` → `InternalNetworkRequest {index (1-based), method, url, resourceType, isNavigationRequest, timestamp, navigationIndex, request}`. `page.on('response')` fills response/status/statusText. `page.on('requestfailed')` → `failureText`.
- `networkRequests(query{filter?,includeStatic?,all?})`: drop non-current-nav unless `all`; drop successful static (status 200–399 AND resourceType ∈ {font,image,media,script,stylesheet}) unless `includeStatic`; `filter` regex over url (fallback `includes`).
- `networkRequestDetail(index, part?)`: not found → `NETWORK_REQUEST_NOT_FOUND`; with `part` (`request-headers|request-body|response-headers|response-body`) missing response → `NETWORK_RESPONSE_NOT_FOUND`; body read failure → `NETWORK_BODY_UNAVAILABLE`.
- `navigationIndex` increments on main-frame `framenavigated`; navigation requests get `navigationIndex+1` so the navigating request groups with the new page.

### 5.7 Evaluate / runCodeUnsafe

- `evaluate(tab, source, arg, targetRef?)`: with `targetRef` → `locator.evaluate(evaluateTargetInBrowser,{source,arg})` (calls `(source)(el, arg)` if a function, else evaluates `(source)` with `el`,`arg` in scope). Without → `page.evaluate(evaluatePageInBrowser,{source,arg})`. Result `{ tabId, result: result===undefined?null:result, undefinedResult?:true, targetId? }`.
- `runCodeUnsafe(tab, source)`: source must compile to `(page)=>...` else `INVALID_COMMAND`; `bringToFront`, set active, `fn(page)`, JSON-sanitize (`bigint→string, function→[Function name], symbol→string, circular→[Circular]`).

### 5.8 Flow-block gate (`flowBlockGate`)

Only for `act|fill|drag`. Collect `[targetId, sourceTargetId, destinationTargetId]`. None → null. Refresh snapshot; `flowLocked = targets.some(t => t.overlay && t.actionableNow)`. If locked, any referenced id whose target is `!overlay` → `FLOW_BLOCKED "target is blocked by active overlay flow: ${id}" {snapshotVersion, targetId}`. Prevents a drag smuggling a non-overlay source/dest while a modal flow is active.

### 5.9 Post-action insights & settle (OPTIONAL, §8)

`withActionInsights(result, feedback, screenMessages, changed, pendingRequired)` (each omitted when absent — see §8 for full algorithms). `settle`: re-snapshot; if `settleAfterActionMs<=0` return immediately (default OFF); else poll until quiescence (judged on version, volatile-excluded). Defaults: `settleAfterActionMs:0, canvasDragNudgePx:0, pointerAnimation:true, surfaceScreenMessages:true, detectUnmapped:true, surfaceRequiredFields:true`.

### 5.10 Error codes (`toCommandErrorCode`)

`TARGET_NOT_FOUND`, `INVALID_TARGET`, `NOT_VISIBLE`, `DESTINATION_OUTSIDE_CANVAS`, `CANVAS_PAN_FAILED`, `FLOW_BLOCKED`, `TIMEOUT`; `SESSION_NOT_ACTIVE`/`TAB_NOT_FOUND`→`SESSION_NOT_ACTIVE`; `MANIFEST_NOT_FOUND`/`INVALID_MANIFEST`→`INVALID_MANIFEST`; else `INVALID_COMMAND`. Generic `Error` with `name==='TimeoutError'`→`TIMEOUT`, else `INVALID_COMMAND`. `CommandErrorCode` union also includes `MACRO_*`, `REPEAT_INDEX_OUT_OF_RANGE`, `CONNECTION_LOST`, `CHROME_CRASHED`, `RECOVERY_FAILED`, `DIALOG_NOT_FOUND`, `FILE_CHOOSER_NOT_FOUND`, `NETWORK_*`.

---

## 6. CLI Command Surface & Parity Table

### 6.1 Entry point & dispatch

`bin/agrune.ts`: `runCli(process.argv.slice(2), { stdout, stderr })` → sets `process.exitCode`. `runCli` wraps `runCliOrThrow`; on throw `asCliError(error)`, writes `` `${err.code}: ${err.message}\n` `` to **stderr**, returns `exitCodeFor(err.code)`.

`runCliOrThrow(argv, io)`:
1. `parsed = parseArgs(argv)` → `{ command: string[], flags, positionals }`.
2. `command.length === 0` OR `--help` → write `helpText()` to stdout, return `0`.
3. Dispatch by `[primary, secondary] = parsed.command`.

**`parseArgs` algorithm:**
- `--` toggles `parsingFlags=false` (rest positional).
- `--name=value` (only if `=` index > 2) → `flags[name]=value`.
- `--name` → if next exists and not `-`-prefixed → `flags[name]=next` (consume); else `flags[name]=true`. **No short-flag (`-x`) handling.**
- First non-flag → `command[0]`. Second non-flag pushed onto `command` **only if** `command[0] ∈ {daemon, dialog, network, tab, tabs}`. Otherwise → `positionals`.
- `getStringFlag` → value if string else undefined. `getBooleanFlag` → true if `===true`, or string `!== 'false'`.

### 6.2 Output conventions

`writeResult(stream, value, flags)`: if `--json` → pretty JSON (2-space, trailing `\n`); **else also** `JSON.stringify(value, null, 2)\n`. **For most commands JSON-vs-text are identical.** `--json` only changes commands with a custom text formatter (console, network, dialogs, file-choosers, events, targets, snapshot, read, screenshot).

**Gaps vs playwright-cli:** no global `--raw`, no global `--version` (though `CLI_VERSION` exists internally).

**`--filename` / `--output`:** `outputFilenameFromFlags(flags)` = `--filename` ?? `--output` (non-empty required else throws `--<name> requires a value`). Two write paths:
- **Daemon-side** (`writeOutputFile`): `/evaluate`, `/console`, `/network`, `/network/request`, `/snapshot` — resolves abs path, `mkdir -p`, writes, returns `{ path }`.
- **CLI-side** (`writeTextOutputFile`): only `targets` writes locally (formatted snapshot text) then injects `path`.
When a `path` is produced and `--json` absent, text mode prints just the path line. Default screenshot path: `.agrune/runs/<ISO-with-:.→->/screenshot.{png|jpg}`.

### 6.3 Command catalog

Every browser command also accepts `--tab <id>` (positive int → `tabId`), `--host`/`--port` (TCP endpoint), `--json`. All routes are HTTP over the workspace unix socket (or TCP) in the current build; the lean rebuild moves to unix-socket JSON-RPC (§7).

**Daemon lifecycle (no auto-spawn here):**

| Command | Args/flags | Behavior | Output |
|---|---|---|---|
| `daemon start` / `daemon run` | `--headless`, `--port`, `--host` | `startDaemon(...)`; if socket, `writeSessionFile({pid,socketPath,workspace,startedAt,version})`; prints `Agrune daemon listening on <url>`; foreground until SIGINT/SIGTERM → `daemon.close()` + `removeSessionFile()` | text; exit 0 |
| `daemon stop` | — | `stopDaemon()` | `Stopped Agrune daemon (pid N).` or `No Agrune daemon session found...`; exit 0 |
| `daemon status` | `--json` | GET `/health` → `{ok,name:'agrune-daemon',browser:'playwright',tabs}` | pretty JSON |
| `daemon events` / `events` | `--json`, `--follow`(removed→throws) | GET `/events/history` | text `formatEventLine` or JSON |

**Navigation / page:** `open <url>` (POST `/open`); `navigate`/`goto <url>` (POST `/navigate`); `back`/`forward`/`reload`; `resize <w> <h>` (or `--width/--height`, positive ints). All `--tab`.

**Scripting:** `evaluate`/`eval <js>` (or `--expression`/`--function`; `--target`, `--arg <json>`, `--filename/--output`) → POST `/evaluate`. `run-code-unsafe`/`run-code <js>` (or `--code`; `--file`/`--filename`) → POST `/run-code-unsafe`.

**Introspection:** `console`/`console-messages` (`--level`, `--all`, `--filename/--output`); `network`/`network-requests` (`--filter`, `--static`, `--all`); `network request`/`network-request` (pos `<index>` or `--index`; `--part`); `dialogs`; `file-choosers`/`filechoosers`; `read` (**agrune extra**); `targets` (**agrune extra — manifest outline**, CLI-side `formatSnapshot`, see flags below); `snapshot`/`aria-snapshot` (`--target`, `--depth <n>` pos int, `--mode ai|default`, `--boxes`, `--include-text-content`/`--text`).

`targets` flags: `--mode outline|full`, `--full`, `--group <id>`, `--group-ids csv`, `--target <ref>`, `--text`/`--include-text-content`, `--filename/--output`, `--tab`, `--json`. `runTargets` sends `tabId, groupId, groupIds (repeated), target` to GET `/targets`; daemon calls `session.snapshot(tabId)` then `filterSnapshot(...)` server-side; CLI then `formatSnapshot(...)` and picks mode.

**Dialog & file-chooser:** `handle-dialog`/`dialog` (`--accept`|`--dismiss` or subcmd `dialog accept`/`dialog dismiss`, `--prompt-text`/`--promptText`) → POST `/dialog/handle`. `file-upload` (positionals = paths, empty cancels) → POST `/file-upload`.

**Tabs:** `tabs`/`tabs list`/`tab list`; `tabs new`/`tab new <url>`; `tabs focus`/`select`/`tab focus`/`select` (`<tabId>` or `--index`); `tabs close`/`tab close`/`close` (`[tabId]` or `--index`). `tabSelectorBody`: `--index` XOR tabId; both → throws "Use either --index or tabId, not both".

**Interaction verbs (all POST, all `--tab`):**

| Command | Aliases | Positionals | Flags | Route → body |
|---|---|---|---|---|
| `click` | | `<ref>` | `--button left\|right\|middle`, `--double-click`/`--doubleClick`, `--modifiers Alt,Control,ControlOrMeta,Meta,Shift` | `/click` `{target,action:'click',button,modifiers,doubleClick}` |
| `dblclick` | `double-click` | `<ref>` | (same) | `/click` `action:'dblclick'` |
| `right-click` | | `<ref>` | only `--button right` | `/click` `action:'contextmenu'` |
| `hover` | | `<ref>` | | `/click` `action:'hover'` |
| `fill` | | `<ref> <value...>` | `--append`, `--strategy insert\|keystroke\|auto` | `/fill` `{target,value,clear,strategy}` |
| `fill-form` | `fill_form` | — | `--fields <json>` or `--file <path>` | `/fill-form` `{fields}` (**agrune extra**; type ∈ textbox/checkbox/radio/combobox/slider) |
| `type` | | `<ref> <text...>` | `--submit`, `--delay <ms>` | `/type` `{target,text,submit,delayMs}` |
| `press` | `press-key` | `[ref] <key>` | `--target`, `--key`, `--delay` | `/press` `{key,target?,delayMs}` |
| `select` | `select-option` | `<ref> <value...>` | `--label`/`--index` (or `--mode value\|label\|index`) | `/select` `{target,values,mode}` |
| `upload` | | `<ref> <path...>` | | `/upload` `{target,paths}` |
| `drop` | | `<ref> [path...]` | `--data <json>`, `--text`, `--uri` | `/drop` `{target,paths,data}` |
| `drag` | | `<start-ref> [end-ref]` | `--to <end-ref>` | `/drag` `{startTarget,endTarget}` |
| `wait` | | `[ref]` | `--state visible\|hidden\|enabled\|disabled`, `--text`, `--text-gone`/`--textGone`, `--time <s>`/`--time-ms`, `--timeout <ms>` | `/wait` (exactly one of target/text/textGone/timeMs; default timeout 10000ms) |
| `screenshot` | | — | `--output <path>`, `--full-page`, `--target <ref>`, `--type png\|jpeg`, `--json` | `/screenshot` `{path,fullPage,target,type}` |

Unknown command → write `Unknown command: ...\n` to stderr, return `1`.

### 6.4 Exit-code mapping (`exitCodeFor`)

```
DAEMON_UNAVAILABLE | SESSION_NOT_ACTIVE          → 4
TARGET_NOT_FOUND   | INVALID_MANIFEST            → 3
(everything else: INVALID_COMMAND, TAB_NOT_FOUND,
 INVALID_TARGET, TIMEOUT, DIALOG_NOT_FOUND,
 FILE_CHOOSER_NOT_FOUND, NETWORK_REQUEST_NOT_FOUND,
 FIELD_FAILED, HTTP_ERROR, DAEMON_ALREADY_RUNNING,
 INTERNAL_ERROR)                                 → 1
```

Error string on stderr: `` `${code}: ${message}\n` ``. `CliError`/`AgruneBackendError` carries `{code, message, details?}`. `asCliError` coerces non-errors to `INTERNAL_ERROR`. Daemon `requestJson` maps non-2xx: reuses body `error.code`, else `HTTP_ERROR`; network/socket failure → `DAEMON_UNAVAILABLE`.

### 6.5 @playwright/cli PARITY TABLE

North star: implement **every** playwright-cli command; the only intended divergence is the perception layer. Status: **HAVE** / **RENAME** (add alias) / **MISSING** (build new).

**Lifecycle / context**

| playwright-cli | agrune status | Playwright public API (v1.59) |
|---|---|---|
| `open <url>` | HAVE | `browser.newContext()` + `context.newPage()` + `page.goto` |
| `attach <endpoint>` | MISSING (internal `mode:'attach'` exists) | `chromium.connectOverCDP(endpoint)` |
| `close` | HAVE (`close`/`tabs close`) | `page.close()` |
| `detach` | MISSING | disconnect CDP browser without killing Chrome |
| `delete-data` | MISSING | `context.clearCookies()` + `clearPermissions()` + per-origin storage clear, or recreate context |

**Navigation**

| `goto <url>` | HAVE (`navigate`/`goto`) | `page.goto` |
| `go-back` | RENAME (`back`) | `page.goBack()` |
| `go-forward`/`forward` | RENAME (`forward`) | `page.goForward()` |
| `reload` | HAVE | `page.reload()` |
| `resize <w> <h>` | HAVE | `page.setViewportSize()` |

**Element actions**

| `click`/`dblclick` | HAVE | `locator.click()`/`dblclick()` |
| `fill` | HAVE | `locator.fill()` |
| `type` | HAVE | `locator.pressSequentially()` |
| `hover` | HAVE | `locator.hover()` |
| `select` | HAVE | `locator.selectOption()` |
| `check` | MISSING | `locator.check()` |
| `uncheck` | MISSING | `locator.uncheck()` |
| `upload` | HAVE | `locator.setInputFiles()` / fileChooser |
| `drag`/`drop` | HAVE (`drag --to`; `drop`) | `locator.dragTo()` / DataTransfer drop |

**Keyboard / mouse primitives**

| `press <key>` | HAVE | `locator.press()`/`keyboard.press()` |
| `keydown <key>` | MISSING | `keyboard.down()` |
| `keyup <key>` | MISSING | `keyboard.up()` |
| `mousemove x y` | MISSING | `mouse.move(x,y)` |
| `mousedown` | MISSING | `mouse.down()` |
| `mouseup` | MISSING | `mouse.up()` |
| `mousewheel dx dy` | MISSING | `mouse.wheel(dx,dy)` |

**Perception / output**

| `snapshot` | HAVE (manifest-aware) | `locator.ariaSnapshot()` fallback + manifest outline |
| `screenshot` | HAVE | `page.screenshot()`/`locator.screenshot()` |
| `pdf` | MISSING | `page.pdf()` (chromium headless) |
| `eval` | HAVE (`evaluate`/`eval`) | `page.evaluate()`/`locator.evaluate()` |
| `run-code` | HAVE (`run-code-unsafe`) | `page.evaluate` of arbitrary source |
| `generate-locator` | MISSING | emit Playwright locator OR manifest target-ref (Open Questions) |
| `highlight` | MISSING | `locator.highlight()` |

**Dialogs**

| `dialog-accept` | RENAME (`dialog accept`/`--accept`) | `dialog.accept()` |
| `dialog-dismiss` | RENAME (`dialog dismiss`/`--dismiss`) | `dialog.dismiss()` |

**Tabs**

| `tab-list` | RENAME (`tabs list`) | `context.pages()` |
| `tab-new` | RENAME (`tabs new`) | `context.newPage()` |
| `tab-close` | RENAME (`tabs close`) | `page.close()` |
| `tab-select` | RENAME (`tabs select`/`focus`) | `page.bringToFront()` |

**Storage / state**

| `state-save [file]` | MISSING | `context.storageState({path})` |
| `state-load <file>` | MISSING | `browser.newContext({storageState})` (recreate context) |
| `cookie-list` | MISSING | `context.cookies()` |
| `cookie-get <name>` | MISSING | `context.cookies()` filtered |
| `cookie-set ...` | MISSING | `context.addCookies([...])` |
| `cookie-delete <name>` | MISSING | clear-all + re-add survivors (no single-delete API) |
| `cookie-clear` | MISSING | `context.clearCookies()` |
| `localstorage-*` | MISSING | `page.evaluate(()=>localStorage...)` |
| `sessionstorage-*` | MISSING | `page.evaluate(()=>sessionStorage...)` |

**Network**

| `network requests` | HAVE (`network`) | `page.on('request'/'response')` |
| `network request [parts]` | HAVE (`network request --part`) | `request.headers()`, `request.postData()`, `response.body()` |
| `route <glob>` | MISSING | `page.route(glob, handler)` + own registry |
| `route-list` | MISSING | track registered routes |
| `unroute <glob>` | MISSING | `page.unroute(glob)` |
| `network-state-set` | MISSING | `context.setOffline()` / CDP `Network.emulateNetworkConditions` |

**Console / diagnostics / runtime**

| `console` | HAVE | `page.on('console')` |
| `tracing-start`/`tracing-stop` | MISSING | `context.tracing.start()`/`stop({path})` |
| `video-*` | MISSING | `newContext({recordVideo:{dir}})`; `page.video()` |
| `show` | MISSING | bring trace/inspector UI to front |
| `pause-at`/`resume`/`step-over` | MISSING | `page.pause()` + step controller |

**Install / global**

| `install` | MISSING | shell `npx playwright install` |
| `install-browser <name>` | MISSING | `npx playwright install <browser>` |
| `list` | MISSING | enumerate active contexts/pages |
| `close-all` | MISSING | close all pages/contexts |
| `kill-all` | RENAME-ish (`daemon stop`) | terminate daemon + browser |
| global `--json` | HAVE (per-command) | n/a |
| global `--raw` | MISSING | suppress pretty-print / raw value |
| global `--version` | MISSING (`CLI_VERSION` exists) | print version |
| global `--help` | HAVE | `helpText()` |

**Net new (MISSING):** attach, detach, delete-data, check, uncheck, keydown, keyup, mousemove, mousedown, mouseup, mousewheel, pdf, generate-locator, highlight, state-save, state-load, cookie-{list,get,set,delete,clear}, localstorage-*, sessionstorage-*, route, route-list, unroute, network-state-set, tracing-start, tracing-stop, video-*, show, pause-at, resume, step-over, install, install-browser, list, close-all, global `--raw`/`--version`.
**Pure renames/aliases:** go-back→back, go-forward→forward, dialog-accept/dismiss, tab-list/new/close/select.

---

## 7. Daemon / Session Model

### 7.1 Endpoint derivation (`session-file.ts`)

- `workspacePath(cwd)` = `realpathSync(cwd)` (falls back to cwd).
- `workspaceHash(cwd)` = `sha256(workspacePath).hex.slice(0,12)`.
- `workspaceRunDir` = `~/.agrune/run/<hash12>`.
- `defaultSocketPath`: POSIX → `<runDir>/daemon.sock`; **win32 → `\\.\pipe\agrune-<hash12>`** (named pipe).
- `sessionFilePath` = `<runDir>/daemon.json`.
- Endpoint token (`getDaemonEndpoint`): `--host`/`--port` → `http://host:port` (`explicit:true`, validates 1–65535). Else `AGRUNE_DAEMON_SOCKET` env (non-blank) → `unix:<path>` (`explicit:true`). Else default → `unix:<defaultSocketPath()>` (`explicit:false`).

> **Lean rebuild target:** mirror playwright-cli — unix-domain socket with a length-prefixed JSON framer (~40 LOC, no `socketConnection` import) and a `daemon.json` registry under `<cacheDir>/agrune/daemon/<workspaceHash>/`. Drop the HTTP layer (~2,000 LOC). Confirm no consumer depends on HTTP/health endpoints (Open Questions).

### 7.2 Auto-spawn

For any non-`daemon` command with a **non-explicit** endpoint, `setDaemonAutoSpawn(() => ensureDaemon(endpoint.baseUrl, {headless}))`. The hook fires **lazily** on the first `requestJson` call (one-shot: nulled after first use) so arg-validation failures don't spawn a daemon.

- `ensureDaemon`: if `isHealthy` (GET `/health`, `ok===true && name==='agrune-daemon'`): read session file; **if `session.version !== CLI_VERSION` → version skew → `stopDaemon()` then `spawnAndWait`** (restart). Else unhealthy → `cleanupStaleState()` then `spawnAndWait`.
- `cleanupStaleState`: if session file exists and `isPidAlive(pid)` → SIGTERM (wedged), then `removeSocketFile` + `removeSessionFile`.
- `spawnAndWait`: `mkdir runDir`; `acquireLock(<runDir>/spawn.lock)` via `openSync(path,'wx')` (exclusive). If lock held: mtime age > `SPAWN_LOCK_STALE_MS`(60000) → steal; else just `waitForHealthy` (another invocation is spawning). On lock acquired: `spawn(execPath, [argv[1],'daemon','run', '--headless'?], {detached:true, stdio:'ignore', cwd})`, `child.unref()`. Then `waitForHealthy` (timeout 15000ms, poll 150ms). On failure, SIGTERM the child and rethrow. `finally rmSync(lockPath)`.
- `waitForHealthy` failure message points to `agrune daemon start`.

### 7.3 Stop (`stopDaemon`)

- Read session file; none → `{stopped:false}`.
- If `isPidAlive`: `SIGTERM`; poll up to 5000ms (100ms). If still alive: `SIGKILL`; poll up to 2000ms. Then `removeSocketFile(socketPath)` + `removeSessionFile()`. Return `{stopped:true, pid}`.

### 7.4 Daemon server (current HTTP; lean → socket)

- Single `PlaywrightSession({headless})` + `DaemonEventBroker`; `await session.start()`.
- `http.createServer`; `server.listen(socketPath)` (unix/pipe) or `listen(port,host)`. Stale-socket cleanup: if `socketFileExists(socketPath)` → if `socketAccepting` (net.connect probe, 1000ms) throw `DAEMON_ALREADY_RUNNING`; else `removeSocketFile` (avoid EADDRINUSE).
- All responses JSON (`sendJson`): success 200, error 400 `{ok:false, error:{code,message,details?}}`.
- `close()`: `server.close()`, `removeSocketFile`, `session.stop()`.

**Full route list (`routeRequest`):** `GET /health`, `/tabs`, `/events/history`; `POST /open`|`/tabs/new`, `/navigate`, `/back`, `/forward`, `/reload`, `/resize`, `/evaluate`, `/run-code-unsafe`|`/run-code`; `GET /console`, `/network`, `/network/request`, `/dialogs`, `/file-choosers`; `POST /dialog/handle`|`/dialog`, `/file-upload`|`/filechooser/upload`, `/tabs/focus`|`/tabs/select`, `/tabs/close`|`/close`; `GET /targets`, `/snapshot`; `POST /click`, `/fill`, `/fill-form`, `/type`, `/press`, `/select`, `/upload`, `/drop`, `/drag`; `GET /read`; `POST /wait`, `/screenshot`. Unknown → `throw Error('Unknown endpoint: METHOD path')` → 400.

### 7.5 Event ring buffer + redaction

- `DaemonEventBroker(bufferSize=500)`: `buffer` trimmed to last 500; `subscribe(listener)`; `nextId()` → `cmd-<ts>-<counter>`.
- `DaemonEvent`: `{id,ts,sessionId,tool,method,path,command,phase:'start'|'end'|'error',durationMs?,tabId,args?,error?}`.
- `shouldTrackRequest`: skips `GET /health` and `GET /events/history`. Emits `start` before, `end`(+durationMs)/`error`(+error) after.
- `safeEventArgs`: whitelists query params (tabId, level, all, filter, static, index, part, target, filename, depth, mode, boxes, includeTextContent). **Arg redaction:** for `/dialog/handle`, `/file-upload`, `/fill`, `/type`, `/run-code-unsafe` it sets `args.redacted=true` and never records the body (sensitive POST bodies are never parsed into events).

### 7.6 Cross-platform / Windows posture

- `defaultSocketPath` returns a **named pipe** `\\.\pipe\agrune-<hash12>` on win32; `http.request`/`server.listen` accept pipe paths via `socketPath`.
- `removeSocketFile` is a **no-op on win32** — pipes aren't filesystem-unlinkable; relies on the OS releasing the pipe when the server exits.
- `socketFileExists` returns **false on win32** → the stale-socket `socketAccepting` probe and EADDRINUSE pre-clean are **never run on Windows**. Cross-invocation stale detection on Windows leans entirely on `daemon.json` pid liveness (`isPidAlive` via `process.kill(pid,0)`).
- `removeSessionFile` / pid logic are cross-platform. No Windows-specific spawn handling beyond `detached:true`.

---

## 8. Optional Plugins

Core stays manifest-resolve + act + snapshot + sensitive-masking. The following ship behind flags / lazy import, each self-contained so removing it cannot break the core loop. **Visual fx are OFF by default.**

### 8.1 Self-heal — Target Re-Grounding from Author Intent (opt-in; env-gated)

When the selector ladder resolves 0 elements, re-ground the target from the author's *intent* (intended role, accessible name, visible text, human label/description). This is what selector-only QA healers lack.

**Pure core API (`self-heal.ts`):**
```ts
interface ObservedElement { index: number; role?: string; accessibleName?: string; text?: string }
interface RepairIntent { role?; accessibleName?; text?; label?; desc? }
interface RepairCandidate { index: number; score: number; matchedOn: string[]; proposedSelector: SelectorLadder; observed: ObservedElement }
type RepairDecision = 'auto' | 'propose' | 'none'
interface RepairOutcome { decision: RepairDecision; best: RepairCandidate | null; candidates: RepairCandidate[]; reason: string }
```

**Constants (DEFAULTS):** `autoThreshold = 0.82` (min top score to auto-apply); `proposeThreshold = 0.5` (min to surface); `maxCandidates = 5`; `marginForAuto = 0.12` (top must beat runner-up by ≥ this); `allowAuto = true`; `sensitive = false` (overridden per-target).

**`intentFromTarget(target)`:** `role ← selector.role?.name`, `accessibleName ← selector.role?.level`, `text ← selector.text`, `label ← target.name`, `desc ← target.desc`.

**`similarity(a, b) → [0,1]`:** normalize (lowercase, collapse whitespace, trim; null→''); either empty → 0; exact → 1; substring containment → 0.85; else Jaccard token overlap (`inter/union`; empty set → 0).

**`nameSimilarity`:** max `similarity` over intent name signals `[accessibleName, text, label, desc]` × observed names `[accessibleName, text]`.

**`scoreCandidate`:** `hasRoleIntent = normalize(intent.role).length > 0`. If role intent: `roleMatch` = exact normalized equality (push `'role'`); `score = (roleMatch ? 0.4 : 0) + 0.6 * nameSim`. **Name dominates (0.6) over role (0.4)**; a role MISMATCH caps score at `0.6`; same-role with unrelated name scores ≤ `0.4` (below propose floor). Else `score = nameSim`. If `nameSim ≥ 0.6` push `'name'`. Round to 3 decimals.

**`rankRepairCandidates`:** filter `score ≥ proposeThreshold`, sort desc, slice `maxCandidates`. Empty → `{decision:'none'}`. `unambiguous = !runnerUp || best.score - runnerUp.score ≥ marginForAuto`. Decision order: `sensitive` → `propose` (NEVER auto-applied); `!allowAuto` → `propose`; `best.score ≥ autoThreshold && unambiguous` → `auto`; else → `propose`.

**Impure scan (`attemptSelfHeal`):** `selfHealEnabled` ON unless `options.selfHeal === false` OR `AGRUNE_SELF_HEAL === 'off'`. Scan locator: `page.getByRole(roleName)` if role else `page.locator('a, button, input, select, textarea, summary, [role], [tabindex]')`. **`cap = Math.min(total, 40)`**. For each `scanLocator.nth(index).evaluate(...)` read `{role, accessibleName (≤160), text (≤160)}`. `auto && best` → `scanLocator.nth(best.index)`.

**Limits (preserve):** not persisted (the disk manifest is never rewritten; `proposedSelector` is only surfaced); per-instance, no cross-call caching; scan cap 40; name cap 160; no model in the loop (pure deterministic scoring).

**Reporting:** `reportRepair` → `RepairReport`; if `onRepair` callback set call it, else stderr `[agrune:self-heal] {auto-repaired|repair proposed for} "{ref}" ({targetId}): {reason}`. `serializeRepairOutcome` → `{decision, reason, candidates:[{score, matchedOn, name, proposedSelector}]}`.

### 8.2 Deterministic Action Feedback (opt-in bundle, individually gated)

Assembled after every command, folded by `withActionInsights`. Fields: `feedback?:string`, `screenMessages?:string[]`, `changed?:boolean`, `pendingRequired?:string[]`. Each omitted when N/A.

**The `changed` bit (`actionChanged`):** `before` = pre-action baseline. `drag` → `result.moved` (else null). Not `{act, fill}` → null. No `before` → null. Else `changed = (after == null) || (after.version !== before.version)` — snapshot VERSION delta. (Signature mechanics in §4.4.)

**Manifest-authored feedback (`actionFeedback`):** if `changed === null` or no `before` → null. `actedId = result.targetId ?? result.sourceTargetId`. Find acted target in `before.targets` (pre-action). `message = changed ? entry.onSuccess : entry.onNoEffect`; return if non-empty. Gated on the REAL change bit, not "didn't throw".

**Screen-delta a11y messages (`screen-delta.ts`):** surfaces app-authored validation errors/toasts not authored as targets. Capture `page.locator('body').ariaSnapshot()` split on `\n` (`[]` on failure), only when `surfaceScreenMessages`. `AX_MESSAGE_LINE = /^-\s+(text|alert|status|heading|note|caption|tooltip):/i` (informational kinds; interactive controls excluded). `axMessageDelta(prev, cur, exclude)`: new lines matching the pattern, strip `- kind: ` via `replace(/^-\s+\w+:\s*/,'')`, trim, dedup, drop excluded; **return `out.slice(0,6)`**. Volatile exclusion: pass the live `textContent` of every `volatile && textContent` target as `exclude`.

**Required-field nudge (`required-nudge.ts`):** `pendingRequiredFields(targets, limit=8)`: keep when `required && visible && !hasValue && actionKinds.includes('fill')`; name = `target.name.trim()`; dedup; cap 8. `required` source: `fillable && (el.required === true || aria-required==='true')`, OR'd with manifest `required`. Driver gate: `[]` unless `surfaceRequiredFields` AND `kind ∈ {act, fill}` AND `after` exists.

**`settle()` async-effect quiescence (default OFF, `settleAfterActionMs:0`):** `refreshSnapshot`; if budget ≤ 0 return immediately. Else poll every `min(50,budget)`ms until deadline: once a version change is observed, return when it next stabilizes; if nothing ever changes, wait out the full budget (capture debounced effects). Quiescence judged on VERSION (volatile-excluded). In a lean rebuild prefer Playwright auto-waiting (`expect.toPass`/`waitFor`) over the hand-rolled poll.

### 8.3 Unmapped-Control Detection (opt-in, default-ON candidate; perf-sensitive)

`detectUnmapped(page, manifest, limit=8)` — pure set-difference; no model.

```ts
interface UnmappedTarget { ref: string; selector: string; verb: 'fill'|'click'; name: string }
```

Algorithm:
1. **Mark covered:** for every group target `resolveLocator`, repeat target `resolveLocatorMulti`; set `data-agrune-cov="1"` on up to max (**20 direct, 40 repeat**) elements. Drifted selectors cover nothing.
2. **Active region:** `[role="dialog"]` (`.last()` if present) else `body`.
3. **Enumerate** `INTERACTIVE_SELECTOR = 'button, a[href], input, select, textarea, [role="button"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [contenteditable=""], [contenteditable="true"]'` within region via `evaluateAll`, first **80** nodes. Skip covered (`data-agrune-cov="1"` or `.closest(...)`), `display:none`/`visibility:hidden`/zero-area. `isFill` = (`input` type ∉ {button,submit,checkbox,radio,file,range}) OR `textarea` OR `role="textbox"` OR `isContentEditable` → `verb:'fill'` else `'click'`. `name` = first non-empty of `aria-label, placeholder, title, labels[0].textContent, textContent`, collapsed, **`.slice(0,60)`**. `selector` precedence: `#${CSS.escape(id)}` → `[data-testid="..."]` → `${tag}[name="..."]`; if none → **DROPPED**.
4. **Cleanup:** remove all `data-agrune-cov`.
5. **Assign refs:** `found.slice(0, limit)` → `{ ref: 'x'+(i+1), ...info }` (`x1, x2, …`).

**Wiring:** `augmentWithUnmapped` records in `unmappedRegistry: Map<tabId, Map<ref, UnmappedTarget>>`, grafts synthetic targets under `UNMAPPED_GROUP_ID = 'unmapped'`. Runs AFTER the manifest snapshot, so `snapshot.version` reflects only the mapped screen. `resolveTargetLocator` resolves a raw ref directly via `page.locator(unmapped.selector).first()`. Raw refs are unstable across turns. **Perf note:** re-resolves every manifest target on every snapshot and compounds with `settle` polling — make it cheaply disablable (consider flipping default to OFF — Open Questions).

### 8.4 Sensitive Masking (ALWAYS-ON, NOT optional — fails safe)

Security-load-bearing; cannot be dropped without leaking secrets into snapshots/signatures/logs.

**Heuristic (`isSensitiveEl(target, manifestFlag)`) — OR-combined, short-circuit true:**
1. `manifestFlag === true` (OR-only — can SET but never CLEAR; schema enforces `sensitive?: true`).
2. `input[type=password]`.
3. `autocomplete ∈ {current-password, new-password, one-time-code, cc-number, cc-csc, cc-exp, cc-exp-month, cc-exp-year}`.
4. `placeholder` matches `SENSITIVE_WORD_BOUNDARY = /\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i`.
5. `name` attr matches `SENSITIVE_NAME_ATTR = /(?:^|[_\-\s.])(?:password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)(?:[_\-\s.]|$)/i`.
6. `id` attr matches the same name-pattern.
7. `aria-label` multilang exact/token match against `{비밀번호, 패스워드, 핀번호, 보안코드, パスワード, ぱすわーど, 暗証番号, 密码, 口令, 密碼, mot de passe, passwort, kennwort, contraseña}` OR word-boundary regex.
8. else false.

(English word-boundary regex is core; the multilingual set is a low-priority extension.)

**Masking surfaces (3+1):**
1. **Snapshot value:** `valuePreview = fillable && !sensitive ? el.value : null`. `hasValue = fillable ? el.value.length > 0 : false` (presence-only, survives masking). `reason = 'sensitive'` when `fillAction && sensitive`.
2. **Snapshot signature:** includes `sensitive` and `hasValue` but `valuePreview` is `null` for sensitive — a secret fill bumps `version` without leaking.
3. **Logs:** request bodies for `POST /fill`, `/type`, `/dialog`(+`/dialog/handle`), `/file-upload`(+`/filechooser/upload`), `/run-code-unsafe`(+`/run-code`) marked `args.redacted = true` — blanket per-endpoint (independent of the per-field heuristic; non-sensitive values are also redacted from logs — Open Questions).
4. **Self-heal:** `target.sensitive` → never auto-applied.

### 8.5 Visual Runtime — Cursor Flight + Aurora Glow (COSMETIC; OFF BY DEFAULT in lean build)

By the code's own admission ("pure decoration"; "the real input is the synthetic page.mouse; this just visualizes"). Real actions are executed by Playwright (`page.mouse`, `locator.click/fill`); the cursor only *visualizes* the pointer. Disabling yields "identical landing, no added latency."

**What it does:** animated cursor flies to target center (`easeOutCubic`, default `pointerDurationMs:600`) + press/ripple (shrink to 0.85 over `CURSOR_CLICK_PRESS_MS=100`, ripple, release). Cursor styles `default` (75×75) / `orb` (48×48). z-index `2147483647`, `pointer-events:none`. Aurora glow: fixed full-viewport border-glow via `ai-motion` WebGL2 (`Motion({ mode: theme, borderWidth:2, glowWidth:800, borderRadius:0 })`), z-index `2147483646`, themes `light|dark`; WebGL2-unavailable contexts silently skip. `IDLE_TIMEOUT_MS = 5000`.

**Injection:** `@agrune/runtime` compiled to IIFE `visual-runtime.global.js` exposing `window.__agrune_visual__`. `connect()` → `context.addInitScript(expr)` + `page.evaluate(expr)` on existing pages. Missing bundle → silently disabled. Per `act`, `animatePointerForTarget` runs BEFORE the real click; drags glide concurrently.

**Latency:** when on, each `act` awaits ~`pointerDurationMs`+~100ms BEFORE the real click; drag awaits a ~280ms glide — REAL added wall-clock. When off → identical landing, no latency.

**Lean decision:** **DROP from the default install.** If shipped at all, a strictly-optional `agrune-visual` add-on (separate package / optional peer dep so `ai-motion`/WebGL2 stay out of the core dependency tree), default OFF, with a hard guarantee it never sits on the action critical path. `pointerAnimation` default flips to `false` (or the runtime is simply absent) in the lean core.

### 8.6 Runtime config knobs

`pointerDurationMs:600, pointerAnimation:true, cursorName:'default', auroraGlow:true, auroraTheme:'light', surfaceScreenMessages:true, detectUnmapped:true, settleAfterActionMs:0, surfaceRequiredFields:true`. Merged via `normalizeRuntimeConfig`/`mergeRuntimeConfig`. Self-heal toggled via `PlaywrightSessionOptions.selfHeal` and `AGRUNE_SELF_HEAL=off`. **In the lean rebuild the visual defaults (`pointerAnimation`, `auroraGlow`) flip OFF.**

### 8.7 Manifest-Drift Detection + Scoped a11y Fallback (DEFAULT-ON; `AGRUNE_DRIFT=off`)

The resilience net for "the app changed and the manifest is now stale on this screen." Where §8.1 self-heal re-grounds ONE drifted target, this detects a screen-wide stale manifest and hands the agent the live a11y escape hatch so it degrades to pwcli-level instead of hard-failing.

**Detection is a PURE function over the `PageSnapshot` the core already built** (`detectManifestDrift(snapshot, baseline)`) — every `PageTarget` already carries `domResolved`, so there is **zero extra DOM work** on the happy path.

**Drift = regression from a high-water-mark, NOT a low ratio (the false-positive guard).** The manifest covers the WHOLE app, but any one screen — and any one *step* of a multi-step UI — realizes only a slice. Flagging on raw `missing/total` false-fires on every wizard/accordion/tab: step 1 legitimately has steps 2–3 absent (observed derailing a real agent run — it nearly abandoned the working manifest path for raw a11y). Instead the session tracks, per `(url, groupId)`, the **most direct targets that group has ever resolved here** — its baseline. A group is flagged only when, while still **engaged** (≥1 direct target resolves) and with `baseline ≥ minTargets` (default `3`), its current `resolved` has fallen to `≤ (1 − ratioThreshold) × baseline` (default `ratioThreshold 0.5`). A progressive UI never accumulates a high baseline (its steps never resolve at once), so it never trips; a genuinely redesigned screen — a group that *used* to resolve N and now resolves far fewer — does. Repeat instances are excluded (an empty list is not drift). `detectManifestDrift` is pure and receives the baseline; the session owns `TabEntry.driftBaseline` (keyed `${url}\t${groupId}`) and folds each fresh snapshot back in via `updateDriftBaseline`.

**Limitation (honest).** Drift is a *within-history* regression: a group seen broken on its very first read has no healthy baseline to fall from, so it isn't flagged at perception time (the agent discovers that via a failing action instead). A TOTAL wipe (0 resolved) reads as "left the screen" and is skipped. Cross-session drift (the app changed between daemon runs) is the manifest-store's job (§12), not this sensor's.

**Surface (algorithm detects, agent decides).** On confirmed drift, `GET /targets` attaches `drift: DriftReport` AND, captured once at that moment, the full-page `ariaFallback` (the §4.4 escape hatch). The CLI appends a `⚠ MANIFEST DRIFT` notice + the a11y to the `targets` text so the agent re-orients in the SAME response — no extra round-trip, no thrashing on dead targets. **Healthy screens pay nothing** (no `drift` field, no a11y capture); only the rare stale screen pays the full-a11y cost — strictly ≤ pwcli, which pays it every look. The core never rewrites the manifest.

---

## 9. Distribution

- **Published package:** public `agrune` on npm (no scope). `npx agrune` and `npm i -g agrune` both work. Track Playwright via `^1.59`.
- **`bin`:** `{ "agrune": "dist/bin/agrune.js" }`. `bin/agrune.ts` is a 3-line shim (`#!/usr/bin/env node` + dynamic import of `dist/src/program.js`).
- **Bundler:** single `tsup.config.ts`, `format:['esm']`, `target:node18`, two entries — `bin/agrune.ts` and `src/program.ts`. `playwright` stays `external` (runtime dep, not bundled). No per-package build chain.
- **`files`:** `["dist", "src/skill/SKILL.md", "README.md"]`.
- **Browser bootstrap:** `agrune install` shells out to Playwright's own installer — `npx playwright install chromium` (child process; no vendored browser-download logic). On first `open`, if the browser is missing, catch the launch error and print the exact `agrune install` hint.
- **Bundled agent SKILL.md:** ship `src/skill/SKILL.md` (frontmatter `name: agrune`, `allowed-tools: Bash(agrune:*) Bash(npx:*)`) documenting the verb set, manifest targeting, and the snapshot→ref→act loop — mirrors playwright-cli's `skill/SKILL.md`. Optionally `agrune install --skills` copies it into the workspace agent dir.
- **Daemon lifecycle commands** (client-side): `agrune open [url]`, `agrune close`, `agrune list`, `agrune close-all`, `agrune kill-all`, `agrune install`. Default verbs auto-spawn the daemon if absent.
- **Semver:** `CLI_VERSION` injected at build (`__AGRUNE_CLI_VERSION__`, default `'0.0.0'`); surfaced via a new global `--version` (parity gap) and used for daemon version-skew restart (§7.2). The daemon's `daemon.json` carries `version`; an invocation whose `CLI_VERSION` differs restarts the daemon.
- **LICENSE:** ship a license file in the published package (set the `license` field in `package.json` accordingly).

---

## 10. Rebuild Plan & LOC Budget

### 10.1 What is DROPPED from the current ~10,611 LOC

| Dropped | Current LOC | Why |
|---|---|---|
| `packages/runtime/*` (cursor-animator, dom-utils, visual-runtime, ai-motion dep) | 1,114 | Pure visual flourish. → optional `visual` plugin, not core. |
| `backend/page-functions.ts` DOM heuristics (visibility/covered/overlay/sensitive) | 555 | Reinvents `locator.isVisible()`/`ariaSnapshot()`/actionability. → public API + keep only the sensitive heuristic + reason/covered logic. |
| `backend/playwright-session.ts` god-object | ~1,400 of 1,742 | Re-implements tab registry, console/network/dialog buffers, snapshot caching. → `session.ts` + `page.on(...)` listeners. |
| `backend/snapshot.ts` repeat/canvas/coord machinery | ~250 of 423 | Virtualized rows, canvas pan/zoom coord conversion = niche. → outline + a11y fallback + dom repeats only. |
| `core/driver.ts` + `core/index.ts` canvas transforms, big type barrel | ~600 of 955 | Types collapse into one package; canvas math dropped with canvas. |
| `manifest/codegen.ts`, `builders.ts` | 169 | Authoring/codegen is authoring-time, not runtime CLI. |
| `manifest` macros (macroId, circuitBreaker, MacroStep) | ~120 | Macro orchestration is the agent's job; drop from runtime schema. |
| `cli/cli.ts` if/else ladder (1,355), `cli/types.ts` (302), `cli/events.ts`, `daemon-client`/`daemon-manager` HTTP layer | ~2,000 of 3,257 | → declarative `commands.ts` table + socket `session.ts`; HTTP daemon → unix-socket JSON-RPC. |
| `backend/self-heal.ts`, `required-nudge.ts`, `screen-delta.ts`, `unmapped.ts`, `visual-effects.ts` | ~498 | Self-heal → plugin; nudge/delta shrink into `snapshot.ts`; visual-effects gone with runtime. |
| `packages/bench`, `packages/e2e` | (excluded) | Not shipped; keep dev-only, out of the published package. |
| Inter-package `@agrune/*` wiring, 6× tsup configs, build-order scripts | n/a | Removed by single-package collapse. |

Net: **~10,600 → ~1,470–1,525** core LOC; visual plugin (~300) and self-heal plugin (~120) live outside the default install.

### 10.2 Manifest contract KEPT (the only essential differentiator)

Keep the v3 schema **minus** macros/codegen/canvas. Essential per target: `targetId`, `selector: SelectorLadder` (≥1 rung), `actionKinds`. Cheap-high-value kept: `name`, `desc`, `sensitive: true` (OR-only literal), `onSuccess`/`onNoEffect`, `volatile`, `required`. Dropped from runtime schema: `macros`, `canvas`/`CanvasConfig`, codegen builders. `repeats` kept behind a flag if load-bearing (Open Questions). The `attr`/`css` guards (`assertNoHashClass`, `assertNoNthChild`) stay — they are the durability contract. The selector-ladder resolver (role→text→testId→attr→css, first non-empty `count()` wins, `.first()` narrow; `resolveLocatorMulti` for repeats) is the irreplaceable IP and stays verbatim.

### 10.3 Ordered milestones

1. **M0 — Skeleton & guardrails.** Single package; `tsup` two-entry build; `bin/agrune.ts` shim; `errors.ts` (code→exit-code map); `eslint no-restricted-imports` + `verify:no-internals` CI gate (public-API-only invariant). Empty `program.ts` dispatch + `helpText()`/`--help`.
2. **M1 — Daemon + session transport.** `registry.ts` (workspace hash, run dir, `daemon.json`, GC); `session.ts` (connect socket, `run`/`stop`/`canConnect`); `daemon.ts` (`net.createServer`, ~40-LOC length-prefixed JSON framer, spawn one `chromium` context/page, auto-spawn + version-skew restart + spawn-lock + Windows pipe posture). `agrune open/close/list/daemon start/stop/status`.
3. **M2 — Manifest contract.** `manifest.ts` (v3-lite zod schema + `validateManifest` Zod pass + forbidden-selector pass + OR-only `sensitive` lock + keyFrom compile gate). `resolver.ts` (`loadManifestFromPage`, `routeApplies`, `buildLocatorCandidates`, `resolveLocator`/`resolveLocatorMulti`, `findTargetLocator`, `resolveTargetLocator`, repeat ref grammar `normalizeAgentTargetId`/`toAgentTargetRef`, raw-CSS fallback). Sensitive masking always-on.
4. **M3 — Snapshot & outline.** `snapshot.ts` (`buildSnapshotFromManifest`, `SnapshotStore` signature/version gate, `filterSnapshot`/`resolveTargetFilter`, `formatSnapshot` verbatim outline/full grammar, a11y fallback pass-through to `ariaSnapshot`). `targets` and `snapshot`/`aria-snapshot` commands.
5. **M4 — Core actions (playwright-cli parity, HAVE set).** `commands.ts` declarative table mapping each verb to the Playwright public-API call (§5.3): click/dblclick/right-click/hover/fill/type/press/select/upload/drop/drag/wait + navigate/back/forward/reload/resize/screenshot/evaluate/run-code-unsafe/read/console/network/dialogs/tabs. Dialog & file-chooser interruption model (`runActionWithInterruptions`). Console/network recorders. `flowBlockGate`.
6. **M5 — Parity MISSING set.** check/uncheck, keydown/keyup, mousemove/down/up/wheel, pdf, highlight, generate-locator, attach/detach/delete-data, state-save/load, cookie-*, localstorage-*/sessionstorage-*, route/route-list/unroute, network-state-set, tracing-*, video-*, show, pause-at/resume/step-over, install/install-browser, list/close-all/kill-all, global `--raw`/`--version`. Add rename aliases (go-back, go-forward, dialog-accept/dismiss, tab-list/new/close/select).
7. **M6 — Optional plugins.** `feedback` (changed bit + onSuccess/onNoEffect + screen-delta + required-nudge), `self-heal` (env-gated), `unmapped` (gated, perf-tuned default), `settle` (off). `agrune-visual` add-on (separate package, default off).
8. **M7 — Distribution & SKILL.** `agrune install` (npx playwright install), missing-browser hint, bundled `SKILL.md`, `agrune install --skills`, LICENSE, semver injection + `--version`. Re-port `bench`/`e2e` as dev-only to validate the token outline and the verbatim snapshot grammar.

LOC budget per module: see §2.5.

---

## 11. Open Questions (consolidated)

**Manifest contract**
1. Is `actionKinds` enforced at execution time, or purely advisory/for-codegen? There is no observed runtime check that a `actionKinds:['click']` target rejects a fill. Confirm intended enforcement.
2. `role.level` is a documented misnomer (carries the accessible NAME, passed as Playwright `{ name }`). Rename to `accessibleName`/`role.name2` in the lean rebuild, or keep the wire field name `level` for manifest compatibility?
3. `containerSelector` on a repeat is resolved but `inspectRepeatTarget` calls `resolveLocatorMulti(page, target.selector)` on PAGE scope, not container scope — `containerSelector` appears used only for virtualized `logicalSize`. Is container-scoped enumeration intended/missing, or is page-scope-by-selector deliberate?
4. No cap on number of groups/targets/macros (only `REPEAT_MAX_INSTANCES=1000`). Add a manifest-level size bound given the page-controlled trust boundary?
5. Under strict CSP, the keyFrom compile gate is skipped AND page execution fails, degrading every key to `__idx_N` (index-only — the very thing the gate forbids). Acceptable, or require a non-eval keyFrom mode (e.g. attribute-name reference) for CSP apps?
6. `sourceFile/sourceLine/sourceColumn` are hardcoded `'page-manifest'/0/0` for page-loaded manifests. Is source-mapping back to the authored `manifest.ts` planned, or intentionally dropped for page-exposed manifests?

**Snapshot & outline**
7. `formatSnapshot` re-filters client-side while the daemon already filtered server-side. Confirm intentional/idempotent and which side is authoritative. (Proposal: filter once, server-side; CLI only selects mode.)
8. Outline+targetRef: a `--target` without a group forces full mode, so outline counts are moot. Confirm outline+targetRef is not a supported combination.
9. The lean rebuild's locator strategy (getByRole/getByTestId) may not be a `SelectorLadder` — bump `schemaVersion` or keep the ladder shape as the wire format?
10. The signature excludes name/description/selector/center/size, so a relabeled or moved button mid-flow does not bump version. Confirm this is desired for the change-gate.
11. `agrune snapshot --boxes` is plumbed through the daemon and echoed but doesn't appear to affect `ariaSnapshot` output — wired anywhere or vestigial?
12. Unmapped synthetic targets use the discovered `ref` directly as `targetId` (`sourceFile:'unmapped'`); confirm these never collide with manifest targetIds or repeat-delimiter syntax through `formatSnapshot`.

**Resolution & actions**
13. `read` returns `page.locator('body').innerText()` (plain text), but the prompt says "read=markdown" — does markdown conversion happen in a higher layer (renderer) or is it a spec aspiration not yet implemented?
14. `longpress` = `locator.click({delay:650})` (long mouse-button hold), not a touch long-press. Confirm 650ms and mouse-hold semantics.
15. `fill` keystroke clear uses Meta+A on darwin / Control+A elsewhere keyed off `process.platform` (Node host OS), not the browser/page OS — on a remote/attach browser this may pick the wrong shortcut. Confirm.
16. `watchFileChooser` only fires for `action==='click'` with a fixed 250ms `waitForEvent` timeout; a slow/non-click chooser relies on the recorder. Is 250ms sufficient?
17. `canvasDragNudgePx` default 0, nodeDragThreshold compensation opt-in. Auto-detect React Flow's `nodeDragThreshold` or keep config-driven?
18. `pointer` wheel toggles Control via `keyboard.down/up` around the loop to emulate pinch-zoom — intended vs sending a real `{ctrlKey:true}` wheel event?
19. `select` at the driver only passes `{value}`; the session supports `{label}/{index}`. Expose label/index selection in the lean action schema?

**CLI & daemon**
20. `state-load`/`delete-data` require rebuilding the `BrowserContext`, but agrune holds a single long-lived context with registered listeners and a tab registry. Does parity mean per-context recreation (losing open tabs/listeners) or per-tab storage scoping? Need a context-lifecycle decision.
21. Exact playwright-cli command grouping/arg shapes (e.g. `network requests` parent/sub vs flat `network-requests`) could not be verified from source (no `@playwright/cli` installed; only `.playwright-cli` snapshot `.yml` outputs present). Confirm shapes before parity work.
22. Does the north star require byte-identical flag names/shapes (`go-back` vs `back`, `tab-list` vs `tabs list`, `dialog-accept` vs `dialog accept`)? Aliases sufficient, or rename primaries?
23. `generate-locator`: emit a Playwright CSS/role locator (true parity) or a manifest target-ref (on-brand)? Semantically different outputs.
24. Windows named-pipe stale-detection gap (no `socketAccepting`/EADDRINUSE pre-clean; pid-liveness only). Is Windows a supported v1 target, and does pid-only stale detection need hardening before parity work?
25. `--raw`/`--version` semantics: `--raw` (raw value vs current pretty-JSON-always) is unspecified — need the exact intended output shape.
26. `attach`: is driving the user's real Chrome (with their cookies/session) an intended workflow given agrune's security-scoped manifest posture?

**Transport / packaging**
27. Switching from HTTP daemon (host/port + `AGRUNE_DAEMON_SOCKET`) to socket+registry JSON-RPC (drops ~2k LOC) — confirm no consumer depends on HTTP/health endpoints or `daemon events --json` polling.
28. Are dynamic repeat rows (`repeatId[key=k].base`) load-bearing for real manifests or gold-plating? Need a count of real manifests using repeats to decide resolver-core vs plugin vs drop.
29. Browser support: lock to chromium-only (matches today's `import { chromium }`) or keep the `--browser firefox/webkit/msedge` surface? Multi-browser adds launch-matrix branching.
30. SKILL.md ownership: should `agrune install --skills` write into the workspace agent dir, and which conventions (`.claude/skills`, `.agents`) must it target?
31. Does the rebuild need `run-code-unsafe` / raw `page.evaluate(arbitraryFn)` in core, or gate it behind a flag/plugin? It is the one verb that bypasses the manifest contract.
32. Visual plugin packaging: separate npm package `agrune-visual` vs optional dependency loaded by flag — affects whether `ai-motion` (WebGL2) stays in the dependency tree.

**Plugins / feedback**
33. Self-heal `proposedSelector` is computed but never persisted — intended write-back path (rewrite the ladder on auto-repair) or propose-only by design?
34. Self-heal scan re-runs on every `resolveTargetLocator` (no caching) — O(instances × 40 round-trips) for drifted repeats. Per-snapshot scan cache acceptable, or is freshness required?
35. `detectUnmapped` re-resolves every target every snapshot and compounds with `settle` — keep default-ON or flip to off-by-default for perf?
36. Screen-delta volatile exclusion is by literal text match; sub-refresh self-ticking values can still skew. Feasible to match by target identity (ariaSnapshot loses the manifest mapping)?
37. Sensitive heuristic multilang set is hardcoded (ko/ja/zh/fr/de/es). Make it data-driven/extensible, and make the English word list configurable to reduce false positives (e.g. "security question")?
38. Log redaction is blanket per-endpoint (independent of the per-field heuristic — non-sensitive fill values are also redacted). Confirm coarse policy vs heuristic-only redaction.
39. `actionChanged` treats `after == null` (snapshot capture failed) as `changed = true`. Confirm fail-as-changed is intended (vs null/unknown), since it can emit a false `onSuccess`.

---

## 12. Manifest Lifecycle & Self-Repair (ROADMAP — post-core)

> **Status: ROADMAP, NOT YET BUILT.** §8.7 drift detection is the SENSOR this layer consumes; it is already implemented. This section is the design of record for the manifest's full lifecycle — a static file shipped with the app becomes a **versioned, externally-managed, self-repairing artifact**. Motivation: amortize the one standing objection to agrune's thesis (manifest **curation cost**) via an automated **sense → fetch → escalate → repair → verify → publish** loop. Curation is bootstrapped by humans, then maintained by the loop.

### 12.1 The resilience ladder (severity → recovery)

| Severity | Recovery | Status |
|---|---|---|
| Target-level drift (one ref) | §8.1 self-heal — deterministic, in-process, instant | **BUILT** |
| Screen-level drift | §12.2 fetch the latest manifest from the store — automated, seconds | ROADMAP |
| Store miss (no fresh manifest) | §8.7 a11y escape-hatch keeps the agent working NOW, degraded | **BUILT** |
| Durable fix needed | §12.3 ticket → §12.4 autonomous repair → verify → publish | ROADMAP |

**Invariant: the system NEVER hard-stops.** It degrades to a11y-level operation (the agent keeps going) while the durable fix is in flight.

### 12.2 Manifest store + fetch-latest (Tier 1)

- **Manifest source becomes PLUGGABLE:** `page-injected` (`window.__agrune_manifest__`, current) | `store-fetched` | `local-file`. Default keeps page-injected primary; the store acts as an **override-on-drift**. Precedence/merge rules TBD.
- **Addressing:** keyed by `(origin, appVersionOrContentHash, schemaVersion)`. Cheap version probe via ETag/content-hash; full fetch only on drift or version mismatch.
- The store is the **publish target** for §12.4 repairs — everything downstream depends on it, so it is built FIRST.
- **SECURITY (load-bearing):** `keyFrom` is compiled via `new Function` (§3.11.4) — a remote manifest is a **code-injection surface**. Store artifacts MUST be **signed + pinned**; unsigned/unpinned manifests are rejected, never executed.

### 12.3 Ticket emission (Tier 3 escalation)

- **Payload is ~90% the §8.7 `DriftReport`** (group, missing targetIds, captured a11y) + screenshot + URL + app version. Cheap to generate because the sensor already produced it.
- **Sink is PLUGGABLE:** GitHub issue | Linear | webhook.
- **Dedup** by fingerprint `hash(origin, groupId, sorted(missingTargetIds))` → repeated drift = one OPEN ticket, not one-per-load.
- **Debounce:** emit only after drift is CONFIRMED across N loads / M seconds. The §8.7 per-call detection is correct for the inline a11y fallback but too twitchy for escalation (ticket spam + needless re-fetches).

### 12.4 Autonomous repair harness (the agent)

- **Job:** an agent drives the live app and **PATCHES the drifted targets only** — healthy targets are FROZEN (patch, never rewrite; diff-based; MUST NOT regress working refs).
- **It is not authoring blind.** Three assets, all already produced by the runtime:
  - **INPUT** = the live a11y auto-served on drift (§8.7).
  - **SPEC** = the OLD manifest target (`name`/`desc`/`role`) — *"find what now does what 'Filter' used to do."* This is §8.1 self-heal's intent-matching **escalated from target-scope to screen-scope** by an LLM. Same operation, different scale.
  - **ORACLE** = the target's `onSuccess` — resolve the repaired selector, optionally act, confirm the declared effect.
- **VERIFICATION GATE (first-class invariant): `propose → verify → publish`, NEVER `guess → publish`.** A wrong manifest in the store is **worse than no manifest** (no manifest → safe a11y fallback; wrong manifest → confident wrong actions at scale). A target is published only if it (a) passes schema + forbidden-selector + keyFrom gates (§3.11) AND (b) resolves + satisfies its effect oracle.
- **Provenance + rollback:** every store version records author (`human`|`agent`), timestamp, target app version; one-click rollback. Treat as infra config.

### 12.5 Build order & dependencies

1. **Store + fetch-latest (§12.2)** — backbone; everything publishes to / reads from it. Highest value, lowest risk.
2. **Ticket emitter (§12.3)** — cheap given the `DriftReport`; pluggable sink.
3. **Repair harness (§12.4)** — consumes 1 (publishes) and 2 (triggered by tickets); built LAST because it most needs the verification scaffolding to be safe.

The §8.7 sensor is the prerequisite for all three and is **already built**.

---

# Appendix A — Normative Closures

> **Status: NORMATIVE — SUPERSEDING.** This appendix is the authoritative specification for the daemon wire protocol, the command table, the type/error/exit contracts, the help text, and the snapshot serializer golden vector. Where any earlier section of the agrune spec is under-specified or conflicts with this appendix, **this appendix governs.** All formats, type definitions, error codes, exit codes, and byte-for-byte output blocks below are verbatim and binding.

---

## A.0 Resolved Decisions (Normative)

Each of the following resolved DECISIONS is stated as normative and takes precedence over any earlier text.

### A.0.1 `read` returns plain text, NOT markdown
The `read` command MUST return the page body's `innerText()` as **plain text**. This matches the shipped implementation. Markdown conversion is an explicit **NON-GOAL**: the daemon MUST NOT convert, post-process, or re-serialize the page body into markdown. The wire shape is fixed: `GET /read` → `{ ok:true, text:string }` where `text` is the raw `innerText()` string.

### A.0.2 Session flag parity — accept BOTH forms
The CLI MUST accept BOTH of the following spellings for selecting a session, as a parity requirement with `playwright-cli`:
- `playwright-cli` form: `-s=<id>`
- agrune form: `--session <id>`

Both forms MUST resolve to the same session selector. Neither form is deprecated; both are first-class and permanently supported.

### A.0.3 Parity table correction
The following are **real `playwright-cli` commands** and therefore ARE parity targets (NOT agrune-only extras). They are present in the runtime `playwright-cli --help` output even though they are absent from the static `help.json`:
- `generate-locator`
- `highlight`
- `detach`
- the global `--raw` flag

Additionally, the parity set MUST include:
- `video-chapter`
- the `[button]` argument on `mousedown` / `mouseup`

These MUST be classified as parity targets in the parity table, not as agrune extras.

### A.0.4 Self-heal decoupling — core resolver functions with plugin ABSENT
The core target resolver MUST function with the self-heal plugin **ABSENT**. The no-plugin path is normative:
- **No-plugin path:** when no ladder rung matches, the resolver MUST return `TARGET_NOT_FOUND` with **NO `repair` field** in the error details.
- **Plugin-present path:** the `repair` detail and any auto-apply behavior are added **ONLY** when the optional self-heal plugin is installed.

The `repair` field and auto-apply are strictly plugin-contributed; the core MUST NOT depend on, reference, or emit them when the plugin is absent.

### A.0.5 Sensitive masking stays in CORE
The multi-language sensitive-word set MUST remain in **CORE** as a security fail-safe. It MUST NOT be relocated to an extension or optional plugin. Sensitive detection and masking are part of the core security guarantee and ship unconditionally.

---

## A.1 Daemon Wire Protocol

### A.1.1 Transport
**HTTP/1.1 over a Unix domain socket** (no custom framing, no length-prefix, no JSON-RPC). The same HTTP server also supports a TCP fallback. The daemon is a `node:http` server (`http.createServer`); the one-shot client is `node:http` `http.request`. Framing is therefore standard HTTP: request line + headers + body, response status line + headers + body. No persistent connection / no streaming protocol — every CLI verb is one request → one response.

### A.1.2 Endpoint token (client-side addressing)
The CLI carries the daemon address as a single opaque string `endpoint` / `baseUrl`:
- `unix:<socketPath>` — Unix domain socket (default). Client sets `http.RequestOptions.socketPath = <socketPath>`.
- `http://<host>:<port>` — TCP fallback (explicit `--host`/`--port`). Client sets `options.host = url.hostname`, `options.port = url.port ? Number(url.port) : 80`.
- Detection: `isSocketEndpoint(endpoint) === endpoint.startsWith('unix:')`; `socketPathFromEndpoint = endpoint.slice('unix:'.length)`.

Default socket path (Unix): `~/.agrune/run/<sha256(realpath(cwd)).hex.slice(0,12)>/daemon.sock`. Win32 named pipe: `\\.\pipe\agrune-<hash>`. Override precedence in `getDaemonEndpoint`: `--host`/`--port` (→ `http://...`, `explicit:true`) > `AGRUNE_DAEMON_SOCKET` env (→ `unix:<trimmed>`, `explicit:true`) > default workspace socket (`unix:...`, `explicit:false`). When `explicit:false`, the client auto-spawns a detached `agrune daemon run` daemon on first request (see §A.1.9).

### A.1.3 Request framing (client `rawRequest`)
- **Method**: `init.method ?? 'GET'`.
- **Path**: the route path INCLUDING query string (e.g. `/console?tabId=1&level=error`). Passed as `options.path`.
- **Headers** always sent:
  - `content-type: application/json`
  - `content-length: <Buffer.byteLength(body)>` — ONLY when `init.body` is present.
- **Body**: a string (already `JSON.stringify`'d by the caller) written via `req.write(body)`; omitted entirely for GET routes. Empty body on a POST is read by the daemon as `{}` (`readJsonBody` returns `{}` when zero chunks).
- No `Host`, `Accept`, auth, or custom headers are set by the client beyond the two above (Node adds its own `Host`/`Connection`).

### A.1.4 Response framing (daemon `sendJson`)
- Body is `JSON.stringify(body, null, 2)` (pretty-printed, 2-space).
- Headers: `content-type: application/json; charset=utf-8`, `content-length: <Buffer.byteLength(text)>`.
- **Status codes**: `200` on success; `400` on any thrown error (the daemon has exactly two `sendJson` calls: `200` for the routeRequest result, `400` for `errorResponse(error)` in the catch). There is no `404`/`405`/`500` path — an unknown route throws `Error('Unknown endpoint: <METHOD> <path>')` which is serialized as a `400`.

### A.1.5 Success envelope
Every successful route returns a JSON object whose first field is `ok: true`, plus route-specific fields. There is no wrapping `result`/`data` field — route payload fields sit at the top level alongside `ok`.

### A.1.6 Error envelope (`errorResponse`)
```json
{
  "ok": false,
  "error": {
    "code": "<string>",
    "message": "<string>",
    "details": { ... }   // present ONLY when the error carries details
  }
}
```
`asBackendError` maps non-`AgruneBackendError`/`CliError` throws to `code: "INTERNAL_ERROR"` with `message = error.message` (or `String(error)`). `CliError`/`AgruneBackendError` carry `{ code, message, details? }`. Validation helpers throw plain `Error` (→ `INTERNAL_ERROR`) or `CliError('INVALID_COMMAND', ...)` / `CliError('TAB_NOT_FOUND', ...)` / `CliError('DAEMON_ALREADY_RUNNING', ...)`.

### A.1.7 Client error handling (`requestJson`)
1. Parse response text as JSON (`safeParseJson`; returns `null` on parse failure or empty body).
2. If `status < 200 || status >= 300`: extract `parsed.error` if present and throw `CliError(error.code ?? 'HTTP_ERROR', error.message ?? 'Agrune daemon returned HTTP <status>.', error.details)`.
3. On any socket/`req` `error` event (daemon unreachable): throw `CliError('DAEMON_UNAVAILABLE', 'Agrune daemon is not reachable at <endpoint>. Start it with "agrune daemon start".', { cause })`.
4. Otherwise return `parsed as T`.

### A.1.8 Health & lifecycle protocol
- `GET /health` → `{ ok:true, name:'agrune-daemon', browser:'playwright', tabs:<number> }`. Used by `isHealthy` (checks `health.ok === true && health.name === 'agrune-daemon'`).
- Session file `~/.agrune/run/<hash>/daemon.json`: `{ pid, socketPath, workspace, startedAt, version }`, written by `daemon start`/`run`, used by `stopDaemon` (SIGTERM, then SIGKILL after 5 s, removes socket+session).
- Startup collision: if the socket file exists and is accepting connections, throw `CliError('DAEMON_ALREADY_RUNNING', ...)`; a stale socket is removed before `listen`.

### A.1.9 Auto-spawn (`ensureDaemon`)
Health-check `endpoint`; if healthy but `sessionFile.version !== CLI_VERSION`, `stopDaemon()` then respawn; else if unhealthy, clean stale state and `spawn(process.execPath, [argv[1], 'daemon', 'run', '--headless'?], { detached:true, stdio:'ignore' })` then poll `/health` every 150 ms up to 15 000 ms. Spawn guarded by a `spawn.lock` file in the workspace run dir (stale after 60 000 ms).

### A.1.10 Event tracking (out of band)
The daemon records start/end/error events in an in-memory `DaemonEventBroker` for every tracked request (all routes except `GET /health` and `GET /events/history`). Sensitive bodies are redacted in event args for `/dialog`, `/file-upload`, `/fill`, `/type`, `/run-code-unsafe`. Events are retrievable only via `GET /events/history` (the prior `events --follow` streaming mode was removed).

---

## A.2 Command Table

### A.2.1 Command record type
```ts
interface Command {
  name: string                       // canonical verb (cli.ts dispatch key)
  aliases: string[]                  // alternate primaries routed to the same handler
  subcommand?: string                // required 2nd token for namespaced verbs (daemon/tab/tabs/network/dialog)
  positionals: Array<{               // ordered positional args
    name: string
    type: 'string' | 'integer' | 'string[]'
    arity: 'one' | 'rest' | 'optional'
    required: boolean
  }>
  flags: Array<{
    name: string                     // long flag (also accepts aliases listed)
    aliases?: string[]
    type: 'string' | 'boolean' | 'integer'
    default?: unknown
  }>
  needsTarget: boolean               // true when a resolved target-ref positional/flag is mandatory
  route: { method: 'GET'|'POST'; path: string }
  request: '...'                     // JSON body (POST) or query params (GET) the client builds
  response: '...'                    // success envelope shape (always { ok:true, ... })
}
```

### A.2.2 Global flags accepted by every verb
Parsed in `args.ts`; `--flag value`, `--flag=value`, or bare `--flag` → `true`; `--` stops flag parsing:
- `--host <string>`, `--port <integer>` — pin TCP endpoint (sets `explicit`, disables auto-spawn).
- `--headless` (boolean) — passed to auto-spawn / `daemon start`.
- `--json` (boolean) — pretty-print full response JSON instead of formatted lines (`writeResult`/`writeJson`).
- `--tab <integer>` — `tabId`; must be a positive integer (`optionalNumberFlag` enforces `>0` & integer for name `tab`). Sent as `tabId` in body/query on nearly every browser verb.
- `--session <id>` / `-s=<id>` — session selector; BOTH forms accepted (see §A.0.2).
- `--raw` (boolean) — global raw flag (parity with `playwright-cli`; see §A.0.3).
- `--help` (boolean) — print help, exit 0.

`tabId` resolution: the client never resolves the target tab; it forwards `tabId` (or omits it → daemon uses the active tab via `optionalNumber(body.tabId)`). For `tabs focus/close`, `--index` is resolved server-side to a `tabId` via `session.listTabs()[index]`.

### A.2.3 Rows (one per dispatch branch in `runCliOrThrow`)

| name | aliases | sub | positionals | key flags (type/default) | needsTarget | route | request | response |
|---|---|---|---|---|---|---|---|---|
| **daemon start** | `daemon run` | start/run | — | `--headless` (bool); `--host`/`--port` | no | (local; no HTTP) starts `http.createServer`, binds socket or TCP | — | stdout `Agrune daemon listening on <url>`; writes session file; blocks until SIGINT/SIGTERM |
| **daemon stop** | — | stop | — | — | no | (local; SIGTERM via session file) | — | stdout stopped/none message |
| **daemon status** | — | status | — | `--json` (bool) | no | `GET /health` | query: none | `{ok:true,name:'agrune-daemon',browser:'playwright',tabs:number}` |
| **daemon events** | (`events`) | events | — | `--json`(bool); `--follow`→error | no | `GET /events/history` | none | `{ok:true,events:DaemonEvent[]}` |
| **open** | — | — | `url`:string (one, required) | — | no | `POST /open` (alias daemon path `/tabs/new`) | `{url}` | `{ok:true,index:number,tab:PublicTab}` |
| **navigate** | `goto` | — | `url`:string (one, required) | `--tab` | no | `POST /navigate` | `{url, tabId?}` | `{ok:true,action:'navigate',tab:PublicTab}` |
| **back** | — | — | — | `--tab` | no | `POST /back` | `{tabId?}` | `{ok:true,action:'back',tab:PublicTab}` |
| **forward** | — | — | — | `--tab` | no | `POST /forward` | `{tabId?}` | `{ok:true,action:'forward',tab:PublicTab}` |
| **reload** | — | — | — | `--tab` | no | `POST /reload` | `{tabId?}` | `{ok:true,action:'reload',tab:PublicTab}` |
| **resize** | — | — | `width`:int, `height`:int (two; or `--width`/`--height`) | `--tab`,`--width`,`--height` | no | `POST /resize` | `{width, height, tabId?}` | `{ok:true,action:'resize',tabId,width,height}` |
| **evaluate** | `eval` | — | js source (rest, joined; or `--expression`/`--function`) | `--target`(str),`--arg`(JSON),`--filename`/`--output`(str),`--tab` | no | `POST /evaluate` | `{source, arg?, target?, filename?, tabId?}` | `{ok:true,action:'evaluate',target?,result,undefinedResult?,path?}` |
| **run-code-unsafe** | `run-code` | — | js source (rest, joined; or `--code`) | `--file`/`--filename`(str),`--code`(str),`--tab` | no | `POST /run-code-unsafe` (alias `/run-code`) | `{code}` xor `{filename}`, `tabId?` | `{ok:true,action:'run-code-unsafe',result,undefinedResult?,filename?}` |
| **console** | `console-messages` | — | — | `--level`(str),`--all`(bool),`--filename`/`--output`(str),`--json`,`--tab` | no | `GET /console` | query: `tabId?,level?,all?,filename?` | `{ok:true,messages:ConsoleMessageEntry[],path?}` |
| **network** | `network-requests` | (none) | — | `--filter`(str),`--static`(bool),`--all`(bool),`--filename`/`--output`,`--json`,`--tab` | no | `GET /network` | query: `tabId?,filter?,static?,all?,filename?` | `{ok:true,requests:NetworkRequestSummary[],path?}` |
| **network request** | `network-request` | request | `index`:int (one, required; or `--index`) | `--part`(str),`--filename`/`--output`,`--json`,`--tab` | no | `GET /network/request` | query: `tabId?,index,part?,filename?` | `{ok:true,request,requestHeaders?,requestBody?,responseHeaders?,responseBody?,path?}` OR part form `{ok:true,request,part,value,path?}` |
| **dialogs** | — | — | — | `--json`,`--tab` | no | `GET /dialogs` | query: `tabId?` | `{ok:true,dialogs:DialogInfo[]}` |
| **handle-dialog** | `dialog` | (`accept`/`dismiss` subcmd) | — | `--accept`(bool),`--dismiss`(bool),`--prompt-text`/`--promptText`(str),`--tab` | no | `POST /dialog/handle` (alias `/dialog`) | `{accept:boolean, promptText?, tabId?}` | `{ok:true,action:'dialog.handle',armed:boolean,dialog?}` |
| **file-choosers** | `filechoosers` | — | — | `--json`,`--tab` | no | `GET /file-choosers` | query: `tabId?` | `{ok:true,fileChoosers:FileChooserInfo[]}` |
| **file-upload** | — | — | `paths`:string[] (rest, optional — none cancels) | `--tab` | no | `POST /file-upload` (alias `/filechooser/upload`) | `{paths:string[], tabId?}` | `{ok:true,action:'file-upload',paths,cancelled,fileChooser}` |
| **tabs** / **tabs list** | `tab list` | list/(none) | — | `--json` | no | `GET /tabs` | none | `{ok:true,tabs:PublicTab[]}` |
| **tabs new** | `tab new` | new | `url`:string (one, required) | `--tab` | no | `POST /tabs/new` | `{url}` | `{ok:true,index:number,tab:PublicTab}` |
| **tabs focus** | `tabs select`,`tab focus`,`tab select` | focus/select | `tabId`:int (one, required unless `--index`) | `--index`(int),`--tab` | yes (tabId or index) | `POST /tabs/select` (alias `/tabs/focus`) | `{tabId}` xor `{index}` | `{ok:true,index,tab:PublicTab}` |
| **tabs close** | `tab close`,`close` | close | `tabId`:int (one, optional) | `--index`(int),`--tab` | no | `POST /close` (alias `/tabs/close`) | `{tabId?}` xor `{index?}` (empty → active tab) | `{ok:true,index?,closedTabId,tabs:PublicTab[]}` |
| **events** | — | — | — | `--json`,`--follow`→error | no | `GET /events/history` | none | `{ok:true,events:DaemonEvent[]}` |
| **targets** | — | — | — | `--mode`(outline/full),`--full`(bool),`--group`(str),`--group-ids`/`--groupIds`(csv),`--target`(str),`--text`/`--include-text-content`(bool),`--filename`/`--output`,`--json`,`--tab` | no | `GET /targets` | query: `tabId?,target?,groupId?,groupIds*` | `{ok:true,snapshot:PageSnapshot}` (client formats; `path?` added client-side) |
| **snapshot** | `aria-snapshot` | — | — | `--target`(str),`--depth`(int),`--mode`(ai/default,def `ai`),`--boxes`(bool),`--include-text-content`/`--text`(bool),`--filename`/`--output`,`--json`,`--tab` | no | `GET /snapshot` | query: `tabId?,target?,depth?,mode?,filename?,boxes?,includeTextContent?` | `{ok:true,text,mode,target?,depth?,path?,boxes?,includeTextContent?}` |
| **click** | — | — | `target`:string (one, required) | `--button`(left/right/middle),`--double-click`/`--doubleClick`(bool),`--modifiers`(csv),`--tab` | yes | `POST /click` | `{target, action:'click', button?, modifiers?, doubleClick, tabId?}` | `{ok:true,target,action,button?,modifiers?,dialog?,fileChooser?}` |
| **dblclick** | `double-click` | — | `target`:string (one, required) | same as click | yes | `POST /click` | `{target, action:'dblclick', ...}` | as click |
| **right-click** | — | — | `target`:string (one, required) | `--button` (must be `right`),`--modifiers`,`--tab` | yes | `POST /click` | `{target, action:'contextmenu', button:'right', ...}` | as click |
| **hover** | — | — | `target`:string (one, required) | `--tab` | yes | `POST /click` | `{target, action:'hover', ...}` | as click |
| **fill** | — | — | `target`:string, `value`:rest(joined) (both required) | `--append`(bool→clear:false),`--strategy`(insert/keystroke/auto),`--tab` | yes | `POST /fill` | `{target, value, clear, strategy?, tabId?}` | `{ok:true,target,value,strategy?}` |
| **fill-form** | `fill_form` | — | — | `--fields`(JSON str),`--file`(path),`--tab` | no | `POST /fill-form` | `{fields:Array<{name?,target,type,value}>, tabId?}` | `{ok:true,action:'fill-form',fields:[{name?,target,type}]}` |
| **type** | — | — | `target`:string, `text`:rest(joined) (both required) | `--submit`(bool),`--delay`(int→delayMs),`--tab` | yes | `POST /type` | `{target, text, submit, delayMs?, tabId?}` | `{ok:true,action:'type',target,text}` |
| **press** | `press-key` | — | `[target]` `key` (key required; target optional first positional when 2 given) | `--target`(str),`--key`(str),`--delay`(int),`--tab` | no (target optional) | `POST /press` | `{key, target?, delayMs?, tabId?}` | `{ok:true,action:'press',key,target?}` |
| **select** | `select-option` | — | `target`:string, `values`:string[] (rest, ≥1) | `--mode`(value/label/index),`--label`(bool),`--index`(bool),`--tab` | yes | `POST /select` | `{target, values:string[], mode, tabId?}` | `{ok:true,action:'select',target,values:string[]}` |
| **upload** | — | — | `target`:string, `paths`:string[] (rest, ≥1) | `--tab` | yes | `POST /upload` | `{target, paths:string[], tabId?}` | `{ok:true,action:'upload',target,paths}` |
| **drop** | — | — | `target`:string, `paths`:string[] (rest, optional) | `--data`(JSON obj),`--text`(str→`text/plain`),`--uri`(str→`text/uri-list`),`--tab` | yes | `POST /drop` | `{target, paths:string[], data:Record<string,string>, tabId?}` (requires ≥1 of data/paths) | `{ok:true,action:'drop',target,paths,dataTypes}` |
| **drag** | — | — | `startTarget`:string, `[endTarget]` | `--to`(str, end-ref; required if no 2nd positional),`--tab` | yes (both) | `POST /drag` | `{startTarget, endTarget, tabId?}` | `{ok:true,target:startTarget,action:'drag'}` |
| **read** | — | — | — | `--json`,`--tab` | no | `GET /read` | query: `tabId?` | `{ok:true,text:string}` — `text` is page body `innerText()` plain text (§A.0.1) |
| **wait** | — | — | `[target]`:string (optional, mutually exclusive with text/timeMs) | `--text`(str),`--text-gone`/`--textGone`(str),`--time`(sec→timeMs),`--time-ms`(int),`--state`(visible/hidden/enabled/disabled,def `visible`),`--timeout`(int→timeoutMs, def 10000),`--tab` | no | `POST /wait` | exactly one of `{target,state}` / `{text}` / `{textGone}` / `{timeMs}`, plus `timeoutMs?, tabId?` | `{ok:true,action:'wait:<state>'\|'wait:text'\|'wait:textGone'\|'wait:time', target?\|text?\|timeMs?}` |
| **screenshot** | — | — | — | `--output`(str, default `.agrune/runs/<ISO>/screenshot.<ext>`),`--full-page`(bool),`--target`(str),`--type`(png/jpeg),`--json`,`--tab` | no | `POST /screenshot` | `{path:output, fullPage, target?, type?, tabId?}` | `{ok:true,path,type,fullPage,target?}` |

### A.2.4 Server-side body validation contract (must reproduce)
- `requireString(body,key)`: non-empty trimmed string or throw `Missing required string field: <key>`.
- `requireStringArray`: non-empty array of non-empty strings.
- `requirePositiveInteger`: integer > 0.
- `requireBoolean`: strict `true`/`false`.
- `tabId` query/body: parsed via `optionalNumber` (accepts number or numeric string).
- `click`: `action==='contextmenu'` forces `button:'right'`; rejects any other explicit button. `doubleClick && action==='click'` → response `action:'dblclick'`.
- `fill strategy`: one of `insert|keystroke|auto` else error. `clear` defaults true (body `clear !== false`).
- `select mode`: `value`→`{value}`, `label`→`{label}`, `index`→`{index:int>=0}`.
- `fill-form field.type`: one of `textbox|checkbox|radio|combobox|slider`; `value`: string|boolean|number.
- `wait`: exactly one of target/text/textGone/timeMs (`modeCount !== 1` → error); `timeoutMs` default `10000`; `state` one of visible|hidden|enabled|disabled.
- `screenshot type`: `png|jpeg`; inferred from path extension (`.jpg`/`.jpeg`→jpeg) when omitted.
- `console level`: `debug|info|warning|error`. `network part`: `request-headers|request-body|response-headers|response-body`. `snapshot mode`: `ai|default`. `click button`: `left|right|middle`. `click modifiers`: `Alt|Control|ControlOrMeta|Meta|Shift`.
- `run-code-unsafe`: `filename` (non-empty string, read from disk) XOR `code` (non-empty); else `CliError('INVALID_COMMAND','run-code-unsafe requires code or filename.')`.
- Output `filename` on evaluate/console/network/network-request/snapshot: when set, daemon writes the formatted output to `resolve(filename)` (mkdir -p) and returns `path` in the envelope.

### A.2.5 Exit codes (`exitCodeFor`)
`DAEMON_UNAVAILABLE` / `SESSION_NOT_ACTIVE` → 4; `TARGET_NOT_FOUND` / `INVALID_MANIFEST` → 3; everything else → 1. Errors print to stderr as `<code>: <message>`. (See §A.4 for the complete table.)

---

## A.3 Type Schemas

### A.3.1 FillFormField — the `--fields` JSON element shape
Source: `packages/core/src/driver.ts:100-118` (exported from `packages/core/src/index.ts:27-30`).

```typescript
export type FillFormFieldType = 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider'

export type FillFormFieldValue = string | boolean | number

export interface FillFormField {
  name?: string
  targetId: string
  type: FillFormFieldType
  value: FillFormFieldValue
}
```

Normative element contract for each entry of the `--fields` JSON array (`agrune fill-form --fields json | --file path`, help line `packages/cli/src/cli.ts:1342`):

| Field | Type | Required | Allowed values |
|-------|------|----------|----------------|
| `name` | `string` | optional | any string |
| `targetId` | `string` | required | target id |
| `type` | `FillFormFieldType` | required | `"textbox" \| "checkbox" \| "radio" \| "combobox" \| "slider"` |
| `value` | `FillFormFieldValue` | required | `string \| boolean \| number` |

Driver method: `fillForm?(tabId: number | undefined, fields: FillFormField[]): Promise<FillFormResult>` (`driver.ts:283-286`).

Result shape — `FillFormResult` (`driver.ts:111-118`):
```typescript
export interface FillFormResult {
  tabId: number
  fields: Array<{
    name?: string
    targetId: string
    type: FillFormFieldType
  }>
}
```

### A.3.2 Pointer action array grammar
Source: `packages/core/src/index.ts:396-410`. Used by `PointerCommandRequest.actions`.

```typescript
export type PointerActionType = 'pointerdown' | 'pointermove' | 'pointerup' | 'wheel'

export type PointerAction =
  | { type: 'pointerdown'; x: number; y: number; delayMs?: number }
  | { type: 'pointermove'; x: number; y: number; delayMs?: number }
  | { type: 'pointerup'; x: number; y: number; delayMs?: number }
  | { type: 'wheel'; x: number; y: number; deltaY: number; ctrlKey?: boolean; delayMs?: number; steps?: number; durationMs?: number }

export interface PointerCommandRequest extends BaseCommandRequest {
  kind: 'pointer'
  targetId?: string
  selector?: string
  coords?: { x: number; y: number }
  actions: PointerAction[]
}
```

Per-variant field grammar (discriminated on `type`):

| `type` | Required fields | Optional fields |
|--------|-----------------|-----------------|
| `pointerdown` | `x: number`, `y: number` | `delayMs?: number` |
| `pointermove` | `x: number`, `y: number` | `delayMs?: number` |
| `pointerup` | `x: number`, `y: number` | `delayMs?: number` |
| `wheel` | `x: number`, `y: number`, `deltaY: number` | `ctrlKey?: boolean`, `delayMs?: number`, `steps?: number`, `durationMs?: number` |

`BaseCommandRequest` (`index.ts:328-331`) adds `commandId: string` and `config?: Partial<AgruneRuntimeConfig>` to the pointer request.

### A.3.3 DropData — `drop --data` / files shape
Source: `packages/core/src/driver.ts:166-173`.

```typescript
export type DropData = Record<string, string>

export interface DropResult {
  tabId: number
  targetId: string
  paths: string[]
  dataTypes: string[]
}
```

`DropData` is a string→string map: each key is a drag dataTransfer MIME/format type (e.g. `text/plain`, `text/uri-list`), each value is the string payload. Driver method (`driver.ts:291-296`):
```typescript
drop?(
  tabId: number | undefined,
  targetId: string,
  data: DropData,
  paths: string[],
): Promise<DropResult>
```
CLI surface (help `cli.ts:1347`): `agrune drop <target-ref> [path...] [--data json|--text value|--uri value]` — `path...` populates the `paths: string[]` argument; `--data json` supplies the `DropData` map; `--text` / `--uri` are convenience shorthands that set the `text/plain` / `text/uri-list` entries of `DropData`.

---

## A.4 Error-Code and Exit-Code Contract

### A.4.1 COMPLETE `CommandErrorCode` union (every code)
Source: `packages/core/src/index.ts:50-82`. `CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number]`. The canonical array contains exactly these 26 entries, in source order:

1. `STALE_SNAPSHOT`
2. `TARGET_NOT_FOUND`
3. `NOT_VISIBLE`
4. `DISABLED`
5. `FLOW_BLOCKED`
6. `TIMEOUT`
7. `SESSION_NOT_ACTIVE`
8. `AGENT_STOPPED`
9. `INVALID_TARGET`
10. `INVALID_COMMAND`
11. `INVALID_MANIFEST`
12. `MACRO_NOT_FOUND`
13. `MACRO_CIRCUIT_OPEN`
14. `MACRO_PRECONDITION_FAILED`
15. `MACRO_POSTCONDITION_FAILED`
16. `REPEAT_INDEX_OUT_OF_RANGE`
17. `CANVAS_PAN_FAILED`
18. `DESTINATION_OUTSIDE_CANVAS`
19. `CONNECTION_LOST`
20. `CHROME_CRASHED`
21. `RECOVERY_FAILED`
22. `TAB_NOT_FOUND`
23. `DIALOG_NOT_FOUND`
24. `FILE_CHOOSER_NOT_FOUND`
25. `NETWORK_REQUEST_NOT_FOUND`
26. `NETWORK_RESPONSE_NOT_FOUND`

`CommandErrorShape` (`index.ts:322-326`):
```typescript
export interface CommandErrorShape {
  code: CommandErrorCode
  message: string
  details?: Record<string, unknown>
}
```

> **Self-heal decoupling (§A.0.4):** when the self-heal plugin is ABSENT, a `TARGET_NOT_FOUND` failure carries NO `repair` field in `details`. The `repair` detail (and any auto-apply) is contributed ONLY by the optional plugin. Core MUST NOT emit it on the no-plugin path.

`CommandResult` success/failure (`index.ts:420-437`):
```typescript
export interface CommandExecutionMetadata {
  snapshotVersion?: number
  snapshot?: PageSnapshot
}
export interface CommandResultSuccess extends CommandExecutionMetadata {
  commandId: string
  ok: true
  result?: Record<string, unknown>
}
export interface CommandResultFailure extends CommandExecutionMetadata {
  commandId: string
  ok: false
  error: CommandErrorShape
}
export type CommandResult = CommandResultSuccess | CommandResultFailure
```

### A.4.2 Additional (non-`CommandErrorCode`) error codes carried on the wire
These are CLI/backend-layer codes NOT in the `COMMAND_ERROR_CODES` union but produced as `AgruneBackendError`/`CliError` codes and consumed by `exitCodeFor`:
- `DAEMON_UNAVAILABLE` — thrown by `packages/cli/src/daemon-client.ts:87`.
- `INTERNAL_ERROR` — `asBackendError` fallback for non-`AgruneBackendError` errors (`packages/backend/src/errors.ts:14-15`).

The CLI top-level catch prints `` `${err.code}: ${err.message}\n` `` to stderr and returns `exitCodeFor(err.code)` (`cli.ts:38-42`).

### A.4.3 COMPLETE code → exit-code table
Source: `exitCodeFor(code)` in `packages/cli/src/cli.ts:1297-1301`:
```typescript
function exitCodeFor(code: string): number {
  if (code === 'DAEMON_UNAVAILABLE' || code === 'SESSION_NOT_ACTIVE') return 4
  if (code === 'TARGET_NOT_FOUND' || code === 'INVALID_MANIFEST') return 3
  return 1
}
```

Exit codes are determined ONLY by the four explicitly-named codes; every other code (including every other `CommandErrorCode`) falls through to the default **exit 1**.

| Error code | Exit code |
|------------|-----------|
| `DAEMON_UNAVAILABLE` | 4 |
| `SESSION_NOT_ACTIVE` | 4 |
| `TARGET_NOT_FOUND` | 3 |
| `INVALID_MANIFEST` | 3 |
| `STALE_SNAPSHOT` | 1 (default) |
| `NOT_VISIBLE` | 1 (default) |
| `DISABLED` | 1 (default) |
| `FLOW_BLOCKED` | 1 (default) |
| `TIMEOUT` | 1 (default) |
| `AGENT_STOPPED` | 1 (default) |
| `INVALID_TARGET` | 1 (default) |
| `INVALID_COMMAND` | 1 (default) |
| `MACRO_NOT_FOUND` | 1 (default) |
| `MACRO_CIRCUIT_OPEN` | 1 (default) |
| `MACRO_PRECONDITION_FAILED` | 1 (default) |
| `MACRO_POSTCONDITION_FAILED` | 1 (default) |
| `REPEAT_INDEX_OUT_OF_RANGE` | 1 (default) |
| `CANVAS_PAN_FAILED` | 1 (default) |
| `DESTINATION_OUTSIDE_CANVAS` | 1 (default) |
| `CONNECTION_LOST` | 1 (default) |
| `CHROME_CRASHED` | 1 (default) |
| `RECOVERY_FAILED` | 1 (default) |
| `TAB_NOT_FOUND` | 1 (default) |
| `DIALOG_NOT_FOUND` | 1 (default) |
| `FILE_CHOOSER_NOT_FOUND` | 1 (default) |
| `NETWORK_REQUEST_NOT_FOUND` | 1 (default) |
| `NETWORK_RESPONSE_NOT_FOUND` | 1 (default) |
| `INTERNAL_ERROR` | 1 (default) |
| any unknown / unlisted code | 1 (default fallthrough) |

Exit code `0` is returned on success and for help (`cli.ts:47-49`).

---

## A.5 Verbatim `helpText()` Output

Source: `packages/cli/src/cli.ts:1303-1355`. The function returns the following array joined by `'\n'` (reproduced exactly, including trailing blank line):

```
agrune CLI

Usage:
  agrune daemon start [--headless] [--port 47654]   # foreground; default binds the workspace socket
  agrune daemon stop
  agrune daemon status
  agrune daemon events [--json]

  Browser commands auto-spawn a per-workspace daemon (detached) on first use.
  Endpoint: ~/.agrune/run/<workspace-hash>/daemon.sock — override with
  --host/--port (TCP) or AGRUNE_DAEMON_SOCKET.
  agrune open <url>
  agrune navigate <url>
  agrune back | forward | reload
  agrune resize <width> <height>
  agrune evaluate <js> [--target <target-ref>] [--arg json] [--filename path]
  agrune run-code-unsafe <js>|--code <js>|--file <path>
  agrune console [--level debug|info|warning|error] [--all] [--filename path] [--json]
  agrune network [--filter regexp] [--static] [--all] [--filename path] [--json]
  agrune network request <index> [--part request-headers|request-body|response-headers|response-body] [--filename path]
  agrune dialogs [--json]
  agrune handle-dialog --accept|--dismiss [--prompt-text text]
  agrune dialog accept|dismiss [--prompt-text text]
  agrune file-choosers [--json]
  agrune file-upload [path...]   # no paths cancels the pending chooser
  agrune tabs
  agrune tabs list
  agrune tabs new <url>
  agrune tabs focus <tabId>|--index <index>
  agrune tabs select <tabId>|--index <index>
  agrune tabs close [tabId|--index <index>]
  agrune close [tabId|--index <index>]
  agrune events [--json]
  agrune targets [--mode outline|full] [--full] [--group <groupId>] [--group-ids csv] [--target <target-ref>] [--text] [--filename path] [--json]
  agrune snapshot [--target <target-ref>] [--depth n] [--mode ai|default] [--boxes] [--include-text-content] [--filename path] [--json]
  agrune click <target-ref> [--button left|right|middle] [--double-click] [--modifiers Alt,Shift]
  agrune fill <target-ref> <value> [--strategy insert|keystroke|auto]
  agrune fill-form --fields json|--file path
  agrune type <target-ref> <text> [--submit] [--delay ms]
  agrune press [target-ref] <key> [--target <target-ref>]
  agrune select <target-ref> <value...> [--label|--index]
  agrune upload <target-ref> <path...>
  agrune drop <target-ref> [path...] [--data json|--text value|--uri value]
  agrune drag <start-ref> --to <end-ref>
  agrune wait <target-ref> [--state visible|hidden|enabled|disabled]
  agrune wait --text <text> | --text-gone <text> | --time <seconds>
  agrune screenshot [--output path] [--full-page] [--target <target-ref>] [--type png|jpeg]
  agrune read

```
(The final array element is the empty string `''`, so the joined output ends with a newline after `agrune read`.)

Note: there is no explicit `pointer` subcommand line in `helpText()`; the pointer command is exposed via the `PointerCommandRequest` protocol type but is not listed in the CLI usage text.

---

## A.6 Parity Set (`playwright-cli` correspondence)

The following classification is normative (§A.0.3). The named items below ARE real `playwright-cli` commands/flags — present in the runtime `playwright-cli --help` even though absent from the static `help.json` — and therefore ARE parity targets, NOT agrune extras:

| Item | Kind | Parity status |
|------|------|---------------|
| `generate-locator` | command | parity target |
| `highlight` | command | parity target |
| `detach` | command | parity target |
| `--raw` | global flag | parity target |
| `video-chapter` | command | parity target |
| `[button]` arg on `mousedown` | positional arg | parity target |
| `[button]` arg on `mouseup` | positional arg | parity target |
| `-s=<id>` / `--session <id>` | session flag (both forms) | parity target (§A.0.2) |

These items MUST appear on the parity-target side of any parity comparison table and MUST NOT be listed as agrune-only extras.

---

## A.7 Golden Conformance Vector — snapshot serializer (`formatSnapshot`)

Authoritative byte-for-byte target for the rebuilt outline format. The ONLY serializer of record is `formatSnapshot` in `packages/backend/src/snapshot.ts:361-395`, using `quote()` (`snapshot.ts:421-423` = `JSON.stringify`), `toAgentTargetRef` (`packages/core/src/target-ref.ts:61-78`), and `REPEATED_TARGET_KEY_DELIMITER = "__agrune_repeatKey_"` (`target-ref.ts:1`).

**Red herrings (do NOT treat as golden):** `.playwright-cli/*.yml` are raw Playwright accessibility-tree dumps (`- generic [ref=e3]:` …), not `formatSnapshot` output. `packages/e2e/tests/_bridge/public-shapes.ts:234` `formatPublicSnapshot` is a SEPARATE, richer format (adds `- Agrune Context:`, `- samples:`, per-target state) and is not this contract.

> **Sensitive masking (§A.0.5):** the multi-language sensitive-word set that drives `reason: "sensitive"` lives in CORE as a security fail-safe and is NOT an extension. In serialized output, sensitivity surfaces ONLY as the `- reason: sensitive` line; no value/preview is ever emitted.

### A.7.1 Self-contained golden input (the `PageSnapshot`)

`formatSnapshot` reads only: `snapshot.url`, `snapshot.title`, `snapshot.version`; per group `groupName`, `groupId`, `groupDesc`, `targetIds.length`; per target `name`, `targetId`, `repeatInstance`, `description`, `groupId`, `reason`, `textContent`. The async DOM build (`buildSnapshotFromManifest`) is non-deterministic, so the vector pins the exact `PageSnapshot` value the build stage is contracted to emit for the manifest below, then traces the formatter over it. Build-stage rules justifying each pinned value are in §A.7.4.

#### Golden manifest (4 groups; one sensitive target; one repeat with 2 live rows)

```ts
const manifest = {
  groups: [
    // G1 login — has a SENSITIVE target
    { groupId: 'login', name: 'Login Form', desc: 'Authenticate to the app',
      targets: [
        { targetId: 'username_input', name: 'Username', desc: 'Your account name',
          selector: { css: '#user' }, actionKinds: ['fill'] },
        { targetId: 'password_input', name: 'Password',
          selector: { css: '#pass' }, actionKinds: ['fill'], sensitive: true },
      ] },
    // G2 todos — has a REPEAT (todo_items) over 2 live rows
    { groupId: 'todos', /* no name -> falls back to groupId in outline */
      targets: [
        { targetId: 'new_todo_input', name: 'New todo',
          selector: { css: '#new-todo' }, actionKinds: ['fill'] },
      ],
      repeats: [
        { repeatId: 'todo_items', keyFrom: 'el.dataset.id ?? ""',
          nameFrom: 'el.querySelector("label")?.textContent?.trim() ?? ""',
          strategy: 'dom', containerSelector: { css: '.todo-list' },
          targets: [
            { targetId: 'todo_item_toggle', name: 'Toggle',
              selector: { css: '.toggle' }, actionKinds: ['click'] },
            { targetId: 'todo_item_destroy', name: 'Destroy',
              selector: { css: '.destroy' }, actionKinds: ['click'] },
          ] },
      ] },
    // G3 filters — name present, desc present, one offscreen target
    { groupId: 'filters', name: 'Filters', desc: 'Route buttons',
      targets: [
        { targetId: 'filter_all', name: 'All',
          selector: { css: 'a[href="#/all"]' }, actionKinds: ['click'] },
      ] },
    // G4 empty — applies to route but resolves to ZERO targets
    { groupId: 'empty_group', name: 'Empty', targets: [] },
  ],
}
```

#### Pinned `PageSnapshot` (deterministic build result — the conformance input)

Assume live DOM: username + password visible/ready; the password capture yields `reason: "sensitive"` and `valuePreview: null`; new_todo ready; filter_all is scrolled out of view → `reason: "offscreen"`; the `todo_items` repeat enumerates exactly 2 rows with `key` values `a1` and `b2` (names "Buy milk", "Walk dog"), each producing toggle + destroy instances; `empty_group` resolves to 0 targets.

```jsonc
{
  schemaVersion: 3, version: 7, capturedAt: 1750000000000,
  url: "https://example.test/app",
  title: "Demo \"App\"",                 // embedded quote -> exercises quote()
  groups: [
    { groupId: "login", groupName: "Login Form", groupDesc: "Authenticate to the app",
      targetIds: ["username_input", "password_input"] },
    { groupId: "todos", groupName: undefined, groupDesc: undefined,
      targetIds: ["new_todo_input",
        "todo_items__agrune_repeatKey_a1.todo_item_toggle",
        "todo_items__agrune_repeatKey_b2.todo_item_toggle",
        "todo_items__agrune_repeatKey_a1.todo_item_destroy",
        "todo_items__agrune_repeatKey_b2.todo_item_destroy"],
      repeats: [{ repeatId: "todo_items", strategy: "dom", instanceCount: 4, logicalSize: null }] },
    { groupId: "filters", groupName: "Filters", groupDesc: "Route buttons",
      targetIds: ["filter_all"] },
    { groupId: "empty_group", groupName: "Empty", groupDesc: undefined,
      targetIds: [] },
  ],
  targets: [
    { targetId: "username_input", groupId: "login", name: "Username",
      description: "Your account name", reason: "ready", sensitive: false, textContent: undefined },
    { targetId: "password_input", groupId: "login", name: "Password",
      description: "", reason: "sensitive", sensitive: true, valuePreview: null, textContent: undefined },
    { targetId: "new_todo_input", groupId: "todos", name: "New todo",
      description: "", reason: "ready", textContent: undefined },
    { targetId: "todo_items__agrune_repeatKey_a1.todo_item_toggle", groupId: "todos",
      name: "Buy milk", description: "", reason: "ready",
      repeatInstance: { repeatId: "todo_items", index: 0, key: "a1" } },
    { targetId: "todo_items__agrune_repeatKey_b2.todo_item_toggle", groupId: "todos",
      name: "Walk dog", description: "", reason: "ready",
      repeatInstance: { repeatId: "todo_items", index: 1, key: "b2" } },
    { targetId: "todo_items__agrune_repeatKey_a1.todo_item_destroy", groupId: "todos",
      name: "Buy milk", description: "", reason: "ready",
      repeatInstance: { repeatId: "todo_items", index: 0, key: "a1" } },
    { targetId: "todo_items__agrune_repeatKey_b2.todo_item_destroy", groupId: "todos",
      name: "Walk dog", description: "", reason: "ready",
      repeatInstance: { repeatId: "todo_items", index: 1, key: "b2" } },
    { targetId: "filter_all", groupId: "filters", name: "All",
      description: "", reason: "offscreen", textContent: undefined },
  ],
}
```

Target ORDER in `targets[]` and in each group's `targetIds[]` is: all direct targets in manifest order, then, per repeat, all instances of the repeat's FIRST target (across rows) followed by all instances of the next repeat target (`snapshot.ts:99` = `[...directTargets, ...repeatResults.flatMap(r => r.instances)]`, and `inspectRepeatTarget` returns `[...rows]` per repeat-target — so toggle@a1, toggle@b2, destroy@a1, destroy@b2). The rebuild MUST preserve this exact order.

### A.7.2 EXPECTED OUTPUT — assert these two byte-for-byte on first rebuild

> **CONFORMANCE VECTOR.** Feeding the pinned `PageSnapshot` above into `formatSnapshot(snapshot)` (outline) and `formatSnapshot(snapshot, { full: true })` (full) MUST produce the two blocks below VERBATIM — every line, the `### Page`/`### Snapshot` headers, the ```` ```yaml ```` fence, quoting, ref format, and counts. Lines are joined with `\n`; no trailing newline.

#### A.7.2a OUTLINE mode — `formatSnapshot(snapshot)` (no `full`, no filter)

```
### Page
- Page URL: https://example.test/app
- Page Title: Demo "App"
- Snapshot Version: 7
### Snapshot
```yaml
- group "Login Form" [ref=login]:
  - description: "Authenticate to the app"
  - targets: 2
- group "todos" [ref=todos]:
  - targets: 5
- group "Filters" [ref=filters]:
  - description: "Route buttons"
  - targets: 1
- group "Empty" [ref=empty_group]:
  - targets: 0
```
```

Notes: header lines `- Page URL`/`- Page Title`/`- Snapshot Version` are NOT quoted (raw interpolation). The `### Snapshot` header and ```` ```yaml ```` open the fence. Group label uses `quote(groupName ?? groupId)` → `"todos"` falls back to groupId because `groupName` is undefined, and IS quoted. `description` line emitted only when `groupDesc` truthy (omitted for `todos` and `empty_group`). `- targets: N` is `targetIds.length` (so `todos` = 5 incl. repeat instances; `empty_group` = 0). Closing ```` ``` ```` ends the fence.

#### A.7.2b FULL mode — `formatSnapshot(snapshot, { full: true })`

```
### Page
- Page URL: https://example.test/app
- Page Title: Demo "App"
- Snapshot Version: 7
### Snapshot
```yaml
- target "Username" [ref=username_input]:
  - description: "Your account name"
  - group: "login"
- target "Password" [ref=password_input]:
  - group: "login"
  - reason: sensitive
- target "New todo" [ref=new_todo_input]:
  - group: "todos"
- target "Buy milk" [ref=todo_items[key=a1].todo_item_toggle]:
  - group: "todos"
- target "Walk dog" [ref=todo_items[key=b2].todo_item_toggle]:
  - group: "todos"
- target "Buy milk" [ref=todo_items[key=a1].todo_item_destroy]:
  - group: "todos"
- target "Walk dog" [ref=todo_items[key=b2].todo_item_destroy]:
  - group: "todos"
- target "All" [ref=filter_all]:
  - group: "filters"
  - reason: offscreen
```
```

Notes: iterates `filteredSnapshot.targets` in array order. `- target {quote(name)} [ref={toAgentTargetRef(target)}]:`. `description` line only when `target.description` truthy (Password/New todo/repeats/All have `""` → omitted). `- group: {quote(groupId)}` always emitted (quoted). `- reason:` emitted only when `reason !== "ready"` and the value is RAW (NOT quoted) — so `sensitive` and `offscreen` appear, all `ready` targets omit it. `- text:` is NEVER emitted here because `includeTextContent` was not passed (and all textContent is undefined anyway). The empty `empty_group` contributes no targets in full mode.

### A.7.3 Notable edge cases the vector locks in

- **`Demo "App"` title** → `quote()` is `JSON.stringify`, but the title HEADER line (`- Page Title: ...`) is raw interpolation, so the embedded quotes appear literally and unescaped: `- Page Title: Demo "App"`. (Quoting/escaping applies ONLY inside `quote()`-wrapped fields: group/target names, descriptions, `- group:` value.)
- **`todos` fallback name** → `groupName` undefined → outline uses `quote(groupId)` = `"todos"` (still quoted).
- **Repeat ref rendering** → internal `todo_items__agrune_repeatKey_a1.todo_item_toggle` is rendered via `toAgentTargetRef` as `todo_items[key=a1].todo_item_toggle` (square-bracket `[key=...]` form, the delimiter is hidden). Non-repeat targets pass through unchanged.
- **Sensitive masking in output** → there is NO value/preview line in either mode; the secret is simply never serialized. Sensitivity surfaces ONLY as `- reason: sensitive`. `valuePreview`/`hasValue`/`sensitive` booleans are not printed by `formatSnapshot`.
- **`- none` fallback** → if after the loop the last line is still `` ```yaml `` (i.e. zero groups in outline, or zero targets in full/filtered), the formatter pushes `- none` before the closing fence. NOT triggered by this vector (both modes emit content), but the rebuild must implement it.

### A.7.4 Serializer rules (exact, normative)

**Header (always, both modes), `snapshot.ts:365-372`** — fixed 6 lines in order: `### Page`, `- Page URL: {url}`, `- Page Title: {title}`, `- Snapshot Version: {version}`, `### Snapshot`, `` ```yaml ``. All four data values are RAW (no quoting/escaping).

**Mode selection, `snapshot.ts:376`** — TARGET mode iff `options.full === true` OR a group filter is set (`groupId`/`groupIds`, non-empty after trim) OR a `targetRef` filter is set; otherwise OUTLINE (group) mode. Filtering (`filterSnapshot`/`resolveTargetFilter`/`normalizeAgentTargetId`) narrows which groups/targets remain but does not change line grammar.

**OUTLINE mode, `snapshot.ts:385-389`**, for each remaining group (snapshot group order):
1. `- group {quote(group.groupName ?? group.groupId)} [ref={group.groupId}]:` — label quoted via JSON.stringify; ref RAW.
2. if `group.groupDesc` truthy: `  - description: {quote(group.groupDesc)}` (2-space indent).
3. `  - targets: {group.targetIds.length}` — integer, RAW.

**FULL/TARGET mode, `snapshot.ts:377-383`**, for each remaining target (snapshot target order):
1. `- target {quote(target.name)} [ref={toAgentTargetRef(target)}]:` — name quoted; ref RAW (repeat → `repeatId[key=key].baseId`, else targetId).
2. if `target.description` truthy: `  - description: {quote(target.description)}`.
3. `  - group: {quote(target.groupId)}` — ALWAYS, quoted.
4. if `target.reason !== "ready"`: `  - reason: {target.reason}` — value RAW/unquoted (one of hidden|offscreen|covered|disabled|sensitive).
5. if `target.textContent` AND `options.includeTextContent`: `  - text: {quote(target.textContent)}`.

**Quoting, `snapshot.ts:421-423`** — `quote(v) = JSON.stringify(v)`: wraps in double quotes, escapes `"`→`\"`, `\`→`\\`, control chars (`\n`,`\t`,…) per JSON. Applied to: group name, group description, target name, target description, target `group` value, target `text` value. Applied to NOTHING else (headers, `ref=`, `reason`, `targets:` count are raw).

**Ordering** — groups follow `snapshot.groups` order (manifest group order, skipping route-non-matching groups at build time). Targets follow `snapshot.targets` order = per group: direct targets (manifest order) then repeat instances grouped by repeat-target across rows (`snapshot.ts:99`,`209`).

**`reason` field** — sourced from captured `state.reason` (or `"hidden"` for a missing/unresolved target, `snapshot.ts:324`). Type `PageTargetReason` (`core/src/index.ts:91-97`: `'ready' | 'hidden' | 'offscreen' | 'covered' | 'disabled' | 'sensitive'`). `formatSnapshot` SUPPRESSES it only when exactly `"ready"`; every other value is printed raw.

**Sensitive masking** — at capture (`snapshot.ts:282-285`/`326-328`) a sensitive fill keeps `valuePreview: null` and typically yields `reason: "sensitive"`. The sensitive-word set driving this lives in CORE (§A.0.5). In the OUTPUT, neither `valuePreview` nor `hasValue` nor the `sensitive` boolean is ever rendered; the only observable signal of sensitivity is the `- reason: sensitive` line.

**Repeat-ref rendering** — internal targetId `{repeatId}__agrune_repeatKey_{key}.{baseTargetId}`; `toAgentTargetRef` (`target-ref.ts:61-77`) emits `{repeatId}[key={key}].{baseTargetId}`, preferring `repeatInstance.repeatId`/`.key` when present, else parsing them out of the id. Non-repeat ids (no delimiter) are returned unchanged.

**`- none` & closing fence, `snapshot.ts:392-394`** — after the body loop, if the last line is still `` ```yaml `` (nothing emitted), push `- none`; then always push closing `` ``` ``; return `lines.join("\n")` (no trailing newline).

---

## A.8 Source References

- `packages/cli/src/daemon.ts` — `http.createServer`, route table, `sendJson`, `readJsonBody`, socket collision, `waitRequestFromBody`.
- `packages/cli/src/daemon-client.ts` — `isSocketEndpoint`, `rawRequest`, `requestJson`, `DAEMON_UNAVAILABLE`.
- `packages/cli/src/daemon-manager.ts` — `ensureDaemon`, spawn, `waitForHealthy`, `isHealthy`.
- `packages/cli/src/session-file.ts` — `defaultSocketPath`, `workspaceHash`, `DaemonSessionFile`.
- `packages/cli/src/args.ts` — flag parsing, subcommand tokens, `getDaemonEndpoint`.
- `packages/cli/src/cli.ts` — verb dispatch, `exitCodeFor()`, `helpText()`, run-handlers.
- `packages/cli/src/types.ts` — `DEFAULT_DAEMON_HOST`/`PORT`, `DaemonHealth`, `ErrorResponse`.
- `packages/cli/src/errors.ts` — re-export of `@agrune/backend` error helpers.
- `packages/backend/src/errors.ts` — `AgruneBackendError`/`CliError`, `asBackendError`, `errorResponse`.
- `packages/backend/src/snapshot.ts` — `formatSnapshot`, `quote`, build-stage ordering.
- `packages/core/src/index.ts` — `COMMAND_ERROR_CODES`, `CommandErrorCode`, `CommandErrorShape`, `PointerAction*`, `PointerCommandRequest`, `CommandResult*`, `PageTargetReason`.
- `packages/core/src/driver.ts` — `FillFormField*`, `FillFormResult`, `DropData`, `DropResult`, driver signatures.
- `packages/core/src/target-ref.ts` — `toAgentTargetRef`, `REPEATED_TARGET_KEY_DELIMITER`.
