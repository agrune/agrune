import type { FormFixture } from './types.js'

/**
 * Signup / registration corpus — 27 fixtures.
 *
 * Coverage:
 *   - Password + confirm password (autocomplete=new-password, name=password_confirm)
 *   - PIN / passcode
 *   - Standard non-sensitive signup fields (username, email, display_name)
 *   - Multi-element fixtures (whole form) to stress selector enumeration
 */
export const signupFixtures: FormFixture[] = [
  // ── Password + confirm ────────────────────────────────────────────────
  {
    id: 'signup-pw-01',
    html: `<form>
      <input id="pw" type="password" autocomplete="new-password" />
      <input id="pw2" type="password" name="password_confirm" autocomplete="new-password" />
    </form>`,
    elements: ['#pw', '#pw2'],
    expected: [true, true],
    lang: 'en',
    category: 'signup',
    notes: 'Multi-element fixture — both sensitive',
  },
  {
    id: 'signup-pw-02',
    html: `<form><input id="pw2" aria-label="Confirm password" /></form>`,
    elements: ['#pw2'],
    expected: [true],
    lang: 'en',
    category: 'signup',
    notes: 'aria-label 8c — English word boundary',
  },
  {
    id: 'signup-pw-03',
    html: `<form><input id="pw2" aria-label="비밀번호 확인" /></form>`,
    elements: ['#pw2'],
    expected: [true],
    lang: 'ko',
    category: 'signup',
    notes: 'CJK token split — "비밀번호" token matches set',
  },
  {
    id: 'signup-pw-04',
    html: `<form><input id="pw2" name="password_confirm" /></form>`,
    elements: ['#pw2'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-pw-05',
    html: `<form><input id="pw2" name="confirm_password" /></form>`,
    elements: ['#pw2'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-pw-06',
    html: `<form><input id="pw2" name="retype_password" /></form>`,
    elements: ['#pw2'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-pw-07',
    html: `<form><input id="pw2" autocomplete="new-password" /></form>`,
    elements: ['#pw2'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },

  // ── Passcode / PIN ────────────────────────────────────────────────────
  {
    id: 'signup-pin-01',
    html: `<form><input id="pc" name="passcode" /></form>`,
    elements: ['#pc'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-pin-02',
    html: `<form><input id="pc" placeholder="Passcode" /></form>`,
    elements: ['#pc'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-pin-03',
    html: `<form><input id="pin" name="pin" /></form>`,
    elements: ['#pin'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-pin-04',
    html: `<form><input id="pin" aria-label="PIN" /></form>`,
    elements: ['#pin'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-pin-05',
    html: `<form><input id="pin" aria-label="핀번호" /></form>`,
    elements: ['#pin'],
    expected: [true],
    lang: 'ko',
    category: 'signup',
    notes: '핀번호 in SENSITIVE_ARIA_LABELS_MULTILANG set',
  },
  {
    id: 'signup-pin-06',
    html: `<form><input id="pin" aria-label="4-digit PIN" /></form>`,
    elements: ['#pin'],
    expected: [true],
    lang: 'en',
    category: 'signup',
  },

  // ── Standard non-sensitive signup ─────────────────────────────────────
  {
    id: 'signup-neg-01',
    html: `<form><input id="username" name="username" /></form>`,
    elements: ['#username'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-neg-02',
    html: `<form><input id="email" type="email" name="email" /></form>`,
    elements: ['#email'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-neg-03',
    html: `<form><input id="dn" name="display_name" /></form>`,
    elements: ['#dn'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-neg-04',
    html: `<form><input id="fn" name="first_name" /></form>`,
    elements: ['#fn'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-neg-05',
    html: `<form><input id="ln" name="last_name" /></form>`,
    elements: ['#ln'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-neg-06',
    html: `<form><input id="tos" type="checkbox" name="accept_terms" /></form>`,
    elements: ['#tos'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-neg-07',
    html: `<form><input id="ref" name="referral_code" /></form>`,
    elements: ['#ref'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-neg-08',
    html: `<form><input id="bday" type="date" name="birthdate" /></form>`,
    elements: ['#bday'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },
  {
    id: 'signup-neg-09',
    html: `<form><input id="phone" type="tel" name="mobile" /></form>`,
    elements: ['#phone'],
    expected: [false],
    lang: 'en',
    category: 'signup',
  },

  // ── Multi-element whole-form fixtures ─────────────────────────────────
  {
    id: 'signup-form-01',
    html: `<form>
      <input id="email" type="email" name="email" />
      <input id="pw" type="password" name="password" />
      <input id="pw2" type="password" name="password_confirm" />
      <input id="tos" type="checkbox" name="accept_terms" />
    </form>`,
    elements: ['#email', '#pw', '#pw2', '#tos'],
    expected: [false, true, true, false],
    lang: 'en',
    category: 'signup',
    notes: 'Whole signup form — mixed sensitive/non-sensitive',
  },
  {
    id: 'signup-form-02-ko',
    html: `<form>
      <input id="email" type="email" name="email" />
      <input id="pw" aria-label="비밀번호" />
      <input id="pw2" aria-label="비밀번호 확인" />
    </form>`,
    elements: ['#email', '#pw', '#pw2'],
    expected: [false, true, true],
    lang: 'ko',
    category: 'signup',
  },

  // ── Japanese signup ──────────────────────────────────────────────────
  {
    id: 'signup-ja-01',
    html: `<form><input id="pw" aria-label="パスワード" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ja',
    category: 'signup',
  },
  {
    id: 'signup-ja-02',
    html: `<form><input id="pw2" aria-label="パスワードの確認" /></form>`,
    elements: ['#pw2'],
    expected: [false],
    lang: 'ja',
    category: 'signup',
    notes:
      'Concatenated (no space) Japanese phrase — set exact/token match both fail. Known gap: CJK heuristic is exact/token only, not substring. v0.6+ may add substring mode behind a flag.',
  },
]
