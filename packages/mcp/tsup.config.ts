import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
// Bundled CJS dependencies still call require() for Node builtins from ESM output.
const esmRequireBanner = [
  'import { createRequire as __agruneCreateRequire } from "node:module";',
  'const require = __agruneCreateRequire(import.meta.url);',
].join('\n')

export default defineConfig({
  entry: ['src/index.ts', 'bin/agrune-mcp.ts'],
  format: ['esm'],
  clean: true,
  dts: true,
  sourcemap: true,
  target: 'es2022',
  // Bundle everything except @playwright/* and playwright-core which use native
  // binaries and CJS internals (chromium-bidi) that esbuild cannot resolve.
  // These are resolved at runtime from node_modules instead.
  external: [/^@playwright(\/.*)?$/, /^playwright(\/.*)?$/, /^playwright-core(\/.*)?$/, /^chromium-bidi(\/.*)?$/],
  noExternal: [/^(?!@playwright|playwright|chromium-bidi).*/],
  banner: {
    js: esmRequireBanner,
  },
  define: {
    __MCP_SERVER_VERSION__: JSON.stringify(pkg.version),
  },
})
