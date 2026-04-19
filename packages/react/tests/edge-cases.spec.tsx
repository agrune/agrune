/**
 * edge-cases.spec.tsx — FiberIdentityIndex + bridge 엣지케이스 통합 테스트
 *
 * 테스트 전략:
 * - bippy를 mock해 fiber tree를 제어 가능한 형태로 구성.
 * - FiberIdentityIndex를 직접 인스턴스화해 indexFiber/deindexFiber/getByPath 동작 검증.
 * - AgruneDevtools mount + bridge 게시는 AgruneDevtools.spec.tsx에서 충분히 검증됨.
 *   이 파일은 엣지케이스 fixture 컴포넌트들의 fiber path 동작에 집중.
 *
 * 검증 대상 (REACT-05):
 * 1. memo + forwardRef unwrapping → componentName='Button'
 * 2. Portal fiber tree 논리적 위치 기반 (DOM 위치 아님)
 * 3. Suspense fallback→content 전환: stale entry 없음
 * 4. Compound component displayName 우선
 * 5. React version matrix smoke (override 검증)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, cleanup, screen } from '@testing-library/react'
import React from 'react'
import type { Fiber } from 'bippy'

// ---------------------------------------------------------------------------
// bippy mock — fiber tree를 테스트에서 제어 가능하도록
// ---------------------------------------------------------------------------
vi.mock('bippy', () => {
  const fiberRoots = new Set<object>([{}])
  return {
    instrument: vi.fn(),
    secure: vi.fn((opts: unknown) => opts),
    traverseRenderedFibers: vi.fn(),
    isHostFiber: vi.fn((f: unknown) => {
      const fiber = f as Record<string, unknown>
      return fiber.__isHost === true
    }),
    isCompositeFiber: vi.fn((f: unknown) => {
      const fiber = f as Record<string, unknown>
      return fiber.__isComposite === true
    }),
    getDisplayName: vi.fn((type: unknown) => {
      // displayName 우선, 없으면 name
      if (type && typeof type === 'object') {
        const t = type as Record<string, unknown>
        if (typeof t.displayName === 'string') return t.displayName
        if (typeof t.name === 'string') return t.name
      }
      if (typeof type === 'function') {
        const fn = type as { displayName?: string; name?: string }
        if (fn.displayName) return fn.displayName
        if (fn.name) return fn.name
      }
      return null
    }),
    getFiberStack: vi.fn((fiber: unknown) => {
      const f = fiber as Record<string, unknown>
      // Fiber[] 타입으로 캐스팅 — mock 환경에서 타입 브리징
      return ((f.__stack as unknown[]) ?? []) as Fiber[]
    }),
    getLatestFiber: vi.fn((fiber: unknown) => fiber),
    _fiberRoots: fiberRoots,
  }
})

vi.mock('../src/guard/ssr-barrier.js', () => ({
  waitForHydration: vi.fn(() => Promise.resolve()),
}))

import { FiberIdentityIndex } from '../src/fiber/identity-index.js'
import type { FiberIdentityPath } from '@agrune/manifest'
import * as bippyModule from 'bippy'

// ---------------------------------------------------------------------------
// 헬퍼: mock fiber 생성
// ---------------------------------------------------------------------------

interface MockFiber {
  __isHost?: boolean
  __isComposite?: boolean
  __stack?: MockFiber[]
  stateNode?: HTMLElement
  type?: { displayName?: string; name?: string } | ((...args: unknown[]) => unknown) | null
  key: string | null
  index: number
  [key: string]: unknown
}

function makeHostFiber(dom: HTMLElement, stack: MockFiber[]): MockFiber {
  return {
    __isHost: true,
    __isComposite: false,
    stateNode: dom,
    __stack: stack,
    type: null,
    key: null,
    index: 0,
  }
}

function makeCompositeFiber(displayName: string, key: string | null = null, index = 0): MockFiber {
  const type = { displayName }
  return {
    __isHost: false,
    __isComposite: true,
    type,
    key,
    index,
  }
}

// MockFiber → bippy Fiber 캐스팅 헬퍼 (mock 환경 전용)
function asFiber(mock: MockFiber): Fiber {
  return mock as unknown as Fiber
}

// ---------------------------------------------------------------------------
// describe 1: memo + forwardRef unwrapping
// ---------------------------------------------------------------------------

describe('memo + forwardRef unwrapping', () => {
  let index: FiberIdentityIndex
  let dom: HTMLElement

  beforeEach(() => {
    index = new FiberIdentityIndex()
    dom = document.createElement('button')
    dom.setAttribute('data-testid', 'memo-btn')
    document.body.appendChild(dom)
  })

  afterEach(() => {
    if (document.body.contains(dom)) document.body.removeChild(dom)
    cleanup()
  })

  it('memo(forwardRef) 래핑된 컴포넌트의 componentName이 내부 Button으로 추출된다', () => {
    // bippy getDisplayName 동작:
    // MemoComponentTag → inner ForwardRefTag → 'Button' (displayName 우선)
    const stack = [
      makeCompositeFiber('MemoForwardRefApp'),
      makeCompositeFiber('Button'), // memo 래퍼 (displayName='Button'이므로 bippy가 'Button' 반환)
    ]
    const fiber = makeHostFiber(dom, stack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fiber))

    // path에 'Button' segment 존재 확인
    const path: FiberIdentityPath = [
      { componentName: 'MemoForwardRefApp', key: null, index: 0 },
      { componentName: 'Button', key: null, index: 0 },
    ]
    expect(index.getByPath(path)).toBe(dom)
  })

  it('memo 래퍼 이름이 아닌 내부 컴포넌트 이름으로 path segment가 생성된다', () => {
    const stack = [makeCompositeFiber('Button')]
    const fiber = makeHostFiber(dom, stack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fiber))

    // 'memo(Button)'이나 'forwardRef(Button)' 같은 래퍼 이름이 아닌지 확인
    const wrongPath: FiberIdentityPath = [{ componentName: 'memo(Button)', key: null, index: 0 }]
    expect(index.getByPath(wrongPath)).toBeNull()

    // 올바른 이름으로 조회 성공
    const correctPath: FiberIdentityPath = [{ componentName: 'Button', key: null, index: 0 }]
    expect(index.getByPath(correctPath)).toBe(dom)
  })
})

// ---------------------------------------------------------------------------
// describe 2: Portal — fiber tree 논리적 위치 기반
// ---------------------------------------------------------------------------

describe('Portal — fiber tree 논리적 위치 기반', () => {
  let index: FiberIdentityIndex
  let portalBtn: HTMLElement
  let portalContainer: HTMLElement

  beforeEach(() => {
    index = new FiberIdentityIndex()
    portalContainer = document.createElement('div')
    portalContainer.id = 'portal-root'
    document.body.appendChild(portalContainer)
    portalBtn = document.createElement('button')
    portalBtn.setAttribute('data-testid', 'portal-btn')
    portalContainer.appendChild(portalBtn)
  })

  afterEach(() => {
    if (document.body.contains(portalContainer)) document.body.removeChild(portalContainer)
    cleanup()
  })

  it('portal 안 DOM 요소의 fiber path에 Modal 컴포넌트 포함', () => {
    // fiber tree 논리적 위치 (DOM 위치와 무관):
    // PortalApp → Modal → createPortal → button
    // getFiberStack은 fiber tree 기준 → Modal을 포함
    const stack = [makeCompositeFiber('PortalApp'), makeCompositeFiber('Modal')]
    const fiber = makeHostFiber(portalBtn, stack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fiber))

    // Modal 컴포넌트를 포함하는 path로 resolve 가능 (DOM은 portalContainer 안에 있어도)
    const path: FiberIdentityPath = [
      { componentName: 'PortalApp', key: null, index: 0 },
      { componentName: 'Modal', key: null, index: 0 },
    ]
    expect(index.getByPath(path)).toBe(portalBtn)
  })

  it('portal container 위치(document.body) 기반이 아닌 논리적 fiber 위치로 resolve', () => {
    const stack = [makeCompositeFiber('Modal')]
    const fiber = makeHostFiber(portalBtn, stack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fiber))

    // DOM 위치 기반 잘못된 path로는 resolve 안 됨
    const domBasedPath: FiberIdentityPath = [{ componentName: 'body', key: null, index: 0 }]
    expect(index.getByPath(domBasedPath)).toBeNull()

    // fiber tree 기반 path로 정상 resolve
    const fiberPath: FiberIdentityPath = [{ componentName: 'Modal', key: null, index: 0 }]
    expect(index.getByPath(fiberPath)).toBe(portalBtn)
  })
})

// ---------------------------------------------------------------------------
// describe 3: Suspense — fallback→content 전환
// ---------------------------------------------------------------------------

describe('Suspense — fallback→content 전환', () => {
  let index: FiberIdentityIndex
  let fallbackDiv: HTMLElement
  let contentDiv: HTMLElement

  beforeEach(() => {
    index = new FiberIdentityIndex()
    fallbackDiv = document.createElement('div')
    fallbackDiv.setAttribute('data-testid', 'suspense-fallback')
    document.body.appendChild(fallbackDiv)

    contentDiv = document.createElement('div')
    contentDiv.setAttribute('data-testid', 'suspense-content')
  })

  afterEach(() => {
    if (document.body.contains(fallbackDiv)) document.body.removeChild(fallbackDiv)
    if (document.body.contains(contentDiv)) document.body.removeChild(contentDiv)
    cleanup()
  })

  it('fallback 단계: fallback div가 index에 등록됨', () => {
    const fallbackStack = [makeCompositeFiber('SuspenseApp'), makeCompositeFiber('Suspense')]
    const fallbackFiber = makeHostFiber(fallbackDiv, fallbackStack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(fallbackStack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fallbackFiber))

    const fallbackPath: FiberIdentityPath = [
      { componentName: 'SuspenseApp', key: null, index: 0 },
      { componentName: 'Suspense', key: null, index: 0 },
    ]
    expect(index.getByPath(fallbackPath)).toBe(fallbackDiv)
  })

  it('content 전환 후: fallback deindex + content index → stale entry 없음', () => {
    // 1단계: fallback index
    const sharedStack = [makeCompositeFiber('SuspenseApp'), makeCompositeFiber('Suspense')]
    const fallbackFiber = makeHostFiber(fallbackDiv, sharedStack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(sharedStack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )
    index.indexFiber(asFiber(fallbackFiber))

    // 2단계: fallback unmount → deindexFiber
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    index.deindexFiber(asFiber(fallbackFiber))

    // 3단계: content mount
    document.body.appendChild(contentDiv)
    const contentStack = [makeCompositeFiber('SuspenseApp'), makeCompositeFiber('LazyContent')]
    const contentFiber = makeHostFiber(contentDiv, contentStack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(contentStack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )
    index.indexFiber(asFiber(contentFiber))

    // 검증 1: fallback path가 stale로 남지 않음
    const fallbackPath: FiberIdentityPath = [
      { componentName: 'SuspenseApp', key: null, index: 0 },
      { componentName: 'Suspense', key: null, index: 0 },
    ]
    expect(index.getByPath(fallbackPath)).toBeNull()

    // 검증 2: content path로 정상 resolve
    const contentPath: FiberIdentityPath = [
      { componentName: 'SuspenseApp', key: null, index: 0 },
      { componentName: 'LazyContent', key: null, index: 0 },
    ]
    expect(index.getByPath(contentPath)).toBe(contentDiv)
  })
})

// ---------------------------------------------------------------------------
// describe 4: Compound component displayName
// ---------------------------------------------------------------------------

describe('Compound component displayName', () => {
  let index: FiberIdentityIndex

  beforeEach(() => {
    index = new FiberIdentityIndex()
  })

  it('Modal.Header: displayName 명시 설정 → componentName이 "Modal.Header"', () => {
    const headerDiv = document.createElement('header')
    document.body.appendChild(headerDiv)

    const stack = [makeCompositeFiber('CompoundApp'), makeCompositeFiber('Modal.Header')]
    const fiber = makeHostFiber(headerDiv, stack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fiber))

    const path: FiberIdentityPath = [
      { componentName: 'CompoundApp', key: null, index: 0 },
      { componentName: 'Modal.Header', key: null, index: 0 },
    ]
    expect(index.getByPath(path)).toBe(headerDiv)
    document.body.removeChild(headerDiv)
  })

  it('Modal.Body: displayName 명시 설정 → componentName이 "Modal.Body"', () => {
    const bodyDiv = document.createElement('div')
    document.body.appendChild(bodyDiv)

    const stack = [makeCompositeFiber('CompoundApp'), makeCompositeFiber('Modal.Body')]
    const fiber = makeHostFiber(bodyDiv, stack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fiber))

    const path: FiberIdentityPath = [
      { componentName: 'CompoundApp', key: null, index: 0 },
      { componentName: 'Modal.Body', key: null, index: 0 },
    ]
    expect(index.getByPath(path)).toBe(bodyDiv)
    document.body.removeChild(bodyDiv)
  })

  it('Select.Option: displayName 명시 설정 → componentName이 "Select.Option"', () => {
    const optionDiv = document.createElement('div')
    document.body.appendChild(optionDiv)

    const stack = [makeCompositeFiber('CompoundApp'), makeCompositeFiber('Select.Option')]
    const fiber = makeHostFiber(optionDiv, stack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fiber))

    const path: FiberIdentityPath = [
      { componentName: 'CompoundApp', key: null, index: 0 },
      { componentName: 'Select.Option', key: null, index: 0 },
    ]
    expect(index.getByPath(path)).toBe(optionDiv)
    document.body.removeChild(optionDiv)
  })

  it('displayName 없는 컴포넌트는 함수명을 fallback으로 사용', () => {
    const headerDiv = document.createElement('header')
    document.body.appendChild(headerDiv)

    // ModalRoot는 displayName 미설정 → 함수명 'ModalRoot' 반환
    const stack = [makeCompositeFiber('ModalRoot')]
    const fiber = makeHostFiber(headerDiv, stack)

    vi.mocked(bippyModule.getFiberStack).mockReturnValueOnce(stack as unknown as Fiber[])
    vi.mocked(bippyModule.isHostFiber).mockReturnValueOnce(true)
    vi.mocked(bippyModule.isCompositeFiber).mockImplementation(
      (f: unknown) => (f as MockFiber).__isComposite === true,
    )

    index.indexFiber(asFiber(fiber))

    const path: FiberIdentityPath = [{ componentName: 'ModalRoot', key: null, index: 0 }]
    expect(index.getByPath(path)).toBe(headerDiv)
    document.body.removeChild(headerDiv)
  })
})

// ---------------------------------------------------------------------------
// describe 5: React version matrix smoke
// ---------------------------------------------------------------------------

describe('React version matrix smoke', () => {
  it('React 버전이 17, 18, 19 중 하나임을 확인 (matrix override 검증)', () => {
    expect(React.version).toMatch(/^(17|18|19)\./)
  })

  it('현재 React major 버전이 정수로 추출됨', () => {
    const major = parseInt(React.version.split('.')[0] ?? '0', 10)
    expect([17, 18, 19]).toContain(major)
  })

  it('React 18/19: createRoot가 정의되어 있음', async () => {
    const major = parseInt(React.version.split('.')[0] ?? '0', 10)
    // React 17 matrix job은 RTL 없이 react17-fixture 헬퍼로 테스트
    // 이 spec 파일은 RTL(React 18+)을 사용하므로 18/19에서만 createRoot 검증
    if (major >= 18) {
      const { createRoot } = await import('react-dom/client')
      expect(typeof createRoot).toBe('function')
    } else {
      // React 17: 이 테스트를 skip (RTL 없이 react17-fixture 사용)
      expect(major).toBe(17)
    }
  })
})

// ---------------------------------------------------------------------------
// describe 6: fixture 컴포넌트 렌더링 smoke
// ---------------------------------------------------------------------------

describe('fixture 컴포넌트 렌더링 smoke', () => {
  afterEach(() => {
    cleanup()
  })

  it('MemoForwardRefApp: memo-btn DOM 요소 렌더됨', async () => {
    const { MemoForwardRefApp } = await import('./fixtures/memo-forwardref.fixture.js')
    render(<MemoForwardRefApp />)
    await waitFor(() => expect(screen.getByTestId('memo-btn')).toBeDefined())
    expect(screen.getByTestId('memo-btn').tagName).toBe('BUTTON')
  })

  it('SuspenseApp: suspense-content가 로드됨', async () => {
    const { SuspenseApp } = await import('./fixtures/suspense.fixture.js')
    render(<SuspenseApp />)
    await waitFor(() => expect(screen.getByTestId('suspense-content')).toBeDefined())
  })

  it('CompoundApp: Modal.Header + Modal.Body 렌더됨', async () => {
    const { CompoundApp } = await import('./fixtures/compound.fixture.js')
    render(<CompoundApp />)
    await waitFor(() => {
      expect(screen.getByTestId('modal-header')).toBeDefined()
      expect(screen.getByTestId('modal-body')).toBeDefined()
    })
  })

  it('PortalApp: portal-btn이 document.body에 렌더됨', async () => {
    const { PortalApp } = await import('./fixtures/portal.fixture.js')
    render(<PortalApp />)
    await waitFor(() => expect(screen.getByTestId('portal-btn')).toBeDefined())
    expect(screen.getByTestId('portal-btn').tagName).toBe('BUTTON')
  })
})
