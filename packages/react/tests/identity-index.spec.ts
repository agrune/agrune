import { describe, it, expect, vi, beforeEach } from 'vitest'

// bippy를 mock해야 FiberIdentityIndex를 테스트할 수 있음
// (브라우저 환경 없이 jsdom에서 fiber 시뮬레이션)
vi.mock('bippy', () => {
  return {
    isHostFiber: vi.fn((fiber: unknown) => {
      const f = fiber as { tag?: number }
      return f.tag === 5 // HostComponentTag
    }),
    isCompositeFiber: vi.fn((fiber: unknown) => {
      const f = fiber as { tag?: number }
      // composite = function/class component (tag 0=FunctionComponent, 1=ClassComponent, 14=Memo, 15=SimpleMemo, 11=ForwardRef)
      return [0, 1, 11, 14, 15].includes(f.tag ?? -1)
    }),
    getDisplayName: vi.fn((type: unknown) => {
      // displayName 명시적 설정 우선, 그 다음 name 속성
      if (type && typeof type === 'object') {
        const t = type as { displayName?: string }
        if (t.displayName) return t.displayName
      }
      if (typeof type === 'function') {
        const fn = type as { displayName?: string; name?: string }
        return fn.displayName ?? fn.name ?? null
      }
      return null
    }),
    getFiberStack: vi.fn((fiber: unknown) => {
      // return self + ancestors chain via .return
      const stack: unknown[] = []
      let current: unknown = fiber
      while (current) {
        stack.push(current)
        current = (current as { return?: unknown }).return
      }
      return stack
    }),
    getLatestFiber: vi.fn((fiber: unknown) => fiber),
  }
})

import { FiberIdentityIndex } from '../src/fiber/identity-index.js'
import type { Fiber } from 'bippy'

// ─── Mock Fiber Builder ────────────────────────────────────────────────────────

interface MockFiberOptions {
  tag: number
  type: unknown
  key?: string | null
  index?: number
  stateNode?: HTMLElement | null
  return?: MockFiber | null
}

interface MockFiber {
  tag: number
  type: unknown
  key: string | null
  index: number
  stateNode: HTMLElement | null
  return: MockFiber | null
}

function makeMockFiber(opts: MockFiberOptions): MockFiber {
  return {
    tag: opts.tag,
    type: opts.type,
    key: opts.key ?? null,
    index: opts.index ?? 0,
    stateNode: opts.stateNode ?? null,
    return: opts.return ?? null,
  }
}

// tag constants
const HOST_COMPONENT = 5      // isHostFiber
const FUNCTION_COMPONENT = 0  // isCompositeFiber
const MEMO_COMPONENT = 14     // MemoComponentTag

// 이름 충돌 방지를 위해 displayName을 명시적으로 설정한 타입 객체를 사용
function makeComponentType(displayName: string): { displayName: string } {
  return { displayName }
}

