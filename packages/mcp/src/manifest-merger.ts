import {
  IndentationText,
  Project,
  SyntaxKind,
  type ArrayLiteralExpression,
  type CallExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
} from 'ts-morph'
import { createTwoFilesPatch } from 'diff'
import {
  assertNoHashClass,
  assertNoNthChild,
  type SelectorLadder,
} from '@agrune/manifest'
import { PendingStore, type PendingCaptureFile } from './pending-store.js'

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * Structured merge error. Callers (watcher) switch on `code` to decide whether
 * to skip, warn, or surface to the user. Messages are safe to print to stderr.
 */
export class MergeError extends Error {
  constructor(
    public readonly code: MergeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MergeError'
  }
}

export type MergeErrorCode =
  | 'CALL_NOT_FOUND'
  | 'INLINE_REQUIRED'
  | 'TARGETS_NOT_FOUND'
  | 'DUPLICATE_TARGET'
  | 'INVALID_TARGET_ID'
  | 'INVALID_SELECTOR'
  | 'EMPTY_TARGETS'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MergeResult {
  /** New full source text (ts-morph `getFullText()`) — write this to disk. */
  merged: string
  /** Unified diff between sourceText and merged — stdout preview. */
  diff: string
  /** targetIds that were inserted. */
  addedTargetIds: string[]
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Merge a pending capture into a user's `manifest.ts` text. Pure function —
 * does not touch the filesystem. ts-morph operates on an in-memory source and
 * we extract the changed text via `getFullText()` (never the project-save
 * API), so T-16-10 cannot manifest — see tests.
 *
 * - T-16-09 — sanitizes pending targetIds and rejects selectors that use hash
 *   classes or `:nth-child` via `assertNoHashClass`/`assertNoNthChild`.
 * - T-16-10 — the caller writes `merged` to disk using its own bounded path;
 *   no ts-morph filesystem write is ever invoked.
 */
export function mergeTargetIntoManifest(
  sourceText: string,
  pending: PendingCaptureFile,
  manifestFilePath: string,
): MergeResult {
  if (!pending.targets || pending.targets.length === 0) {
    throw new MergeError('EMPTY_TARGETS', 'pending file has no targets')
  }

  // 1. Pending sanitize (T-16-09). Re-runs the MCP-boundary check on every
  //    pending file — even ones a user may have hand-edited after MCP wrote
  //    them.
  for (const t of pending.targets) {
    try {
      PendingStore.sanitizeTargetId(t.targetId)
    } catch (err) {
      throw new MergeError(
        'INVALID_TARGET_ID',
        `pending targetId rejected: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    assertSelectorSafe(t.selector as SelectorLadder, t.targetId)
  }

  // 2. ts-morph Project — in-memory only, never saved. Match the existing
  //    trailing-comma and indentation style so diffs stay minimal.
  const hasTrailingComma = detectTrailingCommaStyle(sourceText)
  const indentationText = detectIndentation(sourceText)

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: false,
    manipulationSettings: {
      useTrailingCommas: hasTrailingComma,
      indentationText,
    },
  })
  const sf = project.createSourceFile(manifestFilePath, sourceText, {
    overwrite: true,
  })

  // 3. Locate the `defineManifest({...})` call.
  const call = findDefineManifestCall(sf)
  if (!call) {
    throw new MergeError('CALL_NOT_FOUND', 'defineManifest call not found')
  }
  const args = call.getArguments()
  if (args.length === 0 || args[0].getKind() !== SyntaxKind.ObjectLiteralExpression) {
    throw new MergeError(
      'INLINE_REQUIRED',
      'defineManifest argument must be inline object literal (no variable reference)',
    )
  }
  const configObj = args[0] as ObjectLiteralExpression

  // 4. Resolve the target-insertion site. Prefer `targets` (flat form the plan
  //    references) but fall back to `groups[0].targets` for the schema form.
  const arr = resolveTargetsArray(configObj)
  if (!arr) {
    throw new MergeError(
      'TARGETS_NOT_FOUND',
      'defineManifest({...}) must have targets: [] or groups: [defineGroup({ targets: [] })]',
    )
  }

  // 5. Collect existing targetIds to reject duplicates.
  const existingIds = collectExistingTargetIds(sf)

  const added: string[] = []
  for (const t of pending.targets) {
    if (existingIds.has(t.targetId)) {
      throw new MergeError(
        'DUPLICATE_TARGET',
        `duplicate targetId: ${t.targetId}`,
      )
    }
    const elementText = buildDefineTargetText({
      targetId: t.targetId,
      selector: t.selector as SelectorLadder,
      ...(t.sensitive ? { sensitive: true as const } : {}),
    })
    arr.addElement(elementText)
    existingIds.add(t.targetId)
    added.push(t.targetId)
  }

  // 6. Extract merged text and build the unified diff.
  const merged = sf.getFullText()
  const diff = createTwoFilesPatch(
    manifestFilePath,
    manifestFilePath,
    sourceText,
    merged,
  )
  return { merged, diff, addedTargetIds: added }
}

/**
 * Build a `defineTarget({...})` source expression from a pending target. The
 * values are serialised with JSON.stringify, which guarantees that anything
 * hostile (quotes, closing brackets, backslashes) becomes a literal string
 * and cannot escape out of the expression.
 *
 * `actionKinds` is defaulted to `['click']` because the recorder capture
 * layer cannot derive an action kind from a pure selector capture. Users
 * tweak this after the merge (plan decision: this is intentional — recorder
 * does not promise 100% automation).
 */
export function buildDefineTargetText(target: {
  targetId: string
  selector: SelectorLadder
  sensitive?: true
}): string {
  const parts: string[] = []
  parts.push(`targetId: ${JSON.stringify(target.targetId)}`)
  parts.push(`selector: ${JSON.stringify(target.selector)}`)
  parts.push(`actionKinds: ['click']`)
  if (target.sensitive) parts.push(`sensitive: true`)
  return `defineTarget({ ${parts.join(', ')} })`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Run the existing `@agrune/manifest` selector guardrails on every provided
 * selector field. Reuses the validator's hash-class / :nth-child regexes so
 * the CLI and authoring-time validator stay in lock-step.
 */
function assertSelectorSafe(selector: SelectorLadder, targetId: string): void {
  const attr = (selector as { attr?: string }).attr
  const css = (selector as { css?: string }).css
  try {
    if (typeof attr === 'string') {
      assertNoHashClass(attr)
      assertNoNthChild(attr)
    }
    if (typeof css === 'string') {
      assertNoHashClass(css)
      assertNoNthChild(css)
    }
  } catch (err) {
    throw new MergeError(
      'INVALID_SELECTOR',
      `selector for ${targetId} rejected: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

function findDefineManifestCall(sf: SourceFile): CallExpression | undefined {
  return sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => {
      const expr = c.getExpression()
      // Match both `defineManifest(...)` and `someAlias.defineManifest(...)`
      const text = expr.getText()
      return text === 'defineManifest' || text.endsWith('.defineManifest')
    })
}

/**
 * Prefer a `targets: [...]` property directly on the defineManifest config,
 * else fall through to `groups[0].defineGroup({ targets: [...] })` pattern.
 */
function resolveTargetsArray(
  configObj: ObjectLiteralExpression,
): ArrayLiteralExpression | null {
  // a) top-level `targets`
  const direct = configObj.getProperty('targets')
  const directArr = asArrayInitializer(direct)
  if (directArr) return directArr

  // b) groups[0].{targets: [...]}
  const groupsProp = configObj.getProperty('groups')
  const groupsArr = asArrayInitializer(groupsProp)
  if (!groupsArr) return null

  const firstGroup = groupsArr.getElements()[0]
  if (!firstGroup) return null

  // firstGroup may be a defineGroup(...) call or an inline object literal.
  let groupObj: ObjectLiteralExpression | undefined
  if (firstGroup.getKind() === SyntaxKind.ObjectLiteralExpression) {
    groupObj = firstGroup as ObjectLiteralExpression
  } else if (firstGroup.getKind() === SyntaxKind.CallExpression) {
    const groupCall = firstGroup as CallExpression
    const groupArg = groupCall.getArguments()[0]
    if (groupArg && groupArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
      groupObj = groupArg as ObjectLiteralExpression
    }
  }
  if (!groupObj) return null

  const targetsProp = groupObj.getProperty('targets')
  return asArrayInitializer(targetsProp)
}

function asArrayInitializer(
  prop: ReturnType<ObjectLiteralExpression['getProperty']>,
): ArrayLiteralExpression | null {
  if (!prop) return null
  if (prop.getKind() !== SyntaxKind.PropertyAssignment) return null
  const init = (prop as PropertyAssignment).getInitializer()
  if (!init) return null
  if (init.getKind() !== SyntaxKind.ArrayLiteralExpression) return null
  return init as ArrayLiteralExpression
}

/**
 * Collect every existing targetId in the source by walking all property
 * assignments whose name is exactly `targetId` with a string-literal value.
 * This catches both `defineTarget({ targetId: 'x', ... })` and object literals
 * inside `targets` / nested `repeats` alike.
 */
function collectExistingTargetIds(sf: SourceFile): Set<string> {
  const ids = new Set<string>()
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const nameText = pa.getNameNode().getText()
    if (nameText !== 'targetId') continue
    const init = pa.getInitializer()
    if (!init) continue
    const kind = init.getKind()
    if (kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      // getLiteralText strips the surrounding quotes/backticks.
      const text = (init as unknown as { getLiteralText(): string }).getLiteralText()
      ids.add(text)
    }
  }
  return ids
}

function detectTrailingCommaStyle(sourceText: string): boolean {
  // Heuristic: look for `,` before a closing `]`, `}`, or `)` with only
  // whitespace between. Matches multi-line trailing commas without accepting
  // a bare closing bracket.
  return /,\s*[\]\}\)]/m.test(sourceText)
}

function detectIndentation(sourceText: string): IndentationText {
  // First non-empty indent wins. Tab or >=2 spaces.
  const match = sourceText.match(/^(\t+|[ ]{2,})/m)
  if (!match) return IndentationText.TwoSpaces
  if (match[1].startsWith('\t')) return IndentationText.Tab
  if (match[1].length >= 4) return IndentationText.FourSpaces
  return IndentationText.TwoSpaces
}
