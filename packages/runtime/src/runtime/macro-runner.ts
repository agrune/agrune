import type { ManifestMacro, MacroStep } from '@agrune/manifest'
import { isSensitive } from './dom-utils'
import { resolveRuntimeTarget } from './snapshot'
import type { CommandHandlerDeps } from './command-handlers'
import { handleAct, handleFill } from './command-handlers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MacroResult =
  | { status: 'ok' }
  | { status: 'already-satisfied' }
  | { status: 'precondition-failed'; reason: string }
  | { status: 'postcondition-failed'; reason: string }
  | { status: 'circuit-open'; failedStep: number }
  | { status: 'step-error'; stepIndex: number; error: string }
  | { status: 'target-not-found'; stepIndex: number; targetId: string }

export interface MacroRunnerDeps {
  commandHandlerDeps: CommandHandlerDeps
  onStepStart?: (i: number, step: MacroStep) => void
  onStepEnd?: (i: number, step: MacroStep, ok: boolean) => void
  onSensitiveStep?: (i: number, step: MacroStep) => void
}

type RuntimeActAction = 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'

const RUNTIME_ACT_ACTIONS = new Set<MacroStep['action']>([
  'click',
  'dblclick',
  'contextmenu',
  'hover',
  'longpress',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `{{key}}` 형태의 플레이스홀더를 params 값으로 대체.
 * 누락 키는 빈 문자열로 처리.
 */
export function interpolateParams(
  template: string,
  params: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] == null ? '' : String(params[key]),
  )
}

// ---------------------------------------------------------------------------
// MacroRunner
// ---------------------------------------------------------------------------

export class MacroRunner {
  private consecutiveFailures = 0
  private resetTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(private readonly deps: MacroRunnerDeps) {}

