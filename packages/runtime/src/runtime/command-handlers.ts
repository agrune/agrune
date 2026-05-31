import {
  type CommandResult,
  type DragPlacement,
  type PageSnapshot,
  type AgruneRuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
  mergeRuntimeConfig,
} from '@agrune/core'
import type { ActionKind, AgruneRuntimeOptions } from '../types'
import {
  type PointerCoords,
  canReceiveTextInput,
  getElementCenter,
  getDragPlacementCoords,
  getInteractablePoint,
  isContentEditableElement,
  isElementInViewport,
  isEnabled,
  isFillableElement,
  isTopmostInteractable,
  isVisible,
  smoothScrollIntoView,
} from './dom-utils'
import {
  type MutableSnapshotStore,
  type TargetDescriptor,
  ACT_COMPATIBLE_KINDS,
  buildErrorResult,
  buildFlowBlockedResult,
  buildSuccessResult,
  captureTarget,
  findElements,
  findSnapshotTarget,
  isOverlayFlowLocked,
  parseRuntimeTargetId,
  resolveRuntimeTarget,
} from './snapshot'
import { DEFAULT_CURSOR_NAME } from './cursors/index'
import {
  animateWithRAF,
  easeOutCubic,
  flashPointerOverlay,
  getOrCreateCursorElement,
  getCursorStartPosition,
  getCursorTranslatePosition,
  setCursorTransform,
  applyCursorPressStyle,
  removeCursorPressStyle,
  waitForCursorTransition,
  triggerCursorClick,
  saveCursorPosition,
  resolvePointerDurationMs,
  CURSOR_CLICK_PRESS_MS,
} from './cursor-animator'
import { getCursorMeta } from './cursors/index'
import type { EventSequences, Coords } from './event-sequences'
import type { ActionQueue } from './action-queue'

type ClickButton = 'left' | 'middle' | 'right'
type ClickModifier = 'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_OPTIONS: AgruneRuntimeOptions = {
  clickAutoScroll: true,
  clickRetryCount: 2,
  clickRetryDelayMs: 120,
}

export const DEFAULT_EXECUTION_CONFIG: AgruneRuntimeConfig = {
  ...DEFAULT_RUNTIME_CONFIG,
}

export type WaitState = 'visible' | 'hidden' | 'enabled' | 'disabled'

export const MAX_READ_CHARS = 50_000

export const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG',
])

// ---------------------------------------------------------------------------
// Constants — drag
// ---------------------------------------------------------------------------

const DRAG_MOVE_STEPS = 12

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Convert PointerCoords (clientX/clientY) to event-sequences Coords (x/y) */
function toCoords(pc: PointerCoords): Coords {
  return { x: pc.clientX, y: pc.clientY }
}

/** requestAnimationFrame as a promise — one-frame sync */
function raf(): Promise<void> {
  return new Promise(r => requestAnimationFrame(() => r()))
}

