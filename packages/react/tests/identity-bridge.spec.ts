import { describe, it, expect, vi } from 'vitest'
import { activateBridge } from '../src/bridge/identity-bridge.js'
import type { FiberIdentityIndex } from '../src/fiber/identity-index.js'
import type { FiberIdentityPath } from '@agrune/manifest'

// bippy는 identity-bridge.ts에서 직접 import하지 않으므로 mock 불필요
// FiberIdentityIndex도 직접 import하지 않으므로, 플레인 객체로 mock 인스턴스 생성

function makeMockIndex(
  getByPathImpl?: (path: FiberIdentityPath) => HTMLElement | null,
): FiberIdentityIndex {
  return {
    getByPath: vi.fn(getByPathImpl ?? (() => null)),
    indexFiber: vi.fn(),
    deindexFiber: vi.fn(),
  } as unknown as FiberIdentityIndex
}

describe('activateBridge — identity-bridge.ts', () => {
  // NOTE: 이 spec 파일 전체가 단일 jsdom window를 공유함.
  // activateBridge는 configurable:false lock이므로 한 번 설정되면 재설정 불가.
  // 테스트들은 순서대로 실행되며, 첫 번째 테스트에서 lock이 설정됨.

  it('test 1: 최초 activateBridge 호출 → window.__agrune_identity__ 게시 + lock descriptor 확인', () => {
    const mockIndex = makeMockIndex()
    const result = activateBridge(mockIndex)

    expect(result).toBe(true)
    expect(window.__agrune_identity__).toBeDefined()
    expect(window.__agrune_identity__?.version).toBe('1')

    const desc = Object.getOwnPropertyDescriptor(window, '__agrune_identity__')
    expect(desc?.writable).toBe(false)
    expect(desc?.configurable).toBe(false)
    expect(desc?.enumerable).toBe(false)
  })

  it('test 2: 이미 lock된 상태에서 activateBridge 재호출 → false 반환, 기존 bridge 유지', () => {
    // test 1이 이미 lock을 설정했으므로 재호출 시 false 반환
    const mockIndex2 = makeMockIndex()
    const result = activateBridge(mockIndex2)

    expect(result).toBe(false)
    // 기존 bridge는 변경되지 않음 (여전히 version '1')
    expect(window.__agrune_identity__?.version).toBe('1')
  })

  it('test 3: window.__agrune_identity__ 직접 할당 시도 → writable:false이므로 기존 값 유지', () => {
    const before = window.__agrune_identity__

    // writable:false이므로 silently ignored (sloppy mode) 또는 TypeError (strict mode)
    // jsdom에서는 silent fail
    try {
      // TypeScript optional property이므로 undefined 할당을 통해 우회 시도
      ;(window as unknown as Record<string, unknown>)['__agrune_identity__'] = { version: 'X', resolve: () => null }
    } catch {
      // strict mode TypeError — 정상
    }

    // 기존 값이 유지되어야 함
    expect(window.__agrune_identity__).toBe(before)
    expect(window.__agrune_identity__?.version).toBe('1')
  })

  it('test 4: Object.defineProperty 재정의 시도 → TypeError (configurable:false)', () => {
    // configurable:false이므로 재정의 시도 시 TypeError
    expect(() => {
      Object.defineProperty(window, '__agrune_identity__', {
        value: { resolve: () => null, version: '2' as const },
        writable: false,
        configurable: false,
      })
    }).toThrow(TypeError)
  })

  it('test 5: bridge.resolve(path) 호출 → mock index.getByPath에 delegate', () => {
    // test 1에서 설정된 bridge의 resolve가 mockIndex의 getByPath를 호출
    const path: FiberIdentityPath = [{ componentName: 'Button', key: null, index: 0 }]
    const result = window.__agrune_identity__?.resolve(path)
    // test 1의 mockIndex.getByPath mock은 null 반환
    expect(result).toBeNull()
  })

  it('test 6: bridge.version === "1"', () => {
    expect(window.__agrune_identity__?.version).toBe('1')
  })
})
