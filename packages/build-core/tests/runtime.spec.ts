// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebMcpManifest } from '../src/types'
import {
  createPageAgentRuntime,
  getInstalledPageAgentRuntime,
  installPageAgentRuntime,
} from '../src/runtime/page-agent-runtime'

function mockRect() {
  return {
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    top: 0,
    left: 0,
    right: 120,
    bottom: 40,
    toJSON: () => ({}),
  } as DOMRect
}

function makeManifest(): WebMcpManifest {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    exposureMode: 'grouped',
    groups: [
      {
        groupDesc: '인증 작업',
        groupId: 'auth',
        groupName: 'Auth',
        tools: [
          {
            action: 'click',
            status: 'active',
            targets: [
              {
                desc: '로그인 버튼',
                name: '로그인',
                selector: '[data-webcli-key="login"]',
                sourceColumn: 1,
                sourceFile: 'App.tsx',
                sourceLine: 1,
                targetId: 'login',
              },
            ],
            toolDesc: '클릭',
            toolName: 'auth_click',
          },
          {
            action: 'fill',
            status: 'active',
            targets: [
              {
                desc: '이메일 입력',
                name: '이메일',
                selector: '[data-webcli-key="email"]',
                sourceColumn: 1,
                sourceFile: 'App.tsx',
                sourceLine: 2,
                targetId: 'email',
              },
            ],
            toolDesc: '입력',
            toolName: 'auth_fill',
          },
        ],
      },
    ],
  }
}

