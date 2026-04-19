# Pattern: Login Forms

로그인 폼은 `email`/`username` + `password` + `submit` + 선택적 `remember_me` 구조다. 핵심은 **password 필드에 `sensitive: true` 강제 부여**.

## 표준 예시

```typescript
import { defineManifest, defineGroup, defineTarget } from '@agrune/manifest'

export default defineManifest({
  groups: [
    defineGroup({
      groupId: 'auth',
      route: '/login',
      targets: [
        defineTarget({
          targetId: 'email_input',
          selector: {
            role: { name: 'textbox' },
            css: 'input[type=email][autocomplete=email]',
          },
          actionKinds: ['fill'],
        }),
        defineTarget({
          targetId: 'password_input',
          selector: {
            role: { name: 'textbox' },
            css: 'input[type=password][autocomplete=current-password]',
          },
          actionKinds: ['fill'],
          sensitive: true,   // ← 필수: password는 OR-only 계약에서 항상 true
        }),
        defineTarget({
          targetId: 'remember_me_checkbox',
          selector: {
            role: { name: 'checkbox' },
            text: 'Remember me',
          },
          actionKinds: ['click'],
        }),
        defineTarget({
          targetId: 'login_submit_button',
          selector: {
            role: { name: 'button' },
            text: 'Sign in',
          },
          actionKinds: ['click'],
        }),
      ],
    }),
  ],
})
```

## sensitive:true 판단 기준

다음 중 하나라도 해당되면 **반드시** `sensitive: true`를 붙인다:

- `<input type="password">` — 가장 확실한 신호
- `autocomplete="current-password"` | `"new-password"` | `"one-time-code"` — HTML 표준 힌트
- `name` 또는 `id`가 `password` / `passwd` / `pwd` / `secret` / `pin` / `otp` / `passcode` 토큰 포함
- `aria-label`이 `Password` / `비밀번호` / `パスワード` / `密码` / `contraseña` / `mot de passe` 등
- placeholder가 `Password`, `Enter your password` 등

**Runtime heuristic (Phase 14-01 `isSensitive`)이 위 신호들을 자동 감지하지만**, authoring 시점에 `sensitive: true`를 명시적으로 쓰면 (a) manifest 리뷰 시 security-critical 필드가 눈에 띄고 (b) recorder가 잘못 감지한 경우에도 override 안 되는 OR-only 계약이 유지된다.

**`sensitive: false`는 스키마 금지.** 필드가 sensitive가 아니면 `sensitive` key 자체를 빼라.

## 자주 마주치는 실수

| 잘못 | 옳음 | 이유 |
|---|---|---|
| `sensitive: false` | `sensitive` 키 생략 | `z.literal(true).optional()`에서 `false`는 타입 에러 |
| `selector: { css: '.css-abc123' }` | `selector: { css: 'input[type=password]' }` | CSS-in-JS 해시는 빌드마다 바뀐다 |
| `actionKinds: ['click']` on `<input>` | `actionKinds: ['fill']` | input 은 click으로 값이 안 들어감 |
| `targetId: 'Login'` | `targetId: 'login_submit_button'` | snake_case + 행동 명시 |

## Non-sensitive 로그인 필드

Username / email은 sensitive가 아니다 (개인정보지만 password 등급 마스킹 대상 아님). `sensitive` 키 생략.

## 소셜 로그인 버튼

OAuth/SSO 버튼은 일반 `click` target으로 정의:

```typescript
defineTarget({
  targetId: 'google_oauth_button',
  selector: { role: { name: 'button' }, text: 'Sign in with Google' },
  actionKinds: ['click'],
}),
```

외부 OAuth 팝업 이후 redirect 페이지는 별도 `defineGroup({ route: '/auth/callback', ... })`으로 분리.