function makeDiv(): HTMLElement {
  return document.createElement('div')
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FiberIdentityIndex', () => {
  let index: FiberIdentityIndex

  beforeEach(() => {
    index = new FiberIdentityIndex()
  })

  it('test 1: buildPath는 isCompositeFiber filter 적용해 host fiber를 제외한다', () => {
    const dom = makeDiv()
    const ButtonType = makeComponentType('Button')

    const compositeFiber = makeMockFiber({ tag: FUNCTION_COMPONENT, type: ButtonType })
    const hostFiber = makeMockFiber({
      tag: HOST_COMPONENT,
      type: 'div',
      stateNode: dom,
      return: compositeFiber,
    })

    index.indexFiber(hostFiber as unknown as Fiber)

    // path에는 composite fiber만 포함 (host 'div'는 제외)
    const path = [{ componentName: 'Button', key: null, index: 0 }]
    const result = index.getByPath(path)
    expect(result).toBe(dom)
  })

  it('test 2: buildPath에서 slice(0, 8) cap 적용 — 12단계 깊이도 8개 segment만 반환', () => {
    const dom = makeDiv()

    // 12단계 composite fiber chain 생성 (인덱스 0이 가장 가까운 조상)
    let topFiber: MockFiber | null = null
    // i = 11 down to 0: Comp11 이 root 근처, Comp0이 host 바로 위
    for (let i = 11; i >= 0; i--) {
      const compType = makeComponentType(`Comp${i}`)
      topFiber = makeMockFiber({
        tag: FUNCTION_COMPONENT,
        type: compType,
        index: i,
        return: topFiber,
      })
    }

    const hostFiber = makeMockFiber({
      tag: HOST_COMPONENT,
      type: 'div',
      stateNode: dom,
      return: topFiber,
    })

    index.indexFiber(hostFiber as unknown as Fiber)

    // getFiberStack mock: [host, Comp0, Comp1, ..., Comp11]
    // filter composite: [Comp0, ..., Comp11] (12개)
    // slice(0, 8): [Comp0, Comp1, ..., Comp7]
    const expectedPath = Array.from({ length: 8 }, (_, i) => ({
      componentName: `Comp${i}`,
      key: null,
      index: i,
    }))
    const result = index.getByPath(expectedPath)
    expect(result).toBe(dom)
  })

  it('test 3: indexFiber 후 getByPath가 DOM 반환, 다른 path는 null 반환', () => {
    const dom = makeDiv()
    const ButtonType = makeComponentType('Button')

    const compositeFiber = makeMockFiber({ tag: FUNCTION_COMPONENT, type: ButtonType })
    const hostFiber = makeMockFiber({
      tag: HOST_COMPONENT,
      type: 'div',
      stateNode: dom,
      return: compositeFiber,
    })

    index.indexFiber(hostFiber as unknown as Fiber)

    const correctPath = [{ componentName: 'Button', key: null, index: 0 }]
    expect(index.getByPath(correctPath)).toBe(dom)

    const wrongPath = [{ componentName: 'Foo', key: null, index: 0 }]
    expect(index.getByPath(wrongPath)).toBeNull()
  })

  it('test 4: deindexFiber 후 getByPath는 null 반환', () => {
    const dom = makeDiv()
    const InputType = makeComponentType('Input')

    const compositeFiber = makeMockFiber({ tag: FUNCTION_COMPONENT, type: InputType })
    const hostFiber = makeMockFiber({
      tag: HOST_COMPONENT,
      type: 'input',
      stateNode: dom,
      return: compositeFiber,
    })

    index.indexFiber(hostFiber as unknown as Fiber)
    const path = [{ componentName: 'Input', key: null, index: 0 }]
    expect(index.getByPath(path)).toBe(dom)

    index.deindexFiber(hostFiber as unknown as Fiber)
    expect(index.getByPath(path)).toBeNull()
  })

  it('test 5: DOM 참조가 살아있는 동안 WeakRef.deref()는 성공한다', () => {
    const dom = makeDiv()
    document.body.appendChild(dom)

    const CardType = makeComponentType('Card')
    const compositeFiber = makeMockFiber({ tag: FUNCTION_COMPONENT, type: CardType })
    const hostFiber = makeMockFiber({
      tag: HOST_COMPONENT,
      type: 'div',
      stateNode: dom,
      return: compositeFiber,
    })

    index.indexFiber(hostFiber as unknown as Fiber)
    const path = [{ componentName: 'Card', key: null, index: 0 }]

    // DOM이 살아있는 동안 deref 성공
    const result = index.getByPath(path)
    expect(result).toBe(dom)
    expect(result).toBeInstanceOf(HTMLElement)

    document.body.removeChild(dom)
  })

  it('test 6: memo/forwardRef 래핑 시 getDisplayName이 inner 이름을 반환한다', () => {
    const dom = makeDiv()

    // React.memo(Button) → fiber.type = { displayName: 'Button', type: ButtonFn }
    // bippy getDisplayName mock: memoType.displayName = 'Button' 반환
    const memoType = { displayName: 'Button' }

    const memoFiber = makeMockFiber({ tag: MEMO_COMPONENT, type: memoType })
    const hostFiber = makeMockFiber({
      tag: HOST_COMPONENT,
      type: 'div',
      stateNode: dom,
      return: memoFiber,
    })

    index.indexFiber(hostFiber as unknown as Fiber)
    const path = [{ componentName: 'Button', key: null, index: 0 }]
    expect(index.getByPath(path)).toBe(dom)
  })
})

