# MCP 서버 배포 자동화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm build` 한 번으로 MCP 서버 변경이 `~/.agrune/mcp-server/`에 자동 반영 + 데몬 재시작

**Architecture:** `packages/mcp-server/package.json`에 `postbuild` 스크립트 추가. `~/.agrune/mcp-server/`가 `dist/`의 flat copy 구조이므로 `dist/*` → `~/.agrune/mcp-server/` 복사 후 포트 47654 데몬 kill.

**Tech Stack:** shell script (postbuild), pnpm workspace

**Spec:** `docs/superpowers/specs/2026-03-27-mcp-server-deploy-automation-design.md`

---

## 파일 구조

| 파일 | 변경 | 역할 |
|------|------|------|
| `packages/mcp-server/package.json` | 수정 | `postbuild` 스크립트 추가 |
| `packages/mcp-server/scripts/postbuild.sh` | 생성 | 복사 + 데몬 kill 로직 |
| `README.md` | 수정 | "MCP 서버 개발 모드" 섹션 보강 |

---

### Task 1: postbuild 셸 스크립트 작성

**Files:**
- Create: `packages/mcp-server/scripts/postbuild.sh`

- [ ] **Step 1: postbuild.sh 작성**

```bash
#!/bin/sh
# postbuild.sh — dist를 ~/.agrune/mcp-server/에 동기화하고 데몬을 재시작한다.

DEPLOY_DIR="$HOME/.agrune/mcp-server"

# agrune이 설치되지 않은 환경이면 스킵 (CI, 최초 클론 등)
if [ ! -d "$DEPLOY_DIR" ]; then
  echo "[postbuild] $DEPLOY_DIR not found, skipping deploy sync."
  exit 0
fi

# 이전 빌드 산출물 정리 후 새 dist 복사 (chunk 해시가 매 빌드마다 변경됨)
rm -rf "$DEPLOY_DIR"/*
cp -r dist/* "$DEPLOY_DIR"/

echo "[postbuild] Synced dist → $DEPLOY_DIR"

# 백엔드 데몬 종료 (다음 MCP 요청 시 자동 재시작)
lsof -ti tcp:47654 | xargs kill 2>/dev/null && \
  echo "[postbuild] Killed backend daemon on port 47654." || \
  echo "[postbuild] No running daemon found."
```

- [ ] **Step 2: 실행 권한 부여**

Run: `chmod +x packages/mcp-server/scripts/postbuild.sh`

---

### Task 2: package.json에 postbuild 스크립트 등록

**Files:**
- Modify: `packages/mcp-server/package.json:6-11`

- [ ] **Step 1: postbuild 스크립트 추가**

`scripts` 섹션을 아래와 같이 변경:

```json
"scripts": {
  "build": "tsup",
  "postbuild": "./scripts/postbuild.sh",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "test": "vitest run",
  "dev": "tsx src/index.ts"
}
```

`postbuild`는 pnpm의 lifecycle hook으로, `build` 스크립트 완료 직후 자동 실행된다.

---

### Task 3: 동작 검증

- [ ] **Step 1: `~/.agrune/mcp-server/` 존재 상태에서 빌드**

Run: `cd packages/mcp-server && pnpm build`

Expected:
```
[postbuild] Synced dist → /Users/laonpeople/.agrune/mcp-server
[postbuild] Killed backend daemon on port 47654.
```
(데몬이 안 떠있으면 "No running daemon found.")

- [ ] **Step 2: 배포 디렉토리에 최신 파일이 복사되었는지 확인**

Run: `diff <(ls dist/) <(ls ~/.agrune/mcp-server/)`

Expected: 차이 없음 (출력 없음)

- [ ] **Step 3: `~/.agrune/mcp-server/`가 없는 상태에서 빌드가 깨지지 않는지 확인**

Run:
```bash
mv ~/.agrune/mcp-server ~/.agrune/mcp-server.bak
pnpm build
mv ~/.agrune/mcp-server.bak ~/.agrune/mcp-server
```

Expected:
```
[postbuild] /Users/laonpeople/.agrune/mcp-server not found, skipping deploy sync.
```

- [ ] **Step 4: 루트에서 전체 빌드도 정상 동작 확인**

Run: `cd ../../ && pnpm build`

Expected: 모든 패키지 빌드 성공, MCP 서버의 postbuild 메시지 출력

---

### Task 4: README 업데이트

**Files:**
- Modify: `README.md:173-178`

- [ ] **Step 1: "MCP 서버 개발 모드" 섹션 보강**

기존:
```markdown
### MCP 서버 개발 모드

```bash
cd packages/mcp-server
pnpm dev
```
```

변경:
```markdown
### MCP 서버 개발 모드

```bash
cd packages/mcp-server
pnpm dev
```

#### 빌드 후 자동 배포

`pnpm build` 실행 시 MCP 서버의 빌드 결과물이 자동으로 `~/.agrune/mcp-server/`에 동기화되고, 실행 중인 백엔드 데몬이 재시작됩니다. 다음 MCP 도구 호출 시 새 버전의 데몬이 자동으로 시작됩니다.

> **사전 조건:** `pnpm dlx @agrune/cli` 또는 `agrune setup`으로 초기 설치가 완료되어 있어야 합니다. `~/.agrune/mcp-server/` 디렉터리가 없으면 동기화를 건너뜁니다.
```

---

### Task 5: 커밋

- [ ] **Step 1: 변경 파일 스테이징 및 커밋**

```bash
git add packages/mcp-server/scripts/postbuild.sh packages/mcp-server/package.json README.md
git commit -m "feat(mcp-server): auto-sync dist to ~/.agrune/mcp-server on build

Add postbuild script that copies build output to the local agrune
installation directory and restarts the backend daemon. This eliminates
the manual copy + restart workflow after MCP server changes."
```
