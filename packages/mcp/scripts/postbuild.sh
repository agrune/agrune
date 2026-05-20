#!/bin/sh
# postbuild.sh — runtime assets required by the bundled MCP server.

# quick mode가 page runtime 번들을 직접 읽을 수 있도록 server dist에 함께 넣는다.
RUNTIME_BUNDLE="../runtime/dist/page-runtime.global.js"
if [ -f "$RUNTIME_BUNDLE" ]; then
  cp "$RUNTIME_BUNDLE" dist/page-runtime.global.js
  cp "$RUNTIME_BUNDLE" dist/bin/page-runtime.global.js
fi

rm -rf dist/devtools-dist

echo "[postbuild] Prepared MCP bundle assets."
