// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { isSensitive, SENSITIVE_WORD_BOUNDARY, SENSITIVE_NAME_ATTR, SENSITIVE_ARIA_LABELS_MULTILANG } from '../src/page-functions'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('isSensitive — OR-only contract', () => {
  it('returns true when manifest flag is true (overrides all)', () => {
    document.body.innerHTML = `<input type="text" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el, true)).toBe(true)
  })

  it('returns true when DOM has type=password (regardless of manifest)', () => {
    document.body.innerHTML = `<input type="password" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
    expect(isSensitive(el, undefined)).toBe(true)
  })

  it('returns false for plain input when manifest flag absent', () => {
    document.body.innerHTML = `<input type="text" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(false)
    expect(isSensitive(el, undefined)).toBe(false)
  })

  it('backward-compat: single-arg call still works', () => {
    document.body.innerHTML = `<input type="text" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(false)
  })

  it('detects autocomplete=current-password', () => {
    document.body.innerHTML = `<input type="text" autocomplete="current-password" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=new-password', () => {
    document.body.innerHTML = `<input type="text" autocomplete="new-password" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=one-time-code', () => {
    document.body.innerHTML = `<input type="text" autocomplete="one-time-code" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=cc-number', () => {
    document.body.innerHTML = `<input type="text" autocomplete="cc-number" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=cc-csc', () => {
    document.body.innerHTML = `<input type="text" autocomplete="cc-csc" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('detects autocomplete=cc-exp', () => {
    document.body.innerHTML = `<input type="text" autocomplete="cc-exp" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el)).toBe(true)
  })

  it('type-level: manifestFlag: false is not allowed', () => {
    const el = document.createElement('input')
    // @ts-expect-error manifestFlag must be `true | undefined`, not `false`
    void isSensitive(el, false)
    expect(true).toBe(true)
  })

  it('OR combination: non-password input + manifest true = true', () => {
    document.body.innerHTML = `<input type="text" />`
    const el = document.querySelector('input')!
    expect(isSensitive(el, true)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 14 — word-boundary regex
// ---------------------------------------------------------------------------

describe('Phase 14 — word-boundary regex', () => {
  it('placeholder="Password" → true (basic word boundary, case-insensitive)', () => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', 'Password')
    expect(isSensitive(el)).toBe(true)
  })

  it('placeholder="Enter your password" → true', () => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', 'Enter your password')
    expect(isSensitive(el)).toBe(true)
  })

  it('placeholder="passwordless login" → false (word boundary prevents false positive)', () => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', 'passwordless login')
    expect(isSensitive(el)).toBe(false)
  })

  it('placeholder="My favorite passwords123" → false (trailing digits, no boundary)', () => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', 'My favorite passwords123')
    expect(isSensitive(el)).toBe(false)
  })

  it('placeholder="Enter PIN" → true', () => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', 'Enter PIN')
    expect(isSensitive(el)).toBe(true)
  })

  it('placeholder="What is your SSN?" → true', () => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', 'What is your SSN?')
    expect(isSensitive(el)).toBe(true)
  })

  it('placeholder="CVV" → true', () => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', 'CVV')
    expect(isSensitive(el)).toBe(true)
  })

  it('placeholder="OTP code" → true', () => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', 'OTP code')
    expect(isSensitive(el)).toBe(true)
  })

  it('name="user_password" → true (underscore word boundary)', () => {
    const el = document.createElement('input')
    el.setAttribute('name', 'user_password')
    expect(isSensitive(el)).toBe(true)
  })

  it('name="user-pwd-field" → true (dash word boundary)', () => {
    const el = document.createElement('input')
    el.setAttribute('name', 'user-pwd-field')
    expect(isSensitive(el)).toBe(true)
  })

  it('id="my.password.input" → true (dot word boundary)', () => {
    const el = document.createElement('input')
    el.id = 'my.password.input'
    expect(isSensitive(el)).toBe(true)
  })

  it('name="crosswords" → false (SENSITIVE_NAME_ATTR 비매칭 — "pwd" 가 단어 내부 아님)', () => {
    const el = document.createElement('input')
    el.setAttribute('name', 'crosswords')
    expect(isSensitive(el)).toBe(false)
  })

  it('name="passwordless" → false (trailing chars, SENSITIVE_NAME_ATTR 비매칭)', () => {
    const el = document.createElement('input')
    el.setAttribute('name', 'passwordless')
    expect(isSensitive(el)).toBe(false)
  })

  it('aria-label="Credit card CVV" → true (aria-label word-boundary 체크)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', 'Credit card CVV')
    expect(isSensitive(el)).toBe(true)
  })

  it('SENSITIVE_WORD_BOUNDARY 상수가 export 됨', () => {
    expect(SENSITIVE_WORD_BOUNDARY).toBeInstanceOf(RegExp)
    expect(SENSITIVE_WORD_BOUNDARY.test('password')).toBe(true)
    expect(SENSITIVE_WORD_BOUNDARY.test('passwordless')).toBe(false)
  })

  it('SENSITIVE_NAME_ATTR 상수가 export 됨', () => {
    expect(SENSITIVE_NAME_ATTR).toBeInstanceOf(RegExp)
    expect(SENSITIVE_NAME_ATTR.test('user_password')).toBe(true)
    expect(SENSITIVE_NAME_ATTR.test('passwordless')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Phase 14 — multilingual ARIA label
// ---------------------------------------------------------------------------

describe('Phase 14 — multilingual ARIA label', () => {
  it('aria-label="비밀번호" → true (Korean)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', '비밀번호')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="비밀번호 입력" → true (Korean with space token)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', '비밀번호 입력')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="パスワード" → true (Japanese)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', 'パスワード')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="暗証番号" → true (Japanese — PIN number)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', '暗証番号')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="密码" → true (Chinese Simplified)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', '密码')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="密碼" → true (Chinese Traditional)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', '密碼')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="mot de passe" → true (French)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', 'mot de passe')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="Mot de Passe" → true (French, case-insensitive)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', 'Mot de Passe')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="passwort" → true (German)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', 'passwort')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="contraseña" → true (Spanish)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', 'contraseña')
    expect(isSensitive(el)).toBe(true)
  })

  it('aria-label="username" → false (non-sensitive label)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', 'username')
    expect(isSensitive(el)).toBe(false)
  })

  it('aria-label="   " → false (whitespace only)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', '   ')
    expect(isSensitive(el)).toBe(false)
  })

  it('aria-label="" → false (empty string)', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', '')
    expect(isSensitive(el)).toBe(false)
  })

  it('SENSITIVE_ARIA_LABELS_MULTILANG 상수가 export 됨', () => {
    expect(SENSITIVE_ARIA_LABELS_MULTILANG).toBeInstanceOf(Set)
    expect(SENSITIVE_ARIA_LABELS_MULTILANG.has('비밀번호')).toBe(true)
    expect(SENSITIVE_ARIA_LABELS_MULTILANG.has('パスワード')).toBe(true)
    expect(SENSITIVE_ARIA_LABELS_MULTILANG.has('密码')).toBe(true)
    expect(SENSITIVE_ARIA_LABELS_MULTILANG.has('mot de passe')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 14 — regression (기존 계약 유지)
// ---------------------------------------------------------------------------

describe('Phase 14 — regression (기존 계약 유지)', () => {
  it('manifestFlag true → true (확장 후에도 최우선 경로)', () => {
    const el = document.createElement('input')
    expect(isSensitive(el, true)).toBe(true)
  })

  it('input[type="password"] → true (2번째 경로 유지)', () => {
    const el = document.createElement('input')
    el.type = 'password'
    expect(isSensitive(el)).toBe(true)
  })

  it('input[autocomplete="cc-number"] → true (3번째 경로 유지)', () => {
    const el = document.createElement('input')
    el.setAttribute('autocomplete', 'cc-number')
    expect(isSensitive(el)).toBe(true)
  })

  it('type-level: isSensitive(el, false) 는 컴파일 에러 (유지)', () => {
    const el = document.createElement('input')
    // @ts-expect-error manifestFlag must be `true | undefined`, not `false`
    void isSensitive(el, false)
    expect(true).toBe(true)
  })
})
