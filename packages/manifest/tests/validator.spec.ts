import { describe, it, expect } from 'vitest'
import {
  validateManifest,
  assertNoHashClass,
  assertNoNthChild,
  SelectorForbiddenError,
  HASH_CLASS_PATTERN,
  NTH_CHILD_PATTERN,
} from '../src/index.js'

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [{ targetId: 't', actionKinds: ['click'], selector: { css: 'button.submit' } }],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('accepts manifest with role selector', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 'btn',
              actionKinds: ['click'],
              selector: { role: { name: 'button', level: 'Submit' } },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects version != 3 (T-11-04)', () => {
    const result = validateManifest({ version: 2, groups: [] })
    expect(result.ok).toBe(false)
  })

  it('rejects missing groups field', () => {
    const result = validateManifest({ version: 3 })
    expect(result.ok).toBe(false)
  })

  it('rejects sensitive:false with OR-only error message (T-11-01, T-11-05)', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 'pw',
              actionKinds: ['fill'],
              selector: { css: 'input' },
              sensitive: false,
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const msg = result.errors.map((e) => e.message).join('\n')
      expect(msg).toContain('OR-only')
      expect(msg).toContain('sensitive:false is not allowed')
    }
  })

  it('accepts sensitive:true', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 'pw',
              actionKinds: ['fill'],
              selector: { css: 'input[type="password"]' },
              sensitive: true,
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects empty SelectorLadder (T-11-03)', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [{ targetId: 't', actionKinds: ['click'], selector: {} }],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const msg = result.errors.map((e) => e.message).join('\n')
      expect(msg).toContain('SelectorLadder must define at least one')
    }
  })

  it('rejects hash class in css selector (T-11-02)', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click'],
              selector: { css: '.abc12345xyz' },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.message).join('\n')).toContain('hash class forbidden')
    }
  })

  it('accepts Tailwind utility classes — no hash pattern (Pitfall 2)', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click'],
              selector: { css: '.flex.items-center.bg-blue-500' },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects :nth-child in css selector (T-11-02)', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click'],
              selector: { css: 'div:nth-child(2)' },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.message).join('\n')).toContain(':nth-child forbidden')
    }
  })

  it('error message includes targetId for hash class violation', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 'my_special_btn',
              actionKinds: ['click'],
              selector: { css: '.hashAbcd1234' },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const msg = result.errors.map((e) => e.message).join('\n')
      expect(msg).toContain('my_special_btn')
    }
  })

  it('accepts manifest with macros', () => {
    const result = validateManifest({
      version: 3,
      groups: [],
      macros: [
        {
          macroId: 'login',
          params: { email: { type: 'string' } },
          steps: [{ targetId: 'email', action: 'fill' }],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects invalid actionKind in target', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [{ targetId: 't', actionKinds: ['fly'], selector: { css: 'button' } }],
        },
      ],
    })
    expect(result.ok).toBe(false)
  })
})

