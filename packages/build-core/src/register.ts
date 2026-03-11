import manifest, { runtimeOptions } from '@webcli-dom/build-core/manifest'
import { WEBCLI_MANIFEST_UPDATE_EVENT } from './hmr-events'
import { installPageAgentRuntime } from './runtime/page-agent-runtime'

let runtimeHandle = installPageAgentRuntime(manifest, runtimeOptions)

function applyRuntimeUpdate(nextManifest: typeof manifest, nextRuntimeOptions: typeof runtimeOptions): void {
  runtimeHandle.dispose()
  runtimeHandle = installPageAgentRuntime(nextManifest, nextRuntimeOptions)
}

const hot = (
  import.meta as ImportMeta & {
    hot?: {
      accept: (
        dep: string,
        cb: (mod: {
          default: typeof manifest
          runtimeOptions?: typeof runtimeOptions
        }) => void,
      ) => void
      on: (
        event: string,
        cb: (data: {
          manifest?: typeof manifest
          runtimeOptions?: typeof runtimeOptions
        }) => void,
      ) => void
      dispose: (cb: () => void) => void
    }
  }
).hot

if (hot) {
  hot.accept('@webcli-dom/build-core/manifest', mod => {
    const nextManifest = mod?.default ?? manifest
    const nextRuntimeOptions = mod?.runtimeOptions ?? runtimeOptions
    applyRuntimeUpdate(nextManifest, nextRuntimeOptions)
  })

  hot.on(WEBCLI_MANIFEST_UPDATE_EVENT, data => {
    const nextManifest = data?.manifest ?? manifest
    const nextRuntimeOptions = data?.runtimeOptions ?? runtimeOptions
    applyRuntimeUpdate(nextManifest, nextRuntimeOptions)
  })

  hot.dispose(() => {
    runtimeHandle.dispose()
  })
}
