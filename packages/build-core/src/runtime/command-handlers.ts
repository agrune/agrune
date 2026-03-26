import {
  type CommandResult,
  type PageSnapshot,
  type AgagruneRuntimeConfig,
  mergeRuntimeConfig,
} from '@agrune/core'
import type { AgagruneRuntimeOptions } from '../types'
import {
  type PointerCoords,
  isElementInViewport,
  isEnabled,
  isFillableElement,
  isTopmostInteractable,
  isVisible,
  smoothScrollIntoView,
} from './dom-utils'
import {
  type ActionKind,
  type MutableSnapshotStore,
  type TargetDescriptor,
  ACT_COMPATIBLE_KINDS,
  buildErrorResult,
  buildFlowBlockedResult,
  buildSuccessResult,
  captureTarget,
  findSnapshotTarget,
  isOverlayFlowLocked,
  parseRuntimeTargetId,
  resolveRuntimeTarget,
} from './snapshot'
import { DEFAULT_CURSOR_NAME } from './cursors/index'
import { flashPointerOverlay } from './cursor-animator'
import type { ActionQueue } from './action-queue'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_OPTIONS: AgagruneRuntimeOptions = {
  clickAutoScroll: true,
  clickRetryCount: 2,
  clickRetryDelayMs: 120,
}

export const DEFAULT_EXECUTION_CONFIG: AgagruneRuntimeConfig = {
  autoScroll: true,
  clickDelayMs: 0,
  pointerDurationMs: 600,
  pointerAnimation: false,
  cursorName: DEFAULT_CURSOR_NAME,
  auroraGlow: true,
  auroraTheme: 'dark',
}

export type WaitState = 'visible' | 'hidden' | 'enabled' | 'disabled'

export const MAX_READ_CHARS = 50_000

export const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function normalizeExecutionConfig(
  runtimeOptions: AgagruneRuntimeOptions,
  next?: Partial<AgagruneRuntimeConfig>,
): AgagruneRuntimeConfig {
  return mergeRuntimeConfig(
    {
      ...DEFAULT_EXECUTION_CONFIG,
      autoScroll: runtimeOptions.clickAutoScroll,
    },
    next,
  )
}

// ---------------------------------------------------------------------------
// Read utilities
// ---------------------------------------------------------------------------

export function isVisibleForRead(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none') return false
  if (style.visibility === 'hidden') return false
  if (style.opacity === '0') return false
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return false
  return true
}

export function domToMarkdown(root: Element): string {
  const parts: string[] = []
  walkNode(root, parts, 0)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function walkNode(node: Node, parts: string[], listDepth: number): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, ' ') ?? ''
    if (text.trim()) parts.push(text)
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as Element
  if (!isVisibleForRead(el)) return

  const tag = el.tagName

  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    const text = el.textContent?.trim() ?? ''
    if (text) parts.push(`\n\n${'#'.repeat(level)} ${text}\n\n`)
    return
  }

  if (tag === 'P') {
    parts.push('\n\n')
    Array.from(el.childNodes).forEach(child => walkNode(child, parts, listDepth))
    parts.push('\n\n')
    return
  }

  if (tag === 'UL' || tag === 'OL') {
    parts.push('\n')
    let index = 1
    Array.from(el.children).forEach(child => {
      if (child.tagName === 'LI') {
        const indent = '  '.repeat(listDepth)
        const bullet = tag === 'UL' ? '- ' : `${index++}. `
        parts.push(`${indent}${bullet}`)
        Array.from(child.childNodes).forEach(liChild => walkNode(liChild, parts, listDepth + 1))
        parts.push('\n')
      }
    })
    parts.push('\n')
    return
  }

  if (tag === 'TABLE') {
    const rows = el.querySelectorAll('tr')
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('th, td')
      const cellTexts = Array.from(cells).map(c => c.textContent?.trim() ?? '')
      parts.push(`| ${cellTexts.join(' | ')} |\n`)
      if (rowIndex === 0) {
        parts.push(`| ${cellTexts.map(() => '---').join(' | ')} |\n`)
      }
    })
    parts.push('\n')
    return
  }

  if (tag === 'A') {
    const href = (el as HTMLAnchorElement).href
    const text = el.textContent?.trim() ?? ''
    if (text) parts.push(`[${text}](${href})`)
    return
  }

  if (tag === 'IMG') {
    const alt = el.getAttribute('alt') ?? ''
    const src = (el as HTMLImageElement).src
    parts.push(`![${alt}](${src})`)
    return
  }

  if (tag === 'STRONG' || tag === 'B') {
    parts.push('**')
    Array.from(el.childNodes).forEach(child => walkNode(child, parts, listDepth))
    parts.push('**')
    return
  }
  if (tag === 'EM' || tag === 'I') {
    parts.push('*')
    Array.from(el.childNodes).forEach(child => walkNode(child, parts, listDepth))
    parts.push('*')
    return
  }

  if (tag === 'CODE') {
    const parent = el.parentElement
    if (parent?.tagName === 'PRE') {
      parts.push(`\n\n\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n\n`)
      return
    }
    parts.push(`\`${el.textContent?.trim() ?? ''}\``)
    return
  }
  if (tag === 'PRE') {
    const codeChild = el.querySelector('code')
    if (codeChild) {
      walkNode(codeChild, parts, listDepth)
      return
    }
    parts.push(`\n\n\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n\n`)
    return
  }

  if (tag === 'INPUT') {
    const input = el as HTMLInputElement
    parts.push(`[input: ${input.value || input.placeholder || ''}]`)
    return
  }
  if (tag === 'SELECT') {
    const select = el as HTMLSelectElement
    const selected = select.options[select.selectedIndex]
    parts.push(`[select: ${selected?.text ?? ''}]`)
    return
  }
  if (tag === 'TEXTAREA') {
    const textarea = el as HTMLTextAreaElement
    parts.push(`[textarea: ${textarea.value || textarea.placeholder || ''}]`)
    return
  }

  if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'MAIN' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'NAV' || tag === 'ASIDE') {
    parts.push('\n')
    Array.from(el.childNodes).forEach(child => walkNode(child, parts, listDepth))
    parts.push('\n')
    return
  }

  if (tag === 'BR') {
    parts.push('\n')
    return
  }

  if (tag === 'HR') {
    parts.push('\n\n---\n\n')
    return
  }

  Array.from(el.childNodes).forEach(child => walkNode(child, parts, listDepth))
}

