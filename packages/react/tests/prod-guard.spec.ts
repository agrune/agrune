import { describe, it, expect, vi, afterEach } from 'vitest'
import { isProdEnabled } from '../src/guard/prod-guard.js'

describe('isProdEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('test 1: mode="dev"이면 항상 true (env/localStorage 무관)', () => {
    expect(isProdEnabled('dev')).toBe(true)
  })

  it('test 2: mode="prod", AGRUNE_PROD_ENABLED 미설정 → false', () => {
    // env 미설정 상태 (process.env.AGRUNE_PROD_ENABLED는 undefined)
    vi.stubEnv('AGRUNE_PROD_ENABLED', '')
    expect(isProdEnabled('prod')).toBe(false)
  })

  it('test 3: mode="prod", env="true", localStorage 미설정 → false', () => {
    vi.stubEnv('AGRUNE_PROD_ENABLED', 'true')
    // localStorage.getItem('agrune.prod.consent') → null
    expect(isProdEnabled('prod')).toBe(false)
  })

  it('test 4: mode="prod", env="true", localStorage="false" → false', () => {
    vi.stubEnv('AGRUNE_PROD_ENABLED', 'true')
    localStorage.setItem('agrune.prod.consent', 'false')
    expect(isProdEnabled('prod')).toBe(false)
  })

  it('test 5: mode="prod", env="true", localStorage="true" → true', () => {
    vi.stubEnv('AGRUNE_PROD_ENABLED', 'true')
    localStorage.setItem('agrune.prod.consent', 'true')
    expect(isProdEnabled('prod')).toBe(true)
  })

  it('test 6: mode="prod", env="true", localStorage.getItem throws → false', () => {
    vi.stubEnv('AGRUNE_PROD_ENABLED', 'true')
    // localStorage.getItem이 throw하도록 강제
    const originalGetItem = localStorage.getItem.bind(localStorage)
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('localStorage is not accessible')
      },
      configurable: true,
    })
    expect(isProdEnabled('prod')).toBe(false)
    // 복원
    Object.defineProperty(window, 'localStorage', {
      get() {
        return { getItem: originalGetItem, setItem: () => {}, clear: () => {}, removeItem: () => {} }
      },
      configurable: true,
    })
  })
})
