/**
 * RepeatExpander — Phase 15-02 (REPEAT-01, REPEAT-02)
 *
 * ManifestRepeat를 per-instance DOM 인스턴스 배열로 확장한다.
 * - DOM strategy: container scope 전체 row 열거
 * - Virtualized strategy: viewport 내 row만 + aria-rowcount/setsize READ-ONLY
 *
 * Security: `new Function('el', keyFrom)` 스코프 격리 (T-14-07 선례 재사용).
 *           `eval()` 직접 호출 금지.
 *           `setAttribute` 호출 금지 — READ-ONLY 계약 (T-15-10 mitigate).
 */

import type { ManifestRepeat } from '../types'
import { isElementInViewport } from './dom-utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** DoS 완화 cap: 단일 repeat에서 최대 허용 인스턴스 수 (T-15-06 mitigate) */
export const REPEAT_MAX_INSTANCES = 1000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** RepeatExpander.expand() / expandVirtualized() 반환 단위. */
export interface RepeatInstance {
  /** row element (container 내 querySelectorAll 결과) */
  el: HTMLElement
  /** keyFrom expr 평가 결과 stable key. 실패 시 `__idx_{index}` */
  key: string
  /** 0-based row 순서 */
  index: number
}

/** expandVirtualized() 반환 타입 — instances + aria hint */
export interface VirtualizedExpandResult {
  instances: RepeatInstance[]
  /** aria-rowcount > aria-setsize > null. READ-ONLY 추출 — inject 없음 */
  logicalSize: number | null
}

// ---------------------------------------------------------------------------
// RepeatExpander
// ---------------------------------------------------------------------------

export class RepeatExpander {
  /**
   * DOM strategy: container(또는 document) 안에서 row CSS selector로 전체 element 열거.
   * keyFrom은 `new Function('el', expr)` 스코프 격리 실행 (T-14-07).
   */
  expand(repeat: ManifestRepeat, container?: HTMLElement | Document): RepeatInstance[] {
    const scope: HTMLElement | Document = container ?? document
    const rowCss = this.resolveRowCss(repeat)
    const all = Array.from(scope.querySelectorAll<HTMLElement>(rowCss))
    const capped = this.applyCap(all, repeat.repeatId)
    return this.buildInstances(capped, repeat.keyFrom, repeat.repeatId)
  }

