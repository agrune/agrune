/**
 * PageSnapshot v3 타입 계약 회귀 테스트 (RESOLVE-03)
 *
 * schemaVersion: 3 리터럴 + PageTarget.selector: SelectorLadder (객체) 검증.
 * 타입 전용 검사(@ts-expect-error)와 런타임 검사 둘 다 포함.
 */
import { describe, expect, it } from 'vitest'
import type { PageSnapshot, PageTarget, SelectorLadder } from '@agrune/core'

// ---------------------------------------------------------------------------
// Helpers — 최소 필드만 채운 fixture 빌더
// ---------------------------------------------------------------------------

function makeTarget(override: Partial<PageTarget> = {}): PageTarget {
  return {
    targetId: 'test-target',
    groupId: 'test-group',
    name: 'Test Target',
    description: '',
    actionKinds: ['click'],
    selector: { css: '.btn' },
    visible: true,
    inViewport: true,
    enabled: true,
    covered: false,
    actionableNow: true,
    reason: 'ready',
    overlay: false,
    sensitive: false,
    sourceFile: '',
    sourceLine: 0,
    sourceColumn: 0,
    ...override,
  }
}

function makeSnapshot(override: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    schemaVersion: 3,
    version: 1,
    capturedAt: Date.now(),
    url: 'http://localhost:5173',
    title: 'Test Page',
    groups: [],
    targets: [],
    ...override,
  }
}

// ---------------------------------------------------------------------------
// Test 1: PageTarget.selector가 SelectorLadder 타입 — 객체 할당 가능
// ---------------------------------------------------------------------------

describe('PageSnapshot v3 types', () => {
  it('PageTarget.selector에 { css: ".foo" } 객체가 할당 가능하다', () => {
    const target = makeTarget({ selector: { css: '.foo' } })
    expect(target.selector).toEqual({ css: '.foo' })
    expect(typeof target.selector).toBe('object')
  })

  // ---------------------------------------------------------------------------
  // Test 2: selector에 string이 들어가면 타입 에러 (음성 테스트)
  // ---------------------------------------------------------------------------

  it('PageTarget.selector는 string이 아닌 SelectorLadder 객체 타입이다', () => {
    // @ts-expect-error — string을 selector에 할당하면 TS 에러여야 함
    const _target: PageTarget = makeTarget({ selector: 'some-css-string' })
    // 런타임에서는 위 할당이 가능하지만 타입 레벨에서 에러임을 확인
    expect(true).toBe(true) // @ts-expect-error 지시문이 에러를 흡수했으면 타입 계약 성립
  })

  // ---------------------------------------------------------------------------
  // Test 3: PageSnapshot.schemaVersion이 3 이외의 값은 타입 에러
  // ---------------------------------------------------------------------------

  it('PageSnapshot.schemaVersion이 3 리터럴 필드로 존재한다', () => {
    const snap = makeSnapshot()
    expect(snap.schemaVersion).toBe(3)
    // 타입: 3 as const — 4를 넣으면 에러
    // @ts-expect-error — 4는 3 리터럴 타입에 할당 불가
    const _snap2: PageSnapshot = makeSnapshot({ schemaVersion: 4 })
    expect(true).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Test 4: PageSnapshot.version이 여전히 number 타입으로 존재 (카운터 의미 보존)
  // ---------------------------------------------------------------------------

  it('PageSnapshot.version이 number 타입으로 유지된다 (단조 증가 카운터)', () => {
    const snap1 = makeSnapshot({ version: 1 })
    const snap2 = makeSnapshot({ version: 42 })
    expect(typeof snap1.version).toBe('number')
    expect(snap1.version).toBe(1)
    expect(snap2.version).toBe(42)
  })

  // ---------------------------------------------------------------------------
  // Test 5: SelectorLadder 모든 변형이 PageTarget.selector에 할당 가능
  // ---------------------------------------------------------------------------

  it('role/text/testId/attr/css 변형 전부 PageTarget.selector에 할당 가능하다', () => {
    const cssTarget = makeTarget({ selector: { css: '.btn' } })
    expect(cssTarget.selector).toEqual({ css: '.btn' })

    const roleTarget = makeTarget({ selector: { role: { name: 'button' } } })
    expect(roleTarget.selector).toEqual({ role: { name: 'button' } })

    const textTarget = makeTarget({ selector: { text: 'Submit' } })
    expect(textTarget.selector).toEqual({ text: 'Submit' })

    const testIdTarget = makeTarget({ selector: { testId: 'submit-btn' } })
    expect(testIdTarget.selector).toEqual({ testId: 'submit-btn' })

    const attrTarget = makeTarget({ selector: { attr: '[data-id="btn"]' } })
    expect(attrTarget.selector).toEqual({ attr: '[data-id="btn"]' })

    // 복합 ladder: 여러 전략 동시 설정
    const compositeTarget = makeTarget({
      selector: { role: { name: 'button', level: '2' }, css: '.fallback' },
    })
    expect(compositeTarget.selector).toEqual({ role: { name: 'button', level: '2' }, css: '.fallback' })
  })

  // ---------------------------------------------------------------------------
  // 추가 Test 6: schemaVersion과 version이 공존한다
  // ---------------------------------------------------------------------------

  it('schemaVersion: 3과 version: number가 동시에 존재한다', () => {
    const snap = makeSnapshot({ version: 5, schemaVersion: 3 })
    expect(snap.schemaVersion).toBe(3)
    expect(snap.version).toBe(5)
    // 두 필드가 서로 다른 의미임을 확인 (schemaVersion은 고정, version은 카운터)
    expect(snap.schemaVersion).not.toBe(snap.version)
  })

  // ---------------------------------------------------------------------------
  // 추가 Test 7: targets에 SelectorLadder 객체가 담긴 PageSnapshot 전체 구조 검증
  // ---------------------------------------------------------------------------

  it('PageSnapshot 전체 구조에서 selector가 객체로 유지된다', () => {
    const target = makeTarget({
      targetId: 'login-btn',
      selector: { css: '.login-btn' },
    })
    const snap = makeSnapshot({
      version: 3,
      schemaVersion: 3,
      targets: [target],
    })

    expect(snap.schemaVersion).toBe(3)
    expect(snap.targets).toHaveLength(1)
    expect(snap.targets[0].selector).toEqual({ css: '.login-btn' })
    expect(typeof snap.targets[0].selector).toBe('object')
    expect(typeof (snap.targets[0].selector as SelectorLadder)).toBe('object')
  })
})
