import type { FormFixture } from './types.js'

/**
 * Login form corpus — 32 fixtures.
 *
 * Coverage goals:
 *   - Korean aria-label / placeholder (ko)
 *   - English standard (type=password, autocomplete=current-password, name=password)
 *   - English non-standard name patterns (j_password, pword, pass, secret, pin) — Pitfall 7
 *   - Japanese aria-label (パスワード, 暗証番号)
 *   - Negative regressions (passwordless_login_email, crosswords, passwordless)
 *
 * `expected` reflects actual `isSensitive()` behaviour in Phase 14-01
 * `dom-utils.ts` — not wishful thinking. See `SENSITIVE_ARIA_LABELS_MULTILANG`
 * set and `SENSITIVE_NAME_ATTR` / `SENSITIVE_WORD_BOUNDARY` regex.
 */
export const loginFixtures: FormFixture[] = [
  // ── Korean (ko) — aria-label exact match ──────────────────────────────
  {
    id: 'login-ko-01',
    html: `<form><input id="pw" aria-label="비밀번호" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ko',
    category: 'login',
  },
  {
    id: 'login-ko-02',
    html: `<form><input id="pw" aria-label="패스워드" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ko',
    category: 'login',
  },
  {
    id: 'login-ko-03',
    html: `<form><input id="pw" aria-label="비밀번호 입력" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ko',
    category: 'login',
    notes: 'CJK 공백 토큰 — SENSITIVE_ARIA_LABELS_MULTILANG 토큰 스플릿 경로',
  },
  {
    id: 'login-ko-04',
    html: `<form><input id="pw" placeholder="비밀번호" /></form>`,
    elements: ['#pw'],
    expected: [false],
    lang: 'ko',
    category: 'login',
    notes:
      'Pitfall: placeholder 는 SENSITIVE_WORD_BOUNDARY(영어 단어) 만 평가. 한글 placeholder 는 heuristic 에서 감지 안 됨 — 실제 동작을 그대로 기록',
  },
  {
    id: 'login-ko-05',
    html: `<form><input id="pw" aria-label="핀번호" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ko',
    category: 'login',
    notes: '핀번호 is in SENSITIVE_ARIA_LABELS_MULTILANG set',
  },
  {
    id: 'login-ko-06',
    html: `<form><input id="pw" aria-label="보안코드" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ko',
    category: 'login',
  },
  {
    id: 'login-ko-07',
    html: `<form><input id="pw" type="password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ko',
    category: 'login',
  },

  // ── English (en) — standard password ──────────────────────────────────
  {
    id: 'login-en-01',
    html: `<form><input id="pw" type="password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-en-02',
    html: `<form><input id="pw" autocomplete="current-password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-en-03',
    html: `<form><input id="pw" name="password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
    notes: 'SENSITIVE_NAME_ATTR: ^password$ via ^/$ anchors',
  },
  {
    id: 'login-en-04',
    html: `<form><input id="pwd" name="pwd" /></form>`,
    elements: ['#pwd'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-en-05',
    html: `<form><input id="pw" placeholder="Password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-en-06',
    html: `<form><input id="pw" placeholder="Enter your password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-en-07',
    html: `<form><input id="pw" aria-label="Password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
    notes: 'aria-label SENSITIVE_WORD_BOUNDARY path (8c)',
  },

  // ── English (en) — non-standard name patterns (Pitfall 7) ─────────────
  {
    id: 'login-en-pitfall-01',
    html: `<form><input id="pw" name="j_password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
    notes:
      'Pitfall 7: Liferay j_password — (?:^|[_\\-\\s.])password(?:[_\\-\\s.]|$) matches "_password$"',
  },
  {
    id: 'login-en-pitfall-02',
    html: `<form><input id="pw" name="pword" /></form>`,
    elements: ['#pw'],
    expected: [false],
    lang: 'en',
    category: 'login',
    notes:
      'SENSITIVE_NAME_ATTR does not include "pword" — only password/passwd/pwd/cvv/ssn/secret/pin/otp/passcode. "pword" is out of scope → false. Corpus records real heuristic behaviour, does not demand false positive.',
  },
  {
    id: 'login-en-pitfall-03',
    html: `<form><input id="pw" name="pass" /></form>`,
    elements: ['#pw'],
    expected: [false],
    lang: 'en',
    category: 'login',
    notes: '"pass" is not in the allow-list — heuristic does not flag (by design — too generic).',
  },
  {
    id: 'login-en-pitfall-04',
    html: `<form><input id="pw" name="user_password" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
    notes: 'underscore-separated compound — SENSITIVE_NAME_ATTR regex path',
  },
  {
    id: 'login-en-pitfall-05',
    html: `<form><input id="secret" name="secret" /></form>`,
    elements: ['#secret'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-en-pitfall-06',
    html: `<form><input id="pw" name="passwd" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-en-pitfall-07',
    html: `<form><input id="pin" name="pin" /></form>`,
    elements: ['#pin'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-en-pitfall-08',
    html: `<form><input id="pw" name="user.password.input" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
    notes: 'dot-separated compound — SENSITIVE_NAME_ATTR regex path',
  },
  {
    id: 'login-en-pitfall-09',
    html: `<form><input id="my-password-field" type="text" /></form>`,
    elements: ['#my-password-field'],
    expected: [true],
    lang: 'en',
    category: 'login',
    notes: 'id attribute scan — SENSITIVE_NAME_ATTR via dash boundary',
  },
  {
    id: 'login-en-pitfall-10',
    html: `<form><input id="pw" placeholder="Enter PIN" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'en',
    category: 'login',
  },

  // ── English (en) — negative regressions ───────────────────────────────
  {
    id: 'login-neg-01',
    html: `<form><input id="email" type="email" name="email" /></form>`,
    elements: ['#email'],
    expected: [false],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-neg-02',
    html: `<form><input id="u" type="email" name="passwordless_login_email" /></form>`,
    elements: ['#u'],
    expected: [false],
    lang: 'en',
    category: 'login',
    notes: 'Pitfall 7 regression confirmed in Phase 14-01 sensitive-or-only.spec.ts',
  },
  {
    id: 'login-neg-03',
    html: `<form><input id="u" name="crosswords" /></form>`,
    elements: ['#u'],
    expected: [false],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-neg-04',
    html: `<form><input id="u" name="passwordless" /></form>`,
    elements: ['#u'],
    expected: [false],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-neg-05',
    html: `<form><input id="u" placeholder="passwordless login" /></form>`,
    elements: ['#u'],
    expected: [false],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-neg-06',
    html: `<form><input id="u" name="username" /></form>`,
    elements: ['#u'],
    expected: [false],
    lang: 'en',
    category: 'login',
  },
  {
    id: 'login-neg-07',
    html: `<form><input id="u" name="keypad" /></form>`,
    elements: ['#u'],
    expected: [false],
    lang: 'en',
    category: 'login',
    notes: '"pad" is not a token — no match even though "pad" is substring',
  },

  // ── Japanese (ja) — aria-label exact match ────────────────────────────
  {
    id: 'login-ja-01',
    html: `<form><input id="pw" aria-label="パスワード" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ja',
    category: 'login',
  },
  {
    id: 'login-ja-02',
    html: `<form><input id="pw" aria-label="暗証番号" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ja',
    category: 'login',
  },
  {
    id: 'login-ja-03',
    html: `<form><input id="pw" aria-label="ぱすわーど" /></form>`,
    elements: ['#pw'],
    expected: [true],
    lang: 'ja',
    category: 'login',
    notes: 'ひらがな variant included in SENSITIVE_ARIA_LABELS_MULTILANG set',
  },
  {
    id: 'login-ja-04',
    html: `<form><input id="pw" placeholder="パスワード" /></form>`,
    elements: ['#pw'],
    expected: [false],
    lang: 'ja',
    category: 'login',
    notes: 'placeholder 는 영어 word-boundary regex만 평가 — CJK 인식 없음 (실제 heuristic 동작)',
  },
]
