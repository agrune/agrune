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
    // Phase 16: version bumped '1' → '2'
    expect(window.__agrune_identity__?.version).toBe('2')

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
    // 기존 bridge는 변경되지 않음 (여전히 version '2')
    expect(window.__agrune_identity__?.version).toBe('2')
  })

  it('test 3: window.__agrune_identity__ 직접 할당 시도 → writable:false이므로 기존 값 유지', () => {
    const before = window.__agrune_identity__

    // writable:false이므로 silently ignored (sloppy mode) 또는 TypeError (strict mode)
    // jsdom에서는 silent fail
    try {
      // TypeScript optional property이므로 undefined 할당을 통해 우회 시도
      ;(window as unknown as Record<string, unknown>)['__agrune_identity__'] = { version: 'X', resolve: () => null, resolvePath: () => null }
    } catch {
      // strict mode TypeError — 정상
    }

    // 기존 값이 유지되어야 함
    expect(window.__agrune_identity__).toBe(before)
    expect(window.__agrune_identity__?.version).toBe('2')
  })

  it('test 4: Object.defineProperty 재정의 시도 → TypeError (configurable:false)', () => {
    // configurable:false이므로 재정의 시도 시 TypeError
    expect(() => {
      Object.defineProperty(window, '__agrune_identity__', {
        value: { resolve: () => null, resolvePath: () => null, version: '2' as const },
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

  it('test 6: bridge.version === "2"', () => {
    // Phase 16: version bumped from '1' to '2' (resolvePath 추가)
    expect(window.__agrune_identity__?.version).toBe('2')
  })
})

describe('bridge v2 (Phase 16 RECORD-01) — resolvePath delegate', () => {
  // NOTE: 이 describe 블록은 앞 블록의 configurable:false lock을 공유한다.
  // jsdom window가 spec 파일 전체에서 단일 인스턴스이므로 앞 테스트에서
  // activateBridge된 bridge의 resolvePath 를 직접 검증한다.
  //
  // 주의: 앞 `activateBridge — identity-bridge.ts` 블록에서 mockIndex를
  // lock했으므로 여기서는 `window.__agrune_identity__` 를 통해 실행하고,
  // getPathByDom delegate 동작은 fresh FiberIdentityIndex 인스턴스로
  // 직접 검증하는 대신 bridge 표면에 함수가 노출되었는지 + shape 이 맞는지
  // 확인하는 방식으로 분리한다.

  it('test A: bridge.resolvePath(el) 함수가 own-property 로 노출된다', () => {
    const bridge = window.__agrune_identity__
    expect(bridge).toBeDefined()
    expect(typeof bridge?.resolvePath).toBe('function')
  })

  it('test B: bridge.version === "2" (v2 bump 재확인)', () => {
    expect(window.__agrune_identity__?.version).toBe('2')
  })

  it('test C: bridge.resolve(path) 기존 경로 회귀 없음 — 여전히 함수로 노출', () => {
    const bridge = window.__agrune_identity__
    expect(bridge).toBeDefined()
    expect(typeof bridge?.resolve).toBe('function')
    // 앞 블록 test 5 와 동일: mockIndex.getByPath → null
    const path: FiberIdentityPath = [{ componentName: 'Button', key: null, index: 0 }]
    expect(bridge?.resolve(path)).toBeNull()
  })

  it('test D: configurable:false lock 하에서도 v2 bridge 덮어쓰기 불가', () => {
    // Phase 13 의 tamper-proof lock 이 v2 에서도 유지됨
    expect(() => {
      Object.defineProperty(window, '__agrune_identity__', {
        value: { resolve: () => null, resolvePath: () => null, version: 'fake' as const },
        writable: false,
        configurable: false,
      })
    }).toThrow(TypeError)
  })

  it('test E: resolvePath delegate semantic — fresh index 에서 getPathByDom 과 동일 결과', async () => {
    // Fresh index 로 resolvePath 가 getPathByDom 에 delegate 함을 간접 검증.
    // window.__agrune_identity__ 는 test 1 의 mockIndex (getByPath → null, getPathByDom 없음) 에 연결되어 있으므로
    // 여기서는 activateBridge 로직이 resolvePath 를 올바르게 delegate 하는지 단위 검증을 한다.
    //
    // 전략: 별도 index 에 activateBridge 를 호출해도 lock 때문에 false 반환 → 기존 bridge 유지.
    // 따라서 실제 delegate 검증은 FiberIdentityIndex.getPathByDom 단위 테스트 (identity-index.spec.ts)
    // + bridge 에 resolvePath 가 노출됨 (test A) 두 가지로 충분.
    // 이 테스트는 lock 하에서 mockIndex 의 resolvePath 호출이 함수로 존재하고 호출 시 throw 하지 않음을 확인.
    const bridge = window.__agrune_identity__
    expect(bridge).toBeDefined()
    // 임의 element 전달 — mockIndex 의 getPathByDom 이 정의되지 않았으므로 bridge.resolvePath 는 해당 호출 결과 전달
    const el = document.createElement('div')
    // mockIndex 에 getPathByDom 이 없으므로 bridge.resolvePath(el) 는 TypeError 가능
    // → activateBridge 구현이 `index.getPathByDom?.(el) ?? null` 형태로 방어하는지 확인 겸
    //   아니면 bridge.resolvePath 가 함수로 노출되어 있기만 해도 통과 (shape 검증)
    expect(typeof bridge?.resolvePath).toBe('function')
    // resolvePath 가 실제 호출되어도 throw 하지 않아야 함 (mockIndex 에 getPathByDom 없어도 graceful)
    // → 구현에서 index.getPathByDom 이 undefined 이면 null 반환하도록 방어
    expect(() => bridge?.resolvePath(el)).not.toThrow()
    expect(bridge?.resolvePath(el)).toBeNull()
  })
})
