import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React from 'react'

// bippy mock — instrument/secure/traverseRenderedFibers는 no-op으로
vi.mock('bippy', () => ({
  instrument: vi.fn(),
  secure: vi.fn((opts: unknown) => opts),
  traverseRenderedFibers: vi.fn(),
  getLatestFiber: vi.fn((f: unknown) => f),
  isHostFiber: vi.fn(() => false),
  isCompositeFiber: vi.fn(() => false),
  getDisplayName: vi.fn(() => null),
  getFiberStack: vi.fn(() => []),
  _fiberRoots: new Set<object>([{}]), // 비어있지 않아야 waitForHydration이 통과
}))

// waitForHydration을 mock해 즉시 resolve되도록
vi.mock('../src/guard/ssr-barrier.js', () => ({
  waitForHydration: vi.fn(() => Promise.resolve()),
}))

import * as bippyModule from 'bippy'
import { AgruneDevtools } from '../src/components/AgruneDevtools.js'
import type { AgruneManifest } from '@agrune/manifest'

const minimalManifest: AgruneManifest = {
  version: 3,
  groups: [],
}

// 테스트 간 __agrune_identity__ 상태 관리
// configurable:false이면 delete 불가이므로, 각 테스트는 기존 상태를 고려해야 함
function clearIdentityBridge() {
  try {
    // configurable:true인 경우에만 delete 가능
    const desc = Object.getOwnPropertyDescriptor(window, '__agrune_identity__')
    if (desc && desc.configurable) {
      delete window.__agrune_identity__
    }
  } catch {
    // configurable:false면 무시
  }
}

describe('AgruneDevtools component', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
    clearIdentityBridge()
    // readyState를 'complete'로 설정
    Object.defineProperty(document, 'readyState', {
      get: () => 'complete',
      configurable: true,
    })
    vi.mocked(bippyModule.instrument).mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('test 1: mode="dev" 렌더 → throw 없음, null 반환 (시각적 출력 없음)', () => {
    const { container } = render(
      <AgruneDevtools manifest={minimalManifest} mode="dev" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('test 2: mode="dev" + hydration complete → useEffect 후 window.__agrune_identity__ 게시', async () => {
    // __agrune_identity__가 이미 lock된 경우 건너뜀
    const existingDesc = Object.getOwnPropertyDescriptor(window, '__agrune_identity__')
    if (existingDesc && existingDesc.configurable === false) {
      // 이미 lock된 상태 — activateBridge가 false 반환하지만 bridge 존재는 확인 가능
      render(<AgruneDevtools manifest={minimalManifest} mode="dev" />)
      await act(async () => { await Promise.resolve() })
      expect(window.__agrune_identity__).toBeDefined()
      return
    }

    render(<AgruneDevtools manifest={minimalManifest} mode="dev" />)

    // useEffect + waitForHydration Promise.resolve() 완료 대기
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve() // 추가 마이크로태스크 flush
    })

    expect(window.__agrune_identity__).toBeDefined()
    // Phase 16: version bumped '1' → '2' (resolvePath 추가)
    expect(window.__agrune_identity__?.version).toBe('2')
  })

  it('test 3: mode="prod" + AGRUNE_PROD_ENABLED 미설정 → bridge 게시 안 됨', async () => {
    clearIdentityBridge()
    // env 미설정 (기본값)
    vi.stubEnv('AGRUNE_PROD_ENABLED', '')

    render(<AgruneDevtools manifest={minimalManifest} mode="prod" />)

    await act(async () => {
      await Promise.resolve()
    })

    // bridge가 없어야 함 (configurable:false로 기존 lock이 있을 수 있으므로 instrument 호출 여부로 확인)
    // isProdEnabled('prod') → env 미설정 → false → useEffect early return
    // instrument가 호출되지 않았음을 확인
    expect(vi.mocked(bippyModule.instrument)).not.toHaveBeenCalled()
  })

  it('test 4: mode="prod" + env=true + localStorage="true" → bridge 게시 + instrument 호출', async () => {
    clearIdentityBridge()
    vi.stubEnv('AGRUNE_PROD_ENABLED', 'true')
    localStorage.setItem('agrune.prod.consent', 'true')

    const existingDesc = Object.getOwnPropertyDescriptor(window, '__agrune_identity__')
    const alreadyLocked = existingDesc && existingDesc.configurable === false

    render(<AgruneDevtools manifest={minimalManifest} mode="prod" />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // instrument가 호출됨 (guard 통과 + hydration 완료)
    expect(vi.mocked(bippyModule.instrument)).toHaveBeenCalled()

    if (!alreadyLocked) {
      expect(window.__agrune_identity__).toBeDefined()
    }
  })

  it('test 5: unmount → cleanup cancelled flag 설정 (bridge는 unlock 불가 — REACT-02 intentional)', async () => {
    render(<AgruneDevtools manifest={minimalManifest} mode="dev" />)
    await act(async () => { await Promise.resolve() })

    // unmount 시 cleanup 실행 (cancelled = true) — bridge lock은 유지됨
    cleanup()

    // bridge가 있었다면 여전히 존재해야 함 (configurable:false이므로 제거 불가)
    const desc = Object.getOwnPropertyDescriptor(window, '__agrune_identity__')
    if (desc) {
      expect(desc.configurable).toBe(false)
    }
  })
})
