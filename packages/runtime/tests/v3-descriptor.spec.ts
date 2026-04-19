// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { AgruneManifest } from '../src/types'
import { collectDescriptors, findElements } from '../src/runtime/snapshot'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('v3 manifest → descriptor → findElements', () => {
  it('collects descriptors from v3 manifest groups[].targets[]', () => {
    const manifest: AgruneManifest = {
      version: 3,
      groups: [{
        groupId: 'auth',
        targets: [
          { targetId: 'login_btn', actionKinds: ['click'], selector: { css: 'button.login' } },
          { targetId: 'email_field', actionKinds: ['fill'], selector: { css: 'input[type="email"]' } },
        ],
      }],
    }
    const descriptors = collectDescriptors(manifest)
    expect(descriptors).toHaveLength(2)
    expect(descriptors[0].target.targetId).toBe('email_field') // sorted
    expect(descriptors[0].actionKinds).toEqual(['fill'])
  })

  it('collects descriptors from repeats[].targets[] — per-instance (Phase 15-02)', () => {
    // Phase 15-02: RepeatExpander가 실제 DOM element를 열거하므로 DOM 설정 필요
    document.body.innerHTML = `
      <article data-post-id="post-0">Post 0</article>
      <article data-post-id="post-1">Post 1</article>
    `
    const manifest: AgruneManifest = {
      version: 3,
      groups: [{
        groupId: 'feed',
        targets: [],
        repeats: [{
          repeatId: 'posts',
          template: 'post_${key}',
          keyFrom: 'el.dataset.postId',
          strategy: 'dom',
          targets: [
            { targetId: 'post_click', actionKinds: ['click'], selector: { css: 'article' } },
          ],
        }],
      }],
    }
    const descriptors = collectDescriptors(manifest)
    // 2개 article element → 2 per-instance descriptor
    expect(descriptors).toHaveLength(2)
    expect(descriptors[0].target.targetId).toBe('post_click')
    expect(descriptors[0].repeatInstance?.key).toBe('post-0')
    expect(descriptors[1].repeatInstance?.key).toBe('post-1')
  })

  it('findElements delegates to resolveByLadder with SelectorLadder', () => {
    document.body.innerHTML = `<button role="button" aria-label="Sign in">Sign in</button>`
    const manifest: AgruneManifest = {
      version: 3,
      groups: [{
        groupId: 'auth',
        targets: [{
          targetId: 'signin',
          actionKinds: ['click'],
          selector: { role: { name: 'button', level: 'Sign in' } },
        }],
      }],
    }
    const descriptor = collectDescriptors(manifest)[0]
    const elements = findElements(descriptor)
    expect(elements).toHaveLength(1)
    expect(elements[0].getAttribute('aria-label')).toBe('Sign in')
  })

  it('filters out targets with no valid actionKinds', () => {
    const manifest: AgruneManifest = {
      version: 3,
      groups: [{
        groupId: 'x',
        targets: [{ targetId: 't', actionKinds: [] as unknown as ('click')[], selector: { css: 'x' } }],
      }],
    }
    expect(collectDescriptors(manifest)).toEqual([])
  })

  it('sorts descriptors by targetId', () => {
    const manifest: AgruneManifest = {
      version: 3,
      groups: [{
        groupId: 'g',
        targets: [
          { targetId: 'zeta', actionKinds: ['click'], selector: { css: 'x' } },
          { targetId: 'alpha', actionKinds: ['click'], selector: { css: 'y' } },
        ],
      }],
    }
    const d = collectDescriptors(manifest)
    expect(d.map((x) => x.target.targetId)).toEqual(['alpha', 'zeta'])
  })
})
