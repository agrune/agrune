import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'bin/agrune.ts'],
  format: ['esm'],
  clean: true,
  dts: true,
  sourcemap: true,
  target: 'es2022',
  external: ['playwright', 'ws'],
  noExternal: ['@agrune/core', '@agrune/manifest'],
})
