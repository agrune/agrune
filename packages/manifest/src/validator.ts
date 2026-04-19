import { ManifestSchema } from './schema.js'
import type { AgruneManifest, SelectorLadder } from './schema.js'

/**
 * 해시 class 패턴: 순수 alphanumeric 8자 이상이고 뒤에 하이픈/alphanumeric이 오지 않는 경우만 금지.
 * Pitfall 2 방어: Tailwind utility class(.flex, .items-center, .bg-blue-500 등)는 하이픈 포함이므로 오탐 없음.
 * 패턴: /\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/
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

/**
 * path 배열과 root 객체를 순회해 해당 위치의 값이 false인지 확인.
 * sensitive:false 판별에 사용 (zod 에러 메시지를 OR-only 안내로 교체).
 */
function pathIndicatesSensitiveFalse(
  path: readonly (string | number)[],
  root: unknown,
): boolean {
  if (path[path.length - 1] !== 'sensitive') return false
  let cur: unknown = root
  for (const key of path) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string | number, unknown>)[key]
    }
  }
  return cur === false
}

/**
 * manifest 구조를 zod로 검증 + css/attr selector의 해시 class / :nth-child를 추가로 검사.
 *
 * `sensitive: false`는 zod literal(true).optional()에 의해 차단되며, 에러 메시지에
 * "OR-only" 안내가 포함됨 — T-11-01, T-11-05, Pitfall 5 방어.
 */
export function validateManifest(input: unknown): ValidateResult {
  const parsed = ManifestSchema.safeParse(input)
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => {
      // zod의 issue.path는 (string | number | symbol)[] 타입이므로 symbol 제외
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

  // zod 통과 후 추가 ladder 검사 (hash class / :nth-child)
  const ladderErrors: Array<{ path: string; message: string }> = []
  parsed.data.groups.forEach((group, gi) => {
    group.targets.forEach((target, ti) => {
      const errs = checkLadder(
        target.selector as SelectorLadder,
        `groups[${gi}].targets[${ti}] (targetId=${target.targetId})`,
      )
      for (const e of errs) ladderErrors.push({ path: '', message: e })
    })
    group.repeats?.forEach((repeat, ri) => {
      repeat.targets.forEach((target, ti) => {
        const errs = checkLadder(
          target.selector as SelectorLadder,
          `groups[${gi}].repeats[${ri}].targets[${ti}] (targetId=${target.targetId})`,
        )
        for (const e of errs) ladderErrors.push({ path: '', message: e })
      })
    })
  })

  // Phase 15-03 (REPEAT-01/02/03): keyFrom stable key 필수 — 빌드 타임 gate
  // 빈 문자열 / 공백만 → 인덱스-only identification 원천 차단
  // new Function compile 시도 → 문법 오류 early detection (T-15-15 compile-only, 실행 없음)
  // CSP 환경에서 Function 생성 자체가 차단되면 graceful skip (T-15-16 Pitfall 2 방어)
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
      // Compile-time eval gate — T-15-15: compile만 수행, 실행하지 않음
      // Pitfall 2 방어: Function 생성자 자체가 차단되면 (CSP EvalError) → skip (graceful)
      try {
        // eslint-disable-next-line no-new-func
        new Function('el', `return String(${trimmed})`)
      } catch (err) {
        // SyntaxError: 문법 오류 → 빌드 실패
        // EvalError: CSP 차단 → skip (graceful) — EvalError는 아래에서 구분
        if (err instanceof SyntaxError) {
          ladderErrors.push({
            path,
            message: `repeatId="${repeat.repeatId}": keyFrom compile failed: ${(err as Error).message}`,
          })
        }
        // EvalError (CSP 차단) 등은 무시 — graceful skip
      }
    })
  })

  if (ladderErrors.length > 0) return { ok: false, errors: ladderErrors }
  return { ok: true, manifest: parsed.data as AgruneManifest }
}
