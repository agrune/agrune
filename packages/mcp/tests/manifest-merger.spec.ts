import { describe, expect, it } from 'vitest'
import {
  mergeTargetIntoManifest,
  MergeError,
  buildDefineTargetText,
} from '../src/manifest-merger'
import type { PendingCaptureFile } from '../src/pending-store'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const FLAT_MANIFEST = `import { defineManifest, defineTarget } from '@agrune/manifest'

export default defineManifest({
  version: 3,
  targets: [],
})
`

const FLAT_MANIFEST_WITH_TARGET = `import { defineManifest, defineTarget } from '@agrune/manifest'

export default defineManifest({
  version: 3,
  targets: [
    defineTarget({ targetId: 'login_1', selector: { css: '#login' }, actionKinds: ['click'] }),
  ],
})
`

const FLAT_MANIFEST_COMMENTED = `import { defineManifest, defineTarget } from '@agrune/manifest'

// Top-level manifest for the login flow.
export default defineManifest({
  version: 3,
  /* targets are seeded empty — recorder fills in */
  targets: [],
  // TODO: add macros once login is stable.
})
`

const FLAT_MANIFEST_NO_TRAILING = `import { defineManifest, defineTarget } from '@agrune/manifest'

export default defineManifest({
  version: 3,
  targets: [
    defineTarget({ targetId: 'login_1', selector: { css: '#login' }, actionKinds: ['click'] })
  ]
})
`

const GROUPS_MANIFEST = `import { defineManifest, defineGroup, defineTarget } from '@agrune/manifest'

export default defineManifest({
  version: 3,
  groups: [
    defineGroup({
      groupId: 'main',
      targets: [],
    }),
  ],
})
`

const VARIABLE_CONFIG = `import { defineManifest } from '@agrune/manifest'

const config = { version: 3, targets: [] } as const
export default defineManifest(config)
`

