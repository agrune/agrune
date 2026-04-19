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
    // ts-morph (added in Phase 16-03) depends on CJS `__filename`/`__dirname`
    // and `require` at runtime for its TypeScript compiler host. `tsup` emits
    // ESM, so we shim all three via an `import.meta.url` → `fileURLToPath`
    // prelude. Keep this banner in sync with every file emitted by tsup.
    js: [
      "import { createRequire as __agruneCreateRequire } from 'module';",
      "import { fileURLToPath as __agruneFileURLToPath } from 'url';",
      "import { dirname as __agruneDirname } from 'path';",
      'const require = __agruneCreateRequire(import.meta.url);',
      'const __filename = __agruneFileURLToPath(import.meta.url);',
      'const __dirname = __agruneDirname(__filename);',
    ].join(' '),
  },
})
