# agrune

AI 에이전트가 어노테이션된 웹 앱을 브라우저에서 직접 조작할 수 있게 해주는 CDP 기반 브라우저 자동화 도구입니다.

핵심 배포물은 `@agrune/mcp`이고, Claude Code나 Codex 같은 하네스는 이 MCP 서버를 실행해 사용합니다. 어노테이션은 특정 하네스에 묶인 구현이 아니라 `workflows/annotate`에 정의된 공통 워크플로를 외부 하네스 어댑터가 감싸는 구조를 목표로 합니다.

## 현재 구조

```text
packages/
  core/        shared types, contracts, annotation linter
  runtime/     page runtime, scanner, manifest builder
  browser/     CdpDriver, Chrome launcher, CDP transport
  mcp/         publish target: @agrune/mcp (MCP server + DevTools webapp)
  devtools/    DevTools webapp (command log, HITL toolbar, sessions, failures)

workflows/
  annotate/    harness-neutral annotation workflow source of truth
```

## 배포 모델

- `@agrune/mcp`: 제품 본체. Claude, Codex, 기타 MCP 하네스가 공통으로 실행하는 canonical entry
- `workflows/annotate`: Agrune 사용에 필요한 어노테이션 워크플로 원본

이 구조의 의도는 `plugin이 본체`가 아니라 `@agrune/mcp + workflow`가 본체가 되도록 만드는 것입니다. DevTools 웹앱은 `@agrune/mcp` 프로세스가 기본 포트 47654에서 `http://localhost:47654/devtools` 로 제공합니다.

## 패키지

| 패키지 | 경로 | 설명 |
|--------|------|------|
| **@agrune/core** | `packages/core` | 공유 타입, 에러 코드, 런타임 설정 헬퍼, annotation linter |
| **@agrune/runtime** | `packages/runtime` | 페이지 런타임, DOM 스캐너, manifest builder |
| **@agrune/browser** | `packages/browser` | `CdpDriver`, Chrome launcher, CDP 전송 계층 |
| **@agrune/mcp** | `packages/mcp` | MCP 서버 본체와 `agrune-mcp` CLI |
| **@agrune/devtools** | `packages/devtools` | MCP 서버가 내장 서빙하는 DevTools 웹앱 (command log, HITL toolbar, sessions panel, failure diagnostics) |

## 실행 방식

agrune은 CDP(Chrome DevTools Protocol) 모드만 지원합니다. v1.1에서 Chrome 확장/네이티브 메시징 경로는 제거되었습니다.

```bash
agrune                     # Chrome 실행 + DevTools 웹앱
agrune --headless          # UI 없이 실행
agrune --attach ws://...   # 기존 Chrome 인스턴스에 연결
agrune --port 47655        # DevTools 웹앱 포트 오버라이드
agrune --no-devtools       # DevTools 웹앱 비활성화 (MCP stdio 만 사용)
```

DevTools 웹 앱은 MCP 서버 실행 시 `http://localhost:PORT/devtools`에서 제공됩니다. 전체 플래그 목록은 아래 `CLI 플래그` 표와 `agrune --help` 를 참고하세요.

### CLI 플래그

| 플래그 | 기본값 | 설명 |
|--------|--------|------|
| `--headless` | `false` | Chrome 을 headless 모드로 실행 (UI 없음) |
| `--attach <ws>` | (미설정) | 이미 실행 중인 Chrome 의 CDP WebSocket endpoint 에 연결 |
| `--port <n>` | `47654` | DevTools 웹앱 포트 |
| `--no-devtools` | `false` | DevTools 웹앱을 서빙하지 않음 (MCP stdio 만 사용) |
| `--url <url>` | `about:blank` | Chrome 기동 시 열 초기 URL |
| `--user-data-dir <path>` | (임시 디렉터리) | Chrome user-data 디렉터리. automation profile 재사용 시 사용 |
| `-h`, `--help` | — | 도움말 출력 후 종료 |
| `-v`, `--version` | — | 버전 출력 후 종료 |

DevTools 웹앱은 `http://localhost:<port>/devtools` (기본 포트 47654) 에서 제공됩니다.
전체 도움말은 `agrune --help` 로 볼 수 있습니다.

### Automation profile

agrune 은 기본적으로 Chrome 을 실행할 때마다 임시 user-data 디렉터리를 새로 만들고, 종료
시 삭제합니다. 자동화에서 **로그인 상태·쿠키·세션 저장소·확장 프로그램 설정**을 유지하고
싶다면 user-data 디렉터리를 고정해 재사용해야 합니다. agrune 은 `--user-data-dir` 플래그
하나로 이를 지원하며, 별도 `profile import` 서브커맨드는 제공하지 않습니다. 표준 Chrome
user-data 디렉터리 레이아웃을 그대로 사용합니다.

#### 1. 새 profile 생성

```bash
mkdir -p ~/.agrune/profiles/default
agrune --user-data-dir ~/.agrune/profiles/default
```

Chrome 이 뜬 뒤 원하는 사이트에 수동 로그인하거나 확장 프로그램을 설치합니다.
`Ctrl+C` 로 agrune 을 종료하면, 해당 디렉터리에 profile 이 그대로 보존됩니다.

다음 실행부터는 같은 경로를 재지정하면 동일한 로그인 상태로 시작합니다:

```bash
agrune --user-data-dir ~/.agrune/profiles/default
```

#### 2. 기존 Chrome profile 복제

