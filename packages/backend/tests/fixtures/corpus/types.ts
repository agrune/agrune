/**
 * Phase 16 Plan 04 (RECORD-04) — Sensitive heuristic CI corpus.
 *
 * Shared fixture shape consumed by `sensitive-corpus.spec.ts`.
 *
 * Each fixture is a standalone HTML snippet + per-element `expected` ground
 * truth so the spec can compute precision/recall across all fixtures.
 */
export interface FormFixture {
  /** 고유 식별자 — 실패 디버깅에 사용 (`<category>-<lang>-<nn>`). */
  id: string
  /** jsdom `document.body.innerHTML` 에 주입할 HTML snippet. */
  html: string
  /** `document.querySelector(...)` 로 찾을 selector 배열. */
  elements: string[]
  /** 각 element 의 기대 `isSensitive()` 값 — `elements` 와 동일 길이. */
  expected: boolean[]
  /** 언어 레이블 — 카테고리별 coverage 검증용. */
  lang: 'ko' | 'en' | 'ja'
  /** 카테고리 레이블 — per-category metric reporting. */
  category: 'login' | 'payment' | 'signup' | 'profile'
  /** 어려운 케이스 주석 (Pitfall 7 등). 선택. */
  notes?: string
}
