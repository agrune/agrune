# @webcli-dom/browser-client

브라우저 페이지의 live snapshot과 command result를 로컬 `webcli` companion으로 동기화하는 SDK입니다.

## 설치

```bash
pnpm add @webcli-dom/browser-client
```

## 사용

```ts
import { initializeWebCliBrowserClient } from '@webcli-dom/browser-client'

initializeWebCliBrowserClient({
  appId: '@webcli-apps/cli-test-page',
})
```

전제 조건:

- 페이지에서 `@webcli-dom/build-core/register`가 로드되어 `window.webcliDom` runtime이 설치되어 있어야 합니다.
- companion이 `http://127.0.0.1:9444`에서 실행 중이어야 합니다.

동기화 경로:

- `POST /page/connect`
- `POST /page/sync`
- `WS /page/ws`
