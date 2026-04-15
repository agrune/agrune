#!/bin/sh
# postbuild.sh — dist를 canonical runtime dir에만 동기화하고 데몬을 재시작한다.

# quick mode가 page runtime 번들을 직접 읽을 수 있도록 server dist에 함께 넣는다.
RUNTIME_BUNDLE="../runtime/dist/page-runtime.global.js"
if [ -f "$RUNTIME_BUNDLE" ]; then
  cp "$RUNTIME_BUNDLE" dist/page-runtime.global.js
  cp "$RUNTIME_BUNDLE" dist/bin/page-runtime.global.js
fi

# devtools 웹 앱을 번들에 포함 (글로벌 링크에서도 동작하도록)
DEVTOOLS_DIST="../devtools/dist"
if [ -d "$DEVTOOLS_DIST" ]; then
  rm -rf dist/devtools-dist
  mkdir -p dist/devtools-dist
  cp -r "$DEVTOOLS_DIST"/* dist/devtools-dist/
fi

# Canonical runtime location.
# 외부 하네스 어댑터 저장소는 이 빌드 단계에서 건드리지 않는다.
NATIVE_HOST_DIR="$HOME/.agrune/mcp-server"

if [ -d "$NATIVE_HOST_DIR" ]; then
  rm -rf "$NATIVE_HOST_DIR"/*
  cp -r dist/* "$NATIVE_HOST_DIR"/
  echo "[postbuild] Synced dist → $NATIVE_HOST_DIR"
else
  echo "[postbuild] $NATIVE_HOST_DIR not found, skipping runtime sync."
fi

# 다음 MCP 요청 시 자동 재시작되도록 백엔드 데몬 종료.
lsof -ti tcp:47654 | xargs kill 2>/dev/null && \
  echo "[postbuild] Killed backend daemon on port 47654." || \
  echo "[postbuild] No running daemon found."
