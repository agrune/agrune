import { describe, expect, it, vi } from 'vitest'
import {
  RecoverySupervisor,
  type RecoveryEvent,
  type RecoveryStrategy,
} from '../src/recovery-supervisor.js'

const noopSleep = async () => {}

function makeStrategy(overrides: Partial<RecoveryStrategy> = {}): RecoveryStrategy {
  return {
    canRelaunch: true,
    reconnect: vi.fn(async () => {}),
    relaunchAndReconnect: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('RecoverySupervisor', () => {
  it('succeeds on first reconnect attempt and emits succeeded event', async () => {
    const events: RecoveryEvent[] = []
    const strategy = makeStrategy()
    const supervisor = new RecoverySupervisor(strategy, { sleep: noopSleep })
    supervisor.onEvent((e) => events.push(e))

    await supervisor.trigger('connection_lost', new Error('drop'))

    expect(strategy.reconnect).toHaveBeenCalledTimes(1)
    expect(events.map(e => e.kind)).toEqual(['started', 'succeeded'])
    expect(supervisor.getLastFailure()).toBeNull()
  })

  it('retries up to maxAttempts with exponential backoff then fails', async () => {
    const delays: number[] = []
    const strategy = makeStrategy({
      reconnect: vi.fn(async () => {
        throw new Error('still down')
      }),
    })
    const supervisor = new RecoverySupervisor(strategy, {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 40,
      sleep: async (ms) => { delays.push(ms) },
    })
    const events: RecoveryEvent[] = []
    supervisor.onEvent((e) => events.push(e))

    await expect(supervisor.trigger('connection_lost', new Error('drop'))).rejects.toThrow('still down')

    expect(strategy.reconnect).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([10, 20])
    const kinds = events.map(e => e.kind)
    expect(kinds.filter(k => k === 'attempt_failed').length).toBe(3)
    expect(kinds).toContain('failed')
    expect(supervisor.getLastFailure()?.attempts).toBe(3)
  })

  it('uses relaunchAndReconnect for chrome_crashed when canRelaunch=true', async () => {
    const strategy = makeStrategy()
    const supervisor = new RecoverySupervisor(strategy, { sleep: noopSleep })

    await supervisor.trigger('chrome_crashed', new Error('boom'))

    expect(strategy.relaunchAndReconnect).toHaveBeenCalledTimes(1)
    expect(strategy.reconnect).not.toHaveBeenCalled()
  })

  it('short-circuits chrome_crashed when canRelaunch=false', async () => {
    const strategy = makeStrategy({ canRelaunch: false })
    const supervisor = new RecoverySupervisor(strategy, { sleep: noopSleep })
    const events: RecoveryEvent[] = []
    supervisor.onEvent((e) => events.push(e))

    await expect(supervisor.trigger('chrome_crashed', new Error('boom'))).rejects.toThrow(
      /relaunch is not available/i,
    )

    expect(strategy.relaunchAndReconnect).not.toHaveBeenCalled()
    expect(events.find(e => e.kind === 'failed')).toBeTruthy()
  })

  it('dedupes concurrent triggers to one in-flight run', async () => {
    let resolveInner: () => void = () => {}
    const reconnect = vi.fn(async () => {
      await new Promise<void>((r) => { resolveInner = r })
    })
    const strategy = makeStrategy({ reconnect })
    const supervisor = new RecoverySupervisor(strategy, { sleep: noopSleep })

    const a = supervisor.trigger('connection_lost', new Error('a'))
    const b = supervisor.trigger('connection_lost', new Error('b'))
    expect(a).toBe(b)

    resolveInner()
    await a
    expect(reconnect).toHaveBeenCalledTimes(1)
  })
})