// ---------------------------------------------------------------------------
// Fill utility
// ---------------------------------------------------------------------------

export function setElementValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  element.focus()
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(element, value)
  } else {
    element.value = value
  }
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

// ---------------------------------------------------------------------------
// Runtime dependency bag — passed from createPageAgentRuntime to handlers
// ---------------------------------------------------------------------------

export interface CommandHandlerDeps {
  captureSnapshot: () => PageSnapshot
  captureSettledSnapshot: (minimumFrames: number) => Promise<PageSnapshot>
  getDescriptors: () => TargetDescriptor[]
  resolveExecutionConfig: (patch?: Partial<AgagruneRuntimeConfig>) => AgagruneRuntimeConfig
  queue: ActionQueue
}

// ---------------------------------------------------------------------------
// withDescriptor — shared target resolution helper
// ---------------------------------------------------------------------------

export async function withDescriptor(
  deps: CommandHandlerDeps,
  commandId: string,
  targetId: string,
  expectedVersion: number | undefined,
  effect: (
    descriptor: TargetDescriptor,
    element: HTMLElement,
    snapshot: PageSnapshot,
  ) => Promise<CommandResult>,
): Promise<CommandResult> {
  const currentSnapshot = deps.captureSnapshot()
  if (
    typeof expectedVersion === 'number' &&
    Number.isFinite(expectedVersion) &&
    expectedVersion !== currentSnapshot.version
  ) {
    return buildErrorResult(
      commandId,
      'STALE_SNAPSHOT',
      `snapshot version mismatch: expected ${expectedVersion}, received ${currentSnapshot.version}`,
      currentSnapshot,
      targetId,
    )
  }

  const resolvedTarget = resolveRuntimeTarget(deps.getDescriptors(), targetId)
  if (!resolvedTarget) {
    return buildErrorResult(commandId, 'TARGET_NOT_FOUND', `target not found: ${targetId}`, currentSnapshot, targetId)
  }

  return effect(resolvedTarget.descriptor, resolvedTarget.element, currentSnapshot)
}

// ---------------------------------------------------------------------------
// wait handler
// ---------------------------------------------------------------------------

