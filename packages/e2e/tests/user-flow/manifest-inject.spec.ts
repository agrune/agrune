/**
 * INJECT — agrune_manifest_load → fixture site E2E smoke
 *
 * 전 스택 검증: manifest_load → snapshot → target resolve → act
 * local fixture 사용 (YouTube 같은 외부 URL 의존 없음).
 * PLAYWRIGHT_SKIP_E2E=1 또는 Chrome 없음 → skip (기존 규약 준수).
 */

import { test, expect } from '@playwright/test'
import {
  createRealHarness,
  realE2eSkipReason,
  waitForTargetByName,
} from './helpers'
import type { AgruneManifest } from '@agrune/manifest'

const skipReason = realE2eSkipReason()
const FIXTURE_URL = 'http://127.0.0.1:5555/manifest-inject-target.html'

// ─── Valid manifest ──────────────────────────────────────────────────────────
// data-agrune-* 없는 fixture에 manifest를 통해 Sign in 버튼을 타겟으로 등록

const validManifest: AgruneManifest = {
  version: 3,
  groups: [
    {
      groupId: 'auth',
      name: 'Auth',
      targets: [
        {
          targetId: 'signin-button',
          name: 'Sign in',
          actionKinds: ['click'],
          selector: { role: { name: 'Sign in' } },
        },
      ],
    },
  ],
}

// ─── Invalid manifest (version 2) ───────────────────────────────────────────

const invalidManifestV2 = { version: 2, groups: [] } as unknown

// ─── Specs ──────────────────────────────────────────────────────────────────

test.describe('INJECT — agrune_manifest_load → fixture site', () => {
  test.skip(!!skipReason, skipReason ?? '')

  test('happy path: manifest_load → snapshot resolves target → act succeeds', async () => {
    const harness = await createRealHarness({ startUrl: FIXTURE_URL })
    try {
      // Step 1: manifest_load
      const loadResult = await harness.call('agrune_manifest_load', { manifest: validManifest })
      expect(loadResult.isError).not.toBe(true)
      const loadParsed = loadResult.parsed as { ok?: boolean; manifestSource?: string }
      expect(loadParsed.ok).toBe(true)
      expect(loadParsed.manifestSource).toBe('window')

      // Step 2: snapshot 에서 signin-button target 확인
      const target = await waitForTargetByName(
        harness.call,
        t => t.targetId === 'signin-button',
        { timeoutMs: 5_000 },
      )
      expect(target).not.toBeNull()

      // Step 3: act 성공
      const actResult = await harness.call('agrune_act', { targetId: 'signin-button' })
      const actParsed = actResult.parsed as { ok?: boolean }
      expect(actParsed.ok).toBe(true)
    } finally {
      await harness.teardown()
    }
  })

  test('invalid manifest (version 2) → INVALID_MANIFEST', async () => {
    const harness = await createRealHarness({ startUrl: FIXTURE_URL })
    try {
      const result = await harness.call('agrune_manifest_load', { manifest: invalidManifestV2 })
      expect(result.isError).toBe(true)
      const parsed = result.parsed as { ok?: boolean; error?: { code?: string } }
      expect(parsed.ok).toBe(false)
      expect(parsed.error?.code).toBe('INVALID_MANIFEST')
    } finally {
      await harness.teardown()
    }
  })
})
