import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/add': 'src/cli/add.ts',
    'cli/types': 'src/cli/types.ts',
    'cli/doctor': 'src/cli/doctor.ts',
    'cli/submit': 'src/cli/submit.ts',
  },
  format: ['esm'],
  clean: true,
  dts: true,
  sourcemap: true,
  target: 'es2022',
})