const NO_DEFINE_CALL = `import { something } from './x'
export default something({ targets: [] })
`

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePending(
  targetId: string,
  selector: PendingCaptureFile['targets'][number]['selector'] = { css: '#login' },
  opts: { sensitive?: true } = {},
): PendingCaptureFile {
  return {
    ts: 1700000000000,
    sessionId: 'sess_abc',
    url: 'https://example.com/login',
    targets: [
      {
        targetId,
        selector,
        ...(opts.sensitive ? { sensitive: true as const } : {}),
      },
    ],
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('manifest-merger (Phase 16 RECORD-03)', () => {
  it('M1: merges a new target into an empty top-level targets array', () => {
    const pending = makePending('login_1')
    const { merged, addedTargetIds } = mergeTargetIntoManifest(
      FLAT_MANIFEST,
      pending,
      '/tmp/manifest.ts',
    )
    expect(addedTargetIds).toEqual(['login_1'])
    expect(merged).toContain(`targetId: "login_1"`)
    expect(merged).toContain('defineTarget({')
    // existing import must be preserved
    expect(merged).toContain(`import { defineManifest, defineTarget } from '@agrune/manifest'`)
  })

  it('M2: preserves line and block comments from the original source', () => {
    const pending = makePending('login_1')
    const { merged } = mergeTargetIntoManifest(
      FLAT_MANIFEST_COMMENTED,
      pending,
      '/tmp/manifest.ts',
    )
    expect(merged).toContain('// Top-level manifest for the login flow.')
    expect(merged).toContain('/* targets are seeded empty — recorder fills in */')
    expect(merged).toContain('// TODO: add macros once login is stable.')
  })

  it('M3: respects existing trailing-comma style (present)', () => {
    // FLAT_MANIFEST_WITH_TARGET has a trailing comma after the existing element.
    const pending = makePending('logout_1', { css: '#logout' })
    const { merged } = mergeTargetIntoManifest(
      FLAT_MANIFEST_WITH_TARGET,
      pending,
      '/tmp/manifest.ts',
    )
    // Last element inside the targets array should carry a trailing comma
    // matching the original style. Look for a defineTarget(...) followed by
    // `,\n  ]`.
    expect(merged).toMatch(/defineTarget\([^\n]*\}\),\s*\]/)
  })

  it('M3b: respects existing trailing-comma style (absent)', () => {
    const pending = makePending('logout_1', { css: '#logout' })
    const { merged } = mergeTargetIntoManifest(
      FLAT_MANIFEST_NO_TRAILING,
      pending,
      '/tmp/manifest.ts',
    )
    // The last element must NOT carry a trailing comma — ts-morph should
    // mirror the detected style.
    expect(merged).toMatch(/defineTarget\([^\n]*\}\)\s*\n\s*\]/)
  })

  it('M4: rejects duplicate targetId', () => {
    const pending = makePending('login_1')
    expect(() =>
      mergeTargetIntoManifest(
        FLAT_MANIFEST_WITH_TARGET,
        pending,
        '/tmp/manifest.ts',
      ),
    ).toThrowError(MergeError)
    try {
      mergeTargetIntoManifest(
        FLAT_MANIFEST_WITH_TARGET,
        pending,
        '/tmp/manifest.ts',
      )
    } catch (err) {
      expect(err).toBeInstanceOf(MergeError)
      expect((err as MergeError).code).toBe('DUPLICATE_TARGET')
    }
  })

  it('M5: rejects variable-reference argument to defineManifest', () => {
    const pending = makePending('login_1')
    try {
      mergeTargetIntoManifest(VARIABLE_CONFIG, pending, '/tmp/manifest.ts')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(MergeError)
      expect((err as MergeError).code).toBe('INLINE_REQUIRED')
    }
  })

  it('M6: rejects file with no defineManifest call', () => {
    const pending = makePending('login_1')
    try {
      mergeTargetIntoManifest(NO_DEFINE_CALL, pending, '/tmp/manifest.ts')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(MergeError)
      expect((err as MergeError).code).toBe('CALL_NOT_FOUND')
    }
  })

  it('M7: rejects pending with traversal-unsafe targetId (T-16-09)', () => {
    const pending: PendingCaptureFile = {
      ts: 1,
      sessionId: 'sess',
      url: '',
      targets: [{ targetId: '../x', selector: { css: '#login' } }],
    }
    try {
      mergeTargetIntoManifest(FLAT_MANIFEST, pending, '/tmp/manifest.ts')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(MergeError)
      expect((err as MergeError).code).toBe('INVALID_TARGET_ID')
    }
  })

  it('M8: rejects selector containing a hash-class (T-16-09 — validator reuse)', () => {
    const pending = makePending('login_1', { css: '.abcdef12' })
    try {
      mergeTargetIntoManifest(FLAT_MANIFEST, pending, '/tmp/manifest.ts')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(MergeError)
      expect((err as MergeError).code).toBe('INVALID_SELECTOR')
    }
  })

  it('M9: produces a valid unified-diff preview', () => {
    const pending = makePending('login_1')
    const { diff } = mergeTargetIntoManifest(
      FLAT_MANIFEST,
      pending,
      '/tmp/manifest.ts',
    )
    expect(diff).toContain('--- ')
    expect(diff).toContain('+++ ')
    expect(diff).toContain('@@')
    // added line should include the new defineTarget expression
    expect(diff).toMatch(/^\+.*defineTarget\(/m)
  })

  it('M10: merges into groups[0].targets when groups structure is present', () => {
    const pending = makePending('login_1')
    const { merged, addedTargetIds } = mergeTargetIntoManifest(
      GROUPS_MANIFEST,
      pending,
      '/tmp/manifest.ts',
    )
    expect(addedTargetIds).toEqual(['login_1'])
    // The group block should now carry the new defineTarget — assert by
    // shape: the `groupId: 'main'` block contains a targets array with a
    // defineTarget referencing 'login_1'.
    expect(merged).toMatch(/groupId:\s*'main'[\s\S]*defineTarget\([\s\S]*login_1/)
  })

  it('M11 (bonus, T-16-10 evidence): buildDefineTargetText emits sensitive flag when requested', () => {
    const text = buildDefineTargetText({
      targetId: 'pass_1',
      selector: { css: '#pass' },
      sensitive: true,
    })
    expect(text).toContain('sensitive: true')
    const textNoSensitive = buildDefineTargetText({
      targetId: 'user_1',
      selector: { css: '#user' },
    })
    expect(textNoSensitive).not.toContain('sensitive')
  })
})
