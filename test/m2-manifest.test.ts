import { describe, it, expect } from 'vitest'
import { validateManifest } from '../src/manifest.js'
import {
  normalizeAgentTargetId,
  toAgentTargetRef,
  AgentTargetIdParseError,
  REPEATED_TARGET_KEY_DELIMITER,
} from '../src/target-ref.js'
import { goldenManifest } from './fixtures/golden-manifest.js'

describe('M2 — target-ref grammar (§3.10)', () => {
  it('non-repeat ids pass through unchanged', () => {
    expect(normalizeAgentTargetId('send_btn')).toBe('send_btn')
  })

  it('agent form → internal form', () => {
    expect(normalizeAgentTargetId('posts[key=abc123].like_btn')).toBe(
      `posts${REPEATED_TARGET_KEY_DELIMITER}abc123.like_btn`,
    )
  })

  it('internal form → agent form (inverse, golden case)', () => {
    const internal = `todo_items${REPEATED_TARGET_KEY_DELIMITER}a1.todo_item_toggle`
    expect(toAgentTargetRef({ targetId: internal })).toBe('todo_items[key=a1].todo_item_toggle')
    expect(
      toAgentTargetRef({ targetId: internal, repeatInstance: { repeatId: 'todo_items', key: 'a1' } }),
    ).toBe('todo_items[key=a1].todo_item_toggle')
  })

  it('roundtrips', () => {
    const agent = 'posts[key=xyz].like_btn'
    expect(toAgentTargetRef({ targetId: normalizeAgentTargetId(agent) })).toBe(agent)
  })

  it('rejects malformed refs with specific messages', () => {
    expect(() => normalizeAgentTargetId('[key=a].btn')).toThrow(AgentTargetIdParseError)
    expect(() => normalizeAgentTargetId('posts[abc].btn')).toThrow(/Bracket must contain "="/)
    expect(() => normalizeAgentTargetId('posts[key=].btn')).toThrow(/cannot be empty/)
    expect(() => normalizeAgentTargetId('posts[key=a]btn')).toThrow(/Expected "\." after/)
  })
})

describe('M2 — validateManifest (§3.11, A.7)', () => {
  it('the golden A.7 manifest validates (version defaulted, template omitted)', () => {
    const result = validateManifest(goldenManifest)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.version).toBe(3)
      expect(result.manifest.groups).toHaveLength(4)
    }
  })

  it('a present version must be exactly 3 (no v2)', () => {
    const r = validateManifest({ version: 2, groups: [] })
    expect(r.ok).toBe(false)
  })

  it('rejects sensitive:false with the OR-only message (§3.11.3)', () => {
    const r = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [{ targetId: 't', selector: { css: '#x' }, actionKinds: ['fill'], sensitive: false }],
        },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.some((e) => /OR-only/.test(e.message))).toBe(true)
    }
  })

  it('rejects hash-class and :nth-child selectors (§3.11.2)', () => {
    const hash = validateManifest({
      version: 3,
      groups: [
        { groupId: 'g', targets: [{ targetId: 't', selector: { css: '.aB3xK9p2' }, actionKinds: ['click'] }] },
      ],
    })
    expect(hash.ok).toBe(false)
    if (!hash.ok) expect(hash.errors.some((e) => /hash class forbidden/.test(e.message))).toBe(true)

    const nth = validateManifest({
      version: 3,
      groups: [
        { groupId: 'g', targets: [{ targetId: 't', selector: { css: 'li:nth-child(2)' }, actionKinds: ['click'] }] },
      ],
    })
    expect(nth.ok).toBe(false)
    if (!nth.ok) expect(nth.errors.some((e) => /:nth-child forbidden/.test(e.message))).toBe(true)
  })

  it('does NOT flag Tailwind utilities (hyphenated classes)', () => {
    const r = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [{ targetId: 't', selector: { css: '.bg-blue-500.items-center' }, actionKinds: ['click'] }],
        },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects empty keyFrom (index-only forbidden, §3.11.4)', () => {
    const r = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [],
          repeats: [
            {
              repeatId: 'r',
              keyFrom: '   ',
              strategy: 'dom',
              targets: [{ targetId: 't', selector: { css: '.row' }, actionKinds: ['click'] }],
            },
          ],
        },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some((e) => /keyFrom is required/.test(e.message))).toBe(true)
  })

  it('rejects a target with an empty selector ladder', () => {
    const r = validateManifest({
      version: 3,
      groups: [{ groupId: 'g', targets: [{ targetId: 't', selector: {}, actionKinds: ['click'] }] }],
    })
    expect(r.ok).toBe(false)
  })
})
