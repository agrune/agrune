import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/register.ts',
    'src/runtime/index.ts',
    'src/vite.ts',
    'src/rollup.ts',
    'src/webpack.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: [
    'virtual:webcli-dom/manifest',
    'webcli-dom/manifest',
    '@webcli-dom/build-core/manifest',
  ],
})
