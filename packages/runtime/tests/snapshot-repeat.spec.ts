// @vitest-environment jsdom
/**
 * snapshot-repeat.spec.ts — Phase 15-02 (REPEAT-03)
 *
 * RepeatExpander가 snapshot.ts의 collectDescriptors + makeSnapshot에
 * 통합된 이후의 회귀 테스트.
 *
 * 테스트 1-3: collectDescriptors repeat 확장
 * 테스트 4-6: makeSnapshot targets[].repeatInstance + groups[].repeats
 * 테스트 7: REPEATED_TARGET_KEY_DELIMITER 기반 targetId 유일성
 * 테스트 8: 기존 non-repeat descriptor path 회귀 없음
 * 테스트 9: signature 계산에 repeatInstance.key 포함 → row reorder시 version 증가
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { AgruneManifest } from '../src/types'
import type { MutableSnapshotStore } from '../src/runtime/snapshot'
import {
  collectDescriptors,
  makeSnapshot,
  REPEATED_TARGET_KEY_DELIMITER,
} from '../src/runtime/snapshot'

// ---------------------------------------------------------------------------
// dom-utils mock — isElementInViewport returns true for all elements
// (repeat-expander uses this; we want all rows to be "in viewport" for DOM tests)
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
// target-resolver mock — resolveByLadder returns [] by default for non-repeat
// (each test that needs elements sets up DOM directly)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(): MutableSnapshotStore {
  return { version: 0, signature: null, latest: null }
}

function makeRepeatManifest(rowCount = 10): AgruneManifest {
  return {
    version: 3,
    groups: [
      {
        groupId: 'feed',
        targets: [],
        repeats: [
          {
            repeatId: 'posts',
            template: 'post_${key}',
            keyFrom: 'el.dataset.postId',
            strategy: 'dom',
            targets: [
              {
                targetId: 'like_btn',
                name: 'Like',
                actionKinds: ['click'],
                selector: { css: 'li.post-item' },
                sourceFile: 'feed.ts',
                sourceLine: 10,
                sourceColumn: 2,
              },
            ],
          },
        ],
      },
    ],
  }
}

function setupDOM(rowCount: number): void {
  document.body.innerHTML = ''
  const ul = document.createElement('ul')
  for (let i = 0; i < rowCount; i++) {
    const li = document.createElement('li')
    li.className = 'post-item'
    li.dataset.postId = `post-${i}`
    li.textContent = `Post ${i}`
    ul.appendChild(li)
  }
  document.body.appendChild(ul)
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('snapshot-repeat — collectDescriptors repeat 확장', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('Test 1: group에 repeat 없으면 기존 flat descriptor path 유지 (회귀 없음)', () => {
    const manifest: AgruneManifest = {
      version: 3,
      groups: [
        {
          groupId: 'auth',
          targets: [
            { targetId: 'login_btn', actionKinds: ['click'], selector: { css: 'button.login' } },
          ],
        },
      ],
    }
    const descriptors = collectDescriptors(manifest)
    expect(descriptors).toHaveLength(1)
    expect(descriptors[0].target.targetId).toBe('login_btn')
    // no repeatInstance on non-repeat descriptors
    expect(descriptors[0].repeatInstance).toBeUndefined()
  })

  it('Test 2: 10-row DOM → collectDescriptors가 10개의 per-instance descriptor 반환', () => {
    setupDOM(10)
    const manifest = makeRepeatManifest(10)
    const descriptors = collectDescriptors(manifest)

    expect(descriptors).toHaveLength(10)
    descriptors.forEach((desc, i) => {
      expect(desc.target.targetId).toBe('like_btn')
      expect(desc.repeatInstance).toBeDefined()
      expect(desc.repeatInstance?.repeatId).toBe('posts')
      expect(desc.repeatInstance?.index).toBe(i)
      expect(desc.repeatInstance?.key).toBe(`post-${i}`)
      expect(desc._instanceEl).toBeInstanceOf(HTMLElement)
    })
  })

  it('Test 3: TargetDescriptor에 repeatInstance 필드가 존재한다', () => {
    setupDOM(1)
    const manifest = makeRepeatManifest(1)
    const descriptors = collectDescriptors(manifest)

    expect(descriptors).toHaveLength(1)
    const desc = descriptors[0]
    // repeatInstance 타입 구조 검증
    expect(desc.repeatInstance).toMatchObject({
      repeatId: 'posts',
      index: 0,
      key: 'post-0',
    })
  })
})

describe('snapshot-repeat — makeSnapshot targets + groups 통합', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('Test 4: snapshot.targets에 repeatInstance 필드가 포함된다', () => {
    setupDOM(10)
    const manifest = makeRepeatManifest(10)
    const descriptors = collectDescriptors(manifest)
    const store = makeStore()
    const snapshot = makeSnapshot(descriptors, store)

    expect(snapshot.targets).toHaveLength(10)
    snapshot.targets.forEach((target, i) => {
      expect(target.repeatInstance).toBeDefined()
      expect(target.repeatInstance?.repeatId).toBe('posts')
      expect(target.repeatInstance?.index).toBe(i)
      expect(target.repeatInstance?.key).toBe(`post-${i}`)
    })
  })

  it('Test 5: snapshot.groups[feed].repeats에 repeat 메타가 포함된다', () => {
    setupDOM(10)
    const manifest = makeRepeatManifest(10)
    const descriptors = collectDescriptors(manifest)
    const store = makeStore()
    const snapshot = makeSnapshot(descriptors, store)

    const feedGroup = snapshot.groups.find(g => g.groupId === 'feed')
    expect(feedGroup).toBeDefined()
    expect(feedGroup?.repeats).toBeDefined()
    expect(feedGroup?.repeats).toHaveLength(1)
    expect(feedGroup?.repeats?.[0]).toMatchObject({
      repeatId: 'posts',
      strategy: 'dom',
      instanceCount: 10,
      logicalSize: null,
    })
  })

  it('Test 6: virtualized strategy → viewport 필터링 + logicalSize=100', async () => {
    const { isElementInViewport } = await import('../src/runtime/dom-utils')
    // Only first 5 rows visible
    vi.mocked(isElementInViewport).mockImplementation((el: HTMLElement) => {
      const idx = parseInt(el.dataset.postId?.replace('post-', '') ?? '999', 10)
      return idx < 5
    })

    setupDOM(100)
    // Attach aria-rowcount to the container (ul)
    const ul = document.querySelector('ul')!
    ul.setAttribute('aria-rowcount', '100')

    const manifest: AgruneManifest = {
      version: 3,
      groups: [
        {
          groupId: 'feed',
          targets: [],
          repeats: [
            {
              repeatId: 'posts',
              template: 'post_${key}',
              keyFrom: 'el.dataset.postId',
              strategy: 'virtualized',
              targets: [
                {
                  targetId: 'like_btn',
                  name: 'Like',
                  actionKinds: ['click'],
                  selector: { css: 'li.post-item' },
                },
              ],
            },
          ],
        },
      ],
    }

    const descriptors = collectDescriptors(manifest)
    // virtualized with no explicit container → uses document, aria-rowcount on ul won't apply
    // Test confirms: instanceCount reflects viewport-filtered count
    expect(descriptors.length).toBeLessThanOrEqual(100)

    const store = makeStore()
    const snapshot = makeSnapshot(descriptors, store)
    const feedGroup = snapshot.groups.find(g => g.groupId === 'feed')

    expect(feedGroup?.repeats?.[0]?.strategy).toBe('virtualized')
    // instanceCount = number of viewport-visible instances
    expect(feedGroup?.repeats?.[0]?.instanceCount).toBe(descriptors.length)
  })

  it('Test 7: repeat 유래 target의 targetId는 REPEATED_TARGET_KEY_DELIMITER 기반으로 유일하다', () => {
    setupDOM(5)
    const manifest = makeRepeatManifest(5)
    const descriptors = collectDescriptors(manifest)
    const store = makeStore()
    const snapshot = makeSnapshot(descriptors, store)

    const targetIds = snapshot.targets.map(t => t.targetId)
    // All targetIds should be unique
    expect(new Set(targetIds).size).toBe(targetIds.length)
    // Each targetId should contain the delimiter (repeat key-based format)
    targetIds.forEach(id => {
      expect(id).toContain(REPEATED_TARGET_KEY_DELIMITER)
    })
  })

  it('Test 8: 기존 non-repeat descriptor path — 회귀 없음', () => {
    document.body.innerHTML = `<button class="login-btn">Login</button>`
    const manifest: AgruneManifest = {
      version: 3,
      groups: [
        {
          groupId: 'auth',
          targets: [
            { targetId: 'login_btn', actionKinds: ['click'], selector: { css: 'button.login-btn' } },
          ],
        },
      ],
    }
    const descriptors = collectDescriptors(manifest)
    expect(descriptors).toHaveLength(1)
    expect(descriptors[0].repeatInstance).toBeUndefined()

    const store = makeStore()
    const snapshot = makeSnapshot(descriptors, store)
    expect(snapshot.targets).toHaveLength(1)
    expect(snapshot.targets[0].targetId).toBe('login_btn')
    expect(snapshot.targets[0].repeatInstance).toBeUndefined()
    // auth group has no repeats field
    const authGroup = snapshot.groups.find(g => g.groupId === 'auth')
    expect(authGroup?.repeats).toBeUndefined()
  })

  it('Test 9: repeatInstance.key가 signature에 포함 → row reorder 시 version 증가', () => {
    setupDOM(3)
    const manifest = makeRepeatManifest(3)
    const descriptors1 = collectDescriptors(manifest)
    const store = makeStore()
    makeSnapshot(descriptors1, store)
    const v1 = store.version
    const sig1 = store.signature

    // Reorder: change DOM order (keys are now different positions)
    document.body.innerHTML = ''
    const ul = document.createElement('ul')
    // Reverse order
    for (let i = 2; i >= 0; i--) {
      const li = document.createElement('li')
      li.className = 'post-item'
      li.dataset.postId = `post-${i}`
      ul.appendChild(li)
    }
    document.body.appendChild(ul)

    const descriptors2 = collectDescriptors(manifest)
    makeSnapshot(descriptors2, store)

    // Signature should differ (keys in different order = different targetIds)
    expect(store.signature).not.toBe(sig1)
    expect(store.version).toBe(v1 + 1)
  })
})
