import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import webCliDomPlugin from '@webcli-dom/build-core'
import path from 'path'

export default defineConfig({
  plugins: [webCliDomPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: ['localhost', '127.0.0.1'],
  },
})
