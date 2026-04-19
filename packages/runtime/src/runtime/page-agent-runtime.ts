import {
  type CommandResult,
  type DragPlacement,
  type PageSnapshot,
  type AgruneRuntimeConfig,
  mergeRuntimeConfig,
} from '@agrune/core'
import { ActionQueue } from './action-queue'
import { DEFAULT_CURSOR_NAME } from './cursors/index'
import type {
  AgruneManifest,
  AgruneRuntimeOptions,
} from '../types'
import type { ManifestMacro, MacroStep } from '@agrune/manifest'
import { MacroRunner, type MacroResult } from './macro-runner'
import {
  isRelevantSnapshotMutation,
  waitForNextFrame,
} from './dom-utils'
import {
  type MutableSnapshotStore,
  DOM_SETTLE_QUIET_WINDOW_MS,
  DOM_SETTLE_STABLE_FRAMES,
  DOM_SETTLE_TIMEOUT_MS,
  SNAPSHOT_RELEVANT_ATTRIBUTES,
  collectDescriptors,
  makeSnapshot,
} from './snapshot'
import {
  IDLE_TIMEOUT_MS,
  cursorState,
  getOrCreateCursorElement,
  hideAuroraGlow,
  hidePointerOverlay,
  showAuroraGlow,
  showIdlePointerOverlay,
} from './cursor-animator'
import {
  type CommandHandlerDeps,
  type WaitState,
  DEFAULT_OPTIONS,
  handleAct,
  handleDrag,
  handleFill,
  handleGuide,
  handlePointer,
  handleRead,
  handleWait,
  normalizeExecutionConfig,
} from './command-handlers'
import { createCdpClient, type CdpClient } from './cdp-client'
import { createEventSequences, type EventSequences } from './event-sequences'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PageAgentRuntime {
  getSnapshot: () => PageSnapshot
  beginAgentActivity: () => void
  endAgentActivity: () => void
  act: (input: {
    commandId?: string
    targetId: string
    action?: 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'
    expectedVersion?: number
    config?: Partial<AgruneRuntimeConfig>
  }) => Promise<CommandResult>
  drag: (input: {
    commandId?: string
    sourceTargetId: string
    destinationTargetId?: string
    destinationCoords?: { x: number; y: number }
    placement?: DragPlacement
    expectedVersion?: number
    config?: Partial<AgruneRuntimeConfig>
  }) => Promise<CommandResult>
  fill: (input: {
    commandId?: string
    targetId: string
    value: string
    expectedVersion?: number
    config?: Partial<AgruneRuntimeConfig>
  }) => Promise<CommandResult>
  wait: (input: {
    commandId?: string
    targetId: string
    state: WaitState
    timeoutMs?: number
  }) => Promise<CommandResult>
  guide: (input: {
    commandId?: string
    targetId: string
    expectedVersion?: number
    config?: Partial<AgruneRuntimeConfig>
  }) => Promise<CommandResult>
  read: (input: {
    commandId?: string
    selector?: string
    expectedVersion?: number
  }) => Promise<CommandResult>
  pointer: (input: {
    commandId?: string
    targetId?: string
    selector?: string
    coords?: { x: number; y: number }
    actions: Array<
      | { type: 'pointerdown'; x: number; y: number }
      | { type: 'pointermove'; x: number; y: number }
      | { type: 'pointerup'; x: number; y: number }
      | { type: 'wheel'; x: number; y: number; deltaY: number; ctrlKey?: boolean }
    >
  }) => Promise<CommandResult>
  applyConfig: (config: Partial<AgruneRuntimeConfig>) => void
  /** Returns true while a command or agent-driven activity is actively in progress. */
  isBusy: () => boolean
  /** Returns true when visual effects are active (agent busy, queue processing, or idle timer pending). */
  isActive: () => boolean
  runMacro: (input: {
    macroId: string
    params?: Record<string, unknown>
    onStepProgress?: (event: {
      stepIndex: number
      step: MacroStep
      phase: 'start' | 'end' | 'sensitive'
      ok?: boolean
    }) => void
  }) => Promise<MacroResult & { macroId: string; stepCount: number }>
}

