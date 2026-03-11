import { createUnplugin } from 'unplugin'
import picomatch from 'picomatch'
import fg from 'fast-glob'
import { promises as fs, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { WebMcpDomPluginOptions } from '../types'
import { compileSource } from './compiler'
import {
  reportCompileDiagnostics,
  reportDuplicateToolDiagnostics,
} from './diagnostic-reporter'
import { createManifestStore } from './manifest-store'
import { resolveOptions } from './options'
import { createViteHmrBridge } from './vite-hmr'

const VIRTUAL_MANIFEST_ID = 'virtual:webcli-dom/manifest'
const COMPAT_MANIFEST_ID = 'webcli-dom/manifest'
const PACKAGE_MANIFEST_ID = '@webcli-dom/build-core/manifest'
const RESOLVED_VIRTUAL_MANIFEST_ID = 'webcli-dom:manifest'

export const webCliDomUnplugin = createUnplugin<WebMcpDomPluginOptions | undefined>(
  (rawOptions, meta) => {
    const options = resolveOptions(rawOptions)
    const manifestStore = createManifestStore(options)
    const matchers = options.include.map(pattern => picomatch(pattern))
    const ignoreMatchers = options.exclude.map(pattern => picomatch(pattern))
    const webpackOutputDir = (meta as { webpack?: { compiler?: { options?: { output?: { path?: string } } } } }).webpack?.compiler?.options?.output?.path
    const webpackVirtualManifestId = path.join(
      os.tmpdir(),
      `webcli-dom-manifest-${process.pid}.js`,
    )

    const shouldHandleFile = (id: string): boolean => {
      if (id.includes('\0')) return false
      const cleanId = id.split('?')[0]
      if (ignoreMatchers.some(isMatch => isMatch(cleanId))) return false
      return matchers.some(isMatch => isMatch(cleanId))
    }

    const viteHmr = createViteHmrBridge({
      options,
      shouldHandleFile,
      toCurrentManifest: () => manifestStore.toManifest(),
      updateEntries: (relativePath, nextEntries) =>
        manifestStore.updateEntries(relativePath, nextEntries),
    })

    return {
      name: 'webcli-dom',
      enforce: 'pre',

      async buildStart() {
        manifestStore.clear()

        const files = await fg(options.include, {
          ignore: options.exclude,
          absolute: true,
          cwd: process.cwd(),
        })

        for (const file of files) {
          try {
            const code = await fs.readFile(file, 'utf8')
            const relativePath = path.relative(process.cwd(), file)
            const result = compileSource(code, relativePath, options, false)
            if (result.entries.length > 0) {
              manifestStore.setEntries(relativePath, result.entries)
            }
          } catch {
            // pre-scan best effort
          }
        }
      },

      resolveId(id) {
        if (
          id === VIRTUAL_MANIFEST_ID ||
          id === COMPAT_MANIFEST_ID ||
          id === PACKAGE_MANIFEST_ID
        ) {
          if (meta.framework === 'webpack') {
            if (!existsSync(webpackVirtualManifestId)) {
              writeFileSync(webpackVirtualManifestId, 'export default {};\n', 'utf8')
            }
            return webpackVirtualManifestId
          }
          return RESOLVED_VIRTUAL_MANIFEST_ID
        }
        return null
      },

      load(id) {
        if (id !== RESOLVED_VIRTUAL_MANIFEST_ID && id !== webpackVirtualManifestId) {
          return null
        }
        return [
          `export const runtimeOptions = ${JSON.stringify(options.click, null, 2)};`,
          `export default ${JSON.stringify(manifestStore.toManifest(), null, 2)};`,
        ].join('\n')
      },

      transform(this: any, code, id) {
        const cleanId = id.split('?')[0]
        if (!shouldHandleFile(cleanId)) return null

        const relativePath = path.relative(process.cwd(), cleanId)
        const result = compileSource(
          code,
          relativePath,
          options,
          Boolean(this.meta?.watchMode),
        )

        const { changed: entriesChanged } = manifestStore.updateEntries(
          relativePath,
          result.entries,
        )

        reportCompileDiagnostics(this, result.diagnostics, options.strict)

        if (!result.changed) return null

        if (Boolean(this.meta?.watchMode) && entriesChanged) {
          viteHmr.emitManifestUpdate()
        }

        return {
          code: result.code,
          map: null,
        }
      },

      // TODO(webcli-dom): webpack/rollup dev 훅도 adapter bridge로 동일 패턴 적용.
      vite: {
        configureServer(server) {
          viteHmr.configureServer(server)
        },

        async handleHotUpdate(ctx) {
          return viteHmr.handleHotUpdate(ctx)
        },
      },

      generateBundle(this: any) {
        const manifest = manifestStore.toManifest()
        if (reportDuplicateToolDiagnostics(this, manifest)) return

        this.emitFile({
          type: 'asset',
          fileName: options.manifestFile,
          source: JSON.stringify(manifest, null, 2),
        })
      },

      async writeBundle() {
        if (meta.framework !== 'webpack') return
        if (!webpackOutputDir) return
        const manifest = manifestStore.toManifest()
        await fs.mkdir(webpackOutputDir, { recursive: true })
        await fs.writeFile(
          path.join(webpackOutputDir, options.manifestFile),
          JSON.stringify(manifest, null, 2),
          'utf8',
        )
      },
    }
  },
)

export default webCliDomUnplugin
