import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  entry: { 'bin/agrune': 'bin/agrune.ts' },
  outDir: 'dist',
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'es2022',
  noExternal: [/.*/],
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
})