export function normalizeExecutionConfig(
  runtimeOptions: AgruneRuntimeOptions,
  next?: Partial<AgruneRuntimeConfig>,
): AgruneRuntimeConfig {
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

// legacy DOM setter path — retained for strategy='dom-setter' fallback and
// <select> elements (which do not accept CDP Input domain text input).
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

// Heuristic detection of masked inputs (tel/card-number/etc) that need
// per-character keystroke dispatch so the masking library's keydown/beforeinput
// listeners can reformat between characters.
function detectMaskedInput(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement)) return false
  const type = element.type
  if (type === 'tel') return true
  const inputMode = element.getAttribute('inputmode')
  const pattern = element.getAttribute('pattern')
  if ((inputMode === 'tel' || inputMode === 'numeric') && pattern) return true
  if (element.className && /\b(cleave|masked|imask)\b/i.test(element.className)) {
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Runtime dependency bag — passed from createPageAgentRuntime to handlers
// ---------------------------------------------------------------------------

export interface CommandHandlerDeps {
  captureSnapshot: () => PageSnapshot
  captureSettledSnapshot: (minimumFrames: number) => Promise<PageSnapshot>
  getDescriptors: () => TargetDescriptor[]
  resolveExecutionConfig: (patch?: Partial<AgruneRuntimeConfig>) => AgruneRuntimeConfig
  queue: ActionQueue
  eventSequences: EventSequences
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

  const descriptors = deps.getDescriptors()
  const resolvedTarget = resolveRuntimeTarget(descriptors, targetId)
  if (!resolvedTarget) {
    const lookupDetails = manifestTargetLookupDetails(descriptors, targetId)
    // Phase 15-03: repeat key 기반 lookup 실패 → REPEAT_INDEX_OUT_OF_RANGE
    const parsed = parseRuntimeTargetId(targetId)
    if (parsed.repeatId && parsed.repeatKey) {
      return buildErrorResult(
        commandId,
        'REPEAT_INDEX_OUT_OF_RANGE',
        `repeat "${parsed.repeatId}": key "${parsed.repeatKey}" not found in current snapshot.`,
        currentSnapshot,
        targetId,
        lookupDetails,
      )
    }
    return buildErrorResult(commandId, 'TARGET_NOT_FOUND', `target not found: ${targetId}`, currentSnapshot, targetId, lookupDetails)
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
    targetId?: string
    state?: WaitState
    text?: string
    textGone?: string
    timeMs?: number
    timeoutMs?: number
  },
): Promise<CommandResult> {
  const modeCount = [
    typeof input.targetId === 'string' && input.targetId.length > 0,
    typeof input.text === 'string' && input.text.length > 0,
    typeof input.textGone === 'string' && input.textGone.length > 0,
    typeof input.timeMs === 'number',
  ].filter(Boolean).length
  if (modeCount !== 1) {
    const snapshot = deps.captureSnapshot()
    return buildErrorResult(
      input.commandId ?? 'wait',
      'INVALID_COMMAND',
      'wait requires exactly one of: targetId, text, textGone, timeMs',
      snapshot,
    )
  }

  if (typeof input.timeMs === 'number') {
    if (input.timeMs < 0) {
      const snapshot = deps.captureSnapshot()
      return buildErrorResult(input.commandId ?? 'wait:time', 'INVALID_COMMAND', 'timeMs must be non-negative', snapshot)
    }
    await sleep(input.timeMs)
    return buildSuccessResult(input.commandId ?? 'wait:time', deps.captureSnapshot(), {
      timeMs: input.timeMs,
    })
  }

  const timeoutMs =
    typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? input.timeoutMs : 5_000
  const startedAt = Date.now()
  if (typeof input.text === 'string') {
    return waitForTextMatch(deps, input.commandId ?? 'wait:text', input.text, true, startedAt, timeoutMs)
  }
  if (typeof input.textGone === 'string') {
    return waitForTextMatch(deps, input.commandId ?? 'wait:textGone', input.textGone, false, startedAt, timeoutMs)
  }

  if (typeof input.targetId !== 'string' || typeof input.state !== 'string') {
    const snapshot = deps.captureSnapshot()
    return buildErrorResult(
      input.commandId ?? 'wait',
      'INVALID_COMMAND',
      'target waits require targetId and state',
      snapshot,
    )
  }

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

async function waitForTextMatch(
  deps: CommandHandlerDeps,
  commandId: string,
  text: string,
  shouldExist: boolean,
  startedAt: number,
  timeoutMs: number,
): Promise<CommandResult> {
  for (;;) {
    const snapshot = deps.captureSnapshot()
    const found = visibleDocumentText().includes(text)
    if (found === shouldExist) {
      return buildSuccessResult(commandId, snapshot, shouldExist ? { text } : { textGone: text })
    }

    if (Date.now() - startedAt >= timeoutMs) {
      return buildErrorResult(
        commandId,
        'TIMEOUT',
        shouldExist ? `wait timed out for text: ${text}` : `wait timed out for text to disappear: ${text}`,
        snapshot,
      )
    }

    await sleep(50)
  }
}

function visibleDocumentText(): string {
  const root = document.body
  if (!root) return ''
  const parts: string[] = []

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '')
      return
    }
    if (!(node instanceof Element)) return
    const style = window.getComputedStyle(node)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      node.getAttribute('aria-hidden') === 'true'
    ) {
      return
    }
    for (const child of node.childNodes) visit(child)
  }

  visit(root)
  return parts.join(' ')
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
    clear?: boolean
    strategy?: 'insert' | 'keystroke' | 'auto' | 'dom-setter'
    expectedVersion?: number
    config?: Partial<AgruneRuntimeConfig>
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
    if (!canReceiveTextInput(element)) {
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

    // <select> elements can only be set via the DOM value setter path.
    if (element instanceof HTMLSelectElement) {
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
    }

    // All other text-receiving elements go through the CDP Input domain.
    const clear = input.clear ?? true
    const requestedStrategy = input.strategy ?? 'auto'
    const isContentEditable = isContentEditableElement(element)
    const isMasked = element instanceof HTMLElement && detectMaskedInput(element)
    const strategy: 'insert' | 'keystroke' | 'dom-setter' =
      requestedStrategy === 'auto'
        ? isMasked ? 'keystroke' : 'insert'
        : requestedStrategy

    const performFill = async (): Promise<void> => {
      try {
        ;(element as HTMLElement).focus({ preventScroll: true })
      } catch {
        ;(element as HTMLElement).focus()
      }
      // Headless Chrome can drop focus — retry once before bailing silently.
      if (document.activeElement !== element && !isContentEditable) {
        ;(element as HTMLElement).focus()
      }

      if (isContentEditable) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(element)
        selection?.removeAllRanges()
        selection?.addRange(range)
        if (!clear) {
          selection?.collapseToEnd()
        }
      } else if (clear) {
        await deps.eventSequences.selectAllAndDelete()
      }

      if (strategy === 'dom-setter') {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          setElementValue(element, input.value)
        }
        return
      }

      if (strategy === 'keystroke') {
        await deps.eventSequences.typeText(input.value)
        return
      }

      // strategy === 'insert'
      await deps.eventSequences.insertText(input.value)
    }

    if (config.pointerAnimation) {
      await deps.queue.push({
        type: 'animation',
        execute: () => flashPointerOverlay(element, config, performFill),
      })
    } else {
      await performFill()
    }

    const nextSnapshot = await deps.captureSettledSnapshot(2)
    return buildSuccessResult(input.commandId ?? input.targetId, nextSnapshot, {
      actionKind: 'fill',
      targetId: input.targetId,
      value: input.value,
    })
  })
}

