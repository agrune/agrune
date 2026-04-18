import { describe, it, expect, vi } from 'vitest'
import { SessionManager } from '../src/session-manager'
import type { PageSnapshot } from '@agrune/core'

function makeSnapshot(overrides?: Partial<PageSnapshot>): PageSnapshot {
  return {
    version: 1,
    capturedAt: Date.now(),
    url: 'https://example.com',
    title: 'Example',
    groups: [],
    targets: [],
    ...overrides,
  }
}

describe('SessionManager', () => {
  it('opens a session and retrieves it', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://example.com', 'Example')

    const session = mgr.getSession(1)
    expect(session).not.toBeNull()
    expect(session!.tabId).toBe(1)
    expect(session!.url).toBe('https://example.com')
    expect(session!.title).toBe('Example')
    expect(session!.snapshot).toBeNull()
    expect(session!.openedAt).toBeGreaterThan(0)
  })

  it('closes a session', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://example.com', 'Example')
    mgr.closeSession(1)

    expect(mgr.getSession(1)).toBeNull()
  })

  it('returns null for unknown tab', () => {
    const mgr = new SessionManager()
    expect(mgr.getSession(999)).toBeNull()
  })

  it('returns all open sessions via getSessions()', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.openSession(2, 'https://b.com', 'B')

    const sessions = mgr.getSessions()
    expect(sessions).toHaveLength(2)
    expect(sessions.map((s) => s.tabId).sort()).toEqual([1, 2])
  })

  it('caches latest snapshot per tab', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://example.com', 'Example')

    const snap = makeSnapshot({ version: 5 })
    mgr.updateSnapshot(1, snap)

    expect(mgr.getSnapshot(1)).toEqual(snap)
    expect(mgr.getSession(1)!.snapshot).toEqual(snap)
  })

  it('overwrites snapshot on update', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://example.com', 'Example')

    const snap1 = makeSnapshot({ version: 1 })
    const snap2 = makeSnapshot({ version: 2 })

    mgr.updateSnapshot(1, snap1)
    mgr.updateSnapshot(1, snap2)

    expect(mgr.getSnapshot(1)).toEqual(snap2)
  })

  it('clears stale snapshot when the same tab opens a new page', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://example.com', 'Example')
    mgr.updateSnapshot(1, makeSnapshot({ version: 3 }))

    mgr.openSession(1, 'https://example.com/next', 'Next Page')

    expect(mgr.getSession(1)).toMatchObject({
      tabId: 1,
      url: 'https://example.com/next',
      title: 'Next Page',
      snapshot: null,
    })
  })

  it('returns null snapshot for unknown tab', () => {
    const mgr = new SessionManager()
    expect(mgr.getSnapshot(999)).toBeNull()
  })

  it('ignores updateSnapshot for unknown tab', () => {
    const mgr = new SessionManager()
    const snap = makeSnapshot()
    // Should not throw
    mgr.updateSnapshot(999, snap)
    expect(mgr.getSnapshot(999)).toBeNull()
  })
})

describe('hasReadySession', () => {
  it('returns false when no sessions', () => {
    const mgr = new SessionManager()
    expect(mgr.hasReadySession()).toBe(false)
  })

  it('returns false when sessions have no snapshot', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    expect(mgr.hasReadySession()).toBe(false)
  })

  it('returns true when at least one session has a snapshot', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.updateSnapshot(1, makeSnapshot())
    expect(mgr.hasReadySession()).toBe(true)
  })
})

describe('waitForSnapshot', () => {
  it('resolves immediately if a ready session already exists', async () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.updateSnapshot(1, makeSnapshot())
    const result = await mgr.waitForSnapshot(1000)
    expect(result).toBe(true)
  })

  it('resolves when a snapshot arrives within timeout', async () => {
    const mgr = new SessionManager()
    const promise = mgr.waitForSnapshot(3000)
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.updateSnapshot(1, makeSnapshot())
    const result = await promise
    expect(result).toBe(true)
  })

  it('resolves false on timeout when no snapshot arrives', async () => {
    vi.useFakeTimers()
    const mgr = new SessionManager()
    const promise = mgr.waitForSnapshot(3000)
    await vi.advanceTimersByTimeAsync(3000)
    const result = await promise
    expect(result).toBe(false)
    vi.useRealTimers()
  })

  it('multiple waiters join the same promise', async () => {
    const mgr = new SessionManager()
    const p1 = mgr.waitForSnapshot(3000)
    const p2 = mgr.waitForSnapshot(3000)
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.updateSnapshot(1, makeSnapshot())
    expect(await p1).toBe(true)
    expect(await p2).toBe(true)
  })
})

describe('active session tracking', () => {
  it('getActiveSessionId returns null by default', () => {
    const mgr = new SessionManager()
    expect(mgr.getActiveSessionId()).toBeNull()
  })

  it('setActiveSession returns false for unknown tab and leaves state untouched', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    expect(mgr.setActiveSession(999)).toBe(false)
    expect(mgr.getActiveSessionId()).toBeNull()
  })

  it('setActiveSession marks a known tab as active', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.openSession(2, 'https://b.com', 'B')
    expect(mgr.setActiveSession(2)).toBe(true)
    expect(mgr.getActiveSessionId()).toBe(2)
  })

  it('touchSession updates lastInteractionAt and marks the tab active', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    expect(mgr.getSession(1)!.lastInteractionAt).toBeUndefined()
    const before = Date.now() - 1
    expect(mgr.touchSession(1)).toBe(true)
    expect(mgr.getActiveSessionId()).toBe(1)
    const lastAt = mgr.getSession(1)!.lastInteractionAt
    expect(typeof lastAt).toBe('number')
    expect(lastAt!).toBeGreaterThanOrEqual(before)
  })

  it('touchSession returns false for unknown tab', () => {
    const mgr = new SessionManager()
    expect(mgr.touchSession(42)).toBe(false)
    expect(mgr.getActiveSessionId()).toBeNull()
  })

  it('closeSession clears active when closing the active tab', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.openSession(2, 'https://b.com', 'B')
    mgr.setActiveSession(2)
    mgr.closeSession(2)
    expect(mgr.getActiveSessionId()).toBeNull()
    expect(mgr.getSession(1)).not.toBeNull()
  })

  it('closeSession does not clear active when closing a different tab', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.openSession(2, 'https://b.com', 'B')
    mgr.setActiveSession(1)
    mgr.closeSession(2)
    expect(mgr.getActiveSessionId()).toBe(1)
  })

  it('clear resets activeSessionId', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.setActiveSession(1)
    mgr.clear()
    expect(mgr.getActiveSessionId()).toBeNull()
  })

  it('openSession preserves lastInteractionAt when the URL is unchanged', () => {
    const mgr = new SessionManager()
    mgr.openSession(1, 'https://a.com', 'A')
    mgr.touchSession(1)
    const firstTouch = mgr.getSession(1)!.lastInteractionAt!
    mgr.openSession(1, 'https://a.com', 'A (updated)')
    expect(mgr.getSession(1)!.lastInteractionAt).toBe(firstTouch)
  })
})
