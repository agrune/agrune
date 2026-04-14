# agrune

AI 에이전트가 어노테이션된 웹 앱을 브라우저에서 직접 조작할 수 있게 해주는 브라우저 자동화 도구입니다.

핵심 배포물은 `@agrune/mcp`이고, Claude Code나 Codex 같은 하네스는 이 MCP 서버를 실행해 사용합니다. 어노테이션은 특정 하네스에 묶인 구현이 아니라 `workflows/annotate`에 정의된 공통 워크플로를 외부 하네스 어댑터가 감싸는 구조를 목표로 합니다.

## 현재 구조

```text
packages/
  core/        shared types and contracts
  runtime/     page runtime, scanner, manifest builder
  browser/     ExtensionDriver, CdpDriver, transports
  mcp/         publish target: @agrune/mcp
  extension/   Chrome extension glue for extension mode
  devtools/    extension devtools panel

workflows/
  annotate/    harness-neutral annotation workflow source of truth
```

## 배포 모델

- `@agrune/mcp`: 제품 본체. Claude, Codex, 기타 MCP 하네스가 공통으로 실행하는 canonical entry
- `workflows/annotate`: Agrune 사용에 필요한 어노테이션 워크플로 원본

이 구조의 의도는 `plugin이 본체`가 아니라 `@agrune/mcp + workflow`가 본체가 되도록 만드는 것입니다.

## 패키지

| 패키지 | 경로 | 설명 |
|--------|------|------|
| **@agrune/core** | `packages/core` | 공유 타입, 에러 코드, 런타임 설정 헬퍼 |
| **@agrune/runtime** | `packages/runtime` | 페이지 런타임, DOM 스캐너, manifest builder |
| **@agrune/browser** | `packages/browser` | `ExtensionDriver`, `CdpDriver`, native messaging/CDP 전송 계층 |
| **@agrune/mcp** | `packages/mcp` | MCP 서버 본체와 `agrune-mcp` CLI |
| **@agrune/extension** | `packages/extension` | Chrome extension mode용 background/content glue |
| **@agrune/devtools** | `packages/devtools` | extension devtools 패널 |

## 실행 방식

### 1. Quick mode

확장 프로그램 없이 Chrome DevTools Protocol로 직접 연결합니다.

```bash
pnpm dlx @agrune/mcp@latest --mode cdp
```

### 2. Extension mode

기존 native host + extension 경로를 유지하는 호환 모드입니다.

```bash
pnpm dlx @agrune/mcp@latest
```

### 3. 어노테이션

어노테이션은 Claude 전용 기능이 아니라 Agrune 사용의 필수 워크플로입니다. source of truth는 [workflows/annotate/WORKFLOW.md](./workflows/annotate/WORKFLOW.md)에 두고, 하네스별 어댑터는 이 워크플로를 각 환경 형식에 맞게 감쌉니다.

## MCP 도구

| 도구 | 설명 |
|------|------|
| `agrune_sessions` | 활성 브라우저 세션 목록 조회 |
| `agrune_snapshot` | 페이지 스냅샷과 target/group 정보 조회 |
| `agrune_act` | 클릭, 더블클릭, 호버 등 인터랙션 수행 |
| `agrune_fill` | 입력 필드 값 채우기 |
| `agrune_drag` | 드래그 앤 드롭 |
| `agrune_pointer` | 저수준 포인터/휠 시퀀스 |
| `agrune_wait` | 상태 변화 대기 |
| `agrune_guide` | 대상 하이라이트 |
| `agrune_read` | 페이지를 마크다운으로 읽기 |
| `agrune_config` | 런타임 시각 설정 변경 |

## 개발

### 요구 사항

- Node.js 22 이상
- pnpm 10.23.0 이상

### 설치

```bash
git clone https://github.com/agrune/agrune.git
cd agrune
pnpm install
```

### 빌드와 테스트

```bash
pnpm build
pnpm test
```

### 로컬 quick mode 확인

```bash
node /Users/chenjing/dev/agrune/agrune/packages/mcp/dist/bin/agrune-mcp.js --mode cdp
```

### 확장 프로그램 개발

```bash
cd packages/extension
pnpm dev
```

확장 프로그램은 `packages/extension/dist/`를 Chrome에서 로드하면 됩니다.

## 관련 디렉터리

- [packages/mcp/README.md](./packages/mcp/README.md): `@agrune/mcp` 패키지 설명
- [workflows/annotate/WORKFLOW.md](./workflows/annotate/WORKFLOW.md): 공통 어노테이션 워크플로

## 개인정보 처리방침

- 모든 데이터는 로컬 기기에서만 처리됩니다
- quick mode는 브라우저와 직접 CDP로 통신합니다
- extension mode는 extension과 로컬 MCP/runtime 사이에서만 통신합니다
- 외부 서버로 사용자 페이지 데이터를 전송하지 않습니다

자세한 내용은 [PRIVACY.md](./PRIVACY.md)를 참고하세요.
