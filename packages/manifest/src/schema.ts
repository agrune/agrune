import { z } from 'zod'

// ─── TypeScript Types ─────────────────────────────────────────────────────────

export type ActionKind =
  | 'click'
  | 'fill'
  | 'dblclick'
  | 'contextmenu'
  | 'hover'
  | 'longpress'
  | 'type'
  | 'press'
  | 'select'
  | 'upload'
  | 'drop'

/**
 * AtLeastOne<T> — T의 키 중 최소 1개는 반드시 존재해야 하는 타입 helper.
 * SelectorLadder는 role/text/testId/attr/css 중 최소 1개가 필수.
 */
type AtLeastOne<T> = { [K in keyof T]: Pick<T, K> & Partial<Omit<T, K>> }[keyof T]

export type SelectorLadder = AtLeastOne<{
  role: { name: string; level?: string }
  text: string
  testId: string
  attr: string
  css: string
}>

export interface MacroStep {
  targetId: string
  action: ActionKind
  value?: string
  /** sensitive는 OR-only 계약: true만 허용, false 불가 */
  sensitive?: true
}

export interface ManifestTarget {
  targetId: string
  name?: string
  desc?: string
  actionKinds: ActionKind[]
  selector: SelectorLadder
  /** sensitive는 OR-only 계약: true만 허용, false는 타입 레벨에서 차단 — MANIFEST-04 */
  sensitive?: true
  /**
   * Authored post-action feedback, surfaced to the agent AFTER it acts on this
   * target, gated on whether the action actually changed the screen (snapshot
   * version delta). `onSuccess` explains the new screen / what to do next;
   * `onNoEffect` explains why a mechanically-successful action produced no change
   * (e.g. a Next blocked by an empty required field). Authoring rule: keep them at
   * the manifest's abstraction level — describe the semantic role, never bake in
   * dynamic facts (step counts, item counts) that drift even when selectors don't.
   */
  onSuccess?: string
  onNoEffect?: string
  /**
   * Render this target's `desc` even when descriptions are otherwise suppressed
   * (compact/no-desc rendering modes). Use it to pin an explanation onto the few
   * targets that actually need it — a required-field gotcha, a non-obvious
   * control — instead of paying the desc token cost on every target every turn.
   */
  alwaysDesc?: boolean
  /**
   * Exclude this target's text/value from the snapshot signature, so its own
   * churn (a clock, a "x seconds ago" stamp, a live counter, an animation label)
   * does NOT bump the snapshot version. Without this, a self-updating target makes
   * every action look like it "changed the screen" — corrupting the onSuccess /
   * onNoEffect gate and forcing needless re-renders. The target is still shown;
   * it just no longer counts as a screen change.
   */
  volatile?: boolean
  /**
   * Mark this fillable target as required even when the DOM carries no `required`
   * / `aria-required` attribute. Feeds the deterministic "still-needed fields"
   * nudge (pendingRequired) so the agent learns which inputs gate a Create/Next/
   * Submit. DOM-detected required intent is honored regardless of this flag.
   */
  required?: boolean
}

export interface ManifestRepeat {
  repeatId: string
  /** target 이름 템플릿 (예: "post_${key}") */
  template: string
  /** JS 표현식으로 key를 추출 (예: "el.dataset.postId") — Phase 15에서 함수 형태 추가 예정 */
  keyFrom: string
  nameFrom?: string
  strategy: 'dom' | 'virtualized'
  /** Phase 15-01 (REPEAT-01): Optional container element selector for row enumeration.
   *  If absent, RepeatExpander uses `document` as scope. */
  containerSelector?: SelectorLadder
  targets: ManifestTarget[]
}

export interface ManifestMacro {
  macroId: string
  name?: string
  desc?: string
  params: Record<string, { type: 'string' | 'number' | 'boolean'; required?: boolean }>
  steps: MacroStep[]
  precondition?: string
  postcondition?: string
  circuitBreaker?: {
    maxRetries: number
    resetAfterMs?: number
  }
}

export interface ManifestGroup {
  groupId: string
  name?: string
  desc?: string
  /** URL/route 범위 (빈 = 전역). RegExp은 JSON 직렬화 불가이므로 string만 허용 */
  route?: string
  targets: ManifestTarget[]
  repeats?: ManifestRepeat[]
}

export interface AgruneManifest {
  version: 3
  groups: ManifestGroup[]
  macros?: ManifestMacro[]
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

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

export const SelectorLadderSchema = z
  .object({
    role: z.object({ name: z.string(), level: z.string().optional() }).optional(),
    text: z.string().optional(),
    testId: z.string().optional(),
    attr: z.string().optional(),
    css: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.role || v.text || v.testId || v.attr || v.css),
    { message: 'SelectorLadder must define at least one of: role, text, testId, attr, css' },
  )

export const TargetSchema = z.object({
  targetId: z.string().min(1),
  name: z.string().optional(),
  desc: z.string().optional(),
  actionKinds: z.array(ActionKindSchema).min(1),
  selector: SelectorLadderSchema,
  // false 차단 — MANIFEST-04 OR-only lock. z.boolean()을 쓰면 false가 통과됨 (Pitfall 5)
  sensitive: z.literal(true).optional(),
  // Authored post-action feedback (gated on a real screen change). Optional; a
  // target with neither field simply produces no feedback line.
  onSuccess: z.string().optional(),
  onNoEffect: z.string().optional(),
  alwaysDesc: z.boolean().optional(),
  // Exclude this target's text/value from the snapshot signature (self-updating
  // controls like clocks/counters must not register as screen changes).
  volatile: z.boolean().optional(),
  // Author-marked required (DOM-detected required intent is honored regardless);
  // feeds the deterministic pendingRequired nudge.
  required: z.boolean().optional(),
})

export const RepeatSchema = z.object({
  repeatId: z.string().min(1),
  template: z.string(),
  keyFrom: z.string(),
  nameFrom: z.string().optional(),
  strategy: z.enum(['dom', 'virtualized']),
  // Phase 15-01 (REPEAT-01): containerSelector optional — absent시 RepeatExpander가 document scope 사용
  containerSelector: SelectorLadderSchema.optional(),
  targets: z.array(TargetSchema),
})

export const MacroStepSchema = z.object({
  targetId: z.string().min(1),
  action: ActionKindSchema,
  value: z.string().optional(),
  sensitive: z.literal(true).optional(),
})

export const MacroSchema = z.object({
  macroId: z.string().min(1),
  name: z.string().optional(),
  desc: z.string().optional(),
  params: z.record(
    z.string(),
    z.object({
      type: z.enum(['string', 'number', 'boolean']),
      required: z.boolean().optional(),
    }),
  ),
  steps: z.array(MacroStepSchema).min(1),
  precondition: z.string().optional(),
  postcondition: z.string().optional(),
  circuitBreaker: z
    .object({
      maxRetries: z.number().int().nonnegative(),
      resetAfterMs: z.number().int().nonnegative().optional(),
    })
    .optional(),
})

export const GroupSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().optional(),
  desc: z.string().optional(),
  route: z.string().optional(),
  targets: z.array(TargetSchema),
  repeats: z.array(RepeatSchema).optional(),
})

export const ManifestSchema = z.object({
  version: z.literal(3),
  groups: z.array(GroupSchema),
  macros: z.array(MacroSchema).optional(),
})