이미 로그인해둔 평소 쓰는 Chrome profile 을 자동화 용도로 복제해서 사용할 수도 있습니다.
**원본 profile 을 직접 쓰지 말고 반드시 복사본을 만드세요** — agrune 이 쓰는 동안 원본
Chrome 을 열면 Chrome 이 "프로필이 이미 사용 중" 오류를 띄웁니다.

macOS:

```bash
# 1. Chrome 을 완전히 종료
# 2. 자동화 전용 복사본 생성
cp -R "$HOME/Library/Application Support/Google/Chrome/Default" \
      "$HOME/.agrune/profiles/imported"
agrune --user-data-dir ~/.agrune/profiles/imported
```

Linux:

```bash
cp -R "$HOME/.config/google-chrome/Default" ~/.agrune/profiles/imported
agrune --user-data-dir ~/.agrune/profiles/imported
```

Windows (PowerShell):

```powershell
Copy-Item -Recurse `
  "$Env:LOCALAPPDATA\Google\Chrome\User Data\Default" `
  "$Env:USERPROFILE\.agrune\profiles\imported"
agrune --user-data-dir "$Env:USERPROFILE\.agrune\profiles\imported"
```

> **주의**: Chrome user-data 디렉터리는 프로필 상위 폴더가 기준입니다. `Default/` 하위
> 디렉터리 **하나만 복사**해서 그 복사본을 `--user-data-dir` 에 지정하면 됩니다. 여러 프로
> 필을 쓰고 있다면 Chrome `User Data/` 루트 전체를 복사한 뒤 `--user-data-dir` 로 그
> 루트를 지정하면 기존과 동일한 profile selector 가 나타납니다.

#### 3. profile 없이 실제 Chrome 에 붙기

복사본을 만들지 않고 *현재 열려 있는* Chrome 에 직접 붙고 싶다면 `--attach` 를 씁니다.
이 경우 Chrome 을 `--remote-debugging-port=9222` 옵션으로 먼저 실행해두어야 합니다:

```bash
# Chrome 을 remote-debugging 모드로 실행 (별도 터미널)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222

# agrune 이 동일 Chrome 에 붙기
agrune --attach ws://127.0.0.1:9222/devtools/browser/<id>
```

`<id>` 는 `http://127.0.0.1:9222/json/version` 응답의 `webSocketDebuggerUrl` 에서 확인
할 수 있습니다. 이 방식은 profile 복사본을 만들지 않고도 실제 로그인 상태를 쓸 수 있지만,
agrune 이 종료된 뒤에도 Chrome 은 계속 열려 있습니다.

#### 정리

| 목표 | 추천 방법 |
|------|-----------|
| 전용 자동화 profile 을 한 번 만들고 매번 같은 상태로 시작 | `--user-data-dir` (방법 1) |
| 지금 Chrome 에 저장된 로그인·쿠키를 자동화로 그대로 옮기고 싶다 | `--user-data-dir` 복제 (방법 2) |
| 평소 Chrome 에 그대로 붙어서 자동화하고 싶다 | `--attach` (방법 3) |

### 어노테이션

어노테이션은 Claude 전용 기능이 아니라 Agrune 사용의 필수 워크플로입니다. source of truth는 [workflows/annotate/WORKFLOW.md](./workflows/annotate/WORKFLOW.md)에 두고, 하네스별 어댑터는 이 워크플로를 각 환경 형식에 맞게 감쌉니다.

## MCP 도구

| 도구 | 설명 |
|------|------|
| `agrune_sessions` | 활성 브라우저 세션 목록 조회 |
| `agrune_focus` | 멀티 탭 환경에서 명시적으로 활성 세션 지정 |
| `agrune_snapshot` | 페이지 스냅샷과 target/group 정보 조회 |
| `agrune_act` | 클릭, 더블클릭, 호버 등 인터랙션 수행 |
| `agrune_fill` | 입력 필드 값 채우기 (CDP Input 경로, `clear`/`strategy` 옵션) |
| `agrune_drag` | 드래그 앤 드롭 |
| `agrune_pointer` | 저수준 포인터/휠 시퀀스 |
| `agrune_wait` | 상태 변화 대기 |
| `agrune_guide` | 대상 하이라이트 |
| `agrune_read` | 페이지를 마크다운으로 읽기 |
| `agrune_config` | 런타임 시각 설정 변경 |

자가 복구 supervisor 가 세션 재연결·탭 크래시 상황을 감지하면 도구 응답에 `recovered` 플래그가 붙어 반환됩니다.

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

### 로컬에서 MCP 서버 실행

```bash
node packages/mcp/dist/bin/agrune-mcp.js
```

### 품질 검증

- `pnpm test` — 유닛·통합 테스트
- `pnpm test:e2e` — Playwright E2E 하네스 (v1.1 phase 9 에서 추가)
- `pnpm lint:annotations` — `data-agrune-*` 어노테이션 linter (`@agrune/core`)

## 관련 디렉터리

- [packages/mcp/README.md](./packages/mcp/README.md): `@agrune/mcp` 패키지 설명
- [workflows/annotate/WORKFLOW.md](./workflows/annotate/WORKFLOW.md): 공통 어노테이션 워크플로
- [docs/notes/](./docs/notes): v1.0 시점의 아카이브 문서. 현재 아키텍처는 본 README 기준

## 개인정보 처리방침

- 모든 데이터는 로컬 기기에서만 처리됩니다
- agrune 은 Chrome 본체와 로컬 CDP 연결만 사용하며, 외부 서버로 사용자 페이지 데이터를 전송하지 않습니다

자세한 내용은 [PRIVACY.md](./PRIVACY.md)를 참고하세요.
