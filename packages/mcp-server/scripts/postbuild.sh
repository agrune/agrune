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