export interface PageAgentRuntimeHandle extends PageAgentRuntime {
  dispose: () => void
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const runtimeDisposers = new WeakMap<PageAgentRuntime, () => void>()

interface GlobalRuntimeStore {
  active?: PageAgentRuntimeHandle
}

const GLOBAL_RUNTIME_KEY = '__agrune_page_agent_runtime__'

declare global {
  interface Window {
    agruneDom?: PageAgentRuntime
  }
}

function getGlobalRuntimeStore(): GlobalRuntimeStore {
  const root = globalThis as typeof globalThis & {
    [GLOBAL_RUNTIME_KEY]?: GlobalRuntimeStore
  }
  if (!root[GLOBAL_RUNTIME_KEY]) {
    root[GLOBAL_RUNTIME_KEY] = {}
  }
  return root[GLOBAL_RUNTIME_KEY]
}

// ---------------------------------------------------------------------------
// Runtime factory
// ---------------------------------------------------------------------------

export function createPageAgentRuntime(
  manifest: AgruneManifest,
  options: Partial<AgruneRuntimeOptions> = {},
): PageAgentRuntime {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Page agent runtime requires a browser environment.')
  }

  const runtimeOptions = { ...DEFAULT_OPTIONS, ...options }
  const manifestDescriptors = collectDescriptors(manifest)
  const snapshotStore: MutableSnapshotStore = {
    latest: null,
    signature: null,
    version: 0,
  }
  let lastRelevantDomMutationAt = performance.now()
  let currentConfig = normalizeExecutionConfig(runtimeOptions)
  let agentActivityActive = false
  let activityIdleTimer: ReturnType<typeof setTimeout> | null = null
  const queue = new ActionQueue({ idleTimeoutMs: IDLE_TIMEOUT_MS })
  const mutationObserverRoot = document.body ?? document.documentElement
  const mutationObserver = mutationObserverRoot
    ? new MutationObserver((mutations) => {
        if (mutations.some(isRelevantSnapshotMutation)) {
          lastRelevantDomMutationAt = performance.now()
        }
      })
    : null

  mutationObserver?.observe(mutationObserverRoot, {
    attributes: true,
    attributeFilter: SNAPSHOT_RELEVANT_ATTRIBUTES,
    childList: true,
    subtree: true,
  })

  const getDescriptors = () => manifestDescriptors
  const captureSnapshot = () => makeSnapshot(getDescriptors(), snapshotStore)
  const captureSettledSnapshot = async (minimumFrames: number) => {
    const deadline = performance.now() + DOM_SETTLE_TIMEOUT_MS
    let observedFrames = 0
    let stableFrames = 0

    while (performance.now() < deadline) {
      await waitForNextFrame()
      observedFrames += 1

      if (performance.now() - lastRelevantDomMutationAt >= DOM_SETTLE_QUIET_WINDOW_MS) {
        stableFrames += 1
      } else {
        stableFrames = 0
      }

      if (observedFrames >= minimumFrames && stableFrames >= DOM_SETTLE_STABLE_FRAMES) {
        break
      }
    }

    return captureSnapshot()
  }

  const resolveExecutionConfig = (
    patch?: Partial<AgruneRuntimeConfig>,
  ): AgruneRuntimeConfig => mergeRuntimeConfig(currentConfig, patch)

  const clearActivityIdleTimer = () => {
    if (activityIdleTimer !== null) {
      clearTimeout(activityIdleTimer)
      activityIdleTimer = null
    }
  }

  const syncActiveVisualEffects = () => {
    if (currentConfig.auroraGlow) {
      showAuroraGlow(currentConfig.auroraTheme)
    } else {
      hideAuroraGlow()
    }
    if (currentConfig.pointerAnimation) {
      showIdlePointerOverlay(currentConfig.cursorName ?? DEFAULT_CURSOR_NAME)
    } else {
      hidePointerOverlay()
    }
  }

  const hideVisualEffects = () => {
    hideAuroraGlow()
    hidePointerOverlay()
  }

  queue.onActivate = () => {
    clearActivityIdleTimer()
    syncActiveVisualEffects()
  }

  queue.onDeactivate = () => {
    if (!agentActivityActive) {
      scheduleActivityHide()
    }
  }

  const scheduleActivityHide = () => {
    clearActivityIdleTimer()
    activityIdleTimer = setTimeout(() => {
      activityIdleTimer = null
      if (!agentActivityActive && !queue.active) {
        hideVisualEffects()
      }
    }, IDLE_TIMEOUT_MS)
  }

  // CDP event sequences — required; cdpPostMessage must be provided
  if (!runtimeOptions.cdpPostMessage) {
    throw new Error('Page agent runtime requires cdpPostMessage to be provided.')
  }
  const cdpClient: CdpClient = createCdpClient(runtimeOptions.cdpPostMessage)
  const eventSequences: EventSequences = createEventSequences(cdpClient)

  const deps: CommandHandlerDeps = {
    captureSnapshot,
    captureSettledSnapshot,
    getDescriptors,
    resolveExecutionConfig,
    queue,
    eventSequences,
  }

  // macroId → MacroRunner 캐시: 세션 범위에서 consecutiveFailures 유지 (MACRO-04)
  const macroRunners = new Map<string, MacroRunner>()

