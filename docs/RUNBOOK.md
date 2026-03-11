# Runbook

## 개발 루트

```bash
cd /Users/chenjing/dev/web-cli
```

## 의존성 설치

```bash
pnpm install
```

## 전체 검증

```bash
pnpm run typecheck
pnpm run test
```

## Companion 실행

TUI 포함 실행:

```bash
pnpm --filter @webcli-dom/companion run start
```

상태 확인:

```bash
pnpm --filter @webcli-dom/companion run status
```

종료:

```bash
pnpm --filter @webcli-dom/companion run stop
```

## 데모 앱 실행

개발 서버:

```bash
pnpm -C apps/cli-test-page dev
```

preview:

```bash
pnpm -C apps/cli-test-page preview --host 127.0.0.1 --port 4174
```

## CLI 예시

```bash
pnpm --filter @webcli-dom/cli run start status
pnpm --filter @webcli-dom/cli run start sessions list
pnpm --filter @webcli-dom/cli run start snapshot
pnpm --filter @webcli-dom/cli run start act --target auth-login
pnpm --filter @webcli-dom/cli run start fill --target auth-email --value demo@example.com
```

## TUI 기본 조작

- `Tab`: 패널 이동
- `Enter`: 그룹 토글 또는 click 실행
- `← / →`: 그룹 접기/펼치기
- `e`: fill target 입력 모드
- `r`: 새로고침
- `q`: 종료

## 안정적으로 테스트하는 방법

```bash
pnpm --filter @webcli-dom/companion run stop
pnpm --filter @webcli-dom/companion run start
```

브라우저에서는:

1. 앱 탭을 하나만 남긴다.
2. 그 탭을 새로고침한다.
3. companion TUI와 같은 화면 상태인지 확인한 뒤 조작한다.
