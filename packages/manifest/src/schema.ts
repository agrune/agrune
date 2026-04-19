import { z } from 'zod'

// ─── TypeScript Types ─────────────────────────────────────────────────────────

export type ActionKind = 'click' | 'fill' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'

export interface FiberPathSegment {
  /** getDisplayName(fiber.type) — empty string if anonymous */
  componentName: string
  /** fiber.key (React key prop) — null if not keyed */
  key: string | null
  /** fiber.index (sibling 순서) — non-negative integer */
  index: number
}

/** DOM 노드를 식별하는 직렬화 가능한 경로 (컴포넌트 → root 방향). Max 8 segments. */
export type FiberIdentityPath = FiberPathSegment[]

/**
 * AtLeastOne<T> — T의 키 중 최소 1개는 반드시 존재해야 하는 타입 helper.
 * SelectorLadder는 role/text/testId/attr/css/fiber 중 최소 1개가 필수.
 */
type AtLeastOne<T> = { [K in keyof T]: Pick<T, K> & Partial<Omit<T, K>> }[keyof T]

export type SelectorLadder = AtLeastOne<{
  role: { name: string; level?: string }
  text: string
  testId: string
  attr: string
  css: string
  fiber: { path: FiberIdentityPath }
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

export const ActionKindSchema = z.enum(['click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress'])

export const SelectorLadderSchema = z
  .object({
    role: z.object({ name: z.string(), level: z.string().optional() }).optional(),
    text: z.string().optional(),
    testId: z.string().optional(),
    attr: z.string().optional(),
    css: z.string().optional(),
    fiber: z.object({
      path: z.array(z.object({
        componentName: z.string(),
        key: z.string().nullable(),
        index: z.number().int().nonnegative(),
      })).min(1).max(8),
    }).optional(),
  })
  .refine(
    (v) => Boolean(v.role || v.text || v.testId || v.attr || v.css || v.fiber),
    { message: 'SelectorLadder must define at least one of: role, text, testId, attr, css, fiber' },
  )

export const TargetSchema = z.object({
  targetId: z.string().min(1),
  name: z.string().optional(),
  desc: z.string().optional(),
  actionKinds: z.array(ActionKindSchema).min(1),
  selector: SelectorLadderSchema,
  // false 차단 — MANIFEST-04 OR-only lock. z.boolean()을 쓰면 false가 통과됨 (Pitfall 5)
  sensitive: z.literal(true).optional(),
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