  const runMacro: PageAgentRuntime['runMacro'] = async ({
    macroId,
    params = {},
    onStepProgress,
  }) => {
    // manifest 에서 매크로 찾기
    const macro = manifest.macros?.find((m: ManifestMacro) => m.macroId === macroId)
    if (!macro) {
      return {
        status: 'step-error',
        stepIndex: -1,
        error: `macro not found: ${macroId}`,
        macroId,
        stepCount: 0,
      }
    }

    // MacroRunner 캐시 조회 or 신규 생성
    let runner = macroRunners.get(macroId)
    if (!runner) {
      runner = new MacroRunner({
        commandHandlerDeps: deps,
        onStepStart: onStepProgress
          ? (i, step) => onStepProgress({ stepIndex: i, step, phase: 'start' })
          : undefined,
        onStepEnd: onStepProgress
          ? (i, step, ok) => onStepProgress({ stepIndex: i, step, phase: 'end', ok })
          : undefined,
        onSensitiveStep: onStepProgress
          ? (i, step) => onStepProgress({ stepIndex: i, step, phase: 'sensitive' })
          : undefined,
      })
      macroRunners.set(macroId, runner)
    } else if (onStepProgress) {
      // 기존 캐시된 runner 에 새 콜백을 반영하기 위해 deps 업데이트가 불가하므로
      // onStepProgress 가 있을 때는 래퍼만 사용 (consecutiveFailures 는 runner 에 보존)
      // 실제로 MacroRunner 콜백은 생성 시 고정이므로 진행 이벤트는 runner 교체 없이
      // 동일 runner 를 재사용 — onStepProgress 는 최초 생성 시에만 연결됨.
      // 간단 구현: 최초 생성 시 onStepProgress 없이 만들어진 runner 에 콜백 없음.
      // Task 14-03 (MCP layer) 이 CommandBroker 를 통해 이벤트를 브로드캐스트할 예정.
    }

    const result = await runner.run(macro, params)
    return { ...result, macroId, stepCount: macro.steps.length }
  }

  const runtime: PageAgentRuntime = {
    getSnapshot: captureSnapshot,

    beginAgentActivity: () => {
      agentActivityActive = true
      clearActivityIdleTimer()
      syncActiveVisualEffects()
    },

    endAgentActivity: () => {
      agentActivityActive = false
      if (!queue.active) {
        scheduleActivityHide()
      }
    },

    act: async input => handleAct(deps, input),

    drag: async input => handleDrag(deps, input),

    fill: async input => handleFill(deps, input),

    wait: async input => handleWait(deps, input),

    guide: async input => handleGuide(deps, input),

    read: async input => handleRead(deps, input),

    pointer: async input => handlePointer(deps, input),

    applyConfig: (config: Partial<AgruneRuntimeConfig>) => {
      currentConfig = mergeRuntimeConfig(currentConfig, config)
      if (config.cursorName && cursorState && config.cursorName !== cursorState.cursorName) {
        getOrCreateCursorElement(config.cursorName)
      }
      if (queue.active || agentActivityActive) {
        syncActiveVisualEffects()
      }
    },

    isBusy: () => agentActivityActive || queue.active,
    isActive: () => agentActivityActive || queue.active || activityIdleTimer !== null,

    runMacro,
  }

  runtimeDisposers.set(runtime, () => {
    clearActivityIdleTimer()
    mutationObserver?.disconnect()
    queue.dispose()
    cdpClient.dispose()
    // MacroRunner 타이머 leak 방지 (T-14-13)
    macroRunners.forEach(r => r.dispose())
    macroRunners.clear()
  })

  return runtime
}

// ---------------------------------------------------------------------------
// Global install / retrieve
// ---------------------------------------------------------------------------

export function getInstalledPageAgentRuntime(): PageAgentRuntimeHandle | null {
  return getGlobalRuntimeStore().active ?? null
}

export function installPageAgentRuntime(
  manifest: AgruneManifest,
  options: Partial<AgruneRuntimeOptions> = {},
): PageAgentRuntimeHandle {
  const runtime = createPageAgentRuntime(manifest, options)
  const globalStore = getGlobalRuntimeStore()
  globalStore.active?.dispose()

  const handle: PageAgentRuntimeHandle = {
    ...runtime,
    dispose() {
      runtimeDisposers.get(runtime)?.()
      runtimeDisposers.delete(runtime)
      hideAuroraGlow()
      hidePointerOverlay()
      const current = getGlobalRuntimeStore()
      if (current.active === handle) {
        current.active = undefined
      }
      if (typeof window !== 'undefined' && window.agruneDom === runtime) {
        delete window.agruneDom
      }
    },
  }

  globalStore.active = handle
  window.agruneDom = runtime
  return handle
}
