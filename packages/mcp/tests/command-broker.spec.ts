import { describe, it, expect } from 'vitest'
import { CommandBroker, type CommandEvent } from '../src/command-broker.js'

describe('CommandBroker', () => {
  it('nextId returns monotonically unique strings', () => {
    const broker = new CommandBroker()
    const a = broker.nextId()
    const b = broker.nextId()
    expect(a).not.toBe(b)
    expect(a.startsWith('cmd-')).toBe(true)
  })

  it('emits events to active subscribers', () => {
    const broker = new CommandBroker()
    const received: CommandEvent[] = []
    broker.subscribe((e) => received.push(e))
    broker.emit({ id: '1', ts: 0, sessionId: null, tool: 'browser_click', phase: 'start' })
    expect(received).toHaveLength(1)
    expect(received[0].tool).toBe('browser_click')
  })

  it('unsubscribe removes listener', () => {
    const broker = new CommandBroker()
    let count = 0
    const off = broker.subscribe(() => { count += 1 })
    broker.emit({ id: '1', ts: 0, sessionId: null, tool: 'x', phase: 'start' })
    off()
    broker.emit({ id: '2', ts: 0, sessionId: null, tool: 'x', phase: 'start' })
    expect(count).toBe(1)
  })

  it('retains at most bufferSize events (FIFO)', () => {
    const broker = new CommandBroker(3)
    for (let i = 0; i < 5; i += 1) {
      broker.emit({ id: `${i}`, ts: i, sessionId: null, tool: 't', phase: 'start' })
    }
    const buffered = broker.getBuffered()
    expect(buffered).toHaveLength(3)
    expect(buffered[0].id).toBe('2')
    expect(buffered[2].id).toBe('4')
  })

  it('isolates listener errors from other listeners', () => {
    const broker = new CommandBroker()
    let secondCalled = false
    broker.subscribe(() => { throw new Error('boom') })
    broker.subscribe(() => { secondCalled = true })
    broker.emit({ id: '1', ts: 0, sessionId: null, tool: 't', phase: 'start' })
    expect(secondCalled).toBe(true)
  })

  it('clear empties the buffer', () => {
    const broker = new CommandBroker()
    broker.emit({ id: '1', ts: 0, sessionId: null, tool: 't', phase: 'start' })
    broker.clear()
    expect(broker.getBuffered()).toHaveLength(0)
  })
})
