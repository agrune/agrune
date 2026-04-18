import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'annotation-lint': 'src/annotation-lint/index.ts',
    'annotation-lint-vite-plugin': 'src/annotation-lint/vite-plugin.ts',
  },
  format: ['esm'],
  clean: true,
  dts: true,
  sourcemap: true,
  target: 'es2022',
})
