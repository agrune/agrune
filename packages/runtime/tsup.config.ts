import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    clean: true,
    sourcemap: true,
    target: 'es2022',
    dts: true,
  },
  {
    entry: { 'visual-runtime': 'src/visual-runtime.ts' },
    format: ['iife'],
    clean: false,
    sourcemap: true,
    target: 'es2022',
    noExternal: [/.*/],
    globalName: '__agrune_visual__',
  },
])