// ---------------------------------------------------------------------------
// CDP cursor-animated click orchestration
//
// Animates cursor to the target, then at the "press" moment fires a CDP
// event sequence.
// ---------------------------------------------------------------------------

async function animateCursorThenCdpAction(
  element: HTMLElement,
  cursorName: string,
  durationMs: number,
  cdpAction: (coords: Coords) => Promise<void>,
): Promise<void> {
  const animationDurationMs = resolvePointerDurationMs(durationMs)
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element

  const interactablePoint = getInteractablePoint(element)
  const { x: endX, y: endY } = getCursorTranslatePosition(interactablePoint, meta)
  const { x: startX, y: startY } = getCursorStartPosition(state)

  el.style.display = 'block'
  setCursorTransform(el, startX, startY)

  // Animate cursor travel to target
  await animateWithRAF(animationDurationMs, raw => {
    const t = easeOutCubic(raw)
    const cx = startX + (endX - startX) * t
    const cy = startY + (endY - startY) * t
    setCursorTransform(el, cx, cy)
  })

  // Press down: cursor shrinks
  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`
  setCursorTransform(el, endX, endY, 0.85)
  await waitForCursorTransition(el)

  // Cursor fully pressed — fire ripple + CDP event at the impact moment
  triggerCursorClick(el)
  await cdpAction(toCoords(interactablePoint))

  // Release
  setCursorTransform(el, endX, endY, 1)
  await waitForCursorTransition(el)
  el.style.transition = ''

  saveCursorPosition(state, endX, endY)
}

// ---------------------------------------------------------------------------
// CDP cursor-animated drag orchestration
// ---------------------------------------------------------------------------

function interpolateDragSteps(
  src: PointerCoords,
  dst: PointerCoords,
  steps: number,
): Coords[] {
  const result: Coords[] = []
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps
    result.push({
      x: src.clientX + (dst.clientX - src.clientX) * progress,
      y: src.clientY + (dst.clientY - src.clientY) * progress,
    })
  }
  return result
}

async function animateCursorDragWithCdp(
  sourceElement: HTMLElement,
  srcCoords: PointerCoords,
  dstCoords: PointerCoords,
  cursorName: string,
  durationMs: number,
  eventSeq: EventSequences,
): Promise<void> {
  const animationDurationMs = resolvePointerDurationMs(durationMs)
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element

  const { x: srcX, y: srcY } = getCursorTranslatePosition(srcCoords, meta)
  const { x: dstX, y: dstY } = getCursorTranslatePosition(dstCoords, meta)
  const { x: startX, y: startY } = getCursorStartPosition(state)

  el.style.display = 'block'
  setCursorTransform(el, startX, startY)

  // Phase 1: Animate cursor to source position
  await animateWithRAF(animationDurationMs, raw => {
    const t = easeOutCubic(raw)
    const cx = startX + (srcX - startX) * t
    const cy = startY + (srcY - startY) * t
    setCursorTransform(el, cx, cy)
  })

  // Press down
  applyCursorPressStyle(el)
  setCursorTransform(el, srcX, srcY, 0.85)
  await waitForCursorTransition(el)

  // CDP: hover source → press (hover ensures correct target resolution)
  await eventSeq.mouseMoved(toCoords(srcCoords))
  await eventSeq.mousePressed(toCoords(srcCoords))
  // Wait one frame for framework drag-state initialisation
  await raf()

  // Phase 2: Animate drag movement with interleaved CDP mouseMoved
  el.style.transition = ''
  const steps = interpolateDragSteps(srcCoords, dstCoords, DRAG_MOVE_STEPS)
  for (const step of steps) {
    const { x: cx, y: cy } = getCursorTranslatePosition(
      { clientX: step.x, clientY: step.y },
      meta,
    )
    setCursorTransform(el, cx, cy, 0.85)
    await eventSeq.mouseMoved(step, 1)
    await raf()
  }

  // CDP mouse release
  await eventSeq.mouseReleased(toCoords(dstCoords))

  // Release cursor visual
  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-out`
  setCursorTransform(el, dstX, dstY, 1)
  await waitForCursorTransition(el)
  removeCursorPressStyle(el)

  saveCursorPosition(state, dstX, dstY)
}

