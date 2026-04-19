import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// _fiberRoots를 mock으로 교체
vi.mock('bippy', () => {
  return {
    _fiberRoots: new Set<object>(),
    // 다른 export들도 최소한 정의
    isHostFiber: vi.fn(() => false),
    isCompositeFiber: vi.fn(() => false),
    getDisplayName: vi.fn(() => null),
    getFiberStack: vi.fn(() => []),
    getLatestFiber: vi.fn((f: unknown) => f),
    instrument: vi.fn(),
    secure: vi.fn((opts: unknown) => opts),
    traverseRenderedFibers: vi.fn(),
  }
})

import * as bippyModule from 'bippy'

// waitForHydration은 bippy mock 이후 import해야 올바르게 동작
import { waitForHydration } from '../src/guard/ssr-barrier.js'

describe('waitForHydration', () => {
  let originalReadyState: PropertyDescriptor | undefined

  beforeEach(() => {
    originalReadyState = Object.getOwnPropertyDescriptor(document, 'readyState')
    // _fiberRoots 초기화
    ;(bippyModule._fiberRoots as Set<object>).clear()
  })

  afterEach(() => {
    // readyState 복원
    if (originalReadyState) {
      Object.defineProperty(document, 'readyState', originalReadyState)
    } else {
      // configurable이면 delete 시도
      try {
        // @ts-expect-error — 테스트 환경 전용 reset
        delete document.readyState
      } catch {
        // ignore
      }
    }
    ;(bippyModule._fiberRoots as Set<object>).clear()
  })

  it('test 1: readyState="complete" + _fiberRoots.size > 0 → 즉시 resolve', async () => {
    // readyState를 'complete'로 설정
    Object.defineProperty(document, 'readyState', {
      get: () => 'complete',
      configurable: true,
    })
    // fiberRoots에 항목 추가
    ;(bippyModule._fiberRoots as Set<object>).add({})

    const promise = waitForHydration()
    // 즉시 resolve여야 하므로 짧은 timeout으로 확인
    await expect(promise).resolves.toBeUndefined()
  })

  it('test 2: readyState="loading" 시작 → load event 발생 후 resolve', async () => {
    Object.defineProperty(document, 'readyState', {
      get: () => 'loading',
      configurable: true,
    })
    ;(bippyModule._fiberRoots as Set<object>).add({})

    const promise = waitForHydration()

    // 아직 pending (loading 상태)
    let resolved = false
    promise.then(() => { resolved = true })

    // 한 틱 기다려도 아직 pending
    await new Promise((r) => setTimeout(r, 0))
    // loading 상태에서는 load event가 없으면 resolve 안 됨 (fiberRoots는 있으나 readyState 불충분)
    // 단, 현재 구현에서 load event listener가 있으므로 load event를 dispatch

    // readyState를 'complete'로 변경 후 load event dispatch
    Object.defineProperty(document, 'readyState', {
      get: () => 'complete',
      configurable: true,
    })
    window.dispatchEvent(new Event('load'))

    // load 이벤트 후 setTimeout(0) 1 tick 대기
    await new Promise((r) => setTimeout(r, 10))
    expect(resolved).toBe(true)
    await promise
  })

  it('test 3: _fiberRoots.size === 0 유지 + readyState="complete" → resolve 안 됨 (pending)', async () => {
    Object.defineProperty(document, 'readyState', {
      get: () => 'complete',
      configurable: true,
    })
    // _fiberRoots는 비어 있음

    let resolved = false
    const promise = waitForHydration().then(() => { resolved = true })

    // 한 틱 기다려도 resolve 안 됨
    await new Promise((r) => setTimeout(r, 10))
    expect(resolved).toBe(false)

    // promise를 완료시키지 않고 테스트 종료 — Promise는 GC됨
    void promise
  })
})
