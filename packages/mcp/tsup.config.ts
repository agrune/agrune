import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  entry: ['src/index.ts', 'src/devtools-server.ts', 'bin/agrune-mcp.ts'],
  format: ['esm'],
  clean: true,
  dts: true,
  sourcemap: true,
  target: 'es2022',
  // Bundle everything except @playwright/* and playwright-core which use native
  // binaries and CJS internals (chromium-bidi) that esbuild cannot resolve.
  // These are resolved at runtime from node_modules instead.
  noExternal: [/^(?!@playwright|playwright|chromium-bidi).*/],
  define: {
    __MCP_SERVER_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
})
