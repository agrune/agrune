/**
 * Phase 15-01 (REPEAT-01): ManifestRepeat.containerSelector 타입 + zod 테스트
 *
 * Task 1의 TDD 테스트:
 *   - TypeScript 타입 레벨 검증 (음성 테스트 포함)
 *   - RepeatSchema zod 런타임 검증
 *   - defineRepeat 빌더 통합 테스트
 */

import { describe, it, expect } from 'vitest'
import { RepeatSchema } from '../src/schema.js'
import { defineRepeat } from '../src/index.js'
import type { ManifestRepeat, SelectorLadder } from '../src/schema.js'

// ── 공통 픽스처 ──────────────────────────────────────────────────────────────

const validRepeatBase = {
  repeatId: 'feed',
  template: 'post_${key}',
  keyFrom: 'el.dataset.postId',
  strategy: 'dom' as const,
  targets: [],
}

// ── 타입 레벨 테스트 ─────────────────────────────────────────────────────────

describe('ManifestRepeat.containerSelector — 타입 레벨', () => {
  it('Test 1: containerSelector?: SelectorLadder 필드를 가진 ManifestRepeat 할당이 타입 레벨에서 통과한다', () => {
    const repeat: ManifestRepeat = {
      repeatId: 'feed',
      template: 'post_${key}',
      keyFrom: 'el.dataset.postId',
      strategy: 'dom',
      targets: [],
      containerSelector: { css: '.post-row' },
    }
    expect(repeat.containerSelector).toEqual({ css: '.post-row' })
  })

  it('Test 2: containerSelector 없이 ManifestRepeat를 정의해도 타입 통과 (optional)', () => {
    const repeat: ManifestRepeat = {
      repeatId: 'feed',
      template: 'post_${key}',
      keyFrom: 'el.dataset.postId',
      strategy: 'dom',
      targets: [],
    }
    expect(repeat.containerSelector).toBeUndefined()
  })

  it('Test 3: containerSelector: { css: ".post" } 지정 가능', () => {
    const repeat: ManifestRepeat = {
      repeatId: 'items',
      template: 'item_${key}',
      keyFrom: 'el.dataset.id',
      strategy: 'virtualized',
      targets: [],
      containerSelector: { css: '.post' },
    }
    expect(repeat.containerSelector).toEqual({ css: '.post' })
  })

  it('Test 4: containerSelector: {} 는 @ts-expect-error — SelectorLadder의 AtLeastOne 강제', () => {
    const repeat: ManifestRepeat = {
      repeatId: 'x',
      template: 't_${key}',
      keyFrom: 'el.id',
      strategy: 'dom',
      targets: [],
      // @ts-expect-error containerSelector must have at least one field — AtLeastOne<SelectorLadder>
      containerSelector: {},
    }
    expect(repeat).toBeDefined()
  })

  it('containerSelector는 SelectorLadder와 같은 타입 — role, text, testId, attr, css 중 1개 이상 허용', () => {
    const selectors: SelectorLadder[] = [
      { role: { name: 'list' } },
      { text: 'Posts' },
      { testId: 'post-list' },
      { attr: '[data-list]' },
      { css: '.post-list' },
    ]
    // 모든 selector가 SelectorLadder 타입으로 유효
    for (const sel of selectors) {
      const repeat: ManifestRepeat = {
        repeatId: 'feed',
        template: 'post_${key}',
        keyFrom: 'el.dataset.id',
        strategy: 'dom',
        targets: [],
        containerSelector: sel,
      }
      expect(repeat.containerSelector).toBeDefined()
    }
  })
})

// ── RepeatSchema zod 런타임 테스트 ───────────────────────────────────────────

describe('RepeatSchema zod — containerSelector 런타임 검증', () => {
  it('Test 5: containerSelector: { css: ".post" } 지정 시 parse 성공', () => {
    const result = RepeatSchema.safeParse({
      ...validRepeatBase,
      containerSelector: { css: '.post' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.containerSelector).toEqual({ css: '.post' })
    }
  })

  it('Test 6: containerSelector: {} 는 parse 실패 — "at least one of" 에러 메시지 포함', () => {
    const result = RepeatSchema.safeParse({
      ...validRepeatBase,
      containerSelector: {},
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues.map((e) => e.message).join('\n')
      expect(message).toContain('at least one of')
    }
  })

  it('Test 7: containerSelector 미지정 시 parse 성공 (optional)', () => {
    const result = RepeatSchema.safeParse(validRepeatBase)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.containerSelector).toBeUndefined()
    }
  })

  it('containerSelector: { role: { name: "list" } } parse 성공', () => {
    const result = RepeatSchema.safeParse({
      ...validRepeatBase,
      containerSelector: { role: { name: 'list' } },
    })
    expect(result.success).toBe(true)
  })

  it('containerSelector: { testId: "feed-container" } parse 성공', () => {
    const result = RepeatSchema.safeParse({
      ...validRepeatBase,
      containerSelector: { testId: 'feed-container' },
    })
    expect(result.success).toBe(true)
  })

  it('containerSelector: { css: ".post", text: "Posts" } 복합 selector parse 성공', () => {
    const result = RepeatSchema.safeParse({
      ...validRepeatBase,
      containerSelector: { css: '.post', text: 'Posts' },
    })
    expect(result.success).toBe(true)
  })
})

// ── defineRepeat 빌더 통합 테스트 ─────────────────────────────────────────────

describe('defineRepeat — containerSelector 빌더 통합', () => {
  it('defineRepeat({ ..., containerSelector: { css: ".post-row" } }) 가 containerSelector를 그대로 반환한다', () => {
    const r = defineRepeat({
      repeatId: 'feed',
      template: 'post_${key}',
      keyFrom: 'el.dataset.postId',
      strategy: 'dom',
      targets: [],
      containerSelector: { css: '.post-row' },
    })
    expect(r.containerSelector).toEqual({ css: '.post-row' })
  })

  it('defineRepeat containerSelector 없이 호출 시 containerSelector가 undefined', () => {
    const r = defineRepeat({
      repeatId: 'feed',
      template: 'post_${key}',
      keyFrom: 'el.dataset.postId',
      strategy: 'dom',
      targets: [],
    })
    expect(r.containerSelector).toBeUndefined()
  })
})
