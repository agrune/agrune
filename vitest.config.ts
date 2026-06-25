import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Browser-backed tests launch chromium and need a generous timeout.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