export async function handleWait(
  deps: CommandHandlerDeps,
  input: {
    commandId?: string
    targetId: string
    state: WaitState
    timeoutMs?: number
  },
): Promise<CommandResult> {
  const timeoutMs =
    typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? input.timeoutMs : 5_000
  const startedAt = Date.now()
  const { baseTargetId } = parseRuntimeTargetId(input.targetId)
  const descriptor = deps.getDescriptors().find(entry => entry.target.targetId === baseTargetId)

  if (!descriptor) {
    const snapshot = deps.captureSnapshot()
    return buildErrorResult(
      input.commandId ?? input.targetId,
      'TARGET_NOT_FOUND',
      `target not found: ${input.targetId}`,
      snapshot,
      input.targetId,
    )
  }

  for (;;) {
    const snapshot = deps.captureSnapshot()
    const resolvedTarget = resolveRuntimeTarget(deps.getDescriptors(), input.targetId)
    if (!resolvedTarget) {
      return buildErrorResult(
        input.commandId ?? input.targetId,
        'TARGET_NOT_FOUND',
        `target not found: ${input.targetId}`,
        snapshot,
        input.targetId,
      )
    }
    const target = captureTarget(descriptor, resolvedTarget.element, resolvedTarget.targetId)

    const matched =
      (input.state === 'visible' && target.visible) ||
      (input.state === 'hidden' && !target.visible) ||
      (input.state === 'enabled' && target.enabled) ||
      (input.state === 'disabled' && !target.enabled)

    if (matched) {
      return buildSuccessResult(input.commandId ?? input.targetId, snapshot, {
        state: input.state,
        targetId: input.targetId,
      })
    }

    if (Date.now() - startedAt >= timeoutMs) {
      return buildErrorResult(
        input.commandId ?? input.targetId,
        'TIMEOUT',
        `wait timed out for ${input.targetId} (${input.state})`,
        snapshot,
        input.targetId,
      )
    }

    await sleep(50)
  }
}

// ---------------------------------------------------------------------------
// read handler
// ---------------------------------------------------------------------------

export async function handleRead(
  deps: CommandHandlerDeps,
  input: {
    commandId?: string
    selector?: string
    expectedVersion?: number
  },
): Promise<CommandResult> {
  const root = input.selector
    ? document.querySelector(input.selector)
    : document.body

  if (!root) {
    const snapshot = deps.captureSnapshot()
    return buildErrorResult(
      input.commandId ?? 'read',
      'TARGET_NOT_FOUND',
      `selector not found: ${input.selector}`,
      snapshot,
    )
  }

  await deps.captureSettledSnapshot(1)
  const fullMarkdown = domToMarkdown(root)
  const truncated = fullMarkdown.length > MAX_READ_CHARS
  const markdown = truncated
    ? fullMarkdown.slice(0, MAX_READ_CHARS) + '\n\n[truncated — use selector to read specific sections]'
    : fullMarkdown

  const snapshot = deps.captureSnapshot()
  return buildSuccessResult(input.commandId ?? 'read', snapshot, {
    markdown,
    truncated,
    charCount: fullMarkdown.length,
  })
}

// ---------------------------------------------------------------------------
// fill handler
// ---------------------------------------------------------------------------

export async function handleFill(
  deps: CommandHandlerDeps,
  input: {
    commandId?: string
    targetId: string
    value: string
    expectedVersion?: number
    config?: Partial<AgagruneRuntimeConfig>
  },
): Promise<CommandResult> {
  return withDescriptor(deps, input.commandId ?? input.targetId, input.targetId, input.expectedVersion, async (descriptor, element, snapshot) => {
    const snapshotTarget = findSnapshotTarget(snapshot, input.targetId)
    if (snapshotTarget && isOverlayFlowLocked(snapshot) && !snapshotTarget.overlay) {
      return buildFlowBlockedResult(input.commandId ?? input.targetId, snapshot, input.targetId)
    }

    if (!descriptor.actionKinds.includes('fill')) {
      return buildErrorResult(input.commandId ?? input.targetId, 'INVALID_TARGET', `target does not support fill: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
    }
    if (!isFillableElement(element)) {
      return buildErrorResult(input.commandId ?? input.targetId, 'INVALID_TARGET', `target is not fillable: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
    }
    if (!isVisible(element)) {
      return buildErrorResult(input.commandId ?? input.targetId, 'NOT_VISIBLE', `target is not visible: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
    }

    const config = deps.resolveExecutionConfig(input.config)
    await smoothScrollIntoView(element)

    if (!isElementInViewport(element)) {
      return buildErrorResult(input.commandId ?? input.targetId, 'NOT_VISIBLE', `target is outside of viewport: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
    }
    if (!isTopmostInteractable(element)) {
      return buildErrorResult(input.commandId ?? input.targetId, 'NOT_VISIBLE', `target is covered by another element: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
    }
    if (!isEnabled(element)) {
      return buildErrorResult(input.commandId ?? input.targetId, 'DISABLED', `target is disabled: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
    }

    if (config.clickDelayMs > 0) {
      await sleep(config.clickDelayMs)
    }

    if (config.pointerAnimation) {
      await deps.queue.push({
        type: 'animation',
        execute: () => flashPointerOverlay(element, config, () => setElementValue(element, input.value)),
      })
    } else {
      setElementValue(element, input.value)
    }
    const nextSnapshot = await deps.captureSettledSnapshot(2)
    return buildSuccessResult(input.commandId ?? input.targetId, nextSnapshot, {
      actionKind: 'fill',
      targetId: input.targetId,
      value: input.value,
    })
  })
}
