import { defineConfig } from 'vite'
import { resolve } from 'path'
import { build } from 'vite'

// page-runtime needs IIFE format (injected via <script> tag into main world)
// Other entries need ES module format (Chrome Extension standard)
export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        'content': resolve(__dirname, 'src/content/index.ts'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'popup': resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'es',
      },
    },
  },
  plugins: [
    {
      name: 'build-page-runtime-iife',
      closeBundle: async () => {
        await build({
          configFile: false,
          build: {
            outDir: resolve(__dirname, 'dist'),
            emptyOutDir: false,
            lib: {
              entry: resolve(__dirname, 'src/runtime/page-runtime.ts'),
              name: 'webcliPageRuntime',
              formats: ['iife'],
              fileName: () => 'page-runtime.js',
            },
            rollupOptions: {
              output: {
                inlineDynamicImports: true,
              },
            },
          },
        })
      },
    },
  ],
})
