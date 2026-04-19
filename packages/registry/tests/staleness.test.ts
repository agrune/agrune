import { describe, expect, it } from 'vitest'
import { STALENESS_THRESHOLDS, classifyStaleness } from '../src/staleness.js'

const DAY_MS = 24 * 60 * 60 * 1000

describe('STALENESS_THRESHOLDS', () => {
  it('exposes week/stale/auto-disable thresholds matching governance doc (7/28/56 days)', () => {
    expect(STALENESS_THRESHOLDS.weekMs).toBe(7 * DAY_MS)
    expect(STALENESS_THRESHOLDS.staleMs).toBe(28 * DAY_MS)
    expect(STALENESS_THRESHOLDS.autoDisableMs).toBe(56 * DAY_MS)
  })
})

describe('classifyStaleness', () => {
  const NOW = new Date('2026-04-20T12:00:00Z')

  it('returns "fresh" when fetched less than 7 days ago', () => {
    expect(
      classifyStaleness(
        { fetchedAt: new Date(NOW.getTime() - 2 * DAY_MS).toISOString() },
        NOW,
      ),
    ).toBe('fresh')
  })

  it('returns "week_old" when fetched between 7 and 28 days ago', () => {
    expect(
      classifyStaleness(
        { fetchedAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString() },
        NOW,
      ),
    ).toBe('week_old')
  })

  it('returns "stale" when fetched between 28 and 56 days ago', () => {
    expect(
      classifyStaleness(
        { fetchedAt: new Date(NOW.getTime() - 30 * DAY_MS).toISOString() },
        NOW,
      ),
    ).toBe('stale')
  })

  it('returns "auto_disabled" when fetched more than 56 days ago', () => {
    expect(
      classifyStaleness(
        { fetchedAt: new Date(NOW.getTime() - 60 * DAY_MS).toISOString() },
        NOW,
      ),
    ).toBe('auto_disabled')
  })

  it('returns "auto_disabled" when entry has disabled marker regardless of fetchedAt freshness', () => {
    expect(
      classifyStaleness(
        {
          fetchedAt: NOW.toISOString(),
          disabled: { reason: 'revoked', at: NOW.toISOString() },
        },
        NOW,
      ),
    ).toBe('auto_disabled')
  })

  it('defaults now to current Date when omitted', () => {
    const recent = new Date(Date.now() - 1000).toISOString()
    expect(classifyStaleness({ fetchedAt: recent })).toBe('fresh')
  })
})
