import type { WebMcpCompiledTarget, WebMcpManifest } from '../types'
import type { ResolvedWebMcpDomOptions } from './options'
import { buildManifest } from './manifest-builder'

export interface ManifestStore {
  clear: () => void
  setEntries: (relativePath: string, nextEntries: WebMcpCompiledTarget[]) => void
  updateEntries: (
    relativePath: string,
    nextEntries: WebMcpCompiledTarget[],
  ) => { changed: boolean }
  toManifest: () => WebMcpManifest
}

export function createManifestStore(options: ResolvedWebMcpDomOptions): ManifestStore {
  const entriesByFile = new Map<string, WebMcpCompiledTarget[]>()

  const writeEntries = (
    relativePath: string,
    nextEntries: WebMcpCompiledTarget[],
  ): void => {
    if (nextEntries.length > 0) {
      entriesByFile.set(relativePath, nextEntries)
      return
    }

    entriesByFile.delete(relativePath)
  }

  return {
    clear() {
      entriesByFile.clear()
    },

    setEntries(relativePath, nextEntries) {
      writeEntries(relativePath, nextEntries)
    },

    updateEntries(relativePath, nextEntries) {
      const prev = entriesByFile.get(relativePath)
      const prevSerialized = prev ? JSON.stringify(prev) : ''
      const nextSerialized = nextEntries.length > 0 ? JSON.stringify(nextEntries) : ''

      writeEntries(relativePath, nextEntries)

      return { changed: prevSerialized !== nextSerialized }
    },

    toManifest() {
      const entries = Array.from(entriesByFile.values()).flat()
      return buildManifest(entries, options)
    },
  }
}
