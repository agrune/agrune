import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  entry: {
    'bin/agrune': 'bin/agrune.ts',
    'src/program': 'src/program.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  external: ['playwright', 'playwright-core'],
  define: {
    __AGRUNE_CLI_VERSION__: JSON.stringify(pkg.version),
  },
})
