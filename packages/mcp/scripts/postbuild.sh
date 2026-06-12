#!/bin/sh
# postbuild.sh — runtime assets required by the bundled MCP server.

# Visual-effects bundle (cursor/aurora decoration) injected by the Playwright
# backend. Copied next to the server entry so the loader can resolve it.
VISUAL_BUNDLE="../runtime/dist/visual-runtime.global.js"
if [ -f "$VISUAL_BUNDLE" ]; then
  cp "$VISUAL_BUNDLE" dist/visual-runtime.global.js
  cp "$VISUAL_BUNDLE" dist/bin/visual-runtime.global.js
fi

rm -rf dist/devtools-dist

echo "[postbuild] Prepared MCP bundle assets."
