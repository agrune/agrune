import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

function agruneAnnotationLint(): Plugin {
  return {
    name: 'agrune-annotation-lint',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[jt]sx$/.test(id)) return null
      if (!code.includes('data-agrune-action')) return null

      const errors: string[] = []
      const lines = code.split('\n')

      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('data-agrune-action')) continue
        const ctx = lines.slice(i, Math.min(i + 10, lines.length)).join(' ')
        const el = ctx.slice(0, (ctx.indexOf('>') + 1) || undefined)

        if (!el.includes('data-agrune-name')) errors.push(`line ${i + 1}: missing data-agrune-name`)
        if (!el.includes('data-agrune-desc')) errors.push(`line ${i + 1}: missing data-agrune-desc`)
      }

      if (errors.length > 0) this.error(`[agrune-lint] ${id}\n${errors.map(e => `  - ${e}`).join('\n')}`)
      return null
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), agruneAnnotationLint()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: ['localhost', '127.0.0.1'],
  },
})
