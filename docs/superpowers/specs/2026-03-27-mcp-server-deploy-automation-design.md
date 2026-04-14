# MCP 서버 배포 자동화 설계

## 배경

`pnpm build`만으로는 MCP 서버 변경사항이 `~/.agrune/mcp-server/`에 반영되지 않는다. 현재는 수동으로 `cp -r packages/mcp/dist/* ~/.agrune/mcp-server/` + 백엔드 데몬 재시작이 필요하다.

## 목표

- `pnpm build` 한 번으로 MCP 서버 변경이 로컬 환경에 즉시 반영되도록 한다.
- 백엔드 데몬도 자동 재시작되어 수동 개입이 필요 없게 한다.
- 다른 개발자가 README를 보고 따라할 수 있도록 문서화한다.

## 설계

### postbuild 스크립트 (`packages/mcp/package.json`)

`tsup` 빌드 완료 후 실행되는 `postbuild` 스크립트를 추가한다.

**동작:**

1. `~/.agrune/mcp-server/` 디렉토리 존재 여부 확인
   - 없으면 (agrune 미설치 상태) 스킵하고 종료
2. 존재하면 아래 파일을 복사:
   - `dist/` → `~/.agrune/mcp-server/dist/`
   - `bin/` → `~/.agrune/mcp-server/bin/`
   - `package.json` → `~/.agrune/mcp-server/package.json`
3. 포트 47654에서 실행 중인 백엔드 데몬 프로세스를 kill
   - `lsof -ti tcp:47654 | xargs kill 2>/dev/null || true`
   - 다음 MCP 요청 시 lazy spawn으로 자동 재시작됨

**미설치 환경 안전:** `~/.agrune/mcp-server/`가 없으면 아무 작업도 하지 않으므로, CI나 최초 클론 시에도 빌드가 깨지지 않는다.

### README 업데이트

`agrune/README.md`의 "MCP 서버 개발 모드" 섹션을 보강한다:

- `pnpm build` 시 자동으로 `~/.agrune/mcp-server/`에 반영 + 데몬 재시작됨을 설명
- 사전 조건: `agrune setup`으로 초기 설치가 되어있어야 함

## 동작 흐름

```
pnpm build
  → tsup (MCP 서버 빌드)
  → postbuild 스크립트
    → ~/.agrune/mcp-server/ 존재 확인
    → 존재: dist, bin, package.json 복사
    → 포트 47654 프로세스 kill (없으면 무시)
  → 다음 MCP 요청 시 데몬 자동 재시작
```

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `packages/mcp/package.json` | `postbuild` 스크립트 추가 |
| `agrune/README.md` | "MCP 서버 개발 모드" 섹션 보강 |

## 검증

1. `pnpm build` 실행 후 `~/.agrune/mcp-server/dist/`에 최신 빌드가 복사되었는지 확인
2. 빌드 후 기존 데몬이 kill되었는지 확인 (포트 47654 리슨 프로세스 없음)
3. Claude Code에서 MCP 도구 호출 시 새 데몬이 자동 시작되고 변경사항이 반영되는지 확인
4. `~/.agrune/mcp-server/`가 없는 환경에서 `pnpm build`가 정상 완료되는지 확인