async function animateCursorHtmlDragWithCdp(
  srcCoords: PointerCoords,
  dstCoords: PointerCoords,
  cursorName: string,
  durationMs: number,
  eventSeq: EventSequences,
): Promise<void> {
  const animationDurationMs = resolvePointerDurationMs(durationMs)
  const meta = getCursorMeta(cursorName)
  const state = getOrCreateCursorElement(cursorName)
  const el = state.element

  const { x: srcX, y: srcY } = getCursorTranslatePosition(srcCoords, meta)
  const { x: dstX, y: dstY } = getCursorTranslatePosition(dstCoords, meta)
  const { x: startX, y: startY } = getCursorStartPosition(state)

  el.style.display = 'block'
  setCursorTransform(el, startX, startY)

  // Phase 1: Animate cursor to source position
  await animateWithRAF(animationDurationMs, raw => {
    const t = easeOutCubic(raw)
    const cx = startX + (srcX - startX) * t
    const cy = startY + (srcY - startY) * t
    setCursorTransform(el, cx, cy)
  })

  // Press down
  applyCursorPressStyle(el)
  setCursorTransform(el, srcX, srcY, 0.85)
  await waitForCursorTransition(el)

  // CDP htmlDrag does all the event work
  await eventSeq.htmlDrag(toCoords(srcCoords), toCoords(dstCoords))

  // Phase 2: Animate cursor to destination (visual only — CDP drag is done)
  el.style.transition = ''
  await animateWithRAF(animationDurationMs, raw => {
    const t = raw
    const cx = srcX + (dstX - srcX) * t
    const cy = srcY + (dstY - srcY) * t
    setCursorTransform(el, cx, cy, 0.85)
  })

  // Release cursor visual
  el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-out`
  setCursorTransform(el, dstX, dstY, 1)
  await waitForCursorTransition(el)
  removeCursorPressStyle(el)

  saveCursorPosition(state, dstX, dstY)
}

// ---------------------------------------------------------------------------
// act handler
// ---------------------------------------------------------------------------

export async function handleAct(
  deps: CommandHandlerDeps,
  input: {
    commandId?: string
    targetId: string
    action?: 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'
    button?: ClickButton
    doubleClick?: boolean
    modifiers?: ClickModifier[]
    expectedVersion?: number
    config?: Partial<AgruneRuntimeConfig>
  },
): Promise<CommandResult> {
  return withDescriptor(deps, input.commandId ?? input.targetId, input.targetId, input.expectedVersion, async (descriptor, element, snapshot) => {
    const snapshotTarget = findSnapshotTarget(snapshot, input.targetId)
    if (snapshotTarget && isOverlayFlowLocked(snapshot) && !snapshotTarget.overlay) {
      return buildFlowBlockedResult(input.commandId ?? input.targetId, snapshot, input.targetId)
    }

    if (!descriptor.actionKinds.some(k => ACT_COMPATIBLE_KINDS.has(k))) {
      return buildErrorResult(input.commandId ?? input.targetId, 'INVALID_TARGET', `target does not support act: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
    }

    const action = input.doubleClick === true && (input.action === undefined || input.action === 'click')
      ? 'dblclick'
      : input.action ?? 'click'

    if (!descriptor.actionKinds.includes(action as ActionKind)) {
      return buildErrorResult(input.commandId ?? input.targetId, 'INVALID_TARGET', `target does not support action "${action}": ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId)
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

    const coords = toCoords(getInteractablePoint(element))
    const mouseOptions = {
      ...(input.button ? { button: input.button } : {}),
      ...(input.modifiers ? { modifiers: clickModifiersToCdp(input.modifiers) } : {}),
    }

    const cdpActionForType = (c: Coords): Promise<void> => {
      switch (action) {
        case 'click': return deps.eventSequences.click(c, mouseOptions)
        case 'dblclick': return deps.eventSequences.dblclick(c, mouseOptions)
        case 'contextmenu': return deps.eventSequences.contextmenu(c, mouseOptions)
        case 'hover': return deps.eventSequences.hover(c)
        case 'longpress': return deps.eventSequences.longpress(c)
      }
    }

    if (config.pointerAnimation) {
      await deps.queue.push({
        type: 'animation',
        execute: () =>
          animateCursorThenCdpAction(
            element,
            config.cursorName ?? DEFAULT_CURSOR_NAME,
            config.pointerDurationMs,
            cdpActionForType,
          ),
      })
    } else {
      await cdpActionForType(coords)
    }

    const nextSnapshot = await deps.captureSettledSnapshot(2)
    return buildSuccessResult(input.commandId ?? input.targetId, nextSnapshot, {
      actionKind: action,
      targetId: input.targetId,
      ...(input.button ? { button: input.button } : {}),
      ...(input.modifiers ? { modifiers: input.modifiers } : {}),
    })
  })
}

function clickModifiersToCdp(modifiers: ClickModifier[]): number {
  let mask = 0
  for (const modifier of modifiers) {
    switch (modifier) {
      case 'Alt':
        mask |= 1
        break
      case 'Control':
        mask |= 2
        break
      case 'Meta':
        mask |= 4
        break
      case 'Shift':
        mask |= 8
        break
      case 'ControlOrMeta':
        mask |= navigator.platform.toLowerCase().includes('mac') ? 4 : 2
        break
    }
  }
  return mask
}

// ---------------------------------------------------------------------------
// target lookup helpers
// ---------------------------------------------------------------------------

function findTargetIdForElement(
  descriptors: TargetDescriptor[],
  element: HTMLElement,
): string | null {
  for (const d of descriptors) {
    const elements = findElements(d)
    if (elements.includes(element)) return d.target.targetId
  }
  return null
}

function manifestTargetLookupDetails(
  descriptors: TargetDescriptor[],
  targetId: string,
): Record<string, unknown> {
  const parsed = parseRuntimeTargetId(targetId)
  if (parsed.repeatId && parsed.repeatKey) {
    const exactDescriptor = descriptors.find(descriptor =>
      descriptor.repeatInstance?.repeatId === parsed.repeatId &&
      descriptor.repeatInstance?.key === parsed.repeatKey &&
      descriptor.target.targetId === parsed.baseTargetId,
    )
    const repeatTargetDeclared = descriptors.some(descriptor =>
      descriptor.repeatInstance?.repeatId === parsed.repeatId &&
      descriptor.target.targetId === parsed.baseTargetId,
    )
    return {
      baseTargetId: parsed.baseTargetId,
      manifestTarget: exactDescriptor != null || repeatTargetDeclared,
      repeatId: parsed.repeatId,
      repeatKey: parsed.repeatKey,
      targetLookup: exactDescriptor
        ? 'selector-unresolved'
        : repeatTargetDeclared
          ? 'repeat-key-missing'
          : 'not-declared',
    }
  }

  const descriptor = descriptors.find(entry =>
    entry.target.targetId === parsed.baseTargetId &&
    entry.repeatInstance == null,
  )
  return {
    baseTargetId: parsed.baseTargetId,
    manifestTarget: descriptor != null,
    targetLookup: descriptor ? 'selector-unresolved' : 'not-declared',
  }
}

function buildMovedTarget(
  element: HTMLElement,
  targetId: string,
): Record<string, unknown> {
  const domRect = element.getBoundingClientRect()
  const cx = domRect.left + domRect.width / 2
  const cy = domRect.top + domRect.height / 2
  return {
    targetId,
    center: { x: Math.round(cx), y: Math.round(cy) },
    size: { w: Math.round(domRect.width), h: Math.round(domRect.height) },
    coordSpace: 'viewport',
  }
}

// ---------------------------------------------------------------------------
// drag handler
// ---------------------------------------------------------------------------

export async function handleDrag(
  deps: CommandHandlerDeps,
  input: {
    commandId?: string
    sourceTargetId: string
    destinationTargetId?: string
    destinationCoords?: { x: number; y: number }
    placement?: DragPlacement
    expectedVersion?: number
    config?: Partial<AgruneRuntimeConfig>
  },
): Promise<CommandResult> {
  return withDescriptor(
    deps,
    input.commandId ?? input.sourceTargetId,
    input.sourceTargetId,
    input.expectedVersion,
    async (sourceDescriptor, sourceElement, snapshot) => {
      const sourceSnapshotTarget = findSnapshotTarget(snapshot, input.sourceTargetId)

      const hasTargetId = input.destinationTargetId != null
      const hasCoords = input.destinationCoords != null

      if (hasTargetId === hasCoords) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'INVALID_COMMAND',
          hasTargetId
            ? 'Cannot specify both destinationTargetId and destinationCoords'
            : 'Must specify either destinationTargetId or destinationCoords',
          snapshot,
          input.sourceTargetId,
        )
      }

      if (hasTargetId && input.sourceTargetId === input.destinationTargetId) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'INVALID_COMMAND',
          'sourceTargetId and destinationTargetId must be different',
          snapshot,
          input.sourceTargetId,
        )
      }

      if (hasCoords && input.placement != null) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'INVALID_COMMAND',
          'placement cannot be used with destinationCoords',
          snapshot,
          input.sourceTargetId,
        )
      }

      if (
        isOverlayFlowLocked(snapshot) &&
        !sourceSnapshotTarget?.overlay
      ) {
        return buildFlowBlockedResult(
          input.commandId ?? input.sourceTargetId,
          snapshot,
          input.sourceTargetId,
        )
      }

      if (!isVisible(sourceElement)) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'NOT_VISIBLE',
          `target is not visible: ${sourceDescriptor.target.targetId}`,
          snapshot,
          sourceDescriptor.target.targetId,
        )
      }

      const config = deps.resolveExecutionConfig(input.config)
      await smoothScrollIntoView(sourceElement)

      if (!isElementInViewport(sourceElement)) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'NOT_VISIBLE',
          `target is outside of viewport: ${sourceDescriptor.target.targetId}`,
          snapshot,
          sourceDescriptor.target.targetId,
        )
      }
      if (!isTopmostInteractable(sourceElement)) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'NOT_VISIBLE',
          `target is covered by another element: ${sourceDescriptor.target.targetId}`,
          snapshot,
          sourceDescriptor.target.targetId,
        )
      }
      if (!isEnabled(sourceElement)) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'DISABLED',
          `target is disabled: ${sourceDescriptor.target.targetId}`,
          snapshot,
          sourceDescriptor.target.targetId,
        )
      }

      if (config.clickDelayMs > 0) {
        await sleep(config.clickDelayMs)
      }

      // --- Branch: coordinate-based drag ---
      if (hasCoords) {
        // --- Resolve relativeTo to absolute viewport coords ---
        // Phase 17 REMOVE-01: canvas coord-space lookup 제거됨. 모든 coord 는
        // viewport 기준이며, relativeTo 는 ref 요소의 viewport center + dx/dy.
        if (input.destinationCoords && 'relativeTo' in input.destinationCoords) {
          const relCoords = input.destinationCoords as unknown as { relativeTo: string; dx: number; dy: number }
          const refDescriptor = resolveRuntimeTarget(deps.getDescriptors(), relCoords.relativeTo)
          if (!refDescriptor) {
            return buildErrorResult(
              input.commandId ?? input.sourceTargetId,
              'TARGET_NOT_FOUND',
              `relativeTo target not found: ${relCoords.relativeTo}`,
              snapshot,
              relCoords.relativeTo,
            )
          }
          const refRect = refDescriptor.element.getBoundingClientRect()
          const refCx = refRect.left + refRect.width / 2
          const refCy = refRect.top + refRect.height / 2
          input.destinationCoords = {
            x: Math.round(refCx + relCoords.dx),
            y: Math.round(refCy + relCoords.dy),
          }
        }

        const srcCoords = getElementCenter(sourceElement)
        const destCoords: PointerCoords = {
          clientX: input.destinationCoords!.x,
          clientY: input.destinationCoords!.y,
        }

        // Capture source viewport position before drag for no-move detection
        const srcDomRect = sourceElement.getBoundingClientRect()
        const srcVpCenter = {
          x: Math.round(srcDomRect.left + srcDomRect.width / 2),
          y: Math.round(srcDomRect.top + srcDomRect.height / 2),
        }

        if (config.pointerAnimation) {
          await deps.queue.push({
            type: 'animation',
            execute: () =>
              animateCursorDragWithCdp(
                sourceElement,
                srcCoords,
                destCoords,
                config.cursorName ?? DEFAULT_CURSOR_NAME,
                config.pointerDurationMs,
                deps.eventSequences,
              ),
          })
        } else {
          const steps = interpolateDragSteps(srcCoords, destCoords, DRAG_MOVE_STEPS)
          await deps.eventSequences.pointerDrag(toCoords(srcCoords), toCoords(destCoords), steps)
        }

        const nextSnapshot = await deps.captureSettledSnapshot(2)

        // Re-resolve source element — the DOM node may have been replaced during
        // the drag (e.g. React re-render).  Fall back to the original reference if
        // resolution fails, but flag it as potentially stale.
        const freshSource = resolveRuntimeTarget(deps.getDescriptors(), input.sourceTargetId)
        const movedElement = freshSource?.element ?? sourceElement
        const movedTarget = buildMovedTarget(movedElement, input.sourceTargetId)

        // Check if the node actually moved (within 5px tolerance)
        const movedCenter = movedTarget.center as { x: number; y: number } | undefined
        const destX = input.destinationCoords!.x

        // Detect stale element (detached from DOM after re-render) — treat as
        // no-move because getBoundingClientRect returns zeros for detached nodes.
        const elementStale = !movedElement.isConnected

        if (
          elementStale ||
          (movedCenter &&
            Math.abs(movedCenter.x - destX) > 20 &&
            Math.abs(movedCenter.x - srcVpCenter.x) < 5 &&
            Math.abs(movedCenter.y - srcVpCenter.y) < 5)
        ) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            'NOT_VISIBLE',
            'Node did not move. It may be blocked by an overlapping element. Try moving nearby nodes at the same position first.',
            nextSnapshot,
            input.sourceTargetId,
          )
        }

        return buildSuccessResult(input.commandId ?? input.sourceTargetId, nextSnapshot, {
          actionKind: 'drag',
          sourceTargetId: input.sourceTargetId,
          destinationCoords: input.destinationCoords,
          movedTarget,
        })
      }

      // --- Branch: target-based drag ---
      const destinationTarget = resolveRuntimeTarget(deps.getDescriptors(), input.destinationTargetId!)
      if (!destinationTarget) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'TARGET_NOT_FOUND',
          `target not found: ${input.destinationTargetId}`,
          snapshot,
          input.destinationTargetId!,
        )
      }

      const destinationDescriptor = destinationTarget.descriptor
      const destinationElement = destinationTarget.element
      const destinationSnapshotTarget = findSnapshotTarget(snapshot, input.destinationTargetId!)

      if (
        isOverlayFlowLocked(snapshot) &&
        !destinationSnapshotTarget?.overlay
      ) {
        return buildFlowBlockedResult(
          input.commandId ?? input.sourceTargetId,
          snapshot,
          input.destinationTargetId!,
        )
      }

      await smoothScrollIntoView(destinationElement)
      const placement = input.placement ?? 'inside'

      if (!isVisible(destinationElement)) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'NOT_VISIBLE',
          `target is not visible: ${destinationDescriptor.target.targetId}`,
          snapshot,
          destinationDescriptor.target.targetId,
        )
      }
      if (!isElementInViewport(destinationElement)) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'NOT_VISIBLE',
          `target is outside of viewport: ${destinationDescriptor.target.targetId}`,
          snapshot,
          destinationDescriptor.target.targetId,
        )
      }
      if (!isTopmostInteractable(destinationElement)) {
        return buildErrorResult(
          input.commandId ?? input.sourceTargetId,
          'NOT_VISIBLE',
          `target is covered by another element: ${destinationDescriptor.target.targetId}`,
          snapshot,
          destinationDescriptor.target.targetId,
        )
      }

      {
        const srcCoords = getElementCenter(sourceElement)
        const dstCoords = getDragPlacementCoords(destinationElement, placement)
        const isHtmlDrag = sourceElement.draggable

        if (config.pointerAnimation) {
          await deps.queue.push({
            type: 'animation',
            execute: () =>
              isHtmlDrag
                ? animateCursorHtmlDragWithCdp(
                    srcCoords,
                    dstCoords,
                    config.cursorName ?? DEFAULT_CURSOR_NAME,
                    config.pointerDurationMs,
                    deps.eventSequences,
                  )
                : animateCursorDragWithCdp(
                    sourceElement,
                    srcCoords,
                    dstCoords,
                    config.cursorName ?? DEFAULT_CURSOR_NAME,
                    config.pointerDurationMs,
                    deps.eventSequences,
                  ),
          })
        } else if (isHtmlDrag) {
          await deps.eventSequences.htmlDrag(toCoords(srcCoords), toCoords(dstCoords))
        } else {
          const steps = interpolateDragSteps(srcCoords, dstCoords, DRAG_MOVE_STEPS)
          await deps.eventSequences.pointerDrag(toCoords(srcCoords), toCoords(dstCoords), steps)
        }
      }

      const nextSnapshot = await deps.captureSettledSnapshot(2)
      return buildSuccessResult(input.commandId ?? input.sourceTargetId, nextSnapshot, {
        actionKind: 'drag',
        destinationTargetId: input.destinationTargetId,
        placement,
        sourceTargetId: input.sourceTargetId,
      })
    },
  )
}

// ---------------------------------------------------------------------------
// wheel steps expansion
// ---------------------------------------------------------------------------

type WheelAction = { type: 'wheel'; x: number; y: number; deltaY: number; ctrlKey?: boolean; delayMs?: number; steps?: number; durationMs?: number }

export function expandWheelSteps(action: WheelAction): Array<{ type: 'wheel'; x: number; y: number; deltaY: number; ctrlKey?: boolean; delayMs?: number }> {
  const steps = action.steps
  if (steps == null || steps <= 1) {
    const { steps: _, durationMs: __, ...rest } = action
    return [rest]
  }
  const perStep = action.deltaY / steps
  const intervalMs = action.durationMs != null ? action.durationMs / steps : 0
  const result: Array<{ type: 'wheel'; x: number; y: number; deltaY: number; ctrlKey?: boolean; delayMs?: number }> = []
  for (let i = 0; i < steps; i++) {
    const isLast = i === steps - 1
    const entry: { type: 'wheel'; x: number; y: number; deltaY: number; ctrlKey?: boolean; delayMs?: number } = {
      type: 'wheel',
      x: action.x,
      y: action.y,
      deltaY: perStep,
    }
    if (action.ctrlKey) entry.ctrlKey = action.ctrlKey
    if (!isLast && intervalMs > 0) {
      entry.delayMs = intervalMs
    } else if (isLast && action.delayMs != null) {
      entry.delayMs = action.delayMs
    }
    result.push(entry)
  }
  return result
}

// ---------------------------------------------------------------------------
// pointer handler
// ---------------------------------------------------------------------------

export async function handlePointer(
  deps: CommandHandlerDeps,
  input: {
    commandId?: string
    targetId?: string
    selector?: string
    coords?: { x: number; y: number }
    actions: Array<
      | { type: 'pointerdown'; x: number; y: number; delayMs?: number }
      | { type: 'pointermove'; x: number; y: number; delayMs?: number }
      | { type: 'pointerup'; x: number; y: number; delayMs?: number }
      | { type: 'wheel'; x: number; y: number; deltaY: number; ctrlKey?: boolean; delayMs?: number; steps?: number; durationMs?: number }
    >
  },
): Promise<CommandResult> {
  const commandId = input.commandId ?? 'pointer'

  let element: HTMLElement | null = null

  if (input.targetId) {
    const target = resolveRuntimeTarget(deps.getDescriptors(), input.targetId)
    if (!target) {
      const snapshot = await deps.captureSettledSnapshot(0)
      return buildErrorResult(commandId, 'TARGET_NOT_FOUND', `target not found: ${input.targetId}`, snapshot, input.targetId)
    }
    element = target.element
  } else if (input.selector) {
    element = document.querySelector<HTMLElement>(input.selector)
    if (!element) {
      const snapshot = await deps.captureSettledSnapshot(0)
      return buildErrorResult(commandId, 'TARGET_NOT_FOUND', `element not found for selector: ${input.selector}`, snapshot)
    }
  } else if (input.coords) {
    element = document.elementFromPoint(input.coords.x, input.coords.y) as HTMLElement | null
    if (!element) {
      const snapshot = await deps.captureSettledSnapshot(0)
      return buildErrorResult(commandId, 'TARGET_NOT_FOUND', `no element at coordinates (${input.coords.x}, ${input.coords.y})`, snapshot)
    }
  } else {
    const snapshot = await deps.captureSettledSnapshot(0)
    return buildErrorResult(commandId, 'INVALID_COMMAND', 'Must specify targetId, selector, or coords', snapshot)
  }

  if (!input.actions || input.actions.length === 0) {
    const snapshot = await deps.captureSettledSnapshot(0)
    return buildErrorResult(commandId, 'INVALID_COMMAND', 'actions array must not be empty', snapshot)
  }

  for (const action of input.actions) {
    if (action.type === 'wheel' && (action as WheelAction).steps != null) {
      const expanded = expandWheelSteps(action as WheelAction)
      for (const step of expanded) {
        await deps.eventSequences.wheel({ x: step.x, y: step.y }, step.deltaY, step.ctrlKey)
        if (step.delayMs != null && step.delayMs > 0) {
          await new Promise(r => setTimeout(r, step.delayMs))
        }
      }
      continue
    }
    switch (action.type) {
      case 'pointerdown':
        await deps.eventSequences.mousePressed({ x: action.x, y: action.y })
        break
      case 'pointermove':
        await deps.eventSequences.mouseMoved({ x: action.x, y: action.y })
        break
      case 'pointerup':
        await deps.eventSequences.mouseReleased({ x: action.x, y: action.y })
        break
      case 'wheel':
        await deps.eventSequences.wheel({ x: action.x, y: action.y }, action.deltaY, action.ctrlKey)
        break
    }
    if (action.delayMs != null && action.delayMs > 0) {
      await new Promise(r => setTimeout(r, action.delayMs))
    }
  }

  const nextSnapshot = await deps.captureSettledSnapshot(2)

  return buildSuccessResult(commandId, nextSnapshot, {
    actionKind: 'pointer',
    actionsCount: input.actions.length,
  })
}
