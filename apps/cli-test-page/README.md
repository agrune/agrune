# @webcli-apps/cli-test-page

`webcli-dom` 포크용 데모 앱입니다.

## 실행

```bash
pnpm --filter @webcli-dom/companion run start
pnpm -C apps/cli-test-page dev
```

포인트:

- 페이지는 `@webcli-dom/build-core/register`가 설치한 runtime snapshot을 companion으로 보냅니다.
- companion이 실행 중이면 TUI와 `webcli` CLI에서 `로그인`, `회원가입`, 입력 필드를 live menu로 볼 수 있습니다.
