import { describe, it, expect } from 'vitest'
import { HitlController, HitlSkipError } from '../src/hitl-controller.js'

describe('HitlController', () => {
  it('starts unpaused and awaitGate resolves immediately', async () => {
    const hitl = new HitlController()
    expect(hitl.getState().paused).toBe(false)
    await expect(hitl.awaitGate('browser_click')).resolves.toBeUndefined()
  })

  it('pause then resume emits state changes', async () => {
    const hitl = new HitlController()
    const states: boolean[] = []
    hitl.onChange((s) => states.push(s.paused))
    hitl.pause()
    hitl.resume()
    expect(states).toEqual([true, false])
  })

  it('blocks awaitGate while paused, unblocks on resume', async () => {
    const hitl = new HitlController()
    hitl.pause()
    let settled = false
    const p = hitl.awaitGate('browser_fill').then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    hitl.resume()
    await p
    expect(settled).toBe(true)
  })

  it('sets pendingTool while a call is waiting', async () => {
    const hitl = new HitlController()
    hitl.pause()
    const p = hitl.awaitGate('browser_click')
    await Promise.resolve()
    expect(hitl.getState().pendingTool).toBe('browser_click')
    hitl.resume()
    await p
  })

  it('skip rejects the current call with HitlSkipError and remains paused', async () => {
    const hitl = new HitlController()
    hitl.pause()
    const p = hitl.awaitGate('browser_fill')
    await Promise.resolve()
    hitl.skip()
    await expect(p).rejects.toBeInstanceOf(HitlSkipError)
    expect(hitl.getState().paused).toBe(true)
  })

  it('step lets exactly one call through then re-pauses', async () => {
    const hitl = new HitlController()
    hitl.pause()
    const p1 = hitl.awaitGate('browser_click')
    await Promise.resolve()
    hitl.step()
    await p1
    // second call should still be blocked
    let second = false
    const p2 = hitl.awaitGate('browser_click').then(() => { second = true })
    await Promise.resolve()
    expect(second).toBe(false)
    hitl.resume()
    await p2
  })

  it('HitlSkipError carries code HITL_SKIPPED', async () => {
    const hitl = new HitlController()
    hitl.pause()
    const p = hitl.awaitGate('browser_drag')
    await Promise.resolve()
    hitl.skip()
    try {
      await p
    } catch (err) {
      expect(err).toBeInstanceOf(HitlSkipError)
      expect((err as HitlSkipError).code).toBe('HITL_SKIPPED')
    }
  })
})
