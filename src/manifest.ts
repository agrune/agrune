// Manifest contract (v3-lite) + validation. SPEC §3, §10.2, A.0.5.
//
// Reproduces the original schema/validator, MINUS macros & canvas (dropped from the runtime
// schema per §10.2 — they are stripped, not rejected). Two deliberate divergences make the
// NORMATIVE-SUPERSEDING A.7 golden manifest validate as the M2 gate requires:
//   - `version`  → z.literal(3).default(3): the A.7.1 golden manifest omits it (matches
//     defineManifest's auto-stamp). A present `version` must still be exactly 3 (no v2).
//   - `template` → optional: the A.7.1 golden repeat omits it.

import { z } from 'zod'

// ---- forbidden-selector guards (§3.11.2) -----------------------------------

/**
 * Hash-class pattern: a class token of >=8 pure-alphanumeric chars NOT followed by a hyphen/
 * alphanumeric. Catches build-generated CSS-module/styled hashes (.aB3xK9p2) while sparing
 * Tailwind utilities (.items-center — hyphenated → not flagged).
 */
export const HASH_CLASS_PATTERN = /\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/
export const NTH_CHILD_PATTERN = /:nth-child\(/

export class SelectorForbiddenError extends Error {
  constructor(
    public readonly selector: string,
    message: string,
  ) {
    super(message)
    this.name = 'SelectorForbiddenError'
  }
}

/** Runtime guard re-run at resolve time for attr/css rungs (§3.11.2). */
export function assertNoHashClass(selector: string): void {
  if (HASH_CLASS_PATTERN.test(selector)) {
    throw new SelectorForbiddenError(
      selector,
      `Selector "${selector}" contains a likely hash-based class. Use role, text, testId, or stable attribute instead.`,
    )
  }
}

export function assertNoNthChild(selector: string): void {
  if (NTH_CHILD_PATTERN.test(selector)) {
    throw new SelectorForbiddenError(
      selector,
      `Selector "${selector}" uses :nth-child which is position-dependent. Use a stable identifier instead.`,
    )
  }
}

// ---- zod schema (§3.4–3.7) -------------------------------------------------

export const ActionKindSchema = z.enum([
  'click',
  'fill',
  'dblclick',
  'contextmenu',
  'hover',
  'longpress',
  'type',
  'press',
  'select',
  'upload',
  'drop',
])
export type ActionKind = z.infer<typeof ActionKindSchema>

export const SelectorLadderSchema = z
  .object({
    role: z.object({ name: z.string(), level: z.string().optional() }).optional(),
    text: z.string().optional(),
    testId: z.string().optional(),
    attr: z.string().optional(),
    css: z.string().optional(),
  })
  .refine((v) => Boolean(v.role || v.text || v.testId || v.attr || v.css), {
    message: 'SelectorLadder must define at least one of: role, text, testId, attr, css',
  })
export type SelectorLadder = z.infer<typeof SelectorLadderSchema>

export const TargetSchema = z.object({
  targetId: z.string().min(1),
  name: z.string().optional(),
  desc: z.string().optional(),
  actionKinds: z.array(ActionKindSchema).min(1),
  selector: SelectorLadderSchema,
  // OR-only lock (MANIFEST-04): false is REJECTED by literal(true). §3.11.3.
  sensitive: z.literal(true).optional(),
  onSuccess: z.string().optional(),
  onNoEffect: z.string().optional(),
  volatile: z.boolean().optional(),
  required: z.boolean().optional(),
})
export type ManifestTarget = z.infer<typeof TargetSchema>

export const RepeatSchema = z.object({
  repeatId: z.string().min(1),
  template: z.string().optional(),
  keyFrom: z.string(),
  nameFrom: z.string().optional(),
  strategy: z.enum(['dom', 'virtualized']),
  containerSelector: SelectorLadderSchema.optional(),
  targets: z.array(TargetSchema),
})
export type ManifestRepeat = z.infer<typeof RepeatSchema>

export const GroupSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().optional(),
  desc: z.string().optional(),
  route: z.string().optional(),
  targets: z.array(TargetSchema),
  repeats: z.array(RepeatSchema).optional(),
})
export type ManifestGroup = z.infer<typeof GroupSchema>