  /**
   * Virtualized strategy: viewport 내부 row만 반환 + aria-rowcount/setsize READ-ONLY 추출.
   * Pitfall 5: setAttribute 절대 금지.
   */
  expandVirtualized(
    repeat: ManifestRepeat,
    container?: HTMLElement,
  ): VirtualizedExpandResult {
    const scope: HTMLElement | Document = container ?? document
    const rowCss = this.resolveRowCss(repeat)
    const all = Array.from(scope.querySelectorAll<HTMLElement>(rowCss))
    // viewport 내 row만 (isElementInViewport은 dom-utils 재사용)
    const visible = all.filter((el) => isElementInViewport(el))
    const capped = this.applyCap(visible, repeat.repeatId)
    const instances = this.buildInstances(capped, repeat.keyFrom, repeat.repeatId)
    const logicalSize = this.readLogicalSize(container ?? null)
    return { instances, logicalSize }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * repeat.targets[0].selector.css를 row CSS selector로 사용.
   * css 없으면 testId → role → '*' 순서로 fallback.
   */
  private resolveRowCss(repeat: ManifestRepeat): string {
    const firstTarget = repeat.targets[0]
    if (!firstTarget) return '*'
    const ladder = firstTarget.selector
    if (ladder.css) return ladder.css
    if (ladder.testId) return `[data-testid="${CSS.escape(ladder.testId)}"]`
    if (ladder.role) return `[role="${CSS.escape(ladder.role.name)}"]`
    if (ladder.attr) return `[${ladder.attr}]`
    return '*'
  }

  /**
   * 리스트를 REPEAT_MAX_INSTANCES 개까지만 허용 (DoS cap, T-15-06).
   * 초과 시 경고 + 앞 1000개만 반환.
   */
  private applyCap<T>(list: T[], repeatId: string): T[] {
    if (list.length <= REPEAT_MAX_INSTANCES) return list
    console.warn(
      `[agrune] RepeatExpander: repeat "${repeatId}" truncated from ${list.length} to ${REPEAT_MAX_INSTANCES} instances (DoS cap)`,
    )
    return list.slice(0, REPEAT_MAX_INSTANCES)
  }

  /**
   * element 배열 → RepeatInstance 배열.
   *
   * keyFrom 평가 순서:
   *   1. `new Function('el', `return String(${expr})`)` 컴파일 시도 (T-15-05 스코프 격리)
   *   2. 컴파일 실패(문법 오류, CSP EvalError) → 경고 + 모든 인스턴스 fallback `__idx_N`
   *   3. 런타임 실행 실패(ReferenceError, 예외) → 해당 인스턴스만 fallback + 경고
   *   4. 결과가 undefined/null/'undefined'/'null' → fallback + 경고
   *   5. 중복 key → `{key}__dup_{index}` suffix + 경고 (Pitfall 3)
   */
  private buildInstances(
    els: HTMLElement[],
    keyFromExpr: string,
    repeatId: string,
  ): RepeatInstance[] {
    // --- Step 1: 한 번만 컴파일 (T-14-07: new Function 스코프 격리) ---
    let keyFn: ((el: HTMLElement) => string) | null = null
    try {
      // T-15-05: 'el' 하나만 노출 — 나머지 식별자는 ReferenceError
      keyFn = new Function('el', `return String(${keyFromExpr})`) as (el: HTMLElement) => string
    } catch (err) {
      // CSP(EvalError) 또는 문법 오류(SyntaxError) → 모든 인스턴스 fallback
      console.warn(
        `[agrune] RepeatExpander: keyFrom compile failed for repeat "${repeatId}":`,
        err,
      )
    }

    const seen = new Map<string, number>()

    return els.map((el, index) => {
      let key: string

      if (keyFn) {
        try {
          const raw = keyFn(el)
          // undefined/null/'undefined'/'null' → fallback
          if (raw === undefined || raw === null || raw === 'undefined' || raw === 'null') {
            console.warn(
              `[agrune] RepeatExpander: keyFrom returned ${JSON.stringify(raw)} for repeat "${repeatId}" at index ${index}, using fallback`,
            )
            key = `__idx_${index}`
          } else {
            key = raw
          }
        } catch (err) {
          console.warn(
            `[agrune] RepeatExpander: keyFrom eval failed for repeat "${repeatId}" at index ${index}:`,
            err,
          )
          key = `__idx_${index}`
        }
      } else {
        // 컴파일 실패 → 모든 인스턴스 fallback
        key = `__idx_${index}`
      }

      // --- 중복 key 처리 (Pitfall 3) ---
      if (seen.has(key)) {
        const dupKey = `${key}__dup_${index}`
        console.warn(
          `[agrune] RepeatExpander: duplicate key "${key}" for repeat "${repeatId}" at index ${index}, using "${dupKey}"`,
        )
        seen.set(dupKey, index)
        return { el, key: dupKey, index }
      }

      seen.set(key, index)
      return { el, key, index }
    })
  }

  /**
   * container element에서 aria-rowcount/setsize를 READ-ONLY로 읽어 logicalSize 반환.
   * Pitfall 5: setAttribute/setAttributeNS 절대 금지 — T-15-10 mitigate.
   *
   * 우선순위: aria-rowcount > aria-setsize > null
   */
  private readLogicalSize(container: HTMLElement | null): number | null {
    if (!container) return null

    const rowCount = container.getAttribute('aria-rowcount')
    if (rowCount !== null) {
      const n = Number.parseInt(rowCount, 10)
      if (Number.isFinite(n) && n >= 0) return n
      // NaN 또는 음수 → null (유효하지 않은 값)
      return null
    }

    const setSize = container.getAttribute('aria-setsize')
    if (setSize !== null) {
      const n = Number.parseInt(setSize, 10)
      if (Number.isFinite(n) && n >= 0) return n
    }

    return null
  }
}
