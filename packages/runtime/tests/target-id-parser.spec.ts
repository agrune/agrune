// @vitest-environment jsdom
/**
 * target-id-parser.spec.ts — Phase 15-03 (REPEAT-03)
 *
 * parseRuntimeTargetId: REPEATED_TARGET_KEY_DELIMITER 인식 + repeatId/key/baseTargetId 분해
 * resolveRuntimeTarget: repeat key 기반 lookup (key 없으면 null)
 * handleAct-level 통합: repeatKey lookup 실패 → REPEAT_INDEX_OUT_OF_RANGE
 *
 * Test 1-6: parseRuntimeTargetId (기존 동작 유지 + Phase 15-03 확장)
 * Test 7-8: resolveRuntimeTarget key-aware lookup
 * Test 9-10: command-handlers REPEAT_INDEX_OUT_OF_RANGE 발동
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'
import {
  parseRuntimeTargetId,
  resolveRuntimeTarget,
  REPEATED_TARGET_KEY_DELIMITER,
  REPEATED_TARGET_ID_DELIMITER,
} from '../src/runtime/snapshot'
import type { TargetDescriptor } from '../src/runtime/snapshot'

// ---------------------------------------------------------------------------
// dom-utils mock
// ---------------------------------------------------------------------------
vi.mock('../src/runtime/dom-utils', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    isElementInViewport: vi.fn(() => true),
    isVisible: vi.fn(() => true),
    isEnabled: vi.fn(() => true),
    isTopmostInteractable: vi.fn(() => true),
    isOverlayElement: vi.fn(() => false),
    isSensitive: vi.fn(() => false),
    isFillableElement: vi.fn(() => false),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEl(tag = 'button'): HTMLElement {
  const el = document.createElement(tag)
  document.body.appendChild(el)
  return el
}

function makeDescriptor(opts: {
  targetId: string
  repeatId?: string
  repeatKey?: string
  repeatIndex?: number
  instanceEl?: HTMLElement
}): TargetDescriptor {
  return {
    actionKinds: ['click'],
    groupId: 'g',
    target: {
      targetId: opts.targetId,
      actionKinds: ['click'],
      selector: { css: 'button' },
    },
    repeatInstance: opts.repeatId != null
      ? { repeatId: opts.repeatId, index: opts.repeatIndex ?? 0, key: opts.repeatKey ?? '' }
      : undefined,
    _instanceEl: opts.instanceEl,
  }
}

// ---------------------------------------------------------------------------
// parseRuntimeTargetId
// ---------------------------------------------------------------------------

describe('parseRuntimeTargetId', () => {
  it('Test 1: plain targetId → 기존 동작 (index:0, hasExplicitIndex:false)', () => {
    const result = parseRuntimeTargetId('like_btn')
    expect(result.baseTargetId).toBe('like_btn')
    expect(result.index).toBe(0)
    expect(result.hasExplicitIndex).toBe(false)
    expect(result.repeatId).toBeUndefined()
    expect(result.repeatKey).toBeUndefined()
  })

  it('Test 2: index-delim targetId → 기존 index 경로 유지 (회귀 없음)', () => {
    const result = parseRuntimeTargetId(`like_btn${REPEATED_TARGET_ID_DELIMITER}3`)
    expect(result.baseTargetId).toBe('like_btn')
    expect(result.index).toBe(3)
    expect(result.hasExplicitIndex).toBe(true)
    expect(result.repeatId).toBeUndefined()
    expect(result.repeatKey).toBeUndefined()
  })

  it('Test 3: repeatKey-delim → repeatId + repeatKey + baseTargetId 분해', () => {
    const input = `posts${REPEATED_TARGET_KEY_DELIMITER}abc123.like_btn`
    const result = parseRuntimeTargetId(input)
    expect(result.baseTargetId).toBe('like_btn')
    expect(result.index).toBe(0)
    expect(result.hasExplicitIndex).toBe(false)
    expect(result.repeatId).toBe('posts')
    expect(result.repeatKey).toBe('abc123')
  })

  it('Test 4: key에 dot 포함 없이 단순 케이스 — leftmost dot으로 분리', () => {
    // key = 'abc123', baseTargetId = 'like_btn' (Test 3와 동일 경로 확인)
    const input = `posts${REPEATED_TARGET_KEY_DELIMITER}abc123.like_btn`
    const result = parseRuntimeTargetId(input)
    expect(result.repeatKey).toBe('abc123')
    expect(result.baseTargetId).toBe('like_btn')
  })

  it('Test 5: 잘못된 형식 (key 없음, dot 없음) → fallback to original', () => {
    // 잘못된 형식: delimiter 뒤에 key + '.' 없음
    const malformed = `posts${REPEATED_TARGET_KEY_DELIMITER}`
    const result = parseRuntimeTargetId(malformed)
    // fallback: 원본 그대로
    expect(result.baseTargetId).toBe(malformed)
    expect(result.index).toBe(0)
    expect(result.hasExplicitIndex).toBe(false)
    expect(result.repeatId).toBeUndefined()
    expect(result.repeatKey).toBeUndefined()
  })

  it('Test 6: dot만 포함한 targetId (no delimiter) → dot은 targetId의 일부 (기존 동작)', () => {
    const result = parseRuntimeTargetId('foo.bar')
    expect(result.baseTargetId).toBe('foo.bar')
    expect(result.index).toBe(0)
    expect(result.hasExplicitIndex).toBe(false)
    expect(result.repeatId).toBeUndefined()
    expect(result.repeatKey).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// resolveRuntimeTarget — key-based lookup
// ---------------------------------------------------------------------------

describe('resolveRuntimeTarget key-aware', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('Test 7: repeatKey 기반 lookup 성공 — 올바른 descriptor + element 반환', () => {
    const el = makeEl('article')

    const descriptors: TargetDescriptor[] = [
      makeDescriptor({ targetId: 'like_btn', repeatId: 'posts', repeatKey: 'abc123', repeatIndex: 0, instanceEl: el }),
      makeDescriptor({ targetId: 'like_btn', repeatId: 'posts', repeatKey: 'def456', repeatIndex: 1, instanceEl: makeEl('article') }),
    ]

    const targetId = `posts${REPEATED_TARGET_KEY_DELIMITER}abc123.like_btn`
    const result = resolveRuntimeTarget(descriptors, targetId)
    expect(result).not.toBeNull()
    expect(result!.descriptor.repeatInstance?.key).toBe('abc123')
    expect(result!.element).toBe(el)
    expect(result!.targetId).toBe(targetId)
  })

  it('Test 8: 없는 key → null 반환 (command-handlers가 REPEAT_INDEX_OUT_OF_RANGE로 변환)', () => {
    const el = makeEl('article')

    const descriptors: TargetDescriptor[] = [
      makeDescriptor({ targetId: 'like_btn', repeatId: 'posts', repeatKey: 'abc123', repeatIndex: 0, instanceEl: el }),
    ]

    const targetId = `posts${REPEATED_TARGET_KEY_DELIMITER}zzz.like_btn`
    const result = resolveRuntimeTarget(descriptors, targetId)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// withDescriptor / REPEAT_INDEX_OUT_OF_RANGE
// ---------------------------------------------------------------------------

describe('withDescriptor — REPEAT_INDEX_OUT_OF_RANGE 발동', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('Test 9: repeatKey lookup 실패 → REPEAT_INDEX_OUT_OF_RANGE 에러 코드', async () => {
    const { withDescriptor } = await import('../src/runtime/command-handlers')
    const el = makeEl('button')

    const descriptors: TargetDescriptor[] = [
      makeDescriptor({ targetId: 'like_btn', repeatId: 'posts', repeatKey: 'abc123', instanceEl: el }),
    ]

    const snapshot = {
      version: 1,
      signature: 's',
      groups: [],
      targets: [],
      timestamp: 0,
      url: '',
      title: '',
      schemaVersion: 3,
    }

    const deps = {
      captureSnapshot: () => snapshot,
      captureSettledSnapshot: async () => snapshot,
      getDescriptors: () => descriptors,
      resolveExecutionConfig: () => ({} as never),
      queue: { enqueue: (_fn: () => Promise<unknown>) => _fn() } as never,
      eventSequences: {} as never,
    }

    const targetId = `posts${REPEATED_TARGET_KEY_DELIMITER}zzz.like_btn`
    let called = false
    const result = await withDescriptor(deps, 'cmd1', targetId, undefined, async () => {
      called = true
      return { ok: true, commandId: 'cmd1', snapshot } as never
    })

    expect(called).toBe(false)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('REPEAT_INDEX_OUT_OF_RANGE')
      expect(result.error.message).toContain('posts')
      expect(result.error.message).toContain('zzz')
    }
  })

  it('Test 10: index-delim 경로 + descriptor 없음 → TARGET_NOT_FOUND (회귀 없음)', async () => {
    const { withDescriptor } = await import('../src/runtime/command-handlers')

    const snapshot = {
      version: 1,
      signature: 's',
      groups: [],
      targets: [],
      timestamp: 0,
      url: '',
      title: '',
      schemaVersion: 3,
    }

    const deps = {
      captureSnapshot: () => snapshot,
      captureSettledSnapshot: async () => snapshot,
      getDescriptors: () => [],
      resolveExecutionConfig: () => ({} as never),
      queue: { enqueue: (_fn: () => Promise<unknown>) => _fn() } as never,
      eventSequences: {} as never,
    }

    const result = await withDescriptor(deps, 'cmd2', 'nonexistent_btn', undefined, async () => {
      return { ok: true, commandId: 'cmd2', snapshot } as never
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TARGET_NOT_FOUND')
    }
  })
})
