import type { FormFixture } from './types.js'

/**
 * Payment form corpus — 32 fixtures.
 *
 * Coverage:
 *   - CVV variations (CVV/CVC, name/placeholder/aria-label, KO/JA)
 *   - OTP (one-time-code autocomplete, name=otp)
 *   - Card number (autocomplete=cc-number, name=cardNumber)
 *   - Expiry (autocomplete=cc-exp, name=expiry)
 *   - Non-sensitive payment-surface fields (billing_address, email_receipt)
 */
export const paymentFixtures: FormFixture[] = [
  // ── CVV (en) ──────────────────────────────────────────────────────────
  {
    id: 'payment-cvv-01',
    html: `<form><input id="cvv" aria-label="CVV" /></form>`,
    elements: ['#cvv'],
    expected: [true],
    lang: 'en',
    category: 'payment',
    notes: 'aria-label SENSITIVE_WORD_BOUNDARY path',
  },
  {
    id: 'payment-cvv-02',
    html: `<form><input id="cvv" placeholder="CVV" /></form>`,
    elements: ['#cvv'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-cvv-03',
    html: `<form><input id="cvv" name="cvv" /></form>`,
    elements: ['#cvv'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-cvv-04',
    html: `<form><input id="cvc" name="cvc" /></form>`,
    elements: ['#cvc'],
    expected: [false],
    lang: 'en',
    category: 'payment',
    notes:
      'Pitfall: "cvc" not in SENSITIVE_NAME_ATTR allow-list (only cvv/password/passwd/pwd/ssn/secret/pin/otp/passcode). Heuristic genuinely misses this — deferred to v0.6+. Documented as known gap.',
  },
  {
    id: 'payment-cvv-05',
    html: `<form><input id="cvv" autocomplete="cc-csc" /></form>`,
    elements: ['#cvv'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-cvv-06',
    html: `<form><input id="cvv" aria-label="Credit card CVV" /></form>`,
    elements: ['#cvv'],
    expected: [true],
    lang: 'en',
    category: 'payment',
    notes: 'aria-label 8c — English word boundary',
  },
  {
    id: 'payment-cvv-07',
    html: `<form><input id="sc" placeholder="Security code" /></form>`,
    elements: ['#sc'],
    expected: [false],
    lang: 'en',
    category: 'payment',
    notes:
      'Heuristic does not recognise plain-English "Security code" — known gap. id intentionally neutral (not "cvv") so only placeholder signal is evaluated.',
  },
  {
    id: 'payment-cvv-08',
    html: `<form><input id="sc" name="security_code" /></form>`,
    elements: ['#sc'],
    expected: [false],
    lang: 'en',
    category: 'payment',
    notes: 'No token in allow-list — documented gap. id/name both neutral.',
  },

  // ── CVV (ko / ja) ─────────────────────────────────────────────────────
  {
    id: 'payment-cvv-ko-01',
    html: `<form><input id="cvv" aria-label="보안코드" /></form>`,
    elements: ['#cvv'],
    expected: [true],
    lang: 'ko',
    category: 'payment',
    notes: 'SENSITIVE_ARIA_LABELS_MULTILANG set (Korean CVV)',
  },
  {
    id: 'payment-cvv-ko-02',
    html: `<form><input id="sec" aria-label="보안 코드" /></form>`,
    elements: ['#sec'],
    expected: [false],
    lang: 'ko',
    category: 'payment',
    notes:
      'Space-separated Korean "보안 코드" — tokens ["보안","코드"] neither in set, raw phrase not in set. Gap documented. id neutral (not "cvv") to isolate aria-label signal.',
  },
  {
    id: 'payment-cvv-ja-01',
    html: `<form><input id="cvv" aria-label="暗証番号" /></form>`,
    elements: ['#cvv'],
    expected: [true],
    lang: 'ja',
    category: 'payment',
  },

  // ── OTP ───────────────────────────────────────────────────────────────
  {
    id: 'payment-otp-01',
    html: `<form><input id="otp" autocomplete="one-time-code" /></form>`,
    elements: ['#otp'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-otp-02',
    html: `<form><input id="otp" name="otp" /></form>`,
    elements: ['#otp'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-otp-03',
    html: `<form><input id="otp" placeholder="OTP code" /></form>`,
    elements: ['#otp'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-otp-04',
    html: `<form><input id="otp" name="one_time_password" /></form>`,
    elements: ['#otp'],
    expected: [true],
    lang: 'en',
    category: 'payment',
    notes: '"_password" boundary match',
  },
  {
    id: 'payment-otp-ko-01',
    html: `<form><input id="auth" aria-label="인증번호" /></form>`,
    elements: ['#auth'],
    expected: [false],
    lang: 'ko',
    category: 'payment',
    notes:
      '"인증번호" (Korean auth code) not in SENSITIVE_ARIA_LABELS_MULTILANG — documented gap, v0.6+ corpus expansion. id neutral.',
  },

  // ── Card number ───────────────────────────────────────────────────────
  {
    id: 'payment-card-01',
    html: `<form><input id="card" autocomplete="cc-number" /></form>`,
    elements: ['#card'],
    expected: [true],
    lang: 'en',
    category: 'payment',
    notes: 'autocomplete allow-list (cc-number)',
  },
  {
    id: 'payment-card-02',
    html: `<form><input id="card" name="cardNumber" /></form>`,
    elements: ['#card'],
    expected: [false],
    lang: 'en',
    category: 'payment',
    notes:
      'Card number without autocomplete is NOT sensitive in current heuristic — documented design choice. A "sensitive: true" manifest flag is the authoring-time remedy.',
  },
  {
    id: 'payment-card-03',
    html: `<form><input id="card" placeholder="1234 5678 9012 3456" /></form>`,
    elements: ['#card'],
    expected: [false],
    lang: 'en',
    category: 'payment',
  },

  // ── Expiry ────────────────────────────────────────────────────────────
  {
    id: 'payment-exp-01',
    html: `<form><input id="exp" autocomplete="cc-exp" /></form>`,
    elements: ['#exp'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-exp-02',
    html: `<form><input id="exp-m" autocomplete="cc-exp-month" /></form>`,
    elements: ['#exp-m'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-exp-03',
    html: `<form><input id="exp-y" autocomplete="cc-exp-year" /></form>`,
    elements: ['#exp-y'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-exp-04',
    html: `<form><input id="exp" name="expiry" /></form>`,
    elements: ['#exp'],
    expected: [false],
    lang: 'en',
    category: 'payment',
    notes: 'name=expiry without autocomplete — not flagged (heuristic gap)',
  },
  {
    id: 'payment-exp-05',
    html: `<form><input id="exp" name="exp_date" placeholder="MM/YY" /></form>`,
    elements: ['#exp'],
    expected: [false],
    lang: 'en',
    category: 'payment',
  },

  // ── Type=tel (phone-style input) ──────────────────────────────────────
  {
    id: 'payment-tel-cvv',
    html: `<form><input id="cvv" type="tel" aria-label="CVV" maxlength="4" /></form>`,
    elements: ['#cvv'],
    expected: [true],
    lang: 'en',
    category: 'payment',
    notes: 'Pitfall 7: type=tel CVV. aria-label=CVV carries the signal.',
  },
  {
    id: 'payment-tel-card',
    html: `<form><input id="card" type="tel" name="cardnumber" autocomplete="cc-number" /></form>`,
    elements: ['#card'],
    expected: [true],
    lang: 'en',
    category: 'payment',
  },

  // ── Non-sensitive payment-surface fields ──────────────────────────────
  {
    id: 'payment-neg-01',
    html: `<form><input id="email" type="email" name="email_receipt" /></form>`,
    elements: ['#email'],
    expected: [false],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-neg-02',
    html: `<form><input id="addr" name="billing_address" /></form>`,
    elements: ['#addr'],
    expected: [false],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-neg-03',
    html: `<form><input id="country" name="billing_country" /></form>`,
    elements: ['#country'],
    expected: [false],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-neg-04',
    html: `<form><input id="zip" name="postal_code" /></form>`,
    elements: ['#zip'],
    expected: [false],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-neg-05',
    html: `<form><input id="name" name="cardholder_name" /></form>`,
    elements: ['#name'],
    expected: [false],
    lang: 'en',
    category: 'payment',
  },
  {
    id: 'payment-neg-06',
    html: `<form><input id="promo" name="promo_code" /></form>`,
    elements: ['#promo'],
    expected: [false],
    lang: 'en',
    category: 'payment',
    notes: '"code" alone is not in allow-list',
  },
  {
    id: 'payment-neg-07',
    html: `<form><input id="phone" type="tel" name="phone_number" /></form>`,
    elements: ['#phone'],
    expected: [false],
    lang: 'en',
    category: 'payment',
  },
]
