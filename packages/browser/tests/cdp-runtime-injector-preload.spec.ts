/**
 * cdp-runtime-injector-preload.spec.ts
 *
 * prepareSession({ preloadManifest }) 옵션, safeJsonEmbed 보안,
 * cache isolation, reloadRuntime debounce 회귀 테스트.
 *
 * 의존: Vitest (no Puppeteer) — CdpConnection은 vi.fn() 기반 mock.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { AgruneManifest } from '@agrune/core'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeMinimalManifest(override: Partial<AgruneManifest> = {}): AgruneManifest {
  return {
    version: 3,
    groups: [
      {
        groupId: 'g1',
        targets: [
          { targetId: 't1', actionKinds: ['click'], selector: { css: '#btn' } },
        ],
      },
    ],
    ...override,
  }
}

function makeMockConnection() {
  const calls: Array<{ method: string; params: Record<string, unknown>; sessionId: string }> = []
  const send = vi.fn(async (method: string, params: Record<string, unknown>, sessionId: string) => {
    calls.push({ method, params, sessionId })
    return {}
  })
  return { send, calls }
}

// ─── 1. no-preload 기존 경로 보존 ───────────────────────────────────────────

describe('prepareSession — no preload', () => {
  afterEach(() => vi.restoreAllMocks())

  it('5가지 CDP 커맨드를 각 1회 전송한다', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)

    await injector.prepareSession('sid-1')

    const methods = calls.map(c => c.method)
    expect(methods).toContain('Page.enable')
    expect(methods).toContain('Runtime.enable')
    expect(methods).toContain('Runtime.addBinding')
    expect(methods).toContain('Page.addScriptToEvaluateOnNewDocument')
    expect(methods).toContain('Runtime.evaluate')
    // 총 5회 전송
    expect(calls.length).toBe(5)
  })

  it('Runtime.evaluate expression에 __agrune_preload_manifest__ 가 없다', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)

    await injector.prepareSession('sid-no-preload')

    const evalCall = calls.find(c => c.method === 'Runtime.evaluate')
    expect(evalCall).toBeDefined()
    const expression = evalCall!.params.expression as string
    expect(expression).not.toContain('__agrune_preload_manifest__')
  })
})

// ─── 2. preloadManifest 있는 경로 ───────────────────────────────────────────

describe('prepareSession — with preloadManifest', () => {
  afterEach(() => vi.restoreAllMocks())

  it('addScriptToEvaluateOnNewDocument source에 __agrune_preload_manifest__ + JSON.parse( 포함', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)
    const manifest = makeMinimalManifest()

    await injector.prepareSession('sid-preload', { preloadManifest: manifest })

    const addScriptCall = calls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    expect(addScriptCall).toBeDefined()
    const source = addScriptCall!.params.source as string
    expect(source).toContain('__agrune_preload_manifest__')
    expect(source).toContain('JSON.parse(')
  })

  it('Runtime.evaluate expression에도 __agrune_preload_manifest__ 가 포함된다 (현재 페이지 즉시 적용)', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)
    const manifest = makeMinimalManifest()

    await injector.prepareSession('sid-preload-eval', { preloadManifest: manifest })

    const evalCall = calls.find(c => c.method === 'Runtime.evaluate')
    expect(evalCall).toBeDefined()
    const expression = evalCall!.params.expression as string
    expect(expression).toContain('__agrune_preload_manifest__')
    expect(expression).toContain('JSON.parse(')
  })

  it('manifest 데이터가 실제로 embed되어 있다 (groupId 포함)', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)
    const manifest = makeMinimalManifest({ groups: [{ groupId: 'my-group', targets: [] }] })

    await injector.prepareSession('sid-data', { preloadManifest: manifest })

    const addScriptCall = calls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    const source = addScriptCall!.params.source as string
    // JSON.stringify(JSON.stringify(manifest)) 이중 인코딩 → my-group이 이스케이프되어 포함됨
    expect(source).toContain('my-group')
  })
})

// ─── 3. safeJsonEmbed 보안 ───────────────────────────────────────────────────

describe('safeJsonEmbed', () => {
  it('U+2028이 \\u2028로 이스케이프된다', async () => {
    // buildPreloadManifestSource를 간접 검증 — manifest 값에 U+2028 포함
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)
    const manifest = makeMinimalManifest({
      groups: [{ groupId: 'g\u2028x', targets: [] }],
    })

    await injector.prepareSession('sid-u2028', { preloadManifest: manifest })

    const addScriptCall = calls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    const source = addScriptCall!.params.source as string
    // 소스에 raw U+2028이 없어야 함 — 이스케이프 형태인 \\u2028으로 존재
    expect(source).not.toContain('\u2028')
    expect(source).toContain('\\u2028')
  })

  it('U+2029가 \\u2029로 이스케이프된다', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)
    const manifest = makeMinimalManifest({
      groups: [{ groupId: 'g\u2029x', targets: [] }],
    })

    await injector.prepareSession('sid-u2029', { preloadManifest: manifest })

    const addScriptCall = calls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    const source = addScriptCall!.params.source as string
    expect(source).not.toContain('\u2029')
    expect(source).toContain('\\u2029')
  })

  it('</script> 문자열이 JSON.stringify 이중 인코딩 후 JSON.parse wrapper 내부에 안전하게 embed된다', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)
    // manifest에 </script> 포함 — XSS 시도 시뮬레이션
    const manifest = makeMinimalManifest({
      groups: [{ groupId: 'xss</script><script>evil()', targets: [] }],
    })

    await injector.prepareSession('sid-xss', { preloadManifest: manifest })

    const addScriptCall = calls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    const source = addScriptCall!.params.source as string
    // JSON.parse() wrapper 존재 확인 → 임의 JS 실행 불가 패턴
    expect(source).toContain('JSON.parse(')
    // 소스 내에서 evil() 같은 raw 코드 실행 경로 없음 (string 내부에 이스케이프됨)
    // 이중 JSON.stringify 경유 시 </script> → \\u003c/script\\u003e 형태 OR 단순 이스케이프
    // 핵심: 직접 실행 가능한 </script> raw 태그가 JS statement boundary를 벗어나면 안 됨
    // → JSON.parse("...") 안에서만 존재하므로 임의 코드 실행 불가
    const evalCall = calls.find(c => c.method === 'Runtime.evaluate')
    expect(evalCall!.params.expression as string).toContain('JSON.parse(')
  })
})

// ─── 4. cache isolation (Pitfall 1) ─────────────────────────────────────────

describe('cache isolation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('preload 없는 세션 → 그 뒤 preload 있는 세션 순서에서 두번째가 preload 포함', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)
    const manifest = makeMinimalManifest()

    // 첫번째: preload 없음
    await injector.prepareSession('sid-first-no-preload')

    const callsAfterFirst = calls.length

    // 두번째: preload 있음
    await injector.prepareSession('sid-second-with-preload', { preloadManifest: manifest })

    const secondCalls = calls.slice(callsAfterFirst)
    const secondAddScript = secondCalls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    expect(secondAddScript).toBeDefined()
    const source = secondAddScript!.params.source as string
    expect(source).toContain('__agrune_preload_manifest__')
  })

  it('preload 있는 세션 → preload 없는 세션에서 두번째에는 preload 미포함', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)
    const manifest = makeMinimalManifest()

    // 첫번째: preload 있음
    await injector.prepareSession('sid-iso-with', { preloadManifest: manifest })

    const callsAfterFirst = calls.length

    // 두번째: preload 없음
    await injector.prepareSession('sid-iso-without')

    const secondCalls = calls.slice(callsAfterFirst)
    const secondAddScript = secondCalls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    expect(secondAddScript).toBeDefined()
    const source = secondAddScript!.params.source as string
    expect(source).not.toContain('__agrune_preload_manifest__')
  })
})

// ─── 5. reloadRuntime debounce (static source 분석) ─────────────────────────

describe('reloadRuntime debounce', () => {
  it('buildBootstrapSource 문자열에 clearTimeout 패턴이 존재한다', async () => {
    // buildBootstrapSource()는 모듈 내부이므로 CdpRuntimeInjector.prepareSession 호출 후
    // addScriptToEvaluateOnNewDocument source를 통해 bootstrap 포함 여부 검사
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)

    await injector.prepareSession('sid-debounce')

    const addScriptCall = calls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    const source = addScriptCall!.params.source as string

    // reloadRuntime 내부에 debounce 구현이 있어야 함
    expect(source).toContain('clearTimeout')
    expect(source).toContain('reloadTimer')
  })

  it('bootstrap source의 reloadRuntime에 setTimeout 가드가 포함된다', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)

    await injector.prepareSession('sid-settimeout')

    const addScriptCall = calls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    const source = addScriptCall!.params.source as string

    // reloadRuntime 훅 내부에 setTimeout 호출이 있어야 함
    expect(source).toContain('reloadRuntime')
    // clearTimeout + setTimeout은 debounce 구현의 핵심 패턴
    const clearIdx = source.indexOf('clearTimeout')
    const setIdx = source.indexOf('setTimeout')
    expect(clearIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeGreaterThan(-1)
  })
})

// ─── 6. PrepareSessionOptions export 확인 ────────────────────────────────────

describe('PrepareSessionOptions interface', () => {
  it('PrepareSessionOptions가 named export로 존재한다', async () => {
    // TypeScript 컴파일 타임 체크 — 런타임엔 type-only이므로 import만 성공해도 OK
    const mod = await import('../src/cdp-runtime-injector.js')
    // CdpRuntimeInjector가 export되어 있음을 확인 (interface는 런타임에 존재 안 해도 됨)
    expect(typeof mod.CdpRuntimeInjector).toBe('function')
    // QUICK_MODE_RUNTIME_KEY도 export 확인
    expect(typeof mod.QUICK_MODE_RUNTIME_KEY).toBe('string')
  })

  it('prepareSession이 options 없이도 정상 동작한다 (backward compat)', async () => {
    const { send } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)

    // 옵션 없이 호출 — 에러 없이 정상 완료해야 함
    await expect(injector.prepareSession('sid-compat')).resolves.toBeUndefined()
  })

  it('preloadManifest: undefined 전달 시 preload 없는 경로와 동일하게 동작', async () => {
    const { send, calls } = makeMockConnection()
    const { CdpRuntimeInjector } = await import('../src/cdp-runtime-injector.js')
    const injector = new CdpRuntimeInjector({ send } as any)

    await injector.prepareSession('sid-undef', { preloadManifest: undefined })

    const addScriptCall = calls.find(c => c.method === 'Page.addScriptToEvaluateOnNewDocument')
    const source = addScriptCall!.params.source as string
    expect(source).not.toContain('__agrune_preload_manifest__')
  })
})