describe('assertNoHashClass / assertNoNthChild', () => {
  it('throws SelectorForbiddenError on hash class', () => {
    expect(() => assertNoHashClass('.abc12345def')).toThrow(SelectorForbiddenError)
  })

  it('error message describes the issue', () => {
    try {
      assertNoHashClass('.xyz98765abcd')
      expect.fail('Expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(SelectorForbiddenError)
      if (e instanceof SelectorForbiddenError) {
        expect(e.message).toContain('hash-based class')
        expect(e.selector).toBe('.xyz98765abcd')
      }
    }
  })

  it('does not throw on Tailwind utility class (Pitfall 2)', () => {
    expect(() => assertNoHashClass('.flex.items-center')).not.toThrow()
    expect(() => assertNoHashClass('.bg-blue-500')).not.toThrow()
    expect(() => assertNoHashClass('.text-gray-700')).not.toThrow()
  })

  it('throws SelectorForbiddenError on :nth-child', () => {
    expect(() => assertNoNthChild('div:nth-child(2)')).toThrow(SelectorForbiddenError)
  })

  it(':nth-child error message is descriptive', () => {
    try {
      assertNoNthChild('ul li:nth-child(3)')
      expect.fail('Expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(SelectorForbiddenError)
      if (e instanceof SelectorForbiddenError) {
        expect(e.message).toContain(':nth-child')
        expect(e.message).toContain('position-dependent')
      }
    }
  })

  it('does not throw on normal css selector without :nth-child', () => {
    expect(() => assertNoNthChild('div.container > button')).not.toThrow()
  })
})

describe('validateManifest — fiber selector', () => {
  it('accepts fiber-only selector (fiber as sole field)', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click'],
              selector: { fiber: { path: [{ componentName: 'Button', key: null, index: 0 }] } },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects fiber.path as empty array', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click'],
              selector: { fiber: { path: [] } },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects fiber.path length > 8', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click'],
              selector: {
                fiber: {
                  path: Array.from({ length: 9 }, (_, i) => ({
                    componentName: `C${i}`,
                    key: null,
                    index: i,
                  })),
                },
              },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects fiber.path segment with negative index', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click'],
              selector: { fiber: { path: [{ componentName: 'Button', key: null, index: -1 }] } },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects fiber.path segment with non-string componentName', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click'],
              selector: { fiber: { path: [{ componentName: 42 as unknown as string, key: null, index: 0 }] } },
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('JSON round-trip: manifest with fiber selector re-validates after serialize/deserialize', () => {
    const manifest = {
      version: 3 as const,
      groups: [
        {
          groupId: 'g',
          targets: [
            {
              targetId: 't',
              actionKinds: ['click' as const],
              selector: { fiber: { path: [{ componentName: 'Button', key: 'primary', index: 2 }] } },
            },
          ],
        },
      ],
    }
    const roundTripped = JSON.parse(JSON.stringify(manifest))
    const result = validateManifest(roundTripped)
    expect(result.ok).toBe(true)
  })
})

describe('HASH_CLASS_PATTERN', () => {
  it('matches 8+ alphanumeric class with no hyphen suffix', () => {
    expect(HASH_CLASS_PATTERN.test('.abc12345xy')).toBe(true)
    expect(HASH_CLASS_PATTERN.test('.hashAbcd1234')).toBe(true)
  })

  it('does not match Tailwind-like class with hyphen', () => {
    expect(HASH_CLASS_PATTERN.test('.bg-blue-500')).toBe(false)
    expect(HASH_CLASS_PATTERN.test('.items-center')).toBe(false)
    expect(HASH_CLASS_PATTERN.test('.text-gray-700')).toBe(false)
  })

  it('does not match short class names', () => {
    expect(HASH_CLASS_PATTERN.test('.flex')).toBe(false)
    expect(HASH_CLASS_PATTERN.test('.btn')).toBe(false)
  })
})