describe('getPathByDom (Phase 16 RECORD-01)', () => {
  let index: FiberIdentityIndex

  beforeEach(() => {
    index = new FiberIdentityIndex()
  })

  function makeIndexedFiber(dom: HTMLElement, componentName: string): void {
    const compType = makeComponentType(componentName)
    const compositeFiber = makeMockFiber({ tag: FUNCTION_COMPONENT, type: compType })
    const hostFiber = makeMockFiber({
      tag: HOST_COMPONENT,
      type: 'div',
      stateNode: dom,
      return: compositeFiber,
    })
    index.indexFiber(hostFiber as unknown as Fiber)
  }

  it('test A: indexFiber로 등록한 element를 getPathByDom에 전달하면 해당 FiberIdentityPath가 반환된다', () => {
    const dom = makeDiv()
    document.body.appendChild(dom)
    makeIndexedFiber(dom, 'LoginButton')

    const path = index.getPathByDom(dom)
    expect(path).not.toBeNull()
    expect(path).toEqual([{ componentName: 'LoginButton', key: null, index: 0 }])
    document.body.removeChild(dom)
  })

  it('test B: 등록되지 않은 element에 getPathByDom 호출 시 null 반환 (throw 금지)', () => {
    const dom = makeDiv()
    document.body.appendChild(dom)
    // indexFiber 없이 바로 getPathByDom 호출
    expect(() => {
      const result = index.getPathByDom(dom)
      expect(result).toBeNull()
    }).not.toThrow()
    document.body.removeChild(dom)
  })

  it('test C: indexFiber → deindexFiber 후 getPathByDom은 null 반환', () => {
    const dom = makeDiv()
    document.body.appendChild(dom)
    const compType = makeComponentType('FormInput')
    const compositeFiber = makeMockFiber({ tag: FUNCTION_COMPONENT, type: compType })
    const hostFiber = makeMockFiber({
      tag: HOST_COMPONENT,
      type: 'input',
      stateNode: dom,
      return: compositeFiber,
    })

    index.indexFiber(hostFiber as unknown as Fiber)
    expect(index.getPathByDom(dom)).not.toBeNull()

    index.deindexFiber(hostFiber as unknown as Fiber)
    expect(index.getPathByDom(dom)).toBeNull()
    document.body.removeChild(dom)
  })

  it('test D: 반환된 path가 내부 저장 path와 독립 (caller가 mutate해도 index 영향 없음)', () => {
    const dom = makeDiv()
    document.body.appendChild(dom)
    makeIndexedFiber(dom, 'Card')

    const path1 = index.getPathByDom(dom)
    expect(path1).not.toBeNull()

    // 반환된 path를 변형
    path1![0].componentName = 'MUTATED'

    // 다시 조회하면 원본 값이 유지되어야 함
    const path2 = index.getPathByDom(dom)
    expect(path2).not.toBeNull()
    expect(path2![0].componentName).toBe('Card')
    document.body.removeChild(dom)
  })

  it('test E: HTMLElement가 아닌 값 전달 시 null 반환 (방어적)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(index.getPathByDom('not-an-element' as any)).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(index.getPathByDom(null as any)).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(index.getPathByDom(undefined as any)).toBeNull()
  })

  it('test F (WR-06): indexFiber 등록 후 element를 DOM에서 remove 하면 getPathByDom 이 null 반환 (stale detach 방어)', () => {
    const dom = makeDiv()
    document.body.appendChild(dom)
    makeIndexedFiber(dom, 'StaleCard')

    // 등록 직후에는 path 반환
    expect(index.getPathByDom(dom)).not.toBeNull()

    // DOM 에서 떼어내면 isConnected === false → null 반환
    document.body.removeChild(dom)
    expect(dom.isConnected).toBe(false)
    expect(index.getPathByDom(dom)).toBeNull()
  })
})