export const ManifestSchema = z.object({
  version: z.literal(3).default(3),
  groups: z.array(GroupSchema),
  // macros/canvas are accepted-and-stripped in the lean runtime (§10.2): allow unknown extras
  // to pass through validation without being carried.
})
export type AgruneManifest = z.infer<typeof ManifestSchema>

// ---- validateManifest (§3.11) ----------------------------------------------

export interface ValidateOk {
  ok: true
  manifest: AgruneManifest
}
export interface ValidateFail {
  ok: false
  errors: Array<{ path: string; message: string }>
}
export type ValidateResult = ValidateOk | ValidateFail

function checkLadder(ladder: SelectorLadder, path: string): string[] {
  const errors: string[] = []
  for (const field of ['attr', 'css'] as const) {
    const value = (ladder as Record<string, unknown>)[field]
    if (typeof value === 'string') {
      if (HASH_CLASS_PATTERN.test(value)) {
        errors.push(`${path}.selector.${field}: hash class forbidden ("${value}")`)
      }
      if (NTH_CHILD_PATTERN.test(value)) {
        errors.push(`${path}.selector.${field}: :nth-child forbidden ("${value}")`)
      }
    }
  }
  return errors
}

/** True when the failing zod path ends in `sensitive` and the raw input value is `false`. */
function pathIndicatesSensitiveFalse(path: readonly (string | number)[], root: unknown): boolean {
  if (path[path.length - 1] !== 'sensitive') return false
  let cur: unknown = root
  for (const key of path) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string | number, unknown>)[key]
    }
  }
  return cur === false
}

export function validateManifest(input: unknown): ValidateResult {
  const parsed = ManifestSchema.safeParse(input)
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => {
      const numericStringPath = issue.path.filter(
        (k): k is string | number => typeof k === 'string' || typeof k === 'number',
      )
      return {
        path: numericStringPath.join('.'),
        message: pathIndicatesSensitiveFalse(numericStringPath, input)
          ? 'sensitive:false is not allowed. The sensitive flag is OR-only: once detected as sensitive by manifest flag or runtime heuristic, it cannot be overridden to false. Remove the field or set to true.'
          : issue.message,
      }
    })
    return { ok: false, errors }
  }

  const ladderErrors: Array<{ path: string; message: string }> = []
  parsed.data.groups.forEach((group, gi) => {
    group.targets.forEach((target, ti) => {
      for (const e of checkLadder(
        target.selector as SelectorLadder,
        `groups[${gi}].targets[${ti}] (targetId=${target.targetId})`,
      )) {
        ladderErrors.push({ path: '', message: e })
      }
    })
    group.repeats?.forEach((repeat, ri) => {
      repeat.targets.forEach((target, ti) => {
        for (const e of checkLadder(
          target.selector as SelectorLadder,
          `groups[${gi}].repeats[${ri}].targets[${ti}] (targetId=${target.targetId})`,
        )) {
          ladderErrors.push({ path: '', message: e })
        }
      })
    })
  })

  // keyFrom build-time gate (§3.11.4): non-empty + compile-only (CSP EvalError → graceful skip).
  parsed.data.groups.forEach((group, gi) => {
    group.repeats?.forEach((repeat, ri) => {
      const path = `groups[${gi}].repeats[${ri}]`
      const trimmed = (repeat.keyFrom ?? '').trim()
      if (!trimmed) {
        ladderErrors.push({
          path,
          message: `repeatId="${repeat.repeatId}": keyFrom is required. Index-only identification is forbidden (reorder-vulnerable).`,
        })
        return
      }
      try {
        // Compile-only — never executed at validation time.
        new Function('el', `return String(${trimmed})`)
      } catch (err) {
        if (err instanceof SyntaxError) {
          ladderErrors.push({
            path,
            message: `repeatId="${repeat.repeatId}": keyFrom compile failed: ${(err as Error).message}`,
          })
        }
        // EvalError (CSP blocks Function) → graceful skip.
      }
    })
  })

  if (ladderErrors.length > 0) return { ok: false, errors: ladderErrors }
  return { ok: true, manifest: parsed.data }
}
