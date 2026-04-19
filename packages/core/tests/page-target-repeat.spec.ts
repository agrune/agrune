/**
 * Phase 15-01 (REPEAT-02, REPEAT-03): PageTarget.repeatInstance + PageSnapshotGroup.repeats + REPEAT_INDEX_OUT_OF_RANGE
 *
 * TDD 테스트:
 *   - PageTarget.repeatInstance optional 타입 레벨 검증
 *   - PageSnapshotGroup.repeats optional 타입 레벨 검증
 *   - REPEAT_INDEX_OUT_OF_RANGE 에러 코드 런타임 검증
 *   - 기존 fixture가 additive 확장 후에도 타입 통과 (breaking 없음)
 */

import { describe, it, expect } from 'vitest'
import {
  COMMAND_ERROR_CODES,
  isCommandErrorCode,
} from '../src/index.js'
import type {
  PageTarget,
  PageSnapshotGroup,
  PageSnapshot,
  SelectorLadder,
} from '../src/index.js'

// ── PageTarget.repeatInstance 타입 레벨 테스트 ───────────────────────────────

describe('PageTarget.repeatInstance — 타입 레벨', () => {
  it('Test 1: repeatInstance?: { repeatId, index, key } 지정 시 타입 통과', () => {
    const selector: SelectorLadder = { css: '.post' }
    const target: PageTarget = {
      targetId: 'post_abc123_like',
      groupId: 'feed',
      name: 'Like button',
      description: '',
      actionKinds: ['click'],
      selector,
      visible: true,
      inViewport: true,
      enabled: true,
      covered: false,
      actionableNow: true,
      reason: 'ready',
      overlay: false,
      sensitive: false,
      sourceFile: 'feed.agrune.ts',
      sourceLine: 10,
      sourceColumn: 0,
      repeatInstance: {
        repeatId: 'feed',
        index: 0,
        key: 'abc123',
      },
    }
    expect(target.repeatInstance).toEqual({ repeatId: 'feed', index: 0, key: 'abc123' })
  })

  it('Test 2: repeatInstance 없이 PageTarget 할당도 타입 통과 (optional)', () => {
    const selector: SelectorLadder = { css: 'button.submit' }
    const target: PageTarget = {
      targetId: 'submit_btn',
      groupId: 'form',
      name: 'Submit',
      description: '',
      actionKinds: ['click'],
      selector,
      visible: true,
      inViewport: true,
      enabled: true,
      covered: false,
      actionableNow: true,
      reason: 'ready',
      overlay: false,
      sensitive: false,
      sourceFile: 'form.agrune.ts',
      sourceLine: 5,
      sourceColumn: 0,
    }
    expect(target.repeatInstance).toBeUndefined()
  })

  it('repeatInstance.index는 number 타입', () => {
    const selector: SelectorLadder = { role: { name: 'button' } }
    const target: PageTarget = {
      targetId: 'post_0_like',
      groupId: 'feed',
      name: 'Like',
      description: '',
      actionKinds: ['click'],
      selector,
      visible: true,
      inViewport: true,
      enabled: true,
      covered: false,
      actionableNow: true,
      reason: 'ready',
      overlay: false,
      sensitive: false,
      sourceFile: 'feed.agrune.ts',
      sourceLine: 1,
      sourceColumn: 0,
      repeatInstance: { repeatId: 'feed', index: 42, key: 'post-42' },
    }
    expect(typeof target.repeatInstance!.index).toBe('number')
  })
})

// ── PageSnapshotGroup.repeats 타입 레벨 테스트 ───────────────────────────────

describe('PageSnapshotGroup.repeats — 타입 레벨', () => {
  it('Test 3: repeats?: Array<{ repeatId, strategy, instanceCount, logicalSize }> 지정 가능', () => {
    const group: PageSnapshotGroup = {
      groupId: 'feed',
      groupName: 'Feed',
      targetIds: ['post_abc_like', 'post_def_like'],
      repeats: [
        {
          repeatId: 'feed',
          strategy: 'dom',
          instanceCount: 2,
          logicalSize: 100,
        },
      ],
    }
    expect(group.repeats).toHaveLength(1)
    expect(group.repeats![0].repeatId).toBe('feed')
  })

  it('Test 4: logicalSize: null 허용 (aria-rowcount 없음 시)', () => {
    const group: PageSnapshotGroup = {
      groupId: 'feed',
      targetIds: [],
      repeats: [
        {
          repeatId: 'feed',
          strategy: 'virtualized',
          instanceCount: 5,
          logicalSize: null,
        },
      ],
    }
    expect(group.repeats![0].logicalSize).toBeNull()
  })

  it('Test 5: strategy: "dom" | "virtualized" 외 값은 @ts-expect-error', () => {
    const group: PageSnapshotGroup = {
      groupId: 'g',
      targetIds: [],
      repeats: [
        {
          repeatId: 'x',
          // @ts-expect-error strategy는 'dom' | 'virtualized' 만 허용
          strategy: 'infinite-scroll',
          instanceCount: 0,
          logicalSize: null,
        },
      ],
    }
    expect(group).toBeDefined()
  })

  it('repeats 없이 PageSnapshotGroup 할당도 타입 통과 (optional)', () => {
    const group: PageSnapshotGroup = {
      groupId: 'form',
      targetIds: ['submit'],
    }
    expect(group.repeats).toBeUndefined()
  })
})

// ── REPEAT_INDEX_OUT_OF_RANGE 에러 코드 런타임 테스트 ────────────────────────

describe('REPEAT_INDEX_OUT_OF_RANGE — 에러 코드 런타임', () => {
  it('Test 6: COMMAND_ERROR_CODES.includes("REPEAT_INDEX_OUT_OF_RANGE") → true', () => {
    expect(COMMAND_ERROR_CODES.includes('REPEAT_INDEX_OUT_OF_RANGE')).toBe(true)
  })

  it('Test 7: isCommandErrorCode("REPEAT_INDEX_OUT_OF_RANGE") → true', () => {
    expect(isCommandErrorCode('REPEAT_INDEX_OUT_OF_RANGE')).toBe(true)
  })
})

// ── Additive 확인: 기존 fixture가 repeatInstance/repeats 없이도 통과 ──────────

describe('Test 8: additive 확인 — 기존 PageSnapshot fixture', () => {
  it('기존 PageSnapshot fixture가 repeatInstance/repeats 없이 타입 통과', () => {
    const snapshot: PageSnapshot = {
      schemaVersion: 3,
      version: 1,
      capturedAt: Date.now(),
      url: 'https://example.com',
      title: 'Test',
      groups: [
        {
          groupId: 'form',
          groupName: 'Login Form',
          targetIds: ['submit'],
        },
      ],
      targets: [
        {
          targetId: 'submit',
          groupId: 'form',
          name: 'Submit',
          description: '',
          actionKinds: ['click'],
          selector: { css: 'button[type="submit"]' },
          visible: true,
          inViewport: true,
          enabled: true,
          covered: false,
          actionableNow: true,
          reason: 'ready',
          overlay: false,
          sensitive: false,
          sourceFile: 'login.agrune.ts',
          sourceLine: 10,
          sourceColumn: 0,
        },
      ],
    }
    // repeatInstance / repeats 없이도 타입 통과 — additive 확인
    expect(snapshot.targets[0].repeatInstance).toBeUndefined()
    expect(snapshot.groups[0].repeats).toBeUndefined()
    expect(snapshot.schemaVersion).toBe(3)
  })
})
