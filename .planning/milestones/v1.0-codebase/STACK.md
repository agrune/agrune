# Technology Stack

**Analysis Date:** 2026-04-07

## Languages

**Primary:**
- TypeScript 5.7-5.9 범위 - `agrune/packages/*` 제품 코드와 `demo/src/*` UI 코드 전반

**Secondary:**
- JavaScript / CJS / MJS - 설정 및 스크립트 (`agrune/packages/extension/scripts/sync-manifest-version.mjs`, `demo/eslint.config.js`, `~/.codex/get-shit-done/bin/gsd-tools.cjs`)
- Markdown - 제품 문서, 스펙, 스킬 정의 (`CLAUDE.md`, `agrune/docs/**`, `skills/skills/**/SKILL.md`)
- HTML / CSS - 확장 패널과 데모 정적 문서 (`agrune/packages/devtools/src/*.html`, `demo/public/docs/*.html`, `demo/src/index.css`)

## Runtime

**Environment:**
- Node.js 22 이상 - `agrune/README.md` 기준 모노레포 개발 및 빌드 요구사항
- Chrome / Chromium - extension mode와 CDP quick mode 대상 런타임
- 브라우저 DOM 런타임 - `@agrune/runtime`가 페이지에 주입되어 실제 snapshot/act/fill/read를 수행

**Package Manager:**
- pnpm 10.23.0 - `agrune/package.json`의 `packageManager`
- Lockfile: `agrune/pnpm-lock.yaml`, `demo/pnpm-lock.yaml`

## Frameworks

**Core:**
- MCP SDK `@modelcontextprotocol/sdk` - `agrune/packages/mcp`
- Chrome Extension Manifest V3 - `agrune/packages/extension/manifest.json`
- React 19 - `demo` SPA

**Testing:**
- Vitest 4 - `agrune/packages/*/vitest.config.ts`
- jsdom 27 - 확장 테스트 및 런타임 DOM 테스트 지원

**Build/Dev:**
- tsup 8 - `core`, `runtime`, `browser`, `devtools`, `mcp` 빌드
- Vite 6/7 - 확장 번들링과 `demo` 개발 서버
- TypeScript - 공통 타입/빌드 기반
- Tailwind CSS 4 - `demo` 스타일링

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` - MCP 서버 표면
- `zod` - MCP 입력 스키마 정의
- `ws` - CDP WebSocket 연결
- `ai-motion` - 런타임 시각 효과 보조
- `react` / `react-dom` - 데모 UI
- `@xyflow/react` - 워크플로 에디터 캔버스
- `@radix-ui/react-*` - 데모 공통 UI primitives

**Infrastructure:**
- `@types/chrome` - 확장 타입
- `tsx` - TS 스크립트 실행
- `typescript-eslint`, `eslint`, `@eslint/js` - 데모 lint 체인

## Configuration

**Environment:**
- 제품 런타임은 로컬 Chrome, native host, `~/.agrune/` 디렉터리에 의존
- 데모는 별도 `.env` 없이 동작하며 대부분 상태를 `localStorage`에 저장
- GSD 문서는 `.planning/` 아래 생성되며 이번 매핑도 그 규칙을 따름

**Build:**
- `agrune/tsconfig.base.json` - workspace alias와 공통 TS 설정
- `agrune/pnpm-workspace.yaml` - `packages/*` 워크스페이스 관리
- `agrune/packages/extension/vite.config.ts` - content/background/popup/devtools 다중 번들 빌드
- `demo/vite.config.ts` - React SWC, Tailwind, annotation lint 플러그인

## Platform Requirements

**Development:**
- macOS 중심 흐름이 강함 - `~/.agrune/`, Chrome 확장 로드, native messaging 가정
- Node.js + pnpm + Chrome extension reload 절차 필요 (`agrune/AGENTS.md`)

**Production / Distribution:**
- npm 패키지 배포 대상: `@agrune/core`, `@agrune/mcp`
- Chrome Web Store 배포 대상: `@agrune/extension`
- 로컬 설치형 아키텍처 - 외부 SaaS 백엔드 없이 agent ↔ MCP ↔ browser 로컬 연결

## Workspace Composition

- `agrune/` - 핵심 제품 모노레포
- `demo/` - annotated fixture 앱
- `skills/` - Claude plugin / skill 래퍼 저장소
- `.github/profile/` - GitHub org profile README 자산

---

*Stack analysis: 2026-04-07*
*Update after major dependency or runtime changes*
