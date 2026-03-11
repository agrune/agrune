import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import webMcpDomPlugin from '@webcli-dom/build-core'

export default defineConfig({
  plugins: [react(), webMcpDomPlugin()],
  server: {
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
  },
})
