import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { WebCliCompiledTarget, WebCliManifest } from '../types'
import { WEBCLI_MANIFEST_UPDATE_EVENT } from '../hmr-events'
import { compileSource } from './compiler'
import type { ResolvedWebCliDomOptions } from './options'

interface ViteWebSocketLike {
  send: (payload: { type: 'custom'; event: string; data: unknown }) => void
}

interface ViteServerLike {
  ws: ViteWebSocketLike
}

interface ViteHotUpdateContextLike {
  file: string
  modules: any[]
}

interface CreateViteHmrBridgeInput {
  options: ResolvedWebCliDomOptions
  shouldHandleFile: (id: string) => boolean
  toCurrentManifest: () => WebCliManifest
  updateEntries: (
    relativePath: string,
    nextEntries: WebCliCompiledTarget[],
  ) => { changed: boolean }
}

export interface ViteHmrBridge {
  configureServer: (server: unknown) => void
  handleHotUpdate: (ctx: ViteHotUpdateContextLike) => Promise<any[] | undefined>
  emitManifestUpdate: () => void
}

// TODO(webcli-dom): webpack/rollup용 HMR 브리지를 동일 계약으로 추가한다.
export function createViteHmrBridge(input: CreateViteHmrBridgeInput): ViteHmrBridge {
  let viteServer: ViteServerLike | undefined

  const emitManifestUpdate = (): void => {
    if (!viteServer) return
    viteServer.ws.send({
      type: 'custom',
      event: WEBCLI_MANIFEST_UPDATE_EVENT,
      data: {
        manifest: input.toCurrentManifest(),
        runtimeOptions: input.options.click,
      },
    })
  }

  return {
    configureServer(server) {
      viteServer = server as ViteServerLike
    },

    async handleHotUpdate(ctx) {
      if (!input.shouldHandleFile(ctx.file)) return

      const relativePath = path.relative(process.cwd(), ctx.file)
      let nextEntries: WebCliCompiledTarget[] = []

      try {
        const code = await fs.readFile(ctx.file, 'utf8')
        const result = compileSource(code, relativePath, input.options, true)
        nextEntries = result.entries
      } catch {
        // 파일 삭제/읽기 실패 시 기존 엔트리 제거
      }

      const { changed } = input.updateEntries(relativePath, nextEntries)
      if (!changed) return

      emitManifestUpdate()
      return ctx.modules
    },

    emitManifestUpdate,
  }
}