describe('page agent runtime', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    const elementFromPoint = vi.fn(() => null)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
      writable: true,
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    })
  })

  it('getSnapshot은 visible/enabled/actionKind를 포함한다', () => {
    const button = document.createElement('button')
    button.textContent = '로그인'
    button.setAttribute('data-webcli-key', 'login')
    button.getBoundingClientRect = () => mockRect()

    const input = document.createElement('input')
    input.setAttribute('data-webcli-key', 'email')
    input.setAttribute('data-webcli-sensitive', 'true')
    input.getBoundingClientRect = () => mockRect()

    document.body.append(button, input)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => button)

    const runtime = createPageAgentRuntime(makeManifest())
    const snapshot = runtime.getSnapshot()

    expect(snapshot.version).toBeGreaterThan(0)
    expect(snapshot.groups).toEqual([
      expect.objectContaining({
        groupId: 'auth',
        groupName: 'Auth',
        targetIds: ['email', 'login'],
      }),
    ])
    expect(snapshot.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionKind: 'click',
          enabled: true,
          sensitive: false,
          targetId: 'login',
          visible: true,
          actionableNow: true,
          overlay: false,
        }),
        expect.objectContaining({
          actionKind: 'fill',
          sensitive: true,
          targetId: 'email',
          visible: true,
          actionableNow: false,
          overlay: false,
        }),
      ]),
    )
  })

  it('getSnapshot은 비실행 가능 target도 상태와 함께 유지한다', () => {
    const button = document.createElement('button')
    button.textContent = '로그인'
    button.setAttribute('data-webcli-key', 'login')
    button.getBoundingClientRect = () => mockRect()
    button.disabled = true

    const input = document.createElement('input')
    input.setAttribute('data-webcli-key', 'email')
    input.getBoundingClientRect = () => mockRect()
    input.style.display = 'none'

    document.body.append(button, input)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => button)

    const runtime = createPageAgentRuntime(makeManifest())
    const snapshot = runtime.getSnapshot()

    expect(snapshot.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: 'login',
          enabled: false,
          actionableNow: false,
          overlay: false,
        }),
        expect.objectContaining({
          targetId: 'email',
          visible: false,
          inViewport: false,
          actionableNow: false,
          overlay: false,
        }),
      ]),
    )
  })

  it('오버레이에 가려진 target은 snapshot에 남지만 covered 상태가 된다', async () => {
    const button = document.createElement('button')
    button.textContent = '로그인'
    button.setAttribute('data-webcli-key', 'login')
    button.getBoundingClientRect = () => mockRect()

    const overlay = document.createElement('div')
    overlay.getBoundingClientRect = () => mockRect()

    document.body.append(button, overlay)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => overlay)

    const runtime = createPageAgentRuntime(makeManifest())
    const snapshot = runtime.getSnapshot()
    expect(snapshot.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: 'login',
          covered: true,
          actionableNow: false,
          overlay: false,
        }),
      ]),
    )

    const result = await runtime.act({ targetId: 'login', expectedVersion: snapshot.version })
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('expected runtime.act to fail for covered target')
    }
    expect(result.error.code).toBe('NOT_VISIBLE')
  })

  it('installPageAgentRuntime은 window.webcliDom 전역과 installed handle을 노출한다', () => {
    const handle = installPageAgentRuntime(makeManifest())

    expect(window.webcliDom).toBeDefined()
    expect(getInstalledPageAgentRuntime()).toBe(handle)

    handle.dispose()
    expect(window.webcliDom).toBeUndefined()
    expect(getInstalledPageAgentRuntime()).toBeNull()
  })

  it('act는 click 실행 후 최신 snapshot을 반환한다', async () => {
    const button = document.createElement('button')
    button.setAttribute('data-webcli-key', 'login')
    button.getBoundingClientRect = () => mockRect()

    let clicked = false
    button.addEventListener('click', () => {
      clicked = true
      button.disabled = true
    })

    document.body.appendChild(button)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => button)

    const runtime = createPageAgentRuntime(makeManifest())
    const snapshot = runtime.getSnapshot()
    const result = await runtime.act({ expectedVersion: snapshot.version, targetId: 'login' })

    expect(clicked).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.snapshotVersion).toBeGreaterThanOrEqual(snapshot.version)
    expect(result.snapshot?.targets.find(target => target.targetId === 'login')).toEqual(
      expect.objectContaining({
        targetId: 'login',
        enabled: false,
        actionableNow: false,
        overlay: false,
      }),
    )
  })

  it('fixed overlay 안의 target은 overlay=true로 표시된다', () => {
    const overlay = document.createElement('div')
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '100',
    })

    const button = document.createElement('button')
    button.textContent = '로그인'
    button.setAttribute('data-webcli-key', 'login')
    button.getBoundingClientRect = () => mockRect()
    overlay.appendChild(button)
    document.body.appendChild(overlay)

    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => button)

    const runtime = createPageAgentRuntime(makeManifest())
    const snapshot = runtime.getSnapshot()

    expect(snapshot.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: 'login',
          overlay: true,
          actionableNow: true,
        }),
      ]),
    )
  })

  it('fill은 input/change 이벤트를 발생시키고 값이 반영된다', async () => {
    const input = document.createElement('input')
    input.setAttribute('data-webcli-key', 'email')
    input.getBoundingClientRect = () => mockRect()

    const onInput = vi.fn()
    const onChange = vi.fn()
    input.addEventListener('input', onInput)
    input.addEventListener('change', onChange)

    document.body.appendChild(input)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => input)

    const runtime = createPageAgentRuntime(makeManifest())
    const snapshot = runtime.getSnapshot()
    const result = await runtime.fill({
      expectedVersion: snapshot.version,
      targetId: 'email',
      value: 'hello@example.com',
    })

    expect(result.ok).toBe(true)
    expect(input.value).toBe('hello@example.com')
    expect(onInput).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalled()
  })

  it('expectedVersion이 다르면 STALE_SNAPSHOT 오류를 반환한다', async () => {
    const button = document.createElement('button')
    button.setAttribute('data-webcli-key', 'login')
    button.getBoundingClientRect = () => mockRect()
    document.body.appendChild(button)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => button)

    const runtime = createPageAgentRuntime(makeManifest())
    const snapshot = runtime.getSnapshot()
    button.disabled = true

    const result = await runtime.act({
      expectedVersion: snapshot.version,
      targetId: 'login',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('expected runtime.act to fail')
    }
    expect(result.error.code).toBe('STALE_SNAPSHOT')
  })

  it('wait는 target 상태가 바뀌면 성공한다', async () => {
    const button = document.createElement('button')
    button.setAttribute('data-webcli-key', 'login')
    button.getBoundingClientRect = () => mockRect()
    document.body.appendChild(button)
    ;(document.elementFromPoint as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => button)

    const runtime = createPageAgentRuntime(makeManifest())

    setTimeout(() => {
      button.disabled = true
    }, 25)

    const result = await runtime.wait({
      state: 'disabled',
      targetId: 'login',
      timeoutMs: 300,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected runtime.wait to succeed')
    }
    expect(result.result).toEqual(
      expect.objectContaining({
        state: 'disabled',
        targetId: 'login',
      }),
    )
  })
})
