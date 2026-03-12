import type { WebCliCompiledTarget, WebCliManifest } from '../types'
import type { ResolvedWebCliDomOptions } from './options'
import { buildManifest } from './manifest-builder'

export interface ManifestStore {
  clear: () => void
  setEntries: (relativePath: string, nextEntries: WebCliCompiledTarget[]) => void
  updateEntries: (
    relativePath: string,
    nextEntries: WebCliCompiledTarget[],
  ) => { changed: boolean }
  toManifest: () => WebCliManifest
}

export function createManifestStore(options: ResolvedWebCliDomOptions): ManifestStore {
  const entriesByFile = new Map<string, WebCliCompiledTarget[]>()

  const writeEntries = (
    relativePath: string,
    nextEntries: WebCliCompiledTarget[],
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
