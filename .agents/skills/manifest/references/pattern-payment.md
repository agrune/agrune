# Pattern: Payment Forms

결제 폼은 **카드번호 + 만료일 + CVV + 청구 주소** 조합이 표준. CVV는 **언제나 sensitive**, 카드번호/만료일도 HTML 표준 `autocomplete=cc-*` 신호를 runtime heuristic이 자동 감지하지만 authoring 시 명시적으로 `sensitive: true` 권장.

## 표준 예시

```typescript
import { defineManifest, defineGroup, defineTarget } from '@agrune/manifest'

export default defineManifest({
  groups: [
    defineGroup({
      groupId: 'checkout',
      route: '/checkout',
      targets: [
        defineTarget({
          targetId: 'card_number_input',
          selector: {
            role: { name: 'textbox' },
            css: 'input[autocomplete=cc-number]',
          },
          actionKinds: ['fill'],
          sensitive: true,
        }),
        defineTarget({
          targetId: 'card_exp_input',
          selector: {
            role: { name: 'textbox' },
            css: 'input[autocomplete=cc-exp]',
          },
          actionKinds: ['fill'],
          sensitive: true,
        }),
        defineTarget({
          targetId: 'card_cvv_input',
          selector: {
            role: { name: 'textbox' },
            css: 'input[autocomplete=cc-csc]',
          },
          actionKinds: ['fill'],
          sensitive: true,        // ← CVV는 반드시 true
        }),
        defineTarget({
          targetId: 'cardholder_name_input',
          selector: {
            role: { name: 'textbox' },
            css: 'input[autocomplete=cc-name]',
          },
          actionKinds: ['fill'],
          // cardholder name은 sensitive 아님 (개인정보지만 mask 등급 하위)
        }),
        defineTarget({
          targetId: 'billing_address_input',
          selector: {
            role: { name: 'textbox' },
            css: 'input[autocomplete=street-address]',
          },
          actionKinds: ['fill'],
        }),
        defineTarget({
          targetId: 'pay_now_button',
          selector: {
            role: { name: 'button' },
            text: 'Pay now',
          },
          actionKinds: ['click'],
        }),
      ],
    }),
  ],
})
```

## CVV 판단 (critical)

CVV는 항상 sensitive. 다음 중 어느 것이든 신호:

- `autocomplete="cc-csc"` — HTML 표준
- `name="cvv"` / `"cvv2"` / `"securityCode"` (단어 경계 토큰 `cvv`만 runtime heuristic 캐치)
- `aria-label`에 `CVV` / `보안코드` / `暗証番号` 등
- placeholder가 `CVV` / `CVC` / `Security code`

**Pitfall**: `name="cvc"`는 현재 runtime heuristic 미감지. authoring 시 `sensitive: true`를 명시적으로 붙여 OR-only 계약으로 차단.

## 카드번호 필드

- `autocomplete="cc-number"` 가장 강력한 신호.
- `type="tel"` + CVV 4자리 패턴도 카드 결제에서 자주 쓰임. runtime heuristic은 type=tel 자체를 sensitive로 보지 않으므로 manifest의 `sensitive: true`가 중요.
- `inputmode="numeric"`만 있는 경우도 동일.

## 만료일

`autocomplete="cc-exp"` / `"cc-exp-month"` / `"cc-exp-year"` — 모두 runtime heuristic이 sensitive로 감지. 별도 월/년 split이면 두 target을 분리하되 `sensitive: true`.

## Non-sensitive 결제 필드

- Cardholder name (type=text, autocomplete=cc-name)
- Billing address, city, state, postal code, country
- Email for receipt (`name="email_receipt"`) — PII지만 masking 대상 아님

`sensitive` 키 생략.

## 3D Secure iframe

3DS 챌린지는 cross-origin iframe이라 agrune runtime이 접근 불가. manifest에 target으로 넣지 말고, HITL 체크포인트로 처리하는 것이 표준 (Phase 14 `agrune_macro_run`의 pause step).

## Stripe / Adyen / Braintree 임베드

카드 입력 iframe은 third-party JS가 직접 DOM을 제어하므로 `selector`가 호스트 페이지가 아닌 iframe 내부를 가리켜야 한다. 대부분 iframe cross-origin boundary 때문에 selector 해석이 깨진다 — **manifest로 다루지 말고** provider의 JS API (e.g. `stripe.confirmCardPayment`) 또는 macro precondition에서 외부 `pay_button` 클릭만 넣어 HITL로 사용자가 완료하도록 설계.