describe('NTH_CHILD_PATTERN', () => {
  it('matches :nth-child(', () => {
    expect(NTH_CHILD_PATTERN.test('div:nth-child(2)')).toBe(true)
    expect(NTH_CHILD_PATTERN.test('li:nth-child(odd)')).toBe(true)
  })

  it('does not match normal selectors', () => {
    expect(NTH_CHILD_PATTERN.test('div.container')).toBe(false)
    expect(NTH_CHILD_PATTERN.test('button[type="submit"]')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// keyFrom 검증 — Phase 15-03 (REPEAT-01/02/03)
// ---------------------------------------------------------------------------

const REPEAT_FIXTURE = (keyFrom: string) => ({
  version: 3,
  groups: [
    {
      groupId: 'feed',
      targets: [],
      repeats: [
        {
          repeatId: 'posts',
          template: 'post_${key}',
          keyFrom,
          strategy: 'dom',
          targets: [
            { targetId: 'like_btn', actionKinds: ['click'], selector: { css: '.like' } },
          ],
        },
      ],
    },
  ],
})

describe('validateManifest — keyFrom validation (Phase 15-03)', () => {
  it('Test 1: 빈 keyFrom 문자열 → ok:false + 필수 메시지', () => {
    const result = validateManifest(REPEAT_FIXTURE(''))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const msg = result.errors.map((e) => e.message).join('\n')
      expect(msg).toContain('keyFrom is required')
    }
  })

  it('Test 2: 공백만 있는 keyFrom → ok:false', () => {
    const result = validateManifest(REPEAT_FIXTURE('   '))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const msg = result.errors.map((e) => e.message).join('\n')
      expect(msg).toContain('keyFrom is required')
    }
  })

  it('Test 3: 유효한 keyFrom → ok:true', () => {
    const result = validateManifest(REPEAT_FIXTURE('el.dataset.postId'))
    expect(result.ok).toBe(true)
  })

  it('Test 4: 문법 오류 keyFrom → ok:false + compile failed 메시지', () => {
    const result = validateManifest(REPEAT_FIXTURE('el.??? +++'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const msg = result.errors.map((e) => e.message).join('\n')
      expect(msg).toContain('compile failed')
    }
  })

  it('Test 5: 복잡하지만 문법 유효한 keyFrom → ok:true (compile만 검증, semantic은 runtime 책임)', () => {
    // fetch 같은 호출도 compile은 OK → pass (T-11-21 선례)
    const result = validateManifest(REPEAT_FIXTURE('el.foo; String("ok")'))
    expect(result.ok).toBe(true)
  })

  it('Test 6: 여러 repeat 중 일부만 실패 시 각각 독립 에러 보고', () => {
    const result = validateManifest({
      version: 3,
      groups: [
        {
          groupId: 'feed',
          targets: [],
          repeats: [
            {
              repeatId: 'posts',
              template: 'post_${key}',
              keyFrom: 'el.dataset.postId', // 유효
              strategy: 'dom',
              targets: [{ targetId: 'like', actionKinds: ['click'], selector: { css: '.like' } }],
            },
            {
              repeatId: 'comments',
              template: 'comment_${key}',
              keyFrom: '', // 빈 문자열 — 실패
              strategy: 'dom',
              targets: [{ targetId: 'reply', actionKinds: ['click'], selector: { css: '.reply' } }],
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // 실패한 repeat(comments)만 에러
      const paths = result.errors.map((e) => e.path)
      const hasCommentPath = paths.some((p) => p.includes('repeats[1]'))
      expect(hasCommentPath).toBe(true)
      // posts는 에러 없어야 함
      const hasPostPath = paths.some((p) => p.includes('repeats[0]'))
      expect(hasPostPath).toBe(false)
    }
  })

  it('Test 7: new Function 자체가 차단되는 환경 → compile 검증 skip, ok:true (Pitfall 2 — CSP graceful)', () => {
    // Function 생성자가 에러를 던지도록 시뮬레이션
    const OriginalFunction = globalThis.Function
    // @ts-expect-error — test override
    globalThis.Function = function () {
      throw new Error('CSP: eval blocked')
    }
    try {
      const result = validateManifest(REPEAT_FIXTURE('el.dataset.postId'))
      // compile 검증 자체가 skip되므로 ok:true여야 함
      expect(result.ok).toBe(true)
    } finally {
      globalThis.Function = OriginalFunction
    }
  })

  it('Test 8: CLI 회귀 — validateManifest ok:false는 기존 exit 1 배선으로 처리됨 (unit level 확인)', () => {
    // manifest-validate-cli.ts는 이미 validateManifest 결과 ok:false → exit 1 배선 (11-05)
    // 여기서는 unit level에서 validator 결과만 확인
    const result = validateManifest(REPEAT_FIXTURE(''))
    expect(result.ok).toBe(false)
    // CLI는 이 result를 받아 exit 1 처리함 — 별도 E2E 없이 unit level에서 충분
  })
})
