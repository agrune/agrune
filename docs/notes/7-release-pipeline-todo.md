# 릴리스 파이프라인 TODO

작성일: 2026-03-25

## 현재 상태

- `@agrune/cli` 패키지 구현 완료 (packages/cli/)
- npm 배포 완료 (v0.1.0)
- CWS 등록 완료 (심사 대기중)
- GitHub Actions 릴리스 워크플로우 완료
- 데모 페이지 레포 분리 안 됨

## 완료된 작업

### 1. npm 계정 + org 설정 ✅

- npm 로그인 완료
- `@agrune` org 생성 완료
- granular access token 발급 (agrune-publish, 90일, 2026-06-23 만료)

### 2. npm 패키지 배포 (수동 1회) ✅

배포 완료:
1. `@agrune/core@0.1.0`
2. `@agrune/build-core@0.1.0`
3. `@agrune/cli@0.1.0`

### 3. CWS 등록 ✅

- Google Developer 계정 등록 완료
- CWS에 extension 첫 등록 완료 (심사 대기중)
- CWS API 키 발급 — 미완료 (Google Cloud Console에서 OAuth 설정 필요)

### 4. GitHub Actions 자동 배포 ✅

- `.github/workflows/release.yml` 생성 완료
- `v*` 태그 push 시 자동 실행
- publish-npm: core → build-core → cli 순서 배포
- publish-cws: extension zip 업로드 (auto-publish 안 함, 수동 심사 제출)
- NPM_TOKEN secret 설정 완료
- CWS secrets 미설정 (API 키 발급 후 설정 필요)

### 5. 데모 페이지 레포 분리 — 미완료

- `agrune-demo` 레포 생성
- `apps/cli-test-page` 이동
- 기존 레포에서 `apps/` 제거

## 레포 구조 (최종)

```
agrune/                ← 모노레포 (유지)
├── packages/core          → npm: @agrune/core
├── packages/build-core    → npm: @agrune/build-core
├── packages/extension     → CWS 배포
├── packages/mcp-server
└── packages/cli           → npm: @agrune/cli

agrune-demo/           ← 별도 레포
└── 데모 페이지
```
