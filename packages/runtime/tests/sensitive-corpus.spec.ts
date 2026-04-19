// @vitest-environment jsdom
/**
 * Phase 16 Plan 04 — RECORD-04 CI regression corpus.
 *
 * Aggregates 100+ synthetic form fixtures (login / payment / signup / profile)
 * across Korean / English / Japanese with standard and non-standard name
 * patterns (Pitfall 7). Computes precision / recall on the `isSensitive()`
 * DOM heuristic and fails the CI gate below a fixed threshold.
 *
 *   - precision ≥ 0.90  (false-positive rate bound)
 *   - recall    ≥ 0.95  (false-negative rate bound)
 *
 * Per-category metrics are console-logged on every run for CI debugging.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { isSensitive } from '../src/runtime/dom-utils'
import type { FormFixture } from './fixtures/corpus/types'
import { loginFixtures } from './fixtures/corpus/login'
import { paymentFixtures } from './fixtures/corpus/payment'
import { signupFixtures } from './fixtures/corpus/signup'
import { profileFixtures } from './fixtures/corpus/profile'

const ALL_FIXTURES: FormFixture[] = [
  ...loginFixtures,
  ...paymentFixtures,
  ...signupFixtures,
  ...profileFixtures,
]

const PRECISION_THRESHOLD = 0.90
const RECALL_THRESHOLD = 0.95

interface Metrics {
  tp: number
  fp: number
  fn: number
  tn: number
  precision: number
  recall: number
  totalFixtures: number
  totalElements: number
}

function evaluateFixtures(fixtures: FormFixture[]): Metrics {
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0
  let totalElements = 0

  for (const fx of fixtures) {
    if (fx.elements.length !== fx.expected.length) {
      throw new Error(
        `fixture ${fx.id}: elements.length (${fx.elements.length}) !== expected.length (${fx.expected.length})`,
      )
    }
    document.body.innerHTML = fx.html
    for (let i = 0; i < fx.elements.length; i++) {
      const selector = fx.elements[i]!
      const el = document.querySelector(selector) as HTMLElement | null
      if (!el) {
        throw new Error(`fixture ${fx.id}: selector not found — ${selector}`)
      }
      const predicted = isSensitive(el)
      const actual = fx.expected[i]!
      totalElements++
      if (predicted && actual) tp++
      else if (predicted && !actual) fp++
      else if (!predicted && actual) fn++
      else tn++
    }
  }

  return {
    tp,
    fp,
    fn,
    tn,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    totalFixtures: fixtures.length,
    totalElements,
  }
}

describe('Phase 16 RECORD-04: sensitive heuristic precision / recall corpus', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('corpus size ≥ 100 fixtures (RECORD-04 minimum)', () => {
    expect(ALL_FIXTURES.length).toBeGreaterThanOrEqual(100)
  })

  it(
    `precision ≥ ${PRECISION_THRESHOLD} AND recall ≥ ${RECALL_THRESHOLD} (CI gate)`,
    () => {
      const m = evaluateFixtures(ALL_FIXTURES)

      // Always log — CI output for debugging threshold failures
      // eslint-disable-next-line no-console
      console.log(
        `[RECORD-04] fixtures=${m.totalFixtures} elements=${m.totalElements} ` +
          `tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn} ` +
          `precision=${m.precision.toFixed(3)} recall=${m.recall.toFixed(3)}`,
      )

      expect(m.precision).toBeGreaterThanOrEqual(PRECISION_THRESHOLD)
      expect(m.recall).toBeGreaterThanOrEqual(RECALL_THRESHOLD)
    },
  )

  it('reports per-category metrics (no threshold — debugging aid)', () => {
    const categories = ['login', 'payment', 'signup', 'profile'] as const
    for (const category of categories) {
      const subset = ALL_FIXTURES.filter(f => f.category === category)
      expect(subset.length).toBeGreaterThan(0)
      const m = evaluateFixtures(subset)
      // eslint-disable-next-line no-console
      console.log(
        `[RECORD-04] category=${category} fixtures=${m.totalFixtures} ` +
          `elements=${m.totalElements} tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn} ` +
          `precision=${m.precision.toFixed(3)} recall=${m.recall.toFixed(3)}`,
      )
    }
  })
})