  /**
   * manifest.precondition → step loop → manifest.postcondition 을 단일 호출로 완결.
   * CDP round-trip 없음 — handleAct/handleFill 은 in-page DOM 조작만 수행.
   */
  async run(
    macro: ManifestMacro,
    params: Record<string, unknown> = {},
  ): Promise<MacroResult> {
    // T-14-13: dispose 후 호출 가드
    if (this.disposed) {
      return { status: 'step-error', stepIndex: -1, error: 'runner disposed' }
    }

    const threshold = macro.circuitBreaker?.maxRetries ?? 2
    const resetAfterMs = macro.circuitBreaker?.resetAfterMs

    // Schedule reset timer when resetAfterMs is configured
    if (resetAfterMs != null && resetAfterMs > 0) {
      this.scheduleReset(resetAfterMs)
    }

    // ------------------------------------------------------------------
    // Precondition evaluation
    // ------------------------------------------------------------------
    if (macro.precondition) {
      const evalResult = this.evalExpr(macro.precondition, params)
      if (evalResult.ok) {
        if (evalResult.value === true) {
          return { status: 'already-satisfied' }
        }
        // false → enter step loop normally
      } else {
        return { status: 'precondition-failed', reason: evalResult.error }
      }
    }

    // ------------------------------------------------------------------
    // Step loop — no CDP round-trips
    // ------------------------------------------------------------------
    const descriptors = this.deps.commandHandlerDeps.getDescriptors()

    for (let i = 0; i < macro.steps.length; i++) {
      const step = macro.steps[i]!

      this.deps.onStepStart?.(i, step)

      // Target resolution
      const match = resolveRuntimeTarget(descriptors, step.targetId)
      if (!match) {
        this.consecutiveFailures++
        this.deps.onStepEnd?.(i, step, false)
        if (this.consecutiveFailures >= threshold) {
          return { status: 'circuit-open', failedStep: i }
        }
        // 마지막 step 이거나 threshold 미달이면 target-not-found 반환
        // (다음 run 에서 consecutiveFailures 이월)
        if (i === macro.steps.length - 1) {
          return { status: 'target-not-found', stepIndex: i, targetId: step.targetId }
        }
        // threshold 미달이고 step 이 더 남은 경우 → 계속 다음 step 시도
        continue
      }

      // Sensitive step detection (Plan 14-01 OR-chain: manifestFlag OR runtime heuristic)
      if (isSensitive(match.element, step.sensitive)) {
        this.deps.onSensitiveStep?.(i, step)
      }

      // Dispatch action
      let commandResult: { ok: boolean; error?: { message: string } }
      try {
        if (step.action === 'fill') {
          const value = step.value != null ? interpolateParams(step.value, params) : ''
          commandResult = await handleFill(this.deps.commandHandlerDeps, {
            targetId: step.targetId,
            value,
          })
        } else if (isRuntimeActAction(step.action)) {
          commandResult = await handleAct(this.deps.commandHandlerDeps, {
            targetId: step.targetId,
            action: step.action,
          })
        } else {
          commandResult = {
            ok: false,
            error: { message: `macro action "${step.action}" is not supported by the page runtime runner` },
          }
        }
      } catch (err) {
        this.consecutiveFailures++
        this.deps.onStepEnd?.(i, step, false)
        if (this.consecutiveFailures >= threshold) {
          return { status: 'circuit-open', failedStep: i }
        }
        // threshold 미달이고 step 이 더 남은 경우 → continue (consecutiveFailures 이월)
        if (i < macro.steps.length - 1) {
          continue
        }
        return {
          status: 'step-error',
          stepIndex: i,
          error: err instanceof Error ? err.message : String(err),
        }
      }

      // Update consecutive failure counter
      if (commandResult.ok) {
        // Successful step resets consecutive failure count
        this.consecutiveFailures = 0
      } else {
        this.consecutiveFailures++
      }

      this.deps.onStepEnd?.(i, step, commandResult.ok)

      // Circuit breaker check
      if (this.consecutiveFailures >= threshold) {
        return { status: 'circuit-open', failedStep: i }
      }

      // Step-level error (below threshold): continue if more steps remain
      if (!commandResult.ok) {
        if (i < macro.steps.length - 1) {
          continue
        }
        return {
          status: 'step-error',
          stepIndex: i,
          error: commandResult.error?.message ?? 'step failed',
        }
      }
    }

    // ------------------------------------------------------------------
    // Postcondition evaluation
    // ------------------------------------------------------------------
    if (macro.postcondition) {
      const evalResult = this.evalExpr(macro.postcondition, params)
      if (!evalResult.ok) {
        this.consecutiveFailures++
        return { status: 'postcondition-failed', reason: evalResult.error }
      }
      if (evalResult.value !== true) {
        this.consecutiveFailures++
        return { status: 'postcondition-failed', reason: 'postcondition returned falsy' }
      }
    }

    return { status: 'ok' }
  }

  /** 모든 타이머를 정리하고 runner를 사용 불가 상태로 표시. */
  dispose(): void {
    this.disposed = true
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private scheduleReset(ms: number): void {
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer)
    }
    this.resetTimer = setTimeout(() => {
      this.consecutiveFailures = 0
      this.resetTimer = null
    }, ms)
  }

  /**
   * `new Function` 기반 sandboxed 식 평가 (T-14-07).
   * - `eval()` 직접 호출 금지 — caller scope 변수 접근 방지
   * - params 만 context 로 주입; 식 내 다른 identifier 는 ReferenceError
   * - 결과는 boolean 캐스팅만 사용 (side-effect 는 무시)
   */
  private evalExpr(
    expr: string,
    params: Record<string, unknown>,
  ): { ok: true; value: boolean } | { ok: false; error: string } {
    try {
      // T-14-07: new Function 스코프 격리 — direct eval() 사용 금지
      // 'params' 만 인자로 노출; 나머지 식별자는 ReferenceError
      const fn = new Function('params', `return !!(${expr})`) as (
        p: Record<string, unknown>,
      ) => boolean
      return { ok: true, value: fn(params) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

function isRuntimeActAction(action: MacroStep['action']): action is RuntimeActAction {
  return RUNTIME_ACT_ACTIONS.has(action)
}
