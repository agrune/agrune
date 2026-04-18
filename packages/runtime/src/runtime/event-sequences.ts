import type { CdpClient } from './cdp-client'

export interface Coords { x: number; y: number }

export interface EventSequences {
  click(coords: Coords): Promise<void>
  dblclick(coords: Coords): Promise<void>
  contextmenu(coords: Coords): Promise<void>
  hover(coords: Coords): Promise<void>
  longpress(coords: Coords): Promise<void>
  mousePressed(coords: Coords, button?: 'left' | 'right'): Promise<void>
  mouseMoved(coords: Coords, buttons?: number): Promise<void>
  mouseReleased(coords: Coords, button?: 'left' | 'right'): Promise<void>
  pointerDrag(src: Coords, dst: Coords, steps: Coords[]): Promise<void>
  wheel(coords: Coords, deltaY: number, ctrlKey?: boolean): Promise<void>
  htmlDrag(src: Coords, dst: Coords): Promise<void>
  insertText(text: string): Promise<void>
  typeText(text: string, options?: { delayMs?: number }): Promise<void>
  pressKey(
    key: string,
    options?: { modifiers?: number; code?: string; text?: string },
  ): Promise<void>
  selectAllAndDelete(): Promise<void>
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function keyFromChar(ch: string): {
  key: string
  code: string
  windowsVirtualKeyCode?: number
} {
  if (ch.length === 1 && /[a-zA-Z]/.test(ch)) {
    return {
      key: ch,
      code: `Key${ch.toUpperCase()}`,
      windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0),
    }
  }
  if (ch.length === 1 && /[0-9]/.test(ch)) {
    return {
      key: ch,
      code: `Digit${ch}`,
      windowsVirtualKeyCode: ch.charCodeAt(0),
    }
  }
  if (ch === ' ') return { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }
  return { key: ch, code: '' }
}

export function createEventSequences(cdp: CdpClient): EventSequences {
  const send = cdp.sendCdpEvent.bind(cdp)
  const mouse = (type: string, x: number, y: number, extra?: Record<string, unknown>) =>
    send('Input.dispatchMouseEvent', { type, x, y, ...extra })

  return {
    async click(coords) {
      await mouse('mouseMoved', coords.x, coords.y)
      await mouse('mousePressed', coords.x, coords.y, { button: 'left', clickCount: 1 })
      await mouse('mouseReleased', coords.x, coords.y, { button: 'left', clickCount: 1 })
    },
    async dblclick(coords) {
      await mouse('mousePressed', coords.x, coords.y, { button: 'left', clickCount: 1 })
      await mouse('mouseReleased', coords.x, coords.y, { button: 'left', clickCount: 1 })
      await mouse('mousePressed', coords.x, coords.y, { button: 'left', clickCount: 2 })
      await mouse('mouseReleased', coords.x, coords.y, { button: 'left', clickCount: 2 })
    },
    async contextmenu(coords) {
      await mouse('mousePressed', coords.x, coords.y, { button: 'right', clickCount: 1 })
      await mouse('mouseReleased', coords.x, coords.y, { button: 'right', clickCount: 1 })
    },
    async hover(coords) {
      await mouse('mouseMoved', coords.x, coords.y)
    },
    async longpress(coords) {
      await mouse('mousePressed', coords.x, coords.y, { button: 'left', clickCount: 1 })
      await sleep(500)
      await mouse('mouseReleased', coords.x, coords.y, { button: 'left', clickCount: 1 })
    },
    async mousePressed(coords, button = 'left') {
      await mouse('mousePressed', coords.x, coords.y, { button, clickCount: 1 })
    },
    async mouseMoved(coords, buttons) {
      await mouse('mouseMoved', coords.x, coords.y, buttons != null ? { buttons } : undefined)
    },
    async mouseReleased(coords, button = 'left') {
      await mouse('mouseReleased', coords.x, coords.y, { button, clickCount: 1 })
    },
    async pointerDrag(src, dst, steps) {
      // Hover over source first so the browser resolves the correct target element
      // before pressing (same pattern as click()).
      await mouse('mouseMoved', src.x, src.y)
      await mouse('mousePressed', src.x, src.y, { button: 'left', clickCount: 1 })
      // Yield one frame so the framework (e.g. ReactFlow) can initialise drag state
      // before receiving the first move event.
      await sleep(16)
      for (const step of steps) {
        // buttons: 1 signals "left button held" — without it the browser generates
        // pointermove events with buttons===0, which frameworks like ReactFlow
        // interpret as a hover rather than a drag continuation.
        await mouse('mouseMoved', step.x, step.y, { buttons: 1 })
      }
      await mouse('mouseReleased', dst.x, dst.y, { button: 'left', clickCount: 1 })
    },
    async wheel(coords, deltaY, ctrlKey = false) {
      await mouse('mouseMoved', coords.x, coords.y)
      await mouse('mouseWheel', coords.x, coords.y, { deltaX: 0, deltaY, modifiers: ctrlKey ? 4 : 0 })
    },
    async htmlDrag(src, dst) {
      await send('Input.setInterceptDrags', { enabled: true })
      await mouse('mousePressed', src.x, src.y, { button: 'left', clickCount: 1 })
      await mouse('mouseMoved', dst.x, dst.y)
      await sleep(100) // wait for dragIntercepted event
      const dragData = cdp.getPendingDragData()
      if (dragData) {
        await send('Input.dispatchDragEvent', { type: 'drop', x: dst.x, y: dst.y, data: dragData })
        cdp.clearPendingDragData()
      }
      await mouse('mouseReleased', dst.x, dst.y, { button: 'left', clickCount: 1 })
      await send('Input.setInterceptDrags', { enabled: false })
    },
    async insertText(text) {
      await send('Input.insertText', { text })
    },
    async typeText(text, options) {
      const delay = options?.delayMs ?? 0
      for (const ch of Array.from(text)) {
        const keyInfo = keyFromChar(ch)
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: keyInfo.key,
          code: keyInfo.code,
          text: ch,
          unmodifiedText: ch,
          ...(keyInfo.windowsVirtualKeyCode
            ? { windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode }
            : {}),
        })
        await send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: keyInfo.key,
          code: keyInfo.code,
          ...(keyInfo.windowsVirtualKeyCode
            ? { windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode }
            : {}),
        })
        if (delay > 0) await sleep(delay)
      }
    },
    async pressKey(key, options) {
      const modifiers = options?.modifiers ?? 0
      const code = options?.code ?? key
      const text = options?.text
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        modifiers,
        ...(text ? { text, unmodifiedText: text } : {}),
      })
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        modifiers,
      })
    },
    async selectAllAndDelete() {
      // Select-all via CDP "selectAll" command hint — Chromium ignores modifiers
      // when commands is present, so this works cross-platform.
      await send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'a',
        code: 'KeyA',
        modifiers: 4, // Meta
        commands: ['selectAll'],
      })
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        modifiers: 4,
      })
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Delete',
        code: 'Delete',
      })
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Delete',
        code: 'Delete',
      })
    },
  }
}
